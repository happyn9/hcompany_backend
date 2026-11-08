import { describe, expect, it } from "vitest";
import { hexToRgb, isCutout, tintPixels } from "./colorize.js";

describe("colorize", () => {
  it("hexToRgb", () => {
    expect(hexToRgb("#ff0000")).toEqual([255, 0, 0]);
    expect(hexToRgb("red")).toBeNull();
  });
  it("garde la transparence et applique la teinte", () => {
    const px = new Uint8ClampedArray([120, 120, 120, 255, 10, 20, 30, 0, 60, 60, 60, 255]);
    tintPixels(px, "#c0392b");
    expect([px[4], px[5], px[6], px[7]]).toEqual([10, 20, 30, 0]);
    expect(px[0]).toBeGreaterThan(px[1] + 40);
    expect(px[8]).toBeLessThan(px[0]); // pixel plus sombre → rendu plus sombre
  });
  it("noir : reste sombre", () => {
    const px = new Uint8ClampedArray([200, 200, 200, 255, 200, 200, 200, 255]);
    tintPixels(px, "#111111");
    expect(px[0]).toBeLessThan(60);
  });
  it("isCutout", () => { expect(isCutout("shopping/1-ab-cut.png")).toBe(true); expect(isCutout("shopping/1-ab.png")).toBe(false); });
});
