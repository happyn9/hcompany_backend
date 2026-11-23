"""Aides partagées des tests C2 (sans effet de bord à l'import : aucune variable d'environnement n'est modifiée)."""
import io

API = "/api/v1/restaurant"
PW = "motdepasse1"
_k = [0]


def img():
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (200, 80, 40)).save(buf, "PNG")
    return buf.getvalue()


def H(w, who, confirm=False):
    h = {"Authorization": f"Bearer {w.tokens[who]}"}
    if confirm:
        r = w.post("/api/v1/admin-security/confirm", json={"password": PW}, headers=h)
        assert r.status_code == 200, r.text
        w.cookies.clear()
        h["X-Admin-Confirm"] = r.json()["confirm_token"]
    return h


def photo(w, who="owner"):
    p = w.post(f"{API}/owner/uploads", files={"file": ("a.png", io.BytesIO(img()), "image/png")}, headers=H(w, who))
    assert p.status_code == 200, p.text
    return p.json()["path"]


def approve(w, rid):
    r = w.post(f"{API}/admin/restaurants/{rid}/approve", headers=H(w, "boss", True))
    assert r.status_code == 200, r.text
    return r.json()


def live_as(w, who, name, price=10.0, seller_type="individual", **kw):
    """Vendeur individuel (ou restaurant) publié ; retourne (restaurant_id, item_id)."""
    body = {"name": name, "summary": "Résumé", "city": "Lusaka", "phone": "0971", "seller_type": seller_type, "images": [photo(w, who)], **kw}
    if seller_type == "restaurant":
        body["address"] = "Rue 1"
    v = w.post(f"{API}/owner/restaurants", json=body, headers=H(w, who))
    assert v.status_code == 201, v.text
    rid = v.json()["id"]
    d = w.post(f"{API}/owner/restaurants/{rid}/items", json={"name": f"Plat {name}", "price": price}, headers=H(w, who))
    assert d.status_code == 201, d.text
    if seller_type == "restaurant":
        assert w.put(f"{API}/owner/restaurants/{rid}/tables", json=[{"label": "T1", "seats": 4, "x": 2, "z": 2}], headers=H(w, who)).status_code == 200
    assert w.post(f"{API}/owner/restaurants/{rid}/submit", headers=H(w, who)).status_code == 200
    approve(w, rid)
    return rid, d.json()["id"]


def key():
    _k[0] += 1
    return f"idem-key-{_k[0]:06d}"


def vend(rid, iid, qty=1, price=None, ful="pickup", **kw):
    line = {"item_id": iid, "qty": qty}
    if price is not None:
        line["price"] = price
    return {"restaurant_id": rid, "fulfilment": ful, "lines": [line], **kw}


def checkout(w, who, vendors, k=None, **kw):
    body = {"vendors": vendors, "contact_name": "Cliente Test", "phone": "0977000111", **kw}
    return w.post(f"{API}/orders/checkout", json=body, headers={**H(w, who), "Idempotency-Key": k or key()})
