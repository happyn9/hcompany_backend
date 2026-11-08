import { useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, Loader2, Lock, ShieldCheck, Zap } from "lucide-react";
import LodgeLayout from "../../components/lodge/LodgeLayout.jsx";
import { ErrorState, LodgeImage, Spinner, useLodgeUi } from "../../components/lodge/Shared.jsx";
import { errMessage, useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { OPERATORS, buildPhone, operatorByKey, phoneIsComplete } from "../../lib/pricing.js";
import { formatRange, nightsBetween, searchQuery } from "../../lib/lodge.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const input = "w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-coffee focus:ring-2 focus:ring-coffee/15 transition";

function Field({ label, children, hint, error }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink mb-1.5">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-ink-faint mt-1">{hint}</span>}
      {error && <span role="alert" className="block text-xs text-red-600 dark:text-red-300 mt-1">{error}</span>}
    </label>
  );
}

export default function LodgeBook() {
  const { slug } = useParams();
  const ui = useLodgeUi();
  const b = ui.book;
  const { lang } = useLanguage();
  const loc = useLocation();
  const [params] = useSearchParams();
  const { user, isAuthenticated, isLoading, withAuth } = useUser();
  const { money, testMode } = useShopMoney();
  usePageMeta({ title: b.title });

  const ci = params.get("check_in");
  const co = params.get("check_out");
  const guests = Math.max(1, Number(params.get("guests")) || 1);
  const rooms = Math.max(1, Number(params.get("rooms")) || 1);
  const back = `/logement/s/${slug}?${searchQuery({ check_in: ci, check_out: co, guests, rooms })}`;

  const { data: p, loading, error, reload } = useLoad(() => api.lodge.property(slug), [slug]);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", arrival: "", note: "" });
  const [operator, setOperator] = useState(OPERATORS[0].key);
  const [prefix, setPrefix] = useState(OPERATORS[0].prefixes[0]);
  const [digits, setDigits] = useState("");
  const [errors, setErrors] = useState({});
  const [phase, setPhase] = useState("idle");
  const [payError, setPayError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (user && !form.name) setForm((f) => ({ ...f, name: user.full_name || "" }));
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!p || !ci || !co || phase === "done") return;
    let alive = true;
    api.lodge.quote({ property_id: p.id, check_in: ci, check_out: co, guests, units: rooms })
      .then((q) => alive && (setQuote(q), setQuoteError("")))
      .catch((e) => alive && (setQuote(null), setQuoteError(errMessage(e, ui.common.error))));
    return () => { alive = false; };
  }, [p?.id, ci, co, guests, rooms]); // eslint-disable-line react-hooks/exhaustive-deps

  const op = operatorByKey(operator);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate() {
    const e = {};
    if (form.name.trim().length < 2) e.name = b.errName;
    if (form.phone.replace(/\D/g, "").length < 6) e.phone = b.errPhone;
    if (!phoneIsComplete(digits)) e.digits = b.errNumber;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function pay(ev) {
    ev.preventDefault();
    if (phase !== "idle" || !quote || !validate()) return;
    setPayError("");
    setPhase("paying");
    try {
      const data = await withAuth((t) =>
        api.lodge.book(t, {
          property_id: p.id, check_in: ci, check_out: co, guests, units: rooms, guest_name: form.name, guest_phone: form.phone,
          arrival_time: form.arrival, note: form.note, method: operator, phone: buildPhone(prefix, digits),
        })
      );
      setResult(data);
      setPhase("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setPayError(errMessage(err, ui.common.error));
      setPhase("idle");
    }
  }

  if (isLoading || (loading && !p)) return <LodgeLayout hideBar><Spinner label={ui.common.loading} /></LodgeLayout>;
  if (error) return <LodgeLayout hideBar width="max-w-2xl">{error.status === 404 ? <ErrorState message={b.missing} /> : <ErrorState onRetry={reload} />}</LodgeLayout>;
  if (!p) return null;

  if (phase === "done" && result) {
    const bk = result.booking;
    const instant = bk.status === "confirmed";
    return (
      <LodgeLayout hideBar width="max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16 }} className="mx-auto w-16 h-16 rounded-full bg-latte-soft text-coffee flex items-center justify-center mb-6"><CheckCircle2 size={32} /></motion.span>
          <h1 className="font-display text-3xl sm:text-4xl text-ink mb-3">{instant ? b.successTitle : b.successRequestTitle}</h1>
          <p className="text-ink-soft leading-relaxed max-w-md mx-auto">{instant ? b.successText : b.successRequestText}</p>
          <div className="mt-8 rounded-3xl border border-line bg-surface p-5 text-left flex gap-4">
            <LodgeImage path={bk.property.image} alt={bk.property.title} ratio="w-24 h-24" className="rounded-2xl shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-ink">{bk.property.title}</p>
              <p className="text-sm text-ink-soft">{formatRange(bk.check_in, bk.check_out, lang)} · {ui.common.night(bk.nights)}</p>
              <p className="text-sm text-ink-soft">{ui.common.guests(bk.guests)}</p>
              <p className="mt-2 text-xs text-ink-faint">{b.reference} · <span className="font-mono">{bk.code}</span></p>
            </div>
            <p className="ml-auto font-display text-xl text-ink whitespace-nowrap">{money(bk.total)}</p>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to={`/logement/mes-sejours/${bk.code}`} className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5 hover:bg-coffee-dark">{b.viewTrip}</Link>
            <Link to="/logement/recherche" className="rounded-full border border-line text-ink text-sm font-medium px-6 py-3.5 hover:border-coffee-light">{b.keepSearching}</Link>
          </div>
        </motion.div>
      </LodgeLayout>
    );
  }

  if (!ci || !co) return <LodgeLayout hideBar width="max-w-xl"><ErrorState message={b.errDates} /><p className="text-center mt-4"><Link to={back} className="text-coffee hover:underline text-sm">{b.back}</Link></p></LodgeLayout>;

  if (!isAuthenticated) {
    return (
      <LodgeLayout hideBar width="max-w-xl">
        <div className="rounded-3xl border border-line bg-surface p-10 text-center">
          <Lock className="mx-auto text-coffee mb-4" />
          <h1 className="font-display text-2xl text-ink mb-3">{b.signInTitle}</h1>
          <p className="text-ink-soft text-sm mb-6">{b.signInText}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/connexion" state={{ redirectTo: loc.pathname + loc.search }} className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5">{ui.common.signIn}</Link>
            <Link to="/creer-un-compte" state={{ redirectTo: loc.pathname + loc.search }} className="rounded-full border border-line text-ink text-sm font-medium px-6 py-3.5">{ui.common.createAccount}</Link>
          </div>
        </div>
      </LodgeLayout>
    );
  }

  const nights = nightsBetween(ci, co);
  return (
    <LodgeLayout hideBar>
      <Link to={back} className="text-sm text-coffee hover:underline">← {b.back}</Link>
      <h1 className="font-display text-3xl sm:text-4xl text-ink mt-3 mb-8">{b.title}</h1>
      <form onSubmit={pay} className="grid lg:grid-cols-[1fr_400px] gap-8 items-start" noValidate>
        <div className="space-y-8">
          <section className="rounded-3xl border border-line bg-surface p-6">
            <h2 className="font-display text-xl text-ink mb-4">1 · {b.yourTrip}</h2>
            <dl className="divide-y divide-line text-sm">
              <div className="flex justify-between py-3"><dt className="text-ink-soft">{b.dates}</dt><dd className="text-ink">{formatRange(ci, co, lang)} · {ui.common.night(nights)}</dd></div>
              <div className="flex justify-between py-3"><dt className="text-ink-soft">{b.guests}</dt><dd className="text-ink">{ui.common.guests(guests)}{rooms > 1 ? ` · ${ui.common.rooms(rooms)}` : ""}</dd></div>
            </dl>
            <Link to={back} className="text-sm text-coffee hover:underline">{b.edit}</Link>
            <div className="mt-5 rounded-2xl bg-latte-soft p-4 flex gap-3 text-sm">
              {p.instant_book ? <Zap size={18} className="text-coffee shrink-0" /> : <Clock size={18} className="text-coffee shrink-0" />}
              <div><p className="font-medium text-ink">{p.instant_book ? b.instantBadge : b.requestBadge}</p>{!p.instant_book && <p className="text-ink-soft mt-0.5">{b.requestInfo}</p>}</div>
            </div>
          </section>

          <section className="rounded-3xl border border-line bg-surface p-6">
            <h2 className="font-display text-xl text-ink mb-5">2 · {b.guestInfo}</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label={b.name} error={errors.name}><input className={input} value={form.name} onChange={set("name")} autoComplete="name" /></Field>
              <Field label={b.phone} error={errors.phone}><input className={input} value={form.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" placeholder="097 1234567" /></Field>
              <div className="sm:col-span-2"><Field label={b.arrival} hint={b.arrivalHint}><input className={input} value={form.arrival} onChange={set("arrival")} maxLength={20} placeholder="16:00" /></Field></div>
              <div className="sm:col-span-2"><Field label={b.note}><textarea className={`${input} resize-none`} rows={3} maxLength={1000} value={form.note} onChange={set("note")} placeholder={b.notePlaceholder} /></Field></div>
            </div>
          </section>

          <section className="rounded-3xl border border-line bg-surface p-6">
            <h2 className="font-display text-xl text-ink mb-5">3 · {b.payment}</h2>
            <p className="text-sm font-medium text-ink mb-3">{b.payWith}</p>
            <div className="grid grid-cols-3 gap-3 mb-5" role="radiogroup" aria-label={b.operator}>
              {OPERATORS.map((o) => (
                <button key={o.key} type="button" role="radio" aria-checked={operator === o.key} onClick={() => { setOperator(o.key); setPrefix(operatorByKey(o.key).prefixes[0]); }} className={`rounded-2xl border p-3 text-sm font-medium transition ${operator === o.key ? "border-coffee bg-latte-soft text-ink" : "border-line text-ink-soft hover:border-coffee-light"}`}>
                  <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: o.accent }} />{o.label}
                </button>
              ))}
            </div>
            <Field label={b.number} hint={b.numberHint} error={errors.digits}>
              <div className="flex gap-2">
                {op.prefixes.length > 1 ? (
                  <select aria-label="prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} className={`${input} !w-24`}>{op.prefixes.map((x) => <option key={x} value={x}>0{x}</option>)}</select>
                ) : <span className={`${input} !w-24 text-center`}>0{prefix}</span>}
                <input className={input} inputMode="numeric" autoComplete="tel-national" maxLength={7} value={digits} onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="1234567" />
              </div>
            </Field>
            {testMode && <p className="mt-4 text-xs rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-200 px-3 py-2">{ui.common.testMode}</p>}
          </section>
        </div>

        <aside className="rounded-3xl border border-line bg-surface p-6 lg:sticky lg:top-24 space-y-5">
          <div className="flex gap-4">
            <LodgeImage path={p.image} alt={p.title} ratio="w-24 h-20" className="rounded-2xl shrink-0" />
            <div className="min-w-0"><p className="font-medium text-ink line-clamp-2">{p.title}</p><p className="text-xs text-ink-faint mt-1">{ui.types[p.type]} · {p.city}</p></div>
          </div>
          {quoteError && <p role="alert" className="rounded-xl bg-red-500/10 text-red-700 dark:text-red-300 text-sm p-3">{quoteError} <Link to={back} className="underline">{b.edit}</Link></p>}
          {quote && (
            <dl className="space-y-2.5 text-sm border-t border-line pt-4">
              <h2 className="font-display text-lg text-ink mb-2">{b.summary}</h2>
              <div className="flex justify-between"><dt className="text-ink-soft">{ui.widget.nightsX(money(quote.avg_night), quote.nights)}</dt><dd>{money(quote.nightly_total)}</dd></div>
              {quote.discount > 0 && <div className="flex justify-between text-emerald-700 dark:text-emerald-300"><dt>{ui.widget.discount(quote.discount_pct)}</dt><dd>− {money(quote.discount)}</dd></div>}
              {quote.cleaning_fee > 0 && <div className="flex justify-between"><dt className="text-ink-soft">{ui.widget.cleaning}</dt><dd>{money(quote.cleaning_fee)}</dd></div>}
              <div className="flex justify-between items-baseline border-t border-line pt-3"><dt className="font-medium text-ink">{b.total}</dt><dd className="font-display text-2xl text-ink whitespace-nowrap">{money(quote.total)}</dd></div>
            </dl>
          )}
          {payError && <p role="alert" className="rounded-xl bg-red-500/10 text-red-700 dark:text-red-300 text-sm p-3">{payError}</p>}
          <button type="submit" disabled={phase !== "idle" || !quote} className="w-full rounded-full bg-ink text-cream text-sm font-medium py-4 hover:bg-coffee-dark transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {phase === "paying" ? <><Loader2 size={16} className="animate-spin" /> {b.paying}</> : quote ? b.pay(money(quote.total)) : ui.common.loading}
          </button>
          <p className="flex gap-2 text-xs text-ink-faint leading-relaxed"><ShieldCheck size={15} className="shrink-0 text-coffee" /> {b.escrow}</p>
          <p className="text-xs text-ink-soft">{ui.policy[p.cancellation_policy]?.label} — {ui.policy[p.cancellation_policy]?.text}</p>
          {phase === "paying" && <p className="text-xs text-ink-soft" aria-live="polite">{b.payHint}</p>}
        </aside>
      </form>
    </LodgeLayout>
  );
}
