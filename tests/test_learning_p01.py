"""H-Learning Mission 0.1 : unicité de la progression, concurrence, passerelles de paiement (clés absentes /
invalides / présentes), réponses incertaines. SQLite jetable. Un fichier = un processus (cf. run_tests.sh)."""
import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "t.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_db}"
os.environ.setdefault("ENVIRONMENT", "development")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlmodel import SQLModel, Session, select  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import engine  # noqa: E402
from app.deps import get_current_user, get_optional_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Course, Lesson, LessonProgress, LearningSubscription, PaymentMethod, User, UserRole  # noqa: E402
from app.services.payments import gateway  # noqa: E402
from app.services.learning_access import has_exclusive_access  # noqa: E402
from tests.threads_util import run_parallel  # noqa: E402

BASE = "/api/v1/learning"
PHONES = {"airtel_money": "0971234567", "mtn_momo": "0961234567", "zamtel_money": "0951234567"}
KEYS = {
    "card": {"stripe_secret_key": "sk_test_x"},
    "airtel_money": {"airtel_money_client_id": "id", "airtel_money_client_secret": "sec"},
    "mtn_momo": {"mtn_momo_subscription_key": "sub", "mtn_momo_api_key": "key"},
    "zamtel_money": {"zamtel_money_api_key": "k", "zamtel_money_api_secret": "s"},
}


@pytest.fixture(scope="module")
def ctx():
    SQLModel.metadata.create_all(engine)
    ids = {}
    with Session(engine) as s:
        for i in range(12):
            u = User(email=f"u{i}@p01.io", full_name=f"u{i}", role=UserRole.client, is_verified=True)
            s.add(u)
            s.commit()
            s.refresh(u)
            ids[i] = u.id
        course = Course(title="Public", level="x", description="d", is_published=True)
        s.add(course)
        s.commit()
        s.refresh(course)
        lesson = Lesson(course_id=course.id, title="L", youtube_id="abc", is_published=True)
        s.add(lesson)
        s.commit()
        s.refresh(lesson)
        lesson_id = lesson.id
    state = {"as": 0}

    def _u():
        with Session(engine) as s:
            return s.get(User, ids[state["as"]])

    app.dependency_overrides[get_current_user] = _u
    app.dependency_overrides[get_optional_user] = _u
    with TestClient(app) as c:
        yield c, state, ids, lesson_id
    app.dependency_overrides.clear()


def _blank_keys(monkeypatch):
    for k in ("stripe_secret_key", "airtel_money_client_id", "airtel_money_client_secret", "mtn_momo_subscription_key",
              "mtn_momo_api_key", "zamtel_money_api_key", "zamtel_money_api_secret"):
        monkeypatch.setattr(settings, k, None)


# ---------------------------------------------------------------- progression : unicité & concurrence

def test_database_refuses_a_second_progress_row(ctx):
    c, state, ids, lesson_id = ctx
    with Session(engine) as s:
        s.add(LessonProgress(user_id=ids[0], lesson_id=lesson_id))
        s.commit()
    with pytest.raises(IntegrityError):
        with Session(engine) as s:
            s.add(LessonProgress(user_id=ids[0], lesson_id=lesson_id))
            s.commit()
    with Session(engine) as s:
        assert len(s.exec(select(LessonProgress).where(LessonProgress.user_id == ids[0])).all()) == 1


def test_concurrent_progress_saves_leave_one_row_and_keep_completion(ctx):
    c, state, ids, lesson_id = ctx
    state["as"] = 1
    url = f"{BASE}/lessons/{lesson_id}/progress"
    bodies = [{"completed": i == 3, "position_seconds": 10 + i} for i in range(8)]
    res = run_parallel([lambda b=b: c.put(url, json=b) for b in bodies])
    assert [r.status_code for r in res] == [200] * 8, [r.text for r in res if r.status_code != 200]
    with Session(engine) as s:
        rows = s.exec(select(LessonProgress).where(LessonProgress.user_id == ids[1])).all()
        assert len(rows) == 1
        assert rows[0].completed is True  # une leçon terminée le reste, quel que soit l'ordre d'arrivée


def test_progress_is_per_user_even_with_same_lesson(ctx):
    c, state, ids, lesson_id = ctx
    url = f"{BASE}/lessons/{lesson_id}/progress"
    for u in (2, 3):
        state["as"] = u
        assert c.put(url, json={"completed": u == 2, "position_seconds": u}).status_code == 200
    with Session(engine) as s:
        a = s.exec(select(LessonProgress).where(LessonProgress.user_id == ids[2])).one()
        b = s.exec(select(LessonProgress).where(LessonProgress.user_id == ids[3])).one()
        assert (a.completed, b.completed) == (True, False)


# ---------------------------------------------------------------- passerelles : clés absentes / invalides / présentes

@pytest.mark.parametrize("method", list(KEYS))
def test_gateway_keys_absent_simulates_outside_production_only_flagged(method, monkeypatch):
    _blank_keys(monkeypatch)
    r = gateway.charge(PaymentMethod(method), 10, "HL-X", PHONES.get(method))
    assert r.success and r.simulated and not r.unavailable and not r.uncertain


