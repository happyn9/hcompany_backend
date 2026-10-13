"""H-Learning — bouquets payants : catalogue des formules, devises (monnaie
pivot), paiement, abonnements, membres d'une équipe et administration.

Les vidéos YouTube restent gratuites ; un bouquet donne en plus la
formation en présentiel et/ou le contenu exclusif en ligne."""
import logging
import re
import secrets
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, delete, func, select

from app.config import settings
from app.database import get_session
from app.deps import get_current_admin, get_current_user
from app.models import (
    CurrencyRate,
    LearningPlan,
    LearningSubscription,
    LearningSubscriptionMember,
    PaymentMethod,
    User,
)
from app.schemas import (
    AdminManualSubscription,
    AdminSubscriptionRead,
    AdminSubscriptionStatus,
    CheckoutCreate,
    CurrenciesWrite,
    CurrencyRead,
    MemberAdd,
    PlanAdminRead,
    PlanAdminWrite,
    PlanRead,
    PlansResponse,
    SubscriptionMemberRead,
    SubscriptionRead,
    _lines,
)
from app.services.learning_access import active_subscriptions, expire_overdue, period_end
from app.services.notifications import send_email
from app.services.payments import charge as charge_payment
from app.services.rate_limit import limiter

logger = logging.getLogger("hcompany.learning.plans")

router = APIRouter(prefix="/api/v1/learning", tags=["learning-plans"])

# Préfixes nationaux (sans le 0) par opérateur, pour repérer une erreur de
# saisie avant d'envoyer une demande de paiement au mauvais réseau.
OPERATOR_PREFIXES = {
    "zamtel_money": ("95",),
    "mtn_momo": ("96", "76"),
    "airtel_money": ("97", "77"),
}
OPERATOR_LABELS = {"zamtel_money": "Zamtel", "mtn_momo": "MTN", "airtel_money": "Airtel"}

DEFAULT_CURRENCIES = [
    # Taux indicatifs à ajuster dans l'admin : seul l'affichage en dépend,
    # la facturation se fait toujours dans la monnaie pivot.
    {"code": "ZMW", "label": "Kwacha zambien", "symbol": "K", "rate": 1.0},
    {"code": "USD", "label": "Dollar américain", "symbol": "$", "rate": 0.04},
    {"code": "CDF", "label": "Franc congolais", "symbol": "FC", "rate": 110.0},
]

DEFAULT_PLANS = [
    {
        "code": "individuel", "name": "Individuel", "audience": "individual", "sort_order": 1,
        "tagline": "Se former à son rythme, avec un vrai formateur.",
        "features": "Tous les cours exclusifs en ligne\nUne formation en présentiel au choix\nAttestation de participation\nSuivi par un formateur",
        "price_monthly": 150, "price_yearly": 1500, "per_seat": False, "min_seats": 1, "max_seats": 1,
    },
    {
        "code": "pro", "name": "Pro", "audience": "pro", "sort_order": 2, "highlight": True,
        "tagline": "Pour progresser vite et se faire accompagner de près.",
        "features": "Tout le bouquet Individuel\nSéances en présentiel illimitées\nParcours personnalisé\nAccès prioritaire aux nouveaux cours\nAide par WhatsApp",
        "price_monthly": 400, "price_yearly": 4000, "per_seat": False, "min_seats": 1, "max_seats": 1,
    },
    {
        "code": "equipe", "name": "Équipe", "audience": "team", "sort_order": 3,
        "tagline": "Former toute votre équipe, au même endroit, au même rythme.",
        "features": "Prix par personne, à partir de 5 personnes\nFormation en présentiel dans vos locaux ou chez nous\nContenu exclusif pour chaque membre\nSuivi de l'équipe et rapport d'avancement\nFacture au nom de l'entreprise",
        "price_monthly": 120, "price_yearly": 1200, "per_seat": True, "min_seats": 5, "max_seats": 200,
    },
]


def seed_learning_plans(session: Session) -> None:
    """Crée les devises et bouquets par défaut au premier démarrage."""
    if not session.exec(select(CurrencyRate)).first():
        session.add_all([CurrencyRate(**c) for c in DEFAULT_CURRENCIES])
    if not session.exec(select(LearningPlan)).first():
        session.add_all([LearningPlan(**p) for p in DEFAULT_PLANS])
    session.commit()


