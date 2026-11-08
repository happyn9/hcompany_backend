import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, Home, Loader2, Lock, MapPin, ShieldCheck, Store, Tag, X } from "lucide-react";
import ShopLayout from "../../components/shop/ShopLayout.jsx";
import { EmptyState, ErrorState, ShopImage, Spinner, useShopUi } from "../../components/shop/Shared.jsx";
import { errMessage, useLoad, useShopMoney } from "../../data/shop.js";
import { useCart } from "../../context/CartContext.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { OPERATORS, buildPhone, operatorByKey, phoneIsComplete } from "../../lib/pricing.js";
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

export default function ShopCheckout() {
  const ui = useShopUi();
  const c = ui.checkout;
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading, withAuth } = useUser();
  const { items, clear } = useCart();
  const { money, pivotMoney, currency, pivot, testMode } = useShopMoney();
  usePageMeta({ title: c.title });
  const { data: agencies, loading: agLoading, error: agError, reload } = useLoad(() => api.shop.agencies(), []);

  const [mode, setMode] = useState("agency_pickup");
  const [agencyId, setAgencyId] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", city: "", note: "" });
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState("");
  const [couponMsg, setCouponMsg] = useState("");
  const [operator, setOperator] = useState(OPERATORS[0].key);
  const [prefix, setPrefix] = useState(OPERATORS[0].prefixes[0]);
  const [digits, setDigits] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | paying | done
  const [errors, setErrors] = useState({});
  const [payError, setPayError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (user && !form.name) setForm((f) => ({ ...f, name: user.full_name || "" }));
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (agencies?.length && agencyId === null) setAgencyId(agencies[0].id);
  }, [agencies, agencyId]);

  const agency = agencies?.find((a) => a.id === agencyId);
  // Si l'agence choisie ne livre pas à domicile, on revient au retrait.
  useEffect(() => {
    if (mode === "home_delivery" && agency && agency.home_fee === null) setMode("agency_pickup");
  }, [agency, mode]);

  const cartSig = items.map((i) => `${i.key}x${i.quantity}`).join("|");
  useEffect(() => {
    if (!items.length || !agencyId || phase === "done") return;
    let alive = true;
    api.shop
      .quote({ items: items.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id, color: i.color || null, quantity: i.quantity })), delivery_mode: mode, agency_id: agencyId, coupon_code: coupon || undefined })
      .then((q) => { if (alive) { setQuote(q); setQuoteError(""); if (coupon) setCouponMsg(c.couponApplied(coupon)); } })
      .catch((e) => {
        if (!alive) return;
        if (coupon && /promo/i.test(e?.data?.detail || "")) { setCouponMsg(e.data.detail); setCoupon(""); return; }
        setQuote(null);
        setQuoteError(errMessage(e, ui.common.error));
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartSig, mode, agencyId, coupon, phase]);

  const op = operatorByKey(operator);
  const pickOperator = (k) => { setOperator(k); setPrefix(operatorByKey(k).prefixes[0]); };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const signedIn = isAuthenticated;

  function validate() {
    const e = {};
    if (form.name.trim().length < 2) e.name = c.errName;
    if (form.phone.replace(/\D/g, "").length < 6) e.phone = c.errPhone;
    if (mode === "home_delivery" && form.address.trim().length < 5) e.address = c.errAddress;
    if (!agencyId) e.agency = c.errAgency;
    if (!phoneIsComplete(digits)) e.digits = c.errNumber;
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
        api.shop.checkout(t, {
          items: items.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id, color: i.color || null, quantity: i.quantity })),
          delivery_mode: mode, agency_id: agencyId, coupon_code: coupon || undefined,
          recipient_name: form.name, recipient_phone: form.phone, address: form.address, city: form.city, note: form.note,
          method: operator, phone: buildPhone(prefix, digits), currency: currency?.code || pivot,
        })
      );
      clear();
      setResult(data);
      setPhase("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setPayError(errMessage(err, ui.common.error));
      setPhase("idle");
    }
  }

  const groups = useMemo(() => quote?.orders || [], [quote]);

  if (isLoading) return <ShopLayout hideBar><Spinner label={ui.common.loading} /></ShopLayout>;

  if (phase === "done" && result) {
    return (
      <ShopLayout hideBar width="max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16 }} className="mx-auto w-16 h-16 rounded-full bg-latte-soft text-coffee flex items-center justify-center mb-6"><CheckCircle2 size={32} /></motion.span>
          <h1 className="font-display text-3xl sm:text-4xl text-ink mb-3">{c.successTitle}</h1>
          <p className="text-ink-soft leading-relaxed max-w-md mx-auto">{c.successText}</p>
          <p className="mt-4 text-xs text-ink-faint">{c.reference} · <span className="font-mono">{result.reference}</span></p>
          <ul className="mt-8 text-left space-y-3">
            {result.orders.map((o) => (
              <li key={o.code} className="rounded-3xl border border-line bg-surface p-5 flex items-center justify-between gap-4">
                <div className="min-w-0"><p className="font-medium text-ink">{o.shop.name}</p><p className="text-xs text-ink-faint font-mono">{o.code}</p><p className="text-xs text-ink-soft mt-1">{ui.common.delivery[o.delivery_mode]}{o.agency ? ` · ${o.agency.name}` : ""}</p></div>
                <div className="text-right shrink-0"><p className="font-display text-xl text-ink">{pivotMoney(o.total)}</p><Link to={`/shopping/mes-commandes/${o.code}`} className="text-xs text-coffee hover:underline">{c.viewOrder}</Link></div>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/shopping/mes-commandes" className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5 hover:bg-coffee-dark">{c.viewOrders}</Link>
            <Link to="/shopping/produits" className="rounded-full border border-line text-ink text-sm font-medium px-6 py-3.5 hover:border-coffee-light">{c.keepShopping}</Link>
          </div>
        </motion.div>
      </ShopLayout>
    );
  }

  if (!items.length) return <ShopLayout width="max-w-3xl"><EmptyState icon={Store} title={ui.cart.empty} hint={ui.cart.emptyHint} action={<Link to="/shopping/produits" className="rounded-full bg-ink text-cream text-sm px-6 py-3">{ui.cart.continue}</Link>} /></ShopLayout>;

  if (!signedIn) {
    return (
      <ShopLayout width="max-w-xl">
        <div className="rounded-3xl border border-line bg-surface p-10 text-center">
          <Lock className="mx-auto text-coffee mb-4" />
          <h1 className="font-display text-2xl text-ink mb-3">{c.signInTitle}</h1>
          <p className="text-ink-soft text-sm mb-6">{c.signInText}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/connexion" state={{ redirectTo: "/shopping/commande" }} className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5">{ui.common.signIn}</Link>
            <Link to="/creer-un-compte" state={{ redirectTo: "/shopping/commande" }} className="rounded-full border border-line text-ink text-sm font-medium px-6 py-3.5">{ui.common.createAccount}</Link>
          </div>
        </div>
      </ShopLayout>
    );
  }

  return (
    <ShopLayout hideBar>
      <h1 className="font-display text-3xl sm:text-4xl text-ink mb-8">{c.title}</h1>
      {agLoading && <Spinner label={ui.common.loading} />}
      {agError && <ErrorState onRetry={reload} />}
      {agencies && agencies.length === 0 && <EmptyState icon={MapPin} title={c.noAgency} />}
      {agencies && agencies.length > 0 && (
        <form onSubmit={pay} className="grid lg:grid-cols-[1fr_400px] gap-8 items-start" noValidate>
          <div className="space-y-8">
            <section className="rounded-3xl border border-line bg-surface p-6">
              <h2 className="font-display text-xl text-ink mb-1">1 · {c.step1}</h2>
              <p className="text-sm text-ink-soft mb-5">{c.mode}</p>
              <div className="grid sm:grid-cols-2 gap-3 mb-6">
                {[["agency_pickup", c.pickup, c.pickupHint, MapPin], ["home_delivery", c.home, c.homeHint, Home]].map(([k, title, hint, Icon]) => {
                  const disabled = k === "home_delivery" && agency && agency.home_fee === null;
                  return (
                    <button key={k} type="button" disabled={disabled} onClick={() => setMode(k)} aria-pressed={mode === k} className={`text-left rounded-2xl border p-4 transition ${mode === k ? "border-coffee bg-latte-soft" : "border-line hover:border-coffee-light"} disabled:opacity-40`}>
                      <Icon size={18} className="text-coffee mb-2" />
                      <p className="text-sm font-medium text-ink">{title}</p>
                      <p className="text-xs text-ink-soft mt-0.5">{disabled ? c.noHome : hint}</p>
                    </button>
                  );
                })}
              </div>
              <fieldset className="mb-6">
                <legend className="text-sm font-medium text-ink mb-3">{c.agency}</legend>
                <div className="space-y-2">
                  {agencies.map((a) => (
                    <label key={a.id} className={`flex items-start gap-3 rounded-2xl border p-4 cursor-pointer transition ${agencyId === a.id ? "border-coffee bg-latte-soft" : "border-line hover:border-coffee-light"}`}>
                      <input type="radio" name="agency" checked={agencyId === a.id} onChange={() => setAgencyId(a.id)} className="mt-1 accent-[var(--color-coffee)]" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-ink">{a.name} <span className="text-ink-faint font-normal">· {a.city}</span></span>
                        <span className="block text-xs text-ink-soft">{a.address}</span>
                        {a.hours && <span className="block text-xs text-ink-faint">{c.hours} : {a.hours}</span>}
                      </span>
                      <span className="text-sm text-ink whitespace-nowrap">{pivotMoney(mode === "home_delivery" ? a.home_fee ?? 0 : a.pickup_fee)}</span>
                    </label>
                  ))}
                </div>
                {errors.agency && <p role="alert" className="text-xs text-red-600 mt-1">{errors.agency}</p>}
              </fieldset>
              <h3 className="text-sm font-medium text-ink mb-3">{c.recipient}</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label={c.name} error={errors.name}><input className={input} value={form.name} onChange={set("name")} autoComplete="name" /></Field>
                <Field label={c.phone} error={errors.phone}><input className={input} value={form.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" placeholder="097 1234567" /></Field>
                {mode === "home_delivery" && (
                  <>
                    <div className="sm:col-span-2"><Field label={c.address} hint={c.addressHint} error={errors.address}><input className={input} value={form.address} onChange={set("address")} autoComplete="street-address" /></Field></div>
                    <Field label={c.city}><input className={input} value={form.city} onChange={set("city")} autoComplete="address-level2" /></Field>
                  </>
                )}
                <div className="sm:col-span-2"><Field label={c.note}><textarea className={`${input} resize-none`} rows={2} maxLength={500} value={form.note} onChange={set("note")} /></Field></div>
              </div>
            </section>

            <section className="rounded-3xl border border-line bg-surface p-6">
              <h2 className="font-display text-xl text-ink mb-5">2 · {c.step2}</h2>
              <p className="text-sm font-medium text-ink mb-3">{c.payWith}</p>
              <div className="grid grid-cols-3 gap-3 mb-5" role="radiogroup" aria-label={c.operator}>
                {OPERATORS.map((o) => (
                  <button key={o.key} type="button" role="radio" aria-checked={operator === o.key} onClick={() => pickOperator(o.key)} className={`rounded-2xl border p-3 text-sm font-medium transition ${operator === o.key ? "border-coffee bg-latte-soft text-ink" : "border-line text-ink-soft hover:border-coffee-light"}`}>
                    <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: o.accent }} />{o.label}
                  </button>
                ))}
              </div>
              <Field label={c.number} hint={c.numberHint} error={errors.digits}>
                <div className="flex gap-2">
                  {op.prefixes.length > 1 ? (
                    <select aria-label="prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} className={`${input} !w-24`}>{op.prefixes.map((p) => <option key={p} value={p}>0{p}</option>)}</select>
                  ) : (
                    <span className={`${input} !w-24 text-center`}>0{prefix}</span>
                  )}
                  <input className={input} inputMode="numeric" autoComplete="tel-national" maxLength={7} value={digits} onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="1234567" />
                </div>
              </Field>
              {testMode && <p className="mt-4 text-xs rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-200 px-3 py-2">{ui.common.testMode}</p>}
            </section>
          </div>

          <aside className="rounded-3xl border border-line bg-surface p-6 lg:sticky lg:top-24 space-y-5">
            <h2 className="font-display text-xl text-ink">{c.summary}</h2>
            {quoteError && <p role="alert" className="rounded-xl bg-red-500/10 text-red-700 dark:text-red-300 text-sm p-3">{quoteError} <Link to="/shopping/panier" className="underline">{ui.bar.cart}</Link></p>}
            {groups.map((g) => (
              <div key={g.shop.id} className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-coffee">{g.shop.name}</p>
                {g.lines.map((l) => (
                  <div key={`${l.product_id}-${l.variant_id}`} className="flex gap-3 text-sm">
                    <ShopImage path={l.image} ratio="w-12 h-12" className="rounded-xl shrink-0" />
                    <div className="flex-1 min-w-0"><p className="text-ink line-clamp-1">{l.title}</p><p className="text-xs text-ink-faint">{l.variant_label && `${l.variant_label} · `}× {l.quantity}</p></div>
                    <p className="text-ink whitespace-nowrap">{pivotMoney(l.line_total)}</p>
                  </div>
                ))}
              </div>
            ))}
            <div className="border-t border-line pt-4">
              {couponMsg && !coupon && <p className="text-xs text-red-600 mb-2">{couponMsg}</p>}
              {coupon ? (
                <p className="flex items-center justify-between text-sm rounded-xl bg-latte-soft text-coffee px-3 py-2"><span className="inline-flex items-center gap-2"><Tag size={14} /> {c.couponApplied(coupon)}</span><button type="button" onClick={() => { setCoupon(""); setCouponInput(""); setCouponMsg(""); }} aria-label={c.couponRemove}><X size={14} /></button></p>
              ) : (
                <div className="flex gap-2">
                  <input aria-label={c.coupon} placeholder={c.coupon} value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} className={`${input} !py-2.5`} />
                  <button type="button" disabled={!couponInput.trim()} onClick={() => { setCouponMsg(""); setCoupon(couponInput.trim()); }} className="rounded-xl border border-line px-4 text-sm text-ink hover:border-coffee-light disabled:opacity-40">{c.couponApply}</button>
                </div>
              )}
            </div>
            {quote && (
              <dl className="space-y-2 text-sm border-t border-line pt-4">
                <div className="flex justify-between"><dt className="text-ink-soft">{c.subtotal}</dt><dd>{pivotMoney(groups.reduce((s, g) => s + g.subtotal, 0))}</dd></div>
                {groups.some((g) => g.discount > 0) && <div className="flex justify-between text-emerald-700 dark:text-emerald-300"><dt>{c.discount}</dt><dd>− {pivotMoney(groups.reduce((s, g) => s + g.discount, 0))}</dd></div>}
                <div className="flex justify-between"><dt className="text-ink-soft">{c.delivery}</dt><dd>{groups.every((g) => g.delivery_fee === 0) ? ui.common.free : pivotMoney(groups.reduce((s, g) => s + g.delivery_fee, 0))}</dd></div>
                <div className="flex justify-between items-baseline border-t border-line pt-3"><dt className="font-medium text-ink">{c.total}</dt><dd className="font-display text-2xl text-ink whitespace-nowrap">{pivotMoney(quote.total)}</dd></div>
                {currency?.code !== pivot && <p className="text-xs text-ink-faint text-right">{c.indicative(money(quote.total))} · {c.billedIn(pivot)}</p>}
              </dl>
            )}
            {payError && <p role="alert" className="rounded-xl bg-red-500/10 text-red-700 dark:text-red-300 text-sm p-3">{payError}</p>}
            <button type="submit" disabled={phase !== "idle" || !quote} className="w-full rounded-full bg-ink text-cream text-sm font-medium py-4 hover:bg-coffee-dark transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {phase === "paying" ? <><Loader2 size={16} className="animate-spin" /> {c.paying}</> : quote ? c.pay(pivotMoney(quote.total)) : ui.common.loading}
            </button>
            <p className="flex gap-2 text-xs text-ink-faint leading-relaxed"><ShieldCheck size={15} className="shrink-0 text-coffee" /> {c.escrow}</p>
            {phase === "paying" && <p className="text-xs text-ink-soft" aria-live="polite">{c.payHint}</p>}
          </aside>
        </form>
      )}
    </ShopLayout>
  );
}
