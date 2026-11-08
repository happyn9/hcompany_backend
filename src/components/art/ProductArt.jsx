import { useId } from "react";

/**
 * Illustrations vectorielles de produits pour l'aperçu de la marketplace
 * (H-Shopping). Aucune photo externe : nettes à toute taille, aux couleurs de
 * la marque, identiques à chaque chargement. `c1` = couleur principale,
 * `c2` = couleur d'accent.
 */
const INK = "#1E1A17";
const CREAM = "#FAF7F2";
const GOLD = "#C89A3D";

const KINDS = {
  dress: ({ c1, c2 }) => (
    <>
      <path d="M84 30 L92 30 L100 54 L108 30 L116 30 L123 68 Q111 82 117 100 L138 168 H62 L83 100 Q89 82 77 68 Z" fill={c1} />
      <path d="M77 68 Q100 90 123 68" stroke={c2} strokeWidth="4" fill="none" strokeLinecap="round" />
      <rect x="82" y="98" width="36" height="7" rx="3.5" fill={c2} />
      <path d="M70 140 Q100 150 130 140" stroke={c2} strokeWidth="2.5" fill="none" opacity="0.6" />
    </>
  ),
  shirt: ({ c1, c2 }) => (
    <>
      <path d="M68 42 L90 33 Q100 46 110 33 L132 42 L156 74 L134 90 L127 80 V154 H73 V80 L66 90 L44 74 Z" fill={c1} />
      <path d="M90 33 Q100 50 110 33" stroke={c2} strokeWidth="5" fill="none" strokeLinecap="round" />
      <rect x="84" y="98" width="22" height="22" rx="4" fill={c2} opacity="0.85" />
    </>
  ),
  sneaker: ({ c1, c2 }) => (
    <>
      <path d="M32 120 Q32 96 54 91 L74 85 Q84 98 106 100 L150 104 Q172 109 174 128 V136 H32 Z" fill={c1} />
      <rect x="28" y="133" width="150" height="15" rx="7.5" fill={CREAM} />
      <path d="M32 120 H174" stroke={c2} strokeWidth="5" />
      <path d="M80 92 l8 -8 M94 98 l8 -8 M108 101 l8 -8" stroke={CREAM} strokeWidth="4" strokeLinecap="round" />
      <path d="M52 112 q10 -10 22 -6" stroke={c2} strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  ),
  bag: ({ c1, c2 }) => (
    <>
      <path d="M72 82 V68 a28 28 0 0 1 56 0 V82" stroke={c2} strokeWidth="7" fill="none" strokeLinecap="round" />
      <rect x="44" y="78" width="112" height="82" rx="18" fill={c1} />
      <path d="M44 104 H156" stroke={INK} strokeOpacity="0.18" strokeWidth="3" />
      <circle cx="100" cy="104" r="9" fill={c2} />
      <circle cx="100" cy="104" r="3.5" fill={INK} opacity="0.55" />
    </>
  ),
  sofa: ({ c1, c2 }) => (
    <>
      <rect x="40" y="60" width="120" height="52" rx="16" fill={c2} />
      <rect x="26" y="88" width="148" height="44" rx="16" fill={c1} />
      <rect x="26" y="84" width="26" height="62" rx="12" fill={c1} />
      <rect x="148" y="84" width="26" height="62" rx="12" fill={c1} />
      <path d="M100 92 V128" stroke={INK} strokeOpacity="0.15" strokeWidth="3" />
      <rect x="44" y="148" width="8" height="14" rx="3" fill={INK} opacity="0.6" />
      <rect x="148" y="148" width="8" height="14" rx="3" fill={INK} opacity="0.6" />
    </>
  ),
  lamp: ({ c1, c2 }) => (
    <>
      <circle cx="100" cy="86" r="52" fill={GOLD} opacity="0.14" />
      <path d="M72 50 H128 L142 104 H58 Z" fill={c1} />
      <rect x="96" y="104" width="8" height="46" rx="4" fill={c2} />
      <ellipse cx="100" cy="156" rx="28" ry="8" fill={c2} />
      <path d="M72 50 H128" stroke={CREAM} strokeOpacity="0.5" strokeWidth="3" />
    </>
  ),
  headphones: ({ c1, c2 }) => (
    <>
      <path d="M50 108 V96 a50 50 0 0 1 100 0 V108" stroke={c1} strokeWidth="12" fill="none" strokeLinecap="round" />
      <rect x="36" y="100" width="28" height="52" rx="13" fill={c2} />
      <rect x="136" y="100" width="28" height="52" rx="13" fill={c2} />
      <rect x="42" y="112" width="8" height="28" rx="4" fill={CREAM} opacity="0.5" />
      <rect x="150" y="112" width="8" height="28" rx="4" fill={CREAM} opacity="0.5" />
    </>
  ),
  phone: ({ c1, c2 }) => (
    <>
      <rect x="62" y="26" width="76" height="148" rx="16" fill={c1} />
      <rect x="68" y="36" width="64" height="124" rx="9" fill={INK} opacity="0.85" />
      <rect x="76" y="46" width="48" height="26" rx="6" fill={c2} />
      <rect x="76" y="80" width="48" height="8" rx="4" fill={CREAM} opacity="0.5" />
      <rect x="76" y="94" width="34" height="8" rx="4" fill={CREAM} opacity="0.3" />
      <circle cx="100" cy="146" r="6" fill={CREAM} opacity="0.35" />
    </>
  ),
  basket: ({ c1, c2 }) => (
    <>
      <path d="M58 92 Q100 22 142 92" stroke={c1} strokeWidth="7" fill="none" strokeLinecap="round" />
      <circle cx="78" cy="92" r="15" fill="#E2703A" />
      <circle cx="104" cy="86" r="14" fill="#7BAA5A" />
      <circle cx="128" cy="94" r="13" fill="#D9453A" />
      <path d="M36 98 H164 L146 160 H54 Z" fill={c1} />
      <path d="M44 118 H156 M50 138 H150" stroke={c2} strokeWidth="3" opacity="0.7" />
      <path d="M70 98 L76 160 M100 98 V160 M130 98 L124 160" stroke={c2} strokeWidth="3" opacity="0.55" />
    </>
  ),
  fabric: ({ c1, c2 }, { id }) => (
    <>
      <defs>
        <pattern id={`${id}-wax`} width="26" height="26" patternUnits="userSpaceOnUse">
          <rect width="26" height="26" fill={c1} />
          <path d="M13 3 L23 13 L13 23 L3 13 Z" fill={c2} />
          <circle cx="13" cy="13" r="3.5" fill={CREAM} />
        </pattern>
      </defs>
      <path d="M40 58 Q100 40 160 58 V142 Q100 160 40 142 Z" fill={`url(#${id}-wax)`} />
      <path d="M40 58 Q100 76 160 58" stroke={INK} strokeOpacity="0.18" strokeWidth="3" fill="none" />
      <path d="M40 100 Q100 118 160 100" stroke={INK} strokeOpacity="0.12" strokeWidth="2" fill="none" />
    </>
  ),
  vase: ({ c1, c2 }) => (
    <>
      <path d="M84 36 H116 V58 Q150 76 146 110 Q142 150 118 160 H82 Q58 150 54 110 Q50 76 84 58 Z" fill={c1} />
      <path d="M62 96 H138 M60 116 H140" stroke={c2} strokeWidth="6" />
      <path d="M66 136 l8 -10 8 10 8 -10 8 10 8 -10 8 10 8 -10 8 10" stroke={CREAM} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="80" y="30" width="40" height="10" rx="5" fill={c2} />
    </>
  ),
  jar: ({ c1, c2 }) => (
    <>
      <rect x="58" y="62" width="84" height="86" rx="20" fill={c1} />
      <rect x="64" y="40" width="72" height="30" rx="10" fill={c2} />
      <rect x="74" y="88" width="52" height="34" rx="8" fill={CREAM} opacity="0.9" />
      <rect x="82" y="98" width="36" height="6" rx="3" fill={INK} opacity="0.55" />
      <rect x="82" y="109" width="24" height="5" rx="2.5" fill={INK} opacity="0.3" />
      <path d="M150 150 q8 -26 20 -26 q4 14 -8 30 z" fill={c2} opacity="0.8" />
    </>
  ),
};

export const PRODUCT_KINDS = Object.keys(KINDS);

export default function ProductArt({ kind, c1 = "#8A5A36", c2 = "#E4B968", className = "" }) {
  const id = useId().replace(/:/g, "");
  const Draw = KINDS[kind] || KINDS.bag;
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-hidden="true">
      {Draw({ c1, c2 }, { id })}
      {/* ombre au sol commune */}
      <ellipse cx="100" cy="184" rx="52" ry="5" fill={INK} opacity="0.1" />
    </svg>
  );
}
