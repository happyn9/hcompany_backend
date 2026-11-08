import { describe, expect, it } from "vitest";
import { resolveMove } from "./WalkView.jsx";

const wall = [{ x0: -5, x1: 5, z0: -1.1, z1: -1 }];
describe("resolveMove", () => {
  it("avance librement hors des obstacles", () => {
    expect(resolveMove(0, 0, 0, -0.2, wall, null)).toEqual([0, -0.2]);
  });
  it("est arrêté par un mur mais glisse le long de celui-ci", () => {
    const [x, z] = resolveMove(0, -0.6, 0.3, -0.9, wall, null);
    expect(z).toBeCloseTo(-0.6); // bloqué en profondeur
    expect(x).toBeCloseTo(0.3);  // glisse en largeur
  });
  it("reste dans les limites", () => {
    const [x] = resolveMove(9.9, 0, 12, 0, [], { x0: -10, x1: 10, z0: -10, z1: 10 });
    expect(x).toBeLessThanOrEqual(10 - 0.28 + 1e-9);
  });
});
