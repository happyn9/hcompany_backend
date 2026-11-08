import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Clock, ExternalLink, MapPin, MessageCircle, Phone, Send, ShieldCheck, Star } from "lucide-react";
import LodgeLayout from "../../components/lodge/LodgeLayout.jsx";
import LodgeAuthGate from "../../components/lodge/AuthGate.jsx";
import { ErrorState, LodgeImage, LodgeStatusPill, Spinner, useLodgeUi } from "../../components/lodge/Shared.jsx";
import { EventTimeline } from "../../components/shop/Shared.jsx";
import { errMessage, useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { api } from "../../lib/api.js";
import { formatDay, formatRange, osmLink } from "../../lib/lodge.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const input = "w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-coffee focus:ring-2 focus:ring-coffee/15";

function Modal({ title, onClose, children }) {
  const ui = useLodgeUi().common;
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-black/50" aria-label={ui.close} onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-cream p-6 sm:p-8">
        <h2 className="font-display text-2xl text-ink mb-5">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Messages({ code }) {
  const t = useLodgeUi().trip;
  const { token, withAuth } = useUser();
  const [list, setList] = useState(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => withAuth((tk) => api.lodge.messages(tk, code)).then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, [code, token]); // eslint-disable-line react-hooks/exhaustive-deps
  async function send(e) {
    e.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      setList(await withAuth((tk) => api.lodge.sendMessage(tk, code, body.trim())));
      setBody("");
    } finally { setBusy(false); }
  }
  return (
    <section className="rounded-3xl border border-line bg-surface p-6">
      <h2 className="font-display text-xl text-ink mb-4 flex items-center gap-2"><MessageCircle size={18} className="text-coffee" /> {t.messages}</h2>
      <div className="space-y-3 max-h-80 overflow-y-auto mb-4">
        {list && list.length === 0 && <p className="text-sm text-ink-faint">{t.noMessages}</p>}
        {(list || []).map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : ""}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.mine ? "bg-ink text-cream" : "bg-latte-soft text-ink"}`}>
              <p className="whitespace-pre-line">{m.body}</p>
              <p className={`text-[0.65rem] mt-1 ${m.mine ? "text-cream/60" : "text-ink-faint"}`}>{m.mine ? t.you : t.host} · {new Date(m.created_at).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input className={input} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder={t.messagePlaceholder} aria-label={t.messagePlaceholder} />
        <button type="submit" disabled={!body.trim() || busy} className="rounded-xl bg-ink text-cream px-4 disabled:opacity-40" aria-label={t.send}><Send size={16} /></button>
      </form>
    </section>
  );
}

function Content() {
  const { code } = useParams();
  const ui = useLodgeUi();
  const t = ui.trip;
  const { lang } = useLanguage();
  const { token, withAuth } = useUser();
  const toast = useToast();
  const { money } = useShopMoney();
  const { data: b, loading, error, reload } = useLoad(() => api.lodge.myBooking(token, code), [token, code]);
  usePageMeta({ title: b ? b.property.title : "H-Logement" });
  const [modal, setModal] = useState(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [rating, setRating] = useState(5);
  const [sub, setSub] = useState({ cleanliness: 0, accuracy: 0, location: 0, value: 0 });
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const close = () => { setModal(null); setFormError(""); setReason(""); setNote(""); setComment(""); };
  async function run(fn, okMsg) {
    setBusy(true);
    setFormError("");
    try {
      await withAuth(fn);
      toast?.success?.(okMsg);
      close();
      reload();
    } catch (e) {
      setFormError(errMessage(e, ui.common.error));
    } finally { setBusy(false); }
  }

  if (loading && !b) return <LodgeLayout><Spinner label={ui.common.loading} /></LodgeLayout>;
  if (error) return <LodgeLayout width="max-w-2xl">{error.status === 404 ? <ErrorState message={t.notFound} /> : <ErrorState onRetry={reload} />}</LodgeLayout>;
  if (!b) return null;

  const revealed = !!b.address;
  const policy = ui.policy[b.policy];
  const wa = (b.host_whatsapp || b.host_phone || "").replace(/\D/g, "");
  const waNumber = wa.startsWith("0") ? `260${wa.slice(1)}` : wa;
  const escrow = { held: t.escrowHeld, released: t.escrowReleased, refunded: t.escrowRefunded }[b.escrow_status];

  return (
    <LodgeLayout width="max-w-5xl">
      <Link to="/logement/mes-sejours" className="text-sm text-coffee hover:underline">← {t.back}</Link>
      <div className="mt-4 mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-ink">{b.property.title}</h1>
          <p className="text-sm text-ink-soft mt-1">{formatRange(b.check_in, b.check_out, lang)} · {ui.common.night(b.nights)} · <span className="font-mono">{b.code}</span></p>
        </div>
        <LodgeStatusPill status={b.status} />
      </div>

      {b.status === "pending_host" && b.host_deadline && (
        <p className="mb-6 rounded-2xl bg-amber-500/10 text-amber-800 dark:text-amber-200 text-sm px-4 py-3 flex gap-2"><Clock size={16} className="shrink-0 mt-0.5" />{t.waiting(new Date(b.host_deadline + "Z").toLocaleString(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</p>
      )}
      {["declined", "expired", "cancelled_host", "cancelled_guest"].includes(b.status) && b.cancel_reason && (
        <p className="mb-6 rounded-2xl bg-red-500/10 text-red-700 dark:text-red-300 text-sm px-4 py-3">{b.cancel_reason}{b.refund_amount > 0 ? ` — ${t.refunded(money(b.refund_amount))}` : ""}</p>
      )}

      <div className="grid lg:grid-cols-[1fr_360px] gap-8 items-start">
        <div className="space-y-6 min-w-0">
          <section className="rounded-3xl border border-line bg-surface p-6">
            <div className="flex gap-4">
              <LodgeImage path={b.property.image} alt={b.property.title} ratio="w-28 h-24" className="rounded-2xl shrink-0" />
              <div className="min-w-0">
                <Link to={`/logement/s/${b.property.slug}`} className="font-medium text-ink hover:underline">{b.property.title}</Link>
                <p className="text-sm text-ink-soft">{ui.types[b.property.type]} · {b.property.city}</p>
              </div>
            </div>
            <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-4 mt-6 text-sm">
              <div><dt className="text-ink-faint">{t.checkIn}</dt><dd className="text-ink mt-0.5">{formatDay(b.check_in, lang, { weekday: "long", day: "numeric", month: "long" })}{b.check_in_from ? ` · ${b.check_in_from}` : ""}</dd></div>
              <div><dt className="text-ink-faint">{t.checkOut}</dt><dd className="text-ink mt-0.5">{formatDay(b.check_out, lang, { weekday: "long", day: "numeric", month: "long" })}{b.check_out_until ? ` · ${b.check_out_until}` : ""}</dd></div>
              <div><dt className="text-ink-faint">{t.guests}</dt><dd className="text-ink mt-0.5">{ui.common.guests(b.guests)}{b.units > 1 ? ` · ${ui.common.rooms(b.units)}` : ""}</dd></div>
              {b.arrival_time && <div><dt className="text-ink-faint">{ui.book.arrival}</dt><dd className="text-ink mt-0.5">{b.arrival_time}</dd></div>}
            </dl>
          </section>

          <section className="rounded-3xl border border-line bg-surface p-6">
            <h2 className="font-display text-xl text-ink mb-4">{t.hostContact}</h2>
            {revealed ? (
              <>
                <p className="text-sm text-ink mb-1">{b.host_name}</p>
                <p className="text-sm text-ink-soft flex gap-2 mb-4"><MapPin size={15} className="text-coffee shrink-0 mt-0.5" /> {b.address}</p>
                <div className="flex flex-wrap gap-2">
                  {b.host_phone && <a href={`tel:${b.host_phone}`} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm text-ink hover:border-coffee-light"><Phone size={14} /> {t.call}</a>}
                  {waNumber && <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm text-ink hover:border-coffee-light"><MessageCircle size={14} /> {t.whatsapp}</a>}
                  {b.latitude != null && <a href={osmLink(b.latitude, b.longitude)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm text-ink hover:border-coffee-light"><ExternalLink size={14} /> {t.directions}</a>}
                </div>
                {b.house_rules && <div className="mt-5 border-t border-line pt-4"><p className="text-sm font-medium text-ink mb-1">{t.houseRules}</p><p className="text-sm text-ink-soft whitespace-pre-line">{b.house_rules}</p></div>}
              </>
            ) : <p className="text-sm text-ink-soft">{t.addressLocked}</p>}
          </section>

          {["pending_host", "confirmed", "checked_in", "completed", "disputed"].includes(b.status) && <Messages code={b.code} />}

          <section className="rounded-3xl border border-line bg-surface p-6">
            <h2 className="font-display text-xl text-ink mb-5">{t.timeline}</h2>
            <EventTimeline events={b.events} />
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-28">
          <section className="rounded-3xl border border-line bg-surface p-6">
            <h2 className="font-display text-xl text-ink mb-4">{t.priceDetails}</h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between"><dt className="text-ink-soft">{t.nights} ({b.nights})</dt><dd>{money(b.nightly_total)}</dd></div>
              {b.discount > 0 && <div className="flex justify-between text-emerald-700 dark:text-emerald-300"><dt>{t.discount}</dt><dd>− {money(b.discount)}</dd></div>}
              {b.cleaning_fee > 0 && <div className="flex justify-between"><dt className="text-ink-soft">{t.cleaning}</dt><dd>{money(b.cleaning_fee)}</dd></div>}
              <div className="flex justify-between items-baseline border-t border-line pt-3"><dt className="font-medium text-ink">{t.total}</dt><dd className="font-display text-2xl text-ink">{money(b.total)}</dd></div>
            </dl>
            {escrow && <p className="mt-4 text-xs text-ink-soft flex gap-2"><ShieldCheck size={14} className="text-coffee shrink-0 mt-0.5" /> {escrow}</p>}
            {b.refund_amount > 0 && <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{t.refunded(money(b.refund_amount))}</p>}
            {policy && <div className="mt-4 border-t border-line pt-4"><p className="text-xs font-medium text-ink">{t.policy} · {policy.label}</p><p className="text-xs text-ink-soft mt-1">{policy.text}</p></div>}
          </section>

          <div className="space-y-3">
            {b.can_review && <button onClick={() => setModal("review")} className="w-full rounded-full bg-ink text-cream text-sm font-medium py-3.5 hover:bg-coffee-dark inline-flex items-center justify-center gap-2"><Star size={15} /> {t.review}</button>}
            {b.reviewed && <p className="text-center text-xs text-ink-faint">{t.reviewDone}</p>}
            {b.can_dispute && <button onClick={() => setModal("dispute")} className="w-full rounded-full border border-line text-ink text-sm font-medium py-3.5 hover:border-coffee-light">{t.dispute}</button>}
            {b.can_cancel && <button onClick={() => setModal("cancel")} className="w-full rounded-full border border-line text-red-700 dark:text-red-300 text-sm font-medium py-3.5 hover:border-red-500/50">{t.cancel}</button>}
            {["completed", "cancelled_guest", "declined", "expired", "cancelled_host"].includes(b.status) && <Link to={`/logement/s/${b.property.slug}`} className="block text-center w-full rounded-full border border-line text-ink text-sm font-medium py-3.5 hover:border-coffee-light">{t.rebook}</Link>}
          </div>
        </aside>
      </div>

      {modal === "cancel" && (
        <Modal title={t.cancelTitle} onClose={close}>
          <p className="text-sm text-ink-soft mb-4">{b.refund_if_cancelled > 0 ? t.cancelRefund(money(b.refund_if_cancelled)) : t.cancelNoRefund}</p>
          <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="why">{t.cancelReason}</label>
          <textarea id="why" className={`${input} resize-none`} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          {formError && <p role="alert" className="text-sm text-red-600 mt-3">{formError}</p>}
          <div className="mt-6 flex gap-3">
            <button onClick={close} className="flex-1 rounded-full border border-line text-ink text-sm font-medium py-3.5">{t.keep}</button>
            <button disabled={busy} onClick={() => run((tk) => api.lodge.cancel(tk, b.code, reason), t.cancelled)} className="flex-1 rounded-full bg-red-600 text-white text-sm font-medium py-3.5 disabled:opacity-50">{t.cancelConfirm}</button>
          </div>
        </Modal>
      )}

      {modal === "dispute" && (
        <Modal title={t.disputeTitle} onClose={close}>
          <p className="text-sm text-ink-soft mb-4">{t.disputeLead}</p>
          <fieldset className="mb-4">
            <legend className="text-sm font-medium text-ink mb-2">{t.disputeReason}</legend>
            <div className="space-y-2">
              {t.disputeReasons.map((r) => (
                <label key={r} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm cursor-pointer ${reason === r ? "border-coffee bg-latte-soft" : "border-line"}`}>
                  <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="accent-[var(--color-coffee)]" /> {r}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="dnote">{t.disputeNote}</label>
          <textarea id="dnote" className={`${input} resize-none`} rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          {formError && <p role="alert" className="text-sm text-red-600 mt-3">{formError}</p>}
          <button disabled={busy || !reason} onClick={() => run((tk) => api.lodge.dispute(tk, b.code, reason, note), t.disputed)} className="mt-6 w-full rounded-full bg-ink text-cream text-sm font-medium py-3.5 disabled:opacity-50">{t.disputeSend}</button>
        </Modal>
      )}

      {modal === "review" && (
        <Modal title={t.reviewTitle} onClose={close}>
          <p className="text-sm font-medium text-ink mb-2">{t.reviewOverall}</p>
          <div className="flex gap-1 mb-5" role="radiogroup" aria-label={t.reviewOverall}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n}`} onClick={() => setRating(n)}><Star size={30} className={n <= rating ? "fill-latte text-latte" : "text-line"} /></button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-5">
            {["cleanliness", "accuracy", "location", "value"].map((k) => (
              <div key={k}>
                <p className="text-xs text-ink-soft mb-1">{ui.property.ratings[k]}</p>
                <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${ui.property.ratings[k]} ${n}`} onClick={() => setSub((s) => ({ ...s, [k]: n }))}><Star size={18} className={n <= sub[k] ? "fill-latte text-latte" : "text-line"} /></button>)}</div>
              </div>
            ))}
          </div>
          <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="cm">{t.reviewComment}</label>
          <textarea id="cm" className={`${input} resize-none`} rows={4} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
          {formError && <p role="alert" className="text-sm text-red-600 mt-3">{formError}</p>}
          <button disabled={busy} onClick={() => run((tk) => api.lodge.review(tk, { booking_code: b.code, rating, ...sub, comment }), t.reviewed)} className="mt-6 w-full rounded-full bg-ink text-cream text-sm font-medium py-3.5 disabled:opacity-50">{t.reviewSend}</button>
        </Modal>
      )}
    </LodgeLayout>
  );
}

export default function TripDetail() {
  const ui = useLodgeUi();
  return <LodgeAuthGate message={ui.trips.signIn}><Content /></LodgeAuthGate>;
}
