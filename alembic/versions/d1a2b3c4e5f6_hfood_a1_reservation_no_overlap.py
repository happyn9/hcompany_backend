"""HFood A1.1 : plage d'occupation des réservations + contrainte anti double-réservation (PostgreSQL)

Revision ID: d1a2b3c4e5f6
Revises: c9d0e1f2a3b4

Additive, sans perte de données, et STRICTE : elle ne devine jamais.

  * ajoute `reservation.start_at` / `reservation.end_at` (NULL autorisé) ;
  * AVANT toute modification, contrôle TOUTES les réservations sans plage :
      - données invalides  : durée NULL / nulle / négative / non entière, heure illisible ou hors 00:00–23:59,
        date illisible, plage qui sort des bornes supportées → la migration S'ARRÊTE ;
      - plages start_at/end_at DÉJÀ présentes (relance, ou colonnes ajoutées avant) : partielle (un seul des deux
        renseigné), illisible, fin ≤ début, ou incohérente avec jour/heure/durée → la migration S'ARRÊTE ;
        une plage valide et cohérente est conservée telle quelle (jamais réécrite) ;
      - chevauchements historiques entre réservations bloquantes (pending / confirmed / seated) sur une même
        table → la migration S'ARRÊTE ;
    Elle ne corrige rien (pas de durée par défaut, pas de « gagnant » entre deux réservations), ne modifie et ne
    supprime aucune réservation. Le message d'erreur liste chaque réservation concernée (id, code, table, jour,
    heure, durée, statut) ;
  * si tout est sain : remplit start_at/end_at, puis (PostgreSQL) extension `btree_gist` et contrainte d'exclusion
    `reservation_no_table_overlap`.

Atomicité : en PostgreSQL tout se passe dans la transaction d'Alembic ; un arrêt = aucune modification
(pas de colonnes, pas d'extension, pas de contrainte, `alembic_version` inchangée).

Reprise : le propriétaire résout les anomalies listées (annuler/décaler/corriger les lignes dans l'application ou en
SQL), puis relance `alembic upgrade head` (ou redémarre le conteneur) : la migration refait tous les contrôles.

Rollback : `alembic downgrade c9d0e1f2a3b4` retire la contrainte puis les deux colonnes. L'extension btree_gist
est volontairement conservée (inoffensive).
"""
import logging
import os
import re
import sys
from datetime import date, datetime, timedelta

import sqlalchemy as sa
from alembic import op

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from _safe import add_col, has_col, has_table  # noqa: E402

revision = 'd1a2b3c4e5f6'
down_revision = 'c9d0e1f2a3b4'
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")
CONSTRAINT = "reservation_no_table_overlap"
BLOCKING = ("pending", "confirmed", "seated")  # = app.restaurant.models.BLOCKING_STATUSES
TIME_RE = re.compile(r"^([01]?[0-9]|2[0-3]):([0-5][0-9])$")
INT_RE = re.compile(r"^-?[0-9]+$")
MAX_LINES = 500  # lignes de diagnostic par catégorie


class MigrationDataError(RuntimeError):
    """Données historiques à résoudre par le propriétaire avant de relancer la migration."""


def _dt(v):
    """SQLite renvoie les dates des requêtes brutes sous forme de texte ; PostgreSQL, des datetime."""
    return v if isinstance(v, datetime) else datetime.fromisoformat(str(v))


def compute_range(day_txt, time_txt, duration):
    """(début, fin) d'une réservation, ou ValueError(raison). Aucune valeur par défaut, aucune correction."""
    if duration is None:
        raise ValueError("durée NULL (non interprétable sans inventer une règle métier)")
    if isinstance(duration, bool):
        raise ValueError(f"durée invalide ({duration!r})")
    if isinstance(duration, str):
        if not INT_RE.match(duration.strip()):
            raise ValueError(f"durée non entière ({duration!r})")
        duration = int(duration.strip())
    if not isinstance(duration, int):
        raise ValueError(f"durée non entière ({duration!r})")
    if duration < 0:
        raise ValueError(f"durée négative ({duration})")
    if duration == 0:
        raise ValueError("durée nulle (0)")
    if day_txt is None:
        raise ValueError("date NULL")
    try:
        d = date.fromisoformat(str(day_txt).strip())
    except ValueError:
        raise ValueError(f"date invalide ({day_txt!r})") from None
    m = TIME_RE.match(str(time_txt).strip()) if time_txt is not None else None
    if not m:
        raise ValueError(f"heure invalide ou illisible ({time_txt!r})")
    try:
        start = datetime(d.year, d.month, d.day) + timedelta(minutes=int(m.group(1)) * 60 + int(m.group(2)))
        end = start + timedelta(minutes=duration)
    except OverflowError:
        raise ValueError("plage hors des bornes supportées") from None
    if end.year > 9999 or end <= start:
        raise ValueError("plage incompatible avec PostgreSQL (fin hors bornes ou ≤ début)")
    return start, end


