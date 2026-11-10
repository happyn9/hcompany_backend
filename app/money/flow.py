"""Machine d'états d'une opération H-Money et gestion des événements du fournisseur.

created ─► collecting ─► collected ─► [under_review] ─► payout_pending ─► completed
              │               │              │                │
              ▼               ▼              ▼                ▼
         cancelled        refund_pending (remboursement)  refund_pending ─► refunded | rejected
Règles :
 • Toute transition est une comparaison-échange atomique (UPDATE … WHERE status IN (…)) : deux webhooks, un webhook + un poll, ou deux clics concurrents ne
   produisent qu'UN effet (une seule collecte, un seul versement, un seul remboursement).
 • Chaque appel au fournisseur est précédé de l'enregistrement de son identifiant (MoneyProviderOp) ; un index unique empêche une seconde opération active du même type.
 • Un statut INCONNU (coupure, délai, réponse non reconnue) n'entraîne ni remboursement ni nouveau versement : l'opération est marquée « à vérifier » et on interroge le fournisseur.
 • Le montant versé est TOUJOURS receive_minor (figé dans le devis) : jamais recalculé.
 • Les produits ne sont reconnus au grand livre qu'après confirmation du versement."""
import logging
from datetime import datetime
from decimal import Decimal as D

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.money import engine as E
from app.money import ledger, pricing as P
from app.money import services as svc
from app.money.models import MoneyEvent, MoneyProviderOp, MoneyQuote, MoneyTransfer
from app.money.provider import COMPLETED, FAILED, PENDING, UNKNOWN, get_provider

log = logging.getLogger("hmoney")
FINAL = ("completed", "refunded", "rejected", "cancelled", "declined", "expired")
OP_OPEN = ("initiated", "pending", "unknown")


def reserves_enforced() -> bool:
    """Réserves obligatoires avec un vrai fournisseur ; avec le simulateur elles sont suivies mais ne bloquent pas (aucune vraie réserve n'existe)."""
    return not get_provider().simulated


def cas(session: Session, t: MoneyTransfer, froms: tuple, to: str, **fields) -> bool:
    """Transition atomique de statut. Renvoie True si CETTE requête a effectué la transition."""
    won = session.exec(update(MoneyTransfer).where(MoneyTransfer.id == t.id, MoneyTransfer.status.in_(froms))
                       .values(status=to, updated_at=datetime.utcnow(), **fields)).rowcount
    session.commit()
    session.refresh(t)
    if won == 1:
        log.info("transfer %s: -> %s", t.code, to)  # jamais de PIN ni de secret dans les journaux
    return won == 1


def _op_of(session: Session, code: str, kind: str):
    return session.exec(select(MoneyProviderOp).where(MoneyProviderOp.transfer_code == code, MoneyProviderOp.kind == kind)
                        .order_by(MoneyProviderOp.created_at.desc())).first()


def _new_op(session: Session, t: MoneyTransfer, kind: str, amount_minor: int, currency: str, country: str, operator: str):
    """Enregistre l'opération AVANT l'appel. None si une opération active du même type existe déjà (index unique) : on ne double jamais."""
    import uuid
    op = MoneyProviderOp(id=str(uuid.uuid4()), transfer_code=t.code, kind=kind, amount_minor=amount_minor, currency=currency, country=country, operator=operator)
    session.add(op)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        return None
    return op


def estimate_costs(session: Session, t: MoneyTransfer) -> tuple[int, int]:
    """Coûts fournisseur estimés (grille) : collecte du total dans la devise payée, versement dans la devise reçue — en unités mineures."""
    fin, fout = P.get_fee(session, t.from_country, t.pay_operator, "in"), P.get_fee(session, t.to_country, t.counterpart_operator, "out")
    c_in = E.ceil_to(E.d(P.cost_local(fin, float(E.from_minor(t.total_minor))))) if fin else D(0)
    c_out = E.ceil_to(E.d(P.cost_local(fout, float(E.from_minor(t.receive_minor))))) if fout else D(0)
    return E.to_minor(c_in), E.to_minor(c_out)


def _tell(session: Session, user_id, title: str, body: str) -> None:
    """Notification dans l'application ; ne bloque JAMAIS le flux financier (et ne contient ni PIN ni donnée secrète)."""
    try:
        from app.services.notifications import create_in_app_notification
        if user_id:
            create_in_app_notification(session, user_id, title, body)
            session.commit()
    except Exception:  # noqa: BLE001
        log.warning("notification H-Money non envoyée", exc_info=True)


