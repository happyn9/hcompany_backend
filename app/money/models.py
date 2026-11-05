"""H-Money : envoyer ou demander de l'argent entre la Zambie et la RD Congo.
L'argent ne traverse pas la frontière côté H-Company : on encaisse dans le pays du payeur,
on verse dans le pays du bénéficiaire, via un agrégateur (le règlement entre pays est le sien)."""
from datetime import datetime
from typing import Optional

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
    fee_pct: float = 3.0
    target_margin_pct: float = 1.0  # marge nette minimale visée APRÈS les coûts de l'agrégateur (% du montant envoyé)
    min_fee_usd: float = 0.5
    min_usd: float = 2.0
    max_usd: float = 1000.0
    daily_max_usd: float = 2000.0
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
