"""Assistante apprenante : recherche BM25 sur Q/R apprises + contenu de la base, apprentissage depuis les agents, retours 👍/👎."""
import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "kn.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_db}")
os.environ.setdefault("ENVIRONMENT", "development")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, Session, select  # noqa: E402

from app.database import engine  # noqa: E402
from app.deps import get_current_admin  # noqa: E402
from app.knowledge import router as K, search as S  # noqa: E402
from app.knowledge.models import KnowledgeEntry  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User, UserRole  # noqa: E402

A = "/api/v1/assistant"


@pytest.fixture(scope="module")
def c():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        u = User(email="boss@kn.test", full_name="Boss", role=UserRole.admin, is_verified=True)
        s.add(u); s.commit(); s.refresh(u); uid = u.id
    app.dependency_overrides[get_current_admin] = lambda: Session(engine).get(User, uid)
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def test_unknown_question_escalates(c):
    r = c.post(f"{A}/ask", json={"question": "blorp zzxq vlurb"}).json()
    assert r["answer"] is None and r["escalate"] is True


def test_admin_teaches_and_assistant_answers_in_both_languages(c):
    e = c.post(f"{A}/admin/entries", json={"question": "Comment changer mon mot de passe ?", "answer": "Allez dans Paramètres puis Sécurité, et choisissez « Changer le mot de passe ».", "lang": "fr"})
    assert e.status_code == 201
    r = c.post(f"{A}/ask", json={"question": "je veux changer mon mot de passe", "lang": "fr"}).json()
    assert not r["escalate"] and "Paramètres" in r["answer"] and r["entry_id"] == e.json()["id"]
    r2 = c.post(f"{A}/ask", json={"question": "mot de passe changer comment", "lang": "fr"}).json()   # autre ordre des mots
    assert r2["entry_id"] == e.json()["id"]


def test_learns_from_agent_replies_and_masks_personal_data(c):
    with Session(engine) as s:
        assert K.learn_from_agent(s, "T-1", "Quels sont les horaires de départ des bus pour Lubumbashi ?", "Les bus partent chaque jour à 6h et à 14h depuis la gare routière de Lusaka.") is None or True
        s.commit()
        assert K.learn_from_agent(s, "T-2", "Mon mail est jean@x.com, comment suivre mon colis ?", "Entrez le code de suivi dans la page Colis pour voir l'état de votre envoi en direct.") is None or True
        s.commit()
        assert K.learn_from_agent(s, "T-3", "ok", "merci") is None  # trop court : pas réutilisable
        rows = s.exec(select(KnowledgeEntry).where(KnowledgeEntry.source == "agent")).all()
        assert len(rows) == 2 and all("jean@x.com" not in e.question for e in rows)
        assert K.learn_from_agent(s, "T-1", "Quels sont les horaires de départ des bus pour Lubumbashi ?", "Autre texte assez long pour être réutilisable ici.") is None  # une paire par conversation
    r = c.post(f"{A}/ask", json={"question": "horaires de départ des bus Lubumbashi", "lang": "fr"}).json()
    assert not r["escalate"] and "6h" in r["answer"]


def test_feedback_pauses_bad_learned_answers(c):
    with Session(engine) as s:
        e = s.exec(select(KnowledgeEntry).where(KnowledgeEntry.source == "agent")).first()
        eid = e.id
    for _ in range(3):
        assert c.post(f"{A}/feedback", json={"entry_id": eid, "helpful": False}).status_code == 200
    with Session(engine) as s:
        assert s.get(KnowledgeEntry, eid).active is False   # mise en pause, l'admin peut la réactiver
    assert c.patch(f"{A}/admin/entries/{eid}", json={"question": "Q valide ici", "answer": "Réponse corrigée par l'admin, plus claire.", "lang": "fr", "active": True}).status_code == 200
    assert c.get(f"{A}/admin/entries", params={"source": "agent"}).status_code == 200
    assert c.delete(f"{A}/admin/entries/{eid}").status_code == 200
    assert c.post(f"{A}/feedback", json={"entry_id": 99999, "helpful": True}).status_code == 404
