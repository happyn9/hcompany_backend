"""Logique métier H-Shopping : réglages, devis du panier, création des
commandes, cycle de vie, séquestre, colis Lukondo, solde vendeur, avis."""
from __future__ import annotations

import logging
import re
import secrets
import unicodedata
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session, func, select

from app.lukondo.models import Parcel, ParcelStatus
from app.lukondo.utils import generate_reference_code
from app.models import ActivityCategory, PartnerActivity, User
from app.services.notifications import create_in_app_notification, send_email
from app.shopping.models import (
    CheckoutGroup,
    Coupon,
    OrderEvent,
    Shop,
    ShopAgency,
    ShopOrder,
    ShopCategory,
    ShopOrderItem,
    ShopPayout,
    ShopProduct,
    ShopProductImage,
    ShopProductVariant,
    ShopReview,
    ShopSetting,
)

logger = logging.getLogger("hcompany.shopping")

# --- Réglages ---------------------------------------------------------------

DEFAULT_SETTINGS = {
    "commission_rate": "8",          # % prélevé sur les articles vendus
    "free_shipping_threshold": "0",  # 0 = désactivé (sur le sous-total d'une boutique)
    "auto_release_days": "7",        # libération auto du séquestre après livraison
    "dispute_window_days": "7",      # délai pour ouvrir un litige après livraison
    "min_payout": "50",              # retrait minimum (monnaie pivot)
    "max_items_per_order": "50",
}


def get_setting(session: Session, key: str) -> str:
    row = session.get(ShopSetting, key)
    return row.value if row else DEFAULT_SETTINGS.get(key, "")


def get_float(session: Session, key: str) -> float:
    try:
        return float(get_setting(session, key))
    except ValueError:
        return float(DEFAULT_SETTINGS.get(key, "0"))


def all_settings(session: Session) -> dict:
    data = dict(DEFAULT_SETTINGS)
    for row in session.exec(select(ShopSetting)).all():
        data[row.key] = row.value
    return data


def money(x: float) -> float:
    return round(float(x) + 1e-9, 2)


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text or "boutique"


def unique_slug(session: Session, model, base: str) -> str:
    base = slugify(base)[:60]
    slug, n = base, 2
    while session.exec(select(model).where(model.slug == slug)).first():
        slug = f"{base}-{n}"
        n += 1
    return slug


def commission_rate_for(session: Session, shop: Shop, category_rate: Optional[float] = None) -> float:
    """Taux appliqué : boutique > catégorie > global."""
    if shop.commission_rate is not None:
        return float(shop.commission_rate)
    if category_rate is not None:
        return float(category_rate)
    return get_float(session, "commission_rate")


# --- Catalogue --------------------------------------------------------------

def product_images(session: Session, product_id: int) -> list[str]:
    rows = session.exec(
        select(ShopProductImage).where(ShopProductImage.product_id == product_id).order_by(ShopProductImage.sort_order, ShopProductImage.id)
    ).all()
    return [r.path for r in rows]


def product_variants(session: Session, product_id: int, only_active: bool = False) -> list[ShopProductVariant]:
    q = select(ShopProductVariant).where(ShopProductVariant.product_id == product_id)
    if only_active:
        q = q.where(ShopProductVariant.is_active == True)  # noqa: E712
    return session.exec(q.order_by(ShopProductVariant.id)).all()


def available_stock(session: Session, product: ShopProduct) -> int:
    variants = product_variants(session, product.id, only_active=True)
    return sum(v.stock for v in variants) if variants else product.stock


def refresh_review_stats(session: Session, product_id: Optional[int], shop_id: Optional[int]) -> None:
    if product_id:
        avg, n = session.exec(
            select(func.avg(ShopReview.rating), func.count(ShopReview.id)).where(
                ShopReview.product_id == product_id, ShopReview.is_hidden == False  # noqa: E712
            )
        ).one()
        p = session.get(ShopProduct, product_id)
        if p:
            p.rating_avg, p.rating_count = round(float(avg or 0), 2), int(n or 0)
            session.add(p)
    if shop_id:
        avg, n = session.exec(
            select(func.avg(ShopReview.rating), func.count(ShopReview.id)).where(
                ShopReview.shop_id == shop_id, ShopReview.is_hidden == False  # noqa: E712
            )
        ).one()
        s = session.get(Shop, shop_id)
        if s:
            s.rating_avg, s.rating_count = round(float(avg or 0), 2), int(n or 0)
            session.add(s)


