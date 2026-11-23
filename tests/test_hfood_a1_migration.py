"""HFood A1 — migration `d1a2b3c4e5f6` : détection stricte des chevauchements et des données invalides.

Rien n'est corrigé, aucun gagnant n'est choisi, aucune ligne n'est modifiée ; en cas d'anomalie la migration s'arrête
sans AUCUNE modification (colonnes, extension, contrainte, alembic_version) ; après résolution elle reprend.

  * partie « pure » (toujours exécutée) : `compute_range` / `analyse` ;
  * bout en bout sur SQLite (toujours) et sur un VRAI PostgreSQL jetable (si HFOOD_TEST_PG_URL est défini : mêmes
    garde-fous cumulatifs que test_hfood_a1_pg.py, voir tests/pg_safety.py — schéma isolé `hfood_a1_<hex>`).
Ce fichier ne modifie jamais os.environ : l'URL est transmise explicitement au sous-processus alembic."""
import importlib.util
import os
import subprocess
import sys
import tempfile
from dataclasses import replace
from datetime import datetime

import pytest
import sqlalchemy as sa

from tests import pg_safety as safety

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARENT, HEAD = "c9d0e1f2a3b4", "d1a2b3c4e5f6"   # A1.1 ; la tête du dépôt est désormais A2 (`e2a2b3c4d5f6`)
A2_HEAD = "e2a2b3c4d5f6"
PG = os.environ.get(safety.ENV_URL, "").strip()
TARGET = None
if PG:  # variable définie ⇒ garde-fous exigés (échec sûr : exception à la collecte, jamais d'exécution « à moitié »)
    _env = dict(os.environ)
    TARGET = safety.check_test_url(PG, environ=_env)
    safety.require_confirmation(TARGET, environ=_env)

_spec = importlib.util.spec_from_file_location("mig_d1a2", os.path.join(BACKEND, "alembic", "versions", "d1a2b3c4e5f6_hfood_a1_reservation_no_overlap.py"))
mig = importlib.util.module_from_spec(_spec)
sys.path.insert(0, os.path.join(BACKEND, "alembic"))
_spec.loader.exec_module(mig)


# ───────────────────────── partie pure ─────────────────────────
def test_compute_range_valid_cases():
    s, e = mig.compute_range("2026-11-20", "19:00", 90)
    assert (s, e) == (datetime(2026, 11, 20, 19), datetime(2026, 11, 20, 20, 30))
    assert mig.compute_range("2026-11-20", "9:05", "45")[0] == datetime(2026, 11, 20, 9, 5)  # texte entier (SQLite) lu tel quel
    assert mig.compute_range("2026-11-20", "23:30", 90)[1] == datetime(2026, 11, 21, 1, 0)  # passe minuit : valide


@pytest.mark.parametrize("day,time,dur,needle", [
    ("2026-11-20", "19:00", None, "NULL"),
    ("2026-11-20", "19:00", 0, "nulle"),
    ("2026-11-20", "19:00", "0", "nulle"),
    ("2026-11-20", "19:00", -30, "négative"),
    ("2026-11-20", "19:00", "-5", "négative"),
    ("2026-11-20", "19:00", 1.5, "non entière"),
    ("2026-11-20", "19:00", "abc", "non entière"),
    ("2026-11-20", "19:00", True, "invalide"),
    ("2026-11-20", "25:00", 90, "heure"),
    ("2026-11-20", "24:00", 90, "heure"),
    ("2026-11-20", "19:60", 90, "heure"),
    ("2026-11-20", "abc", 90, "heure"),
    ("2026-11-20", "", 90, "heure"),
    ("2026-11-20", None, 90, "heure"),
    ("2026-11-20", "19h00", 90, "heure"),
    ("2026-13-45", "19:00", 90, "date"),
    ("infinity", "19:00", 90, "date"),
    ("", "19:00", 90, "date"),
    (None, "19:00", 90, "date"),
    ("9999-12-31", "23:00", 90, "bornes"),
    ("2026-11-20", "19:00", 10 ** 12, "bornes"),
])
def test_compute_range_rejects_without_correcting(day, time, dur, needle):
    with pytest.raises(ValueError, match=needle):
        mig.compute_range(day, time, dur)


def _r(i, table, day, time, dur, status):
    return {"id": i, "code": f"R{i}", "table_id": table, "status": status, "day": day, "time": time, "dur": dur, "start_at": None, "end_at": None}


