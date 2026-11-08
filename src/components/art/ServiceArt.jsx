import { useId } from "react";

/**
 * Illustrations vectorielles originales de H-Company — remplacent les photos
 * aléatoires (loremflickr) : aucune dépendance externe, nettes à toutes les
 * tailles, aux couleurs de la marque, et elles ne changent pas d'un
 * chargement à l'autre.
 *
 *  - <TradeArt name="security" />   : les 5 métiers (portrait, 400×520)
 *  - <HServiceArt name="h_logement"/>: les 8 services H- (paysage, 600×420)
 */

/* ───────────────────────── Fond commun ───────────────────────── */

function Backdrop({ id, from, to, w, h, glow = "#FFFFFF" }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor={glow} stopOpacity="0.28" />
          <stop offset="1" stopColor={glow} stopOpacity="0" />
        </radialGradient>
        <pattern id={`${id}-dots`} width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.2" fill="#FFFFFF" opacity="0.16" />
        </pattern>
      </defs>
      <rect width={w} height={h} fill={`url(#${id}-bg)`} />
      <rect width={w} height={h} fill={`url(#${id}-dots)`} />
      <rect width={w} height={h} fill={`url(#${id}-glow)`} />
    </>
  );
}

const CREAM = "#FAF7F2";
const CREAM_2 = "#EADFCF";
const INK = "#1E1A17";
const GOLD = "#C89A3D";

/* ───────────────────────── Les 5 métiers ───────────────────────── */

