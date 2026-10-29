from sqlmodel import Session, create_engine

from app.config import settings

# `check_same_thread` n'est nécessaire que pour SQLite ; ignoré par Postgres.
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

# pool_pre_ping : teste la connexion avant usage (Render/Postgres coupent les
# connexions inactives -> sinon 1re requête en erreur ou très lente).
engine = create_engine(
    settings.database_url, echo=False, connect_args=connect_args,
    pool_pre_ping=True, pool_recycle=300,
)


def get_session():
    with Session(engine) as session:
        yield session