def test_analyse_conflicts_and_valid_cases():
    rows = [
        _r(1, 1, "2026-11-20", "19:00", 90, "pending"),
        _r(2, 1, "2026-11-20", "20:00", 90, "confirmed"),    # chevauche 1
        _r(3, 1, "2026-11-20", "20:30", 90, "seated"),       # contigu à 1, chevauche 2
        _r(4, 2, "2026-11-20", "19:00", 90, "confirmed"),    # autre table
        _r(5, 1, "2026-11-20", "19:00", 90, "cancelled"),    # non bloquant
        _r(6, None, "2026-11-20", "19:00", 90, "pending"),   # sans table
        _r(7, 1, "2026-11-21", "19:00", 90, "confirmed"),    # autre jour
    ]
    to_write, invalid, conflicts = mig.analyse(rows)
    assert not invalid and len(to_write) == 7
    assert {(a["id"], b["id"]) for a, b, *_ in conflicts} == {(1, 2), (2, 3)}


def test_analyse_partial_inverted_and_inconsistent_existing_ranges():
    def dated(i, start, end, **k):
        r = _r(i, 1 + i, "2026-11-20", k.get("time", "19:00"), 90, "confirmed")
        r["start_at"], r["end_at"] = start, end
        return r
    ok = (datetime(2026, 11, 20, 19), datetime(2026, 11, 20, 20, 30))
    rows = [dated(1, *ok), dated(2, ok[0], None), dated(3, None, ok[1]), dated(4, ok[1], ok[0]), dated(5, ok[0], ok[0]),
            dated(6, datetime(2026, 11, 20, 10), datetime(2026, 11, 20, 11)), dated(7, "pas une date", "x"), dated(8, *ok, time="25:00")]
    to_write, invalid, _ = mig.analyse(rows)
    why = {r["id"]: w for r, w in invalid}
    assert set(why) == {2, 3, 4, 5, 6, 7, 8} and to_write == {}
    assert "partielle" in why[2] and "partielle" in why[3] and "invalide" in why[4] and "invalide" in why[5]
    assert "incohérente" in why[6] and "illisible" in why[7] and "invalides" in why[8]


def test_analyse_never_picks_a_winner_nor_defaults():
    rows = [_r(1, 1, "2026-11-20", "19:00", None, "confirmed"), _r(2, 1, "2026-11-20", "19:00", 0, "confirmed"), _r(3, 1, "2026-11-20", "19:00", 90, "pending")]
    to_write, invalid, conflicts = mig.analyse(rows)
    assert sorted(r["id"] for r, _ in invalid) == [1, 2] and set(to_write) == {3} and conflicts == []


