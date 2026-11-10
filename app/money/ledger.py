"""Grand livre à partie double + réserves locales (entiers en unités mineures, une devise par ligne).

NEUTRE sur la propriété des fonds : PRV_x = solde chez le fournisseur dans la devise x (sa nature juridique — compte marchand, séquestre, autre — reste à
qualifier avec le fournisseur) ; DUE_x = fonds encaissés et dus pour une opération en cours ; REV_* = produits reconnus UNIQUEMENT quand le versement est
CONFIRMÉ ; CONV_x = pont de change ; CHARGE_* = coûts fournisseur (estimés, puis régularisés au rapprochement) ; CAPITAL_RES_x = apports de réserve.

Journaux d'une opération (chaque journal est équilibré par devise ; journal_key unique ⇒ un rejeu ne double rien) :
  J1  collecte confirmée   (devise payée) : Dr PRV T / Cr DUE T
  J2  versement confirmé   (devise payée) : Dr DUE T / Cr REV_FRAIS F, Cr REV_FX (S − R·M), Cr CONV (R·M)
                           (devise reçue) : Dr CONV R / Cr PRV R
  J3a coût de collecte estimé : Dr CHARGE_COLLECTE / Cr PRV ;  J3b coût de versement estimé : idem (devise reçue)
  JR  remboursement confirmé (devise payée) : Dr DUE T / Cr PRV T
Un statut inconnu ne produit AUCUNE écriture."""
from datetime import datetime
from decimal import Decimal as D

from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from app.money import engine as E
from app.money.models import LedgerEntry, MoneyReserve, MoneyTransfer, ReserveHold

SAFETY_PCT = D("0.05")  # marge de sécurité de la réserve bloquée : 5 % du versement


class LedgerError(Exception):
    pass


def _post(session: Session, journal_key: str, kind: str, code: str, lines: list[tuple[str, str, int, int, str]]) -> bool:
    """Écrit un journal (account, currency, debit, credit, memo). Refuse un journal déséquilibré. Renvoie False si ce journal existe déjà (rejeu)."""
    if session.exec(select(LedgerEntry.id).where(LedgerEntry.journal_key == journal_key)).first() is not None:
        return False
    bal: dict[str, int] = {}
    for _, cur, dr, cr, _m in lines:
        bal[cur] = bal.get(cur, 0) + dr - cr
    if any(v != 0 for v in bal.values()):
        raise LedgerError(f"Journal déséquilibré {journal_key}: {bal}")
    for account, cur, dr, cr, memo in lines:
        if dr or cr:
            session.add(LedgerEntry(journal_key=journal_key, kind=kind, transfer_code=code, account=account, currency=cur, debit_minor=dr, credit_minor=cr, memo=memo))
    return True


def post_collection(session: Session, t: MoneyTransfer) -> bool:
    c = t.send_currency
    return _post(session, f"{t.code}:J1", "J1", t.code, [(f"PRV_{c}", c, t.total_minor, 0, "collecte confirmée"), (f"DUE_{c}", c, 0, t.total_minor, "dû pour l'opération")])


def _market(t: MoneyTransfer, M: D) -> int:
    """Contre-valeur du versement dans la devise payée, au taux du marché du devis : R·M (ZMW) ou R/M (USD), arrondie au centime le plus proche."""
    R = E.from_minor(t.receive_minor)
    v = R * M if t.send_currency == "ZMW" else R / M
    return E.to_minor(v.quantize(E.CENT))


def post_payout(session: Session, t: MoneyTransfer, M: D, cost_in_minor: int = 0, cost_out_minor: int = 0) -> bool:
    """Reconnaît les produits : seulement quand le versement est CONFIRMÉ."""
    pc, rc = t.send_currency, t.receive_currency
    if pc == rc:  # opération dans le pays du payeur (facture locale) : pas de change
        if t.send_minor != t.receive_minor:
            raise LedgerError("Opération sans change : S doit égaler R.")
        lines = [(f"DUE_{pc}", pc, t.total_minor, 0, "solde de l'opération"), (f"REV_FRAIS_{pc}", pc, 0, t.fee_minor, "frais"), (f"PRV_{pc}", pc, 0, t.receive_minor, "versement")]
    else:
        conv = _market(t, M)
        fx = t.send_minor - conv  # marge de change = S − R·M
        lines = [(f"DUE_{pc}", pc, t.total_minor, 0, "solde de l'opération"), (f"REV_FRAIS_{pc}", pc, 0, t.fee_minor, "frais"),
                 (f"REV_FX_{pc}", pc, -fx if fx < 0 else 0, fx if fx > 0 else 0, "marge de change"), (f"CONV_{pc}", pc, 0, conv, "pont de change"),
                 (f"CONV_{rc}", rc, t.receive_minor, 0, "pont de change"), (f"PRV_{rc}", rc, 0, t.receive_minor, "versement")]
    ok = _post(session, f"{t.code}:J2", "J2", t.code, lines)
    if ok and cost_in_minor:
        _post(session, f"{t.code}:J3a", "J3a", t.code, [(f"CHARGE_COLLECTE_{pc}", pc, cost_in_minor, 0, "estimé"), (f"PRV_{pc}", pc, 0, cost_in_minor, "estimé")])
    if ok and cost_out_minor:
        _post(session, f"{t.code}:J3b", "J3b", t.code, [(f"CHARGE_VERS_{rc}", rc, cost_out_minor, 0, "estimé"), (f"PRV_{rc}", rc, 0, cost_out_minor, "estimé")])
    return ok


