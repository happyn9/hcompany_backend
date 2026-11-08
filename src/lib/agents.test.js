import { describe, expect, it } from "vitest";
import { sparkPoints, deptLabel } from "./agents.js";
describe("agents lib", () => {
  it("sparkPoints", () => {
    expect(sparkPoints([])).toBe("");
    expect(sparkPoints([0, 10], 100, 30).split(" ")).toEqual(["0.0,28.0", "100.0,2.0"]);
  });
  it("deptLabel falls back to key", () => { expect(deptLabel("fr", "transport")).toBe("H-Transport"); expect(deptLabel("fr", "x")).toBe("x"); });
});
