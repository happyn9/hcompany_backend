from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_admin
from app.knowledge import search as S
from app.knowledge.models import KnowledgeEntry
from app.models import User
from app.services.rate_limit import limiter

router = APIRouter(prefix="/api/v1/assistant", tags=["assistant"])
admin = APIRouter(prefix="/api/v1/assistant/admin", tags=["assistant-admin"])

THRESHOLD = 0.6  # en dessous : l'assistante ne répond pas, elle propose un agent


class AskIn(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    lang: Literal["fr", "en"] = "fr"


@router.post("/ask")
@limiter.limit("40/minute")
def ask(request: Request, payload: AskIn, session: Session = Depends(get_session)):
    hits = S.get_index(session).search(payload.question, payload.lang, k=3)
    if not hits or hits[0][2] < THRESHOLD:
        return {"answer": None, "confidence": round(hits[0][2], 2) if hits else 0.0, "escalate": True, "entry_id": None, "link": None, "related": []}
    doc, _, conf = hits[0]
    if doc.entry_id:
        e = session.get(KnowledgeEntry, doc.entry_id)
        if e:
            e.uses += 1
            session.add(e)
            session.commit()
    return {"answer": S.compose(doc, payload.lang), "confidence": round(conf, 2), "escalate": False, "entry_id": doc.entry_id, "source": doc.kind,
            "link": doc.link or None, "related": [{"title": d.question, "link": d.link} for d, _, c in hits[1:] if d.link and c >= THRESHOLD]}


class FeedbackIn(BaseModel):
    entry_id: int
    helpful: bool


@router.post("/feedback")
@limiter.limit("30/minute")
def feedback(request: Request, payload: FeedbackIn, session: Session = Depends(get_session)):
    e = session.get(KnowledgeEntry, payload.entry_id)
    if not e:
        raise HTTPException(status_code=404, detail="Entrée introuvable.")
    if payload.helpful:
        e.helpful += 1
    else:
        e.unhelpful += 1
        if e.unhelpful >= 3 and e.unhelpful > 2 * e.helpful and e.source == "agent":
            e.active = False  # une réponse apprise qui déçoit trop est mise en pause (l'admin peut la réactiver)
    session.add(e)
    session.commit()
    S.invalidate()
    return {"ok": True, "active": e.active}


def learn_from_agent(session: Session, thread_code: str, question: str, answer: str) -> Optional[int]:
    """Appelé quand un agent répond : on garde la paire (anonymisée) si elle est réutilisable. Une paire par conversation et par question."""
    q, a = S.sanitize(question), S.sanitize(answer)
    if not q or not a or not S.looks_reusable(q, a):
        return None
    if session.exec(select(KnowledgeEntry).where(KnowledgeEntry.thread_code == thread_code, KnowledgeEntry.question == q)).first():
        return None
    e = KnowledgeEntry(question=q[:500], answer=a[:1500], lang=S.detect_lang(q), source="agent", thread_code=thread_code)
    session.add(e)
    S.invalidate()
    return e.id


# --- Admin ----------------------------------------------------------------------------------
class EntryIn(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    answer: str = Field(min_length=2, max_length=1500)
    lang: Literal["fr", "en"] = "fr"
    active: bool = True


def _read(e: KnowledgeEntry) -> dict:
    return e.model_dump(mode="json")


@admin.get("/entries")
def list_entries(source: str = "", active: Optional[bool] = None, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    stmt = select(KnowledgeEntry).order_by(KnowledgeEntry.created_at.desc()).limit(500)
    if source:
        stmt = stmt.where(KnowledgeEntry.source == source)
    if active is not None:
        stmt = stmt.where(KnowledgeEntry.active == active)
    return [_read(e) for e in session.exec(stmt).all()]


@admin.post("/entries", status_code=201)
def create_entry(payload: EntryIn, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    e = KnowledgeEntry(**payload.model_dump(), source="admin")
    session.add(e)
    session.commit()
    session.refresh(e)
    S.invalidate()
    return _read(e)


@admin.patch("/entries/{entry_id}")
def update_entry(entry_id: int, payload: EntryIn, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    e = session.get(KnowledgeEntry, entry_id)
    if not e:
        raise HTTPException(status_code=404, detail="Entrée introuvable.")
    for k, v in payload.model_dump().items():
        setattr(e, k, v)
    session.add(e)
    session.commit()
    S.invalidate()
    return _read(e)


@admin.delete("/entries/{entry_id}")
def delete_entry(entry_id: int, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    e = session.get(KnowledgeEntry, entry_id)
    if not e:
        raise HTTPException(status_code=404, detail="Entrée introuvable.")
    session.delete(e)
    session.commit()
    S.invalidate()
    return {"ok": True}
