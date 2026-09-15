"""Notifications in-app — un simple enregistrement en base, lu aussi bien
par le site que par la future app mobile/desktop (même backend, mêmes
données). Contrairement à l'e-mail ou au push, il n'y a rien à "envoyer" :
la ligne existe, le client (site ou app) l'affiche à sa prochaine requête.
"""

from sqlmodel import Session

from app.models import Notification, NotificationChannel
from app.services.notifications.push_channel import send_push_notification


def create_in_app_notification(
    session: Session,
    user_id: int,
    title: str,
    body: str,
    also_push: bool = False,
    device_token: str | None = None,
) -> Notification:
    notif = Notification(
        user_id=user_id,
        title=title,
        body=body,
        channel=NotificationChannel.push if also_push else NotificationChannel.in_app,
    )
    session.add(notif)
    session.flush()

    if also_push and device_token:
        send_push_notification(device_token, title, body)

    return notif
