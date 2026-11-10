"""H-Money : envoyer ou demander de l'argent entre la Zambie et la RD Congo.
L'argent ne traverse pas la frontière côté H-Company : on encaisse dans le pays du payeur,
on verse dans le pays du bénéficiaire, via un agrégateur (le règlement entre pays est le sien)."""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Column, Index, UniqueConstraint, text
from sqlmodel import Field, SQLModel


class MoneyTransfer(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)
    kind: str = Field(index=True)  # send | request
    # send : user_id = expéditeur (payeur). request : user_id = celui qui DEMANDE (et reçoit).
    user_id: int = Field(foreign_key="user.id", index=True)
    payer_user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    from_country: str  # pays du payeur
    to_country: str  # pays du bénéficiaire
    send_currency: str = ""
    send_amount: float = 0  # montant converti (hors frais)
    fee: float = 0  # frais H-Company, dans la devise du payeur
    total_paid: float = 0  # ce que le payeur débourse
    receive_currency: str
    receive_amount: float = 0
    rate: float = 0  # unités de devise reçue pour 1 unité payée, au moment de l'opération
    counterpart_name: str = ""  # bénéficiaire (send) ou personne sollicitée (request)
    counterpart_phone: str = ""
    counterpart_operator: str = ""
    pay_phone: str = ""
    pay_operator: str = ""
    note: str = ""
    status: str = Field(default="created", index=True)  # created | awaiting_payer | under_review | completed | refunded | rejected | declined | cancelled | expired
    provider: str = "simulated"
    provider_ref: str = ""
    failure_reason: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None
    flagged: bool = False
    review_note: str = ""
    provider_cost: float = 0  # coût estimé de l'agrégateur, dans la devise du payeur (pour la marge nette)
    # --- Montants en unités mineures ENTIÈRES (centimes) : ce sont eux qui font foi ; les colonnes float ci-dessus n'en sont que le miroir d'affichage ---
    send_minor: int = Field(default=0, sa_column=Column(BigInteger, nullable=False, server_default="0"))
    fee_minor: int = Field(default=0, sa_column=Column(BigInteger, nullable=False, server_default="0"))
    total_minor: int = Field(default=0, sa_column=Column(BigInteger, nullable=False, server_default="0"))  # collecté chez le payeur
    receive_minor: int = Field(default=0, sa_column=Column(BigInteger, nullable=False, server_default="0"))  # versé au bénéficiaire : figé dans le devis, jamais recalculé
    quote_id: str = Field(default="", index=True)  # devis confirmé utilisé pour cette opération
    rate_k: str = ""  # taux client utilisé (ZMW pour 1 USD, 4 décimales), recopié du devis
    # --- Demande : montant et sens du montant explicitement enregistrés ---
    request_type: str = ""  # "A" (le bénéficiaire reçoit exactement) | "B" (le payeur paie exactement) | "" (envoi)
    requested_minor: int = Field(default=0, sa_column=Column(BigInteger, nullable=False, server_default="0"))
    requested_currency: str = ""
    final_status: str = ""  # statut final prévu d'un remboursement en cours : refunded | rejected
    verify_needed: bool = False  # statut fournisseur inconnu / injoignable : à VÉRIFIER (jamais de remboursement ni de nouveau versement automatique)
    amount_side: str = ""  # "receive" (type A, facture) | "pay" (type B) | "pay_total" (envoi, frais déduits) | "pay_base" (envoi, frais en supplément)


class MoneyQuote(SQLModel, table=True):
    """Devis CONFIRMÉ et conservé : tout ce qui a été montré au client (montants entiers, taux, frais, opérateurs). L'opération qui l'utilise
    ne recalcule rien : elle reprend ces valeurs. Un devis expire (10 min) et ne sert qu'une fois."""
    id: str = Field(primary_key=True)  # uuid4 hex
    user_id: int = Field(foreign_key="user.id", index=True)
    kind: str  # send | request
    direction: str  # zc | cz
    mode: str  # added | deducted | request
    request_type: str = ""
    from_country: str
    to_country: str
    pay_currency: str
    receive_currency: str
    send_minor: int = Field(sa_column=Column(BigInteger, nullable=False))
    fee_minor: int = Field(sa_column=Column(BigInteger, nullable=False))
    total_minor: int = Field(sa_column=Column(BigInteger, nullable=False))
    receive_minor: int = Field(sa_column=Column(BigInteger, nullable=False))
    rate_k: str  # taux client
    market_mid: str  # taux du marché au moment du devis
    fee_pct: str = ""
    margin: str = ""
    pay_operator: str = ""
    receive_operator: str = ""
    provider_cost_minor: int = Field(default=0, sa_column=Column(BigInteger, nullable=False, server_default="0"))  # estimé
    net_minor: int = Field(default=0, sa_column=Column(BigInteger, nullable=False, server_default="0"))  # estimé
    params_json: str = "{}"  # paramètres du moteur au moment du devis (rejouable)
    transfer_code: str = ""  # renseigné quand le devis est consommé
    status: str = Field(default="open", index=True)  # open | used | expired
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime


