"""H-Shopping — API publique : accueil, catégories, recherche produits,
boutiques, agences, devis du panier, suivi d'un colis."""
import math
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlmodel import Session, func, or_, select

from app.database import get_session
from app.deps import get_optional_user
from app.models import User
from app.services.rate_limit import limiter
from app.shopping import schemas as S
from app.shopping import views
from app.shopping.models import (
    Shop, ShopAgency, ShopCategory, ShopOrder, ShopOrderItem, ShopProduct, OrderEvent, ShopReview,
)
from app.shopping.services import build_quote, get_float

router = APIRouter(prefix="/api/v1/shopping", tags=["shopping"])

SORTS = {
    "new": ShopProduct.created_at.desc(),
    "price_asc": ShopProduct.price.asc(),
    "price_desc": ShopProduct.price.desc(),
    "popular": ShopProduct.sold_count.desc(),
    "rating": ShopProduct.rating_avg.desc(),
}


def _visible_products():
    return select(ShopProduct).join(Shop, Shop.id == ShopProduct.shop_id).where(
        ShopProduct.status == "active", Shop.status == "approved"
    )


def _cards(session: Session, rows, user: Optional[User]):
    favs = views.favorite_ids(session, user)
    cats = {c.id: c for c in session.exec(select(ShopCategory)).all()}
    shops: dict = {}
    out = []
    for p in rows:
        if p.shop_id not in shops:
            shops[p.shop_id] = session.get(Shop, p.shop_id)
        out.append(views.product_card(session, p, shops[p.shop_id], favs, cats))
    return out


@router.get("/categories", response_model=list[S.CategoryRead])
def categories(session: Session = Depends(get_session)):
    cats = session.exec(select(ShopCategory).where(ShopCategory.is_active == True).order_by(ShopCategory.sort_order, ShopCategory.name_fr)).all()  # noqa: E712
    counts = dict(session.exec(
        select(ShopProduct.category_id, func.count(ShopProduct.id)).join(Shop, Shop.id == ShopProduct.shop_id)
        .where(ShopProduct.status == "active", Shop.status == "approved").group_by(ShopProduct.category_id)
    ).all())
    by_parent: dict = {}
    for c in cats:
        by_parent.setdefault(c.parent_id, []).append(c.id)
    out = []
    for c in cats:  # le compteur d'une catégorie parente inclut ses sous-catégories
        n = counts.get(c.id, 0) + sum(counts.get(ch, 0) for ch in by_parent.get(c.id, []))
        out.append(views.category_read(session, c, {c.id: n}))
    return out


@router.get("/home", response_model=S.HomeResponse)
def home(session: Session = Depends(get_session), user: Optional[User] = Depends(get_optional_user)):
    base = _visible_products()
    featured = session.exec(base.where(ShopProduct.is_featured == True).order_by(ShopProduct.created_at.desc()).limit(8)).all()  # noqa: E712
    newest = session.exec(base.order_by(ShopProduct.created_at.desc()).limit(12)).all()
    best = session.exec(base.where(ShopProduct.sold_count > 0).order_by(ShopProduct.sold_count.desc()).limit(8)).all()
    shops = session.exec(
        select(Shop).where(Shop.status == "approved").order_by(Shop.is_featured.desc(), Shop.rating_avg.desc(), Shop.created_at.desc()).limit(8)
    ).all()
    stats = {
        "products": session.exec(select(func.count(ShopProduct.id)).join(Shop, Shop.id == ShopProduct.shop_id).where(ShopProduct.status == "active", Shop.status == "approved")).one(),
        "shops": session.exec(select(func.count(Shop.id)).where(Shop.status == "approved")).one(),
        "agencies": session.exec(select(func.count(ShopAgency.id)).where(ShopAgency.is_active == True)).one(),  # noqa: E712
    }
    return S.HomeResponse(
        categories=categories(session), featured=_cards(session, featured, user), newest=_cards(session, newest, user),
        best_sellers=_cards(session, best, user), shops=[views.shop_public(session, s) for s in shops], stats=stats,
        free_shipping_threshold=get_float(session, "free_shipping_threshold"),
    )


