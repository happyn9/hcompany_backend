"""Conversion modèles → schémas de lecture (cartes produit, commandes...)."""
from datetime import datetime, timedelta
from typing import Optional

from sqlmodel import Session, func, select

from app.models import User
from app.shopping import schemas as S
from app.shopping.models import (
    Favorite, Shop, ShopAgency, ShopCategory, ShopOrder, ShopOrderItem, ShopProduct, OrderEvent, ShopReview,
)
from app.shopping.services import (
    available_stock, get_float, product_images, product_variants, commission_rate_for,
)


def shop_mini(shop: Shop) -> S.ShopMini:
    return S.ShopMini(id=shop.id, slug=shop.slug, name=shop.name, logo=shop.logo_path, city=shop.city,
                      rating_avg=shop.rating_avg, rating_count=shop.rating_count)


def discount_pct(price: float, compare: Optional[float]) -> int:
    return int(round((compare - price) / compare * 100)) if compare and compare > price else 0


def effective_price(session: Session, p: ShopProduct) -> float:
    """Prix « à partir de » : le plus bas des variantes actives, sinon le prix du produit."""
    variants = product_variants(session, p.id, only_active=True)
    prices = [v.price if v.price is not None else p.price for v in variants]
    return min(prices) if prices else p.price


def parse_colors(text: str) -> list[dict]:
    out = []
    for part in (text or "").split(","):
        if ":" in part:
            n, h = part.rsplit(":", 1)
            if n.strip() and h.strip():
                out.append({"name": n.strip(), "hex": h.strip().lower()})
    return out


def product_card(session: Session, p: ShopProduct, shop: Optional[Shop] = None, favs: Optional[set] = None,
                 cats: Optional[dict] = None) -> S.ProductCard:
    shop = shop or session.get(Shop, p.shop_id)
    imgs = product_images(session, p.id)
    cat = (cats or {}).get(p.category_id) if cats is not None else (session.get(ShopCategory, p.category_id) if p.category_id else None)
    variants = product_variants(session, p.id, only_active=True)
    price = effective_price(session, p)
    return S.ProductCard(
        id=p.id, title=p.title, price=price, compare_at_price=p.compare_at_price if not variants else None,
        discount_pct=discount_pct(price, p.compare_at_price) if not variants else 0,
        image=imgs[0] if imgs else None, shop=shop_mini(shop), category_id=p.category_id,
        category_name=cat.name_fr if cat else None, rating_avg=p.rating_avg, rating_count=p.rating_count,
        sold_count=p.sold_count, in_stock=available_stock(session, p) > 0, has_variants=bool(variants),
        is_favorite=bool(favs and p.id in favs), colors=parse_colors(p.colors), model3d=p.model3d,
    )


def favorite_ids(session: Session, user: Optional[User]) -> set:
    if user is None:
        return set()
    return {f.product_id for f in session.exec(select(Favorite).where(Favorite.user_id == user.id)).all()}


def category_read(session: Session, c: ShopCategory, counts: Optional[dict] = None) -> S.CategoryRead:
    n = (counts or {}).get(c.id)
    if n is None:
        n = session.exec(select(func.count(ShopProduct.id)).where(ShopProduct.category_id == c.id, ShopProduct.status == "active")).one()
    return S.CategoryRead(id=c.id, slug=c.slug, name_fr=c.name_fr, name_en=c.name_en or c.name_fr, icon=c.icon,
                          parent_id=c.parent_id, sort_order=c.sort_order, product_count=int(n))


def parse_attributes(text: str) -> list[dict]:
    out = []
    for line in (text or "").splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            if k.strip() and v.strip():
                out.append({"label": k.strip(), "value": v.strip()})
    return out


def product_detail(session: Session, p: ShopProduct, user: Optional[User] = None, owner: bool = False):
    shop = session.get(Shop, p.shop_id)
    variants = product_variants(session, p.id, only_active=not owner)
    cat = session.get(ShopCategory, p.category_id) if p.category_id else None
    price = effective_price(session, p)
    has_var = bool([v for v in variants if v.is_active])
    data = dict(
        id=p.id, title=p.title, description=p.description, price=price if not owner else p.price,
        compare_at_price=p.compare_at_price, discount_pct=discount_pct(p.price, p.compare_at_price),
        images=product_images(session, p.id),
        variants=[S.VariantRead(id=v.id, label=v.label, sku=v.sku, price=v.price if v.price is not None else p.price,
                                stock=v.stock, is_active=v.is_active) for v in variants],
        stock=available_stock(session, p), in_stock=available_stock(session, p) > 0, brand=p.brand, sku=p.sku,
        weight_kg=p.weight_kg, attributes=parse_attributes(p.attributes), colors=parse_colors(p.colors), model3d=p.model3d,
        tags=[t.strip() for t in (p.tags or "").split(",") if t.strip()],
        category=category_read(session, cat) if cat else None, shop=shop_mini(shop),
        rating_avg=p.rating_avg, rating_count=p.rating_count, sold_count=p.sold_count,
        is_favorite=p.id in favorite_ids(session, user), created_at=p.created_at, status=p.status,
    )
    if owner:
        data["price"] = p.price
        data["stock"] = p.stock if not has_var else sum(v.stock for v in variants if v.is_active)
        return S.ProductOwnerRead(**data, category_id=p.category_id)
    return S.ProductDetail(**data)


