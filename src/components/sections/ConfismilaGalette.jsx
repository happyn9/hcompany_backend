import { motion } from "framer-motion";

// Illustration stylisée d'une galette — pas une photo, un dessin vectoriel
// cohérent avec l'identité graphique du site (mêmes teintes café/or).
export default function ConfismilaGalette() {
  return (
    <div className="flex justify-center py-2">
      <svg viewBox="0 0 220 150" className="w-full max-w-[220px] h-[130px]" role="img" aria-label="galette">
        {/* vapeur */}
        {[0, 1, 2].map((i) => (
          <motion.path
            key={i}
            d={`M${85 + i * 25} 35 C ${80 + i * 25} 25, ${95 + i * 25} 20, ${90 + i * 25} 8`}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: [0, 0.8, 0], y: [6, -6, -14] }}
            transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.4, ease: "easeInOut" }}
          />
        ))}

        {/* assiette */}
        <ellipse cx="110" cy="105" rx="85" ry="22" fill="rgba(255,255,255,0.08)" />
        <ellipse cx="110" cy="100" rx="85" ry="22" fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />

        {/* galette pliée en triangle, façon crêpe/galette */}
        <motion.g
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <path
            d="M110 55 L165 100 L55 100 Z"
            fill="#E4C08A"
            stroke="#C89A3D"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M110 55 L138 100 M110 55 L82 100"
            stroke="#C89A3D"
            strokeWidth="1.2"
            opacity="0.5"
          />
          {/* garniture visible sur le pli */}
          <path
            d="M92 92 Q110 78 128 92"
            stroke="#A94B32"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
            opacity="0.75"
          />
        </motion.g>
      </svg>
    </div>
  );
}
