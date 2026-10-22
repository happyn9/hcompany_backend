"""H-Shopping — côté vendeur : boutique, catalogue, commandes, expédition,
solde et retraits, codes promo, réponses aux avis, images."""
import re
import secrets
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session, func, select

from app.database import get_session
from app.deps import get_current_user
from app.routers.partner_modules import require_module
from app.models import PartnerApplication, PartnerStatus, User, UserRole
from app.routers.learning_plans import OPERATOR_PREFIXES, normalize_zm_phone
from app.shopping import schemas as S
from app.shopping import views
from app.shopping.models import (
    Coupon, Shop, ShopAgency, ShopCategory, ShopOrder, ShopPayout, ShopProduct, ShopProductImage,
    ShopProductVariant, ShopReview, ShopOrderItem,
)
from app.shopping.services import (
    add_event, auto_release_overdue, create_parcel_for_order, get_float, notify_user, refresh_review_stats,
    refund_order, slugify, unique_slug, wallet,
)

router = APIRouter(prefix="/api/v1/shopping/seller", tags=["shopping-seller"])

UPLOAD_ROOT = Path(__file__).resolve().parent.parent.parent.parent / "uploads"
SHOP_DIR = UPLOAD_ROOT / "shopping"
SHOP_DIR.mkdir(parents=True, exist_ok=True)
IMG_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
MAGIC = {".png": b"\x89PNG", ".jpg": b"\xff\xd8\xff", ".webp": b"RIFF"}
MAX_IMG = 4 * 1024 * 1024
MAX_SHOPS_PER_USER = 3


def _my_shop(session: Session, shop_id: int, user: User) -> Shop:
    shop = session.get(Shop, shop_id)
    if not shop or shop.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Boutique introuvable.")
    return shop


def _active_shop(session: Session, shop_id: int, user: User) -> Shop:
    shop = _my_shop(session, shop_id, user)
    if shop.status != "approved":
        raise HTTPException(status_code=403, detail="Votre boutique doit être validée avant de vendre.")
    return shop


# --- Images ----------------------------------------------------------------

