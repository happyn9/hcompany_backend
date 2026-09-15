"""Notifications push — destinées à la plateforme mobile/desktop (Flutter).

Aucun fournisseur (FCM/APNs) n'est branché pour l'instant : la fonction
journalise, exactement comme le mode développement des e-mails, pour que
tout le flux applicatif (in-app + push) reste testable sans compte
Firebase/Apple réel. Brancher un vrai fournisseur plus tard ne changera
que l'intérieur de `send_push_notification` — aucun appelant n'a besoin
de changer.
"""

import logging

from app.config import settings

logger = logging.getLogger("hcompany.notifications.push")


def send_push_notification(device_token: str, title: str, body: str) -> None:
    if not getattr(settings, "fcm_server_key", None):
        logger.warning(
            "[DEV] Fournisseur push non configuré — notification simulée à %s: %s | %s",
            device_token,
            title,
            body,
        )
        return

    # Emplacement réservé pour l'intégration réelle (Firebase Cloud
    # Messaging ou équivalent) — la plateforme mobile/desktop pourra s'y
    # brancher sans toucher au reste du code applicatif.
    raise NotImplementedError("Fournisseur push non encore intégré.")