function Security({ id }) {
  return (
    <>
      <Backdrop id={id} from="#3B271C" to="#17110D" w={400} h={520} glow="#C89A3D" />
      {[150, 112, 76].map((r, i) => (
        <circle key={r} cx="200" cy="250" r={r + 40} fill="none" stroke="#C89A3D" strokeOpacity={0.12 + i * 0.07} strokeDasharray={i === 1 ? "4 8" : "0"} />
      ))}
      <path d="M200 120 L286 152 V250 C286 312 248 354 200 376 C152 354 114 312 114 250 V152 Z" fill={`url(#${id}-shield)`} stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="2" />
      <defs>
        <linearGradient id={`${id}-shield`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E4B968" />
          <stop offset="1" stopColor="#8A5A2E" />
        </linearGradient>
      </defs>
      <path d="M200 142 L268 167 V250 C268 300 238 334 200 353 C162 334 132 300 132 250 V167 Z" fill="#17110D" fillOpacity="0.55" />
      <rect x="170" y="226" width="60" height="50" rx="9" fill={CREAM} />
      <path d="M182 226 v-14 a18 18 0 0 1 36 0 v14" fill="none" stroke={CREAM} strokeWidth="9" strokeLinecap="round" />
      <circle cx="200" cy="247" r="7" fill={INK} />
      <rect x="197" y="250" width="6" height="14" rx="3" fill={INK} />
      {/* nœuds réseau */}
      {[[70, 130], [338, 118], [330, 386], [62, 372]].map(([x, y], i) => (
        <g key={i}>
          <line x1={x} y1={y} x2="200" y2="250" stroke="#C89A3D" strokeOpacity="0.28" strokeDasharray="3 6" />
          <circle cx={x} cy={y} r="9" fill="#17110D" stroke={GOLD} strokeWidth="2" />
          <circle cx={x} cy={y} r="3" fill={GOLD} />
        </g>
      ))}
      <rect x="92" y="428" width="216" height="10" rx="5" fill="#FFFFFF" opacity="0.14" />
      <rect x="92" y="428" width="150" height="10" rx="5" fill={GOLD} />
      <rect x="130" y="452" width="140" height="8" rx="4" fill="#FFFFFF" opacity="0.1" />
    </>
  );
}

function Dev({ id }) {
  const lines = [
    [40, 80, "#E4B968"], [64, 150, "#FAF7F2"], [64, 110, "#B08968"], [88, 170, "#FAF7F2"],
    [88, 90, "#E4B968"], [64, 130, "#B08968"], [40, 60, "#E4B968"],
  ];
  return (
    <>
      <Backdrop id={id} from="#4A3226" to="#1B130F" w={400} h={520} glow="#E4B968" />
      <rect x="42" y="118" width="316" height="244" rx="18" fill="#17110D" stroke="#FFFFFF" strokeOpacity="0.2" />
      <rect x="42" y="118" width="316" height="38" rx="18" fill="#FFFFFF" fillOpacity="0.07" />
      {["#E07A5F", "#E4B968", "#8FB996"].map((c, i) => (
        <circle key={c} cx={68 + i * 20} cy="137" r="5.5" fill={c} />
      ))}
      {lines.map(([indent, width, color], i) => (
        <rect key={i} x={64 + indent - 40} y={178 + i * 24} width={width} height="9" rx="4.5" fill={color} opacity={color === CREAM ? 0.85 : 1} />
      ))}
      <rect x="64" y="346" width="10" height="3" fill={GOLD} />
      {/* carte mobile flottante */}
      <g transform="translate(236 252) rotate(8)">
        <rect width="104" height="180" rx="18" fill={CREAM} stroke="#FFFFFF" strokeOpacity="0.5" />
        <rect x="8" y="10" width="88" height="30" rx="9" fill={`url(#${id}-phone)`} />
        <rect x="8" y="50" width="88" height="40" rx="9" fill={CREAM_2} />
        <rect x="8" y="98" width="40" height="40" rx="9" fill={CREAM_2} />
        <rect x="56" y="98" width="40" height="40" rx="9" fill="#C89A3D" opacity="0.5" />
        <rect x="8" y="146" width="88" height="24" rx="12" fill={INK} />
      </g>
      <defs>
        <linearGradient id={`${id}-phone`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6F4A34" />
          <stop offset="1" stopColor="#C89A3D" />
        </linearGradient>
      </defs>
      <text x="64" y="452" fontFamily="ui-monospace, monospace" fontSize="64" fontWeight="700" fill="#FFFFFF" fillOpacity="0.16">{"</>"}</text>
    </>
  );
}

function DesignArt({ id }) {
  return (
    <>
      <Backdrop id={id} from="#6F4A34" to="#2A1B14" w={400} h={520} glow="#F3E3C8" />
      <circle cx="148" cy="190" r="86" fill="#C89A3D" fillOpacity="0.9" />
      <circle cx="244" cy="226" r="86" fill="#E07A5F" fillOpacity="0.8" style={{ mixBlendMode: "screen" }} />
      <circle cx="196" cy="300" r="86" fill="#F3E3C8" fillOpacity="0.85" style={{ mixBlendMode: "screen" }} />
      <rect x="86" y="388" width="228" height="70" rx="16" fill={CREAM} />
      {["#6F4A34", "#C89A3D", "#E07A5F", "#8FB996", "#17110D"].map((c, i) => (
        <circle key={c} cx={118 + i * 40} cy="423" r="14" fill={c} />
      ))}
      <path d="M300 110 C340 150 350 200 322 262" fill="none" stroke={CREAM} strokeWidth="5" strokeLinecap="round" strokeDasharray="1 12" />
      <path d="M312 74 l26 26 -64 64 -34 8 8 -34 z" fill={CREAM} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M274 164 l-8 34 34 -8" fill={GOLD} />
    </>
  );
}

function Infra({ id }) {
  return (
    <>
      <Backdrop id={id} from="#33261D" to="#120D0A" w={400} h={520} glow="#C89A3D" />
      <path d="M118 150 a42 42 0 0 1 80-14 a34 34 0 0 1 62 18 a30 30 0 0 1 -6 60 H132 a28 28 0 0 1 -14 -64 z" fill={CREAM} fillOpacity="0.95" />
      <path d="M200 214 v40" stroke={GOLD} strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(88 ${268 + i * 64})`}>
          <rect width="224" height="52" rx="12" fill="#17110D" stroke="#FFFFFF" strokeOpacity="0.22" />
          <rect x="14" y="14" width="96" height="8" rx="4" fill="#FFFFFF" opacity="0.2" />
          <rect x="14" y="30" width="62" height="8" rx="4" fill="#FFFFFF" opacity="0.12" />
          {[0, 1, 2].map((d) => (
            <circle key={d} cx={174 + d * 16} cy="26" r="5" fill={d === 0 ? "#8FB996" : d === 1 ? GOLD : "#E07A5F"} />
          ))}
        </g>
      ))}
      <g stroke={GOLD} strokeOpacity="0.35" fill="none">
        <path d="M60 330 H88" /><path d="M312 394 H348" /><path d="M60 458 H88" />
      </g>
    </>
  );
}

function Support({ id }) {
  return (
    <>
      <Backdrop id={id} from="#5A3A28" to="#1F150F" w={400} h={520} glow="#E4B968" />
      <circle cx="200" cy="228" r="110" fill="none" stroke="#FFFFFF" strokeOpacity="0.14" strokeDasharray="3 8" />
      <circle cx="200" cy="228" r="84" fill={CREAM} />
      {/* casque */}
      <path d="M128 232 a72 72 0 0 1 144 0" fill="none" stroke={INK} strokeWidth="14" strokeLinecap="round" />
      <rect x="112" y="224" width="34" height="62" rx="15" fill={GOLD} />
      <rect x="254" y="224" width="34" height="62" rx="15" fill={GOLD} />
      <path d="M270 282 q0 34 -52 34" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
      <circle cx="214" cy="316" r="9" fill={INK} />
      <circle cx="200" cy="236" r="26" fill={CREAM_2} />
      <rect x="162" y="268" width="76" height="20" rx="10" fill={CREAM_2} />
      {/* bulles de ticket */}
      <g transform="translate(40 372)">
        <rect width="170" height="52" rx="14" fill={CREAM} />
        <circle cx="26" cy="26" r="11" fill="#8FB996" />
        <path d="M21 26 l4 4 8 -9" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="46" y="16" width="86" height="8" rx="4" fill={INK} opacity="0.75" />
        <rect x="46" y="31" width="56" height="7" rx="3.5" fill={INK} opacity="0.25" />
      </g>
      <g transform="translate(190 434)">
        <rect width="170" height="52" rx="14" fill="#FFFFFF" fillOpacity="0.14" stroke="#FFFFFF" strokeOpacity="0.25" />
        <circle cx="26" cy="26" r="11" fill={GOLD} />
        <rect x="46" y="16" width="86" height="8" rx="4" fill="#FFFFFF" opacity="0.7" />
        <rect x="46" y="31" width="56" height="7" rx="3.5" fill="#FFFFFF" opacity="0.3" />
      </g>
    </>
  );
}

const TRADE_SCENES = { security: Security, dev: Dev, design: DesignArt, infra: Infra, support: Support };
export const TRADE_ART_KEYS = Object.keys(TRADE_SCENES);

export function TradeArt({ name, className = "" }) {
  const id = useId().replace(/:/g, "");
  const Scene = TRADE_SCENES[name] || Security;
  return (
    <svg viewBox="0 0 400 520" preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-hidden="true">
      <Scene id={id} />
    </svg>
  );
}

/* ───────────────────────── Les 8 services H- ───────────────────────── */

export const H_SERVICE_THEME = {
  h_transport_bus: { from: "#7A4E2D", to: "#2A1B14", accent: "#E4B968" },
  h_transport_colis: { from: "#8A5A36", to: "#33221A", accent: "#F0C98A" },
  h_logement: { from: "#3E6B52", to: "#16261E", accent: "#A8D5B5" },
  h_restaurant: { from: "#B2573C", to: "#3A1B13", accent: "#F2A58E" },
  h_tourisme: { from: "#3F7A78", to: "#12292A", accent: "#9EE0D8" },
  h_learning: { from: "#3D5F94", to: "#14223A", accent: "#9DB9E6" },
  h_money: { from: "#2F7A5C", to: "#10281E", accent: "#8EE0BC" },
  h_translate: { from: "#6B4FA3", to: "#241741", accent: "#C7B3F0" },
  h_shopping: { from: "#B9763C", to: "#3B2112", accent: "#F6C896" },
};

function Pin({ x, y, label, color = GOLD }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0 C-16 -22 -22 -32 -22 -44 a22 22 0 0 1 44 0 C22 -32 16 -22 0 0 z" fill={color} />
      <circle cx="0" cy="-44" r="9" fill={CREAM} />
      {label && (
        <text y="-40.5" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="8.5" fontWeight="800" fill={INK}>
          {label}
        </text>
      )}
    </g>
  );
}

function Bus({ id }) {
  return (
    <>
      <path d="M92 170 C230 60 370 60 508 170" fill="none" stroke={CREAM} strokeOpacity="0.55" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" />
      <Pin x="92" y="190" label="RDC" color="#E07A5F" />
      <Pin x="508" y="190" label="ZM" color="#8FB996" />
      <rect x="0" y="334" width="600" height="86" fill="#120D0A" fillOpacity="0.55" />
      <path d="M0 378 H600" stroke={CREAM} strokeOpacity="0.5" strokeWidth="4" strokeDasharray="28 22" />
      <g>
        <rect x="140" y="188" width="320" height="140" rx="26" fill={CREAM} />
        <rect x="140" y="262" width="320" height="22" fill={GOLD} />
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={160 + i * 52} y="208" width="40" height="44" rx="9" fill="#20384D" />
        ))}
        <path d="M416 208 h22 a14 14 0 0 1 14 14 v30 h-36 z" fill="#20384D" />
        <rect x="436" y="296" width="24" height="12" rx="6" fill={GOLD} />
        {[222, 392].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="330" r="30" fill={INK} />
            <circle cx={cx} cy="330" r="13" fill={CREAM_2} />
          </g>
        ))}
        <text x="182" y="278" fontFamily="Inter, sans-serif" fontSize="12" fontWeight="800" fill={INK} letterSpacing="2">H-TRANSPORT</text>
      </g>
    </>
  );
}

function Parcel({ id }) {
  return (
    <>
      <path d="M96 336 C150 250 210 330 276 250 S410 200 470 120" fill="none" stroke={CREAM} strokeOpacity="0.5" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" />
      <Pin x="470" y="124" color="#8FB996" />
      <circle cx="96" cy="338" r="11" fill="#E07A5F" stroke={CREAM} strokeWidth="3" />
      <ellipse cx="300" cy="372" rx="130" ry="20" fill="#120D0A" fillOpacity="0.4" />
      <polygon points="300,150 428,200 300,252 172,200" fill="#F3E3C8" />
      <polygon points="172,200 300,252 300,372 172,318" fill="#C9955E" />
      <polygon points="300,252 428,200 428,318 300,372" fill="#9A6A3B" />
      <polygon points="268,164 332,189 236,226 172,200" fill="none" />
      <polygon points="284,157 332,176 300,252 252,232" fill={CREAM_2} opacity="0.55" />
      <polygon points="300,252 332,176 356,186 322,262" fill="#FFFFFF" opacity="0.0" />
      <rect x="226" y="262" width="52" height="28" rx="4" fill={CREAM} transform="skewY(22) translate(0 -150)" opacity="0.9" />
      <g transform="translate(404 288)">
        <circle r="24" fill="#8FB996" stroke={CREAM} strokeWidth="4" />
        <path d="M-10 0 l7 8 14 -15" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </>
  );
}

function Lodging({ id }) {
  return (
    <>
      <circle cx="470" cy="104" r="40" fill="#FFF3C9" fillOpacity="0.9" />
      <ellipse cx="300" cy="372" rx="240" ry="22" fill="#0F1A14" fillOpacity="0.5" />
      <g>
        <rect x="170" y="212" width="260" height="150" rx="10" fill={CREAM} />
        <polygon points="150,222 300,112 450,222" fill="#6F4A34" />
        <polygon points="170,222 300,128 430,222" fill="#8A5A3C" />
        <rect x="268" y="272" width="64" height="90" rx="10" fill="#33261D" />
        <circle cx="320" cy="320" r="4" fill={GOLD} />
        {[[196, 246], [354, 246]].map(([x, y], i) => (
          <g key={i}>
            <rect x={x} y={y} width="52" height="52" rx="8" fill="#FFE9A8" />
            <path d={`M${x + 26} ${y} v52 M${x} ${y + 26} h52`} stroke="#6F4A34" strokeWidth="3" />
          </g>
        ))}
        <rect x="378" y="132" width="24" height="52" fill="#6F4A34" />
      </g>
      {[[96, 320, 46], [118, 296, 34], [512, 322, 44], [490, 296, 32]].map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="#A8D5B5" fillOpacity={0.9 - i * 0.08} />
      ))}
      <rect x="92" y="326" width="8" height="40" fill="#5A3A28" />
      <rect x="508" y="328" width="8" height="38" fill="#5A3A28" />
      <Pin x="300" y="104" color={GOLD} />
    </>
  );
}

function Restaurant({ id }) {
  return (
    <>
      <ellipse cx="300" cy="364" rx="200" ry="26" fill="#2A100A" fillOpacity="0.45" />
      <ellipse cx="300" cy="286" rx="150" ry="62" fill={CREAM} />
      <ellipse cx="300" cy="280" rx="118" ry="46" fill={CREAM_2} />
      <ellipse cx="300" cy="276" rx="92" ry="34" fill="#C77B3C" />
      <circle cx="270" cy="270" r="14" fill="#8FB07A" />
      <circle cx="318" cy="262" r="16" fill="#E8C16A" />
      <circle cx="334" cy="288" r="12" fill="#D6603A" />
      <circle cx="286" cy="292" r="10" fill="#F3E3C8" />
      {[250, 300, 350].map((x, i) => (
        <path key={x} d={`M${x} 214 c-14 -22 14 -34 0 -58 c-8 -14 4 -28 4 -28`} fill="none" stroke={CREAM} strokeOpacity="0.55" strokeWidth="5" strokeLinecap="round" style={{ transform: `translateY(${i % 2 ? 6 : 0}px)` }} />
      ))}
      <g fill={CREAM}>
        <rect x="104" y="196" width="10" height="150" rx="5" />
        <rect x="92" y="196" width="34" height="48" rx="12" />
        <path d="M478 196 c34 30 34 90 6 118 v34 h-12 v-34 c-26 -28 -26 -88 6 -118 z" />
      </g>
      <g transform="translate(468 108)" fill={GOLD}>
        {[0, 1, 2, 3, 4].map((i) => (
          <polygon key={i} transform={`translate(${i * 24 - 48} 0) scale(0.9)`} points="10,0 13,7 21,8 15,13 17,21 10,17 3,21 5,13 -1,8 7,7" />
        ))}
      </g>
    </>
  );
}

function Learning({ id }) {
  return (
    <>
      <ellipse cx="300" cy="372" rx="190" ry="20" fill="#0B1424" fillOpacity="0.5" />
      <path d="M300 230 C250 200 180 200 128 218 V352 C180 334 250 336 300 366 Z" fill={CREAM} />
      <path d="M300 230 C350 200 420 200 472 218 V352 C420 334 350 336 300 366 Z" fill={CREAM_2} />
      <path d="M300 230 V366" stroke="#9DB9E6" strokeWidth="3" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <path d={`M152 ${240 + i * 22} q64 -16 128 6`} stroke="#9DB9E6" strokeWidth="5" strokeLinecap="round" fill="none" opacity={0.85 - i * 0.12} />
          <path d={`M320 ${246 + i * 22} q64 -22 128 -6`} stroke="#6C8EBF" strokeWidth="5" strokeLinecap="round" fill="none" opacity={0.7 - i * 0.1} />
        </g>
      ))}
      <g transform="translate(300 146)">
        <polygon points="0,-42 112,0 0,42 -112,0" fill={INK} />
        <polygon points="0,-30 84,0 0,30 -84,0" fill="#1B2D4A" />
        <path d="M-50 22 v36 c0 18 100 18 100 0 v-36 l-50 20 z" fill="#14223A" />
        <path d="M92 8 v50" stroke={GOLD} strokeWidth="5" strokeLinecap="round" />
        <circle cx="92" cy="64" r="8" fill={GOLD} />
      </g>
      {[[96, 120, 7], [510, 150, 9], [478, 90, 5]].map(([x, y, r], i) => (
        <path key={i} transform={`translate(${x} ${y})`} d={`M0 -${r * 2} L${r * 0.6} -${r * 0.6} L${r * 2} 0 L${r * 0.6} ${r * 0.6} L0 ${r * 2} L-${r * 0.6} ${r * 0.6} L-${r * 2} 0 L-${r * 0.6} -${r * 0.6} Z`} fill="#FFFFFF" opacity="0.8" />
      ))}
    </>
  );
}

function Money({ id }) {
  return (
    <>
      <ellipse cx="300" cy="376" rx="220" ry="18" fill="#08170F" fillOpacity="0.5" />
      <g transform="translate(150 230)">
        <circle r="74" fill={GOLD} />
        <circle r="58" fill="none" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="3" strokeDasharray="3 6" />
        <text y="18" textAnchor="middle" fontFamily="Fraunces, serif" fontSize="56" fontWeight="700" fill={INK}>$</text>
      </g>
      <g transform="translate(450 230)">
        <circle r="74" fill={CREAM} />
        <circle r="58" fill="none" stroke="#2F7A5C" strokeOpacity="0.5" strokeWidth="3" strokeDasharray="3 6" />
        <text y="14" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="34" fontWeight="800" fill="#1E4D3A">FC</text>
      </g>
      <path d="M214 182 C260 130 340 130 386 182" fill="none" stroke={CREAM} strokeWidth="5" strokeLinecap="round" />
      <path d="M386 182 l-16 -2 8 14 z" fill={CREAM} />
      <path d="M386 278 C340 330 260 330 214 278" fill="none" stroke={CREAM} strokeWidth="5" strokeLinecap="round" strokeOpacity="0.75" />
      <path d="M214 278 l16 2 -8 -14 z" fill={CREAM} fillOpacity="0.75" />
      <g transform="translate(262 196)">
        <rect width="76" height="124" rx="16" fill="#0E2219" stroke="#FFFFFF" strokeOpacity="0.4" strokeWidth="2" />
        <rect x="9" y="14" width="58" height="26" rx="8" fill="#8EE0BC" />
        <circle cx="38" cy="80" r="20" fill="#8EE0BC" />
        <path d="M28 80 l7 8 14 -16" stroke="#0E2219" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="14" y="108" width="48" height="6" rx="3" fill="#FFFFFF" opacity="0.4" />
      </g>
    </>
  );
}

function Translate({ id }) {
  return (
    <>
      <circle cx="300" cy="210" r="150" fill="none" stroke="#FFFFFF" strokeOpacity="0.16" />
      <ellipse cx="300" cy="210" rx="62" ry="150" fill="none" stroke="#FFFFFF" strokeOpacity="0.16" />
      <path d="M150 210 H450 M170 140 H430 M170 280 H430" stroke="#FFFFFF" strokeOpacity="0.12" />
      <g transform="translate(118 112)">
        <rect width="230" height="96" rx="24" fill={CREAM} />
        <polygon points="40,96 40,128 76,96" fill={CREAM} />
        <text x="115" y="58" textAnchor="middle" fontFamily="Fraunces, serif" fontSize="32" fontStyle="italic" fontWeight="600" fill="#3A2A5C">Hello!</text>
      </g>
      <g transform="translate(250 232)">
        <rect width="236" height="96" rx="24" fill={`url(#${id}-bub)`} />
        <polygon points="196,96 196,128 160,96" fill="#8A6FD0" />
        <text x="118" y="58" textAnchor="middle" fontFamily="Fraunces, serif" fontSize="32" fontStyle="italic" fontWeight="600" fill="#FFFFFF">Mbote!</text>
      </g>
      <defs>
        <linearGradient id={`${id}-bub`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8A6FD0" />
          <stop offset="1" stopColor="#5B3FA0" />
        </linearGradient>
      </defs>
      {[[98, 300, 6], [506, 130, 8], [86, 86, 4]].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#FFFFFF" opacity="0.5" />
      ))}
      <text x="470" y="368" fontFamily="Inter, sans-serif" fontSize="30" fontWeight="800" fill="#FFFFFF" fillOpacity="0.2">A↔文</text>
    </>
  );
}

function Shopping({ id }) {
  return (
    <>
      <ellipse cx="300" cy="376" rx="220" ry="20" fill="#2A1608" fillOpacity="0.5" />
      <path d="M210 178 H390 L406 356 a14 14 0 0 1 -14 16 H208 a14 14 0 0 1 -14 -16 Z" fill={CREAM} />
      <path d="M254 178 v-22 a46 46 0 0 1 92 0 v22" fill="none" stroke={CREAM} strokeWidth="14" strokeLinecap="round" />
      <path d="M254 178 v-22 a46 46 0 0 1 92 0 v22" fill="none" stroke={INK} strokeWidth="3" strokeOpacity="0.25" strokeLinecap="round" />
      <path d="M194 330 H406 L408 356 a14 14 0 0 1 -14 16 H208 a14 14 0 0 1 -14 -16 Z" fill={GOLD} opacity="0.85" />
      <g transform="translate(300 262)">
        <circle r="40" fill="#B9763C" />
        <path d="M-16 4 q16 -34 32 0 v8 q-16 22 -32 0 z" fill={CREAM} opacity="0.95" />
        <text y="12" textAnchor="middle" fontFamily="Fraunces, serif" fontSize="34" fontWeight="700" fill={CREAM}>H</text>
      </g>
      <g transform="translate(116 244) rotate(-12)">
        <rect width="66" height="66" rx="10" fill="#F3E3C8" />
        <rect y="26" width="66" height="10" fill="#C89A3D" opacity="0.8" />
        <rect x="28" width="10" height="66" fill="#C89A3D" opacity="0.8" />
      </g>
      <g transform="translate(436 214) rotate(10)">
        <rect width="90" height="48" rx="12" fill="#E07A5F" />
        <circle cx="16" cy="24" r="6" fill={CREAM} />
        <text x="58" y="31" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="22" fontWeight="800" fill={CREAM}>-20%</text>
      </g>
      {[[470, 120, 6], [124, 150, 8], [514, 330, 5]].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#FFFFFF" opacity="0.5" />
      ))}
    </>
  );
}