def _yearly_saving(plan: LearningPlan) -> int:
    full = plan.price_monthly * 12
    if full <= 0 or plan.price_yearly <= 0 or plan.price_yearly >= full:
        return 0
    return int(round((1 - plan.price_yearly / full) * 100))


def _plan_read(plan: LearningPlan) -> PlanRead:
    return PlanRead(
        id=plan.id, code=plan.code, name=plan.name, audience=plan.audience, tagline=plan.tagline,
        features=_lines(plan.features), price_monthly=plan.price_monthly, price_yearly=plan.price_yearly,
        yearly_saving_pct=_yearly_saving(plan), per_seat=plan.per_seat, min_seats=plan.min_seats,
        max_seats=plan.max_seats, includes_inperson=plan.includes_inperson,
        includes_exclusive=plan.includes_exclusive, highlight=plan.highlight,
    )


def _currencies(session: Session) -> list[CurrencyRate]:
    rows = session.exec(select(CurrencyRate).order_by(CurrencyRate.code)).all()
    pivot = settings.learning_pivot_currency
    rows = sorted(rows, key=lambda r: (r.code != pivot, r.code))
    return rows


def compute_amount(plan: LearningPlan, period: str, seats: int) -> tuple[float, int]:
    """Total en monnaie pivot, recalculé côté serveur — on ne fait jamais
    confiance à un montant envoyé par le navigateur. Retourne (montant, places)."""
    unit = plan.price_yearly if period == "year" else plan.price_monthly
    if plan.per_seat:
        if seats < plan.min_seats or seats > plan.max_seats:
            raise HTTPException(
                status_code=422,
                detail=f"Ce bouquet s'adresse à {plan.min_seats} à {plan.max_seats} personnes.",
            )
        return round(unit * seats, 2), seats
    return round(unit, 2), 1


# --------------------------------------------------------------------------
# Public : catalogue des bouquets et devises
# --------------------------------------------------------------------------

@router.get("/plans", response_model=PlansResponse)
def list_plans(session: Session = Depends(get_session)):
    plans = session.exec(
        select(LearningPlan).where(LearningPlan.is_active == True).order_by(LearningPlan.sort_order, LearningPlan.id)  # noqa: E712
    ).all()
    live = bool(
        (settings.zamtel_money_api_key and settings.zamtel_money_api_secret)
        or (settings.mtn_momo_subscription_key and settings.mtn_momo_api_key)
        or (settings.airtel_money_client_id and settings.airtel_money_client_secret)
    )
    return PlansResponse(
        test_mode=not live,
        pivot=settings.learning_pivot_currency,
        currencies=[CurrencyRead(code=c.code, label=c.label, symbol=c.symbol, rate=c.rate) for c in _currencies(session)],
        plans=[_plan_read(p) for p in plans],
    )


# --------------------------------------------------------------------------
# Paiement
# --------------------------------------------------------------------------

def normalize_zm_phone(raw: str) -> Optional[str]:
    """Numéro zambien → format national à 10 chiffres (0971234567), ou None."""
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("260") and len(digits) == 12:
        digits = "0" + digits[3:]
    elif len(digits) == 9:
        digits = "0" + digits
    return digits if re.fullmatch(r"0\d{9}", digits) else None


def _sub_read(session: Session, sub: LearningSubscription, viewer: Optional[User] = None) -> SubscriptionRead:
    members = session.exec(
        select(LearningSubscriptionMember).where(LearningSubscriptionMember.subscription_id == sub.id)
    ).all()
    data = SubscriptionRead.model_validate(sub)
    data.members = [SubscriptionMemberRead.model_validate(m) for m in members]
    if sub.ends_at and sub.status == "active":
        data.days_left = max(0, (sub.ends_at - datetime.utcnow()).days)
    data.is_owner = viewer is None or sub.user_id == viewer.id
    return data


