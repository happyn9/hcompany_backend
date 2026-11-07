"""H-Money : supervision (admin, avec confirmation du mot de passe) et espace des agents par pays."""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, func, select

from app.admin_security import require_admin_confirmed
from app.crossborder import services as geo
from app.crossborder.models import Country, FxRate
from app.database import get_session
from app.deps import get_current_user
from app.models import User
from app.money import services as svc
import json

from app.money import pricing as P
from app.money.models import MoneyAgent, MoneyAudit, MoneyOperatorFee, MoneyRate, MoneySettings, MoneyTransfer
from app.money.router import _read, finalize_review

admin_router = APIRouter(prefix="/api/v1/money/admin", tags=["money-admin"])
agent_router = APIRouter(prefix="/api/v1/money/agent", tags=["money-agent"])


def audit(session: Session, actor: User, action: str, target: str = "", detail: str = "") -> None:
    session.add(MoneyAudit(actor_id=actor.id, action=action, target=target, detail=detail[:300]))


def _tx_admin(t: MoneyTransfer) -> dict:
    return {**_read(t, 0), "flagged": t.flagged, "review_note": t.review_note, "role": None, "provider_ref": t.provider_ref if t.kind == "send" else ""}


# --- Admin ------------------------------------------------------------------

@admin_router.get("/overview")
def overview(days: int = Query(default=30, ge=1, le=365), session: Session = Depends(get_session), admin: User = Depends(require_admin_confirmed)):
    since = datetime.utcnow() - timedelta(days=days)
    rows = session.exec(select(MoneyTransfer).where(MoneyTransfer.created_at >= since)).all()
    done = [t for t in rows if t.status == "completed"]
    corridors: dict[str, dict] = {}
    for t in done:
        k = f"{t.from_country}→{t.to_country}"
        c = corridors.setdefault(k, {"count": 0, "volume_usd": 0.0, "fees_usd": 0.0, "cost_usd": 0.0})
        c["count"] += 1
        c["volume_usd"] += svc.usd_of(session, t.send_amount, t.send_currency)
        c["fees_usd"] += svc.usd_of(session, t.fee, t.send_currency)
        c["cost_usd"] += svc.usd_of(session, t.provider_cost, t.send_currency)
    for c in corridors.values():
        c["volume_usd"], c["fees_usd"], c["cost_usd"] = round(c["volume_usd"], 2), round(c["fees_usd"], 2), round(c["cost_usd"], 2)
        c["net_usd"] = round(c["fees_usd"] - c["cost_usd"], 2)
    by_status: dict[str, int] = {}
    for t in rows:
        by_status[t.status] = by_status.get(t.status, 0) + 1
    return {"days": days, "total": len(rows), "completed": len(done), "by_status": by_status, "under_review": sum(1 for t in rows if t.status == "under_review"), "flagged": sum(1 for t in rows if t.flagged),
            "volume_usd": round(sum(c["volume_usd"] for c in corridors.values()), 2), "fees_usd": round(sum(c["fees_usd"] for c in corridors.values()), 2), "cost_usd": round(sum(c["cost_usd"] for c in corridors.values()), 2), "net_usd": round(sum(c["net_usd"] for c in corridors.values()), 2),
            "corridors": corridors, "simulated": all(t.provider == "simulated" for t in rows) if rows else True}


@admin_router.get("/transactions")
def transactions(status: Optional[str] = None, country: Optional[str] = None, flagged: Optional[bool] = None,
                 session: Session = Depends(get_session), admin: User = Depends(require_admin_confirmed)):
    q = select(MoneyTransfer)
    if status:
        q = q.where(MoneyTransfer.status == status)
    if country:
        q = q.where((MoneyTransfer.from_country == country.upper()) | (MoneyTransfer.to_country == country.upper()))
    if flagged is not None:
        q = q.where(MoneyTransfer.flagged == flagged)
    return [_tx_admin(t) for t in session.exec(q.order_by(MoneyTransfer.created_at.desc()).limit(200)).all()]


