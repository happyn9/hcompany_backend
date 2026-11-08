import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Package, Search, Truck } from "lucide-react";
import TransportLayout, { BusyButton, Card, EmptyState, ErrorState, Field, Spinner, StatusPill, inputCls, useTransportMeta, useTransportUi } from "../../components/transport/Shared.jsx";
import { useCargoUi } from "../../i18n/cargoUi.js";
import { useLoad, useShopMoney } from "../../data/shop.js";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { fmtDateTime } from "../../lib/transport.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

export function TripRow({ trip, money, c, lang }) {
  const k = c.kinds[trip.vehicle.kind] || trip.vehicle.kind;
  return (
    <Card className="flex flex-wrap items-center gap-4">
      <span className="w-12 h-12 rounded-2xl bg-latte-soft text-coffee flex items-center justify-center shrink-0"><Truck size={22} /></span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{trip.origin} → {trip.destination}</p>
        <p className="text-xs text-ink-soft">{k} · {c.cap(trip.vehicle.capacity_kg, trip.vehicle.capacity_m3)}{trip.vehicle.refrigerated ? ` · ${c.cold}` : ""} · {trip.operator_name}</p>
        <p className="text-xs text-ink-faint capitalize">{c.departs} {fmtDateTime(trip.departure_at, lang)} · {Math.round(trip.kg_left)} {c.kgLeft}</p>
      </div>
      <div className="text-right">
        <p className="font-display text-xl text-ink">{money(trip.price_per_kg)}</p><p className="text-xs text-ink-faint">{c.perKg}</p>
      </div>
      {trip.bookable ? <Link to={`/transport/colis/${trip.id}`} className="rounded-full bg-ink text-cream text-sm px-5 py-2.5">{c.book}</Link> : <StatusPill status="cancelled" toneOverride="muted" />}
    </Card>
  );
}

export default function CargoHome() {
  const c = useCargoUi();
  const ui = useTransportUi();
  const { lang } = useLanguage();
  const { money } = useShopMoney();
  const { cities } = useTransportMeta();
  const navigate = useNavigate();
  usePageMeta({ title: c.title });
  const [q, setQ] = useState({ origin: "", destination: "", kind: "" });
  const [applied, setApplied] = useState(q);
  const [ref, setRef] = useState("");
  const [tracked, setTracked] = useState(null);
  const [trErr, setTrErr] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: meta } = useLoad(() => api.transport.cargo.meta(), []);
  const { data, loading, error, reload } = useLoad(() => api.transport.cargo.search(Object.fromEntries(Object.entries(applied).filter(([, v]) => v))), [applied.origin, applied.destination, applied.kind]);
  async function track(e) {
    e.preventDefault(); setTrErr(""); setTracked(null); setBusy(true);
    try { setTracked(await api.transport.cargo.track(ref.trim().toUpperCase())); } catch { setTrErr(c.notFound); } finally { setBusy(false); }
  }
  const set = (k) => (e) => setQ((s) => ({ ...s, [k]: e.target.value }));
  return (
    <TransportLayout>
      <div className="mb-8"><h1 className="font-display text-4xl text-ink mb-2">{c.title}</h1><p className="text-ink-soft max-w-2xl">{c.lead}</p></div>
      <form onSubmit={(e) => { e.preventDefault(); setApplied(q); }} className="rounded-3xl border border-line bg-surface p-5 grid sm:grid-cols-4 gap-3 items-end mb-8">
        <Field label={c.from}><input list="cg-cities" className={inputCls} value={q.origin} onChange={set("origin")} /></Field>
        <Field label={c.to}><input list="cg-cities" className={inputCls} value={q.destination} onChange={set("destination")} /></Field>
        <Field label={c.kind}><select className={inputCls} value={q.kind} onChange={set("kind")}><option value="">{c.allKinds}</option>{(meta?.kinds || []).map((k) => <option key={k.key} value={k.key}>{c.kinds[k.key] || k.key}</option>)}</select></Field>
        <button className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3 inline-flex items-center justify-center gap-2"><Search size={16} />{c.search}</button>
        <datalist id="cg-cities">{cities.map((x) => <option key={x} value={x} />)}</datalist>
      </form>
      <div className="grid lg:grid-cols-[1fr_340px] gap-8 items-start">
        <div className="space-y-3">
          {loading ? <Spinner label={ui.common.loading} /> : error ? <ErrorState onRetry={reload} /> : !data?.length ? <EmptyState icon={Package} title={c.none} hint={c.noneHint} /> : (
            <>
              <p className="text-sm text-ink-soft">{c.results(data.length)}</p>
              {data.map((t) => <TripRow key={t.id} trip={t} money={money} c={c} lang={lang} />)}
            </>
          )}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-36">
          <Card>
            <h2 className="font-display text-xl text-ink mb-1">{c.track}</h2><p className="text-xs text-ink-soft mb-4">{c.trackHint}</p>
            <form onSubmit={track} className="flex gap-2"><input required className={`${inputCls} uppercase`} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="HC-A1B2C3" /><BusyButton busy={busy} className="rounded-full bg-ink text-cream text-sm px-4">{c.trackBtn}</BusyButton></form>
            {trErr && <p role="alert" className="text-xs text-red-600 mt-2">{trErr}</p>}
            {tracked && (
              <div className="mt-4 text-sm">
                <p className="text-ink font-medium">{tracked.origin} → {tracked.destination} <StatusPill status={tracked.status} /></p>
                {tracked.current_location && <p className="text-xs text-ink-soft mt-1">{c.mine.where} : {tracked.current_location}</p>}
                <ol className="mt-3 border-l border-line pl-4 space-y-2">{(tracked.events || []).map((ev, i) => <li key={i} className="text-xs"><span className="text-ink">{ev.label}</span><span className="block text-ink-faint">{fmtDateTime(ev.created_at, lang)}</span></li>)}</ol>
              </div>
            )}
          </Card>
          <Link to="/transport/mes-colis" onClick={() => navigate("/transport/mes-colis")} className="block text-center rounded-full border border-line text-sm text-ink py-3">{c.mine.title}</Link>
        </aside>
      </div>
    </TransportLayout>
  );
}
