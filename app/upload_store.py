"""Images téléversées : copie durable en base.

Le disque des hébergeurs gratuits (Render…) est éphémère : à chaque redémarrage ou
déploiement, `uploads/` est vidé. Chaque image est donc écrite sur disque (rapide)
ET en base ; si le fichier a disparu, `DbFallbackStaticFiles` le recrée depuis la base."""
from datetime import datetime
from pathlib import Path
from typing import Optional

from starlette.exceptions import HTTPException
from fastapi.staticfiles import StaticFiles
from sqlmodel import Field, Session, SQLModel
from starlette.responses import Response

from app.database import engine

MEDIA = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml"}


class UploadBlob(SQLModel, table=True):
    __tablename__ = "uploadblob"
    path: str = Field(primary_key=True, max_length=200)
    content_type: str = "image/png"
    data: bytes = Field(sa_type=__import__("sqlalchemy").LargeBinary)
    # Sert au délai de grâce du nettoyage des fichiers orphelins (voir shopping/cleanup.py).
    created_at: datetime = Field(default_factory=datetime.utcnow)


def save_upload(root: Path, rel_path: str, data: bytes) -> None:
    target = root / rel_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    ctype = MEDIA.get(target.suffix.lower(), "application/octet-stream")
    with Session(engine) as s:
        s.merge(UploadBlob(path=rel_path, content_type=ctype, data=data))
        s.commit()


class DbFallbackStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        try:
            resp = await super().get_response(path, scope)
            if resp.status_code != 404:
                return resp
            err = None
        except HTTPException as e:
            if e.status_code != 404:
                raise
            resp, err = None, e
        with Session(engine) as s:
            blob: Optional[UploadBlob] = s.get(UploadBlob, path)
            if not blob:
                if err:
                    raise err
                return resp
            try:  # recrée le fichier pour les requêtes suivantes
                t = Path(self.directory) / path
                t.parent.mkdir(parents=True, exist_ok=True)
                t.write_bytes(blob.data)
            except OSError:
                pass
            return Response(blob.data, media_type=blob.content_type, headers={"Cache-Control": "public, max-age=86400"})


def delete_upload(root: Path, rel_path: str) -> None:
    f = root / rel_path
    if f.exists():
        f.unlink()
    with Session(engine) as s:
        b = s.get(UploadBlob, rel_path)
        if b:
            s.delete(b)
            s.commit()
