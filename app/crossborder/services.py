"""Conversion de devises et données de départ."""
import math
import re
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.crossborder.models import Country, FxRate

# Valeurs de départ : À VÉRIFIER par l'admin (source « seed » tant qu'elles n'ont pas été saisies).
DEFAULT_COUNTRIES = [
    ("ZM", "Zambie", "Zambia", "ZMW", "260", "Africa/Lusaka", True, 1),
    ("CD", "RD Congo", "DR Congo", "USD", "243", "Africa/Lubumbashi", True, 2),
    ("ZA", "Afrique du Sud", "South Africa", "ZAR", "27", "Africa/Johannesburg", False, 3),
    ("FR", "France", "France", "EUR", "33", "Europe/Paris", False, 4),
    ("BE", "Belgique", "Belgium", "EUR", "32", "Europe/Brussels", False, 5),
    ("GB", "Royaume-Uni", "United Kingdom", "GBP", "44", "Europe/London", False, 6),
    ("US", "États-Unis", "United States", "USD", "1", "America/New_York", False, 7),
]
DEFAULT_RATES = {"USD": 1.0, "ZMW": 25.0, "CDF": 2800.0, "EUR": 0.92, "ZAR": 18.0, "GBP": 0.78}


def ensure_seed(session: Session) -> None:
    if session.exec(select(Country)).first() is None:
        for code, fr, en, cur, dial, tz, svc, order in DEFAULT_COUNTRIES:
            session.add(Country(code=code, name_fr=fr, name_en=en, currency=cur, dial_code=dial, timezone=tz, is_service_country=svc, sort_order=order))
    for cur, rate in DEFAULT_RATES.items():
        if session.get(FxRate, cur) is None:
            session.add(FxRate(currency=cur, per_usd=rate))
    session.commit()


def rate_of(session: Session, currency: str) -> FxRate:
    row = session.get(FxRate, currency.upper())
    if row is None or row.per_usd <= 0:
        ensure_seed(session)
        row = session.get(FxRate, currency.upper())
    if row is None:
        raise HTTPException(status_code=422, detail=f"Devise non prise en charge : {currency}.")
    return row


def convert(session: Session, amount: float, source: str, target: str, *, with_margin: bool = True) -> float:
    """Convertit `amount` de `source` vers `target`. La marge de la devise cible est
    ajoutée (le client paie un peu plus) sauf si `with_margin` est faux."""
    source, target = source.upper(), target.upper()
    if source == target:
        return round(float(amount), 2)
    usd = float(amount) / rate_of(session, source).per_usd
    tgt = rate_of(session, target)
    out = usd * tgt.per_usd * (1 + (tgt.margin_pct / 100 if with_margin else 0))
    return round_nice(out, target)


def round_nice(amount: float, currency: str) -> float:
    """Montants lisibles : CDF à l'unité de 50, autres devises à 2 décimales (entier si grand)."""
    if currency.upper() == "CDF":
        return float(math.ceil(amount / 50) * 50)
    if amount >= 100:
        return float(math.ceil(amount))
    return round(amount, 2)


def country_currency(session: Session, code: Optional[str], default: str = "ZMW") -> str:
    if not code:
        return default
    c = session.get(Country, code.upper())
    return c.currency if c else default


PHONE_RE = re.compile(r"\D+")


def clean_phone(raw: str) -> str:
    digits = PHONE_RE.sub("", raw or "")
    if not 8 <= len(digits) <= 15:
        raise HTTPException(status_code=422, detail="Numéro de téléphone invalide (format international).")
    return digits
