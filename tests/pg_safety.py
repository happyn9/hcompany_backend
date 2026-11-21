"""Garde-fous CUMULATIFS des tests PostgreSQL destructifs de Hfood (Phase A1).

Les tests PostgreSQL créent puis suppriment un schéma. Rien ne doit pouvoir les faire toucher une base réelle.
Toutes les conditions ci-dessous doivent être vraies ; la première qui échoue lève `PgSafetyError` AVANT toute
connexion à la base (le test échoue, il n'est jamais ignoré ni exécuté « à moitié ») :

  1. URL PostgreSQL valide, sans paramètre de connexion détourné (`hostaddr`, `service`, `options`…).
  2. Nom de base explicitement dédié aux tests : `hfood_test_<lettres/chiffres/_>`.
  3. Hôte local par défaut (localhost, 127.0.0.1, ::1, socket Unix). Un hôte distant n'est accepté que si
     `HFOOD_TEST_PG_ALLOW_REMOTE_HOST` contient EXACTEMENT cet hôte — et toutes les autres conditions restent exigées.
  4. Refus des hébergeurs/hôtes de production connus (liste ci-dessous), même si l'hôte distant est « autorisé ».
  5. Refus si l'URL désigne la même base que `DATABASE_URL` (variable d'environnement de l'application).
  6. Confirmation explicite : `HFOOD_TEST_PG_CONFIRM` doit valoir `detruire-schema-test:<nom_de_base>`.
  7. Schéma de test isolé `hfood_a1_<8 hex>` créé par le test lui-même (search_path forcé à ce schéma) ;
     seul un schéma de ce motif peut être supprimé ; `public` n'est jamais supprimé ni recréé.
  8. Les variables d'environnement modifiées par le test sont restaurées à la fin.

Ce module ne lit jamais de fichier `.env` et n'affiche jamais de mot de passe."""
from __future__ import annotations

import os
import re
import secrets
from dataclasses import dataclass

from sqlalchemy.engine import URL, make_url

ENV_URL = "HFOOD_TEST_PG_URL"
ENV_CONFIRM = "HFOOD_TEST_PG_CONFIRM"
ENV_REMOTE = "HFOOD_TEST_PG_ALLOW_REMOTE_HOST"

DB_NAME_RE = re.compile(r"^hfood_test_[a-z0-9_]{1,40}$")
SCHEMA_RE = re.compile(r"^hfood_a1_[0-9a-f]{8}$")
SCHEMA_PREFIX = "hfood_a1_"
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
# Fragments d'hôtes d'hébergeurs / de production : refusés dans tous les cas.
PROD_HOST_MARKERS = (
    "supabase", "render.com", "onrender", "neon.tech", "railway", "amazonaws", "rds.", "azure", "googleapis",
    "cloud.google", "digitalocean", "heroku", "elephantsql", "aiven", "cockroach", "vercel", "planetscale",
    "hcompany", "prod",
)
# Paramètres d'URL autorisés : tout le reste (hostaddr, service, options, target_session_attrs…) est refusé.
ALLOWED_QUERY = {"sslmode", "connect_timeout", "application_name", "host"}


class PgSafetyError(RuntimeError):
    """Une condition de sécurité du test PostgreSQL n'est pas remplie : le test ne doit PAS s'exécuter."""


@dataclass(frozen=True)
class SafeTarget:
    url: URL
    host: str
    port: int
    database: str


def _host_of(url: URL) -> str:
    return (url.host or str(url.query.get("host", "")) or "").strip().lower()


def _norm_host(h: str) -> str:
    return "localhost" if h in LOCAL_HOSTS else h


def _is_local(h: str) -> bool:
    return h in LOCAL_HOSTS or h.startswith("/")  # chemin de socket Unix


def _same_db(a: URL, b: URL) -> bool:
    return (
        _norm_host(_host_of(a)) == _norm_host(_host_of(b))
        and (a.port or 5432) == (b.port or 5432)
        and (a.database or "") == (b.database or "")
    )


