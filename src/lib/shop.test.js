import { describe, expect, it } from "vitest";
import { cartAdd, cartCount, cartRemove, cartSetQty, cartSubtotal, clampQty, groupByShop, priceRange, sanitizeCart, statusTone, stepIndex } from "./shop.js";

const line = { product_id: 1, variant_id: null, price: 200, quantity: 1, shop_slug: "a", shop_name: "A", max: 5 };

describe("panier H-Shopping", () => {
  it("cumule les quantités d'une même ligne et respecte le stock", () => {
    let items = cartAdd([], line);
    items = cartAdd(items, { ...line, quantity: 2 });
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
    items = cartAdd(items, { ...line, quantity: 10 });
    expect(items[0].quantity).toBe(5);
  });

  it("distingue les variantes d'un même produit", () => {
    const items = cartAdd(cartAdd([], line), { ...line, variant_id: 7 });
    expect(items).toHaveLength(2);
    expect(cartCount(items)).toBe(2);
    expect(cartSubtotal(items)).toBe(400);
  });

  it("modifie, borne et supprime", () => {
    let items = cartAdd([], line);
    items = cartSetQty(items, items[0].key, 0);
    expect(items[0].quantity).toBe(1);
    items = cartSetQty(items, items[0].key, 50);
    expect(items[0].quantity).toBe(5);
    expect(cartRemove(items, items[0].key)).toEqual([]);
    expect(clampQty("abc")).toBe(1);
    expect(clampQty(500, undefined)).toBe(99);
  });

  it("regroupe par boutique", () => {
    const items = cartAdd(cartAdd([], line), { ...line, product_id: 2, shop_slug: "b", shop_name: "B" });
    expect(groupByShop(items).map((g) => g.slug)).toEqual(["a", "b"]);
  });

  it("ignore un stockage corrompu", () => {
    expect(sanitizeCart("x")).toEqual([]);
    expect(sanitizeCart([null, { product_id: "1" }, { product_id: 3, price: 5, quantity: 2 }])).toHaveLength(1);
  });
});

describe("statuts et prix", () => {
  it("tons et étapes", () => {
    expect(statusTone("completed")).toBe("ok");
    expect(statusTone("disputed")).toBe("bad");
    expect(statusTone("paid")).toBe("wait");
    expect(statusTone("shipped")).toBe("info");
    expect(stepIndex("shipped")).toBe(2);
    expect(stepIndex("cancelled")).toBe(0);
  });

  it("fourchette de prix des variantes", () => {
    expect(priceRange([{ price: 120 }, { price: 150 }, { price: 99, is_active: false }], 120)).toEqual({ min: 120, max: 150 });
    expect(priceRange([], 80)).toEqual({ min: 80, max: 80 });
  });
  it("la couleur distingue les lignes du panier", () => {
    let items = cartAdd([], { product_id: 1, variant_id: null, price: 10, quantity: 1, color: "Noir" });
    items = cartAdd(items, { product_id: 1, variant_id: null, price: 10, quantity: 1, color: "Rouge" });
    items = cartAdd(items, { product_id: 1, variant_id: null, price: 10, quantity: 1, color: "noir" });
    expect(items.map((i) => [i.key, i.quantity])).toEqual([["1:0:noir", 2], ["1:0:rouge", 1]]);
  });
});
