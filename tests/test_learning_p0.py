"""H-Learning P0 : contrôle d'accès, doublons, paiement. SQLite jetable."""
import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "t.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_db}"
os.environ.setdefault("ENVIRONMENT", "development")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel, Session, select  # noqa: E402

from app.admin_security import require_admin_confirmed  # noqa: E402
from app.config import settings  # noqa: E402
from app.database import engine  # noqa: E402
from app.deps import get_current_admin, get_current_user, get_optional_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Course, Lesson, LessonProgress, LearningSubscription, TrainingRegistration, User, UserRole,
)

BASE = "/api/v1/learning"


@pytest.fixture(scope="module")
def ctx():
    SQLModel.metadata.create_all(engine)
    ids = {}
    with Session(engine) as s:
        for key, role in (("admin", UserRole.admin), ("a", UserRole.client), ("b", UserRole.client)):
            u = User(email=f"{key}@p0.io", full_name=key, role=role, is_verified=True)
            s.add(u)
            s.commit()
            s.refresh(u)
            ids[key] = u.id
        pub = Course(title="Public", level="x", description="d", is_published=True)
        priv = Course(title="Privé", level="x", description="d", is_published=True, members_only=True)
        draft = Course(title="Brouillon", level="x", description="d", is_published=False)
        s.add_all([pub, priv, draft])
        s.commit()
        for c in (pub, priv, draft):
            s.refresh(c)
        lessons = {}
        for name, c in (("pub", pub), ("priv", priv), ("draft", draft)):
            l = Lesson(course_id=c.id, title=name, youtube_id=name, is_published=True)
            s.add(l)
            s.commit()
            s.refresh(l)
            lessons[name] = l.id
        courses = {"pub": pub.id, "priv": priv.id, "draft": draft.id}
    state = {"as": "a"}

    def _u():
        with Session(engine) as s:
            return s.get(User, ids[state["as"]])

    app.dependency_overrides[get_current_user] = _u
    app.dependency_overrides[get_optional_user] = _u
    app.dependency_overrides[get_current_admin] = lambda: (_ for _ in ()).throw(
        __import__("fastapi").HTTPException(status_code=403)) if state["as"] != "admin" else _u()
    app.dependency_overrides[require_admin_confirmed] = lambda: _u()
    with TestClient(app) as c:
        yield c, state, ids, lessons, courses
    app.dependency_overrides.clear()


def test_progress_blocked_on_locked_and_unpublished_lessons(ctx):
    c, state, ids, lessons, courses = ctx
    state["as"] = "a"
    body = {"completed": True, "position_seconds": 5}
    assert c.put(f"{BASE}/lessons/{lessons['pub']}/progress", json=body).status_code == 200
    assert c.put(f"{BASE}/lessons/{lessons['priv']}/progress", json=body).status_code == 403
    assert c.put(f"{BASE}/lessons/{lessons['draft']}/progress", json=body).status_code == 404
    assert c.put(f"{BASE}/lessons/999999/progress", json=body).status_code == 404
    with Session(engine) as s:
        rows = s.exec(select(LessonProgress).where(LessonProgress.lesson_id == lessons["priv"])).all()
        assert rows == []


def test_progress_is_per_user(ctx):
    c, state, ids, lessons, courses = ctx
    state["as"] = "b"
    assert c.get(f"{BASE}/me/progress").json() == []  # la progression de A reste privée
    state["as"] = "a"
    assert len(c.get(f"{BASE}/me/progress").json()) == 1


def test_private_and_draft_course_access(ctx):
    c, state, ids, lessons, courses = ctx
    state["as"] = "a"
    assert c.get(f"{BASE}/courses/{courses['draft']}").status_code == 404
    d = c.get(f"{BASE}/courses/{courses['priv']}").json()
    assert d["lessons"][0]["locked"] is True and d["lessons"][0]["youtube_id"] == ""
    assert all(x["id"] != courses["draft"] for x in c.get(f"{BASE}/courses").json())


def test_admin_endpoints_refused_to_non_admin(ctx):
    c, state, ids, lessons, courses = ctx
    state["as"] = "a"
    for method, url in (
        ("get", f"{BASE}/admin/courses"), ("get", f"{BASE}/admin/registrations"),
        ("get", f"{BASE}/admin/subscriptions"), ("get", f"{BASE}/admin/plans"),
    ):
        assert getattr(c, method)(url).status_code in (401, 403), url


def test_registration_repeat_does_not_duplicate(ctx):
    c, state, ids, lessons, courses = ctx
    state["as"] = "a"
    p = {"full_name": "Alice", "email": "a@p0.io", "course_id": courses["pub"]}
    r1 = c.post(f"{BASE}/registrations", json=p)
    r2 = c.post(f"{BASE}/registrations", json=p)
    assert r1.status_code == 201 and r2.status_code == 201
    assert r1.json()["id"] == r2.json()["id"]
    with Session(engine) as s:
        assert len(s.exec(select(TrainingRegistration).where(TrainingRegistration.email == "a@p0.io")).all()) == 1


def test_checkout_repeat_does_not_double_charge(ctx):
    c, state, ids, lessons, courses = ctx
    state["as"] = "a"
    body = {"plan_code": "pro", "period": "month", "method": "card"}
    r1 = c.post(f"{BASE}/checkout", json=body)
    r2 = c.post(f"{BASE}/checkout", json=body)
    assert r1.status_code == 201, r1.text
    assert r1.json()["id"] == r2.json()["id"]
    with Session(engine) as s:
        assert len(s.exec(select(LearningSubscription).where(LearningSubscription.user_id == ids["a"])).all()) == 1


def test_simulated_payment_never_grants_access_in_production(ctx, monkeypatch):
    c, state, ids, lessons, courses = ctx
    state["as"] = "b"
    monkeypatch.setattr(settings, "environment", "production")
    r = c.post(f"{BASE}/checkout", json={"plan_code": "pro", "period": "month", "method": "card"})
    assert r.status_code == 503
    with Session(engine) as s:
        subs = s.exec(select(LearningSubscription).where(LearningSubscription.user_id == ids["b"])).all()
        assert len(subs) == 1 and subs[0].status == "failed"
    # Aucun accès exclusif accordé
    monkeypatch.undo()
    d = c.get(f"{BASE}/courses/{courses['priv']}").json()
    assert d["has_exclusive_access"] is False


def test_course_with_progress_is_archived_not_deleted(ctx):
    c, state, ids, lessons, courses = ctx
    state["as"] = "admin"
    assert c.delete(f"{BASE}/admin/courses/{courses['pub']}").status_code == 204
    with Session(engine) as s:
        course = s.get(Course, courses["pub"])
        assert course is not None and course.is_published is False
        assert s.exec(select(LessonProgress).where(LessonProgress.lesson_id == lessons["pub"])).first() is not None
