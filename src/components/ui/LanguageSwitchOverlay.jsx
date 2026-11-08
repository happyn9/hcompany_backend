import { motion } from "framer-motion";

/**
 * Recouvre tout l'écran pendant le court instant où on change de langue —
 * la page se recharge complètement juste après (voir useLanguageSwitch),
 * ce qui garantit que absolument tout le contenu (y compris ce qui
 * viendrait d'un composant mal câblé au contexte) reflète la nouvelle
 * langue, sans dépendre de la propagation React seule.
 */
export default function LanguageSwitchOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[300] bg-cream/90 backdrop-blur-sm flex items-center justify-center"
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
        className="w-10 h-10 border-2 border-line border-t-coffee-dark rounded-full"
      />
    </motion.div>
  );
}
