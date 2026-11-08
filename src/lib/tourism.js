export const CATEGORIES = ["safari", "waterfall", "culture", "adventure", "city", "nature", "boat", "hiking", "food", "wellness"];
export const DIFFICULTIES = ["easy", "moderate", "hard"];
export const LANGS = ["fr", "en", "sw", "ny", "bem", "pt", "de", "zh"];
export const BOOKING_STATUSES = ["pending", "confirmed", "completed", "cancelled", "declined", "no_show"];

export function bookingTone(s) { return ["confirmed", "completed"].includes(s) ? "good" : s === "pending" ? "warn" : "bad"; }
export function tourTone(s) { return s === "active" ? "good" : ["pending", "paused", "draft"].includes(s) ? "warn" : "bad"; }

export function isoToday(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function fmtDay(iso, lang = "fr", opts = { weekday: "short", day: "numeric", month: "short" }) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", opts);
}
export function fmtDuration(h, lang = "fr") {
  if (h >= 24) { const d = Math.round(h / 24 * 10) / 10; return lang === "en" ? `${d} day${d === 1 ? "" : "s"}` : `${d} jour${d === 1 ? "" : "s"}`; }
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return mm ? `${hh} h ${String(mm).padStart(2, "0")}` : `${hh} h`;
}
/** Regroupe les départs par jour : [{day, items:[...]}], dans l'ordre. */
export function groupByDay(deps) {
  const map = new Map();
  for (const d of deps) { if (!map.has(d.day)) map.set(d.day, []); map.get(d.day).push(d); }
  return [...map.entries()].map(([day, items]) => ({ day, items }));
}
export function quoteTotal(dep, adults, children) {
  if (!dep) return 0;
  return dep.price_adult * adults + (dep.price_child ?? 0) * children;
}
export const lines = (text) => (text || "").split("\n").map((x) => x.trim()).filter(Boolean);
