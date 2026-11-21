"""Garde-fous des tests PostgreSQL destructifs (tests/pg_safety.py) — sans base : refus testés en pur Python.
Le dernier test (restauration des variables d'environnement après une vraie exécution) a besoin d'un PostgreSQL de test."""
import os
import subprocess
import sys

import pytest

from tests import pg_safety as S

OK = "postgresql://postgres@127.0.0.1:54331/hfood_test_a1"
BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def refuse(url, env=None, match=None):
    with pytest.raises(S.PgSafetyError, match=match):
        S.check_test_url(url, environ=env or {})


def test_accepts_local_test_database():
    t = S.check_test_url(OK, environ={})
    assert (t.host, t.port, t.database) == ("127.0.0.1", 54331, "hfood_test_a1")
    for h in ("localhost", "[::1]"):
        S.check_test_url(f"postgresql://u:p@{h}/hfood_test_x", environ={})


def test_refuses_empty_or_invalid_or_non_postgres():
    refuse("", match="vide")
    refuse("pas une url", match="valide")
    refuse("sqlite:///x.db", match="PostgreSQL")
    refuse("mysql://u@127.0.0.1/hfood_test_a", match="PostgreSQL")


@pytest.mark.parametrize("db", ["hfood", "hfood_a1", "postgres", "prod", "hfood_test_", "hfood_test_A", "test_hfood", "hfood_test_a;drop", "hfood_testa", "supabase"])
def test_refuses_unauthorized_database_names(db):
    refuse(f"postgresql://u@127.0.0.1/{db}", match="Nom de base")


def test_refuses_missing_database_name():
    refuse("postgresql://u@127.0.0.1", match="Nom de base")


@pytest.mark.parametrize("host", ["db.abcdefg.supabase.co", "aws-0-eu.pooler.supabase.com", "dpg-123.oregon-postgres.render.com", "x.onrender.com", "ep-1.neon.tech", "db.hcompany.com", "mydb.rds.amazonaws.com", "10.0.0.5-prod"])
def test_refuses_known_production_hosts_even_when_explicitly_allowed(host):
    refuse(f"postgresql://u@{host}/hfood_test_a", match="refus")
    refuse(f"postgresql://u@{host}/hfood_test_a", env={S.ENV_REMOTE: host}, match="refus")  # l'autorisation distante ne neutralise pas ce contrôle


def test_refuses_remote_host_by_default_and_requires_exact_explicit_allow():
    url = "postgresql://u@db.example.org/hfood_test_a"
    refuse(url, match="distant")
    refuse(url, env={S.ENV_REMOTE: "autre.example.org"}, match="distant")
    refuse(url, env={S.ENV_REMOTE: "1"}, match="distant")
    refuse(url, env={S.ENV_REMOTE: "*"}, match="distant")
    assert S.check_test_url(url, environ={S.ENV_REMOTE: "db.example.org"}).host == "db.example.org"


def test_remote_allow_does_not_neutralize_other_checks():
    env = {S.ENV_REMOTE: "db.example.org"}
    refuse("postgresql://u@db.example.org/hfood_prod", env=env, match="Nom de base")           # nom de base
    refuse("postgresql://u@db.example.org/hfood_test_a", env={**env, "DATABASE_URL": "postgresql://z@db.example.org/hfood_test_a"}, match="DATABASE_URL")  # = DATABASE_URL


def test_refuses_url_equal_to_database_url():
    refuse(OK, env={"DATABASE_URL": OK}, match="DATABASE_URL")
    refuse(OK, env={"DATABASE_URL": "postgresql://autre:mdp@localhost:54331/hfood_test_a1"}, match="DATABASE_URL")  # alias d'hôte, autre identifiant
    refuse("postgresql://u@localhost/hfood_test_a1", env={"DATABASE_URL": "postgresql+psycopg2://x@127.0.0.1:5432/hfood_test_a1"}, match="DATABASE_URL")  # port 5432 par défaut
    S.check_test_url(OK, environ={"DATABASE_URL": "sqlite:///./hcompany.db"})  # autre base : accepté
    S.check_test_url(OK, environ={"DATABASE_URL": "postgresql://x@127.0.0.1:54331/hfood_dev"})  # même serveur, autre base : accepté


@pytest.mark.parametrize("q", ["hostaddr=10.1.1.1", "options=-csearch_path%3Dpublic", "service=prod", "target_session_attrs=any"])
def test_refuses_hijacking_query_parameters(q):
    refuse(f"{OK}?{q}", match="Paramètres")


