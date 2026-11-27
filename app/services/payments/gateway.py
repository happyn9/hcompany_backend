"""Abstraction de paiement — un seul point d'entrée (`charge`) que les
routers appellent, quel que soit le fournisseur réel derrière. Objectif :
le jour où les documents/comptes marchands (Stripe, Airtel Money, MTN
MoMo) seront prêts, il suffira de renseigner les clés dans les variables
d'environnement listées dans app/config.py — aucun changement dans les
routers n'est nécessaire, seul ce module change de comportement.

Tant qu'une clé n'est pas renseignée pour un fournisseur donné, ce module
simule une confirmation immédiate (comportement actuel du site), pour que
le flux complet reste testable de bout en bout sans compte marchand réel.
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from app.config import settings
from app.models import PaymentMethod

logger = logging.getLogger(__name__)


@dataclass
class PaymentResult:
    success: bool
    provider_reference: Optional[str] = None
    completed_at: Optional[datetime] = None
    failure_reason: Optional[str] = None
    simulated: bool = True
    # Le fournisseur n'a PAS été contacté (intégration absente) : aucun débit, échec définitif.
    unavailable: bool = False
    # Le fournisseur a peut-être été contacté mais l'issue est inconnue (erreur, délai) : NI succès NI refus.
    uncertain: bool = False


def charge(
    method: PaymentMethod,
    amount: float,
    reference: str,
    phone_number: Optional[str] = None,
) -> PaymentResult:
    """Point d'entrée unique appelé par les routers. `reference` est notre
    référence interne (ex: PAY-XXXXXX), passée au fournisseur comme
    identifiant de la transaction pour la réconciliation."""
    try:
        if method == PaymentMethod.card:
            return _charge_card(amount, reference)
        if method == PaymentMethod.airtel_money:
            return _charge_airtel_money(amount, reference, phone_number)
        if method == PaymentMethod.mtn_momo:
            return _charge_mtn_momo(amount, reference, phone_number)
        if method == PaymentMethod.zamtel_money:
            return _charge_zamtel_money(amount, reference, phone_number)
    except Exception:  # noqa: BLE001 — une erreur du fournisseur ne doit JAMAIS devenir un succès ni un 500
        logger.exception("Erreur de la passerelle de paiement (%s, réf. %s)", method, reference)
        return PaymentResult(
            success=False, simulated=False, uncertain=True,
            failure_reason="Le paiement n'a pas pu être confirmé. Ne payez pas une seconde fois : contactez l'équipe H-Company avec votre référence.",
        )
    return PaymentResult(success=False, simulated=False, failure_reason=f"Méthode de paiement non supportée : {method}")


def _present(*values) -> bool:
    """Une clé n'est « renseignée » que si elle contient autre chose que des espaces."""
    return all(isinstance(v, str) and v.strip() for v in values)


def _not_integrated(provider: str) -> PaymentResult:
    """Clés renseignées mais appel réel pas encore branché : on ne simule JAMAIS un succès et on ne plante pas."""
    return PaymentResult(
        success=False, simulated=False, unavailable=True,
        failure_reason=f"Le paiement par {provider} n'est pas encore disponible. Contactez l'équipe H-Company.",
    )


def _simulate(reference: str) -> PaymentResult:
    return PaymentResult(success=True, provider_reference=reference, completed_at=datetime.utcnow(), simulated=True)


def _charge_card(amount: float, reference: str) -> PaymentResult:
    if not _present(settings.stripe_secret_key):
        return _simulate(reference)

    # --- Intégration réelle Stripe (à activer une fois la clé renseignée) ---
    # import stripe
    # stripe.api_key = settings.stripe_secret_key
    # intent = stripe.PaymentIntent.create(
    #     amount=int(amount * 100),  # Stripe attend des centimes
    #     currency="usd",
    #     metadata={"reference": reference},
    #     confirm=True,
    # )
    # return PaymentResult(
    #     success=intent.status == "succeeded",
    #     provider_reference=intent.id,
    #     completed_at=datetime.utcnow(),
    #     simulated=False,
    # )
    return _not_integrated("carte bancaire")


def _charge_airtel_money(amount: float, reference: str, phone_number: Optional[str]) -> PaymentResult:
    if not _present(settings.airtel_money_client_id, settings.airtel_money_client_secret):
        return _simulate(reference)

    # --- Intégration réelle Airtel Money (à activer une fois les clés renseignées) ---
    # 1. POST {airtel_money_api_base}/auth/oauth2/token avec client_id/client_secret
    #    pour obtenir un access_token (grant_type=client_credentials).
    # 2. POST {airtel_money_api_base}/merchant/v1/payments/ avec le téléphone,
    #    le montant et `reference` comme transaction.id, en-tête Authorization
    #    Bearer + X-Country / X-Currency selon la doc Airtel Africa.
    # 3. Vérifier le statut via GET .../standard/v1/payments/{reference}.
    return _not_integrated("Airtel Money")


def _charge_mtn_momo(amount: float, reference: str, phone_number: Optional[str]) -> PaymentResult:
    if not _present(settings.mtn_momo_subscription_key, settings.mtn_momo_api_key):
        return _simulate(reference)

    # --- Intégration réelle MTN MoMo (à activer une fois les clés renseignées) ---
    # 1. POST {mtn_momo_api_base}/collection/token/ avec Ocp-Apim-Subscription-Key
    #    + Basic Auth (api_user:api_key) pour obtenir un access_token.
    # 2. POST {mtn_momo_api_base}/collection/v1_0/requesttopay avec le
    #    téléphone, le montant et `reference` comme X-Reference-Id (UUID).
    # 3. Vérifier le statut via GET .../requesttopay/{X-Reference-Id}.
    return _not_integrated("MTN MoMo")


def _charge_zamtel_money(amount: float, reference: str, phone_number: Optional[str]) -> PaymentResult:
    if not _present(settings.zamtel_money_api_key, settings.zamtel_money_api_secret):
        return _simulate(reference)

    # --- Intégration réelle Zamtel Money (à écrire avec la doc du compte marchand) ---
    # Même schéma que les autres opérateurs : demande de paiement vers le
    # téléphone avec `reference` comme identifiant de transaction, puis
    # vérification du statut (ou callback) avant de confirmer.
    return _not_integrated("Zamtel Money")
