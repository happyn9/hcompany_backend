import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { BadgeCheck, Loader2, Store, Truck, TrendingUp, Wallet } from "lucide-react";
import ShopLayout from "../../components/shop/ShopLayout.jsx";
import { ImagePicker, StatusPill, useShopUi, useSellerUi } from "../../components/shop/Shared.jsx";
import { errMessage, useLoad } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { api } from "../../lib/api.js";
import { OPERATORS, buildPhone, operatorByKey, phoneIsComplete } from "../../lib/pricing.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const input = "w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-coffee focus:ring-2 focus:ring-coffee/15";
export function SField({ label, hint, error, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink mb-1.5">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-ink-faint mt-1">{hint}</span>}
      {error && <span role="alert" className="block text-xs text-red-600 dark:text-red-300 mt-1">{error}</span>}
    </label>
  );
}
export const fieldClass = input;

const PERK_ICONS = [TrendingUp, BadgeCheck, Truck, Wallet];

export default function SellerStart() {
  const ui = useShopUi();
  const s = useSellerUi().start;
  const navigate = useNavigate();
  const toast = useToast();
  const { isAuthenticated, withAuth } = useUser();
  usePageMeta({ title: s.title });
  const { data: agencies } = useLoad(() => api.shop.agencies(), []);
  const { data: shops } = useLoad(() => (isAuthenticated ? withAuth((t) => api.shop.seller.shops(t)) : Promise.resolve([])), [isAuthenticated]);
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState({ name: "", tagline: "", description: "", city: "", address: "", phone: "", whatsapp: "", email: "", dispatch_agency_id: "", operator: OPERATORS[0].key, prefix: OPERATORS[0].prefixes[0], digits: "" });
  const [logo, setLogo] = useState("");
  const [banner, setBanner] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState("");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const op = operatorByKey(f.operator);

  function begin() {
    if (!isAuthenticated) { navigate("/connexion", { state: { mode: "partner", redirectTo: "/shopping/vendre" } }); return; }
    // Une seule inscription : la boutique est créée d'office depuis le dossier partenaire, au déblocage du module.
    if (!showForm && !(shops || []).length) { navigate("/dashboard"); return; }
    if (!showForm && (shops || []).length) { navigate("/shopping/vendeur"); return; }
    setShowForm(true);
    setTimeout(() => document.getElementById("shop-form")?.scrollIntoView({ behavior: "smooth" }), 50);
  }
  async function submit(e) {
    e.preventDefault();
    const er = {};
    if (f.name.trim().length < 2) er.name = s.errName;
    if (f.digits && !phoneIsComplete(f.digits)) er.digits = ui.checkout.errNumber;
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true); setServerError("");
    try {
      const body = {
        name: f.name, tagline: f.tagline, description: f.description, city: f.city, address: f.address, phone: f.phone, whatsapp: f.whatsapp, email: f.email,
        dispatch_agency_id: f.dispatch_agency_id ? Number(f.dispatch_agency_id) : null,
        mobile_money_operator: f.digits ? f.operator : "", mobile_money_phone: f.digits ? buildPhone(f.prefix, f.digits) : "",
      };
      const shop = await withAuth((t) => api.shop.seller.createShop(t, body));
      if (logo || banner) await withAuth((t) => api.shop.seller.updateShop(t, shop.id, { ...(logo && { logo_path: logo }), ...(banner && { banner_path: banner }) })).catch(() => {});
      toast?.success?.(s.created);
      navigate(`/shopping/vendeur?boutique=${shop.id}`);
    } catch (err) { setServerError(errMessage(err, ui.common.error)); } finally { setBusy(false); }
  }

  return (
    <ShopLayout width="max-w-5xl">
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-2xl mx-auto pt-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-coffee mb-4">{s.eyebrow}</p>
        <h1 className="font-display text-4xl sm:text-5xl text-ink leading-tight">{s.title}</h1>
        <p className="text-ink-soft mt-5 leading-relaxed">{s.lead}</p>
        <button onClick={begin} className="mt-8 rounded-full bg-ink text-cream text-sm font-medium px-8 py-4 hover:bg-coffee-dark transition-colors inline-flex items-center gap-2"><Store size={16} /> {s.cta}</button>
      </motion.section>

      {shops?.length > 0 && (
        <section className="mt-14">
          <h2 className="font-display text-2xl text-ink mb-4">{s.myShops}</h2>
          <ul className="grid sm:grid-cols-2 gap-4">
            {shops.map((sh) => (
              <li key={sh.id}><Link to={`/shopping/vendeur?boutique=${sh.id}`} className="flex items-center justify-between gap-3 rounded-3xl border border-line bg-surface p-5 hover:border-coffee-light">
                <div className="min-w-0"><p className="font-medium text-ink truncate">{sh.name}</p><p className="text-xs text-ink-faint">{s.open}</p></div>
                <StatusPill status={sh.status === "approved" ? "completed" : sh.status === "pending" ? "processing" : "cancelled"} label={ui.common.shopStatus[sh.status]} />
              </Link></li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {s.perks.map((p, i) => { const Icon = PERK_ICONS[i]; return (
          <div key={p.t} className="rounded-3xl border border-line bg-surface p-6"><Icon className="text-coffee mb-4" size={22} /><p className="font-medium text-ink">{p.t}</p><p className="text-sm text-ink-soft mt-1.5 leading-relaxed">{p.d}</p></div>
        ); })}
      </section>

      <ol className="mt-14 grid sm:grid-cols-4 gap-4">
        {s.steps.map((t, i) => (<li key={t} className="flex items-center gap-3"><span className="w-9 h-9 shrink-0 rounded-full bg-coffee text-on-coffee flex items-center justify-center text-sm font-semibold">{i + 1}</span><span className="text-sm text-ink">{t}</span></li>))}
      </ol>

      {showForm && (
        <form id="shop-form" onSubmit={submit} noValidate className="mt-16 rounded-3xl border border-line bg-surface p-6 sm:p-10 max-w-3xl mx-auto space-y-6">
          <div><h2 className="font-display text-2xl text-ink">{s.createTitle}</h2><p className="text-sm text-ink-soft mt-1">{s.createLead}</p></div>
          <SField label={s.name} error={errors.name}><input className={input} value={f.name} onChange={set("name")} maxLength={80} /></SField>
          <SField label={s.tagline}><input className={input} value={f.tagline} onChange={set("tagline")} maxLength={140} /></SField>
          <SField label={s.description}><textarea className={`${input} resize-none`} rows={4} value={f.description} onChange={set("description")} maxLength={3000} /></SField>
          <div className="grid sm:grid-cols-2 gap-4">
            <SField label={s.city}><input className={input} value={f.city} onChange={set("city")} /></SField>
            <SField label={s.address}><input className={input} value={f.address} onChange={set("address")} /></SField>
            <SField label={s.phone}><input className={input} value={f.phone} onChange={set("phone")} inputMode="tel" /></SField>
            <SField label={s.whatsapp}><input className={input} value={f.whatsapp} onChange={set("whatsapp")} inputMode="tel" /></SField>
            <div className="sm:col-span-2"><SField label={s.email}><input className={input} type="email" value={f.email} onChange={set("email")} /></SField></div>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <div><p className="text-sm font-medium text-ink mb-2">{s.logo}</p><ImagePicker value={logo} onChange={setLogo} label={s.upload} hint={s.imageHint} /></div>
            <div><p className="text-sm font-medium text-ink mb-2">{s.banner}</p><ImagePicker value={banner} onChange={setBanner} label={s.upload} ratio="w-32 h-16" /></div>
          </div>
          <SField label={s.agency} hint={s.agencyHint}>
            <select className={input} value={f.dispatch_agency_id} onChange={set("dispatch_agency_id")}><option value="">{s.noAgency}</option>{agencies?.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.city}</option>)}</select>
          </SField>
          <fieldset>
            <legend className="text-sm font-medium text-ink mb-2">{s.payout}</legend>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {OPERATORS.map((o) => (<button key={o.key} type="button" aria-pressed={f.operator === o.key} onClick={() => setF((p) => ({ ...p, operator: o.key, prefix: o.prefixes[0] }))} className={`rounded-xl border p-2.5 text-sm ${f.operator === o.key ? "border-coffee bg-latte-soft text-ink" : "border-line text-ink-soft"}`}>{o.label}</button>))}
            </div>
            <SField label={s.number} error={errors.digits}>
              <div className="flex gap-2">
                {op.prefixes.length > 1 ? <select className={`${input} !w-24`} value={f.prefix} onChange={set("prefix")}>{op.prefixes.map((p) => <option key={p} value={p}>0{p}</option>)}</select> : <span className={`${input} !w-24 text-center`}>0{f.prefix}</span>}
                <input className={input} inputMode="numeric" maxLength={7} value={f.digits} onChange={(e) => setF((p) => ({ ...p, digits: e.target.value.replace(/\D/g, "").slice(0, 7) }))} placeholder="1234567" />
              </div>
            </SField>
          </fieldset>
          {serverError && <p role="alert" className="rounded-xl bg-red-500/10 text-red-700 dark:text-red-300 text-sm p-3">{serverError}</p>}
          <button disabled={busy} className="w-full rounded-full bg-ink text-cream text-sm font-medium py-4 hover:bg-coffee-dark disabled:opacity-60 inline-flex items-center justify-center gap-2">{busy ? <><Loader2 size={16} className="animate-spin" /> {s.sending}</> : s.submit}</button>
        </form>
      )}
    </ShopLayout>
  );
}
