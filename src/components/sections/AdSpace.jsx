import { motion } from "framer-motion";
import { useLanguage } from "../../context/LanguageContext.jsx";

/**
 * Emplacement réservé pour de la publicité (Google AdSense) ou des liens
 * d'affiliation. Volontairement neutre et sobre — pas de fausse publicité
 * générée, juste un conteneur propre, prêt à recevoir le script ou le
 * composant réel le moment venu (ex: <ins className="adsbygoogle">…</ins>).
 */
export default function AdSpace() {
  const { t } = useLanguage();
  return (
    <div className="px-6 py-10 border-t border-line bg-cream/40">
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="max-w-content mx-auto"
      >
        <div
          id="ad-slot-leaderboard"
          data-ad-slot="reserved"
          className="mx-auto max-w-3xl h-24 sm:h-28 rounded-2xl border border-dashed border-line-strong bg-surface/60 flex flex-col items-center justify-center gap-1"
        >
          <span className="text-[0.7rem] uppercase tracking-widest text-ink-faint">{t("footer.ads")}</span>
          <span className="text-xs text-ink-faint">{t("footer.adsText")}</span>
        </div>
      </motion.div>
    </div>
  );
}
