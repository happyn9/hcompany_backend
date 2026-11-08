import { Suspense, lazy, useState } from "react";
import { Plus, Truck } from "lucide-react";
import { BusyButton, Card, EmptyState, ErrorState, Field, Modal, Spinner, StatusPill, inputCls, useTransportMeta, useTransportUi } from "./Shared.jsx";
import { useCargoUi } from "../../i18n/cargoUi.js";
import { errMessage, useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { addDays, fmtDateTime, fromLocalInput, toLocalInput, todayISO } from "../../lib/transport.js";

function useCall() {
  const { withAuth } = useUser(); const toast = useToast(); const ui = useTransportUi();
  return async (fn, ok) => { try { const r = await withAuth(fn); if (ok) toast.success(ok); return r ?? true; } catch (x) { toast.error(errMessage(x, ui.common.err)); return null; } };
}

function VehicleModal({ onClose, onSaved }) {
  const c = useCargoUi(); const o = c.op; const ui = useTransportUi();
  const call = useCall();
  const { data: meta } = useLoad(() => api.transport.cargo.meta(), []);
  const [v, setV] = useState({ kind: "canter", name: "", plate: "", capacity_kg: 3000, capacity_m3: 18, refrigerated: false });
  const [busy, setBusy] = useState(false);
  const pick = (k) => { const m = (meta?.kinds || []).find((x) => x.key === k); setV((s) => ({ ...s, kind: k, ...(m ? { capacity_kg: m.kg, capacity_m3: m.m3 } : {}) })); };
  async function submit(e) {
    e.preventDefault(); setBusy(true);
    const r = await call((t) => api.transport.operator.cargo.createVehicle(t, { ...v, capacity_kg: Number(v.capacity_kg), capacity_m3: Number(v.capacity_m3) }), o.saved);
    setBusy(false); if (r) onSaved();
  }
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Modal title={o.addVehicle} onClose={onClose} closeLabel={ui.common.close}>
      <form onSubmit={submit} className="space-y-4 grid sm:grid-cols-2 gap-x-3">
        <Field label={c.kind}><select className={inputCls} value={v.kind} onChange={(e) => pick(e.target.value)}>{Object.entries(c.kinds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label={o.name}><input className={inputCls} value={v.name} onChange={set("name")} maxLength={60} /></Field>
        <Field label={o.plate}><input required minLength={3} className={`${inputCls} uppercase`} value={v.plate} onChange={set("plate")} /></Field>
        <label className="flex items-center gap-2 text-sm text-ink pt-7"><input type="checkbox" className="accent-coffee" checked={v.refrigerated} onChange={(e) => setV((s) => ({ ...s, refrigerated: e.target.checked }))} />{o.refrigerated}</label>
        <Field label={o.capKg}><input required type="number" min="1" className={inputCls} value={v.capacity_kg} onChange={set("capacity_kg")} /></Field>
        <Field label={o.capM3}><input required type="number" min="1" step="any" className={inputCls} value={v.capacity_m3} onChange={set("capacity_m3")} /></Field>
        <div className="sm:col-span-2 flex justify-end"><BusyButton busy={busy} className="rounded-full bg-ink text-cream text-sm px-6 py-3">{o.save}</BusyButton></div>
      </form>
    </Modal>
  );
}

function TripModal({ vehicles, onClose, onSaved }) {
  const c = useCargoUi(); const o = c.op; const ui = useTransportUi();
  const call = useCall();
  const { cities } = useTransportMeta();
  const d = addDays(todayISO(), 1);
  const [v, setV] = useState({ vehicle_id: vehicles[0]?.id || "", origin: "", destination: "", departure_at: toLocalInput(`${d}T07:00`), arrival_at: toLocalInput(`${d}T17:00`), price_per_kg: "", min_kg: 1, notes: "" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault(); setErr("");
    if (v.arrival_at <= v.departure_at) return setErr(ui.op.trip.errTimes);
    setBusy(true);
    const r = await call((t) => api.transport.operator.cargo.createTrip(t, { ...v, vehicle_id: Number(v.vehicle_id), price_per_kg: Number(v.price_per_kg), min_kg: Number(v.min_kg), departure_at: fromLocalInput(v.departure_at), arrival_at: fromLocalInput(v.arrival_at) }), o.saved);
    setBusy(false); if (r) onSaved();
  }
  return (
    <Modal title={o.addTrip} onClose={onClose} closeLabel={ui.common.close}>
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
        <Field label={o.vehicle} className="sm:col-span-2"><select required className={inputCls} value={v.vehicle_id} onChange={set("vehicle_id")}>{vehicles.map((x) => <option key={x.id} value={x.id}>{c.kinds[x.kind]} · {x.plate} · {x.capacity_kg} kg</option>)}</select></Field>
        <Field label={o.origin}><input required list="cg-op-cities" className={inputCls} value={v.origin} onChange={set("origin")} /></Field>
        <Field label={o.destination}><input required list="cg-op-cities" className={inputCls} value={v.destination} onChange={set("destination")} /></Field>
        <Field label={o.dep}><input required type="datetime-local" className={inputCls} value={v.departure_at} onChange={set("departure_at")} /></Field>
        <Field label={o.arr}><input required type="datetime-local" className={inputCls} value={v.arrival_at} onChange={set("arrival_at")} /></Field>
        <Field label={o.pricePerKg}><input required type="number" min="0.01" step="any" className={inputCls} value={v.price_per_kg} onChange={set("price_per_kg")} /></Field>
        <Field label={o.minKg}><input required type="number" min="1" step="any" className={inputCls} value={v.min_kg} onChange={set("min_kg")} /></Field>
        <Field label={o.notes} className="sm:col-span-2"><textarea rows={2} maxLength={600} className={`${inputCls} resize-none`} value={v.notes} onChange={set("notes")} /></Field>
        {err && <p role="alert" className="sm:col-span-2 rounded-xl bg-red-500/10 text-red-700 text-sm p-3">{err}</p>}
        <div className="sm:col-span-2 flex justify-end"><BusyButton busy={busy} className="rounded-full bg-ink text-cream text-sm px-6 py-3">{o.save}</BusyButton></div>
        <datalist id="cg-op-cities">{cities.map((x) => <option key={x} value={x} />)}</datalist>
      </form>
    </Modal>
  );
}

const Vehicle3D = lazy(() => import("./Vehicle3D.jsx"));

function TripPanel({ trip, onChanged }) {
  const c = useCargoUi(); const o = c.op; const { lang } = useLanguage(); const { money } = useShopMoney();
  const call = useCall();
  const [open, setOpen] = useState(false);
  const [loc, setLoc] = useState(trip.current_location || ""); const [note, setNote] = useState("");
  const [codes, setCodes] = useState({});
  const { data: bookings, reload } = useLoad(() => (open ? call((t) => api.transport.operator.cargo.bookings(t, trip.id)) : Promise.resolve(null)), [open, trip.id, trip.status]);
  const next = { scheduled: ["loading", o.toLoading], loading: ["in_transit", o.toTransit], in_transit: ["delivered", o.toDelivered] }[trip.status];
  const setStatus = async (status) => { const r = await call((t) => api.transport.operator.cargo.setStatus(t, trip.id, { status, location: loc, note }), o.saved); if (r) { setNote(""); onChanged(); reload?.(); } };
  const deliver = async (b) => { const r = await call((t) => api.transport.operator.cargo.deliver(t, b.code, codes[b.code] || ""), o.delivered); if (r) { onChanged(); reload?.(); } };
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="font-medium text-ink">{trip.origin} → {trip.destination} <StatusPill status={trip.status} /></p>
          <p className="text-xs text-ink-soft capitalize">{fmtDateTime(trip.departure_at, lang)} · {c.kinds[trip.vehicle.kind]} {trip.vehicle.plate}</p>
          <p className="text-xs text-ink-faint">{o.booked(Math.round(trip.kg_booked), trip.vehicle.capacity_kg)} · {money(trip.price_per_kg)} {c.perKg}{trip.revenue != null ? ` · ${o.revenue} ${money(trip.revenue)}` : ""}</p></div>
        <button onClick={() => setOpen(!open)} className="text-sm text-coffee underline">{o.bookings}</button>
      </div>
      <div className="mt-3 h-2 rounded-full bg-latte-soft overflow-hidden"><div className="h-full bg-coffee" style={{ width: `${Math.min(100, (trip.kg_booked / trip.vehicle.capacity_kg) * 100)}%` }} /></div>
      {open && (
        <div className="mt-4 space-y-4">
          <Suspense fallback={<Spinner />}><Vehicle3D kind={trip.vehicle.kind} refrigerated={trip.vehicle.refrigerated} booked={trip.kg_booked / trip.vehicle.capacity_kg} height={300} /></Suspense>
          {["loading", "in_transit", "scheduled"].includes(trip.status) && (
            <div className="grid sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
              <Field label={o.location}><input className={inputCls} value={loc} onChange={(e) => setLoc(e.target.value)} /></Field>
              <Field label={o.note}><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              {next && <button onClick={() => setStatus(next[0])} className="rounded-full bg-ink text-cream text-sm px-4 py-3">{next[1]}</button>}
              {trip.status === "in_transit" && <button onClick={() => setStatus("in_transit")} className="rounded-full border border-line text-sm px-4 py-3">{o.update}</button>}
              {["scheduled", "loading"].includes(trip.status) && <button onClick={() => window.confirm(o.confirm) && setStatus("cancelled")} className="rounded-full border border-line text-red-600 text-sm px-4 py-3">{o.cancelTrip}</button>}
            </div>
          )}
          {!bookings ? <Spinner /> : !bookings.length ? <p className="text-sm text-ink-soft">{o.noBookings}</p> : (
            <ul className="divide-y divide-line">{bookings.map((b) => (
              <li key={b.code} className="py-3 text-sm flex flex-wrap items-center gap-3 justify-between">
                <div><p className="text-ink"><span className="font-mono">{b.code}</span> · {b.weight_kg} kg · {b.description} <StatusPill status={b.status} /></p><p className="text-xs text-ink-faint">{b.sender_name} → {b.receiver_name} ({b.receiver_phone})</p></div>
                {["confirmed", "in_transit"].includes(b.status) && trip.status === "in_transit" && (
                  <div className="flex gap-2"><input aria-label={o.deliverHint} placeholder="000000" inputMode="numeric" maxLength={6} className={`${inputCls} !w-28 text-center tracking-widest`} value={codes[b.code] || ""} onChange={(e) => setCodes((s) => ({ ...s, [b.code]: e.target.value.replace(/\D/g, "") }))} /><button onClick={() => deliver(b)} className="rounded-full bg-ink text-cream text-xs px-4">{o.deliverBtn}</button></div>
                )}
              </li>
            ))}</ul>
          )}
        </div>
      )}
    </Card>
  );
}

export default function OperatorCargo() {
  const c = useCargoUi(); const o = c.op; const ui = useTransportUi();
  const { withAuth } = useUser();
  const vq = useLoad(() => withAuth((t) => api.transport.operator.cargo.vehicles(t)), []);
  const tq = useLoad(() => withAuth((t) => api.transport.operator.cargo.trips(t, "active")), []);
  const [modal, setModal] = useState(null);
  if (vq.loading || tq.loading) return <Spinner label={ui.common.loading} />;
  if (vq.error || tq.error) return <ErrorState onRetry={() => { vq.reload(); tq.reload(); }} />;
  const vehicles = (vq.data || []).filter((v) => v.is_active);
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="font-display text-2xl text-ink">{o.vehicles}</h2><button onClick={() => setModal("v")} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm px-5 py-2.5"><Plus size={16} />{o.addVehicle}</button></div>
        {!vehicles.length ? <EmptyState icon={Truck} title={o.emptyV} /> : <div className="grid md:grid-cols-2 gap-3">{vehicles.map((v) => (
          <Card key={v.id} className="flex items-center gap-3"><span className="w-11 h-11 rounded-2xl bg-latte-soft text-coffee flex items-center justify-center"><Truck size={20} /></span>
            <div><p className="text-ink font-medium">{c.kinds[v.kind]} · {v.plate}</p><p className="text-xs text-ink-soft">{c.cap(v.capacity_kg, v.capacity_m3)}{v.refrigerated ? ` · ${c.cold}` : ""} · {o.upcoming(v.upcoming_trips)}</p></div></Card>
        ))}</div>}
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="font-display text-2xl text-ink">{o.trips}</h2>{vehicles.length > 0 && <button onClick={() => setModal("t")} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm px-5 py-2.5"><Plus size={16} />{o.addTrip}</button>}</div>
        {!(tq.data || []).length ? <EmptyState icon={Truck} title={o.emptyT} /> : tq.data.map((t) => <TripPanel key={t.id} trip={t} onChanged={tq.reload} />)}
      </section>
      {modal === "v" && <VehicleModal onClose={() => setModal(null)} onSaved={() => { setModal(null); vq.reload(); }} />}
      {modal === "t" && <TripModal vehicles={vehicles} onClose={() => setModal(null)} onSaved={() => { setModal(null); tq.reload(); }} />}
    </div>
  );
}
