"""HFood C2 — logique des commandes : devis de panier (recalcul serveur), validation, création idempotente.

Principes (aucune confiance accordée au client) :
  * le client n'envoie que des identifiants de plats, des quantités et — pour détecter un changement — le prix qu'il a vu ;
    tous les prix, totaux, frais et disponibilités sont recalculés ici ;
  * une commande parent contient UNE sous-commande indépendante par vendeur (articles, montants, modalités, statut, paiement) ;
  * lignes et conditions de livraison sont FIGÉES au moment de la commande ;
  * paiement MANUEL : `payment_status` est séparé du statut de commande et ne change jamais tout seul ;
  * HFood ne livre pas et n'encaisse pas : frais « à convenir » (`delivery_fee` NULL) ne sont jamais inclus dans un total."""
import hashlib
import json
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import update
from sqlmodel import Session, select

from app.restaurant import limits as L, services as svc
from app.restaurant.models import FoodOrder, FoodOrderItem, FoodOrderProposal, FoodOrderProposalLine, FoodOrderReview, FoodSubOrder, MenuItem, Restaurant

BLOCKING = {"vendor_unavailable", "item_not_found", "item_unavailable", "fulfilment_missing", "delivery_unavailable", "address_required", "zone_required", "zone_unsupported"}
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sans 0/O/1/I


def _money(x: float) -> float:
    return round(float(x) + 1e-9, 2)


def new_code(prefix: str) -> str:
    return prefix + "-" + "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))


def _norm(s: str) -> str:
    return " ".join((s or "").lower().split())


def build(session: Session, vendors: list, *, checkout: bool, accept_price_changes: bool = False) -> dict:
    """Panier → vue calculée par le serveur. `vendors` : liste d'objets {restaurant_id, fulfilment, address, zone, note, lines[{item_id, qty, price?}]}.
    Lève 422 pour un panier hors bornes ; tout le reste est rapporté dans `issues` (jamais d'exception pour un plat indisponible)."""
    if len(vendors) > L.CART_MAX_VENDORS:
        raise HTTPException(status_code=422, detail=f"Panier trop large : {L.CART_MAX_VENDORS} vendeurs maximum par commande.")
    if sum(len(v.lines) for v in vendors) > L.CART_MAX_LINES:
        raise HTTPException(status_code=422, detail=f"Panier trop long : {L.CART_MAX_LINES} lignes maximum.")
    seen_r: set[int] = set()
    for v in vendors:
        if v.restaurant_id in seen_r:
            raise HTTPException(status_code=422, detail="Un vendeur ne peut apparaître qu'une fois dans le panier.")
        seen_r.add(v.restaurant_id)

    out, items_total, fees_known, fees_pending, ok_all = [], 0.0, 0.0, False, True
    for v in vendors:
        r = session.get(Restaurant, v.restaurant_id)
        issues: list[dict] = []
        if not r or r.status != "active":
            out.append({"restaurant_id": v.restaurant_id, "name": r.name if r else "", "slug": r.slug if r else "", "ok": False, "issues": [{"code": "vendor_unavailable"}], "lines": [], "items_total": 0, "fulfilment": v.fulfilment, "fee": None, "fee_pending": False, "total_known": 0})
            ok_all = False
            continue
        # fusion des doublons d'un même plat (somme plafonnée) ; l'ordre d'arrivée est conservé
        merged: dict[int, dict] = {}
        for ln in v.lines:
            m = merged.setdefault(ln.item_id, {"qty": 0, "price": ln.price})
            m["qty"] = min(m["qty"] + ln.qty, L.CART_MAX_QTY)
            if m["price"] is None:
                m["price"] = ln.price
        rows = {mi.id: mi for mi in session.exec(select(MenuItem).where(MenuItem.id.in_(list(merged)))).all()} if merged else {}
        lines, sub = [], 0.0
        for iid, m in merged.items():
            mi = rows.get(iid)
            if not mi or mi.restaurant_id != r.id:
                issues.append({"code": "item_not_found", "item_id": iid})
                lines.append({"item_id": iid, "name": "", "qty": m["qty"], "unit_price": 0, "line_total": 0, "available": False, "price_changed": False})
                continue
            price = _money(mi.price)
            changed = m["price"] is not None and abs(float(m["price"]) - price) > 0.005
            if not mi.is_available:
                issues.append({"code": "item_unavailable", "item_id": iid, "name": mi.name})
            if changed:
                issues.append({"code": "price_changed", "item_id": iid, "name": mi.name, "old": _money(m["price"]), "new": price})
            lt = _money(price * m["qty"])
            sub += lt
            lines.append({"item_id": iid, "name": mi.name, "image": mi.image_path, "qty": m["qty"], "unit_price": price, "line_total": lt, "available": bool(mi.is_available), "price_changed": changed})

        ful = v.fulfilment
        fee: Optional[float] = None
        fee_pending = False
        if ful == "delivery":
            if not r.offers_delivery:
                issues.append({"code": "delivery_unavailable"})
            else:
                zones = svc.delivery_zones_list(r)
                if checkout and len(_norm(v.address)) < 5:
                    issues.append({"code": "address_required"})
                if zones:
                    if checkout and not _norm(v.zone):
                        issues.append({"code": "zone_required"})
                    elif _norm(v.zone) and _norm(v.zone) not in {_norm(z) for z in zones}:
                        issues.append({"code": "zone_unsupported", "zone": v.zone})
                fee = r.delivery_fee
                fee_pending = fee is None
        elif ful == "pickup":
            fee = 0.0
        elif checkout:
            issues.append({"code": "fulfilment_missing"})
        sub = _money(sub)
        total_known = _money(sub + (fee or 0.0))
        blocking = [i for i in issues if i["code"] in BLOCKING or (i["code"] == "price_changed" and not accept_price_changes)]
        ok = not blocking
        ok_all = ok_all and ok
        items_total += sub
        fees_known += fee or 0.0
        fees_pending = fees_pending or (fee_pending and ful == "delivery")
        out.append({
            "restaurant_id": r.id, "name": r.name, "slug": r.slug, "seller_type": r.seller_type or "restaurant", "ok": ok, "issues": issues, "lines": lines, "items_total": sub,
            "fulfilment": ful, "fee": fee, "fee_pending": fee_pending and ful == "delivery", "fee_note": r.delivery_fee_note or "", "terms": r.delivery_terms or "",
            "zones": svc.delivery_zones_list(r), "offers_delivery": bool(r.offers_delivery), "total_known": total_known, "payment": "manual",
        })
    return {"vendors": out, "ok": ok_all, "items_total": _money(items_total), "fees_known_total": _money(fees_known), "fees_pending": fees_pending, "grand_total": _money(items_total + fees_known), "currency": "ZMW"}


