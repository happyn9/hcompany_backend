"""Agents H-Company : employés créés par l'admin, rattachés à un ou plusieurs
départements (modules). Ils contrôlent les dossiers partenaires, suivent les
revenus / statistiques de leurs modules et répondent aux utilisateurs via le chat
d'assistance (le chatbot vérifie qu'un agent du département est en ligne)."""
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlmodel import Field as F, Session, SQLModel, func, select

from app.database import get_session
from app.deps import get_current_admin, get_current_agent, get_current_user
from app.models import (
    LearningSubscription, PartnerApplication, PartnerStatus, User, UserRole,
)
from app.services.notifications import create_in_app_notification

DEPARTMENTS = ("partnerships", "learning", "lodging", "transport", "shopping", "restaurant", "tourism")
ONLINE_WINDOW = timedelta(minutes=2)


class AgentProfile(SQLModel, table=True):
    id: Optional[int] = F(default=None, primary_key=True)
    user_id: int = F(foreign_key="user.id", unique=True, index=True)
    title: str = ""
    departments: str = ""  # csv de DEPARTMENTS
    is_active: bool = True
    last_seen_at: Optional[datetime] = None
    created_at: datetime = F(default_factory=datetime.utcnow)


class AgentInvite(SQLModel, table=True):
    """Invitation : l'agent n'a pas encore de compte ; le rôle est posé à sa première connexion."""
    id: Optional[int] = F(default=None, primary_key=True)
    email: str = F(index=True, unique=True)
    full_name: str = ""
    title: str = ""
    departments: str = ""
    created_at: datetime = F(default_factory=datetime.utcnow)


class SupportThread(SQLModel, table=True):
    id: Optional[int] = F(default=None, primary_key=True)
    code: str = F(index=True, unique=True)
    user_id: int = F(foreign_key="user.id", index=True)
    module: str = F(index=True)
    subject: str = ""
    status: str = F(default="open", index=True)  # open (en attente) | assigned | closed
    agent_user_id: Optional[int] = F(default=None, foreign_key="user.id", index=True)
    created_at: datetime = F(default_factory=datetime.utcnow)
    last_message_at: datetime = F(default_factory=datetime.utcnow)


class SupportMessage(SQLModel, table=True):
    id: Optional[int] = F(default=None, primary_key=True)
    thread_id: int = F(foreign_key="supportthread.id", index=True)
    sender_id: Optional[int] = F(default=None, foreign_key="user.id")
    sender_role: str = "user"  # user | agent | system
    body: str
    created_at: datetime = F(default_factory=datetime.utcnow)


def clean_departments(raw) -> str:
    keys = raw.split(",") if isinstance(raw, str) else (raw or [])
    out = []
    for k in keys:
        k = (k or "").strip()
        if k in DEPARTMENTS and k not in out:
            out.append(k)
    return ",".join(out)


def csv(v: str) -> list[str]:
    return [x for x in (v or "").split(",") if x]


def is_online(p: Optional[AgentProfile]) -> bool:
    return bool(p and p.is_active and p.last_seen_at and datetime.utcnow() - p.last_seen_at < ONLINE_WINDOW)


def apply_invite(session: Session, user: User) -> None:
    """Appelé quand un compte est créé : promeut l'utilisateur si l'admin l'avait invité."""
    inv = session.exec(select(AgentInvite).where(func.lower(AgentInvite.email) == user.email.lower())).first()
    if not inv:
        return
    user.role = UserRole.agent
    if inv.full_name and not user.full_name:
        user.full_name = inv.full_name
    session.add(user)
    session.add(AgentProfile(user_id=user.id, title=inv.title, departments=inv.departments))
    session.delete(inv)
    session.commit()


# --- Statistiques par module -------------------------------------------------------

def _series(rows, days=14):
    today = datetime.utcnow().date()
    buckets = {(today - timedelta(days=i)): 0.0 for i in range(days - 1, -1, -1)}
    for d, amount in rows:
        if d and d.date() in buckets:
            buckets[d.date()] += amount
    return [{"date": k.isoformat(), "value": round(v, 2)} for k, v in buckets.items()]


