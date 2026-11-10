"""Moteur financier H-Money — fonctions PURES en Decimal (aucun accès base, aucun float).

Sens : « zc » = Zambie → RDC (le payeur paie en ZMW, le bénéficiaire reçoit des USD) ;
       « cz » = RDC → Zambie (le payeur paie en USD, le bénéficiaire reçoit des ZMW).
Taux client (ZMW pour 1 USD), à 4 décimales, toujours défavorables au client pour garantir K_cz ≤ M ≤ K_zc :
       K_zc = ⌈M·(1+m_zc)⌉     K_cz = ⌊M·(1−m_cz)⌋
Règle d'arrondi : le bénéficiaire est arrondi vers le BAS, le payeur vers le HAUT.
Frais : F(S) = max(F_min, ⌈p·S + a⌉) dans la devise du payeur (continu : pas de palier côté client).
Montant payé T = S + F. Mode « déduit » : le client fixe T, on cherche le plus grand S tel que S + F(S) ≤ T, et F = T − S
(l'écart éventuel de 0,01 reste dans les frais : on ne rend jamais moins que ce qui est payé).
Tous les montants sont à 0,01 (ZMW et USD ont 2 décimales) ; `to_minor` / `from_minor` donnent les entiers stockés en base."""
from dataclasses import dataclass
from decimal import ROUND_CEILING, ROUND_FLOOR, Decimal as D, getcontext

getcontext().prec = 50
CENT = D("0.01")
Q4 = D("0.0001")
DIRECTIONS = ("zc", "cz")
CURRENCY = {"zc": ("ZMW", "USD"), "cz": ("USD", "ZMW")}  # (devise payée, devise reçue)


class EngineError(ValueError):
    """Montant ou paramètre refusé (message destiné à l'utilisateur)."""


def floor_to(x: D, q: D = CENT) -> D:
    return (x / q).to_integral_value(ROUND_FLOOR) * q


def ceil_to(x: D, q: D = CENT) -> D:
    return (x / q).to_integral_value(ROUND_CEILING) * q


def d(x) -> D:
    """Conversion sûre vers Decimal (passe par str : jamais de bruit binaire de float)."""
    return x if isinstance(x, D) else D(str(x))


def to_minor(x: D) -> int:
    n = x / CENT
    if n != n.to_integral_value():
        raise EngineError("Montant avec plus de 2 décimales.")
    return int(n)


def from_minor(n: int) -> D:
    return D(n) * CENT


@dataclass(frozen=True)
class Params:
    M: D                      # taux du marché : ZMW pour 1 USD
    m_zc: D = D("0.015")      # marges (fractions) — paramètres FICTIFS à confirmer
    m_cz: D = D("0.015")
    p_zc: D = D("0.03")       # frais proportionnels (fractions)
    p_cz: D = D("0.04")
    a_zc: D = D("0")          # frais fixes (devise du payeur)
    a_cz: D = D("0")
    fmin_zc: D = D("10")      # frais minimum en ZMW
    fmin_cz: D = D("0.5")     # frais minimum en USD
    K_zc_fixed: D | None = None   # taux imposé par l'admin / l'agent (remplace M·(1±m))
    K_cz_fixed: D | None = None
    min_usd: D = D("2")
    max_usd: D = D("1000")

    def K(self, direction: str) -> D:
        if direction == "zc":
            return self.K_zc_fixed or ceil_to(self.M * (1 + self.m_zc), Q4)
        return self.K_cz_fixed or floor_to(self.M * (1 - self.m_cz), Q4)

    def fee_params(self, direction: str):
        return (self.p_zc, self.a_zc, self.fmin_zc) if direction == "zc" else (self.p_cz, self.a_cz, self.fmin_cz)

    def usd_of_payer(self, direction: str, S: D) -> D:
        return S / self.M if direction == "zc" else S


def _dir(direction: str) -> str:
    if direction not in DIRECTIONS:
        raise EngineError("Sens inconnu.")
    return direction


