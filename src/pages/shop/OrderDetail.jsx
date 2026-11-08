import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ChevronLeft, Loader2, MapPin, ShieldCheck, Star } from "lucide-react";
import ShopLayout from "../../components/shop/ShopLayout.jsx";
import AuthGate from "../../components/shop/AuthGate.jsx";
import { ErrorState, EventTimeline, ShopImage, Spinner, StatusPill, StepBar, useShopUi } from "../../components/shop/Shared.jsx";
import { errMessage, useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { TRACK_STEPS } from "../../lib/shop.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const field = "w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink focus:outline-none focus:border-coffee focus:ring-2 focus:ring-coffee/15";

function ReviewBox({ order, item, onDone }) {
  const ui0 = useShopUi();
  const o = { ...ui0.orders, cancelBtn: ui0.common.cancel };
  const { withAuth } = useUser();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  if (item.reviewed) return <span className="text-xs text-emerald-700 dark:text-emerald-300">{o.reviewed}</span>;
  if (!open) return <button onClick={() => setOpen(true)} className="text-xs text-coffee hover:underline">{o.review}</button>;
  async function send() {
    setBusy(true);
    try {
      await withAuth((t) => api.shop.review(t, { order_code: order.code, product_id: item.product_id, rating, comment }));
      toast?.success?.(o.reviewThanks);
      onDone();
    } catch (e) { toast?.error?.(errMessage(e)); } finally { setBusy(false); }
  }
  return (
    <div className="mt-3 rounded-2xl bg-latte-soft p-4 w-full">
      <p className="text-sm font-medium text-ink mb-2">{o.reviewTitle}</p>
      <div className="flex gap-1 mb-3" role="radiogroup" aria-label={o.rating}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n}`} onClick={() => setRating(n)}><Star size={22} className={n <= rating ? "fill-latte text-latte" : "text-line"} /></button>
        ))}
      </div>
      <textarea className={`${field} resize-none`} rows={2} maxLength={1500} placeholder={o.comment} value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="mt-3 flex gap-2">
        <button onClick={send} disabled={busy} className="rounded-full bg-ink text-cream text-xs font-medium px-4 py-2 disabled:opacity-60">{busy ? <Loader2 size={13} className="animate-spin" /> : o.send}</button>
        <button onClick={() => setOpen(false)} className="text-xs text-ink-soft px-2">{o.cancelBtn}</button>
      </div>
    </div>
  );
}

function Inner() {
  const { code } = useParams();
  const ui = useShopUi();
  const o = ui.orders;
  const { lang } = useLanguage();
  const { withAuth } = useUser();
  const toast = useToast();
  const { pivotMoney } = useShopMoney();
  usePageMeta({ title: `${o.order} ${code}` });
  const { data: ord, loading, error, reload } = useLoad(() => withAuth((t) => api.shop.myOrder(t, code)), [code]);
  const [busy, setBusy] = useState("");
  const [panel, setPanel] = useState(""); // "" | "dispute"
  const [reason, setReason] = useState(o.reasons[0]);
  const [note, setNote] = useState("");
  const dt = (iso) => new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" });

  async function act(kind, fn, okMsg) {
    setBusy(kind);
    try { await withAuth(fn); toast?.success?.(okMsg); setPanel(""); reload(); }
    catch (e) { toast?.error?.(errMessage(e, ui.common.error)); }
    finally { setBusy(""); }
  }

  if (loading && !ord) return <ShopLayout width="max-w-4xl"><Spinner label={ui.common.loading} /></ShopLayout>;
  if (error || !ord) return <ShopLayout width="max-w-4xl"><ErrorState onRetry={reload} message={error?.status === 404 ? o.empty : undefined} /></ShopLayout>;

  const inFlow = TRACK_STEPS.includes(ord.status);
  return (
    <ShopLayout width="max-w-4xl">
      <Link to="/shopping/mes-commandes" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-coffee mb-5"><ChevronLeft size={16} /> {o.title}</Link>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-8">
        <div>
          <h1 className="font-display text-3xl text-ink">{o.order} <span className="font-mono text-2xl">{ord.code}</span></h1>
          <p className="text-sm text-ink-soft mt-1"><Link to={`/shopping/boutique/${ord.shop.slug}`} className="hover:text-coffee">{ord.shop.name}</Link> · {o.placed(dt(ord.created_at))}</p>
        </div>
        <StatusPill status={ord.status} label={ui.common.orderStatus[ord.status] || ord.status} />
      </div>

      {inFlow && <div className="rounded-3xl border border-line bg-surface p-6 mb-6"><StepBar status={ord.status} steps={TRACK_STEPS} labels={o.steps} /></div>}
      {ord.status === "disputed" && <p className="flex gap-3 rounded-2xl bg-amber-500/10 text-amber-800 dark:text-amber-200 text-sm p-4 mb-6"><AlertTriangle size={18} className="shrink-0" /> {o.disputeOpen}</p>}

      <div className="grid md:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-6">
          <section className="rounded-3xl border border-line bg-surface divide-y divide-line">
            {ord.items.map((i) => (
              <div key={i.id} className="p-5 flex gap-4 flex-wrap">
                <ShopImage path={i.image_path} ratio="w-16 h-16" className="rounded-2xl shrink-0" />
                <div className="flex-1 min-w-[10rem]">
                  {i.product_id ? <Link to={`/shopping/produit/${i.product_id}`} className="text-sm font-medium text-ink hover:text-coffee">{i.title}</Link> : <p className="text-sm font-medium text-ink">{i.title}</p>}
                  {i.variant_label && <p className="text-xs text-ink-faint">{i.variant_label}</p>}
                  <p className="text-xs text-ink-soft mt-1">{pivotMoney(i.unit_price)} × {i.quantity}</p>
                </div>
                <p className="text-sm text-ink">{pivotMoney(i.line_total)}</p>
                {["delivered", "completed"].includes(ord.status) && i.product_id && <div className="w-full"><ReviewBox order={ord} item={i} onDone={reload} /></div>}
              </div>
            ))}
            <dl className="p-5 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-soft">{ui.checkout.subtotal}</dt><dd>{pivotMoney(ord.subtotal)}</dd></div>
              {ord.discount > 0 && <div className="flex justify-between text-emerald-700 dark:text-emerald-300"><dt>{ui.checkout.discount}{ord.coupon_code ? ` (${ord.coupon_code})` : ""}</dt><dd>− {pivotMoney(ord.discount)}</dd></div>}
              <div className="flex justify-between"><dt className="text-ink-soft">{ui.checkout.delivery}</dt><dd>{ord.delivery_fee ? pivotMoney(ord.delivery_fee) : ui.common.free}</dd></div>
              <div className="flex justify-between border-t border-line pt-3"><dt className="font-medium text-ink">{ui.checkout.total}</dt><dd className="font-display text-xl text-ink">{pivotMoney(ord.total)}</dd></div>
            </dl>
          </section>

          <section className="rounded-3xl border border-line bg-surface p-6">
            <h2 className="font-display text-xl text-ink mb-5">{o.timeline}</h2>
            <EventTimeline events={ord.events} />
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-3xl border border-line bg-surface p-5 text-sm space-y-3">
            <p className="flex gap-2 text-ink"><MapPin size={16} className="text-coffee shrink-0 mt-0.5" /> <span><span className="block font-medium">{ui.common.delivery[ord.delivery_mode]}</span>
              {ord.agency && <span className="block text-ink-soft">{ord.delivery_mode === "agency_pickup" ? o.pickupAt : o.deliveryTo} {ord.agency.name}, {ord.agency.city}</span>}
              {ord.delivery_mode === "home_delivery" && <span className="block text-ink-soft">{ord.address}{ord.city ? `, ${ord.city}` : ""}</span>}</span></p>
            <p className="text-ink-soft">{ord.recipient_name} · {ord.recipient_phone}</p>
            {ord.tracking_code && <p className="text-ink-soft">{o.tracking} : <Link to={`/shopping/suivi?code=${ord.tracking_code}`} className="font-mono text-ink hover:text-coffee">{ord.tracking_code}</Link></p>}
          </section>

          <section className="rounded-3xl border border-line bg-surface p-5 text-sm">
            <p className="flex items-center gap-2 font-medium text-ink mb-1"><ShieldCheck size={16} className="text-coffee" /> {o.escrowTitle}</p>
            <p className="text-ink-soft">{ord.escrow_status === "released" ? o.escrowReleased : ord.escrow_status === "refunded" ? o.escrowRefunded : o.escrowHeld}</p>
            {ord.auto_release_at && <p className="text-xs text-ink-faint mt-2">{o.autoRelease(dt(ord.auto_release_at))}</p>}
          </section>

          {ord.can_confirm && (
            <section className="rounded-3xl bg-latte-soft p-5">
              <p className="text-xs text-ink-soft mb-3">{o.confirmText}</p>
              <button onClick={() => act("confirm", (t) => api.shop.confirmReceipt(t, ord.code), o.confirmed)} disabled={!!busy} className="w-full rounded-full bg-ink text-cream text-sm font-medium py-3.5 hover:bg-coffee-dark disabled:opacity-60 inline-flex items-center justify-center gap-2">{busy === "confirm" && <Loader2 size={15} className="animate-spin" />} {o.confirm}</button>
            </section>
          )}
          {ord.can_cancel && (
            <button onClick={() => window.confirm(o.cancelConfirm) && act("cancel", (t) => api.shop.cancelOrder(t, ord.code, ""), o.cancelled)} disabled={!!busy} className="w-full rounded-full border border-line text-ink text-sm py-3 hover:border-red-400 hover:text-red-600 disabled:opacity-60">{o.cancel}</button>
          )}
          {ord.can_dispute && (panel === "dispute" ? (
            <section className="rounded-3xl border border-line bg-surface p-5 space-y-3">
              <p className="font-medium text-ink text-sm">{o.disputeTitle}</p>
              <p className="text-xs text-ink-soft">{o.disputeHelp}</p>
              <label className="block text-xs text-ink-soft">{o.reason}<select value={reason} onChange={(e) => setReason(e.target.value)} className={`${field} mt-1`}>{o.reasons.map((r) => <option key={r}>{r}</option>)}</select></label>
              <label className="block text-xs text-ink-soft">{o.details}<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className={`${field} mt-1 resize-none`} /></label>
              <div className="flex gap-2">
                <button onClick={() => act("dispute", (t) => api.shop.dispute(t, ord.code, reason, note), o.disputeSent)} disabled={!!busy} className="rounded-full bg-ink text-cream text-xs font-medium px-4 py-2.5 disabled:opacity-60">{o.dispute}</button>
                <button onClick={() => setPanel("")} className="text-xs text-ink-soft px-2">{ui.common.cancel}</button>
              </div>
            </section>
          ) : <button onClick={() => setPanel("dispute")} className="w-full text-sm text-ink-soft hover:text-red-600 py-2">{o.dispute}</button>)}
          <p className="text-xs text-ink-faint">{o.help}</p>
        </aside>
      </div>
    </ShopLayout>
  );
}
export default function OrderDetail() { return <AuthGate><Inner /></AuthGate>; }