def module_stats(session: Session, module: str) -> dict:
    """Revenu brut (`gross`) et part H-Company (`commission`), total et 30 derniers jours,
    volume, série quotidienne (14 j) et dernières opérations."""
    cutoff = datetime.utcnow() - timedelta(days=30)
    rows: list[dict] = []  # {at, code, label, amount, commission, status}
    if module == "transport":
        from app.transport.cargo import CargoBooking
        from app.transport.models import TransportBooking
        for b in session.exec(select(TransportBooking).where(TransportBooking.paid_at != None, TransportBooking.status.in_(("confirmed", "boarded", "completed", "disputed")))).all():  # noqa: E711
            rows.append({"at": b.created_at, "code": b.code, "label": f"Bus {b.origin} → {b.destination}", "amount": b.total, "commission": b.commission_amount, "status": b.status})
        for b in session.exec(select(CargoBooking).where(CargoBooking.paid_at != None, CargoBooking.status.in_(("confirmed", "in_transit", "delivered")))).all():  # noqa: E711
            rows.append({"at": b.created_at, "code": b.code, "label": f"Colis {b.origin} → {b.destination}", "amount": b.total, "commission": b.commission_amount, "status": b.status})
    elif module == "lodging":
        from app.lodging.models import Booking
        for b in session.exec(select(Booking).where(Booking.escrow_status.in_(("held", "released")))).all():
            rows.append({"at": b.created_at, "code": b.code, "label": b.title_snapshot or "Séjour", "amount": b.total, "commission": b.commission_amount, "status": b.status})
    elif module == "shopping":
        from app.shopping.models import ShopOrder
        for o in session.exec(select(ShopOrder).where(ShopOrder.paid_at != None, ShopOrder.status != "cancelled")).all():  # noqa: E711
            rows.append({"at": o.paid_at, "code": o.code, "label": f"Commande {o.city or ''}".strip(), "amount": o.total, "commission": o.commission_amount, "status": o.status})
    elif module == "learning":
        for s in session.exec(select(LearningSubscription).where(LearningSubscription.status.in_(("active", "expired")))).all():
            rows.append({"at": s.paid_at or s.created_at, "code": s.reference, "label": s.plan_name + (f" · {s.org_name}" if s.org_name else ""), "amount": s.amount_pivot, "commission": s.amount_pivot, "status": s.status})
    rows.sort(key=lambda r: r["at"] or datetime.min, reverse=True)
    last30 = [r for r in rows if r["at"] and r["at"] >= cutoff]
    out = {
        "module": module, "available": module in ("transport", "lodging", "shopping", "learning", "partnerships"),
        "gross": round(sum(r["amount"] for r in rows), 2), "commission": round(sum(r["commission"] for r in rows), 2), "count": len(rows),
        "gross_30d": round(sum(r["amount"] for r in last30), 2), "commission_30d": round(sum(r["commission"] for r in last30), 2), "count_30d": len(last30),
        "series": _series([(r["at"], r["amount"]) for r in rows]),
        "recent": [{"code": r["code"], "label": r["label"], "amount": round(r["amount"], 2), "status": r["status"], "at": r["at"].isoformat() if r["at"] else None} for r in rows[:10]],
    }
    if module == "partnerships":
        counts = {s.value: int(session.exec(select(func.count(PartnerApplication.id)).where(PartnerApplication.status == s)).one()) for s in PartnerStatus}
        out["applications"] = counts
        out["to_review"] = int(session.exec(select(func.count(PartnerApplication.id)).where(PartnerApplication.status == PartnerStatus.pending, PartnerApplication.agent_review_status == "pending")).one())
    return out


# --- Schémas ----------------------------------------------------------------------

class AgentCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(default="", max_length=120)
    title: str = Field(default="", max_length=80)
    departments: list[str] = []

    @field_validator("departments")
    @classmethod
    def _d(cls, v):
        if not v:
            raise ValueError("Choisissez au moins un département.")
        return v


class AgentUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=80)
    departments: Optional[list[str]] = None
    is_active: Optional[bool] = None


def agent_read(session: Session, user: User, p: AgentProfile) -> dict:
    open_threads = int(session.exec(select(func.count(SupportThread.id)).where(SupportThread.agent_user_id == user.id, SupportThread.status == "assigned")).one())
    return {"user_id": user.id, "email": user.email, "full_name": user.full_name, "title": p.title, "departments": csv(p.departments),
            "is_active": p.is_active, "online": is_online(p), "last_seen_at": p.last_seen_at.isoformat() if p.last_seen_at else None,
            "open_threads": open_threads, "pending": False}


admin = APIRouter(prefix="/api/v1/agents/admin", tags=["agents-admin"])
agent = APIRouter(prefix="/api/v1/agents", tags=["agents"])
support = APIRouter(prefix="/api/v1/support", tags=["support"])


