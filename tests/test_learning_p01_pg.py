"""H-Learning Mission 0.1 sur un VRAI PostgreSQL : requêtes de progression simultanées (threads) + contrainte d'unicité.

Test DESTRUCTIF PROTÉGÉ (tests/pg_safety.py) : crée puis supprime son propre schéma `hfood_a1_<hex>` ; ne touche ni à
`public` ni aux autres schémas. Il ne s'exécute que si toutes les conditions sont réunies, sinon il ÉCHOUE :
    HFOOD_TEST_PG_URL=postgresql://postgres@127.0.0.1:54331/hfood_test_xxx \\
    HFOOD_TEST_PG_CONFIRM=detruire-schema-test:hfood_test_xxx python -m pytest tests/test_learning_p01_pg.py -q
Sans HFOOD_TEST_PG_URL, le fichier est ignoré. Il doit tourner dans son propre processus (cf. run_tests.sh)."""
import atexit
import os

import pytest

from tests import pg_safety as safety
from tests.threads_util import run_parallel

PG = os.environ.get(safety.ENV_URL, "").strip()
if not PG:
    pytest.skip("HFOOD_TEST_PG_URL non défini : test PostgreSQL non exécuté", allow_module_level=True)

_ENV_BEFORE = dict(os.environ)
_RESTORE = safety.EnvRestore("DATABASE_URL", "ENVIRONMENT")
atexit.register(_RESTORE.restore)
TARGET = safety.check_test_url(PG, environ=_ENV_BEFORE)
safety.require_confirmation(TARGET, environ=_ENV_BEFORE)
SCHEMA = safety.new_schema_name()
os.environ["DATABASE_URL"] = safety.scoped_url(TARGET, SCHEMA)
os.environ.setdefault("ENVIRONMENT", "development")

import sqlalchemy as sa  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlmodel import SQLModel, Session, select  # noqa: E402

from app.database import engine  # noqa: E402
from app.deps import get_current_user, get_optional_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Course, Lesson, LessonProgress, User, UserRole  # noqa: E402

BASE = "/api/v1/learning"
N = 10


@pytest.fixture(scope="module")
def ctx():
    safety.create_schema(engine, SCHEMA)
    SQLModel.metadata.create_all(engine)
    ids = {}
    with Session(engine) as s:
        for i in range(3):
            u = User(email=f"pg{i}@p01.io", full_name=f"pg{i}", role=UserRole.client, is_verified=True)
            s.add(u)
            s.commit()
            s.refresh(u)
            ids[i] = u.id
        c = Course(title="C", level="x", description="d", is_published=True)
        s.add(c)
        s.commit()
        s.refresh(c)
        lessons = []
        for k in range(3):
            l = Lesson(course_id=c.id, title=f"L{k}", youtube_id=f"y{k}", is_published=True)
            s.add(l)
            s.commit()
            s.refresh(l)
            lessons.append(l.id)
    state = {"as": 0}

    def _u():
        with Session(engine) as s:
            return s.get(User, ids[state["as"]])

    app.dependency_overrides[get_current_user] = _u
    app.dependency_overrides[get_optional_user] = _u
    try:
        with TestClient(app) as c:
            yield c, state, ids, lessons
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
        e = sa.create_engine(safety.scoped_url(TARGET, SCHEMA))
        try:
            safety.drop_schema(e, SCHEMA)
        finally:
            e.dispose()


def test_postgres_enforces_one_progress_row_per_user_and_lesson(ctx):
    c, state, ids, lessons = ctx
    with Session(engine) as s:
        s.add(LessonProgress(user_id=ids[2], lesson_id=lessons[0]))
        s.commit()
    with pytest.raises(IntegrityError):
        with Session(engine) as s:
            s.add(LessonProgress(user_id=ids[2], lesson_id=lessons[0]))
            s.commit()


def test_concurrent_first_saves_create_exactly_one_row_without_error(ctx):
    c, state, ids, lessons = ctx
    state["as"] = 0
    url = f"{BASE}/lessons/{lessons[0]}/progress"
    res = run_parallel([lambda i=i: c.put(url, json={"completed": i == 4, "position_seconds": i}) for i in range(N)])
    assert [r.status_code for r in res] == [200] * N, [r.text[:120] for r in res if r.status_code != 200]
    with Session(engine) as s:
        rows = s.exec(select(LessonProgress).where(LessonProgress.user_id == ids[0], LessonProgress.lesson_id == lessons[0])).all()
        assert len(rows) == 1 and rows[0].completed is True


def test_concurrent_saves_for_different_lessons_do_not_interfere(ctx):
    c, state, ids, lessons = ctx
    state["as"] = 1
    tasks = [lambda l=l: c.put(f"{BASE}/lessons/{l}/progress", json={"completed": False, "position_seconds": 7}) for l in lessons for _ in range(4)]
    res = run_parallel(tasks)
    assert {r.status_code for r in res} == {200}
    with Session(engine) as s:
        rows = s.exec(select(LessonProgress).where(LessonProgress.user_id == ids[1])).all()
        assert sorted(r.lesson_id for r in rows) == sorted(lessons)
