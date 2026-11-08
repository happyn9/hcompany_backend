import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Check, Users2, PlayCircle, LineChart, GraduationCap } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { LEARNING_UI } from "../../i18n/learningUi.js";
import { usePlans } from "../../data/plans.js";
import { CurrencySelect, useCurrencyChoice, useMoney } from "./Pricing.jsx";

export function useLearningUi() {
  const { lang } = useLanguage();
  return LEARNING_UI[lang] || LEARNING_UI.fr;
}

export function SectionHead({ eyebrow, title, lead, center = false }) {
  return (
    <div className={`mb-10 ${center ? "text-center mx-auto" : ""} max-w-2xl`}>
      <p className="text-sm font-medium text-coffee uppercase tracking-widest mb-3">{eyebrow}</p>
      <h2 className="font-display text-3xl sm:text-4xl text-ink leading-tight">{title}</h2>
      {lead && <p className="text-ink-soft leading-relaxed mt-4">{lead}</p>}
    </div>
  );
}

const STEP_ICONS = [PlayCircle, LineChart, GraduationCap];

export function HowItWorks() {
  const ui = useLearningUi().how;
  return (
    <section className="px-6 py-20 max-w-content mx-auto">
      <SectionHead eyebrow={ui.eyebrow} title={ui.title} />
      <div className="grid md:grid-cols-3 gap-5">
        {ui.steps.map((s, i) => {
          const Icon = STEP_ICONS[i];
          return (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: i * 0.1 }}
              className="relative rounded-3xl border border-line bg-surface p-7"
            >
              <span className="absolute right-6 top-5 font-display text-5xl text-latte-light select-none">{i + 1}</span>
              <span className="w-11 h-11 rounded-2xl bg-latte-soft text-coffee flex items-center justify-center mb-5">
                <Icon size={20} />
              </span>
              <h3 className="font-display text-xl text-ink mb-2">{s.title}</h3>
              <p className="text-sm text-ink-soft leading-relaxed">{s.text}</p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

export function InPersonBand({ courseId, className = "" }) {
  const ui = useLearningUi().inPerson;
  const to = courseId ? `/formations/inscription?cours=${courseId}` : "/formations/inscription";
  return (
    <section className={`px-6 py-6 ${className}`}>
      <div className="max-w-content mx-auto relative overflow-hidden rounded-[2rem] bg-[#2E1D12] text-cream-fixed p-8 sm:p-12 grid lg:grid-cols-[1.3fr_1fr] gap-10">
        <svg className="absolute -right-24 -top-24 w-[420px] h-[420px] opacity-40" viewBox="0 0 400 400" aria-hidden="true">
          <circle cx="200" cy="200" r="190" fill="none" stroke="#C49A6C" strokeOpacity="0.35" />
          <circle cx="200" cy="200" r="140" fill="none" stroke="#C49A6C" strokeOpacity="0.25" strokeDasharray="4 8" />
          <circle cx="200" cy="200" r="90" fill="none" stroke="#C49A6C" strokeOpacity="0.2" />
        </svg>
        <div className="relative">
          <p className="text-sm font-medium text-latte uppercase tracking-widest mb-3">{ui.eyebrow}</p>
          <h2 className="font-display text-3xl sm:text-4xl leading-tight mb-4">{ui.title}</h2>
          <p className="text-cream-fixed/75 leading-relaxed max-w-xl mb-8">{ui.text}</p>
          <div className="flex flex-wrap gap-3">
            <Link to={to} className="inline-flex items-center gap-2 rounded-full bg-cream-fixed text-ink-fixed text-sm font-medium px-6 py-3.5 hover:scale-[1.03] transition-transform">
              {ui.cta}
              <ArrowRight size={15} />
            </Link>
            <Link to="/formations/bouquets" className="inline-flex items-center gap-2 rounded-full border border-cream-fixed/30 text-cream-fixed text-sm font-medium px-6 py-3.5 hover:bg-white/10 transition-colors">
              {ui.plans}
            </Link>
            <Link to="/formations/bouquets?plan=equipe#equipe" className="inline-flex items-center gap-2 rounded-full border border-cream-fixed/30 text-cream-fixed text-sm font-medium px-6 py-3.5 hover:bg-white/10 transition-colors">
              <Users2 size={15} />
              {ui.team}
            </Link>
          </div>
        </div>
        <ul className="relative grid content-center gap-3">
          {ui.points.map((p) => (
            <li key={p} className="flex items-center gap-3 text-sm text-cream-fixed/90">
              <span className="w-6 h-6 rounded-full bg-latte/25 text-latte flex items-center justify-center shrink-0">
                <Check size={13} />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Aperçu des bouquets (prix de départ) — sur le hub H-Learning. */
export function PlansTeaser() {
  const ui = useLearningUi();
  const { status, plans, currencies, pivot } = usePlans();
  const { currency, choose } = useCurrencyChoice(currencies, pivot);
  const money = useMoney(currency);
  if (status !== "ready" || plans.length === 0) return null;
  return (
    <section className="px-6 pb-20 max-w-content mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <SectionHead eyebrow={ui.hero.plansEyebrow} title={ui.plans.title} lead={ui.plans.lead} />
        <CurrencySelect currencies={currencies} value={currency?.code} onChange={choose} label={ui.plans.currency} />
      </div>
      <div className="grid md:grid-cols-3 gap-5">
        {plans.map((p, i) => (
          <motion.div
            key={p.code}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45, delay: i * 0.08 }}
          >
            <Link
              to={p.per_seat ? "/formations/bouquets?plan=equipe#equipe" : `/formations/bouquets#${p.code}`}
              className={`group block h-full rounded-3xl p-7 transition-all hover:-translate-y-1 ${
                p.highlight ? "bg-[#2E1D12] text-cream-fixed" : "bg-surface border border-line text-ink hover:border-coffee-light"
              }`}
            >
              <p className="font-display text-xl mb-1">{p.name}</p>
              <p className={`text-sm leading-relaxed mb-5 ${p.highlight ? "text-cream-fixed/70" : "text-ink-soft"}`}>{p.tagline}</p>
              <p className="font-display text-2xl">{ui.hero.plansFrom(money(p.price_monthly))}</p>
              <p className={`text-xs mt-1 ${p.highlight ? "text-cream-fixed/60" : "text-ink-faint"}`}>
                {p.per_seat ? ui.plans.perSeatMonth : ui.plans.perMonth}
              </p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium group-hover:gap-2 transition-all">
                {ui.plans.choose}
                <ArrowRight size={14} />
              </span>
            </Link>
          </motion.div>
        ))}
      </div>
      <div className="mt-6">
        <Link to="/formations/bouquets" className="inline-flex items-center gap-2 text-sm font-medium text-coffee hover:underline">
          {ui.hero.plansAll}
          <ArrowRight size={14} />
        </Link>
      </div>
    </section>
  );
}
