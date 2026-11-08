export const DEPARTMENTS = ["partnerships", "learning", "lodging", "transport", "shopping", "restaurant", "tourism"];
export const DEPT_LABEL = {
  fr: { partnerships: "Partenariats", learning: "H-Learning", lodging: "H-Logement", transport: "H-Transport", shopping: "H-Shopping", restaurant: "H-Restaurant", tourism: "H-Tourisme" },
  en: { partnerships: "Partnerships", learning: "H-Learning", lodging: "H-Lodging", transport: "H-Transport", shopping: "H-Shopping", restaurant: "H-Restaurant", tourism: "H-Tourism" },
};
export const deptLabel = (lang, k) => (DEPT_LABEL[lang] || DEPT_LABEL.fr)[k] || k;
/** Points d'une sparkline SVG (largeur w, hauteur h) à partir des valeurs. */
export function sparkPoints(values, w = 120, h = 32) {
  if (!values.length) return "";
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  return values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
}