def _fmt(r) -> str:
    return f"id={r['id']} code={r['code']} table_id={r['table_id']} jour={r['day']} heure={r['time']} durée={r['dur']} statut={r['status']}"


def _load(bind):
    """Toutes les réservations (jour/heure en TEXTE pour ne jamais échouer sur une valeur exotique)."""
    dated = has_col('reservation', 'start_at') and has_col('reservation', 'end_at')
    extra = ", start_at, end_at" if dated else ", NULL, NULL"
    rows = bind.execute(sa.text(
        "SELECT id, code, table_id, status, CAST(day AS TEXT), CAST(time AS TEXT), duration_minutes"
        f"{extra} FROM reservation ORDER BY id"
    )).fetchall()
    return [
        {"id": r[0], "code": r[1], "table_id": r[2], "status": r[3], "day": r[4], "time": r[5], "dur": r[6], "start_at": r[7], "end_at": r[8]}
        for r in rows
    ]


def analyse(rows):
    """→ (plages à écrire {id: (début, fin)}, lignes invalides [(ligne, raison)], conflits [(a, b)])."""
    to_write, invalid, spans = {}, [], []
    for r in rows:
        has_s, has_e = r["start_at"] is not None, r["end_at"] is not None
        if has_s != has_e:  # plage PARTIELLE : jamais complétée ni écrasée en silence
            side = "start_at renseigné, end_at NULL" if has_s else "end_at renseigné, start_at NULL"
            invalid.append((r, f"plage partielle ({side}) : non modifiée, à corriger"))
            continue
        if has_s:  # plage déjà présente : doit être valide ET cohérente avec jour/heure/durée ; jamais écrasée
            try:
                s, e = _dt(r["start_at"]), _dt(r["end_at"])
            except (ValueError, TypeError):
                invalid.append((r, f"plage illisible (start_at={r['start_at']!r}, end_at={r['end_at']!r})"))
                continue
            if e <= s:
                invalid.append((r, f"intervalle invalide : fin {e:%Y-%m-%d %H:%M} ≤ début {s:%Y-%m-%d %H:%M}"))
                continue
            try:
                exp = compute_range(r["day"], r["time"], r["dur"])
            except ValueError as ex:
                invalid.append((r, f"plage présente mais jour/heure/durée invalides ({ex})"))
                continue
            if exp != (s, e):
                invalid.append((r, f"plage incohérente avec jour/heure/durée : trouvé {s:%Y-%m-%d %H:%M}→{e:%Y-%m-%d %H:%M}, attendu {exp[0]:%Y-%m-%d %H:%M}→{exp[1]:%Y-%m-%d %H:%M} (non modifiée)"))
                continue
        else:
            try:
                s, e = compute_range(r["day"], r["time"], r["dur"])
            except ValueError as ex:
                invalid.append((r, str(ex)))
                continue
            to_write[r["id"]] = (s, e)
        if r["table_id"] is not None and r["status"] in BLOCKING:
            spans.append((r["table_id"], s, e, r))
    conflicts = []
    by_table: dict[int, list] = {}
    for t, s, e, r in spans:
        by_table.setdefault(t, []).append((s, e, r))
    for lst in by_table.values():
        lst.sort(key=lambda x: (x[0], x[2]["id"]))
        for i, (s1, e1, r1) in enumerate(lst):
            for s2, e2, r2 in lst[i + 1:]:
                if s2 >= e1:
                    break
                conflicts.append((r1, r2, s1, e1, s2, e2))
    return to_write, invalid, conflicts


