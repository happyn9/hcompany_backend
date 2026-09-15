"""Point d'entrée unique du module de notifications, organisé par canal :

- `email_channel`   — e-mail (SMTP) + WhatsApp (Twilio) : utilisés surtout
                       par le site (OTP, contrats, statut de compte).
- `push_channel`     — notifications push, destinées à la plateforme
                       mobile/desktop (pas encore de fournisseur branché).
- `in_app_channel`   — notifications lues en base par n'importe quel
                       client (site ou app), sans envoi actif.

Tout le code applicatif continue d'importer depuis `app.services.notifications`
comme avant (`from app.services.notifications import send_email`) — le
découpage en fichiers est un détail d'organisation interne, pas un
changement d'API pour les appelants existants.
"""

from app.services.notifications.email_channel import send_email, send_otp_code, send_whatsapp
from app.services.notifications.in_app_channel import create_in_app_notification
from app.services.notifications.push_channel import send_push_notification

__all__ = [
    "send_email",
    "send_whatsapp",
    "send_otp_code",
    "send_push_notification",
    "create_in_app_notification",
]
