// Prix des bouquets H-Learning : monnaie pivot (ZMW), conversions d'affichage
// et règles de saisie des numéros mobile money. Le serveur recalcule toujours
// le total à payer — ces fonctions ne servent qu'à l'affichage.

export const PIVOT_DEFAULT = "ZMW";

/** Opérateurs mobile money de Zambie : préfixe affiché (0xx) + 7 chiffres. */
export const OPERATORS = [
  { key: "zamtel_money", label: "Zamtel", prefixes: ["95"], accent: "#1B8A3A" },
  { key: "mtn_momo", label: "MTN", prefixes: ["96", "76"], accent: "#E0A800" },
  { key: "airtel_money", label: "Airtel", prefixes: ["97", "77"], accent: "#D4001A" },
];

export function operatorByKey(key) {
  return OPERATORS.find((o) => o.key === key) || OPERATORS[0];
}

/** Numéro national complet (0971234567) à partir du préfixe choisi + 7 chiffres. */
export function buildPhone(prefix, digits) {
  return `0${prefix}${String(digits || "").replace(/\D/g, "").slice(0, 7)}`;
}

export function phoneIsComplete(digits) {
  return String(digits || "").replace(/\D/g, "").length === 7;
}

/** Montant d'un bouquet pour une période et un nombre de places (monnaie pivot). */
export function planTotal(plan, period, seats = 1) {
  if (!plan) return 0;
  const unit = period === "year" ? plan.price_yearly : plan.price_monthly;
  return plan.per_seat ? unit * Math.max(plan.min_seats || 1, seats) : unit;
}

/** Équivalent mensuel d'un prix annuel (pour montrer l'économie). */
export function monthlyEquivalent(plan) {
  return plan ? plan.price_yearly / 12 : 0;
}

export function convert(amountPivot, rate = 1) {
  return amountPivot * (rate || 1);
}

/** "K 1 500", "$ 60", "FC 165 000" — sans décimales sauf pour les petits montants. */
export function formatMoney(amount, currency, lang = "fr") {
  const value = Math.abs(amount) < 10 && amount % 1 ? Math.round(amount * 100) / 100 : Math.round(amount);
  const nf = new Intl.NumberFormat(lang === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 2 });
  const symbol = currency?.symbol || currency?.code || "";
  return `${symbol} ${nf.format(value)}`.trim();
}

export function formatDate(iso, lang = "fr") {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
