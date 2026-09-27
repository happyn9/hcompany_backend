"""Envoi d'e-mails et de messages WhatsApp (OTP, notifications partenaires).

En l'absence de configuration SMTP/Twilio (dev local sans .env complet), les
fonctions journalisent le message au lieu d'échouer — pratique pour tester
tout le flux OTP sans compte Twilio réel. Ne JAMAIS laisser ce mode de repli
actif en production (voir `settings.notifications_configured`).
"""

import logging
import smtplib
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger("hcompany.notifications")


def send_email(to: str, subject: str, body: str) -> None:
    if not settings.smtp_host:
        logger.warning("[DEV] SMTP non configuré — e-mail simulé à %s: %s | %s", to, subject, body)
        return

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to

    try:
        # timeout impératif : sans lui, un serveur SMTP injoignable ou lent
        # bloque le thread indéfiniment. Les appelants font ceci après avoir
        # committé leur transaction DB, mais un blocage ici reste un thread
        # gaspillé — mieux vaut échouer vite.
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            server.starttls()
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password or "")
            server.sendmail(settings.smtp_from, [to], msg.as_string())
    except (smtplib.SMTPException, OSError):
        # Une notification qui échoue ne doit jamais faire échouer la requête
        # dont le travail (DB) est déjà commité — on journalise et on continue.
        logger.exception("Échec d'envoi d'e-mail à %s (sujet: %s)", to, subject)


def send_whatsapp(to_phone: str, body: str) -> None:
    if not settings.twilio_account_sid:
        logger.warning("[DEV] Twilio non configuré — WhatsApp simulé à %s: %s", to_phone, body)
        return

    # Import différé : Twilio n'est requis que si réellement utilisé.
    from twilio.rest import Client

    client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
    client.messages.create(
        from_=settings.twilio_whatsapp_number,
        to=f"whatsapp:{to_phone}",
        body=body,
    )


def send_otp_code(identifier: str, code: str, channel: str) -> None:
    message = f"Votre code de vérification H-Company est : {code}. Il expire dans {settings.otp_expire_minutes} minutes."
    if channel == "whatsapp":
        send_whatsapp(identifier, message)
    else:
        send_email(identifier, "Votre code de vérification H-Company", message)
