from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_user
from app.models import Notification, User
from app.schemas import NotificationRead

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.get("/me", response_model=List[NotificationRead])
def my_notifications(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return session.exec(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
    ).all()


@router.post("/me/{notification_id}/read", response_model=NotificationRead)
def mark_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    notif = session.get(Notification, notification_id)
    if not notif or notif.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Notification introuvable.")
    notif.read = True
    session.add(notif)
    session.commit()
    session.refresh(notif)
    return notif


@router.post("/me/read-all")
def mark_all_read(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    notifs = session.exec(
        select(Notification).where(Notification.user_id == current_user.id, Notification.read == False)  # noqa: E712
    ).all()
    for n in notifs:
        n.read = True
        session.add(n)
    session.commit()
    return {"detail": f"{len(notifs)} notification(s) marquée(s) comme lues."}
