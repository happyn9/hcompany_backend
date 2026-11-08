import { describe, expect, it } from "vitest";
import { addDays, dayKey, formatDuration, fromLocalInput, fmtTime, nextDays, searchQuery, seatRows, seatsForPassengers, tone, toggleSeat, toLocalInput, totalFor, ticketUsable } from "./transport.js";

describe("transport helpers", () => {
  it("lit les heures locales sans décalage", () => {
    expect(fmtTime("2026-10-23T01:08:00")).toBe("01:08");
    expect(dayKey("2026-10-23T01:08:00")).toBe("2026-10-23");
    expect(toLocalInput("2026-10-23T01:08:00")).toBe("2026-10-23T01:08");
    expect(fromLocalInput("2026-10-23T01:08")).toBe("2026-10-23T01:08:00");
  });
  it("ajoute des jours en passant les fins de mois", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(nextDays(3, "2026-12-30")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
  });
  it("formate les durées", () => {
    expect(formatDuration(450)).toBe("7 h 30");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(45)).toBe("45 min");
  });
  it("dessine le plan du bus", () => {
    expect(seatRows(8)).toEqual([[1, 2, null, 3, 4], [5, 6, null, 7, 8]]);
    expect(seatRows(6)[1]).toEqual([5, 6, null, "gap", "gap"]);
    expect(seatRows(7, "2+1")).toEqual([[1, 2, null, 3], [4, 5, null, 6], [7, "gap", null, "gap"]]);
    expect(seatRows(3, "1+1")).toEqual([[1, null, 2], [3, null, "gap"]]);
    expect(seatRows(4, "inconnu")).toEqual([[1, 2, null, 3, 4]]);
  });
  it("gère la sélection de sièges", () => {
    expect(toggleSeat([2], 5, 2)).toEqual([2, 5]);
    expect(toggleSeat([2, 5], 7, 2)).toEqual([2, 5]);
    expect(toggleSeat([2, 5], 2, 2)).toEqual([5]);
    expect(seatsForPassengers([4], 3)).toEqual([4, null, null]);
  });
  it("construit la requête, calcule le total, qualifie les statuts", () => {
    expect(searchQuery({ origin: "Lusaka", seats: 2, border: false, q: "" })).toBe("origin=Lusaka&seats=2");
    expect(totalFor(250.5, 3)).toBe(751.5);
    expect(tone("confirmed")).toBe("ok");
    expect(tone("disputed")).toBe("bad");
    expect(ticketUsable("cancelled_user")).toBe(false);
  });
});
