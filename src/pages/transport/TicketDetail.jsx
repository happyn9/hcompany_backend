import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, Phone, Printer } from "lucide-react";
import TransportLayout, { BusyButton, Card, ErrorState, Field, Modal, RouteLine, Spinner, StatusPill, TicketQR, TransportAuthGate, inputCls, useTransportUi } from "../../components/transport/Shared.jsx";
import { errMessage, useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { fmtDay, fmtDateTime, ticketUsable } from "../../lib/transport.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

function Detail() {
  const { code } = useParams();
  const [params] = useSearchParams();
  const ui = useTransportUi();
  const t = ui.ticket;
  const { lang } = useLanguage();
  const { withAuth } = useUser();
  const toast = useToast();
  const { money } = useShopMoney();
  usePageMeta({ title: t.back });
  const { data: b, loading, error, reload } = useLoad(() => withAuth((tk) => api.transport.myBooking(tk, code)), [code]);
  const [modal, setModal] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [rating, setRating] = useState(5);

  if (loading) return <TransportLayout width="max-w-3xl"><Spinner label={ui.common.loading} /></TransportLayout>;
  if (error || !b) return <TransportLayout width="max-w-3xl"><ErrorState onRetry={reload} message={error?.status === 404 ? "—" : undefined} /></TransportLayout>;

  async function run(fn, done) {
    setBusy(true);
    try { await withAuth(fn); toast.success(done); setModal(""); setReason(""); setNote(""); reload(); } catch (e) { toast.error(errMessage(e, ui.common.err)); } finally { setBusy(false); }
  }
  const usable = ticketUsable(b.status);

  return (
    <TransportLayout width="max-w-3xl">
      <Link to="/transport/mes-billets" className="text-sm text-coffee hover:underline print:hidden">← {t.back}</Link>
      {params.get("new") && (
        <div className="mt-4 rounded-3xl bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 p-5 flex gap-3 print:hidden"><CheckCircle2 className="shrink-0" /><div><p className="font-medium">{ui.book.success}</p><p className="text-sm">{ui.book.successLead}</p></div></div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-ink">{b.origin} → {b.destination}</h1>
        <StatusPill status={b.status} />
      </div>
      <p className="text-sm text-ink-soft mt-1 capitalize">{fmtDay(b.departure_at, lang, { weekday: "long", day: "numeric", month: "long" })} · {ui.tickets.ref} <span className="font-mono">{b.code}</span></p>

      <Card className="mt-6"><RouteLine trip={{ departure_at: b.departure_at, arrival_at: b.arrival_at || b.departure_at, origin: b.origin, destination: b.destination, duration_minutes: b.arrival_at ? Math.round((new Date(b.arrival_at) - new Date(b.departure_at)) / 60000) : 0 }} /></Card>

      {b.status === "disputed" && <p className="mt-4 rounded-2xl bg-red-500/10 text-red-700 dark:text-red-300 text-sm p-4">{t.disputeOpen}</p>}
      {b.refund_amount > 0 && <p className="mt-4 rounded-2xl bg-latte-soft text-ink text-sm p-4">{t.refunded(money(b.refund_amount))}</p>}

      {usable && (
        <section className="mt-6 space-y-4" aria-label={t.passengers}>
          <div className="flex items-center justify-between"><h2 className="font-display text-xl text-ink">{t.passengers}</h2><button onClick={() => window.print()} className="print:hidden inline-flex items-center gap-1.5 text-sm text-coffee"><Printer size={15} />{t.download}</button></div>
          <p className="text-sm text-ink-soft print:hidden">{t.showQr}</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {b.passengers.map((p) => (
              <div key={p.id} className="rounded-3xl border border-line bg-surface p-5 flex flex-col items-center text-center break-inside-avoid">
                <p className="font-medium text-ink">{p.name}</p>
                <p className="text-xs text-ink-faint mb-3">{t.seat} <strong className="text-ink">{p.seat_number}</strong> · {b.origin} → {b.destination} · {fmtDateTime(b.departure_at, lang)}</p>
                <TicketQR code={p.ticket_code} />
                <p className="font-mono text-sm text-ink mt-3 tracking-wider" aria-label={t.code}>{p.ticket_code}</p>
                <p className={`text-xs mt-1 ${p.boarded ? "text-emerald-700 dark:text-emerald-300" : "text-ink-faint"}`}>{p.boarded ? t.boarded : t.notBoarded}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid sm:grid-cols-2 gap-4 mt-6">
        <Card>
          <h2 className="font-medium text-ink mb-3">{t.payment}</h2>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between"><dt className="text-ink-soft">{ui.common.seatsLabel || t.seatsLabel}</dt><dd>{b.seats}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">{ui.common.total}</dt><dd className="font-medium">{money(b.total)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-soft">{t.paid}</dt><dd className="text-right text-ink-soft">{t.escrow[b.escrow_status] || b.escrow_status}</dd></div>
          </dl>
        </Card>
        <Card>
          <h2 className="font-medium text-ink mb-3">{t.operator}</h2>
          <p className="text-ink">{b.operator_name}</p>
          <div className="mt-3 flex flex-wrap gap-2 print:hidden">
            {b.operator_phone && <a href={`tel:${b.operator_phone}`} className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm text-ink"><Phone size={14} />{t.call}</a>}
            {b.operator_whatsapp && <a href={`https://wa.me/${b.operator_whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="rounded-full border border-line px-4 py-2 text-sm text-ink">{t.whatsapp}</a>}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="font-medium text-ink mb-3">{t.timeline}</h2>
        <ol className="space-y-3">{b.events.map((e, i) => (
          <li key={i} className="flex gap-3 text-sm"><span className="mt-1.5 w-2 h-2 rounded-full bg-coffee shrink-0" /><div><p className="text-ink">{e.label}</p><p className="text-xs text-ink-faint">{fmtDateTime(e.created_at, lang)}{e.note ? ` · ${e.note}` : ""}</p></div></li>
        ))}</ol>
      </Card>

      <div className="mt-6 flex flex-wrap gap-3 print:hidden">
        {b.can_cancel && <button onClick={() => setModal("cancel")} className="rounded-full border border-line px-5 py-2.5 text-sm text-ink">{t.cancel}</button>}
        {b.can_dispute && <button onClick={() => setModal("dispute")} className="rounded-full border border-line px-5 py-2.5 text-sm text-ink">{t.dispute}</button>}
        {b.can_review && <button onClick={() => setModal("review")} className="rounded-full bg-ink text-cream px-5 py-2.5 text-sm">{t.review}</button>}
        {b.reviewed && <span className="text-sm text-ink-soft self-center">{t.reviewed}</span>}
      </div>

      {modal === "cancel" && (
        <Modal title={t.cancelTitle} onClose={() => setModal("")} closeLabel={ui.common.close}>
          <p className="text-sm text-ink-soft mb-4">{t.cancelRefund(b.refund_if_cancelled || 0, money(b.refund_if_cancelled || 0))}</p>
          <Field label={t.cancelReason}><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></Field>
          <div className="mt-5 flex gap-3 justify-end">
            <button onClick={() => setModal("")} className="rounded-full border border-line px-5 py-2.5 text-sm">{t.keep}</button>
            <BusyButton busy={busy} onClick={() => run((tk) => api.transport.cancel(tk, b.code, reason), t.cancel)} className="rounded-full bg-red-600 text-white px-5 py-2.5 text-sm">{t.cancelConfirm}</BusyButton>
          </div>
        </Modal>
      )}
      {modal === "dispute" && (
        <Modal title={t.disputeTitle} onClose={() => setModal("")} closeLabel={ui.common.close}>
          <Field label={t.disputeReason}><select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}><option value="">—</option>{t.disputeReasons.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
          <Field label={t.disputeNote} className="mt-3" hint={t.disputeHint}><textarea className={`${inputCls} resize-none`} rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="mt-5 flex justify-end"><BusyButton busy={busy} disabled={reason.length < 3} onClick={() => run((tk) => api.transport.dispute(tk, b.code, reason, note), t.disputeOpen)} className="rounded-full bg-ink text-cream px-5 py-2.5 text-sm">{t.disputeSend}</BusyButton></div>
        </Modal>
      )}
      {modal === "review" && (
        <Modal title={t.reviewTitle} onClose={() => setModal("")} closeLabel={ui.common.close}>
          <p className="text-sm text-ink mb-2">{t.rating}</p>
          <div className="flex gap-1 mb-4" role="radiogroup" aria-label={t.rating}>{[1, 2, 3, 4, 5].map((r) => <button key={r} type="button" role="radio" aria-checked={rating === r} aria-label={`${r}`} onClick={() => setRating(r)} className={`text-3xl ${r <= rating ? "text-latte" : "text-line"}`}>★</button>)}</div>
          <Field label={t.comment}><textarea className={`${inputCls} resize-none`} rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="mt-5 flex justify-end"><BusyButton busy={busy} onClick={() => run((tk) => api.transport.review(tk, { booking_code: b.code, rating, comment: note }), t.reviewed)} className="rounded-full bg-ink text-cream px-5 py-2.5 text-sm">{t.send}</BusyButton></div>
        </Modal>
      )}
    </TransportLayout>
  );
}

export default function TicketDetail() {
  return <TransportAuthGate width="max-w-3xl"><Detail /></TransportAuthGate>;
}