class MoneyAgent(SQLModel, table=True):
    """Agent H-Money d'un pays : contrôle les transactions de son pays et, si autorisé, fixe le taux de sa devise."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    country: str = Field(index=True)
    can_set_rates: bool = False
    can_review: bool = True
    active: bool = True
    assigned_by: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MoneyAudit(SQLModel, table=True):
    """Journal : qui a fait quoi (taux, signalements, affectations d'agents)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    actor_id: int = Field(foreign_key="user.id", index=True)
    action: str = Field(index=True)
    target: str = ""
    detail: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MoneyRate(SQLModel, table=True):
    """Taux par sens (ZM→CD, CD→ZM) : « envoi » (opération Envoyer) et « retrait » (opération Demander : le bénéficiaire retire).
    Exprimés en unités de devise reçue pour 1 unité de devise payée. Vide = taux du marché (taux de change − marge)."""
    from_country: str = Field(primary_key=True, max_length=2)
    to_country: str = Field(primary_key=True, max_length=2)
    send_rate: Optional[float] = None
    withdraw_rate: Optional[float] = None
    updated_by: Optional[int] = Field(default=None, foreign_key="user.id")
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class MoneyOperatorFee(SQLModel, table=True):
    """Tarif corrigé dans l'admin pour un opérateur et un sens (in = encaissement, out = versement). Absent = valeur par défaut de pricing.py."""
    country: str = Field(primary_key=True, max_length=2)
    operator: str = Field(primary_key=True)
    direction: str = Field(primary_key=True, max_length=3)
    enabled: bool = True
    pct: float = 0.0
    tiers_json: str = "[]"  # [[borne_exclusive | null, fixe_en_devise_locale], …]
    confirmed: bool = False
    note: str = ""
    updated_by: Optional[int] = Field(default=None, foreign_key="user.id")
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class MoneySettings(SQLModel, table=True):
    """Frais et plafonds H-Money (ligne unique id=1), réglés par l'admin. Montants en USD. Absente = valeurs par défaut du code."""
    id: int = Field(default=1, primary_key=True)
    fee_pct: float = 3.0  # frais proportionnels Zambie → RDC (payeur en ZMW)
    fee_pct_cz: float = 4.0  # frais proportionnels RDC → Zambie (payeur en USD)
    margin_zc_pct: float = 1.5  # marge de change Zambie → RDC (FICTIVE, à valider)
    margin_cz_pct: float = 1.5  # marge de change RDC → Zambie (FICTIVE, à valider)
    min_fee_zmw: float = 10.0  # frais minimum quand le payeur paie en ZMW
    target_margin_pct: float = 1.0  # marge nette minimale visée APRÈS les coûts de l'agrégateur (% du montant envoyé)
    min_fee_usd: float = 0.5
    min_usd: float = 2.0
    max_usd: float = 1000.0
    daily_max_usd: float = 2000.0
    review_all: bool = True  # protection existante : chaque versement est contrôlé par un agent / l'admin ; décoché = versement automatique après collecte
    updated_by: Optional[int] = Field(default=None, foreign_key="user.id")
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Invoice(SQLModel, table=True):
    """Facture H-Money : l'émetteur la génère et l'envoie ; le client la règle en mobile money.
    Le paiement passe par une « demande » H-Money (même contrôle, mêmes frais, même séquestre)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)
    user_id: int = Field(foreign_key="user.id", index=True)  # émetteur
    client_name: str
    client_email: str = Field(default="", index=True)
    client_phone: str = ""
    client_country: str = "ZM"
    currency: str = ""
    items_json: str = "[]"  # [{label, qty, unit_price}]
    total: float = 0
    note: str = ""
    due_date: Optional[datetime] = None
    transfer_code: str = Field(default="", index=True)
    cancelled: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ServicePayment(SQLModel, table=True):
    """Registre des paiements des services H-Company (Shopping, Logement, Transport, Colis…) réglés via H-Money :
    chaque service enregistre son chiffre d'affaires (brut), sa commission (bénéfice H-Company) et la part du prestataire."""
    id: Optional[int] = Field(default=None, primary_key=True)
    service: str = Field(index=True)  # shopping | lodge | transport | colis | restaurant | tourism | …
    ref: str = Field(index=True)  # code de la commande / réservation
    payer_user_id: int = Field(foreign_key="user.id", index=True)
    payee_user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)  # vendeur, hôte, agence…
    currency: str
    gross: float = 0
    commission: float = 0
    net_to_payee: float = 0
    status: str = Field(default="held", index=True)  # held (séquestre) | released | refunded
    transfer_ref: str = ""
    note: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MoneyProviderOp(SQLModel, table=True):
    """Une opération chez le fournisseur (collecte, versement ou remboursement). Son identifiant (UUID) est ENREGISTRÉ AVANT l'appel :
    en cas de coupure, on retrouve l'opération et on l'interroge au lieu d'en créer une seconde."""
    __table_args__ = (Index("uq_op_active", "transfer_code", "kind", unique=True, sqlite_where=text("status IN ('initiated','pending','completed','unknown')"),
                            postgresql_where=text("status IN ('initiated','pending','completed','unknown')")),)
    id: str = Field(primary_key=True)  # UUID = depositId / payoutId / refundId chez le fournisseur
    transfer_code: str = Field(index=True)
    kind: str  # collect | payout | refund
    amount_minor: int = Field(sa_column=Column(BigInteger, nullable=False))
    currency: str
    country: str = ""
    operator: str = ""
    status: str = Field(default="initiated", index=True)  # initiated | pending | completed | failed | unknown
    provider_ref: str = ""
    failure_reason: str = ""
    sim_status: str = ""  # fournisseur SIMULÉ uniquement : issue décidée côté « opérateur » (completed | failed)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class MoneyEvent(SQLModel, table=True):
    """Journal des notifications (webhooks) reçues. Unique par (fournisseur, opération, statut) : un rejeu est reconnu et ignoré."""
    __table_args__ = (UniqueConstraint("provider", "op_id", "status", name="uq_money_event"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    provider: str
    op_id: str = Field(index=True)
    kind: str = ""
    status: str
    transfer_code: str = ""
    signature_ok: bool = False
    detail: str = ""  # jamais de PIN ni de secret
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MoneyIdempotency(SQLModel, table=True):
    """Clé d'idempotence d'une opération sensible : même clé + même contenu = même réponse rejouée ; même clé + contenu différent = refus."""
    __table_args__ = (UniqueConstraint("user_id", "scope", "key", name="uq_money_idem"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    scope: str
    key: str
    request_hash: str
    state: str = "processing"  # processing | done
    status_code: int = 0
    response_json: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class LedgerEntry(SQLModel, table=True):
    """Grand livre à partie double, en unités mineures entières. Chaque écriture appartient à un journal (journal_key unique par opération et
    par type : un rejeu ne double jamais les écritures) ; pour chaque journal et chaque devise, Σ débits = Σ crédits."""
    __table_args__ = (UniqueConstraint("journal_key", "account", name="uq_ledger_line"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    journal_key: str = Field(index=True)  # ex. « HM-AB12CD34:J2 »
    kind: str  # J1 collecte | J2 versement | J3a/J3b coûts | JR remboursement | RESERVE réserve
    transfer_code: str = Field(default="", index=True)
    account: str = Field(index=True)  # ex. PRV_ZMW, DUE_USD, REV_FRAIS_ZMW
    currency: str
    debit_minor: int = Field(default=0, sa_column=Column(BigInteger, nullable=False, server_default="0"))
    credit_minor: int = Field(default=0, sa_column=Column(BigInteger, nullable=False, server_default="0"))
    memo: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ReserveHold(SQLModel, table=True):
    """Réserve bloquée pour un versement à venir (montant + coût estimé + marge de sécurité). Libérée quand le versement se termine ou échoue."""
    id: Optional[int] = Field(default=None, primary_key=True)
    transfer_code: str = Field(index=True, unique=True)
    currency: str = Field(index=True)
    hold_minor: int = Field(sa_column=Column(BigInteger, nullable=False))
    status: str = Field(default="active", index=True)  # active | released
    created_at: datetime = Field(default_factory=datetime.utcnow)
    released_at: Optional[datetime] = None


class MoneyReserve(SQLModel, table=True):
    """Seuil minimal de disponibilité par devise : en dessous, les nouvelles opérations vers cette devise sont mises en pause."""
    currency: str = Field(primary_key=True)
    floor_minor: int = Field(default=0, sa_column=Column(BigInteger, nullable=False, server_default="0"))
    updated_by: Optional[int] = Field(default=None, foreign_key="user.id")
    updated_at: datetime = Field(default_factory=datetime.utcnow)
