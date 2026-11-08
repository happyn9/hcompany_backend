import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { TradeArt } from "../art/ServiceArt.jsx";
import { SERVICES_META } from "../../data/services.js";
import Reveal from "../ui/Reveal.jsx";
import StepVideo from "./StepVideo.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";

function IconSearch() {
  return (
    <svg width="22" height="22" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M20 20L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconLink() {
  return (
    <svg width="22" height="22" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path d="M11 15L15 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13.5 8.5L15.5 6.5C17.2 4.8 19.9 4.8 21.5 6.5C23.2 8.2 23.2 10.8 21.5 12.5L19.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12.5 17.5L10.5 19.5C8.8 21.2 6.1 21.2 4.5 19.5C2.8 17.8 2.8 15.1 4.5 13.5L6.5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconHandshake() {
  return (
    <svg width="22" height="22" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path d="M3 12L8 7L12 10L14 8L18 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 12L8 18L11 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 11L23 14L18 19L14 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconCheckBadge() {
  return (
    <svg width="22" height="22" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path d="M13 3L21 6V12.5C21 17.5 17.7 21.3 13 23C8.3 21.3 5 17.5 5 12.5V6L13 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9.5 13L12 15.5L17 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STEP_ICONS = [IconSearch, IconLink, IconHandshake, IconCheckBadge];
const STEP_KEYS = ["step1", "step2", "step3", "step4"];

export default function Marketplace() {
  const { t } = useLanguage();
  const STEPS = STEP_KEYS.map((key, i) => ({
    Icon: STEP_ICONS[i],
    title: t(`marketplace.${key}Title`),
    text: t(`marketplace.${key}Text`),
  }));
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => setActive((a) => (a + 1) % STEPS.length), 3200);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, t]);

  return (
    <section id="marketplace" className="px-6 py-28 md:py-32 border-t border-line bg-cream/40">
      <div className="max-w-content mx-auto">
        <Reveal className="text-center max-w-xl mx-auto mb-16">
          <p className="text-sm font-medium text-coffee mb-4">{t("marketplace.eyebrow")}</p>
          <h2 className="font-display italic text-3xl sm:text-4xl leading-tight text-ink mb-4">
            {t("marketplace.heading")}
          </h2>
          <p className="text-stone leading-relaxed">
            {t("marketplace.lead")}
          </p>
        </Reveal>

        <div
          className="grid md:grid-cols-[1fr_1.3fr] gap-10 md:gap-16 items-center"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* Colonne de gauche : liste des étapes cliquables */}
          <div className="space-y-2">
            {STEPS.map((step, i) => {
              const isActive = i === active;
              return (
                <button
                  key={step.title}
                  onClick={() => setActive(i)}
                  className={`w-full text-left flex items-start gap-4 rounded-2xl p-4 transition-colors ${
                    isActive ? "bg-surface shadow-[0_20px_45px_-25px_rgba(30,26,23,0.25)]" : "hover:bg-white/60"
                  }`}
                >
                  <span
                    className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold font-mono transition-colors ${
                      isActive ? "bg-coffee text-cream" : "bg-surface border border-line text-ink-soft"
                    }`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className={`font-display text-lg mb-1 ${isActive ? "text-ink" : "text-ink-soft"}`}>
                      {step.title}
                    </h3>
                    {isActive && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        transition={{ duration: 0.3 }}
                        className="text-sm text-stone leading-relaxed overflow-hidden"
                      >
                        {step.text}
                      </motion.p>
                    )}
                  </div>
                </button>
              );
            })}
            {/* barre de progression du cycle automatique */}
            <div className="flex gap-1.5 px-4 pt-2">
              {STEPS.map((_, i) => (
                <div key={i} className="h-1 flex-1 rounded-full bg-line/60 overflow-hidden">
                  {i === active && !paused && (
                    <motion.div
                      key={active}
                      className="h-full bg-coffee"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 3.2, ease: "linear" }}
                      style={{ transformOrigin: "0% 50%" }}
                    />
                  )}
                  {i < active && <div className="h-full bg-coffee" />}
                </div>
              ))}
            </div>
          </div>

          {/* Colonne de droite : "vidéo" de 15s illustrant l'étape active */}
          <div className="relative aspect-[4/3] rounded-3xl bg-ink-fixed overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0"
              >
                <StepVideo step={active} />
                <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
                  <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-coffee-light">
                    {(() => {
                      const Icon = STEPS[active].Icon;
                      return <Icon />;
                    })()}
                  </div>
                  <span className="text-[0.65rem] font-medium text-white bg-black/70 rounded-full px-2.5 py-1">
                    {String(active + 1).padStart(2, "0")}/04
                  </span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Les cinq métiers en images : chaque tuile ouvre la page du métier */}
        <Reveal className="mt-20">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
            {SERVICES_META.map((m, i) => (
              <Link
                key={m.slug}
                to={`/services/${m.slug}`}
                className={`group relative block rounded-2xl overflow-hidden bg-ink-fixed aspect-[4/5] ${i === 4 ? "col-span-2 md:col-span-1 aspect-[16/9] md:aspect-[4/5]" : ""}`}
              >
                <TradeArt
                  name={m.categoryKey}
                  className="absolute inset-0 w-full h-full group-hover:scale-105 transition-transform duration-700 ease-out"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3.5 text-cream-fixed">
                  <p className="font-mono text-[0.65rem] text-[#E4B968] mb-0.5">{String(i + 1).padStart(2, "0")}</p>
                  <p className="font-display italic text-base leading-tight">{t(`services.${m.key}n`)}</p>
                </div>
              </Link>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