def _review_needed(session: Session, t: MoneyTransfer) -> bool:
    return bool(svc.get_settings(session)["review_all"] or t.flagged)


# ---------------------------------------------------------------- démarrage

def start_collection(session: Session, t: MoneyTransfer) -> MoneyTransfer:
    """created → collecting : bloque la réserve du versement, enregistre l'opération de collecte, demande au fournisseur d'envoyer l'invite de paiement au payeur."""
    if t.status != "created":
        return t
    try:
        ledger.place_hold(session, t, estimate_costs(session, t)[1], reserves_enforced())
        session.commit()
    except HTTPException:
        _abort_before_collect(session, t, "Transferts momentanément en pause (réserve locale insuffisante).")
        raise
    op = _new_op(session, t, "collect", t.total_minor, t.send_currency, t.from_country, t.pay_operator)
    if op is None or not cas(session, t, ("created",), "collecting"):
        return t
    try:
        res = get_provider().collect(op_id=op.id, country=t.from_country, currency=t.send_currency, amount_minor=t.total_minor, phone=t.pay_phone, operator=t.pay_operator, reference=t.code)
    except Exception:  # noqa: BLE001 — réponse inconnue : on vérifie, on ne conclut pas
        log.exception("collect %s: erreur fournisseur", t.code)
        res = type("R", (), {"status": UNKNOWN, "ref": op.id, "reason": ""})()
    return apply_status(session, op.id, res.status, res.ref, res.reason)


def _abort_before_collect(session: Session, t: MoneyTransfer, reason: str) -> None:
    ledger.release_hold(session, t.code)
    back = "awaiting_payer" if t.kind == "request" else "cancelled"
    cas(session, t, ("created",), back, failure_reason=reason, **({"payer_user_id": None} if t.kind == "request" else {}))


def start_payout(session: Session, t: MoneyTransfer) -> MoneyTransfer:
    """(collected | under_review) → payout_pending : UN seul versement, du montant figé dans le devis."""
    if t.status not in ("collected", "under_review"):
        return t
    if t.receive_minor <= 0:
        raise HTTPException(status_code=409, detail="Montant à verser invalide.")
    ledger.place_hold(session, t, estimate_costs(session, t)[1], enforce=False)
    session.commit()
    if not cas(session, t, ("collected", "under_review"), "payout_pending"):
        return t  # un autre processus a déjà lancé le versement
    op = _new_op(session, t, "payout", t.receive_minor, t.receive_currency, t.to_country, t.counterpart_operator)
    if op is None:
        return t
    try:
        res = get_provider().payout(op_id=op.id, country=t.to_country, currency=t.receive_currency, amount_minor=t.receive_minor, phone=t.counterpart_phone, operator=t.counterpart_operator, reference=t.code)
    except Exception:  # noqa: BLE001
        log.exception("payout %s: erreur fournisseur", t.code)
        res = type("R", (), {"status": UNKNOWN, "ref": op.id, "reason": ""})()
    return apply_status(session, op.id, res.status, res.ref, res.reason)


def begin_refund(session: Session, t: MoneyTransfer, reason: str, final: str = "refunded") -> MoneyTransfer:
    """Rembourse le payeur (collecte confirmée, versement échoué CONFIRMÉ ou refusé après contrôle). Jamais déclenché sur un statut inconnu."""
    if not cas(session, t, ("collected", "under_review", "payout_pending"), "refund_pending", failure_reason=reason, final_status=final):
        return t
    coll = session.exec(select(MoneyProviderOp).where(MoneyProviderOp.transfer_code == t.code, MoneyProviderOp.kind == "collect", MoneyProviderOp.status == "completed")).first()
    if coll is None:  # pas de collecte confirmée : rien à rembourser automatiquement
        cas(session, t, ("refund_pending",), "refund_pending", verify_needed=True)
        return t
    op = _new_op(session, t, "refund", t.total_minor, t.send_currency, t.from_country, t.pay_operator)
    if op is None:
        return t
    try:
        res = get_provider().refund(op_id=op.id, deposit_ref=coll.id, amount_minor=t.total_minor, currency=t.send_currency)
    except Exception:  # noqa: BLE001
        log.exception("refund %s: erreur fournisseur", t.code)
        res = type("R", (), {"status": UNKNOWN, "ref": op.id, "reason": ""})()
    return apply_status(session, op.id, res.status, res.ref, res.reason)


