import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ShoppingBag } from "lucide-react";
import Reveal from "../ui/Reveal.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";

// Chaque photo flotte indépendamment (amplitude/durée/délai propres) pour un
// effet de collage vivant plutôt que des cartes figées — inspiré des
// vitrines e-commerce premium.
const PRODUCTS = [
  { photo: "furniture,sofa,modern", rotate: -6, size: "w-40 h-52 sm:w-48 sm:h-60", pos: "top-0 left-4 sm:left-10", duration: 5.5, delay: 0 },
  { photo: "fashion,clothing,africa", rotate: 5, size: "w-32 h-40 sm:w-40 sm:h-48", pos: "top-6 right-2 sm:right-8", duration: 4.5, delay: 0.4 },
  { photo: "home,appliance,kitchen", rotate: -3, size: "w-28 h-28 sm:w-36 sm:h-36", pos: "bottom-8 left-0 sm:left-2", duration: 5, delay: 0.8 },
  { photo: "decor,lamp,interior", rotate: 8, size: "w-24 h-32 sm:w-32 sm:h-40", pos: "bottom-0 right-10 sm:right-16", duration: 4.8, delay: 1.2 },
];

export default function Shopping() {
  const { t } = useLanguage();

  return (
    <section id="shopping" className="px-6 py-28 md:py-32 border-t border-line bg-surface overflow-hidden">
      <div className="max-w-content mx-auto grid lg:grid-cols-2 gap-16 items-center">
        <Reveal>
          <p className="text-sm font-medium text-coffee mb-4">{t("shopping.eyebrow")}</p>
          <h2 className="font-display italic text-3xl sm:text-4xl leading-tight text-ink mb-6 max-w-md">
            {t("shopping.heading")}
          </h2>
          <p className="text-stone leading-relaxed max-w-md mb-8">{t("shopping.lead")}</p>
          <Link
            to="/shopping"
            className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-7 py-3.5 hover:bg-coffee-dark transition-colors w-fit"
          >
            <ShoppingBag size={16} />
            {t("shopping.cta")}
            <ArrowRight size={15} />
          </Link>
          <Link to="/shopping/vendre" className="ml-3 inline-flex items-center gap-2 rounded-full border border-line text-ink text-sm font-medium px-6 py-3.5 hover:bg-line/50 transition-colors w-fit">
            {t("shopping.sellCta")}
          </Link>
        </Reveal>

        {/* --- Collage de photos flottantes --- */}
        <div className="relative h-[380px] sm:h-[440px]">
          <div
            className="absolute inset-8 sm:inset-12 rounded-full opacity-40"
            style={{ background: "radial-gradient(circle, rgba(200,154,61,0.25) 0%, transparent 70%)" }}
          />
          {PRODUCTS.map((p, i) => (
            <motion.div
              key={p.photo}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, delay: i * 0.12 }}
              className={`absolute ${p.pos} ${p.size}`}
            >
              <motion.div
                animate={{ y: [0, -14, 0] }}
                transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: "easeInOut" }}
                className="w-full h-full rounded-2xl overflow-hidden shadow-[0_24px_50px_-20px_rgba(30,26,23,0.35)] border-4 border-surface"
                style={{ transform: `rotate(${p.rotate}deg)` }}
              >
                <img
                  src={`https://loremflickr.com/400/500/${p.photo}`}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </motion.div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