def test_confirmation_is_required_and_exact():
    t = S.check_test_url(OK, environ={})
    with pytest.raises(S.PgSafetyError, match="Confirmation"):
        S.require_confirmation(t, environ={})
    with pytest.raises(S.PgSafetyError, match="Confirmation"):
        S.require_confirmation(t, environ={S.ENV_CONFIRM: "oui"})
    with pytest.raises(S.PgSafetyError):
        S.require_confirmation(t, environ={S.ENV_CONFIRM: "detruire-schema-test:autre_base"})
    S.require_confirmation(t, environ={S.ENV_CONFIRM: "detruire-schema-test:hfood_test_a1"})


def test_schema_isolation_names_and_public_can_never_be_dropped():
    n = S.new_schema_name()
    assert S.SCHEMA_RE.match(n) and n != S.new_schema_name()
    for bad in ("public", "PUBLIC", "hfood", "hfood_a1_", "hfood_a1_ZZZZZZZZ", 'hfood_a1_00000000"; DROP SCHEMA public', "pg_catalog", "other"):
        with pytest.raises(S.PgSafetyError):
            S.check_schema(bad)
        with pytest.raises(S.PgSafetyError):
            S.drop_schema(object(), bad)  # refusé AVANT toute utilisation de la connexion
        with pytest.raises(S.PgSafetyError):
            S.create_schema(object(), bad)


def test_scoped_url_forces_search_path_to_test_schema():
    t = S.check_test_url(OK, environ={})
    n = S.new_schema_name()
    u = S.scoped_url(t, n)
    assert u == f"postgresql://postgres@127.0.0.1:54331/hfood_test_a1?options=-csearch_path={n}" and "%" not in u
    from sqlalchemy.engine import make_url
    assert make_url(u).query["options"] == f"-csearch_path={n}"
    assert S.scoped_url(S.check_test_url(OK + "?sslmode=disable", environ={}), n).count("?") == 1
    with pytest.raises(S.PgSafetyError):
        S.scoped_url(t, "public")


def test_env_restore_helper_restores_set_changed_and_absent():
    env = {"A": "1"}
    r = S.EnvRestore("A", "B", environ=env)
    env["A"] = "2"
    env["B"] = "x"
    r.restore()
    assert env == {"A": "1"}