@pytest.mark.parametrize("method", list(KEYS))
def test_gateway_blank_or_whitespace_keys_count_as_absent(method, monkeypatch):
    _blank_keys(monkeypatch)
    for k in KEYS[method]:
        monkeypatch.setattr(settings, k, "   ")
    r = gateway.charge(PaymentMethod(method), 10, "HL-X", PHONES.get(method))
    assert r.simulated is True  # clés invalides ≠ clés réelles ; la garde de production (routers) refuse ensuite la simulation


@pytest.mark.parametrize("method", list(KEYS))
def test_gateway_keys_present_never_raises_and_never_succeeds(method, monkeypatch):
    _blank_keys(monkeypatch)
    for k, v in KEYS[method].items():
        monkeypatch.setattr(settings, k, v)
    r = gateway.charge(PaymentMethod(method), 10, "HL-X", PHONES.get(method))  # ne doit plus lever NotImplementedError
    assert r.success is False and r.simulated is False and r.unavailable is True and r.failure_reason


@pytest.mark.parametrize("method", list(KEYS))
def test_gateway_provider_error_is_uncertain_not_success(method, monkeypatch):
    def boom(*a, **k):
        raise TimeoutError("le fournisseur ne répond pas")
    monkeypatch.setattr(gateway, "_charge_card", boom)
    monkeypatch.setattr(gateway, "_charge_airtel_money", boom)
    monkeypatch.setattr(gateway, "_charge_mtn_momo", boom)
    monkeypatch.setattr(gateway, "_charge_zamtel_money", boom)
    r = gateway.charge(PaymentMethod(method), 10, "HL-X", PHONES.get(method))
    assert r.success is False and r.uncertain is True and r.simulated is False


def _checkout(c, method):
    body = {"plan_code": "pro", "period": "month", "method": method}
    if method in PHONES:
        body["phone"] = PHONES[method]
    return c.post(f"{BASE}/checkout", json=body)


def _subs(user_id):
    with Session(engine) as s:
        return s.exec(select(LearningSubscription).where(LearningSubscription.user_id == user_id)).all()


def _has_access(user_id):
    with Session(engine) as s:
        return has_exclusive_access(s, s.get(User, user_id))


@pytest.mark.parametrize("env", ["development", "production"])
@pytest.mark.parametrize("method", list(KEYS))
def test_checkout_with_keys_present_never_activates(ctx, monkeypatch, env, method):
    c, state, ids, lesson_id = ctx
    n = len([1 for _ in _subs(ids[4])])
    state["as"] = 4
    _blank_keys(monkeypatch)
    for k, v in KEYS[method].items():
        monkeypatch.setattr(settings, k, v)
    monkeypatch.setattr(settings, "environment", env)
    r = _checkout(c, method)
    assert r.status_code == 503, r.text  # propre : pas de 500
    new = _subs(ids[4])[n:]
    assert new and all(s.status == "failed" for s in new)
    assert _has_access(ids[4]) is False


@pytest.mark.parametrize("method", list(KEYS))
def test_checkout_production_without_keys_never_activates(ctx, monkeypatch, method):
    c, state, ids, lesson_id = ctx
    state["as"] = 5
    _blank_keys(monkeypatch)
    monkeypatch.setattr(settings, "environment", "production")
    r = _checkout(c, method)
    assert r.status_code == 503, r.text
    assert all(s.status == "failed" for s in _subs(ids[5])) and _has_access(ids[5]) is False


def test_checkout_uncertain_provider_answer_creates_no_paid_subscription_and_is_not_replayed(ctx, monkeypatch):
    c, state, ids, lesson_id = ctx
    state["as"] = 6
    calls = {"n": 0}

    def flaky(*a, **k):
        calls["n"] += 1
        raise ConnectionError("coupure réseau")
    monkeypatch.setattr(gateway, "_charge_card", flaky)
    r1 = _checkout(c, "card")
    r2 = _checkout(c, "card")  # double clic / nouvel essai : ne doit pas relancer un débit
    assert r1.status_code == 503 and "réf." in r1.json()["detail"]
    assert r2.status_code in (200, 201) and calls["n"] == 1
    subs = _subs(ids[6])
    assert len(subs) == 1 and subs[0].status == "pending" and _has_access(ids[6]) is False


def test_checkout_declined_payment_is_failed_402(ctx, monkeypatch):
    c, state, ids, lesson_id = ctx
    state["as"] = 7
    monkeypatch.setattr(gateway, "_charge_card", lambda *a, **k: gateway.PaymentResult(success=False, simulated=False, failure_reason="Carte refusée"))
    r = _checkout(c, "card")
    assert r.status_code == 402
    assert [s.status for s in _subs(ids[7])] == ["failed"] and _has_access(ids[7]) is False


def test_checkout_dev_without_keys_still_works_for_testing(ctx, monkeypatch):
    c, state, ids, lesson_id = ctx
    state["as"] = 8
    _blank_keys(monkeypatch)
    monkeypatch.setattr(settings, "environment", "development")
    r = _checkout(c, "card")
    assert r.status_code == 201, r.text
    assert [s.status for s in _subs(ids[8])] == ["active"] and _has_access(ids[8]) is True
