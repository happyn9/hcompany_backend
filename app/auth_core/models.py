"""Tables du compte central, désormais hébergées dans la base H-Company.

Noms distincts de `User`/`OTPCode` (profil local, rôles…) : `AuthUser` porte l'identité
(e-mail, mot de passe, Google) ; son `id` est le `uid` des jetons, relié à `User.auth_uid`."""
from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class AuthUser(SQLModel, table=True):
    __tablename__ = "authuser"
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    phone: Optional[str] = Field(default=None, index=True)
    hashed_password: Optional[str] = None  # absent pour un compte créé uniquement via Google
    google_id: Optional[str] = Field(default=None, unique=True, index=True)
    full_name: Optional[str] = None
    is_verified: bool = Field(default=False)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AuthOTP(SQLModel, table=True):
    __tablename__ = "authotp"
    id: Optional[int] = Field(default=None, primary_key=True)
    identifier: str = Field(index=True)
    purpose: str  # login | register | reset_password
    code_hash: str
    attempts: int = Field(default=0)
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