@pytest.mark.skipif(not os.environ.get(S.ENV_URL), reason="nécessite HFOOD_TEST_PG_URL (PostgreSQL de test)")
def test_environment_variables_restored_after_a_real_pg_run():
    """Exécute VRAIMENT le test PG dans un sous-processus-pytest puis vérifie DATABASE_URL / ENVIRONMENT après coup."""
    code = (
        "import os, sys, pytest\n"
        "os.environ['DATABASE_URL']='sqlite:///./sentinelle.db'; os.environ.pop('ENVIRONMENT', None)\n"
        "rc = pytest.main(['tests/test_hfood_a1_pg.py','-q','-p','no:cacheprovider','-k','isolation','-W','ignore'])\n"
        "print('RC', int(rc)); print('DB', os.environ.get('DATABASE_URL')); print('ENV', os.environ.get('ENVIRONMENT'))\n"
    )
    # DATABASE_URL (sqlite) ne peut pas désigner la base de test : la comparaison l'accepte, la sentinelle doit revenir intacte.
    r = subprocess.run([sys.executable, "-B", "-c", code], cwd=BACKEND, capture_output=True, text=True, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
    out = r.stdout
    assert "RC 0" in out, out[-1500:] + r.stderr[-1500:]
    assert "DB sqlite:///./sentinelle.db" in out and "ENV None" in out, out[-500:]


def test_pg_test_fails_safely_when_a_condition_is_violated():
    """Variable définie mais dangereuse → le test PG ÉCHOUE (collection en erreur), il n'est ni ignoré ni exécuté."""
    cases = [
        ({"HFOOD_TEST_PG_URL": "postgresql://postgres@db.supabase.co/postgres"}, "Nom de base"),
        ({"HFOOD_TEST_PG_URL": "postgresql://postgres@db.supabase.co/hfood_test_a"}, "refusé"),
        ({"HFOOD_TEST_PG_URL": OK}, "Confirmation"),  # confirmation absente
    ]
    for extra, needle in cases:
        env = {k: v for k, v in os.environ.items() if not k.startswith("HFOOD_TEST_PG") and k != "DATABASE_URL"}
        env.update(extra)
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        r = subprocess.run([sys.executable, "-B", "-m", "pytest", "tests/test_hfood_a1_pg.py", "-q", "-p", "no:cacheprovider", "-W", "ignore"], cwd=BACKEND, capture_output=True, text=True, env=env)
        assert r.returncode != 0 and needle in r.stdout + r.stderr, (extra, r.stdout[-800:])
        assert "1 error" in r.stdout and "passed" not in r.stdout, r.stdout[-400:]  # erreur, jamais « skipped » ni « passed »


# ───────── outil de tests concurrents (tests/threads_util.py) ─────────
def test_run_parallel_returns_results_in_order():
    from tests.threads_util import run_parallel
    assert run_parallel([lambda i=i: i * 2 for i in range(6)], timeout=10) == [0, 2, 4, 6, 8, 10]


def test_run_parallel_captures_thread_errors_explicitly():
    """Un thread qui plante ne disparaît jamais silencieusement : le test échoue en citant l'erreur."""
    from tests.threads_util import run_parallel

    def bad():
        raise RuntimeError("boum")

    with pytest.raises(AssertionError, match="boum"):
        run_parallel([lambda: 1, bad, lambda: 3], timeout=10)


def test_run_parallel_has_a_maximum_delay_for_blocked_threads():
    import time
    from tests.threads_util import run_parallel
    t0 = time.monotonic()
    with pytest.raises(AssertionError, match="bloqué"):
        run_parallel([lambda: time.sleep(5), lambda: 1], timeout=0.5)
    assert time.monotonic() - t0 < 3  # le test n'attend pas le thread bloqué


def test_run_parallel_barrier_timeout_does_not_hang():
    from tests.threads_util import run_parallel
    with pytest.raises(AssertionError):
        run_parallel([lambda: (_ for _ in ()).throw(ValueError("x"))] + [lambda: 1] * 3, timeout=5)


# ───────── test_hfood_a1.py (SQLite) ne doit jamais tourner contre une vraie base ─────────
@pytest.mark.parametrize("url,ok", [
    ("postgresql://u:p@db.example.org:5432/hcompany", False),                  # PostgreSQL « réel » : refusé
    ("postgresql://postgres@127.0.0.1:5432/hfood_prod", False),                # local mais pas la base de test validée
    ("sqlite:////var/lib/hcompany/real.db", False),                            # SQLite hors dossier temporaire : refusé
    ("sqlite:///./hcompany.db", False),                                        # base de dev du projet : refusé
    (f"sqlite:///{__import__('tempfile').gettempdir()}/jetable_a1.db", True),  # SQLite jetable : accepté
])
def test_sqlite_a1_module_refuses_a_real_database_url(url, ok):
    env = {k: v for k, v in os.environ.items() if not k.startswith("HFOOD_TEST_PG")}
    env.update({"DATABASE_URL": url, "PYTHONDONTWRITEBYTECODE": "1"})
    r = subprocess.run([sys.executable, "-B", "-c", "import tests.test_hfood_a1"], cwd=BACKEND, capture_output=True, text=True, env=env)
    if ok:
        assert r.returncode == 0, r.stderr[-800:]
    else:
        assert r.returncode != 0 and "refuse de tourner" in r.stderr, r.stderr[-800:]


# ───────── isolation des réglages globaux entre modules de tests ─────────
def test_a1_sqlite_module_restores_globals_and_never_touches_project_uploads():
    """Après l'exécution complète de test_hfood_a1.py : limiteur global, dossier d'uploads et plafonds sont revenus à
    leur valeur d'origine, et le vrai dossier `uploads/` du projet n'a reçu aucun fichier."""
    code = (
        "import os, sys, pytest\n"
        "from pathlib import Path\n"
        "import tempfile; os.environ['DATABASE_URL'] = 'sqlite:///' + tempfile.mkdtemp() + '/iso.db'\n"
        "from app.services.rate_limit import limiter as shared\n"
        "from app.restaurant.routers import owner as o\n"
        "from app.restaurant import services as svc, limits as L\n"
        "up = Path('uploads/restaurant'); before = sorted(os.listdir(up)) if up.exists() else None  # après l'import (qui crée le dossier vide)\n"
        "orig = (shared.enabled, o.UPLOAD_ROOT, o.MAX_RESTAURANTS, svc.MAX_ACTIVE_PER_USER, L.limiter.enabled, L.RATE_RESERVE)\n"
        "rc = pytest.main(['tests/test_hfood_a1.py','-q','-p','no:cacheprovider','-W','ignore'])\n"
        "after = (shared.enabled, o.UPLOAD_ROOT, o.MAX_RESTAURANTS, svc.MAX_ACTIVE_PER_USER, L.limiter.enabled, L.RATE_RESERVE)\n"
        "print('RC', int(rc)); print('SAME', orig == after, orig, after)\n"
        "print('UPLOADS_SAME', before == (sorted(os.listdir(up)) if up.exists() else None))\n"
    )
    env = {k: v for k, v in os.environ.items() if not k.startswith("HFOOD_TEST_PG") and k != "DATABASE_URL"}
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    r = subprocess.run([sys.executable, "-B", "-c", code], cwd=BACKEND, capture_output=True, text=True, env=env)
    assert "RC 0" in r.stdout, r.stdout[-1500:] + r.stderr[-800:]
    assert "SAME True" in r.stdout, r.stdout[-600:]
    assert "UPLOADS_SAME True" in r.stdout, r.stdout[-300:]
