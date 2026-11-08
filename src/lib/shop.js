// Fonctions pures de H-Shopping (panier, statuts) — testées dans shop.test.js.
// Les montants sont en monnaie pivot ; le serveur recalcule tout à la commande.

export const MAX_QTY = 99;

export function cartKey(productId, variantId, color) {
  return `${productId}:${variantId || 0}${color ? `:${String(color).toLowerCase()}` : ""}`;
}

export function clampQty(qty, max = MAX_QTY) {
  const n = Math.floor(Number(qty) || 1);
  return Math.min(Math.max(1, n), Math.max(1, Math.min(max || MAX_QTY, MAX_QTY)));
}

/** Ajoute (ou cumule) une ligne ; renvoie une nouvelle liste. */
export function cartAdd(items, line) {
  const key = cartKey(line.product_id, line.variant_id, line.color);
  const found = items.find((i) => i.key === key);
  if (found) {
    return items.map((i) => (i.key === key ? { ...i, ...line, key, quantity: clampQty(i.quantity + (line.quantity || 1), line.max ?? i.max) } : i));
  }
  return [...items, { ...line, key, quantity: clampQty(line.quantity || 1, line.max) }];
}

export function cartSetQty(items, key, qty) {
  return items.map((i) => (i.key === key ? { ...i, quantity: clampQty(qty, i.max) } : i));
}

export function cartRemove(items, key) {
  return items.filter((i) => i.key !== key);
}

export function cartCount(items) {
  return items.reduce((n, i) => n + i.quantity, 0);
}

export function cartSubtotal(items) {
  return items.reduce((s, i) => s + i.price * i.quantity, 0);
}

/** Regroupe les lignes par boutique pour l'affichage du panier. */
export function groupByShop(items) {
  const map = new Map();
  items.forEach((i) => {
    const k = i.shop_slug || "?";
    if (!map.has(k)) map.set(k, { slug: i.shop_slug, name: i.shop_name, items: [] });
    map.get(k).items.push(i);
  });
  return [...map.values()];
}

/** Validation locale du stockage : ne garde que des lignes plausibles. */
export function sanitizeCart(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i) => i && Number.isInteger(i.product_id) && Number(i.price) >= 0 && Number(i.quantity) >= 1)
    .map((i) => ({ ...i, key: cartKey(i.product_id, i.variant_id, i.color), quantity: clampQty(i.quantity, i.max) }));
}

// Étapes de la frise de suivi, dans l'ordre.
export const TRACK_STEPS = ["paid", "processing", "shipped", "delivered", "completed"];

export function stepIndex(status) {
  const i = TRACK_STEPS.indexOf(status);
  return i === -1 ? 0 : i;
}

/** Ton visuel d'un statut : ok | wait | bad | info. */
export function statusTone(status) {
  if (["completed", "delivered"].includes(status)) return "ok";
  if (["cancelled", "refunded", "disputed", "rejected", "suspended"].includes(status)) return "bad";
  if (["pending", "pending_payment", "requested", "paid"].includes(status)) return "wait";
  return "info";
}

export function priceRange(variants, base) {
  const prices = (variants || []).filter((v) => v.is_active !== false).map((v) => v.price);
  if (!prices.length) return { min: base, max: base };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
