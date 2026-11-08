import { motion, AnimatePresence } from "framer-motion";

/**
 * Écran de chargement de marque — même idée que le "ta-dum" Netflix, mais
 * avec notre lettre H qui s'anime au centre d'un fond sombre : un flash de
 * lumière chaude derrière la lettre, un léger zoom, puis un fondu vers le
 * contenu. Utilisé (a) au tout premier chargement de la home et (b) comme
 * fallback de <Suspense> lors des changements de page (voir App.jsx) — dans
 * les deux cas il reste visible un minimum de temps pour que l'animation se
 * joue vraiment, plutôt qu'un flash technique à peine perceptible.
 */
export default function BrandLoader({ visible = true }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-ink-fixed overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        >
          {/* Halo chaud derrière la lettre — pulse doucement, comme la
              lumière qui "s'allume" derrière le logo Netflix. */}
          <motion.div
            className="absolute w-[36rem] h-[36rem] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(215,164,103,0.35) 0%, rgba(215,164,103,0.08) 45%, transparent 70%)",
            }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 0.85], scale: [0.6, 1.15, 1] }}
            transition={{ duration: 1.1, times: [0, 0.6, 1], ease: "easeOut" }}
          />

          <motion.span
            className="relative font-display text-cream-fixed select-none"
            style={{ fontSize: "clamp(5rem, 18vw, 11rem)", lineHeight: 1 }}
            initial={{ opacity: 0, scale: 0.35, filter: "blur(6px)" }}
            animate={{
              opacity: 1,
              scale: [0.35, 1.12, 1],
              filter: ["blur(6px)", "blur(0px)", "blur(0px)"],
            }}
            transition={{ duration: 0.9, times: [0, 0.7, 1], ease: [0.22, 1, 0.36, 1] }}
          >
            H
            <motion.span
              className="absolute left-0 right-0 -bottom-2 h-[3px] rounded-full"
              style={{ backgroundColor: "var(--color-latte)" }}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5, ease: "easeOut" }}
            />
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