class AgentIn(BaseModel):
    email: EmailStr
    country: str = Field(min_length=2, max_length=2)
    can_set_rates: bool = False
    can_review: bool = True


@admin_router.get("/agents")
def list_agents(session: Session = Depends(get_session), admin: User = Depends(require_admin_confirmed)):
    out = []
    for a in session.exec(select(MoneyAgent).order_by(MoneyAgent.country, MoneyAgent.created_at)).all():
        u = session.get(User, a.user_id)
        out.append({"id": a.id, "email": u.email if u else "", "name": (u.full_name if u else "") or "", "country": a.country,
                    "can_set_rates": a.can_set_rates, "can_review": a.can_review, "active": a.active})
    return out


@admin_router.post("/agents", status_code=201)
def assign_agent(payload: AgentIn, session: Session = Depends(get_session), admin: User = Depends(require_admin_confirmed)):
    country = payload.country.upper()
    geo.ensure_seed(session)
    if session.get(Country, country) is None:
        raise HTTPException(status_code=422, detail="Pays inconnu : ajoutez-le d'abord dans « Pays & taux ».")
    user = session.exec(select(User).where(User.email == payload.email.lower())).first()
    if not user:
        raise HTTPException(status_code=404, detail="Aucun compte avec cet e-mail : la personne doit d'abord créer un compte.")
    row = session.exec(select(MoneyAgent).where(MoneyAgent.user_id == user.id, MoneyAgent.country == country)).first() or MoneyAgent(user_id=user.id, country=country)
    row.can_set_rates, row.can_review, row.active, row.assigned_by = payload.can_set_rates, payload.can_review, True, admin.id
    session.add(row)
    audit(session, admin, "agent_assigned", f"{user.email}/{country}", f"rates={payload.can_set_rates} review={payload.can_review}")
    session.commit()
    return {"id": row.id, "email": user.email, "country": country}


