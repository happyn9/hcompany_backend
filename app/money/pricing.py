"""Tarifs de l'agrégateur (pawaPay) par pays / opérateur / sens, et calcul du coût réel d'une opération.

Sens : « in » = encaissement chez le payeur (collection), « out » = versement au bénéficiaire (disbursement).
Coût d'un passage = pct % du montant + un fixe selon la tranche (en devise locale). Les valeurs ci-dessous viennent des grilles
pawaPay communiquées (frais à la charge de H-Company = frais de l'opérateur + 1 % pawaPay) ; l'admin peut les corriger
(table MoneyOperatorFee) — tout ce qui n'est pas marqué « confirmed » est une hypothèse à vérifier dans le contrat."""
import json
import math
from dataclasses import dataclass, field
from typing import Optional

from sqlmodel import Session, select

from app.money.models import MoneyOperatorFee

ZM_IN_TIERS = [[150.01, 0.5], [500.01, 1.0], [1000.01, 1.5], [3000.01, 2.8], [5000.01, 4.0], [None, 5.5]]  # ZMW : « < borne » → fixe


@dataclass
class Fee:
    country: str
    operator: str
    direction: str
    enabled: bool = True
    pct: float = 0.0
    tiers: list = field(default_factory=list)
    confirmed: bool = False
    note: str = ""


def _d(country, op, direction, enabled, pct, tiers=None, confirmed=True, note=""):
    return Fee(country, op, direction, enabled, pct, tiers or [], confirmed, note)


DEFAULTS = [
    # Zambie — encaissement : 0,5 à 5,5 ZMW selon la tranche + 1 % (opérateur + pawaPay)
    _d("ZM", "mtn", "in", True, 1.0, ZM_IN_TIERS), _d("ZM", "airtel", "in", True, 1.0, ZM_IN_TIERS), _d("ZM", "zamtel", "in", True, 1.0, ZM_IN_TIERS),
    # Zambie — versement : seulement Airtel (tarif pawaPay) ; la grille de versement zambienne n'a pas été fournie : 1 % pawaPay supposé
    _d("ZM", "airtel", "out", True, 1.0, confirmed=False, note="Grille de versement Zambie à confirmer"),
    _d("ZM", "mtn", "out", True, 1.0, confirmed=False, note="Grille de versement Zambie à confirmer"), _d("ZM", "zamtel", "out", True, 1.0, confirmed=False, note="Grille de versement Zambie à confirmer"),
    # RD Congo — Airtel et Orange au MÊME tarif (le plus élevé des deux : on ne favorise aucun opérateur et on ne perd rien)
    _d("CD", "orange", "in", True, 3.2), _d("CD", "airtel", "in", True, 3.2),
    # RD Congo — versement : Orange 1 % (pawaPay seul), Airtel 2,16 % (1,16 % + 1 %)
    _d("CD", "orange", "out", True, 2.16), _d("CD", "airtel", "out", True, 2.16),
]
_BY = {(f.country, f.operator, f.direction): f for f in DEFAULTS}

# Codes « correspondant » pawaPay (pays + opérateur)
PAWAPAY_CODES = {
    ("ZM", "mtn"): "MTN_MOMO_ZMB", ("ZM", "airtel"): "AIRTEL_OAPI_ZMB", ("ZM", "zamtel"): "ZAMTEL_ZMB",
    ("CD", "airtel"): "AIRTEL_COD", ("CD", "orange"): "ORANGE_COD", ("CD", "mpesa"): "VODACOM_MPESA_COD", ("CD", "africell"): "AFRICELL_COD",
}


def all_fees(session: Session) -> dict:
    """Grille en vigueur : valeurs par défaut, remplacées par les lignes corrigées dans l'admin."""
    out = {k: Fee(**vars(v)) for k, v in _BY.items()}
    for r in session.exec(select(MoneyOperatorFee)).all():
        out[(r.country, r.operator, r.direction)] = Fee(r.country, r.operator, r.direction, r.enabled, r.pct, json.loads(r.tiers_json or "[]"), r.confirmed, r.note)
    return out


def get_fee(session: Session, country: str, operator: str, direction: str) -> Optional[Fee]:
    return all_fees(session).get((country.upper(), operator, direction))


def cost_local(fee: Fee, amount: float) -> float:
    """Coût de ce passage, en devise locale du pays."""
    fixed = 0.0
    for bound, f in fee.tiers:
        if bound is None or amount < bound:
            fixed = f
            break
    return amount * fee.pct / 100 + fixed


def enabled_ops(session: Session, country: str, direction: str) -> list[Fee]:
    fees = [f for f in all_fees(session).values() if f.country == country.upper() and f.direction == direction and f.enabled]
    return sorted(fees, key=lambda f: (f.pct, f.operator))


def default_operator(session: Session, country: str, direction: str) -> str:
    ops = enabled_ops(session, country, direction)
    return ops[0].operator if ops else ""


def round_up(x: float, currency: str) -> float:
    step = 50.0 if currency == "CDF" else 0.01
    return round(math.ceil(round(x / step, 6)) * step, 2)
