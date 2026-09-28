from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_admin, get_current_user
from app.models import Notification, User
from app.schemas import AdminSendNotification, NotificationRead, UserLookupRead
from app.services.notifications import create_in_app_notification, send_email

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


# --- Envoi par l'admin (demande de service, ou tout autre motif) ---

@router.get("/admin/users/search", response_model=List[UserLookupRead])
def admin_search_users(
    q: str = "",
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    """Recherche simple (email ou nom) pour que l'admin puisse choisir un
    destinataire quand la notification n'est pas déjà liée à une demande
    précise (ex: motif ponctuel, pas une réponse à une demande de service)."""
    query = select(User)
    if q:
        like = f"%{q.lower()}%"
        query = query.where(
            (User.email.ilike(like)) | (User.full_name.ilike(like))
        )
    users = session.exec(query.limit(20)).all()
    return users


@router.post("/admin/send", response_model=NotificationRead)
def admin_send_notification(
    payload: AdminSendNotification,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    """Permet à l'admin de notifier un utilisateur précis directement depuis
    le dashboard (ex: suite à une demande de service, ou pour tout autre
    motif ponctuel) — visible côté user via sa cloche de notifications, et
    doublé d'un e-mail si `also_email` est vrai."""
    user = session.get(User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")

    notif = create_in_app_notification(
        session,
        user_id=user.id,
        title=payload.title,
        body=payload.body,
    )
    session.commit()
    session.refresh(notif)

    if payload.also_email:
        send_email(user.email, payload.title, payload.body)

    return notif
