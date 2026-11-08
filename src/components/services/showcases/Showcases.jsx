import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ArrowLeftRight, Bus, Package, Check, PackageCheck, Truck, Warehouse } from "lucide-react";
import Reveal from "../../ui/Reveal.jsx";
import { TradeArt } from "../../art/ServiceArt.jsx";
import { iconFor } from "../../../data/serviceIcons.js";
import { useCourses } from "../../../data/courses.js";
import { SERVICE_UI } from "../../../i18n/servicePageUi.js";
import { useLanguage } from "../../../context/LanguageContext.jsx";

function Header({ eyebrow, title, lead }) {
  return (
    <Reveal className="max-w-2xl mb-10">
      {eyebrow && <p className="text-sm font-medium text-coffee mb-3">{eyebrow}</p>}
      <h2 className="font-display italic text-3xl sm:text-4xl leading-tight text-ink mb-4">{title}</h2>
      {lead && <p className="text-stone leading-relaxed">{lead}</p>}
    </Reveal>
  );
}

function Frame({ id, children }) {
  return (
    <section id={id} className="px-6 py-20 md:py-24 bg-surface border-t border-line scroll-mt-16">
      <div className="max-w-content mx-auto">{children}</div>
    </section>
  );
}

/* ───────────────────────── Itinéraires (H-Transport Bus) ───────────────────────── */