def check_test_url(raw: str, *, environ: dict | None = None) -> SafeTarget:
    """Valide `HFOOD_TEST_PG_URL`. `environ` = environnement AVANT toute modification par le test."""
    env = os.environ if environ is None else environ
    raw = (raw or "").strip()
    if not raw:
        raise PgSafetyError(f"{ENV_URL} est vide.")
    try:
        url = make_url(raw)
    except Exception as e:  # noqa: BLE001
        raise PgSafetyError(f"{ENV_URL} n'est pas une URL de base valide ({type(e).__name__}).") from None
    if not url.drivername.startswith(("postgresql", "postgres")):
        raise PgSafetyError("Seul PostgreSQL est accepté pour ce test.")
    bad = sorted(set(url.query) - ALLOWED_QUERY)
    if bad:
        raise PgSafetyError(f"Paramètres d'URL non autorisés : {', '.join(bad)}.")
    db = url.database or ""
    if not DB_NAME_RE.match(db):
        raise PgSafetyError(f"Nom de base refusé « {db} » : il doit correspondre à hfood_test_<lettres/chiffres/_>.")
    host = _host_of(url)
    if not host:
        raise PgSafetyError("Hôte absent : indiquez 127.0.0.1, localhost ou un chemin de socket.")
    if any(m in host for m in PROD_HOST_MARKERS):
        raise PgSafetyError(f"Hôte refusé « {host} » : hébergeur / production connu.")
    if not _is_local(host) and env.get(ENV_REMOTE, "").strip().lower() != host:
        raise PgSafetyError(f"Hôte distant « {host} » refusé : {ENV_REMOTE} doit contenir exactement cet hôte.")
    app_url = (env.get("DATABASE_URL") or "").strip()
    if app_url:
        try:
            same = _same_db(url, make_url(app_url))
        except Exception:  # noqa: BLE001
            same = False  # DATABASE_URL non PostgreSQL / non analysable : ne peut pas désigner cette base
        if same or app_url == raw:
            raise PgSafetyError("L'URL de test désigne la même base que DATABASE_URL : refusé.")
    return SafeTarget(url=url, host=host, port=url.port or 5432, database=db)


def require_confirmation(target: SafeTarget, *, environ: dict | None = None) -> None:
    env = os.environ if environ is None else environ
    expected = f"detruire-schema-test:{target.database}"
    if env.get(ENV_CONFIRM, "").strip() != expected:
        raise PgSafetyError(
            f"Confirmation explicite manquante : définissez {ENV_CONFIRM}={expected} "
            "(le test crée puis SUPPRIME un schéma `hfood_a1_*` dans cette base)."
        )


def new_schema_name() -> str:
    return SCHEMA_PREFIX + secrets.token_hex(4)


def check_schema(name: str) -> str:
    if not SCHEMA_RE.match(name or ""):
        raise PgSafetyError(f"Schéma refusé « {name} » : seul hfood_a1_<8 hex> peut être créé/supprimé.")
    return name


def scoped_url(target: SafeTarget, schema: str) -> str:
    """URL dont le search_path est FORCÉ au schéma de test (tout objet créé sans préfixe y atterrit)."""
    check_schema(schema)
    base = target.url.render_as_string(hide_password=False)
    # `=` volontairement NON encodé : alembic/env.py passe l'URL à configparser, qui refuse le caractère « % ».
    return f"{base}{'&' if '?' in base else '?'}options=-csearch_path={schema}"


def create_schema(engine, schema: str) -> None:
    import sqlalchemy as sa
    check_schema(schema)
    with engine.begin() as cx:
        cx.execute(sa.text(f'CREATE SCHEMA "{schema}"'))


def drop_schema(engine, schema: str) -> None:
    """Supprime UNIQUEMENT un schéma de test (motif strict). `public` est impossible par construction."""
    import sqlalchemy as sa
    check_schema(schema)
    with engine.begin() as cx:
        cx.execute(sa.text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))


class EnvRestore:
    """Mémorise des variables d'environnement et les remet dans leur état d'origine (y compris « absente »)."""

    def __init__(self, *names: str, environ: dict | None = None):
        self.environ = os.environ if environ is None else environ
        self.saved = {n: self.environ.get(n) for n in names}

    def restore(self) -> None:
        for n, v in self.saved.items():
            if v is None:
                self.environ.pop(n, None)
            else:
                self.environ[n] = v
