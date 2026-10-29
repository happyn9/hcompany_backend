"""Envoi d'e-mails et de messages WhatsApp (OTP, notifications partenaires).

En l'absence de configuration SMTP/Twilio (dev local sans .env complet), les
fonctions journalisent le message au lieu d'échouer — pratique pour tester
tout le flux OTP sans compte Twilio réel. Ne JAMAIS laisser ce mode de repli
actif en production (voir `settings.notifications_configured`).
"""

import logging
import smtplib
from concurrent.futures import ThreadPoolExecutor
from email.mime.text import MIMEText

import httpx

from app.config import settings

logger = logging.getLogger("hcompany.notifications")


# Les envois partent dans un pool de threads (fire-and-forget) : une requête
# HTTP (validation admin, OTP...) ne doit JAMAIS attendre le réseau d'un
# fournisseur d'e-mail ou de Twilio.
_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="notify")


def _send_via_resend(to: str, subject: str, body: str) -> None:
    r = httpx.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {settings.resend_api_key}"},
        json={"from": settings.smtp_from, "to": [to], "subject": subject, "text": body},
        timeout=10,
    )
    if r.status_code >= 300:
        logger.error("Resend a refusé l'e-mail à %s (HTTP %s) : %s", to, r.status_code, r.text[:300])
    else:
        logger.info("E-mail envoyé à %s via Resend (%s)", to, subject)


def _send_via_smtp(to: str, subject: str, body: str) -> None:
    msg = MIMEText(body, _charset="utf-8")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to
    if settings.smtp_port == 465:
        server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10)
    else:
        server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10)
    with server:
        if settings.smtp_port != 465:
            server.starttls()
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password or "")
        server.sendmail(settings.smtp_from, [to], msg.as_string())
    logger.info("E-mail envoyé à %s via SMTP (%s)", to, subject)


def _send_email_now(to: str, subject: str, body: str) -> None:
    try:
        if settings.resend_api_key:
            _send_via_resend(to, subject, body)
        else:
            _send_via_smtp(to, subject, body)
    except Exception:  # une notification ne doit jamais faire échouer l'appelant
        logger.exception("Échec d'envoi d'e-mail à %s (sujet: %s)", to, subject)


def send_email(to: str, subject: str, body: str) -> None:
    if not (settings.resend_api_key or settings.smtp_host):
        logger.warning("[DEV] E-mail non configuré — e-mail simulé à %s: %s | %s", to, subject, body)
        return
    _pool.submit(_send_email_now, to, subject, body)


def _send_whatsapp_now(to_phone: str, body: str) -> None:
    try:
        from twilio.rest import Client

        Client(settings.twilio_account_sid, settings.twilio_auth_token).messages.create(
            from_=settings.twilio_whatsapp_number, to=f"whatsapp:{to_phone}", body=body,
        )
    except Exception:
        logger.exception("Échec d'envoi WhatsApp à %s", to_phone)


def send_whatsapp(to_phone: str, body: str) -> None:
    if not settings.twilio_account_sid:
        logger.warning("[DEV] Twilio non configuré — WhatsApp simulé à %s: %s", to_phone, body)
        return
    _pool.submit(_send_whatsapp_now, to_phone, body)


def send_otp_code(identifier: str, code: str, channel: str) -> None:
    message = f"Votre code de vérification H-Company est : {code}. Il expire dans {settings.otp_expire_minutes} minutes."
    if channel == "whatsapp":
        send_whatsapp(identifier, message)
    else:
        send_email(identifier, "Votre code de vérification H-Company", message)
