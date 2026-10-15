"""H-Shopping — administration : validation des boutiques, catégories,
agences, commandes et litiges, retraits, réglages, vue d'ensemble."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, func, select

from app.database import get_session
from app.deps import get_current_admin
from app.models import PartnerApplication, PartnerStatus, User
from app.shopping import schemas as S
from app.shopping import views
from app.shopping.models import (
    Coupon, Shop, ShopAgency, ShopCategory, ShopOrder, ShopPayout, ShopProduct, ShopReview, ShopSetting,
)
from app.shopping.services import (
    DEFAULT_SETTINGS, add_event, all_settings, auto_release_overdue, notify_user, refresh_review_stats,
    refund_order, release_escrow, unique_slug, slugify, commission_rate_for,
)
from app.shopping.routers.seller import _payout_read

router = APIRouter(prefix="/api/v1/shopping/admin", tags=["shopping-admin"])


# --- Vue d'ensemble ----------------------------------------------------------

@router.get("/overview", response_model=S.AdminOverview)
def overview(session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    auto_release_overdue(session)
    live = ("paid", "processing", "shipped", "delivered", "completed", "disputed")
    gmv = session.exec(select(func.coalesce(func.sum(ShopOrder.total), 0)).where(ShopOrder.status.in_(live))).one()
    comm = session.exec(select(func.coalesce(func.sum(ShopOrder.commission_amount), 0)).where(ShopOrder.escrow_status == "released")).one()
    held = session.exec(select(func.coalesce(func.sum(ShopOrder.total), 0)).where(ShopOrder.escrow_status == "held")).one()
    by_status = dict(session.exec(select(ShopOrder.status, func.count(ShopOrder.id)).group_by(ShopOrder.status)).all())
    return S.AdminOverview(
        gmv=round(float(gmv), 2), commission=round(float(comm), 2), escrow_held=round(float(held), 2),
        orders=sum(v for k, v in by_status.items() if k != "pending_payment"),
        shops_pending=session.exec(select(func.count(Shop.id)).where(Shop.status == "pending")).one(),
        shops_approved=session.exec(select(func.count(Shop.id)).where(Shop.status == "approved")).one(),
        products_active=session.exec(select(func.count(ShopProduct.id)).where(ShopProduct.status == "active")).one(),
        disputes_open=by_status.get("disputed", 0),
        payouts_pending=session.exec(select(func.count(ShopPayout.id)).where(ShopPayout.status == "requested")).one(),
        by_status=by_status,
    )


# --- Boutiques ---------------------------------------------------------------

def _admin_shop(session: Session, s: Shop) -> S.AdminShopRead:
    base = views.shop_owner_read(session, s).model_dump()
    owner = session.get(User, s.owner_id)
    n = session.exec(select(func.count(ShopOrder.id)).where(ShopOrder.shop_id == s.id, ShopOrder.status != "pending_payment")).one()
    rev = session.exec(select(func.coalesce(func.sum(ShopOrder.total), 0)).where(ShopOrder.shop_id == s.id, ShopOrder.escrow_status == "released")).one()
    return S.AdminShopRead(**base, owner_email=owner.email if owner else None, owner_name=owner.full_name if owner else None,
                           shop_commission_rate=s.commission_rate, orders_count=int(n), revenue=round(float(rev), 2))


@router.get("/shops", response_model=list[S.AdminShopRead])
def list_shops(status: Optional[str] = None, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    stmt = select(Shop)
    if status:
        stmt = stmt.where(Shop.status == status)
    return [_admin_shop(session, s) for s in session.exec(stmt.order_by(Shop.created_at.desc()).limit(300)).all()]


@router.patch("/shops/{shop_id}", response_model=S.AdminShopRead)
def update_shop_status(shop_id: int, payload: S.AdminShopStatus, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    s = session.get(Shop, shop_id)
    if not s:
        raise HTTPException(status_code=404, detail="Boutique introuvable.")
    if payload.status not in ("pending", "approved", "rejected", "suspended"):
        raise HTTPException(status_code=422, detail="Statut invalide.")
    if payload.status == "rejected" and not (payload.reason or "").strip():
        raise HTTPException(status_code=422, detail="Indiquez le motif du refus.")
    changed = s.status != payload.status
    s.status, s.status_reason = payload.status, (payload.reason or None)
    if payload.status == "approved" and not s.approved_at:
        s.approved_at = datetime.utcnow()
    if "commission_rate" in payload.model_fields_set:
        s.commission_rate = payload.commission_rate
    if payload.is_featured is not None:
        s.is_featured = payload.is_featured
    session.add(s)
    if changed:
        msg = {"approved": "Votre boutique est validée : vous pouvez publier vos produits.",
               "rejected": f"Votre demande de boutique est refusée : {payload.reason}",
               "suspended": f"Votre boutique est suspendue. {payload.reason or ''}"}.get(payload.status)
        if msg:
            owner = session.get(User, s.owner_id)
            notify_user(session, s.owner_id, f"Boutique « {s.name} »", msg, owner.email if owner else None)
    session.commit()
    session.refresh(s)
    return _admin_shop(session, s)


# --- Produits (modération) ---------------------------------------------------

@router.patch("/products/{product_id}")
def moderate_product(product_id: int, payload: S.ProductStatusPatch, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    p = session.get(ShopProduct, product_id)
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable.")
    data = payload.model_dump(exclude_unset=True)
    if data.get("status") in ("draft", "active", "archived"):
        p.status = data["status"]
    if "is_featured" in data:
        p.is_featured = bool(data["is_featured"])
    session.add(p)
    session.commit()
    return {"id": p.id, "status": p.status, "is_featured": p.is_featured}


@router.delete("/reviews/{review_id}", status_code=204)
def hide_review(review_id: int, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    r = session.get(ShopReview, review_id)
    if not r:
        raise HTTPException(status_code=404, detail="Avis introuvable.")
    r.is_hidden = True
    session.add(r)
    session.flush()
    refresh_review_stats(session, r.product_id, r.shop_id)
    session.commit()


# --- Catégories --------------------------------------------------------------

def _cat_admin(session: Session, c: ShopCategory) -> S.CategoryAdminRead:
    base = views.category_read(session, c).model_dump()
    return S.CategoryAdminRead(**base, commission_rate=c.commission_rate, is_active=c.is_active)


@router.get("/categories", response_model=list[S.CategoryAdminRead])
def admin_categories(session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    return [_cat_admin(session, c) for c in session.exec(select(ShopCategory).order_by(ShopCategory.sort_order, ShopCategory.name_fr)).all()]


@router.post("/categories", response_model=S.CategoryAdminRead, status_code=201)
def create_category(payload: S.CategoryWrite, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    if payload.parent_id and not session.get(ShopCategory, payload.parent_id):
        raise HTTPException(status_code=422, detail="Catégorie parente introuvable.")
    c = ShopCategory(slug=unique_slug(session, ShopCategory, payload.slug or payload.name_fr), name_fr=payload.name_fr.strip(),
                     name_en=payload.name_en.strip(), icon=payload.icon, parent_id=payload.parent_id,
                     commission_rate=payload.commission_rate, sort_order=payload.sort_order, is_active=payload.is_active)
    session.add(c)
    session.commit()
    session.refresh(c)
    return _cat_admin(session, c)


@router.put("/categories/{cat_id}", response_model=S.CategoryAdminRead)
def update_category(cat_id: int, payload: S.CategoryWrite, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    c = session.get(ShopCategory, cat_id)
    if not c:
        raise HTTPException(status_code=404, detail="Catégorie introuvable.")
    if payload.parent_id == c.id:
        raise HTTPException(status_code=422, detail="Une catégorie ne peut pas être son propre parent.")
    c.name_fr, c.name_en, c.icon, c.parent_id = payload.name_fr.strip(), payload.name_en.strip(), payload.icon, payload.parent_id
    c.commission_rate, c.sort_order, c.is_active = payload.commission_rate, payload.sort_order, payload.is_active
    session.add(c)
    session.commit()
    session.refresh(c)
    return _cat_admin(session, c)


@router.delete("/categories/{cat_id}", status_code=204)
def delete_category(cat_id: int, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    c = session.get(ShopCategory, cat_id)
    if not c:
        raise HTTPException(status_code=404, detail="Catégorie introuvable.")
    in_use = session.exec(select(func.count(ShopProduct.id)).where(ShopProduct.category_id == c.id)).one()
    has_children = session.exec(select(func.count(ShopCategory.id)).where(ShopCategory.parent_id == c.id)).one()
    if in_use or has_children:
        c.is_active = False  # on masque plutôt que casser les produits existants
        session.add(c)
    else:
        session.delete(c)
    session.commit()


# --- Agences -----------------------------------------------------------------

@router.get("/partners", response_model=list[S.PartnerChoice])
def partner_choices(session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    taken = {a.partner_application_id for a in session.exec(select(ShopAgency)).all()}
    rows = session.exec(select(PartnerApplication).where(PartnerApplication.status == PartnerStatus.approved).order_by(PartnerApplication.company)).all()
    return [S.PartnerChoice(id=p.id, company=p.company, category=p.category, already_agency=p.id in taken) for p in rows]


@router.get("/agencies", response_model=list[S.AgencyRead])
def admin_agencies(session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    return [views.agency_read(a) for a in session.exec(select(ShopAgency).order_by(ShopAgency.city, ShopAgency.name)).all()]


@router.post("/agencies", response_model=S.AgencyRead, status_code=201)
def create_agency(payload: S.AdminAgencyWrite, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    partner = session.get(PartnerApplication, payload.partner_application_id)
    if not partner or partner.status != PartnerStatus.approved:
        raise HTTPException(status_code=422, detail="Ce partenaire n'est pas approuvé.")
    if session.exec(select(ShopAgency).where(ShopAgency.partner_application_id == partner.id)).first():
        raise HTTPException(status_code=409, detail="Ce partenaire est déjà inscrit comme agence H-Shopping.")
    a = ShopAgency(**payload.model_dump())
    session.add(a)
    session.commit()
    session.refresh(a)
    return views.agency_read(a)


@router.put("/agencies/{agency_id}", response_model=S.AgencyRead)
def update_agency(agency_id: int, payload: S.AdminAgencyWrite, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    a = session.get(ShopAgency, agency_id)
    if not a:
        raise HTTPException(status_code=404, detail="Agence introuvable.")
    data = payload.model_dump()
    data.pop("partner_application_id")
    for k, v in data.items():
        setattr(a, k, v)
    session.add(a)
    session.commit()
    session.refresh(a)
    return views.agency_read(a)


# --- Commandes & litiges ------------------------------------------------------

@router.get("/orders", response_model=list[S.OrderRead])
def admin_orders(status: Optional[str] = None, q: str = "", session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    auto_release_overdue(session)
    stmt = select(ShopOrder).where(ShopOrder.status != "pending_payment")
    if status:
        stmt = stmt.where(ShopOrder.status == status)
    if q.strip():
        stmt = stmt.where(ShopOrder.code.like(f"%{q.strip().upper()}%"))
    return [views.order_read(session, o, viewer="admin") for o in session.exec(stmt.order_by(ShopOrder.created_at.desc()).limit(200)).all()]


@router.post("/orders/{code}/resolve", response_model=S.OrderRead)
def resolve(code: str, payload: S.AdminResolve, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    o = session.exec(select(ShopOrder).where(ShopOrder.code == code.upper())).first()
    if not o:
        raise HTTPException(status_code=404, detail="Commande introuvable.")
    if payload.decision == "release":
        release_escrow(session, o, actor="admin", note=payload.note)
    elif payload.decision == "refund":
        refund_order(session, o, actor="admin", reason=payload.note or "Remboursement décidé par H-Company")
    else:
        raise HTTPException(status_code=422, detail="Décision invalide.")
    o.dispute_note = payload.note or o.dispute_note
    session.add(o)
    session.commit()
    return views.order_read(session, o, viewer="admin")


# --- Retraits ----------------------------------------------------------------

@router.get("/payouts", response_model=list[S.PayoutRead])
def payouts(status: Optional[str] = None, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    stmt = select(ShopPayout)
    if status:
        stmt = stmt.where(ShopPayout.status == status)
    return [_payout_read(session, p) for p in session.exec(stmt.order_by(ShopPayout.created_at.desc()).limit(200)).all()]


@router.patch("/payouts/{payout_id}", response_model=S.PayoutRead)
def update_payout(payout_id: int, payload: S.AdminPayoutUpdate, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    p = session.get(ShopPayout, payout_id)
    if not p:
        raise HTTPException(status_code=404, detail="Retrait introuvable.")
    if p.status != "requested":
        raise HTTPException(status_code=409, detail="Ce retrait a déjà été traité.")
    if payload.status not in ("paid", "rejected"):
        raise HTTPException(status_code=422, detail="Statut invalide.")
    p.status, p.admin_note, p.processed_at = payload.status, payload.note, datetime.utcnow()
    session.add(p)
    shop = session.get(Shop, p.shop_id)
    if shop:
        notify_user(session, shop.owner_id, f"Retrait {p.reference}",
                    f"{p.amount:.2f} ZMW envoyés sur {p.phone}." if p.status == "paid" else f"Retrait refusé. {payload.note or ''}")
    session.commit()
    return _payout_read(session, p)


# --- Coupons plateforme -------------------------------------------------------

@router.get("/coupons", response_model=list[S.CouponRead])
def admin_coupons(session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    return session.exec(select(Coupon).where(Coupon.shop_id == None).order_by(Coupon.created_at.desc())).all()  # noqa: E711


@router.post("/coupons", response_model=S.CouponRead, status_code=201)
def create_admin_coupon(payload: S.CouponWrite, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    import re
    if bool(payload.percent) == bool(payload.amount):
        raise HTTPException(status_code=422, detail="Indiquez soit un pourcentage, soit un montant.")
    code = re.sub(r"[^A-Z0-9_-]", "", payload.code.upper())
    if len(code) < 3 or session.exec(select(Coupon).where(Coupon.code == code)).first():
        raise HTTPException(status_code=409, detail="Ce code est invalide ou déjà utilisé.")
    c = Coupon(code=code, shop_id=None, percent=payload.percent, amount=payload.amount, min_total=payload.min_total,
               max_uses=payload.max_uses, expires_at=payload.expires_at, is_active=payload.is_active)
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


@router.delete("/coupons/{coupon_id}", status_code=204)
def delete_admin_coupon(coupon_id: int, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    c = session.get(Coupon, coupon_id)
    if not c or c.shop_id is not None:
        raise HTTPException(status_code=404, detail="Code introuvable.")
    if c.used:
        c.is_active = False
        session.add(c)
    else:
        session.delete(c)
    session.commit()


# --- Réglages ----------------------------------------------------------------

@router.get("/settings")
def get_settings(session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    return all_settings(session)


@router.put("/settings")
def put_settings(payload: S.SettingsWrite, session: Session = Depends(get_session), _a: User = Depends(get_current_admin)):
    for key, value in payload.model_dump(exclude_none=True).items():
        if key not in DEFAULT_SETTINGS:
            continue
        row = session.get(ShopSetting, key) or ShopSetting(key=key)
        row.value = str(value)
        session.add(row)
    session.commit()
    return all_settings(session)
