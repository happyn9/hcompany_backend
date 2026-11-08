import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ExternalLink, Loader2, Plus, Store, Trash2 } from "lucide-react";
import ShopLayout from "../../components/shop/ShopLayout.jsx";
import AuthGate from "../../components/shop/AuthGate.jsx";
import { EmptyState, ErrorState, ImagePicker, ShopImage, Spinner, StatusPill, useShopUi, useSellerUi } from "../../components/shop/Shared.jsx";
import { SField, fieldClass } from "./SellerStart.jsx";
import { errMessage, useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { OPERATORS, buildPhone, operatorByKey, phoneIsComplete } from "../../lib/pricing.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const TABS = ["overview", "products", "orders", "reviews", "promos", "wallet", "shop"];

function Stat({ label, value, tone }) {
  return <div className="rounded-3xl border border-line bg-surface p-5"><p className="text-xs text-ink-faint">{label}</p><p className={`font-display text-2xl mt-1 ${tone || "text-ink"}`}>{value}</p></div>;
}

function useSeller(shopId) {
  const { withAuth } = useUser();
  const toast = useToast();
  const ui = useShopUi();
  return {
    withAuth,
    run: async (fn, okMsg, after) => {
      try { const r = await withAuth(fn); if (okMsg) toast?.success?.(okMsg); after?.(r); return r; }
      catch (e) { toast?.error?.(errMessage(e, ui.common.error)); return null; }
    },
    shopId,
  };
}

/* ---------- Vue d'ensemble ---------- */
function Overview({ shop }) {
  const d = useSellerUi().dash;
  const { withAuth } = useUser();
  const { pivotMoney } = useShopMoney();
  const { data, loading, error, reload } = useLoad(() => withAuth((t) => api.shop.seller.stats(t, shop.id)), [shop.id]);
  if (loading) return <Spinner label="…" />;
  if (error) return <ErrorState onRetry={reload} />;
  const max = Math.max(1, ...data.by_day.map((x) => x.amount));
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Stat label={d.stats.revenue} value={pivotMoney(data.revenue)} />
        <Stat label={d.stats.orders} value={data.orders} />
        <Stat label={d.stats.open} value={data.orders_open} tone={data.orders_open ? "text-coffee" : ""} />
        <Stat label={d.stats.products} value={data.products} />
        <Stat label={d.stats.low} value={data.low_stock} tone={data.low_stock ? "text-amber-600" : ""} />
        <Stat label={d.stats.pending} value={data.pending_review} />
      </div>
      <section className="rounded-3xl border border-line bg-surface p-6">
        <h3 className="font-display text-xl text-ink mb-5">{d.sales30}</h3>
        {!data.by_day.some((x) => x.amount > 0) ? <p className="text-sm text-ink-faint">{d.noData}</p> : (
          <div className="flex items-end gap-1 h-36" role="img" aria-label={d.sales30}>
            {data.by_day.map((x) => <div key={x.day} title={`${x.day} · ${pivotMoney(x.amount)}`} className="flex-1 bg-coffee/80 rounded-t min-h-[3px]" style={{ height: `${Math.max(3, (x.amount / max) * 100)}%` }} />)}
          </div>
        )}
      </section>
      <section className="rounded-3xl border border-line bg-surface p-6">
        <h3 className="font-display text-xl text-ink mb-4">{d.top}</h3>
        {data.top_products.length === 0 ? <p className="text-sm text-ink-faint">{d.noData}</p> : (
          <ul className="divide-y divide-line">{data.top_products.map((p) => <li key={p.title} className="py-3 flex justify-between gap-3 text-sm"><span className="text-ink truncate">{p.title}</span><span className="text-ink-soft whitespace-nowrap">{p.quantity} · {pivotMoney(p.amount)}</span></li>)}</ul>
        )}
      </section>
    </div>
  );
}

