import { motion } from "framer-motion";
import { useLanguage } from "../../context/LanguageContext.jsx";

// Petit schéma de routes stylisé (pas une vraie carte géographique) —
// quatre villes reliées par les trajets Lukondo, avec un bus animé qui
// parcourt le trajet principal en boucle.
const CITIES = [
  { key: "lubumbashi", x: 40, y: 90, label: "Lubumbashi" },
  { key: "likasi", x: 130, y: 45, label: "Likasi" },
  { key: "kolwezi", x: 220, y: 90, label: "Kolwezi" },
  { key: "ndola", x: 40, y: 155, label: "Ndola (ZM)" },
];

const ROUTES = [
  ["lubumbashi", "likasi"],
  ["likasi", "kolwezi"],
  ["lubumbashi", "ndola"],
];

function cityByKey(key) {
  return CITIES.find((c) => c.key === key);
}

export default function LukondoRouteMap() {
  const { lang } = useLanguage();
  return (
    <div className="py-1">
      <svg viewBox="0 0 260 190" className="w-full h-[150px]" role="img" aria-label="route map">
        {ROUTES.map(([fromKey, toKey], i) => {
          const from = cityByKey(fromKey);
          const to = cityByKey(toKey);
          return (
            <motion.line
              key={i}
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.8, delay: i * 0.15, ease: "easeOut" }}
            />
          );
        })}

        {/* Bus animé qui parcourt Lubumbashi → Likasi → Kolwezi en boucle */}
        <motion.circle
          r="4.5"
          fill="#C89A3D"
          initial={{ offsetDistance: "0%" }}
          animate={{ offsetDistance: "100%" }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "linear" }}
          style={{
            offsetPath: `path("M ${cityByKey("lubumbashi").x} ${cityByKey("lubumbashi").y} L ${cityByKey("likasi").x} ${cityByKey("likasi").y} L ${cityByKey("kolwezi").x} ${cityByKey("kolwezi").y}")`,
          }}
        />

        {CITIES.map((c, i) => (
          <motion.g
            key={c.key}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
          >
            <circle cx={c.x} cy={c.y} r="5" fill="#1E1A17" stroke="#C89A3D" strokeWidth="1.5" />
            <text
              x={c.x}
              y={c.y - 12}
              textAnchor="middle"
              fontSize="9"
              fill="rgba(255,255,255,0.85)"
              fontFamily="'IBM Plex Sans', sans-serif"
            >
              {c.label}
            </text>
          </motion.g>
        ))}
      </svg>
    </div>
  );
}