# ───────────────────── bout en bout (SQLite + PostgreSQL) ─────────────────────
class Db:
    def __init__(self, kind):
        self.kind = kind
        self.pg = kind == "pg"
        self.tmp = None
        self.schema = None
        self.schema_created = False   # vrai seulement si NOTRE CREATE SCHEMA a réussi
        self.ext_preexisting = False  # btree_gist existait déjà (hors de notre schéma) : ne jamais le supprimer
        if self.pg:
            self.schema = safety.new_schema_name()
            self.url = safety.scoped_url(TARGET, self.schema)
        else:
            self.tmp = tempfile.mkdtemp(prefix="hfood_mig_")
            self.url = f"sqlite:///{self.tmp}/mig.db"
        self.engine = sa.create_engine(self.url)

    def create(self):
        if self.pg:
            with self.engine.connect() as cx:
                self.ext_preexisting = bool(cx.execute(sa.text("SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'")).first())
            safety.create_schema(self.engine, self.schema)
            self.schema_created = True

    def ext_is_ours(self):
        """btree_gist créé par la migration DANS notre schéma (donc supprimable) — jamais une extension préexistante."""
        with self.engine.connect() as cx:
            return bool(cx.execute(sa.text("SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'btree_gist' AND n.nspname = :s"), {"s": self.schema}).first())

    def alembic(self, *args, url=None):
        env = {**os.environ, "DATABASE_URL": url or self.url, "PYTHONDONTWRITEBYTECODE": "1"}
        return subprocess.run([sys.executable, "-B", "-m", "alembic", *args], cwd=BACKEND, env=env, capture_output=True, text=True)

    def up(self, rev=HEAD, **k):  # explicitement A1.1 : A2 a sa propre suite de tests de migration
        return self.alembic("upgrade", rev, **k)

    def version(self):
        with self.engine.connect() as cx:
            return cx.execute(sa.text("SELECT version_num FROM alembic_version")).scalar()

    def setup_base(self):
        r = self.up(PARENT)
        assert r.returncode == 0, r.stderr[-1500:]
        from app.models import User
        from app.restaurant.models import DiningTable, Restaurant
        from sqlmodel import Session
        with Session(self.engine) as s:
            u = User(email='m@x.com')
            s.add(u)
            s.commit()
            s.refresh(u)
            uid = u.id
            rs = Restaurant(slug="mig", owner_id=uid, name="Mig")
            # insertion en SQL limitée aux colonnes PRÉSENTES : la base est à la révision parente (avant A1 et avant A2)
            have = {c["name"] for c in sa.inspect(self.engine).get_columns("restaurant")}
            vals = {c: getattr(rs, c) for c in have if c != "id" and getattr(rs, c, None) is not None}
            s.exec(sa.text(f"INSERT INTO restaurant ({', '.join(vals)}) VALUES ({', '.join(':' + k for k in vals)})").bindparams(**vals))
            s.commit()
            rs.id = s.exec(sa.text("SELECT id FROM restaurant WHERE slug = 'mig'")).scalar()
            ts = [DiningTable(restaurant_id=rs.id, label=f"T{i}") for i in range(1, 4)]
            s.add_all(ts)
            s.commit()
            self.uid, self.rid, self.tables = uid, rs.id, [t.id for t in ts]

    def reset(self):
        """Revient à l'état « base d'avant A1 » : révision parente, aucune réservation, durée NOT NULL, pas d'extension."""
        self.engine.dispose()  # SQLite met le schéma en cache : sans cela, 2 tests échouaient en suite complète
        if self.version() != PARENT:
            r = self.alembic("downgrade", PARENT)
            assert r.returncode == 0, r.stderr[-1500:]
        with self.engine.begin() as cx:
            cx.execute(sa.text("DELETE FROM reservation"))
            if self.pg:
                cx.execute(sa.text("ALTER TABLE reservation ALTER COLUMN duration_minutes SET NOT NULL"))
        self.drop_range_columns()
        if self.pg and self.ext_is_ours():  # JAMAIS une extension qui existait avant le test
            with self.engine.begin() as cx:
                cx.execute(sa.text("DROP EXTENSION btree_gist"))

    def add_range_columns(self):
        """Simule des colonnes start_at/end_at déjà présentes (relance, ajout manuel) alors que la révision est la parente."""
        with self.engine.begin() as cx:
            for c in ("start_at", "end_at"):
                cx.execute(sa.text(f"ALTER TABLE reservation ADD COLUMN {c} {'TIMESTAMP' if self.pg else 'DATETIME'}"))

    def drop_range_columns(self):
        with self.engine.begin() as cx:
            if self.pg:
                cx.execute(sa.text("ALTER TABLE reservation DROP COLUMN IF EXISTS start_at, DROP COLUMN IF EXISTS end_at"))
            else:
                have = {r[1] for r in cx.execute(sa.text("PRAGMA table_info(reservation)"))}
                for c in ("start_at", "end_at"):
                    if c in have:
                        cx.execute(sa.text(f"ALTER TABLE reservation DROP COLUMN {c}"))

    def set_range(self, code, start, end):
        """start/end : 'YYYY-MM-DD HH:MM:SS' ou None (colonnes déjà ajoutées)."""
        cast = (lambda n: f"CAST(:{n} AS timestamp)") if self.pg else (lambda n: f":{n}")
        with self.engine.begin() as cx:
            cx.execute(sa.text(f"UPDATE reservation SET start_at = {cast('s')}, end_at = {cast('e')} WHERE code = :c"), {"s": start, "e": end, "c": code})

    def ins(self, code, t, day, time, dur, status="confirmed"):
        """t = index de table (0..2) ou None. `day` peut être invalide (ex. 'infinity')."""
        with self.engine.begin() as cx:
            cx.execute(sa.text(
                "INSERT INTO reservation (code,restaurant_id,table_id,user_id,name,phone,party_size,day,time,duration_minutes,status,note,preorder,preorder_total,restaurant_name,table_label,created_at,updated_at) "
                f"VALUES (:c,:r,:t,:u,'N','',2,{'CAST(:d AS date)' if self.pg else ':d'},:tm,:du,:st,'','[]',0,'R','T',:now,:now)"),
                {"c": code, "r": self.rid, "t": None if t is None else self.tables[t], "u": self.uid, "d": day, "tm": time, "du": dur, "st": status, "now": datetime(2026, 1, 1)})

    def snap(self):
        """Tout ce que la migration pourrait modifier : colonnes, lignes, extension, contrainte, version."""
        with self.engine.connect() as cx:
            if self.pg:
                cols = cx.execute(sa.text("SELECT column_name FROM information_schema.columns WHERE table_schema=:s AND table_name='reservation' ORDER BY 1"), {"s": self.schema}).scalars().all()
                ext = cx.execute(sa.text("SELECT count(*) FROM pg_extension WHERE extname='btree_gist'")).scalar()
                con = cx.execute(sa.text("SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE c.conname = 'reservation_no_table_overlap' AND n.nspname = :s"), {"s": self.schema}).scalar()
            else:
                cols = sorted(r[1] for r in cx.execute(sa.text("PRAGMA table_info(reservation)")))
                ext = con = 0
            rng = ", CAST(start_at AS TEXT), CAST(end_at AS TEXT)" if "start_at" in cols and "end_at" in cols else ""
            rows = [tuple(r) for r in cx.execute(sa.text(f"SELECT id, code, table_id, status, CAST(day AS TEXT), time, duration_minutes{rng} FROM reservation ORDER BY id"))]
            return cols, rows, ext, con, cx.execute(sa.text("SELECT version_num FROM alembic_version")).scalar()

    def ranges(self):
        with self.engine.connect() as cx:
            return {c: (s, e) for c, s, e in cx.execute(sa.text("SELECT code, start_at, end_at FROM reservation"))}

    def close(self):
        """Nettoyage robuste, même si l'initialisation a échoué à mi-chemin : seulement ce que NOUS avons créé."""
        try:
            self.engine.dispose()
            if self.pg and self.schema_created:
                e = sa.create_engine(safety.scoped_url(TARGET, self.schema))
                try:
                    safety.drop_schema(e, self.schema)
                finally:
                    e.dispose()
        finally:
            if self.tmp:
                import shutil
                shutil.rmtree(self.tmp, ignore_errors=True)