# --- Devis du panier --------------------------------------------------------

def _resolve_line(session: Session, item) -> tuple[ShopProduct, Optional[ShopProductVariant], float, int]:
    product = session.get(ShopProduct, item.product_id)
    if not product or product.status != "active":
        raise HTTPException(status_code=422, detail="Un article de votre panier n'est plus disponible.")
    shop = session.get(Shop, product.shop_id)
    if not shop or shop.status != "approved":
        raise HTTPException(status_code=422, detail=f"La boutique de « {product.title} » n'accepte plus de commandes.")
    variants = product_variants(session, product.id, only_active=True)
    variant = None
    if variants:
        variant = next((v for v in variants if v.id == item.variant_id), None)
        if not variant:
            raise HTTPException(status_code=422, detail=f"Choisissez une option pour « {product.title} ».")
        stock, price = variant.stock, (variant.price if variant.price is not None else product.price)
    else:
        stock, price = product.stock, product.price
    qty = int(item.quantity)
    if qty < 1:
        raise HTTPException(status_code=422, detail="Quantité invalide.")
    if qty > stock:
        label = f"{product.title}" + (f" ({variant.label})" if variant else "")
        raise HTTPException(
            status_code=409,
            detail=f"Stock insuffisant pour « {label} » : {stock} disponible(s)." if stock else f"« {label} » est en rupture de stock.",
        )
    return product, variant, float(price), qty


def validate_coupon(session: Session, code: str, shop_ids: set[int], subtotal_by_shop: dict[int, float]) -> Coupon:
    coupon = session.exec(select(Coupon).where(Coupon.code == code.strip().upper())).first()
    now = datetime.utcnow()
    if not coupon or not coupon.is_active:
        raise HTTPException(status_code=422, detail="Code promo invalide.")
    if coupon.expires_at and coupon.expires_at < now:
        raise HTTPException(status_code=422, detail="Ce code promo a expiré.")
    if coupon.max_uses is not None and coupon.used >= coupon.max_uses:
        raise HTTPException(status_code=422, detail="Ce code promo a atteint sa limite d'utilisation.")
    if coupon.shop_id is not None:
        if coupon.shop_id not in shop_ids:
            raise HTTPException(status_code=422, detail="Ce code promo ne s'applique à aucun article de votre panier.")
        base = subtotal_by_shop.get(coupon.shop_id, 0)
    else:
        base = sum(subtotal_by_shop.values())
    if base < coupon.min_total:
        raise HTTPException(status_code=422, detail=f"Ce code demande un panier d'au moins {coupon.min_total:.0f}.")
    return coupon


