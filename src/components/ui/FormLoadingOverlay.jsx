import { motion, AnimatePresence } from "framer-motion";

/**
 * Overlay "pro" affiché par-dessus un formulaire pendant son envoi — un H
 * animé (halo qui pulse + anneau qui tourne, aux couleurs H-Company) sur
 * fond flouté, plutôt qu'un simple spinner générique dans le bouton.
 *
 * Usage : entourer le <form> d'un conteneur `className="relative"`, puis
 * placer <FormLoadingOverlay show={status === "loading"} label="..." />
 * en premier enfant de ce conteneur — il se pose en position absolute et
 * recouvre tout le formulaire tant que `show` est vrai.
 *
 * `rounded` permet d'aligner le coin de l'overlay sur celui du conteneur
 * (ex: "rounded-2xl" pour une modale, "" pour un formulaire de section sans
 * carte visible).
 */
export default function FormLoadingOverlay({ show, label = "Envoi en cours…", rounded = "rounded-2xl" }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 0.25 }}
          className={`absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-cream/85 backdrop-blur-[3px] ${rounded}`}
          role="status"
          aria-live="polite"
        >
          <div className="relative w-16 h-16 flex items-center justify-center">
            {/* Anneau conique qui tourne */}
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{
                background: "conic-gradient(from 0deg, transparent 0%, #C89A3D 55%, transparent 100%)",
                WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
                mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
            />
            {/* Halo qui pulse */}
            <motion.span
              className="absolute inset-1.5 rounded-full bg-[#C89A3D]/15"
              animate={{ scale: [1, 1.18, 1], opacity: [0.5, 0.9, 0.5] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            />
            {/* H central */}
            <motion.span
              className="relative font-display italic text-2xl text-ink"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            >
              H
            </motion.span>
          </div>
          <motion.p
            className="text-sm text-ink-soft font-medium px-6 text-center"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {label}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