@pytest.fixture(scope="module", params=["sqlite", pytest.param("pg", marks=pytest.mark.skipif(not PG, reason="nécessite HFOOD_TEST_PG_URL (PostgreSQL de test)"))])
def db(request):
    d = Db(request.param)
    try:
        d.create()
        d.setup_base()
        yield d
    finally:
        d.close()


@pytest.fixture()
def clean(db):
    db.reset()
    return db


def _stops(db, *needles, cols_present=False):
    """La migration doit S'ARRÊTER, ne rien modifier, et citer chaque élément utile dans son message."""
    before = db.snap()
    r = db.up()
    assert r.returncode != 0, "la migration aurait dû s'arrêter"
    out = r.stderr + r.stdout
    for n in needles:
        assert n in out, (n, out[-2500:])
    assert db.snap() == before, "modification partielle détectée"
    assert db.version() == PARENT
    assert ("start_at" in before[0]) == cols_present  # la migration n'ajoute pas les colonnes quand elle s'arrête
    return out


def test_normal_migration(clean):
    db = clean
    db.ins("A1", 0, "2026-11-20", "19:00", 90, "confirmed")
    db.ins("A2", 0, "2026-11-20", "20:30", 90, "pending")       # contigu : fin exclusive
    db.ins("A3", 1, "2026-11-20", "19:00", 90, "confirmed")     # autre table
    db.ins("A4", 0, "2026-11-20", "19:00", 90, "cancelled")     # non bloquant : pas un conflit
    db.ins("A5", 0, "2026-11-20", "19:30", 60, "declined")
    db.ins("A6", None, "2026-11-20", "19:00", 90, "pending")    # sans table
    db.ins("A7", 0, "2026-11-20", "10:00", 45, "completed")
    db.ins("A8", 0, "2026-11-20", "23:30", 90, "seated")        # passe minuit
    before = db.snap()[1]
    r = db.up()
    assert r.returncode == 0, r.stderr[-2000:]
    assert db.version() == HEAD
    cols, rows, ext, con, _ = db.snap()
    assert {"start_at", "end_at"} <= set(cols) and [r[:7] for r in rows] == before  # lignes inchangées, rien de supprimé
    rg = db.ranges()
    assert all(s is not None and e is not None for s, e in rg.values())
    assert [str(x) for x in rg["A1"]] == ["2026-11-20 19:00:00", "2026-11-20 20:30:00"]
    assert str(rg["A8"][1]) == "2026-11-21 01:00:00"
    if db.pg:
        assert ext == 1 and con == 1


def test_two_different_tables_and_contiguous_slots_pass(clean):
    clean.ins("B1", 0, "2026-11-20", "19:00", 90, "confirmed")
    clean.ins("B2", 1, "2026-11-20", "19:00", 90, "confirmed")
    clean.ins("B3", 0, "2026-11-20", "20:30", 90, "confirmed")
    assert clean.up().returncode == 0 and clean.version() == HEAD


