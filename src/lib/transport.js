// Aides H-Transport (fonctions pures, testées). Les heures de départ sont des
// heures locales (CAT) sans fuseau : on lit les chaînes ISO telles quelles.

export const BUS_TYPES = ["standard", "vip", "minibus", "coaster"];
export const BOOKING_STEPS = ["confirmed", "boarded", "completed"];

const pad = (n) => String(n).padStart(2, "0");

export function dayKey(iso) {
  return String(iso || "").slice(0, 10);
}
export function fmtTime(iso) {
  return String(iso || "").slice(11, 16);
}
function dateOf(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}
export function fmtDay(iso, lang = "fr", opts = { weekday: "short", day: "numeric", month: "short" }) {
  const k = dayKey(iso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return "";
  return dateOf(k).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", opts);
}
export function fmtDateTime(iso, lang = "fr") {
  return iso ? `${fmtDay(iso, lang)} · ${fmtTime(iso)}` : "";
}
export function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function todayISO() {
  return toISODate(new Date());
}
export function addDays(key, n) {
  const d = dateOf(key);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}
export function nextDays(n, from = todayISO()) {
  return Array.from({ length: n }, (_, i) => addDays(from, i));
}
export function formatDuration(minutes, lang = "fr") {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${pad(m)}` : `${h} h`;
}
/** Valeur d'un <input type="datetime-local"> à partir d'un ISO local. */
export function toLocalInput(iso) {
  return iso ? String(iso).slice(0, 16) : "";
}
/** ISO envoyé au serveur depuis un <input type="datetime-local">. */
export function fromLocalInput(v) {
  return v ? (v.length === 16 ? `${v}:00` : v) : "";
}

export const BUS_LAYOUTS = { "2+2": [2, 2], "2+1": [2, 1], "1+1": [1, 1] };

/** Plan du bus : une rangée = sièges de gauche, `null` (couloir), sièges de droite.
 *  Les places absentes de la dernière rangée sont "gap". Disposition par défaut 2+2. */
export function seatRows(total, layout = "2+2") {
  const [l, r] = BUS_LAYOUTS[layout] || BUS_LAYOUTS["2+2"];
  const per = l + r;
  const rows = [];
  for (let n = 1; n <= total; n += per) {
    const cell = (k) => (n + k <= total ? n + k : "gap");
    rows.push([...Array.from({ length: l }, (_, i) => cell(i)), null, ...Array.from({ length: r }, (_, i) => cell(l + i))]);
  }
  return rows;
}
export function toggleSeat(selected, seat, max) {
  if (selected.includes(seat)) return selected.filter((s) => s !== seat);
  return selected.length >= max ? selected : [...selected, seat].sort((a, b) => a - b);
}
/** Associe les sièges choisis aux passagers (les passagers en trop n'ont pas de siège → attribution auto). */
export function seatsForPassengers(selected, count) {
  return Array.from({ length: count }, (_, i) => selected[i] ?? null);
}

export function searchQuery(o = {}) {
  const sp = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "" && v !== false) sp.set(k, String(v));
  });
  return sp.toString();
}
export function totalFor(price, n) {
  return Math.round(Number(price || 0) * n * 100) / 100;
}
export function formatRating(v, lang = "fr") {
  return Number(v || 0).toLocaleString(lang === "en" ? "en-GB" : "fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
/** Ton d'une pastille selon le statut. */
export function tone(status) {
  if (["confirmed", "boarded", "completed", "approved", "scheduled", "paid"].includes(status)) return "ok";
  if (["pending", "pending_payment", "requested", "departed"].includes(status)) return "wait";
  if (["disputed", "expired", "cancelled_user", "cancelled_operator", "cancelled", "rejected", "suspended"].includes(status)) return "bad";
  return "info";
}
/** Un ticket est utilisable tant que la réservation est payée et non annulée. */
export function ticketUsable(status) {
  return ["confirmed", "boarded", "completed", "disputed"].includes(status);
}