@admin.get("")
def list_agents(session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    out = []
    for p in session.exec(select(AgentProfile).order_by(AgentProfile.created_at)).all():
        u = session.get(User, p.user_id)
        if u:
            out.append(agent_read(session, u, p))
    for inv in session.exec(select(AgentInvite).order_by(AgentInvite.created_at)).all():
        out.append({"user_id": None, "email": inv.email, "full_name": inv.full_name, "title": inv.title, "departments": csv(inv.departments),
                    "is_active": True, "online": False, "last_seen_at": None, "open_threads": 0, "pending": True})
    return out


@admin.get("/departments")
def departments(_a: User = Depends(get_current_admin)):
    return list(DEPARTMENTS)


@admin.post("", status_code=201)
def create_agent(payload: AgentCreate, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    deps = clean_departments(payload.departments)
    if not deps:
        raise HTTPException(status_code=422, detail="Choisissez au moins un département valide.")
    email = payload.email.lower()
    user = session.exec(select(User).where(func.lower(User.email) == email)).first()
    if user:
        if user.role == UserRole.admin:
            raise HTTPException(status_code=422, detail="Ce compte est administrateur.")
        if session.exec(select(AgentProfile).where(AgentProfile.user_id == user.id)).first():
            raise HTTPException(status_code=409, detail="Cet agent existe déjà.")
        user.role = UserRole.agent
        if payload.full_name and not user.full_name:
            user.full_name = payload.full_name
        session.add(user)
        session.add(AgentProfile(user_id=user.id, title=payload.title.strip(), departments=deps))
        session.commit()
        create_in_app_notification(session, user.id, "Vous êtes agent H-Company", f"Départements : {deps.replace(',', ', ')}. Ouvrez votre espace agent.")
        session.commit()
        return {"status": "created", "email": user.email}
    if session.exec(select(AgentInvite).where(func.lower(AgentInvite.email) == email)).first():
        raise HTTPException(status_code=409, detail="Une invitation existe déjà pour cet e-mail.")
    session.add(AgentInvite(email=email, full_name=payload.full_name.strip(), title=payload.title.strip(), departments=deps))
    session.commit()
    return {"status": "invited", "email": email}


@admin.put("/{user_id}")
def update_agent(user_id: int, payload: AgentUpdate, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    p = session.exec(select(AgentProfile).where(AgentProfile.user_id == user_id)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Agent introuvable.")
    if payload.title is not None:
        p.title = payload.title.strip()
    if payload.departments is not None:
        deps = clean_departments(payload.departments)
        if not deps:
            raise HTTPException(status_code=422, detail="Choisissez au moins un département valide.")
        p.departments = deps
    if payload.is_active is not None:
        p.is_active = payload.is_active
    session.add(p)
    session.commit()
    return agent_read(session, session.get(User, user_id), p)


@admin.delete("/{user_id}", status_code=204)
def remove_agent(user_id: int, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    p = session.exec(select(AgentProfile).where(AgentProfile.user_id == user_id)).first()
    inv = None
    if not p:
        inv = session.get(AgentInvite, user_id)  # invitation : l'identifiant est celui de l'invitation
    if not p and not inv:
        raise HTTPException(status_code=404, detail="Agent introuvable.")
    if p:
        u = session.get(User, user_id)
        if u and u.role == UserRole.agent:
            u.role = UserRole.client
            session.add(u)
        for t in session.exec(select(SupportThread).where(SupportThread.agent_user_id == user_id, SupportThread.status == "assigned")).all():
            t.status, t.agent_user_id = "open", None
            session.add(t)
        session.delete(p)
    else:
        session.delete(inv)
    session.commit()


@admin.delete("/invite/{email}", status_code=204)
def cancel_invite(email: str, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    inv = session.exec(select(AgentInvite).where(func.lower(AgentInvite.email) == email.lower())).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation introuvable.")
    session.delete(inv)
    session.commit()


@admin.get("/{user_id}/stats")
def agent_stats(user_id: int, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    p = session.exec(select(AgentProfile).where(AgentProfile.user_id == user_id)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Agent introuvable.")
    return {m: module_stats(session, m) for m in csv(p.departments)}


# --- Espace agent ------------------------------------------------------------------

def _profile(session: Session, user: User) -> AgentProfile:
    p = session.exec(select(AgentProfile).where(AgentProfile.user_id == user.id)).first()
    if not p:
        if user.role == UserRole.admin:  # un admin peut faire le travail d'un agent, sur tous les départements
            return AgentProfile(user_id=user.id, title="Administrateur", departments=",".join(DEPARTMENTS), last_seen_at=datetime.utcnow())
        # Agent promu avant la mise en place des départements : profil vide
        p = AgentProfile(user_id=user.id, departments="partnerships")
        session.add(p)
        session.commit()
        session.refresh(p)
    return p


@agent.get("/me")
def me(session: Session = Depends(get_session), user: User = Depends(get_current_agent)):
    p = _profile(session, user)
    return agent_read(session, user, p)


@agent.post("/heartbeat")
def heartbeat(session: Session = Depends(get_session), user: User = Depends(get_current_agent)):
    p = _profile(session, user)
    if p.id:
        p.last_seen_at = datetime.utcnow()
        session.add(p)
        session.commit()
    return {"ok": True}


@agent.get("/me/stats")
def my_stats(session: Session = Depends(get_session), user: User = Depends(get_current_agent)):
    return {m: module_stats(session, m) for m in csv(_profile(session, user).departments)}


def _thread_read(session: Session, t: SupportThread, viewer: str) -> dict:
    u = session.get(User, t.user_id)
    ag = session.get(User, t.agent_user_id) if t.agent_user_id else None
    last = session.exec(select(SupportMessage).where(SupportMessage.thread_id == t.id).order_by(SupportMessage.id.desc())).first()
    return {"code": t.code, "module": t.module, "subject": t.subject, "status": t.status, "created_at": t.created_at.isoformat(), "last_message_at": t.last_message_at.isoformat(),
            "user_name": (u.full_name or u.email) if u and viewer == "agent" else None, "user_email": u.email if u and viewer == "agent" else None,
            "agent_name": (ag.full_name or "Agent H-Company") if ag else None, "last": last.body[:120] if last else ""}


@agent.get("/threads")
def inbox(status: str = "active", session: Session = Depends(get_session), user: User = Depends(get_current_agent)):
    deps = csv(_profile(session, user).departments)
    stmt = select(SupportThread).where(SupportThread.module.in_(deps))
    if status == "closed":
        stmt = stmt.where(SupportThread.status == "closed")
    else:
        stmt = stmt.where(SupportThread.status != "closed", (SupportThread.agent_user_id == user.id) | (SupportThread.agent_user_id == None))  # noqa: E711
    return [_thread_read(session, t, "agent") for t in session.exec(stmt.order_by(SupportThread.last_message_at.desc()).limit(100)).all()]


def _agent_thread(session: Session, code: str, user: User) -> SupportThread:
    t = session.exec(select(SupportThread).where(SupportThread.code == code)).first()
    if not t or t.module not in csv(_profile(session, user).departments):
        raise HTTPException(status_code=404, detail="Conversation introuvable.")
    if t.agent_user_id not in (None, user.id) and user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Cette conversation est suivie par un autre agent.")
    return t


def _messages(session: Session, t: SupportThread, after: int = 0) -> list[dict]:
    rows = session.exec(select(SupportMessage).where(SupportMessage.thread_id == t.id, SupportMessage.id > after).order_by(SupportMessage.id)).all()
    return [{"id": m.id, "role": m.sender_role, "body": m.body, "at": m.created_at.isoformat()} for m in rows]


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


@agent.get("/threads/{code}")
def agent_thread(code: str, after: int = 0, session: Session = Depends(get_session), user: User = Depends(get_current_agent)):
    t = _agent_thread(session, code, user)
    return {**_thread_read(session, t, "agent"), "messages": _messages(session, t, after)}


@agent.post("/threads/{code}/claim")
def claim(code: str, session: Session = Depends(get_session), user: User = Depends(get_current_agent)):
    t = _agent_thread(session, code, user)
    if t.status == "closed":
        raise HTTPException(status_code=409, detail="Conversation terminée.")
    t.agent_user_id, t.status = user.id, "assigned"
    session.add(t)
    session.add(SupportMessage(thread_id=t.id, sender_role="system", body=f"{user.full_name or 'Un agent'} a rejoint la conversation."))
    create_in_app_notification(session, t.user_id, "Un agent vous répond", f"{user.full_name or 'Un agent H-Company'} a pris votre demande ({t.subject or t.module}).")
    session.commit()
    return _thread_read(session, t, "agent")


@agent.post("/threads/{code}/messages")
def agent_reply(code: str, payload: MessageIn, session: Session = Depends(get_session), user: User = Depends(get_current_agent)):
    t = _agent_thread(session, code, user)
    if t.status == "closed":
        raise HTTPException(status_code=409, detail="Conversation terminée.")
    if t.agent_user_id is None:
        t.agent_user_id, t.status = user.id, "assigned"
    t.last_message_at = datetime.utcnow()
    session.add(t)
    session.add(SupportMessage(thread_id=t.id, sender_id=user.id, sender_role="agent", body=payload.body.strip()))
    session.commit()
    return {"messages": _messages(session, t)}


@agent.post("/threads/{code}/close")
def agent_close(code: str, session: Session = Depends(get_session), user: User = Depends(get_current_agent)):
    t = _agent_thread(session, code, user)
    t.status = "closed"
    session.add(t)
    session.add(SupportMessage(thread_id=t.id, sender_role="system", body="Conversation terminée par l'agent."))
    session.commit()
    return _thread_read(session, t, "agent")


# --- Côté utilisateur : disponibilité + chat ------------------------------------------

def online_agents(session: Session, module: str) -> list[tuple[User, AgentProfile]]:
    out = []
    for p in session.exec(select(AgentProfile).where(AgentProfile.is_active == True)).all():  # noqa: E712
        if module in csv(p.departments) and is_online(p):
            u = session.get(User, p.user_id)
            if u:
                out.append((u, p))
    return out


@support.get("/availability")
def availability(module: str = "partnerships", session: Session = Depends(get_session)):
    if module not in DEPARTMENTS:
        raise HTTPException(status_code=404, detail="Département inconnu.")
    return {"module": module, "online": len(online_agents(session, module)), "available": bool(online_agents(session, module))}


class ThreadIn(BaseModel):
    module: str
    subject: str = Field(default="", max_length=120)
    message: str = Field(min_length=2, max_length=2000)

    @field_validator("module")
    @classmethod
    def _m(cls, v):
        if v not in DEPARTMENTS:
            raise ValueError("Département inconnu.")
        return v


@support.post("/threads", status_code=201)
def open_thread(payload: ThreadIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    avail = online_agents(session, payload.module)
    if not avail:
        raise HTTPException(status_code=409, detail="Aucun agent n'est en ligne pour ce service pour le moment. Réessayez plus tard ou laissez-nous un message via le formulaire de contact.")
    mine = session.exec(select(SupportThread).where(SupportThread.user_id == user.id, SupportThread.module == payload.module, SupportThread.status != "closed")).first()
    if mine:
        raise HTTPException(status_code=409, detail="Vous avez déjà une conversation ouverte pour ce service.")
    # l'agent en ligne qui suit le moins de conversations
    def load(pair):
        return int(session.exec(select(func.count(SupportThread.id)).where(SupportThread.agent_user_id == pair[0].id, SupportThread.status == "assigned")).one())
    agent_user, _p = min(avail, key=load)
    t = SupportThread(code="SP-" + secrets.token_hex(3).upper(), user_id=user.id, module=payload.module, subject=payload.subject.strip(), agent_user_id=agent_user.id, status="assigned")
    session.add(t)
    session.commit()
    session.refresh(t)
    session.add(SupportMessage(thread_id=t.id, sender_id=user.id, sender_role="user", body=payload.message.strip()))
    create_in_app_notification(session, agent_user.id, "Nouvelle conversation", f"{user.full_name or user.email} · {t.subject or t.module}")
    session.commit()
    return {**_thread_read(session, t, "user"), "messages": _messages(session, t)}


@support.get("/threads")
def my_threads(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    return [_thread_read(session, t, "user") for t in session.exec(select(SupportThread).where(SupportThread.user_id == user.id).order_by(SupportThread.last_message_at.desc()).limit(50)).all()]


def _mine(session: Session, code: str, user: User) -> SupportThread:
    t = session.exec(select(SupportThread).where(SupportThread.code == code, SupportThread.user_id == user.id)).first()
    if not t:
        raise HTTPException(status_code=404, detail="Conversation introuvable.")
    return t


@support.get("/threads/{code}")
def my_thread(code: str, after: int = 0, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    t = _mine(session, code, user)
    return {**_thread_read(session, t, "user"), "messages": _messages(session, t, after)}


@support.post("/threads/{code}/messages")
def user_message(code: str, payload: MessageIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    t = _mine(session, code, user)
    if t.status == "closed":
        raise HTTPException(status_code=409, detail="Cette conversation est terminée.")
    t.last_message_at = datetime.utcnow()
    session.add(t)
    session.add(SupportMessage(thread_id=t.id, sender_id=user.id, sender_role="user", body=payload.body.strip()))
    session.commit()
    return {"messages": _messages(session, t)}


@support.post("/threads/{code}/close")
def user_close(code: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    t = _mine(session, code, user)
    t.status = "closed"
    session.add(t)
    session.add(SupportMessage(thread_id=t.id, sender_role="system", body="Conversation terminée par l'utilisateur."))
    session.commit()
    return _thread_read(session, t, "user")
