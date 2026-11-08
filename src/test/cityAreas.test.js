import { describe, expect, it } from "vitest";
import { areasOf, haversineKm, nearCity } from "../lib/cityAreas.js";

describe("cityAreas", () => {
  it("distance Lusaka → Kitwe ≈ 300 km", () => { const d = haversineKm([-15.4167, 28.2833], [-12.8024, 28.2132]); expect(d).toBeGreaterThan(280); expect(d).toBeLessThan(310); });
  it("un point proche de la ville est accepté, un point lointain refusé", () => {
    expect(nearCity("Lusaka", -15.40, 28.33)).toBe(true);
    expect(nearCity("lusaka", -4.44, 15.27)).toBe(false); // Kinshasa
    expect(nearCity("Ville inconnue", 1, 1)).toBe(true);
  });
  it("quartiers de Lusaka disponibles, tous dans la ville", () => {
    const a = areasOf("Lusaka"); expect(a.length).toBeGreaterThan(10);
    a.forEach(([, la, ln]) => expect(nearCity("Lusaka", la, ln)).toBe(true));
  });
});