def build_quote(
    session: Session,
    items: list,
    *,
    delivery_mode: str,
    agency_id: Optional[int],
    coupon_code: Optional[str] = None,
) -> dict:
    """Devis complet, recalculé côté serveur : jamais de prix venant du client."""
    if not items:
        raise HTTPException(status_code=422, detail="Votre panier est vide.")
    if len(items) > int(get_float(session, "max_items_per_order")):
        raise HTTPException(status_code=422, detail="Trop d'articles dans le panier.")
    if delivery_mode not in ("agency_pickup", "home_delivery"):
        raise HTTPException(status_code=422, detail="Mode de livraison invalide.")

    agency = None
    if agency_id is not None:
        agency = session.get(ShopAgency, agency_id)
        if not agency or not agency.is_active:
            raise HTTPException(status_code=422, detail="Cette agence n'est pas disponible.")
    if agency is None:
        raise HTTPException(status_code=422, detail="Choisissez une agence de retrait ou de livraison.")
    if delivery_mode == "home_delivery" and agency.home_fee is None:
        raise HTTPException(status_code=422, detail="Cette agence ne livre pas à domicile.")
    base_fee = agency.pickup_fee if delivery_mode == "agency_pickup" else float(agency.home_fee or 0)

    grouped: dict[int, dict] = {}
    merged: dict[tuple, object] = {}
    for it in items:  # fusionne les doublons produit+variante
        key = (it.product_id, it.variant_id)
        if key in merged:
            merged[key].quantity += it.quantity
        else:
            merged[key] = it.model_copy() if hasattr(it, "model_copy") else it
    for it in merged.values():
        product, variant, price, qty = _resolve_line(session, it)
        shop = session.get(Shop, product.shop_id)
        g = grouped.setdefault(shop.id, {"shop": shop, "lines": [], "subtotal": 0.0})
        imgs = product_images(session, product.id)
        g["lines"].append({
            "product_id": product.id, "variant_id": variant.id if variant else None,
            "title": product.title, "variant_label": variant.label if variant else "",
            "image": imgs[0] if imgs else None, "unit_price": money(price), "quantity": qty,
            "line_total": money(price * qty), "category_id": product.category_id,
        })
        g["subtotal"] += price * qty

    subtotal_by_shop = {sid: g["subtotal"] for sid, g in grouped.items()}
    coupon = validate_coupon(session, coupon_code, set(grouped), subtotal_by_shop) if coupon_code else None
    free_threshold = get_float(session, "free_shipping_threshold")

    orders = []
    total_all = 0.0
    for sid, g in grouped.items():
        shop: Shop = g["shop"]
        subtotal = money(g["subtotal"])
        discount = 0.0
        platform_funded = False
        if coupon:
            if coupon.shop_id == sid:
                applicable = subtotal
            elif coupon.shop_id is None:
                applicable = subtotal
                platform_funded = True
            else:
                applicable = 0
            if applicable:
                if coupon.percent:
                    discount = applicable * coupon.percent / 100
                elif coupon.amount:
                    if coupon.shop_id is None:  # montant fixe réparti au prorata
                        share = subtotal / max(sum(subtotal_by_shop.values()), 1)
                        discount = coupon.amount * share
                    else:
                        discount = coupon.amount
                discount = money(min(discount, subtotal))
        fee = 0.0 if (free_threshold and subtotal - discount >= free_threshold) else float(base_fee)
        # Commission : par ligne (taux de la catégorie si défini), sur le prix avant remise
        # quand la remise est financée par la plateforme, après remise sinon.
        gross_comm = 0.0
        for ln in g["lines"]:
            cat = session.get(ShopCategoryModel, ln["category_id"]) if ln["category_id"] else None
            rate = commission_rate_for(session, shop, cat.commission_rate if cat else None)
            gross_comm += ln["line_total"] * rate / 100
        ratio = 1.0 if platform_funded or subtotal == 0 else (subtotal - discount) / subtotal
        commission = money(gross_comm * ratio)
        base_amount = subtotal if platform_funded else subtotal - discount
        eff_rate = money(commission / base_amount * 100) if base_amount else 0
        total = money(subtotal - discount + fee)
        orders.append({
            "shop": {"id": shop.id, "slug": shop.slug, "name": shop.name, "logo": shop.logo_path},
            "lines": g["lines"], "subtotal": subtotal, "discount": discount, "delivery_fee": money(fee),
            "total": total, "commission_rate": eff_rate, "commission_amount": commission,
            "seller_net": money(base_amount - commission),
        })
        total_all += total
    return {
        "orders": orders, "total": money(total_all),
        "delivery_mode": delivery_mode,
        "agency": {"id": agency.id, "name": agency.name, "city": agency.city, "address": agency.address},
        "coupon": coupon.code if coupon else None,
    }


# importé tardivement pour éviter une dépendance circulaire dans les annotations
from app.shopping.models import ShopCategory as ShopCategoryModel  # noqa: E402


# --- Commandes --------------------------------------------------------------

EVENT_LABELS = {
    "pending_payment": "Commande créée — en attente de paiement",
    "paid": "Paiement reçu — fonds sécurisés par H-Company",
    "processing": "La boutique prépare votre commande",
    "shipped": "Colis confiée à l'agence",
    "delivered": "Commande remise",
    "completed": "Réception confirmée — le vendeur est payé",
    "cancelled": "Commande annulée",
    "refunded": "Commande remboursée",
    "disputed": "Litige ouvert — H-Company examine le dossier",
}


def add_event(session: Session, order: ShopOrder, status: str, *, label: Optional[str] = None, note: str = "", actor: str = "system") -> None:
    session.add(OrderEvent(order_id=order.id, status=status, label=label or EVENT_LABELS.get(status, status), note=note, actor=actor))


def new_order_code(session: Session) -> str:
    for _ in range(10):
        code = "HS-" + secrets.token_hex(3).upper()
        if not session.exec(select(ShopOrder).where(ShopOrder.code == code)).first():
            return code
    raise HTTPException(status_code=500, detail="Impossible de générer la référence de commande.")