@router.get("/products", response_model=S.ProductPage)
def products(
    q: str = "", category: Optional[str] = None, shop: Optional[str] = None,
    min_price: Optional[float] = Query(default=None, ge=0), max_price: Optional[float] = Query(default=None, ge=0),
    in_stock: bool = False, sort: str = "new", page: int = Query(default=1, ge=1), page_size: int = Query(default=24, ge=1, le=60),
    session: Session = Depends(get_session), user: Optional[User] = Depends(get_optional_user),
):
    stmt = _visible_products()
    q = (q or "").strip()
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(
            func.lower(ShopProduct.title).like(like), func.lower(ShopProduct.description).like(like),
            func.lower(ShopProduct.tags).like(like), func.lower(ShopProduct.brand).like(like), func.lower(Shop.name).like(like),
        ))
    if category:
        cat = session.exec(select(ShopCategory).where(ShopCategory.slug == category)).first()
        if not cat:
            return S.ProductPage(items=[], total=0, page=1, pages=1)
        ids = [cat.id] + [c.id for c in session.exec(select(ShopCategory).where(ShopCategory.parent_id == cat.id)).all()]
        stmt = stmt.where(ShopProduct.category_id.in_(ids))
    if shop:
        stmt = stmt.where(Shop.slug == shop)
    if min_price is not None:
        stmt = stmt.where(ShopProduct.price >= min_price)
    if max_price is not None:
        stmt = stmt.where(ShopProduct.price <= max_price)
    if in_stock:
        stmt = stmt.where(ShopProduct.stock > 0)  # approximation : les variantes comptent via leur produit
    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
    rows = session.exec(stmt.order_by(SORTS.get(sort, SORTS["new"]), ShopProduct.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return S.ProductPage(items=_cards(session, rows, user), total=int(total), page=page, pages=max(1, math.ceil(total / page_size)))


@router.get("/products/{product_id}", response_model=S.ProductDetail)
def product_detail(product_id: int, session: Session = Depends(get_session), user: Optional[User] = Depends(get_optional_user)):
    p = session.get(ShopProduct, product_id)
    shop = session.get(Shop, p.shop_id) if p else None
    if not p or p.status != "active" or not shop or shop.status != "approved":
        raise HTTPException(status_code=404, detail="Produit introuvable.")
    return views.product_detail(session, p, user)


@router.get("/products/{product_id}/related", response_model=list[S.ProductCard])
def related(product_id: int, session: Session = Depends(get_session), user: Optional[User] = Depends(get_optional_user)):
    p = session.get(ShopProduct, product_id)
    if not p:
        return []
    stmt = _visible_products().where(ShopProduct.id != p.id)
    same = stmt.where(ShopProduct.category_id == p.category_id) if p.category_id else stmt
    rows = session.exec(same.order_by(ShopProduct.sold_count.desc()).limit(8)).all()
    if len(rows) < 4:
        extra = session.exec(stmt.where(ShopProduct.shop_id == p.shop_id).limit(8)).all()
        rows = list({r.id: r for r in [*rows, *extra]}.values())[:8]
    return _cards(session, rows, user)


@router.get("/products/{product_id}/reviews", response_model=list[S.ReviewRead])
def product_reviews(product_id: int, session: Session = Depends(get_session)):
    rows = session.exec(select(ShopReview).where(ShopReview.product_id == product_id, ShopReview.is_hidden == False).order_by(ShopReview.created_at.desc()).limit(50)).all()  # noqa: E712
    return [S.ReviewRead(id=r.id, author_name=r.author_name, rating=r.rating, comment=r.comment, seller_reply=r.seller_reply, created_at=r.created_at, product_id=r.product_id) for r in rows]


@router.get("/shops", response_model=list[S.ShopPublic])
def shops(q: str = "", session: Session = Depends(get_session)):
    stmt = select(Shop).where(Shop.status == "approved")
    if q.strip():
        stmt = stmt.where(func.lower(Shop.name).like(f"%{q.strip().lower()}%"))
    rows = session.exec(stmt.order_by(Shop.is_featured.desc(), Shop.rating_avg.desc(), Shop.name).limit(100)).all()
    return [views.shop_public(session, s) for s in rows]


@router.get("/shops/{slug}", response_model=S.ShopPublic)
def shop_detail(slug: str, session: Session = Depends(get_session)):
    s = session.exec(select(Shop).where(Shop.slug == slug)).first()
    if not s or s.status != "approved":
        raise HTTPException(status_code=404, detail="Boutique introuvable.")
    return views.shop_public(session, s)


@router.get("/shops/{slug}/reviews", response_model=list[S.ReviewRead])
def shop_reviews(slug: str, session: Session = Depends(get_session)):
    s = session.exec(select(Shop).where(Shop.slug == slug)).first()
    if not s or s.status != "approved":
        raise HTTPException(status_code=404, detail="Boutique introuvable.")
    rows = session.exec(select(ShopReview).where(ShopReview.shop_id == s.id, ShopReview.is_hidden == False).order_by(ShopReview.created_at.desc()).limit(50)).all()  # noqa: E712
    out = []
    for r in rows:
        p = session.get(ShopProduct, r.product_id)
        out.append(S.ReviewRead(id=r.id, author_name=r.author_name, rating=r.rating, comment=r.comment, seller_reply=r.seller_reply,
                                created_at=r.created_at, product_id=r.product_id, product_title=p.title if p else None))
    return out


@router.get("/agencies", response_model=list[S.AgencyRead])
def agencies(session: Session = Depends(get_session)):
    rows = session.exec(select(ShopAgency).where(ShopAgency.is_active == True).order_by(ShopAgency.city, ShopAgency.name)).all()  # noqa: E712
    return [views.agency_read(a) for a in rows]


@router.post("/cart/quote")
@limiter.limit("120/minute")
def quote(request: Request, payload: S.QuoteRequest, session: Session = Depends(get_session)):
    """Devis recalculé côté serveur (prix, stock, frais, remise, commission cachée)."""
    q = build_quote(session, payload.items, delivery_mode=payload.delivery_mode, agency_id=payload.agency_id, coupon_code=payload.coupon_code)
    for o in q["orders"]:  # la commission n'est pas une info acheteur
        o.pop("commission_rate", None); o.pop("commission_amount", None); o.pop("seller_net", None)
    return q


@router.get("/track/{code}", response_model=S.TrackingResponse)
@limiter.limit("30/minute")
def track(request: Request, code: str, phone: str = "", session: Session = Depends(get_session)):
    """Suivi public : numéro de commande (HS-XXXXXX) ou de colis + 4 derniers chiffres du téléphone du destinataire."""
    code = code.strip().upper()
    order = session.exec(select(ShopOrder).where((ShopOrder.code == code) | (ShopOrder.tracking_code == code))).first()
    digits = re.sub(r"\D", "", phone or "")
    if not order or len(digits) < 4 or not re.sub(r"\D", "", order.recipient_phone).endswith(digits[-4:]):
        raise HTTPException(status_code=404, detail="Aucune commande ne correspond à ces informations.")
    shop = session.get(Shop, order.shop_id)
    agency = session.get(ShopAgency, order.agency_id) if order.agency_id else None
    events = session.exec(select(OrderEvent).where(OrderEvent.order_id == order.id).order_by(OrderEvent.created_at, OrderEvent.id)).all()
    n = session.exec(select(func.coalesce(func.sum(ShopOrderItem.quantity), 0)).where(ShopOrderItem.order_id == order.id)).one()
    return S.TrackingResponse(
        code=order.code, status=order.status, shop_name=shop.name if shop else "", tracking_code=order.tracking_code,
        delivery_mode=order.delivery_mode, agency=views.agency_read(agency) if agency else None,
        events=[S.OrderEventRead.model_validate(e) for e in events], item_count=int(n),
        recipient_first_name=(order.recipient_name.split(" ")[0] if order.recipient_name else ""),
    )