# ---------------------------------------------------------------- événements (webhook, poll, simulation)

def apply_status(session: Session, op_id: str, status: str, ref: str = "", reason: str = "") -> MoneyTransfer:
    """Point d'entrée UNIQUE des résultats fournisseur (réponse immédiate, webhook, interrogation) : idempotent."""
    op = session.get(MoneyProviderOp, op_id)
    t = session.exec(select(MoneyTransfer).where(MoneyTransfer.code == op.transfer_code)).one()
    if op.status in ("completed", "failed"):  # déjà tranché : un résultat contradictoire est signalé, jamais appliqué
        if status in (COMPLETED, FAILED) and status != op.status:
            log.error("op %s: résultat contradictoire %s après %s", op.id, status, op.status)
            cas(session, t, tuple(["created", "collecting", "collected", "under_review", "payout_pending", "refund_pending", "completed", "refunded", "rejected", "cancelled", "awaiting_payer"]), t.status, verify_needed=True)
        return t
    won = session.exec(update(MoneyProviderOp).where(MoneyProviderOp.id == op_id, MoneyProviderOp.status.in_(OP_OPEN))
                       .values(status=status if status in (COMPLETED, FAILED, PENDING, UNKNOWN) else UNKNOWN, provider_ref=ref or op.provider_ref, failure_reason=reason or "", updated_at=datetime.utcnow())).rowcount
    session.commit()
    session.refresh(op); session.refresh(t)
    if status in (PENDING, UNKNOWN) or status not in (COMPLETED, FAILED):
        if status == UNKNOWN or status not in (COMPLETED, FAILED, PENDING):
            cas(session, t, ("collecting", "payout_pending", "refund_pending"), t.status, verify_needed=True)  # à vérifier : rien n'est remboursé ni rejoué
        return t
    if won != 1:  # un autre processus vient de le traiter
        return t
    if t.verify_needed:
        cas(session, t, (t.status,), t.status, verify_needed=False)
    if op.kind == "collect":
        return _on_collect(session, t, status, reason)
    if op.kind == "payout":
        return _on_payout(session, t, status, reason)
    return _on_refund(session, t, status, reason)


def _on_collect(session: Session, t: MoneyTransfer, status: str, reason: str) -> MoneyTransfer:
    if status == FAILED:
        ledger.release_hold(session, t.code)
        back = "awaiting_payer" if t.kind == "request" else "cancelled"
        cas(session, t, ("collecting",), back, failure_reason=reason or "Paiement refusé.", **({"payer_user_id": None} if t.kind == "request" else {}))
        return t
    if not cas(session, t, ("collecting",), "collected"):
        return t
    ledger.post_collection(session, t)
    session.commit()
    if t.kind == "request":  # paiement CONFIRMÉ par le fournisseur : le créateur est prévenu (il sera crédité au versement)
        _tell(session, t.user_id, "Paiement confirmé", f"Votre demande {t.code} a été payée. Le versement de {E.from_minor(t.receive_minor)} {t.receive_currency} est en cours.")
    if _review_needed(session, t):
        cas(session, t, ("collected",), "under_review")
        return t
    return start_payout(session, t)


def _market_of(session: Session, t: MoneyTransfer) -> D:
    q = session.get(MoneyQuote, t.quote_id) if t.quote_id else None
    return D(q.market_mid) if q else svc.market_mid(session)


def _on_payout(session: Session, t: MoneyTransfer, status: str, reason: str) -> MoneyTransfer:
    if status == FAILED:  # échec CONFIRMÉ du versement : on rembourse le payeur
        return begin_refund(session, t, (reason or "Versement impossible.") + " Le payeur est remboursé.", "refunded")
    if not cas(session, t, ("payout_pending",), "completed"):
        return t
    c_in, c_out = estimate_costs(session, t)
    ledger.post_payout(session, t, _market_of(session, t), c_in, c_out)
    ledger.release_hold(session, t.code)
    session.commit()
    if t.kind == "request":
        _tell(session, t.user_id, "Argent reçu", f"Vous avez reçu {E.from_minor(t.receive_minor)} {t.receive_currency} (demande {t.code}).")
    _tell(session, t.payer_user_id, "Transfert réussi", f"Le transfert {t.code} est terminé : {t.counterpart_name} a reçu {E.from_minor(t.receive_minor)} {t.receive_currency}.")
    return t


