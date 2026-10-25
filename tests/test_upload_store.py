"""Les images survivent à la perte du disque (hébergeur éphémère)."""
import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "up.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db}")
os.environ.setdefault("ENVIRONMENT", "development")

from pathlib import Path  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

from app.database import engine  # noqa: E402
from app.main import UPLOAD_DIR, app  # noqa: E402
from app.upload_store import save_upload  # noqa: E402


def test_file_restored_from_db_after_disk_loss():
    SQLModel.metadata.create_all(engine)
    rel = "shopping/9-abcdef012345.png"
    data = b"\x89PNG\r\n\x1a\n" + b"1" * 50
    save_upload(UPLOAD_DIR, rel, data)
    (Path(UPLOAD_DIR) / rel).unlink()  # le disque est vidé
    c = TestClient(app)
    r = c.get(f"/uploads/{rel}")
    assert r.status_code == 200 and r.content == data and r.headers["content-type"] == "image/png"
    assert (Path(UPLOAD_DIR) / rel).exists()
    assert c.get("/uploads/shopping/inconnu.png").status_code == 404
    (Path(UPLOAD_DIR) / rel).unlink()
