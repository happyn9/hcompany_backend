import { describe, expect, it } from "vitest";
import {
  addDays, bookingTone, buildMonth, clampGuests, estimateNightly, formatRating, lastCheckout, nightsBetween, osmEmbedUrl, pickDate,
  rangeIsFree, searchQuery, toISO,
} from "./lodge.js";

const make = (start, n, blocked = [], price = 100) => {
  const days = {};
  for (let i = 0; i < n; i++) {
    const d = addDays(start, i);
    days[d] = { available: !blocked.includes(d), price };
  }
  return days;
};

describe("dates", () => {
  it("additionne des jours en franchissant mois et années", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("compte les nuits", () => {
    expect(nightsBetween("2026-10-10", "2026-10-13")).toBe(3);
    expect(nightsBetween("2026-10-30", "2026-11-02")).toBe(3);
    expect(nightsBetween("", "2026-11-02")).toBe(0);
  });
  it("toISO suit le jour local", () => {
    expect(toISO(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("buildMonth", () => {
  it("commence le lundi et complète les semaines", () => {
    const weeks = buildMonth(2026, 9); // octobre 2026 : le 1er est un jeudi
    expect(weeks[0].slice(0, 3)).toEqual([null, null, null]);
    expect(weeks[0][3]).toBe("2026-10-01");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
  });
});

describe("sélection de dates", () => {
  const days = make("2026-10-01", 30, ["2026-10-10", "2026-10-11"]);
  it("détecte une plage libre", () => {
    expect(rangeIsFree(days, "2026-10-05", "2026-10-10")).toBe(true); // départ le matin du 10 : nuits 5..9
    expect(rangeIsFree(days, "2026-10-05", "2026-10-11")).toBe(false); // la nuit du 10 est prise
    expect(rangeIsFree(days, "2026-10-05", "2026-10-05")).toBe(false);
  });
  it("calcule le départ le plus tardif", () => {
    expect(lastCheckout(days, "2026-10-05")).toBe("2026-10-10");
    expect(lastCheckout(days, "2026-10-12")).toBe("2026-10-31");
  });
  it("premier clic = arrivée, second = départ", () => {
    let sel = pickDate(days, { start: null, end: null }, "2026-10-05");
    expect(sel).toEqual({ start: "2026-10-05", end: null });
    sel = pickDate(days, sel, "2026-10-08");
    expect(sel).toEqual({ start: "2026-10-05", end: "2026-10-08" });
    sel = pickDate(days, sel, "2026-10-20"); // nouvelle sélection
    expect(sel).toEqual({ start: "2026-10-20", end: null });
  });
  it("refuse de traverser une nuit prise et ignore les jours bloqués", () => {
    const sel = pickDate(days, { start: "2026-10-05", end: null }, "2026-10-14");
    expect(sel).toEqual({ start: "2026-10-14", end: null }); // 14 est libre : devient la nouvelle arrivée
    expect(pickDate(days, { start: null, end: null }, "2026-10-10")).toEqual({ start: null, end: null });
  });
  it("respecte le séjour minimum", () => {
    const sel = pickDate(days, { start: "2026-10-05", end: null }, "2026-10-06", 2);
    expect(sel.end).toBeNull();
    expect(pickDate(days, { start: "2026-10-05", end: null }, "2026-10-07", 2).end).toBe("2026-10-07");
  });
  it("estime le prix des nuits", () => {
    expect(estimateNightly(days, "2026-10-05", "2026-10-08")).toBe(300);
  });
});

describe("divers", () => {
  it("tons de statut", () => {
    expect(bookingTone("confirmed")).toBe("ok");
    expect(bookingTone("expired")).toBe("bad");
    expect(bookingTone("pending_host")).toBe("wait");
  });
  it("requête de recherche sans valeurs vides", () => {
    expect(searchQuery({ city: "Lusaka", guests: 2, instant: false, q: "", amenities: ["wifi", "pool"] })).toBe("city=Lusaka&guests=2&amenities=wifi%2Cpool");
  });
  it("garde-fous", () => {
    expect(clampGuests(0)).toBe(1);
    expect(clampGuests(999)).toBe(60);
    expect(formatRating(4.76)).toBe("4,8");
    expect(formatRating(4.76, "en")).toBe("4.8");
    expect(osmEmbedUrl(-15.4, 28.3)).toContain("marker=-15.40000,28.30000");
  });
});