def post_refund(session: Session, t: MoneyTransfer) -> bool:
    c = t.send_currency
    return _post(session, f"{t.code}:JR", "JR", t.code, [(f"DUE_{c}", c, t.total_minor, 0, "remboursé au payeur"), (f"PRV_{c}", c, 0, t.total_minor, "remboursement")])


def post_reserve(session: Session, currency: str, amount_minor: int, actor_id: int, memo: str = "") -> str:
    """Apport (+) ou retrait (−) de réserve : Dr PRV / Cr CAPITAL_RES. N'est jamais déduit des fonds dus."""
    if amount_minor == 0:
        raise HTTPException(status_code=422, detail="Montant nul.")
    key = f"RES:{currency}:{datetime.utcnow().timestamp()}:{actor_id}"
    a = abs(amount_minor)
    lines = [(f"PRV_{currency}", currency, a, 0, memo or "apport de réserve"), (f"CAPITAL_RES_{currency}", currency, 0, a, memo or "apport de réserve")] if amount_minor > 0 else \
            [(f"CAPITAL_RES_{currency}", currency, a, 0, memo or "retrait de réserve"), (f"PRV_{currency}", currency, 0, a, memo or "retrait de réserve")]
    _post(session, key, "RESERVE", "", lines)
    return key


def balance(session: Session, account: str) -> int:
    """Solde en convention « débit − crédit ». Pour PRV (actif) : positif = avoir ; pour DUE / REV / CAPITAL_RES (passifs) : négatif = dû."""
    dr, cr = session.exec(select(func.coalesce(func.sum(LedgerEntry.debit_minor), 0), func.coalesce(func.sum(LedgerEntry.credit_minor), 0)).where(LedgerEntry.account == account)).one()
    return int(dr) - int(cr)


def active_holds(session: Session, currency: str) -> int:
    return int(session.exec(select(func.coalesce(func.sum(ReserveHold.hold_minor), 0)).where(ReserveHold.currency == currency, ReserveHold.status == "active")).one())


def available(session: Session, currency: str) -> int:
    """Disponible pour de NOUVEAUX versements = solde chez le fournisseur − fonds dus pour des opérations en cours − réserve déjà bloquée."""
    return balance(session, f"PRV_{currency}") + balance(session, f"DUE_{currency}") - active_holds(session, currency)  # DUE est un solde créditeur (négatif)


def floor_of(session: Session, currency: str) -> int:
    r = session.get(MoneyReserve, currency)
    return r.floor_minor if r else 0


def hold_needed(receive_minor: int, cost_out_minor: int) -> int:
    """Versement + coût estimé + marge de sécurité de 5 % (arrondie vers le haut)."""
    return receive_minor + cost_out_minor + int((D(receive_minor) * SAFETY_PCT).to_integral_value(rounding="ROUND_CEILING"))


def place_hold(session: Session, t: MoneyTransfer, cost_out_minor: int, enforce: bool) -> int:
    """Bloque la réserve de la devise à verser AVANT d'encaisser. Si `enforce` et que le disponible (après blocage) passe sous le seuil : refus (503, pause)."""
    cur, need = t.receive_currency, hold_needed(t.receive_minor, cost_out_minor)
    existing = session.exec(select(ReserveHold).where(ReserveHold.transfer_code == t.code)).first()
    if existing:
        return existing.hold_minor
    if enforce and available(session, cur) - need < floor_of(session, cur):
        raise HTTPException(status_code=503, detail="Les transferts vers cette devise sont momentanément en pause (réserve locale insuffisante). Réessayez plus tard.")
    session.add(ReserveHold(transfer_code=t.code, currency=cur, hold_minor=need))
    return need


def release_hold(session: Session, code: str) -> None:
    h = session.exec(select(ReserveHold).where(ReserveHold.transfer_code == code, ReserveHold.status == "active")).first()
    if h:
        h.status, h.released_at = "released", datetime.utcnow()
        session.add(h)


def trial_balance(session: Session) -> dict:
    """Contrôle d'ensemble : par devise Σ débits = Σ crédits, plus soldes de chaque compte."""
    rows = session.exec(select(LedgerEntry.account, LedgerEntry.currency, func.sum(LedgerEntry.debit_minor), func.sum(LedgerEntry.credit_minor)).group_by(LedgerEntry.account, LedgerEntry.currency)).all()
    accounts = {a: {"currency": c, "debit": int(dr), "credit": int(cr), "balance": int(dr) - int(cr)} for a, c, dr, cr in rows}
    totals: dict = {}
    for a in accounts.values():
        t = totals.setdefault(a["currency"], [0, 0]); t[0] += a["debit"]; t[1] += a["credit"]
    return {"accounts": accounts, "balanced": all(d == c for d, c in totals.values()), "totals": {k: {"debit": v[0], "credit": v[1]} for k, v in totals.items()}}
