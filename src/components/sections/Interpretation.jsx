import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Languages, ArrowRight } from "lucide-react";
import Reveal from "../ui/Reveal.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";

export default function Interpretation() {
  const { t } = useLanguage();
  const [flip, setFlip] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setFlip((f) => !f), 2600);
    return () => clearInterval(timer);
  }, []);

  const features = [t("interpretation.feature1"), t("interpretation.feature2"), t("interpretation.feature3")];

  return (
    <section id="interpretation" className="px-6 py-28 md:py-32 border-t border-line bg-cream/40 overflow-hidden">
      <div className="max-w-content mx-auto grid md:grid-cols-2 gap-14 items-center">
        <Reveal>
          <p className="text-sm font-medium text-coffee mb-4">{t("interpretation.eyebrow")}</p>
          <h2 className="font-display italic text-3xl sm:text-4xl leading-tight text-ink mb-5">
            {t("interpretation.heading")}
          </h2>
          <p className="text-stone leading-relaxed max-w-md mb-7">{t("interpretation.lead")}</p>

          <ul className="space-y-3 mb-8">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-stone">
                <span className="w-1.5 h-1.5 rounded-full bg-coffee mt-1.5 shrink-0" />
                {f}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-4">
            <RouterLink
              to="/infos#rejoindre"
              className="inline-flex items-center gap-1.5 rounded-full bg-ink text-cream text-sm font-medium px-6 py-3 hover:bg-coffee-dark transition-colors"
            >
              {t("interpretation.cta")}
              <ArrowRight size={15} />
            </RouterLink>
            <RouterLink
              to="/interpretation"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ink underline underline-offset-4 decoration-line hover:decoration-coffee hover:text-coffee transition-colors"
            >
              {t("interpretation.detailCta")}
            </RouterLink>
          </div>
        </Reveal>

        {/* Visuel : deux bulles de conversation qui alternent de langue,
            reliées par une icône de traduction animée. */}
        <div className="relative flex flex-col items-center gap-4 py-6">
          <div className="w-14 h-14 rounded-2xl bg-ink text-[#C89A3D] flex items-center justify-center mb-2 shadow-lg">
            <Languages size={24} />
          </div>

          <div className="w-full max-w-sm space-y-3">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="bg-surface border border-line rounded-2xl rounded-bl-sm px-5 py-3.5 max-w-[85%] shadow-sm"
            >
              <AnimatePresence mode="wait">
                <motion.p
                  key={flip ? "a2" : "a1"}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.3 }}
                  className="text-sm text-ink"
                >
                  {flip ? t("interpretation.langB") : t("interpretation.langA")}
                </motion.p>
              </AnimatePresence>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="bg-ink text-cream rounded-2xl rounded-br-sm px-5 py-3.5 max-w-[85%] ml-auto shadow-sm"
            >
              <AnimatePresence mode="wait">
                <motion.p
                  key={flip ? "b2" : "b1"}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.3 }}
                  className="text-sm"
                >
                  {flip ? t("interpretation.langA") : t("interpretation.langB")}
                </motion.p>
              </AnimatePresence>
            </motion.div>
          </div>

          <div className="flex items-center gap-1.5 mt-2">
            {["FR", "EN", "SW", "BEM"].map((lg) => (
              <span key={lg} className="text-[0.65rem] font-medium text-ink-faint bg-surface border border-line rounded-full px-2.5 py-1">
                {lg}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