function Tourism() {
  return (
    <>
      <circle cx="446" cy="120" r="38" fill="#F6D58E" fillOpacity="0.9" />
      <path d="M40 360 L190 150 L270 260 L340 190 L560 360 Z" fill="#1B4A48" />
      <path d="M190 150 L222 196 L200 188 L186 210 L166 186 L152 198 Z" fill={CREAM} fillOpacity="0.9" />
      <path d="M0 360 L130 270 L240 360 Z" fill="#256563" fillOpacity="0.85" />
      <rect x="0" y="336" width="600" height="84" fill="#0E2425" fillOpacity="0.55" />
      <path d="M96 392 C200 350 300 410 420 372 S540 390 600 380" fill="none" stroke={CREAM} strokeOpacity="0.5" strokeWidth="5" strokeDasharray="2 12" strokeLinecap="round" />
    </>
  );
}

const H_SCENES = {
  h_transport_bus: Bus,
  h_transport_colis: Parcel,
  h_logement: Lodging,
  h_restaurant: Restaurant,
  h_tourisme: Tourism,
  h_learning: Learning,
  h_money: Money,
  h_translate: Translate,
  h_shopping: Shopping,
};

export function HServiceArt({ name, className = "" }) {
  const id = useId().replace(/:/g, "");
  const theme = H_SERVICE_THEME[name] || H_SERVICE_THEME.h_transport_bus;
  const Scene = H_SCENES[name] || Bus;
  return (
    <svg viewBox="0 0 600 420" preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-hidden="true">
      <Backdrop id={id} from={theme.from} to={theme.to} w={600} h={420} glow={theme.accent} />
      <Scene id={id} />
    </svg>
  );
}
