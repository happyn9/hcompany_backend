import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Star } from "lucide-react";
import RestoLayout, { EmptyState, ErrorState, Modal, RestoAuthGate, Spinner, StatusPill, useRestoUi, inputCls } from "../../components/restaurant/Shared.jsx";
import { useLoad, useShopMoney, errMessage } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { fmtDay, isoToday } from "../../lib/resto.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

function ReviewModal({ x, onClose, onDone }) {
  const ui = useRestoUi();
  const m = ui.mine;
  const { withAuth } = useUser();
  const toast = useToast();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try { await withAuth((t) => api.resto.review(t, x.code, { rating, comment })); toast?.success?.(m.thanks); onDone(); } catch (e) { toast?.error?.(errMessage(e, ui.common.error)); } finally { setBusy(false); }
  }
  return (
    <Modal title={`${m.review} — ${x.restaurant_name}`} onClose={onClose} closeLabel={ui.common.close}>
      <p className="text-sm font-medium text-ink mb-2">{m.rate}</p>
      <div className="flex gap-1 mb-5">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setRating(n)} aria-label={`${n}`} aria-pressed={rating === n}><Star size={28} className={n <= rating ? "fill-latte text-latte" : "text-line"} /></button>)}</div>
      <textarea rows={4} maxLength={600} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={m.comment} className={`${inputCls} mb-5`} />
      <button disabled={busy} onClick={send} className="w-full rounded-full bg-ink text-cream text-sm font-medium py-3.5 disabled:opacity-50">{m.send}</button>
    </Modal>
  );
}

function Row({ x, onCancel, onReview }) {
  const ui = useRestoUi();
  const { lang } = useLanguage();
  const { money } = useShopMoney();
  const m = ui.mine;
  const upcoming = ["pending", "confirmed"].includes(x.status);
  return (
    <li className="rounded-3xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to={`/restaurant/r/${x.restaurant_slug || ""}`.replace(/\/$/, "")} className="font-display text-lg text-ink hover:underline">{x.restaurant_name}</Link>
          <p className="text-sm text-ink-soft mt-1">{fmtDay(x.day, lang)} · {x.time} · {x.party_size} {x.party_size > 1 ? ui.common.people : ui.common.person}{x.table_label ? ` · ${m.table} ${x.table_label}` : ""}</p>
          <p className="text-xs text-ink-faint mt-1 font-mono">{x.code}</p>
        </div>
        <StatusPill status={x.status} />
      </div>
      {x.preorder?.length > 0 && <p className="text-sm text-ink-soft mt-3">{x.preorder.map((l) => `${l.qty}× ${l.name}`).join(", ")} · {money(x.preorder_total)}</p>}
      {x.decline_reason && <p className="text-sm text-red-600 mt-2">{m.declined} : {x.decline_reason}</p>}
      <div className="flex gap-3 mt-4">
        {upcoming && <button onClick={() => onCancel(x)} className="rounded-full border border-line px-4 py-2 text-sm hover:border-red-300 hover:text-red-600">{m.cancel}</button>}
        {x.status === "completed" && (x.reviewed ? <span className="text-sm text-ink-faint self-center">{m.reviewed}</span> : <button onClick={() => onReview(x)} className="rounded-full bg-ink text-cream px-4 py-2 text-sm">{m.review}</button>)}
      </div>
    </li>
  );
}

function Inner() {
  const ui = useRestoUi();
  const m = ui.mine;
  usePageMeta({ title: `${m.title} · H-Restaurant` });
  const { withAuth } = useUser();
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => withAuth((t) => api.resto.mine(t)), []);
  const [review, setReview] = useState(null);
  async function cancel(x) {
    if (!window.confirm(m.cancelConfirm)) return;
    try { await withAuth((t) => api.resto.cancel(t, x.code)); toast?.success?.(m.cancelled); reload(); } catch (e) { toast?.error?.(errMessage(e, ui.common.error)); }
  }
  const today = isoToday();
  const up = (data || []).filter((x) => ["pending", "confirmed", "seated"].includes(x.status) && x.day >= today).sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
  const past = (data || []).filter((x) => !up.includes(x));
  return (
    <RestoLayout width="max-w-3xl">
      <h1 className="font-display text-3xl text-ink mb-8">{m.title}</h1>
      {loading && !data ? <Spinner label={ui.common.loading} /> : error && !data ? <ErrorState onRetry={reload} /> : !data.length ? (
        <EmptyState icon={CalendarDays} title={m.empty} hint={m.emptyHint} action={<Link to="/restaurant/recherche" className="rounded-full bg-ink text-cream text-sm px-6 py-3">{m.find}</Link>} />
      ) : (
        <div className="space-y-10">
          {up.length > 0 && <section><h2 className="text-sm uppercase tracking-wider text-ink-faint mb-3">{m.upcoming}</h2><ul className="space-y-4">{up.map((x) => <Row key={x.code} x={x} onCancel={cancel} onReview={setReview} />)}</ul></section>}
          {past.length > 0 && <section><h2 className="text-sm uppercase tracking-wider text-ink-faint mb-3">{m.past}</h2><ul className="space-y-4">{past.map((x) => <Row key={x.code} x={x} onCancel={cancel} onReview={setReview} />)}</ul></section>}
        </div>
      )}
      {review && <ReviewModal x={review} onClose={() => setReview(null)} onDone={() => { setReview(null); reload(); }} />}
    </RestoLayout>
  );
}

export default function MyReservations() { return <RestoAuthGate><Inner /></RestoAuthGate>; }
