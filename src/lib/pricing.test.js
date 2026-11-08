import { describe, expect, it } from "vitest";
import { OPERATORS, buildPhone, convert, formatMoney, monthlyEquivalent, phoneIsComplete, planTotal } from "./pricing.js";

const team = { price_monthly: 120, price_yearly: 1200, per_seat: true, min_seats: 5 };
const solo = { price_monthly: 150, price_yearly: 1500, per_seat: false, min_seats: 1 };

describe("pricing", () => {
  it("totals per seat for team plans and flat for others", () => {
    expect(planTotal(solo, "month", 9)).toBe(150);
    expect(planTotal(team, "year", 6)).toBe(7200);
    expect(planTotal(team, "month", 2)).toBe(600); // plancher de places
  });

  it("converts from the pivot currency", () => {
    expect(convert(1500, 0.04)).toBeCloseTo(60);
    expect(convert(150, 110)).toBe(16500);
    expect(monthlyEquivalent(solo)).toBe(125);
  });

  it("formats money in both languages", () => {
    expect(formatMoney(1500, { symbol: "K" }, "en")).toBe("K 1,500");
    expect(formatMoney(60, { code: "USD", symbol: "$" }, "fr").replace(/\s/g, " ")).toBe("$ 60");
    expect(formatMoney(2.5, { symbol: "$" }, "en")).toBe("$ 2.5");
  });

  it("builds national phone numbers per operator", () => {
    const mtn = OPERATORS.find((o) => o.key === "mtn_momo");
    expect(buildPhone(mtn.prefixes[0], "123 4567")).toBe("0961234567");
    expect(phoneIsComplete("123456")).toBe(false);
    expect(phoneIsComplete("1234567")).toBe(true);
  });
});
