"""Reprise unique des comptes de l'ancien service auth (base séparée) vers les tables `authuser` / `authotp`.

Activée par la variable d'environnement AUTH_LEGACY_DATABASE_URL (URL de l'ancienne base auth).
Idempotente : ne fait rien si `authuser` contient déjà des lignes. Les identifiants sont conservés
(ce sont les `uid` des jetons et de `User.auth_uid`), donc personne n'est déconnecté ni dupliqué."""
import logging
from datetime import datetime

from sqlalchemy import create_engine, text
from sqlmodel import Session, select, func

from app.auth_core.models import AuthUser

logger = logging.getLogger("hcompany.auth_import")

COLS = ("id", "email", "phone", "hashed_password", "google_id", "full_name", "is_verified", "is_active", "created_at")


def import_legacy_users(session: Session, source_url: str) -> int:
    if session.exec(select(func.count(AuthUser.id))).one():
        return 0
    src = create_engine(source_url)
    with src.connect() as conn:
        rows = conn.execute(text(f"SELECT {', '.join(COLS)} FROM \"user\" ORDER BY id")).mappings().all()
    for r in rows:
        data = {c: r[c] for c in COLS}
        if isinstance(data["created_at"], str):  # SQLite renvoie du texte ; PostgreSQL, un datetime
            data["created_at"] = datetime.fromisoformat(data["created_at"])
        data["is_verified"], data["is_active"] = bool(data["is_verified"]), bool(data["is_active"])
        session.add(AuthUser(**data))
    session.commit()
    # PostgreSQL : les insertions avec id explicite n'avancent pas la séquence
    if session.bind.dialect.name == "postgresql" and rows:
        session.execute(text("SELECT setval(pg_get_serial_sequence('authuser', 'id'), (SELECT MAX(id) FROM authuser))"))
        session.commit()
    logger.warning("Comptes auth repris depuis l'ancienne base : %d", len(rows))
    return len(rows)
