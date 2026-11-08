// Fonctions pures de H-Logement (dates, calendrier, statuts, cartes) — testées dans lodge.test.js.
// Les dates circulent en texte ISO « AAAA-MM-JJ » (jour local), jamais en objets Date entre composants.

export const RENT_TYPES = ["house", "apartment", "villa", "studio", "room"]; // location au mois
export const STAY_TYPES = ["lodge", "hotel_room", "apartment", "house", "villa", "guesthouse", "studio", "room"];

// Équipement → icône lucide (résolue côté composant).
export const AMENITY_ICONS = {
  wifi: "Wifi", kitchen: "CookingPot", parking: "ParkingCircle", ac: "Snowflake", fan: "Fan", heating: "Flame", hot_water: "ShowerHead",
  tv: "Tv", pool: "Waves", garden: "Trees", balcony: "Sunset", bbq: "Beef", breakfast: "Coffee", restaurant: "Utensils",
  laundry: "WashingMachine", workspace: "Laptop", generator: "Zap", security: "ShieldCheck", reception_24h: "ConciergeBell",
  airport_shuttle: "Bus", mosquito_net: "Bug", fridge: "Refrigerator", family_friendly: "Baby", pets_allowed: "PawPrint", wheelchair: "Accessibility",
};

const pad = (n) => String(n).padStart(2, "0");

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function todayISO() {
  return toISO(new Date());
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function nightsBetween(a, b) {
  if (!a || !b) return 0;
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

export function formatDay(iso, lang = "fr", opts = { day: "numeric", month: "short" }) {
  if (!iso) return "";
  return parseISO(iso).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", opts);
}

export function formatRange(ci, co, lang = "fr") {
  if (!ci || !co) return "";
  const sameYear = parseISO(ci).getFullYear() === parseISO(co).getFullYear();
  const a = formatDay(ci, lang, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  const b = formatDay(co, lang, { day: "numeric", month: "short", year: "numeric" });
  return `${a} – ${b}`;
}

/** Semaines (tableaux de 7 cases, null = case vide) d'un mois ; semaine commençant le lundi. */
export function buildMonth(year, month) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => toISO(new Date(year, month, i + 1)))];
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Premier jour (≥ start+1) à partir duquel le séjour n'est plus possible : on peut partir ce jour-là, pas après. */
export function lastCheckout(days, start) {
  let d = addDays(start, 1);
  for (let i = 0; i < 400; i++) {
    const night = addDays(d, -1);
    const info = days[night];
    if (!info || !info.available) return night; // la nuit `night` est prise → départ au plus tard le matin de `night`
    d = addDays(d, 1);
    if (!days[d]) return d; // fin des données : on s'arrête au dernier jour connu
  }
  return d;
}

/** Vrai si toutes les nuits de [ci, co) sont libres. */
export function rangeIsFree(days, ci, co) {
  if (!ci || !co || co <= ci) return false;
  for (let d = ci; d < co; d = addDays(d, 1)) {
    if (!days[d] || !days[d].available) return false;
  }
  return true;
}

/** Réaction à un clic dans le calendrier : renvoie la nouvelle sélection { start, end }. */
export function pickDate(days, sel, iso, minNights = 1) {
  const { start, end } = sel;
  const canStart = days[iso]?.available;
  if (!start || end) return canStart ? { start: iso, end: null } : sel;
  if (iso <= start) return canStart ? { start: iso, end: null } : sel;
  if (nightsBetween(start, iso) >= minNights && rangeIsFree(days, start, iso)) return { start, end: iso };
  return canStart ? { start: iso, end: null } : sel;
}

/** Prix « à partir de » d'une sélection, avec les tarifs saisonniers du calendrier. */
export function estimateNightly(days, ci, co) {
  let sum = 0;
  for (let d = ci; d < co; d = addDays(d, 1)) sum += days[d]?.price || 0;
  return sum;
}

export const BOOKING_STEPS = ["pending_host", "confirmed", "checked_in", "completed"];

export function bookingTone(status) {
  if (["completed", "confirmed", "checked_in"].includes(status)) return "ok";
  if (["declined", "expired", "cancelled_guest", "cancelled_host", "disputed", "rejected", "suspended"].includes(status)) return "bad";
  if (["pending_host", "pending", "requested", "draft", "paused"].includes(status)) return "wait";
  return "info";
}

export function propertyTone(status) {
  if (status === "active") return "ok";
  if (["rejected", "suspended"].includes(status)) return "bad";
  if (["pending", "draft", "paused"].includes(status)) return "wait";
  return "info";
}

export function osmEmbedUrl(lat, lng, span = 0.012) {
  const bbox = [lng - span, lat - span, lng + span, lat + span].map((n) => n.toFixed(5)).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export function osmLink(lat, lng, zoom = 15) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;
}

/** Paramètres d'URL de recherche à partir d'un état de formulaire (valeurs vides ignorées). */
export function searchQuery(state) {
  const sp = new URLSearchParams();
  Object.entries(state || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "" || v === false) return;
    if (Array.isArray(v)) {
      if (v.length) sp.set(k, v.join(","));
      return;
    }
    sp.set(k, String(v));
  });
  return sp.toString();
}

export function clampGuests(n, max = 60) {
  return Math.min(Math.max(1, Math.floor(Number(n) || 1)), max);
}

/** Note moyenne affichée « 4,8 » (virgule en français). */
export function formatRating(v, lang = "fr") {
  const s = (Number(v) || 0).toFixed(1);
  return lang === "en" ? s : s.replace(".", ",");
}
