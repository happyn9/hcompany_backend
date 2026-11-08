import { describe, it, expect } from "vitest";
import * as T from "./tourism.js";
describe("tourism helpers", () => {
  it("tones", () => {
    expect(T.tourTone("active")).toBe("good");
    expect(T.tourTone("pending")).toBe("warn");
    expect(T.tourTone("rejected")).toBe("bad");
  });
  it("exposes constants", () => {
    expect(T.CATEGORIES.length).toBeGreaterThan(5);
    expect(typeof T.isoToday()).toBe("string");
  });
});
