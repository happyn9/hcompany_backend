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

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from app.config import settings
from app.models import PaymentMethod


@dataclass
class PaymentResult:
    success: bool
    provider_reference: Optional[str] = None
    completed_at: Optional[datetime] = None
    failure_reason: Optional[str] = None
    simulated: bool = True


def charge(
    method: PaymentMethod,
    amount: float,
    reference: str,
    phone_number: Optional[str] = None,
) -> PaymentResult:
    """Point d'entrée unique appelé par les routers. `reference` est notre
    référence interne (ex: PAY-XXXXXX), passée au fournisseur comme
    identifiant de la transaction pour la réconciliation."""
    if method == PaymentMethod.card:
        return _charge_card(amount, reference)
    if method == PaymentMethod.airtel_money:
        return _charge_airtel_money(amount, reference, phone_number)
    if method == PaymentMethod.mtn_momo:
        return _charge_mtn_momo(amount, reference, phone_number)
    return PaymentResult(success=False, failure_reason=f"Méthode de paiement non supportée : {method}")


def _simulate(reference: str) -> PaymentResult:
    return PaymentResult(success=True, provider_reference=reference, completed_at=datetime.utcnow(), simulated=True)


def _charge_card(amount: float, reference: str) -> PaymentResult:
    if not settings.stripe_secret_key:
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
    raise NotImplementedError(
        "Clé Stripe renseignée mais l'appel réel n'est pas encore implémenté — "
        "décommenter le bloc ci-dessus une fois le package `stripe` installé et "
        "le compte marchand validé."
    )


def _charge_airtel_money(amount: float, reference: str, phone_number: Optional[str]) -> PaymentResult:
    if not settings.airtel_money_client_id or not settings.airtel_money_client_secret:
        return _simulate(reference)

    # --- Intégration réelle Airtel Money (à activer une fois les clés renseignées) ---
    # 1. POST {airtel_money_api_base}/auth/oauth2/token avec client_id/client_secret
    #    pour obtenir un access_token (grant_type=client_credentials).
    # 2. POST {airtel_money_api_base}/merchant/v1/payments/ avec le téléphone,
    #    le montant et `reference` comme transaction.id, en-tête Authorization
    #    Bearer + X-Country / X-Currency selon la doc Airtel Africa.
    # 3. Vérifier le statut via GET .../standard/v1/payments/{reference}.
    raise NotImplementedError(
        "Clés Airtel Money renseignées mais l'appel réel n'est pas encore "
        "implémenté — voir le plan en commentaire ci-dessus une fois prêt à "
        "brancher le compte marchand Airtel."
    )


def _charge_mtn_momo(amount: float, reference: str, phone_number: Optional[str]) -> PaymentResult:
    if not settings.mtn_momo_subscription_key or not settings.mtn_momo_api_key:
        return _simulate(reference)

    # --- Intégration réelle MTN MoMo (à activer une fois les clés renseignées) ---
    # 1. POST {mtn_momo_api_base}/collection/token/ avec Ocp-Apim-Subscription-Key
    #    + Basic Auth (api_user:api_key) pour obtenir un access_token.
    # 2. POST {mtn_momo_api_base}/collection/v1_0/requesttopay avec le
    #    téléphone, le montant et `reference` comme X-Reference-Id (UUID).
    # 3. Vérifier le statut via GET .../requesttopay/{X-Reference-Id}.
    raise NotImplementedError(
        "Clés MTN MoMo renseignées mais l'appel réel n'est pas encore "
        "implémenté — voir le plan en commentaire ci-dessus une fois prêt à "
        "brancher le compte marchand MTN."
    )
