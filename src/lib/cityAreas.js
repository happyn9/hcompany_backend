import { CITY_COORDS, coordOf } from "./cities.js";

/** Quartiers connus par ville : positions INDICATIVES (centre approximatif du quartier), pour se repérer sur la carte. */
export const AREAS = {
  Lusaka: [
    ["Centre-ville", -15.4167, 28.2833], ["Kabulonga", -15.4000, 28.3300], ["Woodlands", -15.4350, 28.3150], ["Rhodes Park", -15.4040, 28.2950],
    ["Roma", -15.3840, 28.3170], ["Olympia Park", -15.3950, 28.3070], ["Northmead", -15.4030, 28.3010], ["Longacres", -15.4130, 28.3060],
    ["Chelston", -15.3900, 28.3600], ["Kalingalinga", -15.3990, 28.3350], ["Chilenje", -15.4450, 28.3050], ["Kabwata", -15.4300, 28.2950],
    ["Matero", -15.3900, 28.2500], ["Kanyama", -15.4350, 28.2400], ["Chawama", -15.4600, 28.2650], ["Garden", -15.3880, 28.2830],
    ["Ibex Hill", -15.4380, 28.3560], ["Makeni", -15.4800, 28.2800], ["Chamba Valley", -15.3700, 28.3700], ["Chilanga", -15.5500, 28.2700],
  ],
  Kitwe: [["Centre-ville", -12.8024, 28.2132], ["Parklands", -12.8000, 28.2100], ["Nkana East", -12.8200, 28.2250], ["Riverside", -12.8300, 28.2000], ["Chimwemwe", -12.7950, 28.2400], ["Ndeke", -12.7850, 28.2200], ["Kwacha", -12.8300, 28.2350]],
  Ndola: [["Centre-ville", -12.9587, 28.6366], ["Itawa", -12.9600, 28.6600], ["Kansenshi", -12.9850, 28.6350], ["Northrise", -12.9400, 28.6550], ["Masala", -12.9700, 28.6050]],
  Livingstone: [["Centre-ville", -17.8419, 25.8543], ["Maramba", -17.8700, 25.8500], ["Dambwa", -17.8700, 25.8800], ["Chimwemwe", -17.8300, 25.8700]],
  Kinshasa: [["Gombe", -4.3100, 15.3000], ["Limete", -4.3500, 15.3400], ["Ngaliema", -4.3300, 15.2500], ["Bandalungwa", -4.3350, 15.2800], ["Lemba", -4.4100, 15.3200], ["Kintambo", -4.3280, 15.2700], ["Masina", -4.3800, 15.3900]],
  Lubumbashi: [["Centre-ville", -11.6609, 27.4794], ["Golf", -11.6450, 27.4850], ["Bel-Air", -11.6500, 27.4600], ["Kenya", -11.6700, 27.5000]],
};

export const MAX_KM = 60;
const R = 6371;
const rad = (d) => (d * Math.PI) / 180;
export function haversineKm(a, b) {
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const cityKey = (name) => Object.keys(CITY_COORDS).find((k) => k.toLowerCase() === String(name || "").trim().toLowerCase()) || null;
export const areasOf = (city) => AREAS[cityKey(city)] || [];
/** Le point est-il plausible pour cette ville ? (même règle que le serveur : ≤ 60 km du centre ; ville inconnue → oui) */
export function nearCity(city, lat, lng) { const c = coordOf(city); return !c || haversineKm(c, [lat, lng]) <= MAX_KM; }
