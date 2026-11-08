import { describe, expect, it } from "vitest";
import { indexMenu, nextLabel, preorderTotal, priceSigns, resTone, restoTone, snap, weekday } from "./resto.js";
import { tableSize } from "../three/models/dining.js";

describe("resto helpers", () => {
  it("weekday: lundi = 0", () => { expect(weekday("2026-10-26")).toBe(0); expect(weekday("2026-11-01")).toBe(6); });
  it("snap à 0,5 m", () => { expect(snap(3.26)).toBe(3.5); expect(snap(3.2)).toBe(3); });
  it("nextLabel", () => { expect(nextLabel([])).toBe("T1"); expect(nextLabel([{ label: "T3" }, { label: "T9" }])).toBe("T10"); });
  it("pré-commande", () => {
    const idx = indexMenu([{ items: [{ id: 1, price: 50 }, { id: 2, price: 20 }] }]);
    expect(preorderTotal([{ item_id: 1, qty: 2 }, { item_id: 2, qty: 1 }], idx)).toBe(120);
  });
  it("tons et signes", () => { expect(resTone("pending")).toBe("warn"); expect(resTone("declined")).toBe("bad"); expect(restoTone("active")).toBe("good"); expect(priceSigns(9)).toBe("$$$"); });
  it("taille de table croît avec les places", () => {
    expect(tableSize({ shape: "round", seats: 8 }).w).toBeGreaterThan(tableSize({ shape: "round", seats: 2 }).w);
    expect(tableSize({ shape: "rect", seats: 8 }).w).toBeGreaterThan(tableSize({ shape: "rect", seats: 2 }).w);
  });
});