def notify_user(session: Session, user_id: Optional[int], title: str, body: str, email: Optional[str] = None) -> None:
    """Notification en base + e-mail ; ne bloque jamais le flux métier."""
    try:
        if user_id:
            create_in_app_notification(session, user_id, title, body)
        if email:
            send_email(email, f"H-Shopping — {title}", f"{body}\n\n— H-Shopping, par H-Company")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Notification H-Shopping non envoyée : %s", exc)


def create_orders_from_quote(
    session: Session, quote: dict, buyer: User, *, recipient_name: str, recipient_phone: str,
    address: str, city: str, note: str, method: str, phone: str, coupon: Optional[Coupon],
) -> tuple[CheckoutGroup, list[ShopOrder]]:
    """Crée le groupe de paiement + une commande par boutique, et réserve le stock."""
    group = CheckoutGroup(
        reference="HSP-" + secrets.token_hex(4).upper(), buyer_id=buyer.id,
        total=quote["total"], method=method, phone_number=phone,
    )
    session.add(group)
    session.flush()
    orders: list[ShopOrder] = []
    for o in quote["orders"]:
        order = ShopOrder(
            code=new_order_code(session), group_id=group.id, shop_id=o["shop"]["id"], buyer_id=buyer.id,
            subtotal=o["subtotal"], discount=o["discount"], delivery_fee=o["delivery_fee"], total=o["total"],
            commission_rate=o["commission_rate"], commission_amount=o["commission_amount"], seller_net=o["seller_net"],
            coupon_code=quote["coupon"] if (o["discount"] and quote["coupon"]) else None,
            delivery_mode=quote["delivery_mode"], agency_id=quote["agency"]["id"],
            recipient_name=recipient_name, recipient_phone=recipient_phone, address=address, city=city, note=note,
        )
        session.add(order)
        session.flush()
        for ln in o["lines"]:
            session.add(ShopOrderItem(
                order_id=order.id, product_id=ln["product_id"], variant_id=ln["variant_id"], title=ln["title"],
                variant_label=ln["variant_label"], image_path=ln["image"], unit_price=ln["unit_price"],
                quantity=ln["quantity"], line_total=ln["line_total"],
            ))
            _adjust_stock(session, ln["product_id"], ln["variant_id"], -ln["quantity"])
        add_event(session, order, "pending_payment", actor="buyer")
        orders.append(order)
    if coupon:
        coupon.used += 1
        session.add(coupon)
    return group, orders


def _adjust_stock(session: Session, product_id: Optional[int], variant_id: Optional[int], delta: int) -> None:
    if variant_id:
        v = session.get(ShopProductVariant, variant_id)
        if v:
            v.stock = max(0, v.stock + delta)
            session.add(v)
    elif product_id:
        p = session.get(ShopProduct, product_id)
        if p:
            p.stock = max(0, p.stock + delta)
            session.add(p)


def restock_order(session: Session, order: ShopOrder) -> None:
    for it in session.exec(select(ShopOrderItem).where(ShopOrderItem.order_id == order.id)).all():
        _adjust_stock(session, it.product_id, it.variant_id, it.quantity)


def mark_group_paid(session: Session, group: CheckoutGroup, *, simulated: bool, provider_reference: Optional[str]) -> list[ShopOrder]:
    now = datetime.utcnow()
    group.status, group.paid_at, group.simulated, group.provider_reference = "paid", now, simulated, provider_reference
    session.add(group)
    orders = session.exec(select(ShopOrder).where(ShopOrder.group_id == group.id)).all()
    for order in orders:
        order.status, order.paid_at, order.escrow_status = "paid", now, "held"
        session.add(order)
        add_event(session, order, "paid", note=f"Réf. paiement {group.reference}")
        shop = session.get(Shop, order.shop_id)
        for it in session.exec(select(ShopOrderItem).where(ShopOrderItem.order_id == order.id)).all():
            if it.product_id:
                p = session.get(ShopProduct, it.product_id)
                if p:
                    p.sold_count += it.quantity
                    session.add(p)
        if shop:
            owner = session.get(User, shop.owner_id)
            notify_user(
                session, shop.owner_id, f"Nouvelle commande {order.code}",
                f"{order.recipient_name} a commandé pour {order.total:.0f} ZMW. Préparez la commande depuis votre tableau de bord.",
                owner.email if owner else None,
            )
    return orders