def test_historical_overlap_stops_and_lists_everything(clean):
    db = clean
    db.ins("OV-1", 0, "2026-11-20", "19:00", 90, "confirmed")
    db.ins("OV-2", 0, "2026-11-20", "20:00", 90, "pending")
    db.ins("OK-3", 1, "2026-11-20", "19:00", 90, "confirmed")
    t = db.tables[0]
    out = _stops(db, "INTERROMPUE", "CHEVAUCHEMENT", "OV-1", "OV-2", f"table_id={t}", "jour=2026-11-20", "heure=19:00", "heure=20:00", "statut=confirmed", "statut=pending", "aucun gagnant")
    assert "OK-3" not in out  # la ligne saine n'est pas accusée


@pytest.mark.parametrize("a,b", [("pending", "confirmed"), ("confirmed", "pending"), ("confirmed", "confirmed"), ("seated", "pending"), ("pending", "pending")])
def test_blocking_status_pairs_all_stop_without_choosing_a_winner(clean, a, b):
    clean.ins("P-1", 0, "2026-11-20", "19:00", 90, a)
    clean.ins("P-2", 0, "2026-11-20", "19:30", 90, b)
    _stops(clean, "P-1", "P-2", f"statut={a}", f"statut={b}")
    # statuts intacts : aucun gagnant désigné, aucune annulation automatique
    assert [r[3] for r in clean.snap()[1]] == [a, b]


@pytest.mark.parametrize("dur,needle", [(-30, "négative"), (0, "nulle")])
def test_invalid_duration_stops(clean, dur, needle):
    clean.ins("D-1", 0, "2026-11-20", "19:00", dur, "confirmed")
    clean.ins("D-2", 1, "2026-11-20", "19:00", 90, "confirmed")
    _stops(clean, "DONNÉES INVALIDES", "D-1", needle, f"durée={dur}")


def test_invalid_duration_on_non_blocking_row_also_stops(clean):
    clean.ins("D-3", 0, "2026-11-20", "19:00", -5, "cancelled")
    _stops(clean, "D-3", "négative")


@pytest.mark.parametrize("time", ["25:00", "24:00", "19:60", "abc", ""])
def test_invalid_time_stops(clean, time):
    clean.ins("T-1", 0, "2026-11-20", time, 90, "confirmed")
    _stops(clean, "T-1", "heure invalide")


def test_invalid_dates_stop(clean):
    clean.ins("DT-1", 0, "infinity" if clean.pg else "2026-13-45", "19:00", 90, "confirmed")
    clean.ins("DT-2", 1, "9999-12-31", "23:00", 90, "confirmed")  # fin hors bornes
    _stops(clean, "DT-1", "date invalide", "DT-2", "bornes")


def test_null_duration_stops_and_is_reported(clean):
    if not clean.pg:
        pytest.skip("SQLite : la colonne est NOT NULL, NULL impossible à insérer")
    with clean.engine.begin() as cx:  # simule une base dont la colonne aurait dérivé (le modèle et la migration f3b8… la déclarent NOT NULL)
        cx.execute(sa.text("ALTER TABLE reservation ALTER COLUMN duration_minutes DROP NOT NULL"))
    clean.ins("N-1", 0, "2026-11-20", "19:00", None, "confirmed")
    _stops(clean, "N-1", "durée NULL", "règle métier")


def test_duration_column_is_not_null_in_the_normal_schema(clean):
    with clean.engine.connect() as cx:
        if clean.pg:
            nullable = cx.execute(sa.text("SELECT is_nullable FROM information_schema.columns WHERE table_schema=:s AND table_name='reservation' AND column_name='duration_minutes'"), {"s": clean.schema}).scalar()
            assert nullable == "NO"
        else:
            assert [r for r in cx.execute(sa.text("PRAGMA table_info(reservation)")) if r[1] == "duration_minutes"][0][3] == 1


def test_all_problems_reported_together(clean):
    clean.ins("Z-1", 0, "2026-11-20", "19:00", 90, "confirmed")
    clean.ins("Z-2", 0, "2026-11-20", "19:30", 90, "confirmed")
    clean.ins("Z-3", 1, "2026-11-20", "xx", 90, "confirmed")
    clean.ins("Z-4", 1, "2026-11-20", "19:00", -1, "confirmed")
    _stops(clean, "Z-1", "Z-2", "Z-3", "Z-4", "CHEVAUCHEMENT", "DONNÉES INVALIDES")