export function RoutesShowcase({ page, theme }) {
  return (
    <Frame id="apercu">
      <Header title={page.showcaseTitle} lead={page.showcaseLead} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(page.routes || []).map((r, i) => (
          <Reveal key={`${r.from}-${r.to}`} delay={i * 0.05}>
            <div className="group relative rounded-2xl border border-line bg-cream/60 p-5 hover:border-coffee-light hover:-translate-y-0.5 transition-all overflow-hidden">
              <span
                className="inline-block text-[0.65rem] font-semibold uppercase tracking-wider rounded-full px-2.5 py-1 mb-5"
                style={{ background: `${theme.accent}33`, color: "var(--color-coffee-dark)" }}
              >
                {r.tag}
              </span>
              <div className="flex items-center gap-3">
                <p className="font-display text-xl text-ink leading-tight flex-1 min-w-0 truncate">{r.from}</p>
                <div className="relative flex-1 h-6 min-w-[60px]" aria-hidden="true">
                  <div className="absolute top-1/2 left-0 right-0 border-t-2 border-dashed border-coffee-light/60" />
                  <motion.span
                    className="absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-coffee text-on-coffee flex items-center justify-center"
                    initial={{ left: "0%" }}
                    whileInView={{ left: "calc(100% - 24px)" }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.2, delay: 0.2 + i * 0.08, ease: "easeInOut" }}
                  >
                    <Bus size={12} />
                  </motion.span>
                </div>
                <p className="font-display text-xl text-ink leading-tight flex-1 min-w-0 truncate text-right">{r.to}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </Frame>
  );
}

/* ───────────────────────── Suivi de colis (H-Transport Colis) ───────────────────────── */

const STAGE_ICONS = [Package, Truck, Warehouse, PackageCheck];

export function TrackingShowcase({ page, theme }) {
  const { lang } = useLanguage();
  const ui = SERVICE_UI[lang] || SERVICE_UI.fr;
  const stages = page.stages || [];
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || stages.length === 0) return undefined;
    const timer = setInterval(() => setActive((a) => (a + 1) % stages.length), 2800);
    return () => clearInterval(timer);
  }, [paused, stages.length]);

  const current = stages[active] || stages[0];
  const Icon = STAGE_ICONS[active] || Package;
  const pct = stages.length > 1 ? (active / (stages.length - 1)) * 100 : 0;

  return (
    <Frame id="apercu">
      <Header title={page.showcaseTitle} lead={page.showcaseLead} />
      <div
        className="grid lg:grid-cols-[1fr_1.05fr] gap-8 lg:gap-14 items-center"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <ol className="space-y-2">
          {stages.map((s, i) => {
            const on = i === active;
            const done = i < active;
            return (
              <li key={s.title}>
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  className={`w-full text-left flex gap-4 rounded-2xl p-4 transition-colors ${on ? "bg-cream shadow-[0_18px_40px_-26px_rgba(30,26,23,0.35)]" : "hover:bg-cream/60"}`}
                >
                  <span
                    className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold font-mono transition-colors ${
                      on || done ? "bg-coffee text-on-coffee" : "bg-surface border border-line text-ink-soft"
                    }`}
                  >
                    {done ? <Check size={15} /> : i + 1}
                  </span>
                  <span>
                    <span className={`block font-display text-lg ${on ? "text-ink" : "text-ink-soft"}`}>{s.title}</span>
                    {on && <span className="block text-sm text-stone leading-relaxed mt-1">{s.text}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {/* Carte de suivi (exemple) */}
        <div className="relative rounded-[28px] overflow-hidden p-6 sm:p-8 text-cream-fixed" style={{ background: `linear-gradient(150deg, ${theme.from}, ${theme.to})` }}>
          <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full blur-3xl opacity-40" style={{ background: theme.accent }} aria-hidden="true" />
          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-cream-fixed/70">{ui.trackingExample}</span>
              <span className="font-mono text-xs bg-white/10 rounded-full px-3 py-1">HC-4821</span>
            </div>
            <div className="flex items-center gap-3 mb-8">
              <span className="w-12 h-12 rounded-2xl bg-white/12 flex items-center justify-center" style={{ color: theme.accent }}>
                <Icon size={22} />
              </span>
              <div>
                <p className="text-xs text-cream-fixed/60">{ui.trackingParcel}</p>
                <motion.p key={current?.title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="font-display italic text-2xl leading-tight">
                  {current?.title}
                </motion.p>
              </div>
            </div>
            <div className="flex justify-between text-xs text-cream-fixed/70 mb-2">
              <span>{ui.trackingFrom}</span>
              <span>{ui.trackingTo}</span>
            </div>
            <div className="relative h-2 rounded-full bg-white/15">
              <motion.div className="absolute left-0 top-0 h-full rounded-full" style={{ background: theme.accent }} animate={{ width: `${Math.max(pct, 6)}%` }} transition={{ duration: 0.6, ease: "easeInOut" }} />
              <motion.span className="absolute top-1/2 w-4 h-4 -translate-y-1/2 -ml-2 rounded-full ring-4 ring-white/20" style={{ background: theme.accent }} animate={{ left: `${Math.max(pct, 6)}%` }} transition={{ duration: 0.6, ease: "easeInOut" }} />
            </div>
            <div className="flex justify-between mt-6">
              {stages.map((s, i) => (
                <span key={s.title} className={`text-[0.65rem] transition-opacity ${i <= active ? "opacity-100" : "opacity-40"}`}>
                  {s.title}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ───────────────────────── Cartes (Logement, Restaurant) ───────────────────────── */

export function CardsShowcase({ page, theme, items }) {
  return (
    <Frame id="apercu">
      <Header title={page.showcaseTitle} lead={page.showcaseLead} />
      <div className={`grid gap-5 sm:grid-cols-2 ${items.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {items.map((it, i) => {
          const Icon = iconFor(it.icon);
          return (
            <Reveal key={it.title} delay={i * 0.07}>
              <article className="group h-full rounded-3xl border border-line bg-cream/60 overflow-hidden hover:-translate-y-1 hover:border-coffee-light transition-all duration-300">
                <div className="relative h-28 flex items-center justify-center overflow-hidden" style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}>
                  <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle, #fff 1.2px, transparent 1.4px)", backgroundSize: "20px 20px" }} aria-hidden="true" />
                  <span className="relative w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center group-hover:scale-110 transition-transform" style={{ color: theme.accent }}>
                    <Icon size={26} />
                  </span>
                </div>
                <div className="p-5">
                  {it.tag && (
                    <span className="inline-block text-[0.62rem] font-semibold uppercase tracking-wider rounded-full px-2.5 py-1 mb-3" style={{ background: `${theme.accent}33`, color: "var(--color-coffee-dark)" }}>
                      {it.tag}
                    </span>
                  )}
                  <h3 className="font-display text-lg text-ink mb-1.5">{it.title}</h3>
                  <p className="text-sm text-stone leading-relaxed">{it.text}</p>
                </div>
              </article>
            </Reveal>
          );
        })}
      </div>
    </Frame>
  );
}

/* ───────────────────────── Formations (H-Learning) ───────────────────────── */

function tradeFor(title) {
  const t = (title || "").toLowerCase();
  if (/cyber|sécurit|securit/.test(t)) return "security";
  if (/mobile|flutter|dév|dev|web|code/.test(t)) return "dev";
  if (/design|interface|ui|ux/.test(t)) return "design";
  if (/gestion|projet|it|infra/.test(t)) return "infra";
  return "support";
}

export function CoursesShowcase({ page }) {
  const { lang } = useLanguage();
  const ui = SERVICE_UI[lang] || SERVICE_UI.fr;
  const { status, courses } = useCourses();
  return (
    <Frame id="apercu">
      <Header title={page.showcaseTitle} lead={page.showcaseLead} />
      {status === "loading" ? (
        <p className="text-sm text-ink-soft">{ui.coursesLoading}</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {courses.slice(0, 6).map((c, i) => (
            <Reveal key={c.id} delay={i * 0.05}>
              <Link to={`/formations/${c.id}`} className="group block h-full rounded-3xl border border-line bg-cream/60 overflow-hidden hover:-translate-y-1 hover:border-coffee-light transition-all duration-300">
                <div className="relative h-40 overflow-hidden">
                  <TradeArt name={tradeFor(c.title)} className="absolute inset-0 w-full h-full group-hover:scale-105 transition-transform duration-700" />
                  {c.level && (
                    <span className="absolute top-3 left-3 text-[0.62rem] font-semibold uppercase tracking-wider rounded-full px-2.5 py-1 bg-white/85 text-[#4A3226] backdrop-blur">
                      {c.level}
                    </span>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="font-display text-lg text-ink mb-1.5 group-hover:text-coffee-dark transition-colors">{c.title}</h3>
                  <p className="text-sm text-stone leading-relaxed line-clamp-3">{c.text || c.description}</p>
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-coffee-dark mt-4">
                    {page.cta}
                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      )}
    </Frame>
  );
}

/* ───────────────────────── Corridor RDC ⇄ Zambie (H-Money) ───────────────────────── */

export function CorridorShowcase({ page, theme }) {
  const { lang } = useLanguage();
  const ui = SERVICE_UI[lang] || SERVICE_UI.fr;
  return (
    <Frame id="apercu">
      <Header title={page.showcaseTitle} lead={page.showcaseLead} />
      <Reveal>
        <div className="relative rounded-[28px] overflow-hidden px-6 py-12 sm:px-12 sm:py-16 text-cream-fixed" style={{ background: `linear-gradient(150deg, ${theme.from}, ${theme.to})` }}>
          <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "radial-gradient(circle, #fff 1.2px, transparent 1.4px)", backgroundSize: "24px 24px" }} aria-hidden="true" />
          <div className="relative flex items-center justify-between gap-4 sm:gap-10 max-w-2xl mx-auto">
            {[ui.corridorFrom, ui.corridorTo].map((label, i) => (
              <div key={label} className={`text-center ${i === 1 ? "order-3" : ""}`}>
                <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-white/12 ring-1 ring-white/25 flex items-center justify-center mx-auto mb-3">
                  <span className="font-display italic text-2xl sm:text-3xl">{label}</span>
                </div>
              </div>
            ))}
            <div className="order-2 flex-1 relative h-10" aria-hidden="true">
              <div className="absolute top-1/2 left-0 right-0 border-t-2 border-dashed" style={{ borderColor: `${theme.accent}99` }} />
              <motion.span
                className="absolute top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-ink-fixed"
                style={{ background: theme.accent }}
                animate={{ left: ["0%", "calc(100% - 36px)", "0%"] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              >
                <ArrowLeftRight size={16} />
              </motion.span>
            </div>
          </div>
          <p className="relative text-center mt-10 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: theme.accent }}>
            {ui.corridorSoon}
          </p>
        </div>
      </Reveal>
    </Frame>
  );
}

/* ───────────────────────── Langues (H-Translate) ───────────────────────── */

export function LanguagesShowcase({ page, theme }) {
  const { lang } = useLanguage();
  const ui = SERVICE_UI[lang] || SERVICE_UI.fr;
  const languages = page.languages || [];
  const [active, setActive] = useState(0);
  const current = languages[active];
  return (
    <Frame id="apercu">
      <Header title={page.showcaseTitle} lead={page.showcaseLead} />
      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-8 lg:gap-14 items-center">
        <div className="grid grid-cols-2 gap-3">
          {languages.map((l, i) => (
            <button
              key={l.name}
              type="button"
              onClick={() => setActive(i)}
              aria-pressed={i === active}
              className={`text-left rounded-2xl border p-5 transition-all ${i === active ? "border-transparent text-cream-fixed shadow-xl -translate-y-0.5" : "border-line bg-cream/60 text-ink hover:border-coffee-light"}`}
              style={i === active ? { background: `linear-gradient(150deg, ${theme.from}, ${theme.to})` } : undefined}
            >
              <span className="font-display italic text-xl">{l.name}</span>
            </button>
          ))}
        </div>
        {current && (
          <motion.div key={current.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-[28px] border border-line bg-cream/60 p-7 sm:p-9">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-coffee mb-4">
              {ui.langSample} · {current.name}
            </p>
            <p className="font-display italic text-2xl sm:text-3xl text-ink leading-snug">« {current.sample} »</p>
          </motion.div>
        )}
      </div>
    </Frame>
  );
}