def _report(invalid, conflicts) -> str:
    out = ["HFood A1.1 : migration INTERROMPUE — aucune modification n'a été faite (rien n'est supprimé ni corrigé)."]
    if invalid:
        out.append(f"\n{len(invalid)} réservation(s) à DONNÉES INVALIDES (à corriger) :")
        out += [f"  - {_fmt(r)} → {why}" for r, why in invalid[:MAX_LINES]]
        if len(invalid) > MAX_LINES:
            out.append(f"  … et {len(invalid) - MAX_LINES} autre(s).")
    if conflicts:
        out.append(f"\n{len(conflicts)} CHEVAUCHEMENT(S) entre réservations bloquantes (pending/confirmed/seated) sur une même table — aucun gagnant n'est choisi :")
        for r1, r2, s1, e1, s2, e2 in conflicts[:MAX_LINES]:
            out.append(f"  - table {r1['table_id']} : [{_fmt(r1)} | {s1:%Y-%m-%d %H:%M}→{e1:%H:%M}]  ⟷  [{_fmt(r2)} | {s2:%Y-%m-%d %H:%M}→{e2:%H:%M}]")
        if len(conflicts) > MAX_LINES:
            out.append(f"  … et {len(conflicts) - MAX_LINES} autre(s).")
    out.append("\nRésolvez ces cas (corriger la donnée, ou annuler/décaler l'une des réservations en conflit), puis relancez `alembic upgrade head` : tous les contrôles sont refaits.")
    return "\n".join(out)


def _ensure_btree_gist(bind) -> None:
    if bind.execute(sa.text("SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'")).first():
        return
    try:
        with bind.begin_nested():
            bind.execute(sa.text("CREATE EXTENSION IF NOT EXISTS btree_gist"))
    except Exception as e:  # noqa: BLE001
        raise MigrationDataError(
            "HFood A1.1 : impossible de créer l'extension PostgreSQL `btree_gist` (droit CREATE sur la base manquant ou "
            "extension indisponible chez l'hébergeur). Aucune modification n'a été faite. Faites activer `btree_gist` "
            f"par l'administrateur de la base (CREATE EXTENSION btree_gist), puis relancez. Détail : {type(e).__name__}"
        ) from None


def upgrade() -> None:
    if not has_table('reservation'):
        return
    bind = op.get_bind()
    # 1) CONTRÔLES — avant toute modification.
    to_write, invalid, conflicts = analyse(_load(bind))
    if invalid or conflicts:
        msg = _report(invalid, conflicts)
        log.error(msg)
        raise MigrationDataError(msg)
    is_pg = bind.dialect.name == "postgresql"
    if is_pg:
        _ensure_btree_gist(bind)
    # 2) MODIFICATIONS — uniquement si tout est sain.
    add_col('reservation', sa.Column('start_at', sa.DateTime(), nullable=True))
    add_col('reservation', sa.Column('end_at', sa.DateTime(), nullable=True))
    if to_write:
        bind.execute(
            sa.text("UPDATE reservation SET start_at = :s, end_at = :e WHERE id = :i AND start_at IS NULL AND end_at IS NULL"),
            [{"i": i, "s": s, "e": e} for i, (s, e) in to_write.items()],
        )
    if is_pg:
        if not bind.execute(sa.text("SELECT 1 FROM pg_constraint WHERE conname = :n"), {"n": CONSTRAINT}).first():
            op.execute(
                f"ALTER TABLE reservation ADD CONSTRAINT {CONSTRAINT} "
                "EXCLUDE USING gist (table_id WITH =, tsrange(start_at, end_at, '[)') WITH &&) "
                "WHERE (status IN ('pending','confirmed','seated') AND table_id IS NOT NULL AND start_at IS NOT NULL AND end_at IS NOT NULL)"
            )
    else:
        log.warning("HFood A1.1 : contrainte d'exclusion non créée (dialecte %s) ; seule la vérification applicative protège.", bind.dialect.name)


def downgrade() -> None:
    if not has_table('reservation'):
        return
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(f"ALTER TABLE reservation DROP CONSTRAINT IF EXISTS {CONSTRAINT}")
    if has_col('reservation', 'end_at'):
        op.drop_column('reservation', 'end_at')
    if has_col('reservation', 'start_at'):
        op.drop_column('reservation', 'start_at')