/* ---------- Produits ---------- */
function Products({ shop }) {
  const ui = useShopUi();
  const d = useSellerUi().dash;
  const p = d.product;
  const { pivotMoney } = useShopMoney();
  const { withAuth } = useUser();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => withAuth((t) => api.shop.seller.products(t, shop.id)), [shop.id]);
  async function act(fn, ok) { try { await withAuth(fn); ok && toast?.success?.(ok); reload(); } catch (e) { toast?.error?.(errMessage(e, ui.common.error)); } }
  return (
    <div>
      <div className="flex justify-end mb-5"><Link to={`/shopping/vendeur/produit/new?boutique=${shop.id}`} className="rounded-full bg-ink text-cream text-sm font-medium px-5 py-3 inline-flex items-center gap-2 hover:bg-coffee-dark"><Plus size={15} /> {d.addProduct}</Link></div>
      {loading && <Spinner label={ui.common.loading} />}
      {error && <ErrorState onRetry={reload} />}
      {data && data.length === 0 && <EmptyState icon={Store} title={p.none} />}
      {data && data.length > 0 && (
        <ul className="space-y-3">
          {data.map((x) => (
            <li key={x.id} className="rounded-3xl border border-line bg-surface p-4 flex gap-4 items-center flex-wrap">
              <ShopImage path={x.images[0]} ratio="w-16 h-16" className="rounded-2xl shrink-0" />
              <div className="flex-1 min-w-[10rem]">
                <Link to={`/shopping/vendeur/produit/${x.id}?boutique=${shop.id}`} className="font-medium text-ink hover:text-coffee line-clamp-1">{x.title}</Link>
                <p className="text-xs text-ink-soft mt-0.5">{pivotMoney(x.price)} · {p.stock} : {x.stock}{x.variants.length ? ` · ${p.variants(x.variants.length)}` : ""}</p>
              </div>
              <StatusPill status={x.status === "active" ? "completed" : x.status === "draft" ? "processing" : "cancelled"} label={ui.common.productStatus[x.status]} />
              <div className="flex gap-3 text-xs">
                <Link to={`/shopping/vendeur/produit/${x.id}?boutique=${shop.id}`} className="text-coffee hover:underline">{p.edit}</Link>
                {x.status === "active"
                  ? <button onClick={() => act((t) => api.shop.seller.patchProduct(t, x.id, { status: "draft" }))} className="text-ink-soft hover:text-ink">{p.unpublish}</button>
                  : <button onClick={() => act((t) => api.shop.seller.patchProduct(t, x.id, { status: "active" }), null)} className="text-ink-soft hover:text-ink">{p.publish}</button>}
                <button onClick={() => window.confirm(p.deleteConfirm) && act((t) => api.shop.seller.deleteProduct(t, x.id))} aria-label={p.delete} className="text-ink-faint hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Commandes ---------- */
function Orders({ shop }) {
  const ui = useShopUi();
  const o = useSellerUi().dash.orders;
  const { lang } = useLanguage();
  const { pivotMoney } = useShopMoney();
  const { withAuth } = useUser();
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState("");
  const { data, loading, error, reload } = useLoad(() => withAuth((t) => api.shop.seller.orders(t, shop.id, status || undefined)), [shop.id, status]);
  async function act(code, fn, ok) {
    setBusy(code);
    try { await withAuth(fn); toast?.success?.(ok); reload(); } catch (e) { toast?.error?.(errMessage(e, ui.common.error)); } finally { setBusy(""); }
  }
  const filters = ["", "paid", "processing", "shipped", "delivered", "completed", "cancelled", "disputed"];
  const dt = (iso) => new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short" });
  return (
    <div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 mb-4">
        {filters.map((f) => <button key={f} onClick={() => setStatus(f)} aria-pressed={status === f} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm border ${status === f ? "bg-ink text-cream border-ink" : "border-line text-ink-soft hover:border-coffee-light"}`}>{f ? ui.common.orderStatus[f] : o.all}</button>)}
      </div>
      {loading && <Spinner label={ui.common.loading} />}
      {error && <ErrorState onRetry={reload} />}
      {data && data.length === 0 && <EmptyState icon={Store} title={o.none} />}
      <ul className="space-y-4">
        {data?.map((ord) => (
          <li key={ord.code} className="rounded-3xl border border-line bg-surface p-5">
            <div className="flex justify-between gap-3 flex-wrap">
              <div><p className="font-mono text-sm text-ink">{ord.code}</p><p className="text-xs text-ink-faint">{dt(ord.created_at)} · {o.buyer} : {ord.buyer_name || ord.recipient_name}</p></div>
              <StatusPill status={ord.status} label={ui.common.orderStatus[ord.status] || ord.status} />
            </div>
            <ul className="mt-4 space-y-2">
              {ord.items.map((i) => <li key={i.id} className="flex items-center gap-3 text-sm"><ShopImage path={i.image_path} ratio="w-10 h-10" className="rounded-lg shrink-0" /><span className="flex-1 min-w-0 truncate text-ink">{i.title}{i.variant_label ? ` · ${i.variant_label}` : ""} × {i.quantity}</span><span className="text-ink-soft">{pivotMoney(i.line_total)}</span></li>)}
            </ul>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm border-t border-line pt-4">
              <div><dt className="text-xs text-ink-faint">{o.total}</dt><dd className="text-ink">{pivotMoney(ord.total)}</dd></div>
              <div><dt className="text-xs text-ink-faint">{o.commission}</dt><dd className="text-ink-soft">− {pivotMoney(ord.commission_amount || 0)}</dd></div>
              <div><dt className="text-xs text-ink-faint">{o.net}</dt><dd className="font-medium text-ink">{pivotMoney(ord.seller_net || 0)}</dd></div>
            </dl>
            {["processing", "shipped"].includes(ord.status) && ord.agency && (
              <p className="mt-4 text-xs rounded-xl bg-latte-soft text-ink-soft p-3">{o.shipNote}<br />{o.dropAt} <strong className="text-ink">{ord.agency.name}</strong>, {ord.agency.city}{ord.tracking_code && <> · {o.tracking} <span className="font-mono text-ink">{ord.tracking_code}</span></>}</p>
            )}
            <div className="mt-4 flex gap-2 flex-wrap">
              {ord.status === "paid" && <button disabled={busy === ord.code} onClick={() => act(ord.code, (t) => api.shop.seller.accept(t, shop.id, ord.code), o.accepted)} className="rounded-full bg-ink text-cream text-xs font-medium px-4 py-2.5">{o.accept}</button>}
              {ord.status === "processing" && <button disabled={busy === ord.code} onClick={() => act(ord.code, (t) => api.shop.seller.ship(t, shop.id, ord.code), o.shipped)} className="rounded-full bg-ink text-cream text-xs font-medium px-4 py-2.5">{o.ship}</button>}
              {["paid", "processing"].includes(ord.status) && <button disabled={busy === ord.code} onClick={() => window.confirm(o.cancelConfirm) && act(ord.code, (t) => api.shop.seller.cancel(t, shop.id, ord.code), o.cancelled)} className="rounded-full border border-line text-ink-soft text-xs px-4 py-2.5 hover:text-red-600">{o.cancel}</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Avis ---------- */
function Reviews({ shop }) {
  const ui = useShopUi();
  const r = useSellerUi().dash.reviews;
  const { withAuth } = useUser();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => withAuth((t) => api.shop.seller.reviews(t, shop.id)), [shop.id]);
  const [open, setOpen] = useState(null);
  const [text, setText] = useState("");
  async function send(id) {
    try { await withAuth((t) => api.shop.seller.reply(t, shop.id, id, text)); setOpen(null); setText(""); reload(); } catch (e) { toast?.error?.(errMessage(e, ui.common.error)); }
  }
  if (loading) return <Spinner label={ui.common.loading} />;
  if (error) return <ErrorState onRetry={reload} />;
  if (!data.length) return <EmptyState icon={Store} title={r.none} />;
  return (
    <ul className="space-y-4">
      {data.map((x) => (
        <li key={x.id} className="rounded-3xl border border-line bg-surface p-5">
          <div className="flex justify-between gap-3"><p className="text-sm font-medium text-ink">{x.author_name} · {"★".repeat(x.rating)}<span className="text-line">{"★".repeat(5 - x.rating)}</span></p><p className="text-xs text-ink-faint">{x.product_title}</p></div>
          {x.comment && <p className="text-sm text-ink-soft mt-2">{x.comment}</p>}
          {x.seller_reply ? <p className="mt-3 text-sm bg-latte-soft rounded-xl p-3"><span className="text-xs text-coffee block mb-0.5">{r.replied}</span>{x.seller_reply}</p>
            : open === x.id ? (
              <div className="mt-3 space-y-2"><textarea className={`${fieldClass} resize-none`} rows={2} maxLength={800} value={text} onChange={(e) => setText(e.target.value)} placeholder={r.replyPlaceholder} /><button disabled={!text.trim()} onClick={() => send(x.id)} className="rounded-full bg-ink text-cream text-xs px-4 py-2 disabled:opacity-50">{r.send}</button></div>
            ) : <button onClick={() => { setOpen(x.id); setText(""); }} className="mt-3 text-xs text-coffee hover:underline">{r.reply}</button>}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Promotions ---------- */
function Promos({ shop }) {
  const ui = useShopUi();
  const p = useSellerUi().dash.promos;
  const { withAuth } = useUser();
  const toast = useToast();
  const { pivotMoney } = useShopMoney();
  const { data, loading, error, reload } = useLoad(() => withAuth((t) => api.shop.seller.coupons(t, shop.id)), [shop.id]);
  const [f, setF] = useState({ code: "", percent: "", amount: "", min_total: "", max_uses: "", expires_at: "" });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function create(e) {
    e.preventDefault(); setErr("");
    if (!f.percent && !f.amount) { setErr(p.errValue); return; }
    try {
      await withAuth((t) => api.shop.seller.createCoupon(t, shop.id, {
        code: f.code.trim().toUpperCase(), percent: f.percent ? Number(f.percent) : null, amount: f.amount ? Number(f.amount) : null,
        min_total: f.min_total ? Number(f.min_total) : 0, max_uses: f.max_uses ? Number(f.max_uses) : null, expires_at: f.expires_at ? new Date(f.expires_at).toISOString() : null,
      }));
      setF({ code: "", percent: "", amount: "", min_total: "", max_uses: "", expires_at: "" }); reload();
    } catch (e2) { setErr(errMessage(e2, ui.common.error)); }
  }
  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
      <div>
        {loading && <Spinner label={ui.common.loading} />}
        {error && <ErrorState onRetry={reload} />}
        {data && !data.length && <EmptyState icon={Store} title={p.none} />}
        <ul className="space-y-3">{data?.map((c) => (
          <li key={c.id} className="rounded-3xl border border-line bg-surface p-4 flex items-center justify-between gap-3">
            <div><p className="font-mono font-medium text-ink">{c.code}</p><p className="text-xs text-ink-soft">{c.percent ? `−${c.percent} %` : `− ${pivotMoney(c.amount)}`}{c.min_total ? ` · min ${pivotMoney(c.min_total)}` : ""} · {p.used(c.used)}{c.max_uses ? ` / ${c.max_uses}` : ""}</p></div>
            <button aria-label="delete" onClick={() => window.confirm(p.deleteConfirm) && withAuth((t) => api.shop.seller.deleteCoupon(t, shop.id, c.id)).then(reload)} className="text-ink-faint hover:text-red-600"><Trash2 size={16} /></button>
          </li>))}</ul>
      </div>
      <form onSubmit={create} className="rounded-3xl border border-line bg-surface p-5 space-y-3">
        <h3 className="font-display text-lg text-ink">{p.title}</h3>
        <p className="text-xs text-ink-soft">{p.hint}</p>
        <SField label={p.code}><input required minLength={3} maxLength={30} className={fieldClass} value={f.code} onChange={(e) => setF((x) => ({ ...x, code: e.target.value.toUpperCase() }))} /></SField>
        <div className="grid grid-cols-2 gap-3">
          <SField label={p.percent}><input type="number" min="1" max="90" className={fieldClass} value={f.percent} onChange={set("percent")} /></SField>
          <SField label={p.amount}><input type="number" min="0" step="0.01" className={fieldClass} value={f.amount} onChange={set("amount")} /></SField>
          <SField label={p.min}><input type="number" min="0" className={fieldClass} value={f.min_total} onChange={set("min_total")} /></SField>
          <SField label={p.maxUses}><input type="number" min="1" className={fieldClass} value={f.max_uses} onChange={set("max_uses")} /></SField>
        </div>
        <SField label={p.expires}><input type="date" className={fieldClass} value={f.expires_at} onChange={set("expires_at")} /></SField>
        {err && <p role="alert" className="text-xs text-red-600">{err}</p>}
        <button className="w-full rounded-full bg-ink text-cream text-sm font-medium py-3">{p.create}</button>
      </form>
    </div>
  );
}

/* ---------- Gains ---------- */
function Wallet({ shop }) {
  const ui = useShopUi();
  const w = useSellerUi().dash.wallet;
  const { withAuth } = useUser();
  const toast = useToast();
  const { pivotMoney } = useShopMoney();
  const wallet = useLoad(() => withAuth((t) => api.shop.seller.wallet(t, shop.id)), [shop.id]);
  const payouts = useLoad(() => withAuth((t) => api.shop.seller.payouts(t, shop.id)), [shop.id]);
  const [amount, setAmount] = useState("");
  const [operator, setOperator] = useState(shop.mobile_money_operator || OPERATORS[0].key);
  const [prefix, setPrefix] = useState(operatorByKey(operator).prefixes[0]);
  const [digits, setDigits] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const op = operatorByKey(operator);
  async function request(e) {
    e.preventDefault(); setErr("");
    if (!(Number(amount) > 0)) return setErr(ui.common.error);
    if ((digits || !shop.mobile_money_phone) && !phoneIsComplete(digits)) return setErr(ui.checkout.errNumber);
    setBusy(true);
    try {
      await withAuth((t) => api.shop.seller.requestPayout(t, shop.id, { amount: Number(amount), operator: digits ? operator : "", phone: digits ? buildPhone(prefix, digits) : "" }));
      toast?.success?.(w.requested); setAmount(""); wallet.reload(); payouts.reload();
    } catch (e2) { setErr(errMessage(e2, ui.common.error)); } finally { setBusy(false); }
  }
  if (wallet.loading) return <Spinner label={ui.common.loading} />;
  if (wallet.error) return <ErrorState onRetry={wallet.reload} />;
  const d = wallet.data;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label={w.available} value={pivotMoney(d.available)} tone="text-coffee" />
        <Stat label={w.pending} value={pivotMoney(d.pending)} />
        <Stat label={w.earned} value={pivotMoney(d.total_earned)} />
        <Stat label={w.paidOut} value={pivotMoney(d.total_paid_out)} />
      </div>
      <p className="text-sm text-ink-soft">{w.explain}</p>
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <form onSubmit={request} className="rounded-3xl border border-line bg-surface p-6 space-y-4">
          <h3 className="font-display text-lg text-ink">{w.request}</h3>
          <p className="text-xs text-ink-faint">{w.min(pivotMoney(d.min_payout))}</p>
          <SField label={w.amount}><input type="number" min="0" step="0.01" max={d.available} className={fieldClass} value={amount} onChange={(e) => setAmount(e.target.value)} /></SField>
          <div className="grid grid-cols-3 gap-2">{OPERATORS.map((o) => <button type="button" key={o.key} aria-pressed={operator === o.key} onClick={() => { setOperator(o.key); setPrefix(o.prefixes[0]); }} className={`rounded-xl border p-2.5 text-sm ${operator === o.key ? "border-coffee bg-latte-soft text-ink" : "border-line text-ink-soft"}`}>{o.label}</button>)}</div>
          <SField label={w.phone}>
            <div className="flex gap-2">
              {op.prefixes.length > 1 ? <select className={`${fieldClass} !w-24`} value={prefix} onChange={(e) => setPrefix(e.target.value)}>{op.prefixes.map((p) => <option key={p} value={p}>0{p}</option>)}</select> : <span className={`${fieldClass} !w-24 text-center`}>0{prefix}</span>}
              <input className={fieldClass} inputMode="numeric" maxLength={7} value={digits} onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder={shop.mobile_money_phone ? `(${shop.mobile_money_phone})` : "1234567"} />
            </div>
          </SField>
          {err && <p role="alert" className="text-xs text-red-600">{err}</p>}
          <button disabled={busy} className="w-full rounded-full bg-ink text-cream text-sm font-medium py-3.5 disabled:opacity-60">{w.request}</button>
        </form>
        <section className="rounded-3xl border border-line bg-surface p-6">
          <h3 className="font-display text-lg text-ink mb-4">{w.history}</h3>
          {!payouts.data?.length ? <p className="text-sm text-ink-faint">{w.none}</p> : (
            <ul className="divide-y divide-line">{payouts.data.map((p) => <li key={p.id} className="py-3 flex items-center justify-between gap-3 text-sm"><div><p className="text-ink">{pivotMoney(p.amount)}</p><p className="text-xs text-ink-faint font-mono">{p.reference}</p></div><StatusPill status={p.status === "paid" ? "completed" : p.status === "rejected" ? "cancelled" : "processing"} label={ui.common.payoutStatus[p.status]} /></li>)}</ul>
          )}
        </section>
      </div>
    </div>
  );
}

/* ---------- Ma boutique ---------- */
function ShopSettings({ shop, onSaved }) {
  const ui = useShopUi();
  const st = useSellerUi();
  const s = st.start;
  const { withAuth } = useUser();
  const toast = useToast();
  const { data: agencies } = useLoad(() => api.shop.agencies(), []);
  const [f, setF] = useState({ name: shop.name, tagline: shop.tagline, description: shop.description, city: shop.city, address: shop.address, phone: shop.phone, whatsapp: shop.whatsapp, email: shop.email, dispatch_agency_id: shop.dispatch_agency_id || "", mobile_money_operator: shop.mobile_money_operator || OPERATORS[0].key, mobile_money_phone: shop.mobile_money_phone || "" });
  const [logo, setLogo] = useState(null);
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  async function save(e) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      await withAuth((t) => api.shop.seller.updateShop(t, shop.id, { ...f, dispatch_agency_id: f.dispatch_agency_id ? Number(f.dispatch_agency_id) : null, ...(logo && { logo_path: logo }), ...(banner && { banner_path: banner }) }));
      toast?.success?.(st.dash.shop.saved); onSaved();
    } catch (e2) { setErr(errMessage(e2, ui.common.error)); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="rounded-3xl border border-line bg-surface p-6 sm:p-8 space-y-5 max-w-3xl">
      <h3 className="font-display text-xl text-ink">{st.dash.shop.title}</h3>
      <SField label={s.name}><input className={fieldClass} value={f.name} onChange={set("name")} maxLength={80} required minLength={2} /></SField>
      <SField label={s.tagline}><input className={fieldClass} value={f.tagline} onChange={set("tagline")} maxLength={140} /></SField>
      <SField label={s.description}><textarea className={`${fieldClass} resize-none`} rows={4} value={f.description} onChange={set("description")} maxLength={3000} /></SField>
      <div className="grid sm:grid-cols-2 gap-4">
        <SField label={s.city}><input className={fieldClass} value={f.city} onChange={set("city")} /></SField>
        <SField label={s.address}><input className={fieldClass} value={f.address} onChange={set("address")} /></SField>
        <SField label={s.phone}><input className={fieldClass} value={f.phone} onChange={set("phone")} /></SField>
        <SField label={s.whatsapp}><input className={fieldClass} value={f.whatsapp} onChange={set("whatsapp")} /></SField>
        <div className="sm:col-span-2"><SField label={s.email}><input className={fieldClass} type="email" value={f.email} onChange={set("email")} /></SField></div>
      </div>
      <div className="grid sm:grid-cols-2 gap-6">
        <div><p className="text-sm font-medium text-ink mb-2">{s.logo}</p><ImagePicker value={logo ?? shop.logo} onChange={setLogo} label={s.upload} hint={s.imageHint} /></div>
        <div><p className="text-sm font-medium text-ink mb-2">{s.banner}</p><ImagePicker value={banner ?? shop.banner} onChange={setBanner} label={s.upload} ratio="w-32 h-16" /></div>
      </div>
      <SField label={s.agency} hint={s.agencyHint}><select className={fieldClass} value={f.dispatch_agency_id} onChange={set("dispatch_agency_id")}><option value="">{s.noAgency}</option>{agencies?.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.city}</option>)}</select></SField>
      <div className="grid sm:grid-cols-2 gap-4">
        <SField label={s.operator}><select className={fieldClass} value={f.mobile_money_operator} onChange={set("mobile_money_operator")}>{OPERATORS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></SField>
        <SField label={s.number}><input className={fieldClass} inputMode="tel" value={f.mobile_money_phone} onChange={set("mobile_money_phone")} placeholder="0971234567" /></SField>
      </div>
      {err && <p role="alert" className="rounded-xl bg-red-500/10 text-red-700 dark:text-red-300 text-sm p-3">{err}</p>}
      <button disabled={busy} className="rounded-full bg-ink text-cream text-sm font-medium px-8 py-3.5 disabled:opacity-60 inline-flex items-center gap-2">{busy && <Loader2 size={15} className="animate-spin" />} {st.dash.shop.save}</button>
    </form>
  );
}

function Inner() {
  const ui = useShopUi();
  const st = useSellerUi();
  const d = st.dash;
  const { withAuth } = useUser();
  const [params, setParams] = useSearchParams();
  usePageMeta({ title: d.title });
  const { data: shops, loading, error, reload } = useLoad(() => withAuth((t) => api.shop.seller.shops(t)), []);
  const navigate = useNavigate();
  const shop = useMemo(() => {
    if (!shops?.length) return null;
    const id = Number(params.get("boutique"));
    return shops.find((s) => s.id === id) || shops[0];
  }, [shops, params]);
  const tab = TABS.includes(params.get("onglet")) ? params.get("onglet") : "overview";
  const go = (patch) => { const p = new URLSearchParams(params); Object.entries(patch).forEach(([k, v]) => p.set(k, v)); setParams(p, { replace: true }); };

  if (loading && !shops) return <ShopLayout><Spinner label={ui.common.loading} /></ShopLayout>;
  if (error) return <ShopLayout><ErrorState onRetry={reload} /></ShopLayout>;
  if (!shop) return <ShopLayout width="max-w-3xl"><EmptyState icon={Store} title={d.noShop} action={<Link to="/shopping/vendre" className="rounded-full bg-ink text-cream text-sm px-6 py-3">{d.createShop}</Link>} /></ShopLayout>;

  const banner = shop.status !== "approved" ? d.banner[shop.status] : null;
  return (
    <ShopLayout>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-center gap-4 min-w-0">
          <ShopImage path={shop.logo} ratio="w-14 h-14" className="rounded-2xl shrink-0" />
          <div className="min-w-0">
            {shops.length > 1 ? <select value={shop.id} onChange={(e) => go({ boutique: e.target.value })} aria-label="shop" className="font-display text-2xl text-ink bg-transparent focus:outline-none max-w-full">{shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select> : <h1 className="font-display text-2xl sm:text-3xl text-ink truncate">{shop.name}</h1>}
            <p className="text-xs text-ink-faint">{d.title}</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <StatusPill status={shop.status === "approved" ? "completed" : shop.status === "pending" ? "processing" : "cancelled"} label={ui.common.shopStatus[shop.status]} />
          {shop.status === "approved" && <Link to={`/shopping/boutique/${shop.slug}`} className="text-sm text-coffee inline-flex items-center gap-1 hover:underline">{d.viewShop} <ExternalLink size={13} /></Link>}
        </div>
      </div>
      {banner && <p role="status" className="flex gap-3 rounded-2xl bg-amber-500/10 text-amber-800 dark:text-amber-200 text-sm p-4 mb-6"><AlertTriangle size={18} className="shrink-0" /> <span>{banner}{shop.status_reason && <> {d.banner.reason} : {shop.status_reason}</>}</span></p>}
      <div role="tablist" className="flex gap-1 overflow-x-auto no-scrollbar border-b border-line mb-8">
        {TABS.map((k) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => go({ onglet: k })} className={`whitespace-nowrap px-4 py-3 text-sm border-b-2 -mb-px transition-colors ${tab === k ? "border-coffee text-ink font-medium" : "border-transparent text-ink-soft hover:text-ink"}`}>{d.tabs[k]}</button>)}
      </div>
      {tab === "overview" && <Overview shop={shop} />}
      {tab === "products" && <Products shop={shop} />}
      {tab === "orders" && <Orders shop={shop} />}
      {tab === "reviews" && <Reviews shop={shop} />}
      {tab === "promos" && <Promos shop={shop} />}
      {tab === "wallet" && <Wallet shop={shop} />}
      {tab === "shop" && <ShopSettings key={shop.id} shop={shop} onSaved={reload} />}
    </ShopLayout>
  );
}
export default function SellerDashboard() { return <AuthGate><Inner /></AuthGate>; }
