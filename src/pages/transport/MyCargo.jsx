import { Package } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import TransportLayout, { Card, EmptyState, ErrorState, Spinner, StatusPill, TransportAuthGate, TicketQR, useTransportUi } from "../../components/transport/Shared.jsx";
import { useCargoUi } from "../../i18n/cargoUi.js";
import { errMessage, useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { fmtDateTime } from "../../lib/transport.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

function List() {
  const c = useCargoUi(); const m = c.mine; const ui = useTransportUi();
  const { lang } = useLanguage();
  const { withAuth } = useUser(); const toast = useToast(); const { money } = useShopMoney();
  const [params] = useSearchParams();
  usePageMeta({ title: m.title });
  const { data, loading, error, reload } = useLoad(() => withAuth((t) => api.transport.cargo.mine(t)), []);
  async function cancel(b) {
    if (!window.confirm(m.confirmCancel)) return;
    try { await withAuth((t) => api.transport.cargo.cancel(t, b.code)); toast.success(m.cancelled); reload(); } catch (x) { toast.error(errMessage(x, ui.common.err)); }
  }
  return (
    <TransportLayout width="max-w-3xl">
      <h1 className="font-display text-3xl text-ink mb-6">{m.title}</h1>
      {loading ? <Spinner label={ui.common.loading} /> : error ? <ErrorState onRetry={reload} /> : !data?.length ? <EmptyState icon={Package} title={m.empty} hint={m.emptyHint} /> : (
        <div className="space-y-4">{data.map((b) => (
          <Card key={b.code} className={params.get("new") === b.code ? "ring-2 ring-coffee" : ""}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="font-medium text-ink">{b.origin} → {b.destination} <StatusPill status={b.status} /></p><p className="text-xs text-ink-soft capitalize">{fmtDateTime(b.departure_at, lang)} · {b.operator_name} · {b.vehicle_label}</p></div>
              <p className="font-display text-xl text-ink">{money(b.total)}</p>
            </div>
            <dl className="grid sm:grid-cols-3 gap-3 text-sm mt-4">
              <div><dt className="text-ink-faint">{m.ref}</dt><dd className="text-ink font-mono">{b.code}</dd></div>
              <div><dt className="text-ink-faint">{m.receiver}</dt><dd className="text-ink">{b.receiver_name}</dd></div>
              <div><dt className="text-ink-faint">{m.weight}</dt><dd className="text-ink">{b.weight_kg} kg · {b.description}</dd></div>
              {b.current_location && <div><dt className="text-ink-faint">{m.where}</dt><dd className="text-ink">{b.current_location}</dd></div>}
            </dl>
            {b.delivery_code && ["confirmed", "in_transit"].includes(b.status) && (
              <div className="mt-4 flex items-center gap-4 rounded-2xl bg-latte-soft p-4">
                <TicketQR code={b.delivery_code} size={84} />
                <div><p className="text-xs text-ink-soft">{m.code}</p><p className="font-display text-3xl tracking-[0.3em] text-ink">{b.delivery_code}</p><p className="text-xs text-ink-faint max-w-xs">{m.codeHint}</p></div>
              </div>
            )}
            <details className="mt-4"><summary className="text-sm text-coffee cursor-pointer">{m.timeline}</summary>
              <ol className="mt-3 border-l border-line pl-4 space-y-2">{(b.events || []).map((ev, i) => <li key={i} className="text-xs"><span className="text-ink">{ev.label}</span>{ev.note && <span className="text-ink-soft"> — {ev.note}</span>}<span className="block text-ink-faint">{fmtDateTime(ev.created_at, lang)}</span></li>)}</ol>
            </details>
            {["pending_payment", "confirmed"].includes(b.status) && <button onClick={() => cancel(b)} className="mt-4 text-sm text-red-600 underline">{m.cancel}</button>}
          </Card>
        ))}</div>
      )}
    </TransportLayout>
  );
}
export default function MyCargo() { return <TransportAuthGate><List /></TransportAuthGate>; }