def agency_read(a: ShopAgency) -> S.AgencyRead:
    return S.AgencyRead(id=a.id, name=a.name, city=a.city, address=a.address, phone=a.phone, hours=a.hours,
                        pickup_fee=a.pickup_fee, home_fee=a.home_fee, is_active=a.is_active)


def shop_public(session: Session, s: Shop) -> S.ShopPublic:
    count = session.exec(select(func.count(ShopProduct.id)).where(ShopProduct.shop_id == s.id, ShopProduct.status == "active")).one()
    sold = session.exec(select(func.coalesce(func.sum(ShopProduct.sold_count), 0)).where(ShopProduct.shop_id == s.id)).one()
    return S.ShopPublic(
        id=s.id, slug=s.slug, name=s.name, tagline=s.tagline, description=s.description, logo=s.logo_path,
        banner=s.banner_path, city=s.city, address=s.address, phone=s.phone, whatsapp=s.whatsapp, email=s.email,
        rating_avg=s.rating_avg, rating_count=s.rating_count, product_count=int(count), sold_count=int(sold),
        is_partner=s.partner_application_id is not None, is_featured=s.is_featured, created_at=s.created_at,
    )


def shop_owner_read(session: Session, s: Shop) -> S.ShopOwnerRead:
    base = shop_public(session, s).model_dump()
    return S.ShopOwnerRead(
        **base, status=s.status, status_reason=s.status_reason, dispatch_agency_id=s.dispatch_agency_id,
        mobile_money_operator=s.mobile_money_operator, mobile_money_phone=s.mobile_money_phone,
        commission_rate=commission_rate_for(session, s), partner_application_id=s.partner_application_id,
    )


def order_read(session: Session, o: ShopOrder, *, viewer: str = "buyer") -> S.OrderRead:
    """`viewer` : buyer | seller | admin — les montants de commission ne sont
    montrés qu'au vendeur et à l'admin."""
    shop = session.get(Shop, o.shop_id)
    items = session.exec(select(ShopOrderItem).where(ShopOrderItem.order_id == o.id).order_by(ShopOrderItem.id)).all()
    reviewed = {r.product_id for r in session.exec(select(ShopReview).where(ShopReview.order_id == o.id)).all()}
    events = session.exec(select(OrderEvent).where(OrderEvent.order_id == o.id).order_by(OrderEvent.created_at, OrderEvent.id)).all()
    agency = session.get(ShopAgency, o.agency_id) if o.agency_id else None
    now = datetime.utcnow()
    window = timedelta(days=int(get_float(session, "dispute_window_days")))
    release_days = timedelta(days=int(get_float(session, "auto_release_days")))
    data = S.OrderRead(
        id=o.id, code=o.code, status=o.status, shop=shop_mini(shop),
        items=[S.OrderItemRead(**{**i.model_dump(), "reviewed": i.product_id in reviewed}) for i in items],
        events=[S.OrderEventRead.model_validate(e) for e in events],
        subtotal=o.subtotal, discount=o.discount, delivery_fee=o.delivery_fee, total=o.total, coupon_code=o.coupon_code,
        delivery_mode=o.delivery_mode, agency=agency_read(agency) if agency else None,
        recipient_name=o.recipient_name, recipient_phone=o.recipient_phone, address=o.address, city=o.city, note=o.note,
        escrow_status=o.escrow_status, tracking_code=o.tracking_code, dispute_reason=o.dispute_reason,
        dispute_note=o.dispute_note, cancel_reason=o.cancel_reason, created_at=o.created_at, paid_at=o.paid_at,
        shipped_at=o.shipped_at, delivered_at=o.delivered_at, completed_at=o.completed_at,
        can_confirm=o.status in ("shipped", "delivered") and o.escrow_status == "held",
        can_cancel=o.status in ("paid", "processing"),
        can_dispute=o.status in ("shipped", "delivered") and o.escrow_status == "held"
        and (o.delivered_at is None or now - o.delivered_at <= window),
        auto_release_at=(o.delivered_at + release_days) if o.delivered_at and o.escrow_status == "held" and o.status == "delivered" else None,
    )
    if viewer in ("seller", "admin"):
        data.commission_amount = o.commission_amount
        data.seller_net = o.seller_net
        buyer = session.get(User, o.buyer_id)
        data.buyer_name = (buyer.full_name or buyer.email) if buyer else None
    return data
