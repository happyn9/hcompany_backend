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
