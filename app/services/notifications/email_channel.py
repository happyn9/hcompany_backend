"""Envoi d'e-mails et de messages WhatsApp (OTP, notifications partenaires).

En l'absence de configuration SMTP/Twilio (dev local sans .env complet), les
fonctions journalisent le message au lieu d'échouer — pratique pour tester
tout le flux OTP sans compte Twilio réel. Ne JAMAIS laisser ce mode de repli
actif en production (voir `settings.notifications_configured`).
"""

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings
from app.services.notifications.email_html import auto_html, bilingual, render_html

logger = logging.getLogger("hcompany.notifications")


def send_email(to: str, subject: str, body: str, *, html: str | None = None, lang: str = "fr") -> None:
    """Texte brut + version HTML aux couleurs de H-Company (générée automatiquement si `html` n'est pas fourni)."""
    if not settings.smtp_host:
        logger.warning("[DEV] SMTP non configuré — e-mail simulé à %s: %s | %s", to, subject, body)
        return

    try:
        page = html or auto_html(subject, body, lang)
    except Exception:  # un défaut de mise en forme ne doit jamais empêcher l'envoi
        logger.exception("Mise en forme HTML impossible")
        page = None
    msg = MIMEMultipart("alternative") if page else MIMEText(body)
    if page:
        msg.attach(MIMEText(body, "plain", "utf-8"))
        msg.attach(MIMEText(page, "html", "utf-8"))
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to

    last: Exception | None = None
    # 1re tentative : négociation normale ; 2e tentative (nouvelle connexion) si le serveur coupe pendant AUTH.
    # Cause fréquente de « Connection unexpectedly closed » : smtplib essaie d'abord CRAM-MD5, que plusieurs fournisseurs
    # (Brevo, Zoho, Mailgun…) ferment brutalement au lieu de refuser. On n'annonce alors que PLAIN/LOGIN (sûrs sous TLS).
    for attempt in (1, 2):
        try:
            _deliver(to, msg, plain_auth_only=attempt == 2)
            return
        except smtplib.SMTPAuthenticationError:
            logger.error("SMTP : identifiants refusés par %s:%s (vérifiez SMTP_USER / SMTP_PASSWORD — mot de passe d'application ?)", settings.smtp_host, settings.smtp_port)
            return  # inutile de réessayer : le mot de passe est faux
        except (smtplib.SMTPException, OSError) as exc:
            last = exc
            logger.warning("SMTP tentative %d échouée vers %s:%s (%s: %s)", attempt, settings.smtp_host, settings.smtp_port, type(exc).__name__, exc)
    # Une notification qui échoue ne doit jamais faire échouer la requête dont le travail (DB) est déjà commité.
    logger.error("Échec d'envoi d'e-mail à %s (sujet: %s) : %s. Hôte %s:%s — si l'hébergeur bloque les ports SMTP sortants, utilisez le port 2525/465 ou un service e-mail par API.", to, subject, last, settings.smtp_host, settings.smtp_port)


def _deliver(to: str, msg, *, plain_auth_only: bool) -> None:
    """Une connexion SMTP complète. Port 465 = TLS implicite ; sinon STARTTLS dès que le serveur l'annonce. Timeout impératif (10 s)."""
    port = int(settings.smtp_port)
    server = smtplib.SMTP_SSL(settings.smtp_host, port, timeout=10) if port == 465 else smtplib.SMTP(settings.smtp_host, port, timeout=10)
    try:
        server.ehlo()
        if port != 465 and server.has_extn("starttls"):
            server.starttls()
            server.ehlo()  # les capacités (dont AUTH) changent après STARTTLS
        if settings.smtp_user:
            if plain_auth_only and "auth" in server.esmtp_features:
                server.esmtp_features["auth"] = " ".join(m for m in server.esmtp_features["auth"].split() if m.upper() in ("PLAIN", "LOGIN")) or "PLAIN LOGIN"
            server.login(settings.smtp_user, settings.smtp_password or "")
        server.sendmail(settings.smtp_from, [to], msg.as_string())
    finally:
        try:
            server.quit()
        except (smtplib.SMTPException, OSError):
            server.close()


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
        send_email(identifier, "Votre code de vérification H-Company / Your H-Company verification code", otp_body(code))


def otp_body(code: str, intent_fr: str = "Votre code de vérification H-Company", intent_en: str = "Your H-Company verification code") -> str:
    m = settings.otp_expire_minutes
    return bilingual(f"{intent_fr} est : {code}. Il expire dans {m} minutes. Ne le partagez avec personne.",
                     f"{intent_en} is: {code}. It expires in {m} minutes. Never share it with anyone.")
