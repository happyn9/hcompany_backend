"""H-Shopping — côté acheteur : paiement (séquestre), commandes, suivi,
confirmation de réception, litiges, avis, favoris."""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select

from app.config import settings
from app.database import get_session
from app.deps import get_current_user
from app.models import PaymentMethod, User
from app.routers.learning_plans import OPERATOR_LABELS, OPERATOR_PREFIXES, normalize_zm_phone
from app.services.payments import charge as charge_payment
from app.services.rate_limit import limiter
from app.shopping import schemas as S
from app.shopping import views
from app.shopping.models import (
    Coupon, Favorite, Shop, ShopOrder, ShopOrderItem, ShopProduct, ShopReview, CheckoutGroup,
)
from app.shopping.services import (
    add_event, build_quote, create_orders_from_quote, fail_group, get_float, mark_group_paid, notify_user,
    refund_order, release_escrow, refresh_review_stats,
)

router = APIRouter(prefix="/api/v1/shopping", tags=["shopping-buyer"])


@router.post("/checkout", response_model=S.CheckoutResponse, status_code=201)
@limiter.limit("30/hour")
def checkout(request: Request, payload: S.CheckoutRequest, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    if payload.method not in OPERATOR_PREFIXES:
        raise HTTPException(status_code=422, detail="Choisissez un moyen de paiement mobile money.")
    phone = normalize_zm_phone(payload.phone)
    if not phone:
        raise HTTPException(status_code=422, detail="Numéro mobile money invalide (ex. 097 1234567).")
    if phone[1:3] not in OPERATOR_PREFIXES[payload.method]:
        raise HTTPException(status_code=422, detail=f"Ce numéro n'est pas un numéro {OPERATOR_LABELS[payload.method]}. Choisissez le bon opérateur.")
    if payload.delivery_mode == "home_delivery" and len(payload.address) < 5:
        raise HTTPException(status_code=422, detail="Indiquez votre adresse de livraison.")

    quote = build_quote(session, payload.items, delivery_mode=payload.delivery_mode, agency_id=payload.agency_id, coupon_code=payload.coupon_code)
    coupon = session.exec(select(Coupon).where(Coupon.code == payload.coupon_code.strip().upper())).first() if payload.coupon_code else None
    own = [o for o in quote["orders"] if session.get(Shop, o["shop"]["id"]).owner_id == user.id]
    if own:
        raise HTTPException(status_code=422, detail="Vous ne pouvez pas acheter dans votre propre boutique.")

    group, orders = create_orders_from_quote(
        session, quote, user, recipient_name=payload.recipient_name, recipient_phone=payload.recipient_phone,
        address=payload.address, city=payload.city, note=payload.note, method=payload.method, phone=phone, coupon=coupon,
    )
    session.commit()

    result = charge_payment(PaymentMethod(payload.method), quote["total"], group.reference, phone)
    if not result.success:
        fail_group(session, group, result.failure_reason or "Le paiement a été refusé.")
        session.commit()
        raise HTTPException(status_code=402, detail=group.failure_reason)
    orders = mark_group_paid(session, group, simulated=result.simulated, provider_reference=result.provider_reference)
    session.commit()
    try:
        from app.services.notifications import send_email
        lines = "\n".join(f"• {o.code} — {session.get(Shop, o.shop_id).name} : {o.total:.2f} ZMW" for o in orders)
        send_email(user.email, "H-Shopping — Commande confirmée",
                   f"Bonjour {user.full_name or ''},\n\nMerci pour votre commande ! Votre paiement est sécurisé : le vendeur n'est payé "
                   f"qu'après votre confirmation de réception.\n\n{lines}\n\nSuivez vos colis sur votre compte H-Shopping.\n\n— H-Shopping, par H-Company")
    except Exception:  # noqa: BLE001
        pass
    return S.CheckoutResponse(reference=group.reference, total=group.total, status=group.status, simulated=group.simulated,
                              orders=[views.order_read(session, o) for o in orders])


# --- Mes commandes ----------------------------------------------------------

def _my_order(session: Session, code: str, user: User) -> ShopOrder:
    o = session.exec(select(ShopOrder).where(ShopOrder.code == code.upper(), ShopOrder.buyer_id == user.id)).first()
    if not o:
        raise HTTPException(status_code=404, detail="Commande introuvable.")
    return o


@router.get("/me/orders", response_model=list[S.OrderRead])
def my_orders(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = session.exec(select(ShopOrder).where(ShopOrder.buyer_id == user.id, ShopOrder.status != "pending_payment").order_by(ShopOrder.created_at.desc())).all()
    return [views.order_read(session, o) for o in rows]


@router.get("/me/orders/{code}", response_model=S.OrderRead)
def my_order(code: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    return views.order_read(session, _my_order(session, code, user))


@router.post("/me/orders/{code}/confirm", response_model=S.OrderRead)
def confirm_receipt(code: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    o = _my_order(session, code, user)
    if o.status not in ("shipped", "delivered"):
        raise HTTPException(status_code=409, detail="Vous pourrez confirmer la réception une fois le colis expédié.")
    if o.status == "shipped":  # l'acheteur a le colis en main avant que l'agence ne le marque remis
        o.status, o.delivered_at = "delivered", o.delivered_at or datetime.utcnow()
        add_event(session, o, "delivered", label="Réception signalée par l'acheteur", actor="buyer")
    release_escrow(session, o, actor="buyer")
    session.commit()
    return views.order_read(session, o)


@router.post("/me/orders/{code}/cancel", response_model=S.OrderRead)
def cancel_order(code: str, payload: S.CancelRequest, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    o = _my_order(session, code, user)
    if o.status not in ("paid", "processing"):
        raise HTTPException(status_code=409, detail="Cette commande ne peut plus être annulée : elle est déjà expédiée.")
    refund_order(session, o, actor="buyer", reason=payload.reason or "Annulée par l'acheteur", status="cancelled")
    shop = session.get(Shop, o.shop_id)
    if shop:
        notify_user(session, shop.owner_id, f"Commande {o.code} annulée", "L'acheteur a annulé avant l'expédition. Le stock a été remis en vente.")
    session.commit()
    return views.order_read(session, o)


@router.post("/me/orders/{code}/dispute", response_model=S.OrderRead)
def open_dispute(code: str, payload: S.DisputeRequest, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    o = _my_order(session, code, user)
    view = views.order_read(session, o)
    if not view.can_dispute:
        raise HTTPException(status_code=409, detail="Un litige ne peut plus être ouvert pour cette commande.")
    o.status, o.dispute_reason, o.dispute_note, o.dispute_opened_at = "disputed", payload.reason, payload.note, datetime.utcnow()
    session.add(o)
    add_event(session, o, "disputed", note=payload.reason, actor="buyer")
    shop = session.get(Shop, o.shop_id)
    if shop:
        notify_user(session, shop.owner_id, f"Litige sur la commande {o.code}", f"Motif : {payload.reason}. H-Company examine le dossier ; les fonds restent bloqués.")
    session.commit()
    return views.order_read(session, o)


# --- Avis -------------------------------------------------------------------

@router.post("/reviews", response_model=S.ReviewRead, status_code=201)
def create_review(payload: S.ReviewCreate, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    o = _my_order(session, payload.order_code, user)
    if o.status not in ("delivered", "completed"):
        raise HTTPException(status_code=409, detail="Vous pourrez donner votre avis une fois la commande reçue.")
    item = session.exec(select(ShopOrderItem).where(ShopOrderItem.order_id == o.id, ShopOrderItem.product_id == payload.product_id)).first()
    if not item:
        raise HTTPException(status_code=404, detail="Cet article ne fait pas partie de la commande.")
    if session.exec(select(ShopReview).where(ShopReview.order_id == o.id, ShopReview.product_id == payload.product_id)).first():
        raise HTTPException(status_code=409, detail="Vous avez déjà donné votre avis sur cet article.")
    review = ShopReview(product_id=payload.product_id, shop_id=o.shop_id, order_id=o.id, user_id=user.id,
                        author_name=(user.full_name or "Client").split(" ")[0], rating=payload.rating, comment=payload.comment.strip())
    session.add(review)
    session.flush()
    refresh_review_stats(session, payload.product_id, o.shop_id)
    session.commit()
    session.refresh(review)
    return S.ReviewRead(id=review.id, author_name=review.author_name, rating=review.rating, comment=review.comment,
                        created_at=review.created_at, product_id=review.product_id)


# --- Favoris ----------------------------------------------------------------

@router.get("/me/favorites", response_model=list[S.ProductCard])
def favorites(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    favs = session.exec(select(Favorite).where(Favorite.user_id == user.id).order_by(Favorite.created_at.desc())).all()
    out = []
    for f in favs:
        p = session.get(ShopProduct, f.product_id)
        shop = session.get(Shop, p.shop_id) if p else None
        if p and p.status == "active" and shop and shop.status == "approved":
            out.append(views.product_card(session, p, shop, {p.id}))
    return out


@router.post("/me/favorites/{product_id}", status_code=204)
def add_favorite(product_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    if not session.get(ShopProduct, product_id):
        raise HTTPException(status_code=404, detail="Produit introuvable.")
    if not session.exec(select(Favorite).where(Favorite.user_id == user.id, Favorite.product_id == product_id)).first():
        session.add(Favorite(user_id=user.id, product_id=product_id))
        session.commit()


@router.delete("/me/favorites/{product_id}", status_code=204)
def remove_favorite(product_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    row = session.exec(select(Favorite).where(Favorite.user_id == user.id, Favorite.product_id == product_id)).first()
    if row:
        session.delete(row)
        session.commit()
