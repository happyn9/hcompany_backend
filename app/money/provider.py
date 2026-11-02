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

    def refund(self, *, ref: str, amount: float) -> ProviderResult:
        return ProviderResult(True, ref=f"SIM-REF-{secrets.token_hex(4).upper()}")


def get_provider():
    name = getattr(settings, "money_provider", "simulated")
    if name != "simulated":
        raise RuntimeError(f"Fournisseur de paiement « {name} » non branché.")
    return SimulatedProvider()