@admin_router.delete("/agents/{agent_id}", status_code=204)
def remove_agent(agent_id: int, session: Session = Depends(get_session), admin: User = Depends(require_admin_confirmed)):
    row = session.get(MoneyAgent, agent_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Affectation introuvable.")
    row.active = False
    session.add(row)
    audit(session, admin, "agent_removed", f"{row.user_id}/{row.country}")
    session.commit()


@admin_router.get("/audit")
def audit_log(session: Session = Depends(get_session), admin: User = Depends(require_admin_confirmed)):
    return [{"at": a.created_at.isoformat(), "actor": a.actor_id, "action": a.action, "target": a.target, "detail": a.detail}
            for a in session.exec(select(MoneyAudit).order_by(MoneyAudit.created_at.desc()).limit(200)).all()]


# --- Agents -----------------------------------------------------------------

def _agent_rows(session: Session, user: User) -> list[MoneyAgent]:
    rows = session.exec(select(MoneyAgent).where(MoneyAgent.user_id == user.id, MoneyAgent.active == True)).all()  # noqa: E712
    if not rows:
        raise HTTPException(status_code=403, detail="Vous n'êtes agent H-Money d'aucun pays.")
    return rows


@agent_router.get("/me")
def agent_me(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = _agent_rows(session, user)
    out = []
    for a in rows:
        c = session.get(Country, a.country)
        r = session.get(FxRate, c.currency) if c else None
        out.append({"country": a.country, "currency": c.currency if c else "", "can_set_rates": a.can_set_rates, "can_review": a.can_review,
                    "per_usd": r.per_usd if r else None, "margin_pct": r.margin_pct if r else None})
    return out


@agent_router.get("/transactions")
def agent_transactions(country: Optional[str] = None, flagged: Optional[bool] = None, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    mine = {a.country for a in _agent_rows(session, user) if a.can_review}
    if not mine:
        raise HTTPException(status_code=403, detail="Vous n'avez pas le droit de contrôler les transactions.")
    if country and country.upper() not in mine:
        raise HTTPException(status_code=403, detail="Ce pays ne fait pas partie de votre périmètre.")
    scope = {country.upper()} if country else mine
    q = select(MoneyTransfer).where((MoneyTransfer.from_country.in_(scope)) | (MoneyTransfer.to_country.in_(scope)))
    if flagged is not None:
        q = q.where(MoneyTransfer.flagged == flagged)
    rows = session.exec(q.order_by(MoneyTransfer.created_at.desc()).limit(200)).all()
    # l'agent voit l'opération, pas les numéros de paiement complets
    return [{**_tx_admin(t), "counterpart_phone": t.counterpart_phone[:-4] + "••••" if t.counterpart_phone else ""} for t in rows]


class FlagIn(BaseModel):
    flagged: bool = True
    note: str = Field(default="", max_length=300)


@agent_router.post("/transactions/{code}/flag")
def flag(code: str, payload: FlagIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    mine = {a.country for a in _agent_rows(session, user) if a.can_review}
    t = session.exec(select(MoneyTransfer).where(MoneyTransfer.code == code.upper())).first()
    if not t or not ({t.from_country, t.to_country} & mine):
        raise HTTPException(status_code=404, detail="Transaction introuvable dans votre périmètre.")
    if payload.flagged and not payload.note.strip():
        raise HTTPException(status_code=422, detail="Indiquez le motif du signalement.")
    t.flagged, t.review_note = payload.flagged, payload.note.strip()
    session.add(t)
    audit(session, user, "tx_flagged" if payload.flagged else "tx_unflagged", t.code, payload.note)
    session.commit()
    return {"code": t.code, "flagged": t.flagged}


class RateIn(BaseModel):
    country: str = Field(min_length=2, max_length=2)
    per_usd: float = Field(gt=0, le=10_000_000)
    margin_pct: float = Field(default=0, ge=0, le=15)


@agent_router.put("/rate")
def agent_rate(payload: RateIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Un agent fixe le taux de la devise de SON pays, dans des bornes : ±25 % par rapport au taux en vigueur."""
    country = payload.country.upper()
    ag = next((a for a in _agent_rows(session, user) if a.country == country), None)
    if not ag or not ag.can_set_rates:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas fixer le taux de ce pays.")
    cur = session.get(Country, country).currency
    if cur == "USD":
        raise HTTPException(status_code=422, detail="Le dollar est la devise pivot : rien à fixer.")
    row = geo.rate_of(session, cur)
    if abs(payload.per_usd - row.per_usd) / row.per_usd > 0.25:
        raise HTTPException(status_code=422, detail="Variation trop forte (plus de 25 %) : demandez à un administrateur.")
    old = (row.per_usd, row.margin_pct)
    row.per_usd, row.margin_pct, row.source, row.updated_at, row.updated_by = payload.per_usd, payload.margin_pct, "agent", datetime.utcnow(), user.id
    session.add(row)
    audit(session, user, "rate_set", cur, f"{old[0]}/{old[1]}% → {payload.per_usd}/{payload.margin_pct}%")
    session.commit()
    return {"currency": cur, "per_usd": row.per_usd, "margin_pct": row.margin_pct}


# --- Taux d'envoi et de retrait, dans les deux sens -----------------------------

class CorridorRateIn(BaseModel):
    from_country: str = Field(min_length=2, max_length=2)
    to_country: str = Field(min_length=2, max_length=2)
    send_rate: Optional[float] = Field(default=None, gt=0, le=10_000_000)
    withdraw_rate: Optional[float] = Field(default=None, gt=0, le=10_000_000)
    reset: bool = False  # revenir au taux du marché


def _apply_corridor_rate(session: Session, actor: User, p: CorridorRateIn, max_dev: float) -> dict:
    frm, to = p.from_country.upper(), p.to_country.upper()
    svc.check_corridor(frm, to)
    market = svc.market_rate(session, frm, to)
    row = session.get(MoneyRate, (frm, to)) or MoneyRate(from_country=frm, to_country=to)
    old = (row.send_rate, row.withdraw_rate)
    if p.reset:
        row.send_rate = row.withdraw_rate = None
    else:
        for name in ("send_rate", "withdraw_rate"):
            v = getattr(p, name)
            if v is None:
                continue
            if abs(v - market) / market > max_dev:
                raise HTTPException(status_code=422, detail=f"Écart trop grand ({int(max_dev * 100)} % max par rapport au taux du marché : {market:g}).")
            setattr(row, name, v)
    row.updated_by, row.updated_at = actor.id, datetime.utcnow()
    session.add(row)
    audit(session, actor, "corridor_rate", f"{frm}>{to}", f"envoi/retrait {old} → {(row.send_rate, row.withdraw_rate)} (marché {market:g})")
    session.commit()
    return svc.corridor_rates(session)[f"{frm}>{to}"]


@admin_router.get("/corridor-rates")
def admin_corridor_rates(session: Session = Depends(get_session), admin: User = Depends(require_admin_confirmed)):
    geo.ensure_seed(session)
    return svc.corridor_rates(session)


@admin_router.put("/corridor-rates")
def admin_set_corridor_rate(payload: CorridorRateIn, session: Session = Depends(get_session), admin: User = Depends(require_admin_confirmed)):
    return _apply_corridor_rate(session, admin, payload, max_dev=0.5)


class SettingsIn(BaseModel):
    fee_pct: float = Field(ge=0, le=20)
    target_margin_pct: float = Field(default=1.0, ge=0, le=20)
    min_fee_usd: float = Field(ge=0, le=50)
    min_usd: float = Field(ge=0.5, le=1000)
    max_usd: float = Field(ge=1, le=100000)
    daily_max_usd: float = Field(ge=1, le=1000000)


@admin_router.get("/settings")
def admin_get_settings(session: Session = Depends(get_session), admin: User = Depends(require_admin_confirmed)):
    return svc.get_settings(session)


@admin_router.put("/settings")
def admin_set_settings(payload: SettingsIn, session: Session = Depends(get_session), admin: User = Depends(require_admin_confirmed)):
    if payload.min_usd >= payload.max_usd:
        raise HTTPException(status_code=422, detail="Le minimum doit être inférieur au maximum par opération.")
    if payload.max_usd > payload.daily_max_usd:
        raise HTTPException(status_code=422, detail="Le plafond journalier doit couvrir au moins une opération maximale.")
    old = svc.get_settings(session)
    row = session.get(MoneySettings, 1) or MoneySettings(id=1)
    for k, v in payload.model_dump().items():
        setattr(row, k, v)
    row.updated_by, row.updated_at = admin.id, datetime.utcnow()
    session.add(row)
    audit(session, admin, "settings", "frais_plafonds", f"{old} → {payload.model_dump()}")
    session.commit()
    return svc.get_settings(session)


class OperatorFeeIn(BaseModel):
    country: str = Field(min_length=2, max_length=2)
    operator: str
    direction: str = Field(pattern="^(in|out)$")
    enabled: bool = True
    pct: float = Field(ge=0, le=20)
    tiers: list[list[Optional[float]]] = []  # [[borne_exclusive | null, fixe]]
    confirmed: bool = True
    note: str = Field(default="", max_length=200)


@admin_router.get("/operators")
def admin_operators(session: Session = Depends(get_session), admin: User = Depends(require_admin_confirmed)):
    """Grille de coûts de l'agrégateur par opérateur et sens, + simulation de marge sur un envoi type."""
    out = []
    for f in sorted(P.all_fees(session).values(), key=lambda x: (x.country, x.direction, x.operator)):
        if f.operator not in svc.OPERATORS.get(f.country, {}):
            continue  # opérateur retiré de l'offre (ex. M-Pesa, Africell)
        out.append({"country": f.country, "operator": f.operator, "label": svc.OPERATORS[f.country][f.operator], "direction": f.direction, "enabled": f.enabled,
                    "pct": f.pct, "tiers": f.tiers, "confirmed": f.confirmed, "note": f.note, "code": P.PAWAPAY_CODES.get((f.country, f.operator))})
    return out


@admin_router.put("/operators")
def admin_set_operator(payload: OperatorFeeIn, session: Session = Depends(get_session), admin: User = Depends(require_admin_confirmed)):
    c = payload.country.upper()
    if c not in svc.OPERATORS or payload.operator not in svc.OPERATORS[c]:
        raise HTTPException(status_code=422, detail="Opérateur inconnu pour ce pays.")
    for b, f in payload.tiers:
        if f is None or f < 0 or (b is not None and b <= 0):
            raise HTTPException(status_code=422, detail="Tranches invalides.")
    row = session.get(MoneyOperatorFee, (c, payload.operator, payload.direction)) or MoneyOperatorFee(country=c, operator=payload.operator, direction=payload.direction)
    row.enabled, row.pct, row.tiers_json, row.confirmed, row.note = payload.enabled, payload.pct, json.dumps(payload.tiers), payload.confirmed, payload.note
    row.updated_by, row.updated_at = admin.id, datetime.utcnow()
    session.add(row)
    audit(session, admin, "operator_fee", f"{c}:{payload.operator}:{payload.direction}", f"actif={payload.enabled} pct={payload.pct} tranches={payload.tiers}")
    session.commit()
    return {"ok": True}


@agent_router.get("/corridor-rates")
def agent_corridor_rates(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = [a for a in _agent_rows(session, user) if a.can_set_rates]
    if not rows:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas fixer de taux.")
    mine = {a.country for a in rows}
    return {k: v for k, v in svc.corridor_rates(session).items() if set(k.split(">")) & mine}


@agent_router.put("/corridor-rates")
def agent_set_corridor_rate(payload: CorridorRateIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Un agent règle les taux des sens qui touchent son pays, à ±25 % du taux du marché."""
    mine = {a.country for a in _agent_rows(session, user) if a.can_set_rates}
    if not ({payload.from_country.upper(), payload.to_country.upper()} & mine):
        raise HTTPException(status_code=403, detail="Ce sens ne touche pas votre pays.")
    return _apply_corridor_rate(session, user, payload, max_dev=0.25)


# --- Contrôle et confirmation des opérations (« under_review ») ----------------------

class ReviewDecision(BaseModel):
    approve: bool
    reason: str = Field(default="", max_length=300)


def _decide(session: Session, actor: User, code: str, payload: ReviewDecision, scope: Optional[set]) -> dict:
    t = session.exec(select(MoneyTransfer).where(MoneyTransfer.code == code.upper())).first()
    if not t or (scope is not None and not ({t.from_country, t.to_country} & scope)):
        raise HTTPException(status_code=404, detail="Transaction introuvable dans votre périmètre.")
    if not payload.approve and not payload.reason.strip():
        raise HTTPException(status_code=422, detail="Indiquez le motif du refus.")
    finalize_review(session, t, payload.approve, payload.reason.strip())
    t.review_note = payload.reason.strip() or t.review_note
    t.updated_at = datetime.utcnow()
    session.add(t)
    audit(session, actor, "tx_confirmed" if payload.approve else "tx_rejected", t.code, f"{t.status} {payload.reason}")
    session.commit()
    return {**_tx_admin(t)}


@admin_router.post("/transactions/{code}/review")
def admin_review(code: str, payload: ReviewDecision, session: Session = Depends(get_session), admin: User = Depends(require_admin_confirmed)):
    return _decide(session, admin, code, payload, None)


@agent_router.post("/transactions/{code}/review")
def agent_review(code: str, payload: ReviewDecision, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    mine = {a.country for a in _agent_rows(session, user) if a.can_review}
    if not mine:
        raise HTTPException(status_code=403, detail="Vous n'avez pas le droit de contrôler les transactions.")
    return _decide(session, user, code, payload, mine)