def fee(p: Params, direction: str, S: D) -> D:
    pct, a, fmin = p.fee_params(_dir(direction))
    return max(fmin, ceil_to(pct * S + a))


def receive_for(p: Params, direction: str, S: D) -> D:
    """Montant reçu pour un montant converti S : arrondi vers le BAS."""
    K = p.K(_dir(direction))
    return floor_to(S / K) if direction == "zc" else floor_to(S * K)


def check_limits(p: Params, direction: str, S: D) -> None:
    usd = p.usd_of_payer(direction, S)
    if usd < p.min_usd:
        raise EngineError(f"Montant minimum : l'équivalent de {p.min_usd:g} USD.")
    if usd > p.max_usd:
        raise EngineError(f"Montant maximum par opération : l'équivalent de {p.max_usd:g} USD.")


def _pack(p: Params, direction: str, mode: str, S: D, F: D, T: D, R: D, request_type: str = "") -> dict:
    pay_cur, rec_cur = CURRENCY[direction]
    return {"direction": direction, "mode": mode, "request_type": request_type, "pay_currency": pay_cur, "receive_currency": rec_cur,
            "S": S, "F": F, "T": T, "R": R, "K": p.K(direction), "M": p.M,
            "fee_pct": p.fee_params(direction)[0], "margin": p.m_zc if direction == "zc" else p.m_cz}


def quote_added(p: Params, direction: str, S: D) -> dict:
    """Frais en supplément : le client paie T = S + F ; le bénéficiaire reçoit la conversion (arrondie vers le bas) de S."""
    S = d(S)
    if S <= 0:
        raise EngineError("Le montant doit être positif.")
    check_limits(p, direction, S)
    F = fee(p, direction, S)
    return _pack(p, direction, "added", S, F, S + F, receive_for(p, direction, S))


def quote_deducted(p: Params, direction: str, T: D) -> dict:
    """Frais déduits : le client paie exactement T ; S est le plus grand montant tel que S + F(S) ≤ T (forme fermée, pas d'itération)."""
    T = d(T)
    pct, a, fmin = p.fee_params(_dir(direction))
    if T <= fmin:
        raise EngineError("Le montant est trop petit pour couvrir les frais.")
    t_star = (fmin - a) / pct + fmin  # au-delà, le minimum ne s'applique plus
    if T <= t_star:
        S = T - fmin
    else:
        S = floor_to((T - a) / (1 + pct))
        while S + fee(p, direction, S) > T:
            S -= CENT
        while S + CENT + fee(p, direction, S + CENT) <= T:  # (garde-fou : S maximal)
            S += CENT
    if S <= 0:
        raise EngineError("Le montant est trop petit pour couvrir les frais.")
    check_limits(p, direction, S)
    return _pack(p, direction, "deducted", S, T - S, T, receive_for(p, direction, S))


def quote_request(p: Params, direction: str, request_type: str, x: D) -> dict:
    """Demande. Type A : le bénéficiaire reçoit EXACTEMENT x (devise reçue), le payeur paie S = ⌈x·K⌉ (zc) / ⌈x/K⌉ (cz) + frais en supplément.
    Type B : le payeur paie EXACTEMENT x (hors frais, devise payée) ; le bénéficiaire reçoit la conversion arrondie vers le bas.
    Le montant reçu est figé dans le devis : le versement ne le recalcule jamais."""
    x, K = d(x), p.K(_dir(direction))
    if x <= 0:
        raise EngineError("Le montant doit être positif.")
    if request_type == "A":
        S = ceil_to(x * K) if direction == "zc" else ceil_to(x / K)
        R = x
    elif request_type == "B":
        S, R = x, receive_for(p, direction, x)
    else:
        raise EngineError("Type de demande inconnu.")
    check_limits(p, direction, S)
    F = fee(p, direction, S)
    return _pack(p, direction, "request", S, F, S + F, R, request_type)