def fail_group(session: Session, group: CheckoutGroup, reason: str) -> None:
    group.status, group.failure_reason = "failed", reason
    session.add(group)
    for order in session.exec(select(ShopOrder).where(ShopOrder.group_id == group.id)).all():
        order.status, order.cancel_reason = "cancelled", reason
        session.add(order)
        restock_order(session, order)
        add_event(session, order, "cancelled", note=reason)


# --- Cycle de vie -----------------------------------------------------------

def _agency_partner_id(session: Session, order: ShopOrder) -> Optional[int]:
    agency = session.get(ShopAgency, order.agency_id) if order.agency_id else None
    return agency.partner_application_id if agency else None


def create_parcel_for_order(session: Session, order: ShopOrder) -> Parcel:
    """Crée le colis Lukondo qui représente la commande chez l'agence."""
    partner_id = _agency_partner_id(session, order)
    if partner_id is None:
        raise HTTPException(status_code=409, detail="Aucune agence n'est rattachée à cette commande.")
    shop = session.get(Shop, order.shop_id)
    parcel = None
    for _ in range(10):
        code = generate_reference_code("HS")
        if not session.exec(select(Parcel).where(Parcel.reference_code == code)).first():
            parcel = Parcel(
                reference_code=code, partner_application_id=partner_id,
                sender_name=shop.name if shop else "H-Shopping",
                recipient_name=order.recipient_name, recipient_phone=order.recipient_phone,
            )
            break
    if parcel is None:
        raise HTTPException(status_code=500, detail="Impossible de générer le numéro de colis.")
    session.add(parcel)
    session.flush()
    order.parcel_id, order.tracking_code = parcel.id, parcel.reference_code
    session.add(order)
    session.add(PartnerActivity(
        partner_application_id=partner_id, category=ActivityCategory.parcel,
        label=f"Colis H-Shopping {parcel.reference_code} à réceptionner",
        detail=f"Commande {order.code} · {order.recipient_name} ({order.recipient_phone})",
    ))
    return parcel


PARCEL_TO_ORDER = {
    "received": ("shipped", "Colis reçu à l'agence"),
    "in_transit": ("shipped", "Colis en transit"),
    "available": ("shipped", None),   # libellé selon le mode de livraison
    "picked_up": ("delivered", None),
}


def apply_parcel_status(session: Session, order: ShopOrder, parcel_status: str, *, actor: str = "agency", note: str = "") -> None:
    """Répercute l'état du colis sur la commande + frise de suivi."""
    target, label = PARCEL_TO_ORDER.get(parcel_status, (None, None))
    if target is None or order.status in ("completed", "cancelled", "refunded", "disputed"):
        return
    home = order.delivery_mode == "home_delivery"
    if parcel_status == "available":
        label = "En cours de livraison à votre adresse" if home else "Disponible au retrait à l'agence"
    if parcel_status == "picked_up":
        label = "Livré à votre adresse" if home else "Retiré à l'agence"
    now = datetime.utcnow()
    if target == "delivered":
        if order.status == "delivered":
            return
        order.status, order.delivered_at = "delivered", now
    else:
        order.status = "shipped"
        order.shipped_at = order.shipped_at or now
    session.add(order)
    add_event(session, order, target, label=label, note=note, actor=actor)
    try:
        notify_user(session, order.buyer_id, f"Commande {order.code}", label or "", None)
    except Exception:  # noqa: BLE001
        pass


def sync_order_from_parcel(session: Session, parcel: Parcel) -> None:
    """Appelé par le module Lukondo quand l'agence met à jour un colis."""
    order = session.exec(select(ShopOrder).where(ShopOrder.parcel_id == parcel.id)).first()
    if order:
        apply_parcel_status(session, order, parcel.status.value if hasattr(parcel.status, "value") else str(parcel.status))


def release_escrow(session: Session, order: ShopOrder, *, actor: str, note: str = "") -> None:
    if order.escrow_status != "held":
        raise HTTPException(status_code=409, detail="Les fonds de cette commande ne sont pas en séquestre.")
    now = datetime.utcnow()
    order.escrow_status, order.escrow_released_at = "released", now
    order.status, order.completed_at = "completed", now
    session.add(order)
    add_event(session, order, "completed", actor=actor, note=note)
    shop = session.get(Shop, order.shop_id)
    if shop:
        notify_user(session, shop.owner_id, f"Paiement libéré — {order.code}",
                    f"{order.seller_net:.2f} ZMW sont disponibles dans votre solde.")


