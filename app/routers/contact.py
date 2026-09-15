from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_admin, get_current_user
from app.models import ContactMessage, ContactStatus, User
from app.schemas import ContactAdminReply, ContactCreate, ContactRead
from app.services.accounts import get_or_create_user, notify_new_dashboard_access

router = APIRouter(prefix="/api/v1/contact", tags=["contact"])


@router.post("", response_model=ContactRead, status_code=status.HTTP_201_CREATED)
def send_message(payload: ContactCreate, session: Session = Depends(get_session)):
    user, created = get_or_create_user(session, payload.email, payload.name)

    message = ContactMessage(
        name=payload.name,
        email=payload.email,
        message=payload.message,
        user_id=user.id,
    )
    session.add(message)
    session.commit()
    session.refresh(message)

    notify_new_dashboard_access(payload.email, payload.name)
    return message


@router.get("/me", response_model=List[ContactRead])
def my_messages(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return session.exec(
        select(ContactMessage)
        .where(ContactMessage.user_id == current_user.id)
        .order_by(ContactMessage.created_at.desc())
    ).all()


@router.get("/admin", response_model=List[ContactRead])
def admin_list_messages(
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    return session.exec(select(ContactMessage).order_by(ContactMessage.created_at.desc())).all()


@router.patch("/admin/{message_id}", response_model=ContactRead)
def admin_reply(
    message_id: int,
    payload: ContactAdminReply,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    message = session.get(ContactMessage, message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message introuvable.")
    message.admin_reply = payload.admin_reply
    message.status = ContactStatus.answered
    session.add(message)
    session.commit()
    session.refresh(message)
    return message
