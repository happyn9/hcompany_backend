"""Droits d'accès H-Learning : qui a un bouquet actif ?

Un compte a accès au contenu exclusif s'il est le titulaire d'un bouquet
actif (non expiré) ou s'il a été ajouté par e-mail à un bouquet équipe."""
from datetime import datetime, timedelta
from typing import Optional

from sqlmodel import Session, select

from app.models import LearningSubscription, LearningSubscriptionMember, User

PERIOD_DAYS = {"month": 30, "year": 365}


def period_end(start: datetime, period: str) -> datetime:
    return start + timedelta(days=PERIOD_DAYS.get(period, 30))


def active_subscriptions(session: Session, user: Optional[User]) -> list[LearningSubscription]:
    """Bouquets actifs d'un compte (titulaire ou membre), du plus long au plus court."""
    if user is None:
        return []
    now = datetime.utcnow()
    owned = session.exec(
        select(LearningSubscription).where(
            LearningSubscription.user_id == user.id,
            LearningSubscription.status == "active",
            LearningSubscription.ends_at > now,
        )
    ).all()
    shared = session.exec(
        select(LearningSubscription)
        .join(LearningSubscriptionMember, LearningSubscriptionMember.subscription_id == LearningSubscription.id)
        .where(
            LearningSubscriptionMember.email == (user.email or "").lower(),
            LearningSubscription.status == "active",
            LearningSubscription.ends_at > now,
        )
    ).all()
    seen, result = set(), []
    for sub in [*owned, *shared]:
        if sub.id not in seen:
            seen.add(sub.id)
            result.append(sub)
    return sorted(result, key=lambda s: s.ends_at or now, reverse=True)


def has_exclusive_access(session: Session, user: Optional[User]) -> bool:
    return any(s.includes_exclusive for s in active_subscriptions(session, user))


def has_inperson_access(session: Session, user: Optional[User]) -> bool:
    return any(s.includes_inperson for s in active_subscriptions(session, user))


def expire_overdue(session: Session) -> int:
    """Passe en « expired » les bouquets dont la date de fin est dépassée."""
    now = datetime.utcnow()
    rows = session.exec(
        select(LearningSubscription).where(
            LearningSubscription.status == "active", LearningSubscription.ends_at <= now
        )
    ).all()
    for sub in rows:
        sub.status = "expired"
        session.add(sub)
    if rows:
        session.commit()
    return len(rows)
