import BackLink from "../ui/BackLink.jsx";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

/**
 * Bandeau héros partagé par les pages détail (service, cours, partenaire,
 * interprétation, shopping) — remplace trois implémentations quasi
 * identiques par une seule, pour une vraie cohérence visuelle et un seul
 * endroit à ajuster si le style doit évoluer.
 *
 * `overlay` : dégradé CSS complet (background), laissé au choix de la page
 * appelante puisque chaque contexte a sa propre couleur de marque (le ton
 * du niveau d'un cours, le dégradé propre à un partenaire...).
 */
export default function DetailHero({ image, art, overlay, backLabel, backTo, badge, title, icon: Icon, children }) {
  return (
    <section className="relative h-[64vh] min-h-[460px] max-h-[720px] overflow-hidden pt-16">
      {art ? (
        <motion.div
          initial={{ scale: 1.06 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0"
        >
          {art}
        </motion.div>
      ) : (
        <motion.img
          src={image}
          alt=""
          initial={{ scale: 1.08 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      <div className="absolute inset-0" style={{ background: overlay }} />

      {/* Grain discret pour casser le côté trop lisse d'une simple photo +
          dégradé — un détail qui distingue une page "pro" d'une page
          générique. */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.04] mix-blend-overlay" aria-hidden="true">
        <filter id="detail-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#detail-grain)" />
      </svg>

      <div className="relative h-full max-w-content mx-auto px-6 flex flex-col justify-end pb-14">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
          <BackLink
            to={backTo}
            className="inline-flex items-center gap-1.5 text-cream-fixed/70 text-sm hover:text-cream-fixed transition-colors mb-6 w-fit"
          >
            <ArrowLeft size={14} />
            {backLabel}
          </BackLink>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
          {(badge || Icon) && (
            <div className="flex items-center gap-3 mb-5">
              {Icon && (
                <span className="w-11 h-11 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center text-[#C89A3D] shrink-0">
                  <Icon size={20} />
                </span>
              )}
              {badge}
            </div>
          )}
          <h1
            className="font-display italic text-cream-fixed max-w-2xl"
            style={{ fontSize: "clamp(2.1rem, 1.5rem + 2.6vw, 3.6rem)", lineHeight: 1.08 }}
          >
            {title}
          </h1>
          {children}
        </motion.div>
      </div>
    </section>
  );
}
