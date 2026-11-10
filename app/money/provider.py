"""Fournisseur de paiement (agrégateur). Interface ASYNCHRONE : un appel renvoie un statut parmi
    completed | pending | failed | unknown
« unknown » = on ne sait pas (coupure, délai, statut non reconnu) : l'appelant NE REMBOURSE PAS et NE REVERSE PAS, il vérifie (check) ou attend le webhook.
Aucun PIN ne transite par H-Company : le payeur le saisit dans l'interface officielle de son opérateur (invite envoyée par le fournisseur).
Seule la version SIMULÉE est testée ; PawaPayProvider suit la documentation v2 mais n'a jamais parlé au vrai service (voir HMONEY_PAWAPAY.md)."""
import hashlib
import hmac
import secrets
from dataclasses import dataclass
from decimal import Decimal

from app.config import settings

COMPLETED, PENDING, FAILED, UNKNOWN = "completed", "pending", "failed", "unknown"


@dataclass
class ProviderResult:
    status: str
    ref: str = ""
    reason: str = ""

    @property
    def ok(self) -> bool:
        return self.status == COMPLETED


def _amount(minor: int) -> str:
    return f"{Decimal(minor) / 100:.2f}"


def sign(secret: str, raw: bytes) -> str:
    return hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()


class SimulatedProvider:
    """FAUX opérateur pour développer et tester : aucune vraie demande de paiement n'est envoyée, aucun argent ne bouge.
    Numéros de test (derniers chiffres) — collecte : 9999 refusée, 5555 en attente, 6666 statut inconnu ; versement : 0000 refusé, 7777 en attente, 8888 statut inconnu.
    Une opération « pending » ou « unknown » se résout via l'endpoint de simulation (réservé au fournisseur simulé)."""
    name = "simulated"
    simulated = True
    webhook_header = "x-hcompany-signature"

    def collect(self, *, op_id: str, country: str, currency: str, amount_minor: int, phone: str, operator: str, reference: str) -> ProviderResult:
        if phone.endswith("9999"):
            return ProviderResult(FAILED, reason="Paiement refusé par l'opérateur.")
        if phone.endswith("5555"):
            return ProviderResult(PENDING, ref=op_id)
        if phone.endswith("6666"):
            return ProviderResult(UNKNOWN, ref=op_id, reason="Pas de réponse du fournisseur.")
        return ProviderResult(COMPLETED, ref=f"SIM-IN-{secrets.token_hex(4).upper()}")

    def payout(self, *, op_id: str, country: str, currency: str, amount_minor: int, phone: str, operator: str, reference: str) -> ProviderResult:
        if phone.endswith("0000"):
            return ProviderResult(FAILED, reason="Numéro du bénéficiaire introuvable chez l'opérateur.")
        if phone.endswith("7777"):
            return ProviderResult(PENDING, ref=op_id)
        if phone.endswith("8888"):
            return ProviderResult(UNKNOWN, ref=op_id, reason="Pas de réponse du fournisseur.")
        return ProviderResult(COMPLETED, ref=f"SIM-OUT-{secrets.token_hex(4).upper()}")

    def refund(self, *, op_id: str, deposit_ref: str, amount_minor: int, currency: str = "") -> ProviderResult:
        return ProviderResult(COMPLETED, ref=f"SIM-REF-{secrets.token_hex(4).upper()}")

    def check(self, kind: str, op_id: str, op=None) -> ProviderResult:
        """Interroge l'état d'une opération. Simulation : lit l'issue décidée par l'endpoint de simulation (sinon toujours en attente / inconnue)."""
        st = getattr(op, "sim_status", "") or ""
        if st in (COMPLETED, FAILED):
            return ProviderResult(st, ref=op_id, reason="Refusé par l'opérateur (simulation)." if st == FAILED else "")
        return ProviderResult(PENDING if getattr(op, "status", "") == PENDING else UNKNOWN, ref=op_id)

    def verify_signature(self, raw: bytes, headers) -> bool:
        secret = settings.money_webhook_secret
        return bool(secret) and hmac.compare_digest(sign(secret, raw), headers.get(self.webhook_header, ""))

    @staticmethod
    def parse_callback(body: dict):
        return PawaPayProvider.parse_callback(body)


CURRENCY_OF = {"ZM": "ZMW"}  # pour la RDC la devise vient de l'opération (USD ou CDF)
FAILURES = {
    "PAYER_NOT_FOUND": "Numéro introuvable chez l'opérateur.", "PAYMENT_NOT_APPROVED": "Paiement non approuvé sur le téléphone.",
    "PAYER_LIMIT_REACHED": "Limite de l'opérateur atteinte.", "PAYMENT_IN_PROGRESS": "Un paiement est déjà en cours sur ce numéro.",
    "INSUFFICIENT_BALANCE": "Solde insuffisant.", "RECIPIENT_NOT_FOUND": "Numéro du bénéficiaire introuvable chez l'opérateur.",
}
PAWAPAY_STATUS = {"COMPLETED": COMPLETED, "FAILED": FAILED, "REJECTED": FAILED, "ACCEPTED": PENDING, "ENQUEUED": PENDING, "SUBMITTED": PENDING, "PROCESSING": PENDING}
PATH = {"collect": "deposits", "payout": "payouts", "refund": "refunds"}


