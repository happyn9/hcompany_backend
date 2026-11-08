import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import Reveal from "../ui/Reveal.jsx";
import { TradeArt } from "../art/ServiceArt.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { SERVICES_META, UNIT_LABEL } from "../../data/services.js";

// Disposition "bento" : la première carte est mise en avant, les autres se
// partagent la grille. Chaque métier a sa propre illustration vectorielle
// (components/art/ServiceArt.jsx -> TradeArt), nommée comme sa catégorie.
const SPANS = [
  "lg:col-span-2 lg:row-span-2 min-h-[360px] lg:min-h-[480px]",
  "min-h-[230px]",
  "min-h-[230px]",
  "min-h-[230px]",
  "min-h-[230px]",
];

export default function Services() {
  const { t, lang } = useLanguage();

  const services = SERVICES_META.map((m) => ({
    ...m,
    name: t(`services.${m.key}n`),
    text: t(`services.${m.key}t`),
    category: t(`services.categories.${m.categoryKey}`),
    unit: UNIT_LABEL[lang][m.unitKey],
    tag: m.tagKey ? t(`services.${m.tagKey}`) : null,
  }));

  return (
    <section id="services" className="px-6 py-28 md:py-32 border-t border-line bg-cream">
      <div className="max-w-content mx-auto">
        <Reveal className="max-w-2xl mb-14">
          <p className="text-sm font-medium text-coffee mb-4">{t("services.eyebrow")}</p>
          <h2 className="font-display italic text-4xl sm:text-5xl leading-[1.08] text-ink mb-5">
            {t("services.heading")}
          </h2>
          <p className="text-stone leading-relaxed max-w-lg">{t("services.lead")}</p>
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:auto-rows-[minmax(230px,auto)]">
          {services.map((s, i) => (
            <Reveal key={s.slug} delay={i * 0.06} className={SPANS[i] || SPANS[1]}>
              <Link
                to={`/services/${s.slug}`}
                className="group relative block h-full rounded-3xl overflow-hidden bg-ink-fixed"
              >
                <TradeArt
                  name={s.categoryKey}
                  className="absolute inset-0 w-full h-full group-hover:scale-105 transition-transform duration-700 ease-out"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />

                <div className="absolute top-4 left-4 right-4 flex items-start justify-between">
                  <span className="font-mono text-xs text-cream-fixed/70">{String(i + 1).padStart(2, "0")}</span>
                  <span className="w-10 h-10 rounded-full bg-white/15 backdrop-blur flex items-center justify-center text-cream-fixed group-hover:bg-cream-fixed group-hover:text-ink-fixed transition-colors">
                    <ArrowUpRight size={17} />
                  </span>
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6 text-cream-fixed">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#E4B968]">
                      {s.category}
                    </span>
                    {s.tag && (
                      <span className="text-[0.58rem] font-semibold uppercase tracking-wider bg-[#E4B968] text-ink-fixed px-2 py-0.5 rounded-full">
                        {s.tag}
                      </span>
                    )}
                  </div>
                  <h3 className={`font-display italic leading-tight mb-1.5 ${i === 0 ? "text-3xl sm:text-4xl" : "text-xl sm:text-2xl"}`}>
                    {s.name}
                  </h3>
                  <p className={`text-cream-fixed/80 leading-snug ${i === 0 ? "text-sm sm:text-base max-w-md" : "text-sm line-clamp-2"}`}>
                    {s.text}
                  </p>
                  <p className="mt-3 text-sm">
                    <span className="text-cream-fixed/60 text-xs">{t("services.priceFrom")} </span>
                    <span className="font-display text-lg">{s.priceFrom} $</span>
                    <span className="text-xs text-cream-fixed/60">/{s.unit}</span>
                  </p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
