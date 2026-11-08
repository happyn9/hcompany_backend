import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Minus, MessageCircle, Users2, Sparkles, GraduationCap, Lock } from "lucide-react";
import NavBar from "../../components/layout/NavBar.jsx";
import Footer from "../../components/layout/Footer.jsx";
import FAQ from "../../components/sections/FAQ.jsx";
import BackLink from "../../components/ui/BackLink.jsx";
import { SectionHead, useLearningUi } from "../../components/learning/Shared.jsx";
import { CurrencySelect, PeriodToggle, useCurrencyChoice, useMoney } from "../../components/learning/Pricing.jsx";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";
import { usePlans } from "../../data/plans.js";
import { planTotal } from "../../lib/pricing.js";

function PlanCard({ plan, period, seats, setSeats, money, ui, index, onChoose }) {
  const unit = period === "year" ? plan.price_yearly : plan.price_monthly;
  const total = planTotal(plan, period, seats);
  const unitLabel = plan.per_seat
    ? period === "year" ? ui.perSeatYear : ui.perSeatMonth
    : period === "year" ? ui.perYear : ui.perMonth;
  const Icon = plan.audience === "team" ? Users2 : plan.audience === "pro" ? Sparkles : GraduationCap;
  const dark = plan.highlight;
  return (
    <motion.article
      id={plan.code}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: index * 0.08 }}
      className={`relative flex flex-col rounded-[2rem] p-7 sm:p-8 scroll-mt-28 ${
        dark ? "bg-[#2E1D12] text-cream-fixed shadow-[0_40px_80px_-40px_rgba(30,26,23,0.7)] lg:-my-3" : "bg-surface border border-line text-ink"
      }`}
    >
      {dark && (
        <span className="absolute -top-3 left-8 rounded-full bg-latte text-ink-fixed text-[0.7rem] font-semibold uppercase tracking-wider px-3 py-1">
          {ui.popular}
        </span>
      )}
      <span className={`w-11 h-11 rounded-2xl flex items-center justify-center mb-5 ${dark ? "bg-white/10 text-latte" : "bg-latte-soft text-coffee"}`}>
        <Icon size={20} />
      </span>
      <h3 className="font-display text-2xl mb-1">{plan.name}</h3>
      <p className={`text-sm leading-relaxed min-h-[2.75rem] ${dark ? "text-cream-fixed/70" : "text-ink-soft"}`}>{plan.tagline}</p>

      <div className="mt-6 mb-1 flex items-baseline gap-2 flex-wrap">
        <span className="font-display text-4xl sm:text-5xl tracking-tight">{money(unit)}</span>
        <span className={`text-sm ${dark ? "text-cream-fixed/60" : "text-ink-faint"}`}>{unitLabel}</span>
      </div>

      {plan.per_seat ? (
        <div className="mt-4">
          <label className={`block text-xs font-medium mb-1.5 ${dark ? "text-cream-fixed/70" : "text-ink-soft"}`} htmlFor={`seats-${plan.code}`}>
            {ui.seats} <span className="font-normal opacity-70">· {ui.seatsHint(plan.min_seats, plan.max_seats)}</span>
          </label>
          <div className="flex items-center gap-3">
            <input
              id={`seats-${plan.code}`}
              type="number"
              inputMode="numeric"
              min={plan.min_seats}
              max={plan.max_seats}
              value={seats}
              onChange={(e) => setSeats(e.target.value === "" ? "" : Number(e.target.value))}
              onBlur={() => setSeats(Math.min(plan.max_seats, Math.max(plan.min_seats, Number(seats) || plan.min_seats)))}
              className="w-24 rounded-xl border border-line bg-surface text-ink px-3 py-2.5 text-sm focus:outline-none focus:border-coffee"
            />
            <span className="text-sm">
              {ui.total} : <strong className="font-semibold">{money(total)}</strong>
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-4 h-[3.75rem]" aria-hidden="true" />
      )}

      <ul className="mt-6 space-y-3 text-sm flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-3">
            <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${dark ? "bg-latte/25 text-latte" : "bg-latte-soft text-coffee"}`}>
              <Check size={12} />
            </span>
            <span className={dark ? "text-cream-fixed/90" : "text-ink-soft"}>{f}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => onChoose(plan)}
        className={`mt-8 w-full inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium py-3.5 transition-all ${
          dark ? "bg-cream-fixed text-ink-fixed hover:scale-[1.02]" : "bg-ink text-cream hover:bg-coffee-dark"
        }`}
      >
        {plan.audience === "team" ? ui.teamChoose : ui.choose}
        <ArrowRight size={15} />
      </button>
    </motion.article>
  );
}

function CompareTable({ ui }) {
  return (
    <section className="px-6 pb-20 max-w-content mx-auto">
      <SectionHead eyebrow={ui.colPaid} title={ui.compareTitle} />
      <div className="rounded-3xl border border-line bg-surface overflow-hidden">
        <div className="grid grid-cols-[1fr_5.5rem_5.5rem] sm:grid-cols-[1fr_8rem_8rem] px-5 sm:px-7 py-4 text-xs font-semibold uppercase tracking-widest text-coffee border-b border-line">
          <span />
          <span className="text-center">{ui.colFree}</span>
          <span className="text-center">{ui.colPaid}</span>
        </div>
        {ui.compareRows.map((r) => (
          <div key={r.label} className="grid grid-cols-[1fr_5.5rem_5.5rem] sm:grid-cols-[1fr_8rem_8rem] items-center px-5 sm:px-7 py-4 text-sm border-b border-line last:border-0">
            <span className="text-ink">{r.label}</span>
            {[r.free, r.paid].map((v, i) => (
              <span key={i} className="flex justify-center">
                {v === true ? (
                  <span className="w-6 h-6 rounded-full bg-latte-soft text-coffee flex items-center justify-center"><Check size={13} /></span>
                ) : v ? (
                  <span className="text-xs font-medium text-coffee">{v}</span>
                ) : (
                  <Minus size={16} className="text-ink-faint" />
                )}
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PlansPage() {
  const ui = useLearningUi();
  const p = ui.plans;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { status, offline, plans, currencies, pivot } = usePlans();
  const { currency, choose } = useCurrencyChoice(currencies, pivot);
  const money = useMoney(currency);
  const [period, setPeriod] = useState(params.get("periode") === "month" ? "month" : "year");
  const team = plans.find((x) => x.per_seat);
  const [seats, setSeats] = useState(team?.min_seats || 5);
  usePageMeta({ title: p.eyebrow, description: p.lead });

  // Les bouquets arrivent après le premier rendu : on rejoue l'ancre (#equipe) une fois prêts.
  useEffect(() => {
    if (status !== "ready" || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [status]);

  const saving = useMemo(() => Math.max(0, ...plans.map((x) => x.yearly_saving_pct || 0)), [plans]);
  const effectiveSeats = (plan) => Math.min(plan.max_seats, Math.max(plan.min_seats, Number(seats) || plan.min_seats));

  const choosePlan = (plan) => {
    const q = new URLSearchParams({ periode: period, devise: currency?.code || pivot });
    if (plan.per_seat) q.set("places", String(effectiveSeats(plan)));
    navigate(`/formations/bouquets/${plan.code}/paiement?${q.toString()}`);
  };

  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <section className="pt-28 pb-12 px-6">
        <div className="max-w-content mx-auto">
          <BackLink to="/formations" className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink mb-8">
            <ArrowLeft size={15} />
            {p.back}
          </BackLink>
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-coffee uppercase tracking-widest mb-4">{p.eyebrow}</p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl text-ink leading-[1.05] mb-6">{p.title}</h1>
            <p className="text-ink-soft text-lg leading-relaxed">{p.lead}</p>
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <PeriodToggle value={period} onChange={setPeriod} labels={{ month: p.month, year: p.year, save: p.save }} saving={saving} />
            <CurrencySelect currencies={currencies} value={currency?.code} onChange={choose} label={p.currency} />
          </div>
          <p className="mt-3 text-xs text-ink-faint">{p.billedIn(pivot)}</p>
        </div>
      </section>

      <section className="px-6 pb-16 max-w-content mx-auto">
        {status === "loading" ? (
          <div className="grid lg:grid-cols-3 gap-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[30rem] rounded-[2rem] bg-surface border border-line animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6 lg:items-stretch">
            {plans.map((plan, i) => (
              <PlanCard
                key={plan.code}
                plan={plan}
                period={period}
                seats={plan.per_seat ? seats : 1}
                setSeats={setSeats}
                money={money}
                ui={p}
                index={i}
                onChoose={choosePlan}
              />
            ))}
          </div>
        )}
        {offline && <p className="text-xs text-ink-faint mt-6">{p.offline}</p>}
      </section>

      <section className="px-6 pb-20 max-w-content mx-auto">
        <div className="rounded-3xl border border-line bg-surface p-7 sm:p-9 grid md:grid-cols-[auto_1fr_auto] gap-6 items-center">
          <span className="w-12 h-12 rounded-2xl bg-latte-soft text-coffee flex items-center justify-center"><Lock size={20} /></span>
          <div>
            <h2 className="font-display text-xl text-ink mb-1">{p.payTitle}</h2>
            <p className="text-sm text-ink-soft leading-relaxed max-w-2xl">{p.payText}</p>
          </div>
          <div className="flex gap-2" aria-hidden="true">
            {[["Zamtel", "#1B8A3A"], ["MTN", "#E0A800"], ["Airtel", "#D4001A"]].map(([n, c]) => (
              <span key={n} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: c }} />
                {n}
              </span>
            ))}
          </div>
        </div>
      </section>

      <CompareTable ui={p} />

      <section className="px-6 pb-20">
        <div className="max-w-content mx-auto rounded-[2rem] bg-[#2E1D12] text-cream-fixed p-8 sm:p-12 flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-xl">
            <h2 className="font-display text-2xl sm:text-3xl mb-2">{p.bigTeamTitle}</h2>
            <p className="text-cream-fixed/70 text-sm leading-relaxed">{p.bigTeamText}</p>
          </div>
          <a
            href="https://wa.me/260770381780"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-cream-fixed text-ink-fixed text-sm font-medium px-6 py-3.5 hover:scale-[1.03] transition-transform"
          >
            <MessageCircle size={15} />
            {p.bigTeamCta}
          </a>
        </div>
      </section>

      <FAQ eyebrow={p.eyebrow} heading={p.faqTitle} items={p.faq.map((i) => ({ question: i.q, answer: i.a }))} />
      <Footer />
    </div>
  );
}
