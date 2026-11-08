import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";

/**
 * Accordéon de questions/réponses réutilisable — utilisé sur la page
 * d'accueil (FAQ générale) et sur chaque page de détail partenaire (FAQ
 * spécifique). `items` : [{ question, answer }].
 */
export default function FAQ({ eyebrow, heading, items, dark = false }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section className={`px-6 py-24 md:py-28 border-t border-line ${dark ? "bg-ink" : "bg-surface"}`}>
      <div className="max-w-content mx-auto max-w-3xl">
        <div className="text-center mb-12">
          {eyebrow && (
            <p className={`text-sm font-medium mb-4 ${dark ? "text-[#C89A3D]" : "text-coffee"}`}>{eyebrow}</p>
          )}
          <h2 className={`font-display italic text-3xl sm:text-4xl leading-tight ${dark ? "text-cream" : "text-ink"}`}>
            {heading}
          </h2>
        </div>

        <div className={`divide-y ${dark ? "divide-white/10" : "divide-line"}`}>
          {items.map((item, i) => {
            const isOpen = openIndex === i;
            return (
              <div key={item.question} className="py-2">
                <button
                  onClick={() => setOpenIndex(isOpen ? -1 : i)}
                  className="w-full flex items-center justify-between gap-4 py-4 text-left"
                >
                  <span className={`font-display text-lg ${dark ? "text-cream" : "text-ink"}`}>
                    {item.question}
                  </span>
                  <motion.span
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    transition={{ duration: 0.25 }}
                    className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                      dark ? "bg-white/10 text-cream" : "bg-cream text-ink"
                    }`}
                  >
                    <Plus size={14} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className={`pb-5 leading-relaxed text-sm ${dark ? "text-cream/60" : "text-stone"}`}>
                        {item.answer}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
