"""HFood — validation du CONTENU réel des images téléversées (phase A1.3).

On ne fait confiance ni à l'extension, ni au type MIME déclaré, ni à un simple en-tête d'octets : l'image est
décodée en entier avec Pillow. Formats acceptés : PNG, JPEG, WebP (statiques). Les octets enregistrés sont
exactement ceux reçus (aucune réécriture) ; l'extension est déduite du format réellement détecté.
"""
import io
import logging
import os
import threading
import uuid
import warnings
from contextlib import contextmanager
from pathlib import Path
from typing import Optional

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError
from sqlalchemy import text as sa_text
from sqlmodel import Session, func, select

from app.restaurant import limits as L
from app.upload_store import MEDIA, UploadBlob

logger = logging.getLogger("hcompany.restaurant.uploads")
FORMATS = {"PNG": ".png", "JPEG": ".jpg", "WEBP": ".webp"}
_LOCKS: dict[int, threading.Lock] = {}
_LOCKS_GUARD = threading.Lock()
BAD = "Le fichier n'est pas une image valide (PNG, JPEG ou WebP)."


def decode_image(data: bytes) -> str:
    """Valide `data` et renvoie l'extension (".png", ".jpg", ".webp"). Lève HTTP 400 sinon."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)  # surface démesurée → refus
            with Image.open(io.BytesIO(data)) as im:
                ext = FORMATS.get(im.format or "")
                if not ext:
                    raise HTTPException(status_code=400, detail=BAD)
                w, h = im.size
                if w < 1 or h < 1 or max(w, h) > L.UPLOAD_MAX_SIDE or w * h > L.UPLOAD_MAX_PIXELS:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Image trop grande : {L.UPLOAD_MAX_SIDE} px maximum de côté et {L.UPLOAD_MAX_PIXELS // 1_000_000} mégapixels.",
                    )
                if getattr(im, "n_frames", 1) > 1:
                    raise HTTPException(status_code=400, detail="Les images animées ne sont pas acceptées.")
                im.load()  # décodage complet : détecte fichiers tronqués / corrompus
        return ext
    except HTTPException:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, Image.DecompressionBombWarning, OSError, SyntaxError, ValueError, EOFError):
        raise HTTPException(status_code=400, detail=BAD)


def usage(session: Session, user_id: int) -> tuple[int, int]:
    """(nombre d'images, octets) déjà stockés pour ce compte dans `restaurant/`."""
    n, total = session.exec(
        select(func.count(), func.coalesce(func.sum(func.length(UploadBlob.data)), 0)).where(UploadBlob.path.like(f"restaurant/{int(user_id)}-%"))
    ).one()
    return int(n or 0), int(total or 0)


def check_quota(session: Session, user_id: int, new_bytes: int) -> None:
    n, total = usage(session, user_id)
    if n >= L.UPLOAD_MAX_FILES:
        raise HTTPException(status_code=409, detail=f"Limite atteinte : {L.UPLOAD_MAX_FILES} images par compte. Supprimez des images inutilisées ou contactez le support.")
    if total + new_bytes > L.UPLOAD_MAX_TOTAL_BYTES:
        raise HTTPException(status_code=409, detail=f"Espace d'images épuisé ({L.UPLOAD_MAX_TOTAL_BYTES // (1024 * 1024)} Mo par compte).")


@contextmanager
def _quota_lock(session: Session, user_id: int):
    """Sérialise « contrôle du quota + enregistrement » d'un même compte (uploads simultanés).
    PostgreSQL : verrou consultatif de transaction (valable entre processus/instances, libéré au commit/rollback).
    SQLite (tests/dev, un seul processus) : verrou de thread par compte."""
    if session.get_bind().dialect.name == "postgresql":
        session.execute(sa_text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": f"hfood-upload:{int(user_id)}"})
        yield
        return
    with _LOCKS_GUARD:
        lock = _LOCKS.setdefault(int(user_id), threading.Lock())
    with lock:
        yield


def save_image(root: Path, session: Session, user_id: int, ext: str, data: bytes) -> str:
    """Enregistre l'image (disque + base) de façon atomique et SANS jamais toucher à un fichier préexistant.

    * quota contrôlé et enregistrement dans le même verrou : N envois simultanés ne dépassent pas la limite ;
    * le fichier disque est créé en mode exclusif (`xb`) : un nom déjà pris est abandonné (nouveau nom tiré), jamais écrasé ;
    * la ligne en base est insérée (`add`, pas `merge`) dans la transaction verrouillée ;
    * en cas d'échec, on retire UNIQUEMENT le fichier que cet appel a lui-même créé, et la transaction est annulée."""
    ctype = MEDIA.get(ext, "application/octet-stream")
    with _quota_lock(session, user_id):
        check_quota(session, user_id, len(data))
        created: Optional[Path] = None
        rel = ""
        try:
            for _ in range(8):
                rel = f"restaurant/{int(user_id)}-{uuid.uuid4().hex[:12]}{ext}"
                if session.get(UploadBlob, rel) is not None:
                    continue  # nom déjà présent en base : on ne l'écrase pas
                target = root / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                try:
                    with open(target, "xb") as f:  # exclusif : FileExistsError si le fichier existe déjà
                        created = target
                        f.write(data)
                except FileExistsError:
                    created = None  # fichier préexistant : intact, on essaie un autre nom
                    continue
                break
            else:
                raise RuntimeError("aucun nom de fichier libre")
            session.add(UploadBlob(path=rel, content_type=ctype, data=data))
            session.commit()
            return rel
        except HTTPException:
            session.rollback()
            raise
        except Exception as exc:  # noqa: BLE001
            session.rollback()
            if created is not None:
                try:
                    created.unlink(missing_ok=True)  # seulement ce que NOUS avons créé
                except OSError:
                    logger.warning("Nettoyage de %s impossible après un échec d'enregistrement.", rel)
            logger.error("Échec d'enregistrement d'une image (%s)", exc.__class__.__name__)
            raise HTTPException(status_code=503, detail="Enregistrement de l'image impossible : réessayez dans un instant.")


def check_consistency(root: Path, session: Session) -> dict:
    """Compare disque et base pour `restaurant/` : {disk_only, db_only, mismatch} (listes de chemins).
    `db_only` est toléré en exploitation (le disque éphémère est recréé depuis la base) ; `disk_only` (orphelin) et
    `mismatch` (octets différents) ne devraient jamais exister."""
    base = root / "restaurant"
    disk = {f"restaurant/{n}" for n in os.listdir(base)} if base.exists() else set()
    blobs = {b.path: b.data for b in session.exec(select(UploadBlob).where(UploadBlob.path.like("restaurant/%"))).all()}
    mismatch = sorted(p for p in disk & set(blobs) if (root / p).read_bytes() != blobs[p])
    return {"disk_only": sorted(disk - set(blobs)), "db_only": sorted(set(blobs) - disk), "mismatch": mismatch}
