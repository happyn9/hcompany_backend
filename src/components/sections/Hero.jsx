import { Link } from "react-router-dom";
import { motion } from "framer-motion";

const MotionLink = motion.create(Link);
import { useLanguage } from "../../context/LanguageContext.jsx";

function Mark({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <ellipse cx="10" cy="14" rx="6" ry="9" fill="none" stroke="var(--color-ink)" strokeWidth="1.3" />
      <ellipse cx="18" cy="14" rx="6" ry="9" fill="none" stroke="var(--color-ink)" strokeWidth="1.3" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true" className="ml-1.5 inline-block align-middle">
      <path d="M0.5 5H13M13 5L8.5 0.5M13 5L8.5 9.5" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <path
        d="M8 1.5L13.5 3.5V7.5C13.5 10.8 11.2 13.6 8 14.5C4.8 13.6 2.5 10.8 2.5 7.5V3.5L8 1.5Z"
        fill="none"
        stroke="var(--color-stone)"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Sparkline() {
  return (
    <svg viewBox="0 0 220 56" className="w-full h-14 mt-3" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M0 42 L28 38 L56 40 L84 24 L112 30 L140 14 L168 20 L196 6 L220 10"
        fill="none"
        stroke="var(--color-coffee)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M0 42 L28 38 L56 40 L84 24 L112 30 L140 14 L168 20 L196 6 L220 10 L220 56 L0 56 Z"
        fill="var(--color-coffee)"
        opacity="0.08"
      />
    </svg>
  );
}

function NetworkPanel() {
  const { t } = useLanguage();
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 w-full max-w-[300px] shadow-[0_18px_40px_-24px_rgba(23,20,15,0.25)]">
      <div className="flex items-center gap-2 mb-5">
        <span className="relative flex w-1.5 h-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-coffee opacity-60" />
          <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-coffee" />
        </span>
        <span className="text-xs font-medium text-stone tracking-tight">{t("hero.networkLabel")}</span>
      </div>

      <div className="flex items-baseline justify-between">
        <div>
          <p className="font-display text-3xl text-ink">12</p>
          <p className="text-xs text-stone mt-0.5">{t("hero.partnersActive")}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl text-ink">1 240</p>
          <p className="text-xs text-stone mt-0.5">{t("hero.tasksAutomated")} <span className="text-coffee-dark">+86</span></p>
        </div>
      </div>

      <div className="mt-5 pt-5 border-t border-line">
        <p className="text-xs text-stone mb-2">{t("hero.lastResult")}</p>
        <div className="flex items-start gap-2">
          <ShieldIcon />
          <p className="text-sm text-ink leading-snug">
            <span className="underline underline-offset-2 decoration-line">{t("hero.auditLabel")}</span> : Lukondo Transport
          </p>
        </div>
      </div>
    </div>
  );
}

function PerformancePanel() {
  const { t } = useLanguage();
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 w-full max-w-[300px] shadow-[0_18px_40px_-24px_rgba(23,20,15,0.25)]">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-md bg-coffee/10 flex items-center justify-center">
          <div className="w-2.5 h-2.5 rounded-sm bg-coffee" />
        </div>
        <p className="text-sm font-medium text-ink">{t("hero.performanceTitle")}</p>
      </div>
      <p className="text-xs text-stone leading-relaxed">
        {t("hero.performanceText")}
      </p>
      <Sparkline />
    </div>
  );
}

const LOGOS = ["H-learning", "Lukondo", "Confismila"];

export default function Hero() {
  const { t } = useLanguage();
  return (
    <div className="bg-cream relative overflow-hidden">
      {/* Halo décoratif discret, purement esthétique */}
      <div
        aria-hidden="true"
        className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(111,74,52,0.06) 0%, transparent 65%)" }}
      />

      <section className="relative px-6 pt-32 pb-16 lg:pt-40 lg:pb-20">
        <div className="max-w-content mx-auto grid lg:grid-cols-[1fr_1.3fr_1fr] gap-10 items-center">
          <motion.div
            className="hidden lg:flex justify-center"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <NetworkPanel />
          </motion.div>

          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-4 py-1.5 mb-6"
            >
              <Mark size={16} />
              <span className="text-xs font-medium text-ink-soft">{t("hero.badge")}</span>
            </motion.div>

            <h1
              className="font-display text-ink"
              style={{
                fontSize: "clamp(2.4rem, 1.7rem + 2.8vw, 3.8rem)",
                lineHeight: 1.12,
                letterSpacing: "-0.015em",
                fontWeight: 500,
                fontOpticalSizing: "auto",
              }}
            >
              {t("hero.titleStart")}{" "}
              <span className="italic text-coffee">{t("hero.titleEm")}</span>
            </h1>
            <p className="mt-6 max-w-md mx-auto text-lg text-stone leading-relaxed">
              {t("hero.lead")}
            </p>
            <div className="mt-8 flex flex-col items-center gap-4">
              <MotionLink
                to="/infos#rejoindre"
                className="bg-coffee text-cream rounded-full px-7 py-3.5 font-medium hover:bg-coffee-dark transition-colors shadow-[0_16px_32px_-14px_rgba(74,48,32,0.6)]"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.98 }}
              >
                {t("hero.cta")}
              </MotionLink>
              <Link to="/infos#about" className="text-sm font-medium text-ink underline underline-offset-4 decoration-line hover:decoration-coffee hover:text-coffee transition-colors">
                {t("hero.more")}<ArrowRight />
              </Link>
            </div>
          </motion.div>

          <motion.div
            className="hidden lg:flex justify-center"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <PerformancePanel />
          </motion.div>
        </div>

        <div className="mt-10 flex lg:hidden flex-col items-center gap-6">
          <NetworkPanel />
          <PerformancePanel />
        </div>

        {/* Bandeau de confiance : les entreprises actives du réseau */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="max-w-content mx-auto mt-16 lg:mt-20 flex flex-col items-center gap-4"
        >
          <p className="text-xs uppercase tracking-widest text-ink-faint">{t("hero.alreadyIn")}</p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
            {LOGOS.map((name) => (
              <span key={name} className="font-display text-lg text-ink-soft">
                {name}
              </span>
            ))}
          </div>
        </motion.div>
      </section>
    </div>
  );
}
