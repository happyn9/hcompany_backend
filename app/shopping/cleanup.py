"""Nettoyage des images H-Shopping qui ne servent plus.

Pourquoi : chaque image est stockée sur disque ET en base (voir upload_store.py).
Quand un vendeur remplace une photo (ex. re-détourage) ou envoie une photo sans enregistrer
l'article, l'ancien fichier restait indéfiniment — et grossissait la base.

Deux mécanismes :
 1. `release_if_unreferenced` : suppression immédiate d'une image retirée d'un article / d'une boutique,
    SI plus rien ne la référence (photos d'articles, logo, bannière, et lignes de commandes passées).
 2. `sweep_orphans` : balayage des images jamais rattachées à rien (envoyées puis abandonnées),
    après un délai de grâce (le vendeur peut garder un formulaire ouvert des heures).
"""
import logging
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable, Optional

from sqlmodel import Session, func, select

from app.database import engine
from app.shopping.models import Shop, ShopOrderItem, ShopProductImage
from app.upload_store import UploadBlob, delete_upload

logger = logging.getLogger("hcompany.shopping.cleanup")

PREFIX = "shopping/"
DEFAULT_GRACE = timedelta(hours=48)
_SWEEP_EVERY = 6 * 3600
_last_sweep = 0.0
_lock = threading.Lock()


def referenced_paths(session: Session) -> set[str]:
    """Toutes les images encore utilisées quelque part."""
    refs: set[str] = set()
    refs.update(p for p in session.exec(select(ShopProductImage.path)).all() if p)
    refs.update(p for p in session.exec(select(Shop.logo_path)).all() if p)
    refs.update(p for p in session.exec(select(Shop.banner_path)).all() if p)
    # Les lignes de commande gardent la photo de l'article au moment de l'achat (historique).
    refs.update(p for p in session.exec(select(ShopOrderItem.image_path)).all() if p)
    return refs


def _is_used(session: Session, path: str) -> bool:
    if session.exec(select(func.count(ShopProductImage.id)).where(ShopProductImage.path == path)).one():
        return True
    if session.exec(select(func.count(Shop.id)).where((Shop.logo_path == path) | (Shop.banner_path == path))).one():
        return True
    return bool(session.exec(select(func.count(ShopOrderItem.id)).where(ShopOrderItem.image_path == path)).one())


def release_if_unreferenced(session: Session, root: Path, paths: Iterable[Optional[str]]) -> int:
    """À appeler APRÈS le commit qui a retiré ces images. Renvoie le nombre de fichiers supprimés."""
    n = 0
    for path in {p for p in paths if p and p.startswith(PREFIX)}:
        try:
            if not _is_used(session, path):
                delete_upload(root, path)
                n += 1
        except Exception:  # le ménage ne doit jamais faire échouer la requête du vendeur
            logger.exception("Suppression impossible : %s", path)
    return n


def sweep_orphans(session: Session, root: Path, min_age: timedelta = DEFAULT_GRACE, dry_run: bool = False) -> dict:
    """Supprime (ou, en dry_run, liste) les images jamais rattachées et plus anciennes que `min_age`."""
    cutoff = datetime.utcnow() - min_age
    refs = referenced_paths(session)
    rows = session.exec(
        select(UploadBlob.path, UploadBlob.created_at, func.length(UploadBlob.data)).where(UploadBlob.path.like(PREFIX + "%"))
    ).all()
    orphans = [(p, size or 0) for p, created, size in rows if p not in refs and created and created < cutoff]
    known = {p for p, _c, _s in rows}
    # Fichiers présents sur disque mais sans copie en base (anciens envois) : même règle, via la date du fichier.
    disk_only = []
    shop_dir = root / "shopping"
    if shop_dir.is_dir():
        for f in shop_dir.iterdir():
            rel = f"shopping/{f.name}"
            if f.is_file() and rel not in refs and rel not in known and datetime.utcfromtimestamp(f.stat().st_mtime) < cutoff:
                disk_only.append((rel, f.stat().st_size))
    victims = orphans + disk_only
    freed = sum(size for _p, size in victims)
    if not dry_run:
        for path, _size in victims:
            try:
                delete_upload(root, path)
            except Exception:
                logger.exception("Suppression impossible : %s", path)
        if victims:
            logger.info("Nettoyage H-Shopping : %d image(s) orpheline(s) supprimée(s), %.1f Mo libérés", len(victims), freed / 1e6)
    return {
        "dry_run": dry_run, "orphans": len(victims), "freed_mb": round(freed / 1e6, 3),
        "min_age_hours": int(min_age.total_seconds() // 3600), "sample": [p for p, _s in victims[:10]],
    }


def sweep_in_background(root: Path) -> None:
    """Balayage opportuniste, au plus une fois toutes les 6 h par instance (appelé après un envoi d'image)."""
    global _last_sweep
    with _lock:
        if time.time() - _last_sweep < _SWEEP_EVERY:
            return
        _last_sweep = time.time()
    try:
        with Session(engine) as s:
            sweep_orphans(s, root)
    except Exception:
        logger.exception("Balayage des images orphelines en échec")