@router.post("/uploads")
def upload_image(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    """Téléverse une image (produit, logo, bannière) ; renvoie le chemin à
    enregistrer dans la boutique ou le produit."""
    ext = IMG_TYPES.get(file.content_type or "")
    if not ext:
        raise HTTPException(status_code=400, detail="Format non supporté (PNG, JPEG ou WebP).")
    data = file.file.read(MAX_IMG + 1)
    if len(data) > MAX_IMG:
        raise HTTPException(status_code=400, detail="L'image ne doit pas dépasser 4 Mo.")
    if not data.startswith(MAGIC[ext]):
        raise HTTPException(status_code=400, detail="Le fichier n'est pas une image valide.")
    name = f"{user.id}-{uuid.uuid4().hex[:12]}{ext}"
    (SHOP_DIR / name).write_bytes(data)
    return {"path": f"shopping/{name}"}


def _check_image_path(path: str, user: User) -> str:
    """N'accepte que des fichiers téléversés par l'utilisateur dans /uploads/shopping."""
    m = re.fullmatch(r"shopping/(\d+)-[0-9a-f]{12}\.(png|jpg|webp)", path or "")
    if not m or int(m.group(1)) != user.id and user.role.value != "admin":
        raise HTTPException(status_code=422, detail="Image invalide : téléversez-la d'abord.")
    return path


# --- Boutiques --------------------------------------------------------------

@router.get("/shops", response_model=list[S.ShopOwnerRead])
def my_shops(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    rows = session.exec(select(Shop).where(Shop.owner_id == user.id).order_by(Shop.created_at.desc())).all()
    return [views.shop_owner_read(session, s) for s in rows]


@router.post("/shops", response_model=S.ShopOwnerRead, status_code=201)
def create_shop(payload: S.ShopCreate, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    require_module(session, user, "shopping")
    if session.exec(select(func.count(Shop.id)).where(Shop.owner_id == user.id)).one() >= MAX_SHOPS_PER_USER:
        raise HTTPException(status_code=409, detail=f"Vous pouvez gérer jusqu'à {MAX_SHOPS_PER_USER} boutiques.")
    if payload.dispatch_agency_id and not session.get(ShopAgency, payload.dispatch_agency_id):
        raise HTTPException(status_code=422, detail="Agence introuvable.")
    partner = session.exec(select(PartnerApplication).where(PartnerApplication.user_id == user.id, PartnerApplication.status == PartnerStatus.approved)).first()
    shop = Shop(
        slug=unique_slug(session, Shop, payload.name), owner_id=user.id, name=payload.name, tagline=payload.tagline,
        description=payload.description, city=payload.city, address=payload.address, phone=payload.phone,
        whatsapp=payload.whatsapp, email=payload.email or user.email, dispatch_agency_id=payload.dispatch_agency_id,
        mobile_money_operator=payload.mobile_money_operator, mobile_money_phone=payload.mobile_money_phone,
        partner_application_id=partner.id if partner else None,
    )
    session.add(shop)
    session.commit()
    session.refresh(shop)
    for admin in session.exec(select(User).where(User.role == UserRole.admin)).all():
        notify_user(session, admin.id, "Nouvelle boutique à valider", f"« {shop.name} » ({shop.city or 'ville ?'}) attend votre validation dans H-Shopping.")
    session.commit()
    return views.shop_owner_read(session, shop)


@router.patch("/shops/{shop_id}", response_model=S.ShopOwnerRead)
def update_shop(shop_id: int, payload: S.ShopUpdate, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    shop = _my_shop(session, shop_id, user)
    data = payload.model_dump(exclude_unset=True)
    for key in ("logo_path", "banner_path"):
        if data.get(key):
            _check_image_path(data[key], user)
    if data.get("dispatch_agency_id") and not session.get(ShopAgency, data["dispatch_agency_id"]):
        raise HTTPException(status_code=422, detail="Agence introuvable.")
    if data.get("mobile_money_phone") is not None and data["mobile_money_phone"]:
        p = normalize_zm_phone(data["mobile_money_phone"])
        if not p:
            raise HTTPException(status_code=422, detail="Numéro mobile money invalide.")
        data["mobile_money_phone"] = p
    for k, v in data.items():
        setattr(shop, k, v.strip() if isinstance(v, str) else v)
    session.add(shop)
    session.commit()
    session.refresh(shop)
    return views.shop_owner_read(session, shop)


# --- Catalogue ---------------------------------------------------------------

def _validate_product(session: Session, payload: S.ProductWrite, user: User) -> None:
    if payload.category_id and not session.get(ShopCategory, payload.category_id):
        raise HTTPException(status_code=422, detail="Catégorie introuvable.")
    if payload.compare_at_price is not None and payload.compare_at_price <= payload.price:
        raise HTTPException(status_code=422, detail="Le prix barré doit être supérieur au prix de vente.")
    labels = [v.label.strip().lower() for v in payload.variants]
    if len(labels) != len(set(labels)):
        raise HTTPException(status_code=422, detail="Deux variantes portent le même nom.")
    for img in payload.images:
        _check_image_path(img, user)
    if payload.status == "active" and not payload.images:
        raise HTTPException(status_code=422, detail="Ajoutez au moins une photo pour publier le produit.")


def _apply_product(session: Session, product: ShopProduct, payload: S.ProductWrite) -> None:
    for f in ("title", "description", "category_id", "price", "compare_at_price", "stock", "sku", "brand", "weight_kg", "attributes", "tags", "status"):
        setattr(product, f, getattr(payload, f))
    product.updated_at = datetime.utcnow()
    session.add(product)
    session.flush()
    # images : remplacement ordonné
    existing = {i.path: i for i in session.exec(select(ShopProductImage).where(ShopProductImage.product_id == product.id)).all()}
    for path, row in existing.items():
        if path not in payload.images:
            session.delete(row)
    for pos, path in enumerate(payload.images):
        row = existing.get(path) or ShopProductImage(product_id=product.id, path=path)
        row.sort_order = pos
        session.add(row)
    # variantes : mise à jour par id, création, désactivation de celles retirées (l'historique de commandes y fait référence)
    current = {v.id: v for v in session.exec(select(ShopProductVariant).where(ShopProductVariant.product_id == product.id)).all()}
    kept = set()
    for v in payload.variants:
        row = current.get(v.id) if v.id else None
        if row is None:
            row = ShopProductVariant(product_id=product.id, label=v.label)
        row.label, row.sku, row.price, row.stock, row.is_active = v.label.strip(), v.sku.strip(), v.price, v.stock, v.is_active
        session.add(row)
        session.flush()
        kept.add(row.id)
    for vid, row in current.items():
        if vid not in kept:
            row.is_active = False
            session.add(row)


@router.get("/shops/{shop_id}/products", response_model=list[S.ProductOwnerRead])
def list_products(shop_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    _my_shop(session, shop_id, user)
    rows = session.exec(select(ShopProduct).where(ShopProduct.shop_id == shop_id).order_by(ShopProduct.created_at.desc())).all()
    return [views.product_detail(session, p, user, owner=True) for p in rows]


@router.post("/shops/{shop_id}/products", response_model=S.ProductOwnerRead, status_code=201)
def create_product(shop_id: int, payload: S.ProductWrite, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    _active_shop(session, shop_id, user)
    _validate_product(session, payload, user)
    product = ShopProduct(shop_id=shop_id, title=payload.title, price=payload.price)
    _apply_product(session, product, payload)
    session.commit()
    session.refresh(product)
    return views.product_detail(session, product, user, owner=True)


def _my_product(session: Session, product_id: int, user: User) -> ShopProduct:
    p = session.get(ShopProduct, product_id)
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable.")
    _my_shop(session, p.shop_id, user)
    return p


@router.get("/products/{product_id}", response_model=S.ProductOwnerRead)
def get_product(product_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    return views.product_detail(session, _my_product(session, product_id, user), user, owner=True)


@router.put("/products/{product_id}", response_model=S.ProductOwnerRead)
def update_product(product_id: int, payload: S.ProductWrite, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    p = _my_product(session, product_id, user)
    if payload.status == "active":
        _active_shop(session, p.shop_id, user)
    _validate_product(session, payload, user)
    _apply_product(session, p, payload)
    session.commit()
    session.refresh(p)
    return views.product_detail(session, p, user, owner=True)


@router.patch("/products/{product_id}", response_model=S.ProductOwnerRead)
def patch_product(product_id: int, payload: S.ProductStatusPatch, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    p = _my_product(session, product_id, user)
    data = payload.model_dump(exclude_unset=True)
    if data.get("status"):
        if data["status"] not in ("draft", "active", "archived"):
            raise HTTPException(status_code=422, detail="Statut invalide.")
        if data["status"] == "active":
            _active_shop(session, p.shop_id, user)
            if not session.exec(select(ShopProductImage).where(ShopProductImage.product_id == p.id)).first():
                raise HTTPException(status_code=422, detail="Ajoutez au moins une photo pour publier le produit.")
    data.pop("is_featured", None)  # réservé à l'admin
    for k, v in data.items():
        setattr(p, k, v)
    p.updated_at = datetime.utcnow()
    session.add(p)
    session.commit()
    session.refresh(p)
    return views.product_detail(session, p, user, owner=True)


@router.delete("/products/{product_id}", status_code=204)
def delete_product(product_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    p = _my_product(session, product_id, user)
    if session.exec(select(ShopOrderItem).where(ShopOrderItem.product_id == p.id)).first():
        p.status = "archived"  # déjà commandé : on archive pour garder l'historique
        session.add(p)
    else:
        for row in session.exec(select(ShopProductImage).where(ShopProductImage.product_id == p.id)).all():
            session.delete(row)
        for row in session.exec(select(ShopProductVariant).where(ShopProductVariant.product_id == p.id)).all():
            session.delete(row)
        session.delete(p)
    session.commit()


# --- Commandes ---------------------------------------------------------------

def _shop_order(session: Session, shop_id: int, code: str, user: User) -> ShopOrder:
    _my_shop(session, shop_id, user)
    o = session.exec(select(ShopOrder).where(ShopOrder.code == code.upper(), ShopOrder.shop_id == shop_id)).first()
    if not o:
        raise HTTPException(status_code=404, detail="Commande introuvable.")
    return o


@router.get("/shops/{shop_id}/orders", response_model=list[S.OrderRead])
def shop_orders(shop_id: int, status: Optional[str] = None, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    _my_shop(session, shop_id, user)
    auto_release_overdue(session)
    stmt = select(ShopOrder).where(ShopOrder.shop_id == shop_id, ShopOrder.status != "pending_payment")
    if status:
        stmt = stmt.where(ShopOrder.status == status)
    rows = session.exec(stmt.order_by(ShopOrder.created_at.desc()).limit(200)).all()
    return [views.order_read(session, o, viewer="seller") for o in rows]


@router.post("/shops/{shop_id}/orders/{code}/accept", response_model=S.OrderRead)
def accept_order(shop_id: int, code: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    o = _shop_order(session, shop_id, code, user)
    if o.status != "paid":
        raise HTTPException(status_code=409, detail="Cette commande a déjà été prise en charge.")
    o.status = "processing"
    session.add(o)
    add_event(session, o, "processing", actor="seller")
    notify_user(session, o.buyer_id, f"Commande {o.code}", "La boutique prépare votre commande.")
    session.commit()
    return views.order_read(session, o, viewer="seller")


@router.post("/shops/{shop_id}/orders/{code}/ship", response_model=S.OrderRead)
def ship_order(shop_id: int, code: str, payload: S.ShipRequest, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Le vendeur remet le colis : un colis Lukondo est créé chez l'agence choisie par l'acheteur."""
    o = _shop_order(session, shop_id, code, user)
    if o.status not in ("paid", "processing"):
        raise HTTPException(status_code=409, detail="Cette commande ne peut pas être expédiée dans son état actuel.")
    parcel = create_parcel_for_order(session, o)
    o.status, o.shipped_at = "shipped", datetime.utcnow()
    session.add(o)
    agency = session.get(ShopAgency, o.agency_id)
    add_event(session, o, "shipped", actor="seller", note=payload.note,
              label=f"Colis {parcel.reference_code} confié à {agency.name if agency else 'l’agence'}")
    notify_user(session, o.buyer_id, f"Commande {o.code} expédiée", f"Numéro de suivi : {parcel.reference_code}.")
    session.commit()
    return views.order_read(session, o, viewer="seller")


@router.post("/shops/{shop_id}/orders/{code}/cancel", response_model=S.OrderRead)
def seller_cancel(shop_id: int, code: str, payload: S.CancelRequest, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    o = _shop_order(session, shop_id, code, user)
    if o.status not in ("paid", "processing"):
        raise HTTPException(status_code=409, detail="Cette commande ne peut plus être annulée.")
    refund_order(session, o, actor="seller", reason=payload.reason or "Annulée par la boutique", status="cancelled")
    session.commit()
    return views.order_read(session, o, viewer="seller")


# --- Statistiques, solde, retraits ------------------------------------------

@router.get("/shops/{shop_id}/stats", response_model=S.StatsRead)
def stats(shop_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    _my_shop(session, shop_id, user)
    paid = select(ShopOrder).where(ShopOrder.shop_id == shop_id, ShopOrder.status.in_(("paid", "processing", "shipped", "delivered", "completed", "disputed")))
    orders = session.exec(paid).all()
    since = datetime.utcnow() - timedelta(days=29)
    days = {(since + timedelta(days=i)).strftime("%Y-%m-%d"): 0.0 for i in range(30)}
    for o in orders:
        key = (o.paid_at or o.created_at).strftime("%Y-%m-%d")
        if key in days:
            days[key] += o.subtotal - o.discount
    top = session.exec(
        select(ShopOrderItem.title, func.sum(ShopOrderItem.quantity), func.sum(ShopOrderItem.line_total))
        .join(ShopOrder, ShopOrder.id == ShopOrderItem.order_id)
        .where(ShopOrder.shop_id == shop_id, ShopOrder.status.in_(("paid", "processing", "shipped", "delivered", "completed")))
        .group_by(ShopOrderItem.title).order_by(func.sum(ShopOrderItem.line_total).desc()).limit(5)
    ).all()
    products = session.exec(select(ShopProduct).where(ShopProduct.shop_id == shop_id, ShopProduct.status != "archived")).all()
    low = sum(1 for p in products if p.status == "active" and views.available_stock(session, p) <= 3) if hasattr(views, "available_stock") else 0
    return S.StatsRead(
        revenue=round(sum(o.subtotal - o.discount for o in orders if o.status != "disputed"), 2), orders=len(orders),
        orders_open=sum(1 for o in orders if o.status in ("paid", "processing")), products=len(products), low_stock=low,
        by_day=[{"day": d, "amount": round(a, 2)} for d, a in days.items()],
        top_products=[{"title": t, "quantity": int(q), "amount": round(float(a), 2)} for t, q, a in top],
    )


@router.get("/shops/{shop_id}/wallet", response_model=S.WalletRead)
def my_wallet(shop_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    _my_shop(session, shop_id, user)
    auto_release_overdue(session)
    return wallet(session, shop_id)


def _payout_read(session: Session, p: ShopPayout) -> S.PayoutRead:
    shop = session.get(Shop, p.shop_id)
    return S.PayoutRead(id=p.id, reference=p.reference, shop_id=p.shop_id, shop_name=shop.name if shop else None, amount=p.amount,
                        operator=p.operator, phone=p.phone, status=p.status, admin_note=p.admin_note, created_at=p.created_at, processed_at=p.processed_at)


@router.get("/shops/{shop_id}/payouts", response_model=list[S.PayoutRead])
def my_payouts(shop_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    _my_shop(session, shop_id, user)
    rows = session.exec(select(ShopPayout).where(ShopPayout.shop_id == shop_id).order_by(ShopPayout.created_at.desc())).all()
    return [_payout_read(session, p) for p in rows]


@router.post("/shops/{shop_id}/payouts", response_model=S.PayoutRead, status_code=201)
def request_payout(shop_id: int, payload: S.PayoutRequest, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    shop = _active_shop(session, shop_id, user)
    operator = payload.operator or shop.mobile_money_operator
    phone = normalize_zm_phone(payload.phone or shop.mobile_money_phone)
    if operator not in OPERATOR_PREFIXES or not phone or phone[1:3] not in OPERATOR_PREFIXES[operator]:
        raise HTTPException(status_code=422, detail="Renseignez un numéro mobile money valide, cohérent avec l'opérateur.")
    w = wallet(session, shop_id)
    if payload.amount < w["min_payout"]:
        raise HTTPException(status_code=422, detail=f"Retrait minimum : {w['min_payout']:.0f} ZMW.")
    if payload.amount > w["available"] + 1e-9:
        raise HTTPException(status_code=422, detail="Montant supérieur à votre solde disponible.")
    payout = ShopPayout(reference="HSW-" + secrets.token_hex(4).upper(), shop_id=shop_id, amount=round(payload.amount, 2), operator=operator, phone=phone)
    session.add(payout)
    for admin in session.exec(select(User).where(User.role == UserRole.admin)).all():
        notify_user(session, admin.id, "Demande de retrait", f"{shop.name} demande {payout.amount:.2f} ZMW ({payout.reference}).")
    session.commit()
    session.refresh(payout)
    return _payout_read(session, payout)


# --- Coupons -----------------------------------------------------------------

@router.get("/shops/{shop_id}/coupons", response_model=list[S.CouponRead])
def list_coupons(shop_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    _my_shop(session, shop_id, user)
    return session.exec(select(Coupon).where(Coupon.shop_id == shop_id).order_by(Coupon.created_at.desc())).all()


@router.post("/shops/{shop_id}/coupons", response_model=S.CouponRead, status_code=201)
def create_coupon(shop_id: int, payload: S.CouponWrite, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    _active_shop(session, shop_id, user)
    if bool(payload.percent) == bool(payload.amount):
        raise HTTPException(status_code=422, detail="Indiquez soit un pourcentage, soit un montant.")
    code = re.sub(r"[^A-Z0-9_-]", "", payload.code.upper())
    if len(code) < 3 or session.exec(select(Coupon).where(Coupon.code == code)).first():
        raise HTTPException(status_code=409, detail="Ce code est invalide ou déjà utilisé.")
    c = Coupon(code=code, shop_id=shop_id, percent=payload.percent, amount=payload.amount, min_total=payload.min_total,
               max_uses=payload.max_uses, expires_at=payload.expires_at, is_active=payload.is_active)
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


@router.delete("/shops/{shop_id}/coupons/{coupon_id}", status_code=204)
def delete_coupon(shop_id: int, coupon_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    _my_shop(session, shop_id, user)
    c = session.get(Coupon, coupon_id)
    if not c or c.shop_id != shop_id:
        raise HTTPException(status_code=404, detail="Code introuvable.")
    if c.used:
        c.is_active = False
        session.add(c)
    else:
        session.delete(c)
    session.commit()


# --- Avis --------------------------------------------------------------------

@router.get("/shops/{shop_id}/reviews", response_model=list[S.ReviewRead])
def shop_reviews(shop_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    _my_shop(session, shop_id, user)
    rows = session.exec(select(ShopReview).where(ShopReview.shop_id == shop_id, ShopReview.is_hidden == False).order_by(ShopReview.created_at.desc()).limit(100)).all()  # noqa: E712
    out = []
    for r in rows:
        p = session.get(ShopProduct, r.product_id)
        out.append(S.ReviewRead(id=r.id, author_name=r.author_name, rating=r.rating, comment=r.comment, seller_reply=r.seller_reply,
                                created_at=r.created_at, product_id=r.product_id, product_title=p.title if p else None))
    return out


@router.post("/shops/{shop_id}/reviews/{review_id}/reply", response_model=S.ReviewRead)
def reply_review(shop_id: int, review_id: int, payload: S.ReplyWrite, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    _my_shop(session, shop_id, user)
    r = session.get(ShopReview, review_id)
    if not r or r.shop_id != shop_id:
        raise HTTPException(status_code=404, detail="Avis introuvable.")
    r.seller_reply = payload.reply.strip()
    session.add(r)
    session.commit()
    return S.ReviewRead(id=r.id, author_name=r.author_name, rating=r.rating, comment=r.comment, seller_reply=r.seller_reply, created_at=r.created_at, product_id=r.product_id)