def _on_refund(session: Session, t: MoneyTransfer, status: str, reason: str) -> MoneyTransfer:
    if status == FAILED:  # remboursement refusé : intervention humaine, on ne rejoue pas seul
        cas(session, t, ("refund_pending",), "refund_pending", verify_needed=True, failure_reason=(t.failure_reason + " Remboursement refusé : à traiter manuellement.").strip())
        return t
    final = t.final_status or "refunded"
    if not cas(session, t, ("refund_pending",), final):
        return t
    ledger.post_refund(session, t)
    ledger.release_hold(session, t.code)
    session.commit()
    return t


def decide_review(session: Session, t: MoneyTransfer, approve: bool, reason: str = "") -> MoneyTransfer:
    """Décision d'un agent / de l'admin sur une opération « under_review » : verser (une seule fois) ou refuser et rembourser."""
    if t.status != "under_review":
        raise HTTPException(status_code=409, detail="Cette opération n'est pas en attente de contrôle.")
    if approve:
        return start_payout(session, t)
    return begin_refund(session, t, (reason or "Refusée après contrôle.") + " Le payeur est remboursé.", "rejected")


# ---------------------------------------------------------------- vérification (poll / reconcile) et webhook

def sync_transfer(session: Session, t: MoneyTransfer) -> MoneyTransfer:
    """Interroge le fournisseur pour chaque opération non tranchée et applique le résultat (même chemin que le webhook)."""
    prov = get_provider()
    for op in session.exec(select(MoneyProviderOp).where(MoneyProviderOp.transfer_code == t.code, MoneyProviderOp.status.in_(OP_OPEN))).all():
        res = prov.check(op.kind, op.id, op)
        if res.status in (COMPLETED, FAILED):
            apply_status(session, op.id, res.status, res.ref, res.reason)
        elif res.status == UNKNOWN and op.status != "unknown":
            apply_status(session, op.id, UNKNOWN, op.provider_ref, res.reason)
    session.refresh(t)
    return t


def handle_callback(session: Session, raw: bytes, headers, body: dict) -> dict:
    """Webhook du fournisseur : signature vérifiée, événement dédoublonné, et — surtout — le statut est REVÉRIFIÉ auprès du fournisseur (jamais cru sur parole)."""
    prov = get_provider()
    if not prov.simulated and not __import__("app.config", fromlist=["settings"]).settings.money_webhook_secret:
        raise HTTPException(status_code=503, detail="Webhook non configuré.")
    if not prov.verify_signature(raw, headers):
        raise HTTPException(status_code=401, detail="Signature invalide.")
    parsed = prov.parse_callback(body)
    if not parsed:
        raise HTTPException(status_code=422, detail="Notification non reconnue.")
    kind, op_id, raw_status = parsed
    op = session.get(MoneyProviderOp, op_id)
    if op is None or op.kind != kind:
        return {"ok": True, "ignored": "operation inconnue"}
    if session.exec(select(MoneyEvent.id).where(MoneyEvent.provider == prov.name, MoneyEvent.op_id == op_id, MoneyEvent.status == raw_status)).first():
        return {"ok": True, "duplicate": True}
    res = prov.check(kind, op_id, op)  # autorité : l'API du fournisseur, pas le corps reçu
    out = {"ok": True, "status": res.status}
    if res.status in (COMPLETED, FAILED):
        apply_status(session, op_id, res.status, res.ref, res.reason)
    else:
        apply_status(session, op_id, UNKNOWN if res.status == UNKNOWN else PENDING, op.provider_ref, res.reason)
    session.add(MoneyEvent(provider=prov.name, op_id=op_id, kind=kind, status=raw_status, transfer_code=op.transfer_code, signature_ok=True, detail=f"verifie:{res.status}"))
    try:
        session.commit()
    except IntegrityError:
        session.rollback()  # rejeu concurrent : déjà enregistré
    return out


def stage_of(t: MoneyTransfer) -> str:
    """Étape lisible pour l'écran de suivi."""
    return {"created": "pending_network", "collecting": "pending_network", "collected": "collected", "under_review": "collected", "payout_pending": "payout_in_progress",
            "completed": "success", "refund_pending": "refunding", "refunded": "refunded", "rejected": "refunded", "cancelled": "failed", "awaiting_payer": "awaiting_payer",
            "declined": "failed", "expired": "failed"}.get(t.status, "failed")