def test_failure_then_resume_after_overlap_resolution(clean):
    db = clean
    db.ins("RS-1", 0, "2026-11-20", "19:00", 90, "confirmed")
    db.ins("RS-2", 0, "2026-11-20", "20:00", 90, "pending")
    _stops(db, "RS-1", "RS-2")
    _stops(db, "RS-1", "RS-2")                       # toujours bloqué tant que rien n'est résolu
    with db.engine.begin() as cx:                    # résolution EXPLICITE par le propriétaire
        cx.execute(sa.text("UPDATE reservation SET status='cancelled' WHERE code='RS-2'"))
    r = db.up()
    assert r.returncode == 0, r.stderr[-1500:]
    assert db.version() == HEAD and all(s and e for s, e in db.ranges().values())


def test_failure_then_resume_after_invalid_data_fixed(clean):
    db = clean
    db.ins("RV-1", 0, "2026-11-20", "19:00", -90, "confirmed")
    _stops(db, "RV-1")
    with db.engine.begin() as cx:
        cx.execute(sa.text("UPDATE reservation SET duration_minutes = 90 WHERE code='RV-1'"))
    assert db.up().returncode == 0 and db.version() == HEAD


def test_upgrade_downgrade_upgrade(clean):
    db = clean
    db.ins("U-1", 0, "2026-11-20", "19:00", 90, "confirmed")
    db.ins("U-2", 1, "2026-11-20", "19:00", 60, "pending")
    base = db.snap()
    assert db.up().returncode == 0
    first = db.ranges()
    r = db.alembic("downgrade", PARENT)
    assert r.returncode == 0, r.stderr[-1500:]
    after = db.snap()
    assert (after[0], after[1], after[3], after[4]) == (base[0], base[1], base[3], base[4])  # colonnes, lignes, contrainte, version : état d'avant
    assert after[2] == (1 if db.pg else 0)            # l'extension btree_gist est volontairement conservée (cf. docstring de la migration)
    assert db.up().returncode == 0 and db.version() == HEAD
    assert db.ranges() == first


def test_rerun_is_a_noop_and_single_head(clean):
    clean.ins("H-1", 0, "2026-11-20", "19:00", 90, "confirmed")
    assert clean.up().returncode == 0
    snap = clean.snap()
    r = clean.up()
    assert r.returncode == 0 and clean.snap() == snap
    heads = {ln.split()[0] for ln in clean.alembic("heads").stdout.splitlines() if "(head)" in ln}
    # A2 (parent A1.1) remplace A1.1 comme tête de SA branche et n'en crée aucune nouvelle. Le seul autre sommet toléré est
    # `a1d5c8e2f4b7` : il préexiste dans cet instantané du dépôt (la migration de fusion `b0e1f2a3c4d5` y est adaptée).
    assert HEAD not in heads and A2_HEAD not in heads and len(heads - {"a1d5c8e2f4b7"}) == 1  # tête actuelle (A2 puis C2…) : une seule hors branche historique a1d5…


# ───────────────────── PostgreSQL uniquement ─────────────────────
pg_only = pytest.mark.skipif(not PG, reason="nécessite HFOOD_TEST_PG_URL (PostgreSQL de test)")


@pg_only
def test_constraint_really_enforced_after_migration(clean):
    if not clean.pg:
        pytest.skip("PostgreSQL uniquement")
    clean.ins("C-1", 0, "2026-11-20", "19:00", 90, "confirmed")
    assert clean.up().returncode == 0
    with pytest.raises(sa.exc.IntegrityError, match="reservation_no_table_overlap"):
        with clean.engine.begin() as cx:
            cx.execute(sa.text(
                "INSERT INTO reservation (code,restaurant_id,table_id,user_id,name,phone,party_size,day,time,duration_minutes,start_at,end_at,status,note,preorder,preorder_total,restaurant_name,table_label,created_at,updated_at) "
                "VALUES ('C-2',:r,:t,:u,'N','',2,'2026-11-20','20:00',90,'2026-11-20 20:00','2026-11-20 21:30','pending','','[]',0,'R','T',now(),now())"),
                {"r": clean.rid, "t": clean.tables[0], "u": clean.uid})


