import { motion } from "framer-motion";

/**
 * Coquille commune pour la carte latérale sticky des pages détail — le
 * contenu (prix, stats, badges...) reste propre à chaque page, mais le
 * cadre visuel (ombre, bordure, respiration) est partagé pour une vraie
 * cohérence entre service / cours / partenaire.
 */
export default function DetailSidebarCard({ children, className = "" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className={`rounded-3xl border border-line bg-surface p-7 shadow-[0_30px_60px_-30px_rgba(30,26,23,0.18)] ${className}`}
    >
      {children}
    </motion.div>
  );
}