@router.post("/checkout", response_model=SubscriptionRead, status_code=201)
@limiter.limit("20/hour")
def checkout(
    request: Request,
    payload: CheckoutCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    plan = session.exec(
        select(LearningPlan).where(LearningPlan.code == payload.plan_code, LearningPlan.is_active == True)  # noqa: E712
    ).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Bouquet introuvable.")
    amount, seats = compute_amount(plan, payload.period, payload.seats)
    if plan.audience == "team" and not (payload.org_name or "").strip():
        raise HTTPException(status_code=422, detail="Indiquez le nom de l'entreprise ou de l'équipe.")
    currency = payload.currency.upper()
    if not session.get(CurrencyRate, currency):
        currency = settings.learning_pivot_currency

    phone = None
    if payload.method in OPERATOR_PREFIXES:
        phone = normalize_zm_phone(payload.phone or "")
        if not phone:
            raise HTTPException(status_code=422, detail="Numéro de téléphone invalide (ex. 097 1234567).")
        if phone[1:3] not in OPERATOR_PREFIXES[payload.method]:
            raise HTTPException(
                status_code=422,
                detail=f"Ce numéro n'est pas un numéro {OPERATOR_LABELS[payload.method]}. Choisissez le bon opérateur.",
            )

    reference = "HL-" + secrets.token_hex(4).upper()
    sub = LearningSubscription(
        reference=reference, user_id=user.id, plan_id=plan.id, plan_code=plan.code, plan_name=plan.name,
        period=payload.period, seats=seats, org_name=(payload.org_name or "").strip() or None,
        amount_pivot=amount, pivot_currency=settings.learning_pivot_currency, display_currency=currency,
        includes_inperson=plan.includes_inperson, includes_exclusive=plan.includes_exclusive,
        method=payload.method, phone_number=phone,
    )
    session.add(sub)
    session.commit()
    session.refresh(sub)

    result = charge_payment(PaymentMethod(payload.method), amount, reference, phone)
    if not result.success:
        sub.status = "failed"
        sub.failure_reason = result.failure_reason or "Le paiement a été refusé."
        session.add(sub)
        session.commit()
        raise HTTPException(status_code=402, detail=sub.failure_reason)

    _activate(session, sub, simulated=result.simulated, provider_reference=result.provider_reference)
    _notify_activated(user, sub)
    return _sub_read(session, sub, user)


def _activate(session: Session, sub: LearningSubscription, *, simulated: bool, provider_reference: Optional[str]) -> None:
    """Active le bouquet. Si la personne a déjà un bouquet actif identique,
    la nouvelle période commence à la fin de l'actuelle (rien n'est perdu)."""
    now = datetime.utcnow()
    start = now
    current = session.exec(
        select(LearningSubscription).where(
            LearningSubscription.user_id == sub.user_id,
            LearningSubscription.plan_id == sub.plan_id,
            LearningSubscription.status == "active",
            LearningSubscription.ends_at > now,
            LearningSubscription.id != sub.id,
        ).order_by(LearningSubscription.ends_at.desc())
    ).first()
    if current and current.ends_at:
        start = current.ends_at
    sub.status = "active"
    sub.paid_at = now
    sub.starts_at = start
    sub.ends_at = period_end(start, sub.period)
    sub.simulated = simulated
    sub.provider_reference = provider_reference
    session.add(sub)
    session.commit()
    session.refresh(sub)


def _notify_activated(user: User, sub: LearningSubscription) -> None:
    try:
        ends = sub.ends_at.strftime("%d/%m/%Y") if sub.ends_at else ""
        send_email(
            user.email,
            f"H-Learning — Votre bouquet {sub.plan_name} est actif",
            f"Bonjour {user.full_name or ''},\n\n"
            f"Merci ! Votre bouquet « {sub.plan_name} » est actif jusqu'au {ends}.\n"
            f"Référence : {sub.reference} — montant : {sub.amount_pivot:.0f} {sub.pivot_currency}.\n\n"
            "Vous avez accès au contenu exclusif en ligne"
            + (" et à la formation en présentiel : notre équipe vous contactera pour fixer le lieu et les dates" if sub.includes_inperson else "")
            + ".\nAucun prélèvement automatique : nous vous préviendrons avant la fin de la période.\n\n"
            "— L'équipe H-Company",
        )
    except Exception as exc:  # noqa: BLE001 — le paiement est déjà enregistré
        logger.warning("E-mail d'activation du bouquet non envoyé : %s", exc)


# --------------------------------------------------------------------------
# Mon bouquet
# --------------------------------------------------------------------------

@router.get("/me/subscription")
def my_subscription(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Bouquet actif (titulaire ou membre) + historique d'achats."""
    expire_overdue(session)
    active = active_subscriptions(session, user)
    history = session.exec(
        select(LearningSubscription)
        .where(LearningSubscription.user_id == user.id)
        .order_by(LearningSubscription.created_at.desc())
    ).all()
    return {
        "active": _sub_read(session, active[0], user) if active else None,
        "history": [_sub_read(session, s, user) for s in history],
    }


def _owned_active(session: Session, user: User, sub_id: int) -> LearningSubscription:
    sub = session.get(LearningSubscription, sub_id)
    if not sub or sub.user_id != user.id:
        raise HTTPException(status_code=404, detail="Bouquet introuvable.")
    return sub


@router.post("/me/subscription/{sub_id}/members", response_model=SubscriptionRead, status_code=201)
def add_member(
    sub_id: int,
    payload: MemberAdd,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    sub = _owned_active(session, user, sub_id)
    if sub.status != "active":
        raise HTTPException(status_code=409, detail="Ce bouquet n'est pas actif.")
    email = payload.email.lower()
    if email == (user.email or "").lower():
        raise HTTPException(status_code=422, detail="Vous avez déjà accès avec votre propre compte.")
    count = session.exec(
        select(func.count(LearningSubscriptionMember.id)).where(LearningSubscriptionMember.subscription_id == sub.id)
    ).one()
    if count >= sub.seats - 1:
        raise HTTPException(status_code=409, detail="Toutes les places de ce bouquet sont utilisées.")
    exists = session.exec(
        select(LearningSubscriptionMember).where(
            LearningSubscriptionMember.subscription_id == sub.id, LearningSubscriptionMember.email == email
        )
    ).first()
    if not exists:
        session.add(LearningSubscriptionMember(subscription_id=sub.id, email=email))
        session.commit()
    return _sub_read(session, sub, user)


@router.delete("/me/subscription/{sub_id}/members/{member_id}", response_model=SubscriptionRead)
def remove_member(
    sub_id: int,
    member_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    sub = _owned_active(session, user, sub_id)
    member = session.get(LearningSubscriptionMember, member_id)
    if member and member.subscription_id == sub.id:
        session.delete(member)
        session.commit()
    return _sub_read(session, sub, user)


# --------------------------------------------------------------------------
# Administration
# --------------------------------------------------------------------------

def _admin_plan(session: Session, plan: LearningPlan) -> PlanAdminRead:
    n = session.exec(
        select(func.count(LearningSubscription.id)).where(
            LearningSubscription.plan_id == plan.id, LearningSubscription.status == "active"
        )
    ).one()
    return PlanAdminRead(
        id=plan.id, subscribers=int(n),
        **{k: getattr(plan, k) for k in PlanAdminWrite.model_fields},
    )


def _apply_plan(plan: LearningPlan, payload: PlanAdminWrite) -> None:
    if payload.max_seats < payload.min_seats:
        raise HTTPException(status_code=422, detail="Le maximum de places doit être au moins égal au minimum.")
    for key in PlanAdminWrite.model_fields:
        setattr(plan, key, getattr(payload, key))


@router.get("/admin/plans", response_model=list[PlanAdminRead])
def admin_list_plans(session: Session = Depends(get_session), _admin: User = Depends(get_current_admin)):
    plans = session.exec(select(LearningPlan).order_by(LearningPlan.sort_order, LearningPlan.id)).all()
    return [_admin_plan(session, p) for p in plans]


@router.post("/admin/plans", response_model=PlanAdminRead, status_code=201)
def admin_create_plan(
    payload: PlanAdminWrite,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    if session.exec(select(LearningPlan).where(LearningPlan.code == payload.code)).first():
        raise HTTPException(status_code=409, detail="Ce code est déjà utilisé.")
    plan = LearningPlan(code=payload.code, name=payload.name)
    _apply_plan(plan, payload)
    session.add(plan)
    session.commit()
    session.refresh(plan)
    return _admin_plan(session, plan)


@router.put("/admin/plans/{plan_id}", response_model=PlanAdminRead)
def admin_update_plan(
    plan_id: int,
    payload: PlanAdminWrite,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    plan = session.get(LearningPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Bouquet introuvable.")
    other = session.exec(select(LearningPlan).where(LearningPlan.code == payload.code, LearningPlan.id != plan_id)).first()
    if other:
        raise HTTPException(status_code=409, detail="Ce code est déjà utilisé.")
    _apply_plan(plan, payload)
    session.add(plan)
    session.commit()
    session.refresh(plan)
    return _admin_plan(session, plan)


@router.delete("/admin/plans/{plan_id}", status_code=204)
def admin_delete_plan(
    plan_id: int,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    """Un bouquet déjà acheté est désactivé (l'historique garde sa référence) ;
    sinon il est supprimé pour de bon."""
    plan = session.get(LearningPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Bouquet introuvable.")
    used = session.exec(select(func.count(LearningSubscription.id)).where(LearningSubscription.plan_id == plan_id)).one()
    if used:
        plan.is_active = False
        session.add(plan)
    else:
        session.delete(plan)
    session.commit()


@router.get("/admin/currencies", response_model=list[CurrencyRead])
def admin_list_currencies(session: Session = Depends(get_session), _admin: User = Depends(get_current_admin)):
    return [CurrencyRead(code=c.code, label=c.label, symbol=c.symbol, rate=c.rate) for c in _currencies(session)]


@router.put("/admin/currencies", response_model=list[CurrencyRead])
def admin_save_currencies(
    payload: CurrenciesWrite,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    pivot = settings.learning_pivot_currency
    codes = [c.code.upper() for c in payload.currencies]
    if len(set(codes)) != len(codes):
        raise HTTPException(status_code=422, detail="Une devise apparaît deux fois.")
    if pivot not in codes:
        raise HTTPException(status_code=422, detail=f"La monnaie pivot ({pivot}) doit rester dans la liste.")
    for item in payload.currencies:
        code = item.code.upper()
        row = session.get(CurrencyRate, code) or CurrencyRate(code=code)
        row.label, row.symbol = item.label, item.symbol
        row.rate = 1.0 if code == pivot else item.rate  # le pivot vaut toujours 1
        row.updated_at = datetime.utcnow()
        session.add(row)
    for row in session.exec(select(CurrencyRate)).all():
        if row.code not in codes:
            session.delete(row)
    session.commit()
    return [CurrencyRead(code=c.code, label=c.label, symbol=c.symbol, rate=c.rate) for c in _currencies(session)]


def _admin_sub(session: Session, sub: LearningSubscription) -> AdminSubscriptionRead:
    owner = session.get(User, sub.user_id)
    base = _sub_read(session, sub).model_dump()
    return AdminSubscriptionRead(**base, user_email=owner.email if owner else None, user_name=owner.full_name if owner else None)


@router.get("/admin/subscriptions", response_model=list[AdminSubscriptionRead])
def admin_list_subscriptions(
    status: Optional[str] = None,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    expire_overdue(session)
    stmt = select(LearningSubscription).order_by(LearningSubscription.created_at.desc())
    if status:
        stmt = stmt.where(LearningSubscription.status == status)
    return [_admin_sub(session, s) for s in session.exec(stmt).all()]


@router.post("/admin/subscriptions", response_model=AdminSubscriptionRead, status_code=201)
def admin_manual_subscription(
    payload: AdminManualSubscription,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    """Active un bouquet réglé en espèces ou en présentiel, sans passer par le paiement en ligne."""
    owner = session.exec(select(User).where(User.email == payload.user_email.lower())).first()
    if not owner:
        raise HTTPException(status_code=404, detail="Aucun compte avec cet e-mail : la personne doit d'abord créer son compte.")
    plan = session.exec(select(LearningPlan).where(LearningPlan.code == payload.plan_code)).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Bouquet introuvable.")
    amount, seats = compute_amount(plan, payload.period, payload.seats)
    sub = LearningSubscription(
        reference="HL-" + secrets.token_hex(4).upper(), user_id=owner.id, plan_id=plan.id, plan_code=plan.code,
        plan_name=plan.name, period=payload.period, seats=seats, org_name=(payload.org_name or "").strip() or None,
        amount_pivot=amount, pivot_currency=settings.learning_pivot_currency,
        display_currency=settings.learning_pivot_currency,
        includes_inperson=plan.includes_inperson, includes_exclusive=plan.includes_exclusive,
        method="cash", failure_reason=(payload.note or None),
    )
    session.add(sub)
    session.commit()
    session.refresh(sub)
    _activate(session, sub, simulated=False, provider_reference=None)
    _notify_activated(owner, sub)
    return _admin_sub(session, sub)


@router.patch("/admin/subscriptions/{sub_id}/status", response_model=AdminSubscriptionRead)
def admin_update_subscription(
    sub_id: int,
    payload: AdminSubscriptionStatus,
    session: Session = Depends(get_session),
    _admin: User = Depends(get_current_admin),
):
    sub = session.get(LearningSubscription, sub_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Abonnement introuvable.")
    if payload.status == "active" and sub.status != "active":
        _activate(session, sub, simulated=False, provider_reference=sub.provider_reference)
    else:
        sub.status = payload.status
        session.add(sub)
        session.commit()
        session.refresh(sub)
    return _admin_sub(session, sub)
