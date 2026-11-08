// Données structurelles des partenaires — réutilisées par la section
// d'aperçu (Partners.jsx) et par la page de détail complète
// (PartnerDetail.jsx), pour ne jamais les laisser diverger.

import LukondoRouteMap from "../components/sections/LukondoRouteMap.jsx";
import ConfismilaGalette from "../components/sections/ConfismilaGalette.jsx";
import UstudyMockup from "../components/sections/UstudyMockup.jsx";

export const PARTNER_META = [
  {
    slug: "lukondo",
    key: "lukondo",
    name: "Lukondo",
    initial: "L",
    gradient: "linear-gradient(135deg, #4A3020, #2E1D12)",
    Visual: LukondoRouteMap,
    heroImage: "bus,transport,africa",
  },
  {
    slug: "confismila",
    key: "confismila",
    name: "Confismila",
    initial: "C",
    gradient: "linear-gradient(135deg, #8A4A2E, #4A3020)",
    Visual: ConfismilaGalette,
    heroImage: "restaurant,africa,kitchen",
  },
  {
    slug: "h-learning",
    key: "hlearning",
    name: "H-learning",
    initial: "H",
    gradient: "linear-gradient(135deg, #6F4A34, #4A3020)",
    Visual: null,
    heroImage: "students,classroom,africa",
  },
  {
    slug: "u-study",
    key: "ustudy",
    name: "U-Study",
    initial: "U",
    gradient: "linear-gradient(135deg, #4A3020, #6F4A34)",
    Visual: UstudyMockup,
    heroImage: "smartphone,africa,person",
  },
];

export function findPartnerBySlug(slug) {
  return PARTNER_META.find((p) => p.slug === slug);
}

/** Construit le contenu traduit d'un partenaire — fonction pure (pas un
 * hook), pour être appelable aussi bien depuis un composant que depuis un
 * simple .map() sans enfreindre les règles des hooks React. */
export function getPartnerContent(t, meta) {
  const key = meta.key;
  return {
    role: t(`companies.${key}.role`),
    text: t(`companies.${key}.text`),
    longText: t(`companies.${key}.longText`),
    stats: [
      { value: key === "lukondo" ? "4" : key === "hlearning" ? "100 %" : key === "ustudy" ? "2" : "1", label: t(`companies.${key}.stat1`) },
      { value: key === "lukondo" ? "24/7" : key === "hlearning" ? "3" : key === "ustudy" ? "24/7" : "0", label: t(`companies.${key}.stat2`) },
      { value: key === "lukondo" ? "2" : key === "hlearning" ? "✓" : key === "ustudy" ? "iOS/Android" : "24/7", label: t(`companies.${key}.stat3`) },
    ],
    highlights: [t(`companies.${key}.h1`), t(`companies.${key}.h2`), t(`companies.${key}.h3`)],
  };
}
