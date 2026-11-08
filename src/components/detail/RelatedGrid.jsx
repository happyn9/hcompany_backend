import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

/**
 * Grille de suggestions en fin de page détail ("autres services",
 * "autres cours"...) — cartes photo pleines plutôt que de petites
 * vignettes, avec un survol plus marqué pour donner envie de cliquer.
 * `items` : [{ key, to, image, title, subtitle? }]
 */
export default function RelatedGrid({ eyebrow, heading, items }) {
  if (!items.length) return null;

  return (
    <section className="px-6 py-20 md:py-24 border-t border-line max-w-content mx-auto">
      <div className="mb-10">
        {eyebrow && <p className="text-sm font-medium text-coffee mb-3">{eyebrow}</p>}
        <h2 className="font-display italic text-2xl sm:text-3xl text-ink">{heading}</h2>
      </div>
      <div className="grid sm:grid-cols-3 gap-6">
        {items.map((item, i) => (
          <motion.div
            key={item.key}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
          >
            <Link to={item.to} className="group block rounded-2xl overflow-hidden border border-line bg-surface">
              <div className="relative h-44 overflow-hidden">
                {item.art ? (
                  <div className="w-full h-full group-hover:scale-110 transition-transform duration-700 ease-out">{item.art}</div>
                ) : (
                  <img
                    src={item.image}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-ink-fixed/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <span className="absolute top-3 right-3 w-8 h-8 rounded-full bg-cream/90 flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-300">
                  <ArrowUpRight size={15} className="text-ink" />
                </span>
              </div>
              <div className="p-5">
                <p className="font-display text-lg text-ink group-hover:text-coffee-dark transition-colors">
                  {item.title}
                </p>
                {item.subtitle && <p className="text-sm text-ink-soft mt-1">{item.subtitle}</p>}
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