@pg_only
def test_missing_extension_privilege_fails_cleanly_without_any_change(clean):
    """Rôle sans droit CREATE sur la base : message explicite, AUCUNE modification (DDL transactionnel)."""
    if not clean.pg:
        pytest.skip("PostgreSQL uniquement")
    if safety._host_of(TARGET.url) not in safety.LOCAL_HOSTS and not safety._host_of(TARGET.url).startswith("/"):
        pytest.skip("crée un rôle : réservé à un PostgreSQL local")
    db = clean
    if db.ext_preexisting:
        pytest.skip("btree_gist existe déjà dans cette base de test : l'absence d'extension ne peut pas être simulée (on ne la supprime jamais)")
    role = f"hfood_test_lim_{db.schema.rsplit('_', 1)[1]}"  # nom UNIQUE (suffixe du schéma) : ne peut pas viser un rôle préexistant
    role_created = False
    db.ins("X-1", 0, "2026-11-20", "19:00", 90, "confirmed")
    admin = sa.create_engine(TARGET.url.render_as_string(hide_password=False), isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as cx:
            assert not cx.execute(sa.text("SELECT 1 FROM pg_roles WHERE rolname = :r"), {"r": role}).first(), "rôle déjà existant : refus de le réutiliser"
            cx.execute(sa.text(f"CREATE ROLE {role} LOGIN"))
            role_created = True
        with db.engine.begin() as cx:
            cx.execute(sa.text(f'GRANT USAGE, CREATE ON SCHEMA "{db.schema}" TO {role}'))
            cx.execute(sa.text(
                "DO $$ DECLARE r record; BEGIN "
                f"FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='{db.schema}' LOOP EXECUTE format('ALTER TABLE %I.%I OWNER TO {role}', '{db.schema}', r.tablename); END LOOP; "
                f"FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname='{db.schema}' LOOP EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO {role}', '{db.schema}', r.sequencename); END LOOP; END $$"))
        before = db.snap()
        limited = safety.scoped_url(replace(TARGET, url=TARGET.url.set(username=role, password=None)), db.schema)
        r = db.up(url=limited)
        assert r.returncode != 0
        out = r.stderr + r.stdout
        assert "btree_gist" in out and "Aucune modification" in out, out[-1500:]
        assert db.snap() == before and db.version() == PARENT
    finally:
        if role_created:  # uniquement le rôle créé par CE test (nom unique)
            with admin.connect() as cx:
                cx.execute(sa.text(f"REASSIGN OWNED BY {role} TO CURRENT_USER"))  # ses seuls objets : ceux de notre schéma
                cx.execute(sa.text(f"DROP OWNED BY {role}"))
                cx.execute(sa.text(f"DROP ROLE {role}"))
        admin.dispose()


@pg_only
def test_a_preexisting_extension_is_never_dropped_by_the_harness(clean):
    """On SIMULE une extension préexistante (créée dans un schéma sentinelle au nom unique) : la migration la réutilise,
    reset() et close() ne la suppriment pas ; seule l'extension créée dans NOTRE schéma peut l'être."""
    db = clean
    if not db.pg:
        pytest.skip("PostgreSQL uniquement")
    if db.ext_preexisting or db.ext_is_ours():
        pytest.skip("btree_gist existe déjà dans cette base de test : simulation impossible sans y toucher")
    sent, sent_created = f"hfood_sentinel_{db.schema.rsplit('_', 1)[1]}", False
    try:
        with db.engine.begin() as cx:
            cx.execute(sa.text(f'CREATE SCHEMA "{sent}"'))
            sent_created = True
            cx.execute(sa.text(f'CREATE EXTENSION btree_gist SCHEMA "{sent}"'))
        db.ext_preexisting = True
        assert db.up().returncode == 0 and db.version() == HEAD
        assert not db.ext_is_ours()  # la migration a réutilisé l'extension existante au lieu d'en créer une 2e
        db.reset()  # ne doit PAS la supprimer
        with db.engine.connect() as cx:
            assert cx.execute(sa.text("SELECT count(*) FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'btree_gist' AND n.nspname = :s"), {"s": sent}).scalar() == 1
    finally:
        db.ext_preexisting = False
        if sent_created:  # uniquement ce que ce test a créé
            with db.engine.begin() as cx:
                cx.execute(sa.text(f'DROP SCHEMA IF EXISTS "{sent}" CASCADE'))


# ───────── plages start_at / end_at DÉJÀ présentes (partielles, incohérentes, invalides) ─────────
def _dated(db, *rows):
    """rows = (code, table, day, time, dur, status, start, end) ; colonnes ajoutées à la main sous la révision parente."""
    db.add_range_columns()
    for code, t, d, tm, du, st, s_, e_ in rows:
        db.ins(code, t, d, tm, du, st)
        db.set_range(code, s_, e_)


def test_partial_range_start_only_stops_and_is_not_completed(clean):
    _dated(clean, ("PR-1", 0, "2026-11-20", "19:00", 90, "confirmed", "2026-11-20 19:00:00", None))
    _stops(clean, "PR-1", "plage partielle", "end_at NULL", cols_present=True)


def test_partial_range_end_only_stops_and_is_not_overwritten(clean):
    _dated(clean, ("PR-2", 0, "2026-11-20", "19:00", 90, "confirmed", None, "2026-11-20 20:30:00"))
    _stops(clean, "PR-2", "plage partielle", "start_at NULL", cols_present=True)


@pytest.mark.parametrize("s_,e_,needle", [
    ("2026-11-20 20:30:00", "2026-11-20 19:00:00", "intervalle invalide"),   # fin avant début
    ("2026-11-20 19:00:00", "2026-11-20 19:00:00", "intervalle invalide"),   # durée nulle
])
def test_invalid_existing_interval_stops(clean, s_, e_, needle):
    _dated(clean, ("IV-1", 0, "2026-11-20", "19:00", 90, "confirmed", s_, e_))
    _stops(clean, "IV-1", needle, cols_present=True)


def test_existing_range_inconsistent_with_day_time_duration_stops_and_is_kept_as_is(clean):
    _dated(clean, ("IC-1", 0, "2026-11-20", "19:00", 90, "confirmed", "2026-11-20 10:00:00", "2026-11-20 11:00:00"))
    _stops(clean, "IC-1", "incohérente", "attendu 2026-11-20 19:00→2026-11-20 20:30", cols_present=True)


def test_existing_range_with_invalid_day_time_duration_stops(clean):
    _dated(clean, ("ID-1", 0, "2026-11-20", "25:00", 90, "confirmed", "2026-11-20 19:00:00", "2026-11-20 20:30:00"))
    _stops(clean, "ID-1", "jour/heure/durée invalides", cols_present=True)


def test_existing_valid_ranges_are_preserved_and_missing_ones_filled(clean):
    db = clean
    _dated(db,
           ("OKR-1", 0, "2026-11-20", "19:00", 90, "confirmed", "2026-11-20 19:00:00", "2026-11-20 20:30:00"),  # déjà bonne
           ("OKR-2", 1, "2026-11-20", "19:00", 60, "pending", None, None),                                     # à remplir
           ("OKR-3", 0, "2026-11-20", "21:00", 30, "cancelled", "2026-11-20 21:00:00", "2026-11-20 21:30:00"))
    assert db.up().returncode == 0 and db.version() == HEAD
    rg = db.ranges()
    assert [str(x) for x in rg["OKR-1"]] == ["2026-11-20 19:00:00", "2026-11-20 20:30:00"]   # inchangée
    assert [str(x) for x in rg["OKR-2"]] == ["2026-11-20 19:00:00", "2026-11-20 20:00:00"]   # remplie
    if db.pg:
        assert db.snap()[3] == 1  # contrainte créée


def test_overlap_between_existing_range_and_unfilled_row_stops(clean):
    _dated(clean,
           ("OV-A", 0, "2026-11-20", "19:00", 90, "confirmed", "2026-11-20 19:00:00", "2026-11-20 20:30:00"),
           ("OV-B", 0, "2026-11-20", "20:00", 60, "pending", None, None))
    _stops(clean, "OV-A", "OV-B", "CHEVAUCHEMENT", cols_present=True)


def test_nothing_is_overwritten_when_stopping_with_mixed_state(clean):
    """Un état mêlant ligne saine déjà datée, ligne partielle et ligne vierge : arrêt, TOUT reste tel quel (plages comprises)."""
    _dated(clean,
           ("MX-1", 0, "2026-11-20", "19:00", 90, "confirmed", "2026-11-20 19:00:00", "2026-11-20 20:30:00"),
           ("MX-2", 1, "2026-11-20", "19:00", 90, "confirmed", "2026-11-20 19:00:00", None),
           ("MX-3", 2, "2026-11-20", "19:00", 90, "confirmed", None, None))
    before = clean.snap()
    _stops(clean, "MX-2", cols_present=True)
    assert clean.snap() == before
    assert [r[7:] for r in clean.snap()[1] if r[1] == "MX-3"] == [(None, None)]  # la ligne vierge n'a pas été remplie à moitié


def test_resume_after_fixing_partial_range(clean):
    db = clean
    _dated(db, ("RP-1", 0, "2026-11-20", "19:00", 90, "confirmed", "2026-11-20 19:00:00", None))
    _stops(db, "RP-1", cols_present=True)
    db.set_range("RP-1", None, None)  # résolution explicite
    assert db.up().returncode == 0 and db.version() == HEAD