def refund_order(session: Session, order: ShopOrder, *, actor: str, reason: str, status: str = "refunded") -> None:
    if order.escrow_status != "held":
        raise HTTPException(status_code=409, detail="Aucun fonds en séquestre à rembourser pour cette commande.")
    order.escrow_status, order.status, order.cancel_reason = "refunded", status, reason
    session.add(order)
    restock_order(session, order)
    add_event(session, order, status, actor=actor, note=reason)
    notify_user(session, order.buyer_id, f"Remboursement — {order.code}",
                f"Votre commande est {'annulée' if status == 'cancelled' else 'remboursée'} : {order.total:.2f} ZMW vous seront restitués sur votre mobile money.")


def auto_release_overdue(session: Session) -> int:
    """Libère les fonds des commandes livrées depuis plus de N jours sans
    litige. À brancher sur un cron ; appelé aussi à l'ouverture du tableau
    vendeur pour que le solde reste à jour sans tâche planifiée."""
    days = int(get_float(session, "auto_release_days"))
    limit = datetime.utcnow() - timedelta(days=days)
    rows = session.exec(
        select(ShopOrder).where(ShopOrder.status == "delivered", ShopOrder.escrow_status == "held", ShopOrder.delivered_at < limit)
    ).all()
    for o in rows:
        release_escrow(session, o, actor="system", note=f"Libération automatique ({days} jours sans litige)")
    if rows:
        session.commit()
    return len(rows)


# --- Solde vendeur ----------------------------------------------------------

def wallet(session: Session, shop_id: int) -> dict:
    released = session.exec(
        select(func.coalesce(func.sum(ShopOrder.seller_net), 0)).where(ShopOrder.shop_id == shop_id, ShopOrder.escrow_status == "released")
    ).one()
    pending = session.exec(
        select(func.coalesce(func.sum(ShopOrder.seller_net), 0)).where(
            ShopOrder.shop_id == shop_id, ShopOrder.escrow_status == "held"
        )
    ).one()
    out = session.exec(
        select(func.coalesce(func.sum(ShopPayout.amount), 0)).where(ShopPayout.shop_id == shop_id, ShopPayout.status.in_(("requested", "paid")))
    ).one()
    paid = session.exec(
        select(func.coalesce(func.sum(ShopPayout.amount), 0)).where(ShopPayout.shop_id == shop_id, ShopPayout.status == "paid")
    ).one()
    return {
        "available": money(float(released) - float(out)), "pending": money(float(pending)),
        "total_earned": money(float(released)), "total_paid_out": money(float(paid)),
        "min_payout": get_float(session, "min_payout"),
    }


# --- Données de départ ------------------------------------------------------

DEFAULT_CATEGORIES = [
    ("mode", "Mode & vêtements", "Fashion & clothing", "shirt", ["Femme", "Homme", "Chaussures", "Accessoires"]),
    ("electronique", "Électronique & téléphones", "Electronics & phones", "smartphone", ["Téléphones", "Ordinateurs", "Audio", "Accessoires tech"]),
    ("maison", "Maison & meubles", "Home & furniture", "sofa", ["Meubles", "Cuisine", "Décoration", "Literie"]),
    ("beaute", "Beauté & santé", "Beauty & health", "sparkles", ["Soins", "Cheveux", "Parfums"]),
    ("alimentation", "Alimentation & boissons", "Food & drinks", "utensils", []),
    ("artisanat", "Artisanat & art africain", "African crafts & art", "palette", []),
    ("enfants", "Enfants & bébés", "Kids & babies", "baby", []),
    ("sport", "Sport & loisirs", "Sports & leisure", "dumbbell", []),
    ("livres", "Livres & papeterie", "Books & stationery", "book-open", []),
    ("auto", "Auto, moto & outils", "Auto, moto & tools", "car", []),
]


def seed_shopping(session: Session) -> None:
    """Catégories de départ ; réglages par défaut gérés par DEFAULT_SETTINGS."""
    if session.exec(select(ShopCategory)).first():
        return
    for i, (slug, fr, en, icon, subs) in enumerate(DEFAULT_CATEGORIES):
        parent = ShopCategory(slug=slug, name_fr=fr, name_en=en, icon=icon, sort_order=i)
        session.add(parent)
        session.flush()
        for j, sub in enumerate(subs):
            session.add(ShopCategory(slug=f"{slug}-{slugify(sub)}", name_fr=sub, name_en=sub, icon=icon, parent_id=parent.id, sort_order=j))
    session.commit()