class PawaPayProvider:
    """Agrégateur pawaPay (API v2) — NON testé contre le vrai service. L'initiation renvoie « pending » (le payeur valide avec son PIN chez son opérateur) ;
    le résultat arrive par webhook ET par interrogation (check). Une réponse illisible, un délai ou un statut non reconnu donnent « unknown », jamais « failed »."""
    name = "pawapay"
    simulated = False
    webhook_header = "x-hcompany-signature"

    def __init__(self, token: str, base_url: str, poll_seconds: int = 0, transport=None, sleep=None):
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

    def _initiate(self, kind: str, *, op_id, country, currency, amount_minor, phone, operator, reference) -> ProviderResult:
        party = "payer" if kind == "collect" else "recipient"
        key = "depositId" if kind == "collect" else "payoutId"
        body = {key: op_id, "amount": _amount(amount_minor), "currency": currency, party: {"type": "MMO", "accountDetails": {"phoneNumber": phone, "provider": self._code(country, operator)}},
                "clientReferenceId": reference[:36]}
        try:
            r = self.http.post(f"/v2/{PATH[kind]}", json=body)
            data = r.json()
        except Exception:
            return ProviderResult(UNKNOWN, ref=op_id, reason="Service de paiement injoignable : l'opération sera vérifiée.")
        st = data.get("status")
        if st in ("ACCEPTED", "DUPLICATE_IGNORED"):
            res = ProviderResult(PENDING, ref=op_id)
        elif st == "REJECTED":
            return ProviderResult(FAILED, reason=self._reason(data, "Opération refusée par le fournisseur."))
        else:
            return ProviderResult(UNKNOWN, ref=op_id, reason="Réponse du fournisseur non reconnue : l'opération sera vérifiée.")
        waited = 0
        while self.poll and waited < self.poll:  # attente facultative (désactivée par défaut) : le webhook fait foi
            self.sleep(3); waited += 3
            res = self.check(kind, op_id)
            if res.status != PENDING:
                break
        return res

    def collect(self, *, op_id, country, currency, amount_minor, phone, operator, reference) -> ProviderResult:
        return self._initiate("collect", op_id=op_id, country=country, currency=currency, amount_minor=amount_minor, phone=phone, operator=operator, reference=reference)

    def payout(self, *, op_id, country, currency, amount_minor, phone, operator, reference) -> ProviderResult:
        return self._initiate("payout", op_id=op_id, country=country, currency=currency, amount_minor=amount_minor, phone=phone, operator=operator, reference=reference)

    def refund(self, *, op_id: str, deposit_ref: str, amount_minor: int, currency: str = "") -> ProviderResult:
        """`deposit_ref` = identifiant du dépôt à rembourser."""
        try:
            data = self.http.post("/v2/refunds", json={"refundId": op_id, "depositId": deposit_ref, "amount": _amount(amount_minor), "currency": currency or "ZMW"}).json()
        except Exception:
            return ProviderResult(UNKNOWN, ref=op_id, reason="Remboursement non confirmé : à vérifier.")
        if data.get("status") in ("ACCEPTED", "DUPLICATE_IGNORED"):
            return ProviderResult(PENDING, ref=op_id)
        if data.get("status") == "REJECTED":
            return ProviderResult(FAILED, reason=self._reason(data, "Remboursement refusé."))
        return ProviderResult(UNKNOWN, ref=op_id, reason="Réponse non reconnue : à vérifier.")

    def check(self, kind: str, op_id: str, op=None) -> ProviderResult:
        try:
            r = self.http.get(f"/v2/{PATH[kind]}/{op_id}")
            body = r.json()
        except Exception:
            return ProviderResult(UNKNOWN, ref=op_id, reason="Fournisseur injoignable.")
        if body.get("status") != "FOUND":
            return ProviderResult(UNKNOWN, ref=op_id, reason="Opération introuvable chez le fournisseur.")
        d = body.get("data") or {}
        st = PAWAPAY_STATUS.get(d.get("status", ""), UNKNOWN)
        return ProviderResult(st, ref=op_id, reason=self._reason(d, "Opération échouée chez l'opérateur.") if st == FAILED else "")

    def verify_signature(self, raw: bytes, headers) -> bool:
        """Secret partagé HMAC-SHA256 (MONEY_WEBHOOK_SECRET). À CONFIRMER : le schéma de signature réel de pawaPay (clés publiques, RFC 9421) n'est pas encore géré ;
        en attendant, aucun statut reçu n'est cru sur parole : il est toujours revérifié par un appel check() au fournisseur."""
        secret = settings.money_webhook_secret
        return bool(secret) and hmac.compare_digest(sign(secret, raw), headers.get(self.webhook_header, ""))

    @staticmethod
    def parse_callback(body: dict):
        """(kind, op_id, status brut) d'un callback pawaPay, ou None."""
        for key, kind in (("depositId", "collect"), ("payoutId", "payout"), ("refundId", "refund")):
            if body.get(key):
                return kind, str(body[key]), str(body.get("status", ""))
        return None


def get_provider():
    name = getattr(settings, "money_provider", "simulated")
    if name == "pawapay":
        if not settings.pawapay_api_token:
            raise RuntimeError("PAWAPAY_API_TOKEN manquant.")
        return PawaPayProvider(settings.pawapay_api_token, settings.pawapay_base_url, settings.pawapay_poll_seconds)
    if name != "simulated":
        raise RuntimeError(f"Fournisseur de paiement « {name} » inconnu.")
    return SimulatedProvider()
