import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, CheckCircle2, Loader2, Lock, ShieldCheck, Smartphone } from "lucide-react";
import NavBar from "../../components/layout/NavBar.jsx";
import Footer from "../../components/layout/Footer.jsx";
import { useLearningUi } from "../../components/learning/Shared.jsx";
import { CurrencySelect, PeriodToggle, useCurrencyChoice, useMoney } from "../../components/learning/Pricing.jsx";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";
import { usePlans } from "../../data/plans.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { OPERATORS, buildPhone, formatDate, formatMoney, operatorByKey, phoneIsComplete, planTotal } from "../../lib/pricing.js";

const input =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-coffee focus:ring-2 focus:ring-coffee/15 transition";

function Row({ label, sub, value, strong }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className={strong ? "text-ink font-medium" : "text-ink-soft text-sm"}>{label}</p>
        {sub && <p className="text-xs text-ink-faint mt-0.5">{sub}</p>}
      </div>
      <p className={strong ? "font-display text-2xl sm:text-3xl text-ink whitespace-nowrap" : "text-ink text-sm"}>{value}</p>
    </div>
  );
}

function SuccessView({ sub, ui, lang }) {
  const c = ui.checkout;
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="text-center">
      <motion.span
        initial={{ scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
        className="mx-auto w-16 h-16 rounded-full bg-latte-soft text-coffee flex items-center justify-center mb-6"
      >
        <CheckCircle2 size={32} />
      </motion.span>
      <h1 className="font-display text-3xl sm:text-4xl text-ink mb-3">{c.successTitle}</h1>
      <p className="text-ink-soft leading-relaxed max-w-md mx-auto">{c.successText(sub.plan_name, formatDate(sub.ends_at, lang))}</p>
      <p className="mt-4 text-xs text-ink-faint">{c.reference} · <span className="font-mono">{sub.reference}</span></p>

      <div className="mt-8 text-left rounded-3xl border border-line bg-surface p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-coffee mb-4">{c.next}</p>
        <ul className="space-y-3">
          {c.nextItems.map((t) => (
            <li key={t} className="flex gap-3 text-sm text-ink-soft">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-latte-soft text-coffee flex items-center justify-center shrink-0"><Check size={12} /></span>
              {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/formations#catalogue" className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5 hover:bg-coffee-dark transition-colors">{c.toCourses}</Link>
        <Link to="/formations/mon-bouquet" className="rounded-full border border-line text-ink text-sm font-medium px-6 py-3.5 hover:border-coffee-light transition-colors">{c.toAccount}</Link>
      </div>
    </motion.div>
  );
}

export default function Checkout() {
  const ui = useLearningUi();
  const c = ui.checkout;
  const { lang } = useLanguage();
  const { code } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, withAuth } = useUser();
  const { status, plans, currencies, pivot, testMode } = usePlans();
  const plan = plans.find((p) => p.code === code);
  const { currency, choose } = useCurrencyChoice(currencies, params.get("devise") || pivot);
  const money = useMoney(currency);
  // Le paiement est toujours facturé dans la monnaie pivot ; l'autre devise n'est qu'un repère.
  const pivotCur = currencies.find((x) => x.code === pivot);
  const pm = (n) => formatMoney(n, pivotCur || { code: pivot }, lang);
  usePageMeta({ title: plan ? c.title(plan.name) : ui.plans.eyebrow, description: ui.plans.lead });

  const [period, setPeriod] = useState(params.get("periode") === "month" ? "month" : "year");
  const [seats, setSeats] = useState(Number(params.get("places")) || 0);
  const [org, setOrg] = useState("");
  const [operator, setOperator] = useState(OPERATORS[0].key);
  const [prefix, setPrefix] = useState(OPERATORS[0].prefixes[0]);
  const [digits, setDigits] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | paying | done
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const op = operatorByKey(operator);
  useEffect(() => {
    if (plan?.per_seat && !seats) setSeats(plan.min_seats);
  }, [plan, seats]);

  const seatCount = plan?.per_seat ? Math.min(plan.max_seats, Math.max(plan.min_seats, Number(seats) || plan.min_seats)) : 1;
  const total = plan ? planTotal(plan, period, seatCount) : 0;
  const unit = plan ? (period === "year" ? plan.price_yearly : plan.price_monthly) : 0;
  const validUntil = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + (period === "year" ? 365 : 30));
    return d.toISOString();
  }, [period]);

  const pickOperator = (key) => {
    const next = operatorByKey(key);
    setOperator(key);
    setPrefix(next.prefixes[0]);
  };

  const canPay = plan && phoneIsComplete(digits) && (plan.audience !== "team" || org.trim()) && phase === "idle";

  async function pay(e) {
    e.preventDefault();
    if (!canPay) return;
    setError("");
    setPhase("paying");
    const started = Date.now();
    try {
      const sub = await withAuth((token) =>
        api.learning.checkout(token, {
          plan_code: plan.code,
          period,
          seats: seatCount,
          org_name: org.trim() || null,
          method: operator,
          phone: buildPhone(prefix, digits),
          currency: currency?.code || pivot,
        })
      );
      // Laisse lire « confirmez sur votre téléphone » même si la réponse est instantanée.
      const wait = Math.max(0, 1400 - (Date.now() - started));
      await new Promise((r) => setTimeout(r, wait));
      setResult(sub);
      setPhase("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err?.data?.detail || c.error);
      setPhase("idle");
    }
  }

  const wrap = (children) => (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <main className="pt-28 pb-20 px-6">
        <div className="max-w-xl mx-auto">{children}</div>
      </main>
      <Footer />
    </div>
  );

  if (status === "loading" || isLoading) return wrap(<div className="h-96 rounded-3xl bg-surface border border-line animate-pulse" />);

  if (!plan) {
    return wrap(
      <div className="text-center">
        <p className="text-ink font-medium mb-4">{c.notFound}</p>
        <Link to="/formations/bouquets" className="text-sm text-coffee underline underline-offset-4">{c.seePlans}</Link>
      </div>
    );
  }

  if (phase === "done" && result) return wrap(<SuccessView sub={result} ui={ui} lang={lang} />);

  if (!isAuthenticated) {
    return wrap(
      <div className="rounded-3xl border border-line bg-surface p-8 text-center">
        <span className="mx-auto w-12 h-12 rounded-2xl bg-latte-soft text-coffee flex items-center justify-center mb-5"><Lock size={20} /></span>
        <h1 className="font-display text-2xl text-ink mb-2">{c.signinTitle}</h1>
        <p className="text-sm text-ink-soft leading-relaxed mb-6">{c.signinText}</p>
        <button
          type="button"
          onClick={() => navigate("/connexion", { state: { redirectTo: `${location.pathname}${location.search}` } })}
          className="rounded-full bg-ink text-cream text-sm font-medium px-7 py-3.5 hover:bg-coffee-dark transition-colors"
        >
          {c.signin}
        </button>
      </div>
    );
  }

  const indicative = currency && currency.code !== pivot ? c.indicative(money(total)) : null;

  return wrap(
    <form onSubmit={pay} noValidate>
      <Link to="/formations/bouquets" className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink mb-6">
        <ArrowLeft size={15} />
        {c.back}
      </Link>
      <h1 className="font-display text-3xl sm:text-4xl text-ink mb-6">{c.title(plan.name)}</h1>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <PeriodToggle value={period} onChange={setPeriod} labels={{ month: c.month, year: c.year, save: (n) => c.save(n) }} saving={plan.yearly_saving_pct} />
        <CurrencySelect currencies={currencies} value={currency?.code} onChange={choose} label={ui.plans.currency} />
      </div>

      {plan.per_seat && (
        <div className="grid sm:grid-cols-[8rem_1fr] gap-4 mb-6">
          <label className="block">
            <span className="block text-xs font-medium text-ink-soft mb-1.5">{c.seats}</span>
            <input
              type="number"
              inputMode="numeric"
              min={plan.min_seats}
              max={plan.max_seats}
              value={seats}
              onChange={(e) => setSeats(e.target.value === "" ? "" : Number(e.target.value))}
              onBlur={() => setSeats(seatCount)}
              className={input}
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-ink-soft mb-1.5">{c.org}</span>
            <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder={c.orgPh} maxLength={160} className={input} />
          </label>
        </div>
      )}

      <section className="rounded-3xl border border-line bg-surface p-6 mb-4" aria-label={c.order}>
        <h2 className="font-display text-lg text-ink mb-2">{c.order}</h2>
        <div className="divide-y divide-line">
          <Row
            label={plan.name}
            sub={plan.per_seat ? `${seatCount} × ${pm(unit)}` : period === "year" ? c.year : c.month}
            value={pm(total)}
          />
          <Row label={c.subtotal} value={pm(total)} />
          <Row label={c.due} sub={indicative} value={pm(total)} strong />
        </div>
      </section>

      <p className="rounded-2xl border border-line bg-surface px-5 py-4 text-xs text-ink-soft leading-relaxed mb-6">
        {c.noAuto(formatDate(validUntil, lang))}
      </p>

      <section className="rounded-3xl bg-surface border border-line p-6">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ink-soft mb-5">
          <ShieldCheck size={15} className="text-emerald-600" />
          {c.mobileMoney}
        </p>

        <div className="grid grid-cols-3 gap-3 mb-6" role="radiogroup" aria-label={c.mobileMoney}>
          {OPERATORS.map((o) => {
            const on = o.key === operator;
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pickOperator(o.key)}
                className={`rounded-2xl border px-3 py-4 flex flex-col items-center gap-2 transition-colors ${
                  on ? "border-coffee bg-latte-soft" : "border-line hover:border-coffee-light"
                }`}
              >
                <span className="w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ background: o.accent }}>
                  <Smartphone size={16} />
                </span>
                <span className="text-sm font-medium text-ink">{o.label}</span>
              </button>
            );
          })}
        </div>

        <label className="block text-sm text-ink-soft mb-2" htmlFor="momo-number">{c.number}</label>
        <div className="flex rounded-xl border border-line bg-surface focus-within:border-coffee focus-within:ring-2 focus-within:ring-coffee/15 transition overflow-hidden">
          {op.prefixes.length > 1 ? (
            <select
              aria-label="Prefix"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              className="bg-cream px-3 text-sm text-ink border-r border-line focus:outline-none"
            >
              {op.prefixes.map((p) => (
                <option key={p} value={p}>0{p}</option>
              ))}
            </select>
          ) : (
            <span className="bg-cream px-4 flex items-center text-sm text-ink border-r border-line">0{prefix}</span>
          )}
          <input
            id="momo-number"
            inputMode="numeric"
            autoComplete="tel-national"
            value={digits}
            onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 7))}
            placeholder="XXXXXXX"
            className="flex-1 min-w-0 px-4 py-3 text-sm bg-transparent text-ink placeholder:text-ink-faint focus:outline-none tracking-wider"
          />
        </div>
        <p className="text-xs text-ink-faint mt-1.5">{c.digits(digits.length)}</p>
        <p className="text-xs text-ink-soft leading-relaxed mt-4">{c.hint}</p>

        <AnimatePresence>
          {error && (
            <motion.p
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <button
          type="submit"
          disabled={!canPay}
          className="mt-5 w-full flex items-center justify-center gap-2 rounded-full bg-ink text-cream text-sm font-medium py-4 hover:bg-coffee-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {phase === "paying" ? <Loader2 size={16} className="animate-spin" /> : <Lock size={15} />}
          {phase === "paying" ? c.paying : c.pay(pm(total))}
        </button>
        {phase === "paying" && <p className="text-center text-xs text-coffee mt-3" role="status">{c.confirmPhone}</p>}
        {testMode && <p className="text-center text-[0.7rem] text-ink-faint mt-4">{c.simulated}</p>}
      </section>
    </form>
  );
}