def request_hash(payload, vendors_sorted: list) -> str:
    canon = {
        "c": [payload.contact_name.strip(), payload.phone.strip(), payload.note.strip()],
        "v": [[v.restaurant_id, v.fulfilment, _norm(v.address), _norm(v.zone), v.note.strip(), sorted((ln.item_id, ln.qty) for ln in v.lines)] for v in vendors_sorted],
    }
    return hashlib.sha256(json.dumps(canon, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def create_order(session: Session, user_id: int, payload, view: dict, key: str, rhash: str) -> FoodOrder:
    """Écrit commande parent + sous-commandes + lignes dans la transaction courante (le commit est fait par l'appelant)."""
    order = FoodOrder(
        code=new_code("HF"), user_id=user_id, idempotency_key=key, request_hash=rhash, contact_name=payload.contact_name.strip(), phone=payload.phone.strip(), note=payload.note.strip(),
        currency=view["currency"], items_total=view["items_total"], fees_known_total=view["fees_known_total"], fees_pending=view["fees_pending"], grand_total=view["grand_total"],
    )
    session.add(order)
    session.flush()
    by_id = {v.restaurant_id: v for v in payload.vendors}
    for vv in view["vendors"]:
        vin = by_id[vv["restaurant_id"]]
        sub = FoodSubOrder(
            code=new_code("HS"), order_id=order.id, restaurant_id=vv["restaurant_id"], restaurant_name=vv["name"], seller_type=vv["seller_type"], fulfilment=vv["fulfilment"],
            delivery_address=vin.address.strip() if vv["fulfilment"] == "delivery" else "", delivery_zone=vin.zone.strip() if vv["fulfilment"] == "delivery" else "",
            delivery_fee=vv["fee"] if vv["fulfilment"] == "delivery" else 0.0, delivery_fee_note=vv["fee_note"], delivery_terms=vv["terms"],
            items_total=vv["items_total"], total_known=vv["total_known"], fee_pending=vv["fee_pending"], note=vin.note.strip(),
        )
        session.add(sub)
        session.flush()
        for ln in vv["lines"]:
            session.add(FoodOrderItem(sub_order_id=sub.id, menu_item_id=ln["item_id"], name=ln["name"], unit_price=ln["unit_price"], qty=ln["qty"], line_total=ln["line_total"]))
    return order


def derived_status(subs: list[FoodSubOrder]) -> str:
    """Statut global lisible : identique si tous les vendeurs sont au même statut, sinon « partial »."""
    st = {s.status for s in subs}
    return st.pop() if len(st) == 1 else "partial"


def sub_view(session: Session, s: FoodSubOrder, *, seller: bool = False, order: Optional[FoodOrder] = None) -> dict:
    items = session.exec(select(FoodOrderItem).where(FoodOrderItem.sub_order_id == s.id).order_by(FoodOrderItem.id)).all()
    d = {
        "code": s.code, "restaurant_id": s.restaurant_id, "restaurant_name": s.restaurant_name, "seller_type": s.seller_type, "status": s.status, "payment_status": s.payment_status,
        "fulfilment": s.fulfilment, "delivery_address": s.delivery_address, "delivery_zone": s.delivery_zone, "delivery_fee": s.delivery_fee, "fee_pending": s.fee_pending,
        "delivery_fee_note": s.delivery_fee_note, "delivery_terms": s.delivery_terms, "items_total": s.items_total, "total_known": s.total_known, "decline_reason": s.decline_reason,
        "note": s.note, "payment_method": s.payment_method, "payment_ref": s.payment_ref, "payment_note": s.payment_note, "status_note": s.status_note, "created_at": s.created_at.isoformat(), "updated_at": s.updated_at.isoformat(), "payment": "manual",
        "items": [{"line_id": i.id, "item_id": i.menu_item_id, "name": i.name, "unit_price": i.unit_price, "qty": i.qty, "line_total": i.line_total} for i in items],
    }
    rv = session.exec(select(FoodOrderReview).where(FoodOrderReview.sub_order_id == s.id)).first()
    d["review"] = {"rating": rv.rating, "comment": rv.comment, "created_at": rv.created_at.isoformat(), "hidden": rv.hidden} if rv else None
    d["proposals"] = proposals_view(session, s.id)
    d["open_proposal"] = next((p for p in d["proposals"] if p["status"] == "pending"), None)
    if seller and order is not None:  # le vendeur ne voit que SA sous-commande + le contact nécessaire à la livraison
        d["order_code"], d["customer"] = order.code, {"name": order.contact_name, "phone": order.phone}
    return d


def order_view(session: Session, o: FoodOrder, *, replayed: bool = False) -> dict:
    subs = session.exec(select(FoodSubOrder).where(FoodSubOrder.order_id == o.id).order_by(FoodSubOrder.id)).all()
    return {
        "code": o.code, "status": derived_status(subs), "contact_name": o.contact_name, "phone": o.phone, "note": o.note, "currency": o.currency, "items_total": o.items_total,
        "fees_known_total": o.fees_known_total, "fees_pending": o.fees_pending, "grand_total": o.grand_total, "created_at": o.created_at.isoformat(),
        "suborders": [sub_view(session, s) for s in subs], "replayed": replayed,
    }


# ───────────────────────── D2 : propositions de modification ─────────────────────────
# Règles retenues (périmètre volontairement étroit ; toute extension — hausse de quantité, changement de prix, remplacement d'article, frais — demande une décision métier) :
#   * le vendeur ne peut que RÉDUIRE une quantité ou RETIRER une ligne (ex. plat épuisé) ; prix unitaires et frais de livraison restent ceux figés à la commande ;
#   * possible tant que la sous-commande est « pending », « accepted » ou « preparing » ET que le paiement est « unpaid » ;
#   * une seule proposition en attente par sous-commande (index unique partiel) ; elle expire après PROPOSAL_TTL_HOURS ;
#   * rien n'est modifié avant l'acceptation du client ; l'acceptation recalcule tous les totaux côté serveur.
PROPOSABLE = ("pending", "accepted", "preparing")


def _expiry_cutoff() -> datetime:
    return datetime.utcnow()


def expire_due(session: Session, sub_id: int) -> None:
    """Passe en « expired » les propositions échues de cette sous-commande (écriture paresseuse, atomique)."""
    session.execute(sa_update_proposal().where(FoodOrderProposal.sub_order_id == sub_id, FoodOrderProposal.status == "pending", FoodOrderProposal.expires_at <= _expiry_cutoff()).values(status="expired", decided_at=datetime.utcnow()))


def sa_update_proposal():
    return update(FoodOrderProposal)


def open_proposal(session: Session, sub_id: int) -> Optional[FoodOrderProposal]:
    return session.exec(select(FoodOrderProposal).where(FoodOrderProposal.sub_order_id == sub_id, FoodOrderProposal.status == "pending", FoodOrderProposal.expires_at > _expiry_cutoff())).first()


def cancel_open_proposals(session: Session, sub_id: int, note: str) -> None:
    session.execute(sa_update_proposal().where(FoodOrderProposal.sub_order_id == sub_id, FoodOrderProposal.status == "pending").values(status="cancelled", decision_note=note, decided_at=datetime.utcnow()))


def proposals_view(session: Session, sub_id: int) -> list:
    rows = session.exec(select(FoodOrderProposal).where(FoodOrderProposal.sub_order_id == sub_id).order_by(FoodOrderProposal.id.desc()).limit(20)).all()
    out = []
    for p in rows:
        lines = session.exec(select(FoodOrderProposalLine).where(FoodOrderProposalLine.proposal_id == p.id).order_by(FoodOrderProposalLine.id)).all()
        st = "expired" if p.status == "pending" and p.expires_at <= _expiry_cutoff() else p.status
        out.append({
            "id": p.id, "status": st, "message": p.message, "items_total_before": p.items_total_before, "items_total_after": p.items_total_after, "decision_note": p.decision_note,
            "created_at": p.created_at.isoformat(), "expires_at": p.expires_at.isoformat(), "decided_at": p.decided_at.isoformat() if p.decided_at else None,
            "lines": [{"line_id": x.order_item_id, "name": x.name, "unit_price": x.unit_price, "qty_before": x.qty_before, "qty_after": x.qty_after} for x in lines],
        })
    return out


def create_proposal(session: Session, s: FoodSubOrder, changes: dict[int, int], message: str) -> FoodOrderProposal:
    """`changes` : {id de ligne de commande → nouvelle quantité (0 = retirer)}. Valide contre les lignes figées ; le serveur calcule les totaux."""
    if s.status not in PROPOSABLE:
        raise HTTPException(status_code=409, detail="Cette commande ne peut plus être modifiée.")
    if s.payment_status != "unpaid":
        raise HTTPException(status_code=409, detail="Un paiement est déjà déclaré ou confirmé : la commande ne peut plus être modifiée.")
    expire_due(session, s.id)
    if open_proposal(session, s.id):
        raise HTTPException(status_code=409, detail="Une proposition est déjà en attente de réponse du client.")
    items = {i.id: i for i in session.exec(select(FoodOrderItem).where(FoodOrderItem.sub_order_id == s.id)).all()}
    if not changes:
        raise HTTPException(status_code=422, detail="Indiquez au moins une modification.")
    after_total, lines, changed = 0.0, [], 0
    for lid, it in items.items():
        q = changes.get(lid, it.qty)
        if q > it.qty:
            raise HTTPException(status_code=422, detail=f"« {it.name} » : vous ne pouvez que réduire la quantité ou retirer l'article.")
        if q != it.qty:
            changed += 1
            lines.append(FoodOrderProposalLine(order_item_id=lid, name=it.name, unit_price=it.unit_price, qty_before=it.qty, qty_after=q))
        after_total += _money(it.unit_price * q)
    if set(changes) - set(items):
        raise HTTPException(status_code=422, detail="Ligne de commande inconnue.")
    if not changed:
        raise HTTPException(status_code=422, detail="Aucune quantité n'est différente de la commande actuelle.")
    if after_total <= 0:
        raise HTTPException(status_code=422, detail="Retirer tous les articles revient à refuser la commande : utilisez « Refuser ».")
    p = FoodOrderProposal(sub_order_id=s.id, message=message, items_total_before=s.items_total, items_total_after=_money(after_total), expires_at=datetime.utcnow() + timedelta(hours=L.PROPOSAL_TTL_HOURS))
    session.add(p)
    try:
        session.flush()
    except Exception:  # index unique partiel : une proposition concurrente vient d'être créée
        session.rollback()
        raise HTTPException(status_code=409, detail="Une proposition est déjà en attente de réponse du client.")
    for ln in lines:
        ln.proposal_id = p.id
        session.add(ln)
    return p


def apply_proposal(session: Session, s: FoodSubOrder, o: FoodOrder, p: FoodOrderProposal) -> None:
    """Applique une proposition ACCEPTÉE aux lignes figées et recalcule sous-commande + commande parent (frais inchangés)."""
    for ln in session.exec(select(FoodOrderProposalLine).where(FoodOrderProposalLine.proposal_id == p.id)).all():
        it = session.get(FoodOrderItem, ln.order_item_id)
        if not it:
            continue
        if ln.qty_after == 0:
            session.delete(it)
        else:
            it.qty, it.line_total = ln.qty_after, _money(it.unit_price * ln.qty_after)
            session.add(it)
    session.flush()
    items = session.exec(select(FoodOrderItem).where(FoodOrderItem.sub_order_id == s.id)).all()
    s.items_total = _money(sum(i.line_total for i in items))
    s.total_known = _money(s.items_total + (s.delivery_fee or 0.0))
    s.updated_at = datetime.utcnow()
    session.add(s)
    session.flush()
    subs = session.exec(select(FoodSubOrder).where(FoodSubOrder.order_id == o.id)).all()
    o.items_total = _money(sum(x.items_total for x in subs))
    o.grand_total = _money(o.items_total + o.fees_known_total)
    session.add(o)
