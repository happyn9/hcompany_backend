import random
import string


def generate_reference_code(prefix: str = "HC") -> str:
    """Génère un code de référence lisible, ex: HC-4821.
    Pas cryptographiquement unique à lui seul : la colonne DB porte une
    contrainte UNIQUE, donc une collision (rare) déclenche une erreur DB
    propre plutôt qu'un doublon silencieux."""
    digits = "".join(random.choices(string.digits, k=4))
    return f"{prefix}-{digits}"
