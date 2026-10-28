from sqlmodel import Session, SQLModel, create_engine
import app.agents  # noqa: F401  (tables)
from app.models import User
from app.services.identity import resolve_local_user


def _session():
    e = create_engine("sqlite://")
    SQLModel.metadata.create_all(e)
    return Session(e)


def test_uid_collision_does_not_leak_other_profile():
    s = _session()
    owner = User(email="owner@example.com", auth_uid=1, is_verified=True, full_name="Owner")
    s.add(owner); s.commit()
    other = resolve_local_user(s, uid=1, email="guest@example.com")
    assert other.email == "guest@example.com" and other.id != owner.id
    again = resolve_local_user(s, uid=1, email="owner@example.com")
    assert again.id == owner.id and again.email == "owner@example.com"


def test_email_case_and_normal_flow():
    s = _session()
    u = resolve_local_user(s, uid=5, email="A@Example.com")
    assert resolve_local_user(s, uid=5, email="a@example.com").id == u.id
