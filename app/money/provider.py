"""Fournisseur de paiement (agrégateur). Seule la version SIMULÉE existe tant qu'aucune clé n'est posée :
un vrai fournisseur (pawaPay, Flutterwave…) implémente les mêmes deux méthodes."""
import secrets
from dataclasses import dataclass

from app.config import settings


@dataclass
class ProviderResult:
    ok: bool
    ref: str = ""
    reason: str = ""


class SimulatedProvider:
    name = "simulated"
    simulated = True

    def collect(self, *, country: str, currency: str, amount: float, phone: str, operator: str, reference: str) -> ProviderResult:
        """Encaisse chez le payeur. Simulation : un numéro finissant par 9999 échoue."""
        if phone.endswith("9999"):
            return ProviderResult(False, reason="Paiement refusé par l'opérateur.")
        return ProviderResult(True, ref=f"SIM-IN-{secrets.token_hex(4).upper()}")

    def payout(self, *, country: str, currency: str, amount: float, phone: str, operator: str, reference: str) -> ProviderResult:
        """Verse chez le bénéficiaire. Simulation : un numéro finissant par 0000 échoue (le payeur est alors remboursé)."""
        if phone.endswith("0000"):
            return ProviderResult(False, reason="Numéro du bénéficiaire introuvable chez l'opérateur.")
        return ProviderResult(True, ref=f"SIM-OUT-{secrets.token_hex(4).upper()}")

    def refund(self, *, ref: str, amount: float, currency: str = "") -> ProviderResult:
        return ProviderResult(True, ref=f"SIM-REF-{secrets.token_hex(4).upper()}")


CURRENCY_OF = {"ZM": "ZMW"}  # pour la RDC la devise vient de l'opération (USD ou CDF)
FAILURES = {
    "PAYER_NOT_FOUND": "Numéro introuvable chez l'opérateur.", "PAYMENT_NOT_APPROVED": "Paiement non approuvé sur le téléphone.",
    "PAYER_LIMIT_REACHED": "Limite de l'opérateur atteinte.", "PAYMENT_IN_PROGRESS": "Un paiement est déjà en cours sur ce numéro.",
    "INSUFFICIENT_BALANCE": "Solde insuffisant.", "RECIPIENT_NOT_FOUND": "Numéro du bénéficiaire introuvable chez l'opérateur.",
}


class PawaPayProvider:
    """Agrégateur pawaPay (API v2). NON testé contre le vrai service tant qu'aucun jeton sandbox n'est posé (voir HMONEY_PAWAPAY.md) :
    la structure des appels suit la documentation v2 ; les tests utilisent un faux serveur HTTP.
    Limite connue : on attend l'approbation du payeur par interrogation (poll) dans la requête ; en production, passer aux callbacks."""
    name = "pawapay"
    simulated = False

    def __init__(self, token: str, base_url: str, poll_seconds: int = 90, transport=None, sleep=None):
        import httpx
        import time
        self.http = httpx.Client(base_url=base_url.rstrip("/"), headers={"Authorization": f"Bearer {token}"}, timeout=30, transport=transport)
        self.poll, self.sleep = poll_seconds, sleep or time.sleep

    def _code(self, country: str, operator: str) -> str:
        from app.money.pricing import PAWAPAY_CODES
        code = PAWAPAY_CODES.get((country.upper(), operator))
        if not code:
            raise ValueError(f"Opérateur {operator} non géré pour {country}.")
        return code

    @staticmethod
    def _reason(data: dict, default: str) -> str:
        fr = (data or {}).get("failureReason") or {}
        return FAILURES.get(fr.get("failureCode", ""), fr.get("failureMessage") or default)

    def _run(self, kind: str, *, country, currency, amount, phone, operator, reference) -> ProviderResult:
        import uuid
        party = "payer" if kind == "deposits" else "recipient"
        key = "depositId" if kind == "deposits" else "payoutId"
        rid = str(uuid.uuid4())
        body = {key: rid, "amount": f"{amount:.2f}", "currency": currency, party: {"type": "MMO", "accountDetails": {"phoneNumber": phone, "provider": self._code(country, operator)}}, "clientReferenceId": reference[:36]}
        try:
            r = self.http.post(f"/v2/{kind}", json=body)
            data = r.json()
        except Exception:
            return ProviderResult(False, reason="Service de paiement indisponible, réessayez.")
        if data.get("status") not in ("ACCEPTED", "DUPLICATE_IGNORED"):
            return ProviderResult(False, reason=self._reason(data, "Opération refusée par l'opérateur."))
        waited = 0
        while True:
            try:
                st = self.http.get(f"/v2/{kind}/{rid}").json()
            except Exception:
                st = {}
            d = st.get("data") or {}
            if d.get("status") == "COMPLETED":
                return ProviderResult(True, ref=rid)
            if d.get("status") == "FAILED":
                return ProviderResult(False, reason=self._reason(d, "Opération échouée chez l'opérateur."))
            if waited >= self.poll:
                return ProviderResult(False, reason="Délai dépassé : l'opérateur n'a pas confirmé à temps.")
            self.sleep(3); waited += 3

    def collect(self, *, country, currency, amount, phone, operator, reference) -> ProviderResult:
        return self._run("deposits", country=country, currency=currency, amount=amount, phone=phone, operator=operator, reference=reference)

    def payout(self, *, country, currency, amount, phone, operator, reference) -> ProviderResult:
        return self._run("payouts", country=country, currency=currency, amount=amount, phone=phone, operator=operator, reference=reference)

    def refund(self, *, ref: str, amount: float, currency: str = "") -> ProviderResult:
        """`ref` = identifiant du dépôt à rembourser."""
        import uuid
        try:
            data = self.http.post("/v2/refunds", json={"refundId": str(uuid.uuid4()), "depositId": ref, "amount": f"{amount:.2f}", "currency": currency or "ZMW"}).json()
        except Exception:
            return ProviderResult(False, reason="Remboursement non envoyé : à refaire manuellement.")
        return ProviderResult(data.get("status") in ("ACCEPTED", "DUPLICATE_IGNORED"), ref=ref, reason=self._reason(data, "Remboursement refusé."))


def get_provider():
    name = getattr(settings, "money_provider", "simulated")
    if name == "pawapay":
        if not settings.pawapay_api_token:
            raise RuntimeError("PAWAPAY_API_TOKEN manquant.")
        return PawaPayProvider(settings.pawapay_api_token, settings.pawapay_base_url, settings.pawapay_poll_seconds)
    if name != "simulated":
        raise RuntimeError(f"Fournisseur de paiement « {name} » inconnu.")
    return SimulatedProvider()
