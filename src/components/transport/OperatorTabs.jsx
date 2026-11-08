import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Copy, Plus, XCircle } from "lucide-react";
import { AmenityChip, BusyButton, Card, EmptyState, ErrorState, Field, Modal, Rating, Spinner, StatusPill, inputCls, useTransportMeta, useTransportUi } from "./Shared.jsx";
import OperatorFleet from "./OperatorFleet.jsx";
import OperatorCargo from "./OperatorCargo.jsx";
import { ProfileForm } from "../../pages/transport/OperatorApp.jsx";
import { validationMessage } from "../lodge/HostUi.jsx";
import { errMessage, useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { BUS_TYPES, addDays, fmtDateTime, fmtTime, fmtDay, fromLocalInput, nextDays, toLocalInput, todayISO } from "../../lib/transport.js";

const TABS = ["overview", "trips", "fleet", "cargo", "boarding", "bookings", "earnings", "reviews", "profile"];

function useOp() {
  const { withAuth } = useUser();
  const toast = useToast();
  const ui = useTransportUi();
  const run = useCallback(async (fn, done) => {
    try { const r = await withAuth(fn); if (done) toast.success(done); return r ?? true; } catch (e) { toast.error(errMessage(e, ui.common.err)); return null; }
  }, [withAuth, toast, ui.common.err]);
  return { withAuth, run, toast };
}

// --- Aperçu -------------------------------------------------------------------------

function Overview({ goto, openNew }) {
  const ui = useTransportUi().op.overview;
  const { withAuth } = useUser();
  const { money } = useShopMoney();
  const { lang } = useLanguage();
  const { data, loading, error, reload } = useLoad(() => withAuth((t) => api.transport.operator.overview(t)), []);
  if (loading) return <Spinner label="…" />;
  if (error) return <ErrorState onRetry={reload} />;
  const stats = [[ui.upcoming, data.trips_upcoming], [ui.today, data.bookings_today], [ui.seatsSold, data.seats_sold_upcoming], [ui.available, money(data.wallet.available)], [ui.pendingFunds, money(data.wallet.pending)]];
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">{stats.map(([l, v]) => <Card key={l}><p className="text-xs text-ink-faint">{l}</p><p className="font-display text-2xl text-ink mt-1">{v}</p></Card>)}</div>
      <section>
        <div className="flex items-center justify-between mb-4"><h2 className="font-display text-xl text-ink">{ui.next}</h2><button onClick={openNew} className="inline-flex items-center gap-1.5 rounded-full bg-ink text-cream text-sm px-4 py-2"><Plus size={15} />{ui.newTrip}</button></div>
        {!data.next_trips.length ? <p className="text-sm text-ink-soft">{ui.none}</p> : (
          <ul className="space-y-3">{data.next_trips.map((t) => (
            <li key={t.id}><button onClick={() => goto("boarding", t.id)} className="w-full text-left rounded-2xl border border-line bg-surface p-4 flex flex-wrap items-center justify-between gap-3 hover:border-coffee-light">
              <span><span className="font-medium text-ink">{t.origin} → {t.destination}</span><span className="block text-xs text-ink-faint capitalize">{fmtDateTime(t.departure_at, lang)}</span></span>
              <span className="text-sm text-ink-soft">{t.booked_seats}/{t.seats_total}</span>
            </button></li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}

// --- Départs ----------------------------------------------------------------------------

const emptyTrip = () => ({
  origin: "", destination: "", origin_stop: "", destination_stop: "", stops: "", departure_at: toLocalInput(`${addDays(todayISO(), 1)}T07:00`), arrival_at: toLocalInput(`${addDays(todayISO(), 1)}T14:00`),
  price: "", bus_id: "", seats_total: 50, bus_type: "standard", amenities: [], luggage_note: "", notes: "", border_crossing: false,
});

function TripEditor({ trip, onClose, onSaved }) {
  const ui = useTransportUi();
  const t = ui.op.trip;
  const { lang } = useLanguage();
  const { cities, amenities } = useTransportMeta();
  const { run } = useOp();
  const [f, setF] = useState(() => (trip ? { ...trip, bus_id: trip.bus?.id || "", stops: (trip.stops || []).join(", "), departure_at: toLocalInput(trip.departure_at), arrival_at: toLocalInput(trip.arrival_at) } : emptyTrip()));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const { withAuth: wa } = useUser();
  const [buses, setBuses] = useState([]);
  useEffect(() => { wa((tk) => api.transport.operator.buses(tk)).then((b) => setBuses((b || []).filter((x) => x.is_active))).catch(() => {}); }, [wa]);
  const bus = buses.find((b) => String(b.id) === String(f.bus_id));
  const locked = trip && trip.booked_seats > 0;
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const toggleAm = (k) => setF((s) => ({ ...s, amenities: s.amenities.includes(k) ? s.amenities.filter((x) => x !== k) : [...s.amenities, k] }));

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (f.origin.trim().toLowerCase() === f.destination.trim().toLowerCase()) return setErr(t.errCities);
    if (!f.price) return setErr(t.errPrice);
    if (f.arrival_at <= f.departure_at) return setErr(t.errTimes);
    const body = {
      ...f, bus_id: f.bus_id ? Number(f.bus_id) : null, price: Number(f.price), seats_total: Number(f.seats_total), departure_at: fromLocalInput(f.departure_at), arrival_at: fromLocalInput(f.arrival_at),
      stops: String(f.stops).split(",").map((s) => s.trim()).filter(Boolean),
    };
    setBusy(true);
    try {
      await new Promise((resolve, reject) => {
        run((tk) => (trip ? api.transport.operator.updateTrip(tk, trip.id, body) : api.transport.operator.createTrip(tk, body)), t.saved).then((r) => (r ? resolve() : reject(new Error("fail"))));
      });
      onSaved();
    } catch { /* toast déjà affiché */ } finally { setBusy(false); }
  }
  return (
    <Modal title={trip ? t.edit : t.new} onClose={onClose} closeLabel={ui.common.close}>
      <form onSubmit={submit} className="space-y-4">
        {locked && <p className="text-xs rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-200 p-3">{t.lockedHint}</p>}
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={t.origin}><input required list="op-cities" disabled={locked} className={inputCls} value={f.origin} onChange={set("origin")} /></Field>
          <Field label={t.destination}><input required list="op-cities" disabled={locked} className={inputCls} value={f.destination} onChange={set("destination")} /></Field>
          <Field label={t.originStop}><input className={inputCls} value={f.origin_stop} onChange={set("origin_stop")} /></Field>
          <Field label={t.destinationStop}><input className={inputCls} value={f.destination_stop} onChange={set("destination_stop")} /></Field>
          <Field label={t.stops} hint={t.stopsHint} className="sm:col-span-2"><input className={inputCls} value={f.stops} onChange={set("stops")} /></Field>
          <Field label={t.departure}><input required type="datetime-local" disabled={locked} className={inputCls} value={f.departure_at} onChange={set("departure_at")} /></Field>
          <Field label={t.arrival}><input required type="datetime-local" disabled={locked} className={inputCls} value={f.arrival_at} onChange={set("arrival_at")} /></Field>
          <Field label={t.price}><input required type="number" min="1" step="any" disabled={locked} className={inputCls} value={f.price} onChange={set("price")} /></Field>
          <Field label={lang === "en" ? "Bus (from your fleet)" : "Bus (de votre flotte)"} hint={bus ? `${bus.layout} · ${bus.seats_total} ${lang === "en" ? "seats" : "sièges"}` : (lang === "en" ? "Pick a bus to use its real seat plan" : "Choisissez un bus pour utiliser son vrai plan de sièges")} className="sm:col-span-2">
            <select disabled={locked} className={inputCls} value={f.bus_id || ""} onChange={(e) => { const b = buses.find((x) => String(x.id) === e.target.value); setF((s) => ({ ...s, bus_id: e.target.value, ...(b ? { seats_total: b.seats_total, bus_type: b.bus_type, amenities: b.amenities } : {}) })); }}>
              <option value="">{lang === "en" ? "No bus (manual seats)" : "Sans bus (sièges manuels)"}</option>
              {buses.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.plate}</option>)}
            </select>
          </Field>
          <Field label={t.seats}><input required disabled={!!bus} type="number" min={trip?.seats_total || 1} max="80" className={inputCls} value={f.seats_total} onChange={set("seats_total")} /></Field>
          <Field label={t.busType}><select disabled={!!bus} className={inputCls} value={f.bus_type} onChange={set("bus_type")}>{BUS_TYPES.map((b) => <option key={b} value={b}>{ui.bus[b]}</option>)}</select></Field>
          <Field label={t.luggage} hint={t.luggageHint}><input className={inputCls} value={f.luggage_note} maxLength={300} onChange={set("luggage_note")} /></Field>
        </div>
        <fieldset><legend className="text-sm font-medium text-ink mb-2">{t.amenities}</legend>
          <div className="flex flex-wrap gap-2">{amenities.map((a) => (
            <button type="button" key={a.key} aria-pressed={f.amenities.includes(a.key)} onClick={() => toggleAm(a.key)} className={`rounded-full border px-3 py-1.5 text-xs ${f.amenities.includes(a.key) ? "border-coffee bg-latte-soft text-ink" : "border-line text-ink-soft"}`}>{lang === "en" ? a.en : a.fr}</button>
          ))}</div>
        </fieldset>
        <Field label={t.notes}><textarea rows={3} maxLength={1000} className={`${inputCls} resize-none`} value={f.notes} onChange={set("notes")} /></Field>
        <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" className="accent-coffee" checked={f.border_crossing} onChange={set("border_crossing")} />{t.border}</label>
        {err && <p role="alert" className="rounded-xl bg-red-500/10 text-red-700 dark:text-red-300 text-sm p-3">{err}</p>}
        <div className="flex justify-end"><BusyButton busy={busy} className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3">{t.save}</BusyButton></div>
        <datalist id="op-cities">{cities.map((c) => <option key={c} value={c} />)}</datalist>
      </form>
    </Modal>
  );
}

function DuplicateModal({ trip, onClose, onDone }) {
  const ui = useTransportUi();
  const t = ui.op.trip;
  const { lang } = useLanguage();
  const { run } = useOp();
  const [days, setDays] = useState([]);
  const [busy, setBusy] = useState(false);
  const opts = Array.from({ length: 30 }, (_, i) => i + 1);
  const base = trip.departure_at.slice(0, 10);
  const toggle = (d) => setDays((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d]));
  async function go() {
    setBusy(true);
    const r = await run((tk) => api.transport.operator.duplicate(tk, trip.id, days));
    setBusy(false);
    if (r) { onDone(t.duplicated(days.length)); }
  }
  return (
    <Modal title={t.duplicateTitle} onClose={onClose} closeLabel={ui.common.close}>
      <p className="text-sm text-ink-soft mb-4">{t.duplicateHint} {trip.origin} → {trip.destination}, {fmtTime(trip.departure_at)}</p>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">{opts.map((d) => (
        <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => toggle(d)} className={`rounded-xl border px-2 py-2 text-xs ${days.includes(d) ? "border-coffee bg-latte-soft text-ink" : "border-line text-ink-soft"}`}>
          <span className="block capitalize">{fmtDay(addDays(base, d), lang, { weekday: "short" })}</span><span className="block font-medium">{fmtDay(addDays(base, d), lang, { day: "numeric", month: "short" })}</span>
        </button>
      ))}</div>
      <div className="mt-5 flex justify-end"><BusyButton busy={busy} disabled={!days.length} onClick={go} className="rounded-full bg-ink text-cream text-sm px-6 py-3">{t.duplicate} ({days.length})</BusyButton></div>
    </Modal>
  );
}

function Trips({ editNew, clearNew, goto }) {
  const ui = useTransportUi();
  const t = ui.op.trip;
  const { lang } = useLanguage();
  const { money } = useShopMoney();
  const { withAuth, run, toast } = useOp();
  const [scope, setScope] = useState("upcoming");
  const { data, loading, error, reload } = useLoad(() => withAuth((tk) => api.transport.operator.trips(tk, scope)), [scope]);
  const [edit, setEdit] = useState(null);
  const [dup, setDup] = useState(null);
  const [cancel, setCancel] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (editNew) { setEdit({}); clearNew(); } }, [editNew, clearNew]);

  async function doCancel() {
    setBusy(true);
    const r = await run((tk) => api.transport.operator.cancelTrip(tk, cancel.id, reason), t.cancelDone);
    setBusy(false);
    if (r) { setCancel(null); setReason(""); reload(); }
  }
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex gap-2">{["upcoming", "history"].map((s) => <button key={s} onClick={() => setScope(s)} aria-pressed={scope === s} className={`rounded-full border px-4 py-2 text-sm ${scope === s ? "border-coffee bg-latte-soft text-ink" : "border-line text-ink-soft"}`}>{t[s]}</button>)}</div>
        <button onClick={() => setEdit({})} className="inline-flex items-center gap-1.5 rounded-full bg-ink text-cream text-sm px-4 py-2.5"><Plus size={15} />{t.new}</button>
      </div>
      {loading ? <Spinner label="…" /> : error ? <ErrorState onRetry={reload} /> : !data.length ? <EmptyState icon={Plus} title={t.empty} hint={t.emptyHint} /> : (
        <ul className="space-y-3">{data.map((x) => (
          <li key={x.id} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="font-medium text-ink">{x.origin} → {x.destination} <StatusPill status={x.status} /></p><p className="text-xs text-ink-faint capitalize mt-1">{fmtDateTime(x.departure_at, lang)} → {fmtTime(x.arrival_at)} · {money(x.price)} · {t.sold(x.booked_seats, x.seats_total)}</p>{x.cancel_reason && <p className="text-xs text-red-700 dark:text-red-300 mt-1">{x.cancel_reason}</p>}</div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => goto("boarding", x.id)} className="rounded-full border border-line px-3.5 py-1.5 text-xs text-ink">{t.manifest}</button>
                {x.status === "scheduled" && <>
                  <button onClick={() => setEdit(x)} className="rounded-full border border-line px-3.5 py-1.5 text-xs text-ink">{ui.common.save === "Save" ? "Edit" : "Modifier"}</button>
                  <button onClick={() => setDup(x)} className="inline-flex items-center gap-1 rounded-full border border-line px-3.5 py-1.5 text-xs text-ink"><Copy size={12} />{t.duplicate}</button>
                  <button onClick={() => setCancel(x)} className="rounded-full border border-line px-3.5 py-1.5 text-xs text-red-700 dark:text-red-300">{ui.common.cancel}</button>
                </>}
              </div>
            </div>
          </li>
        ))}</ul>
      )}
      {edit && <TripEditor trip={edit.id ? edit : null} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {dup && <DuplicateModal trip={dup} onClose={() => setDup(null)} onDone={(m) => { toast.success(m); setDup(null); reload(); }} />}
      {cancel && (
        <Modal title={t.cancelTitle} onClose={() => setCancel(null)} closeLabel={ui.common.close}>
          <p className="text-sm text-ink-soft mb-4">{t.cancelWarn}</p>
          <Field label={t.cancelReason}><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>
          <div className="mt-5 flex justify-end"><BusyButton busy={busy} disabled={reason.trim().length < 3} onClick={doCancel} className="rounded-full bg-red-600 text-white text-sm px-6 py-3">{t.cancel}</BusyButton></div>
        </Modal>
      )}
    </div>
  );
}

// --- Embarquement -------------------------------------------------------------------------

function CameraScan({ onCode }) {
  const ui = useTransportUi().op.boarding;
  const video = useRef(null);
  const [on, setOn] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  useEffect(() => {
    if (!on) return undefined;
    let stream; let raf; let stopped = false;
    (async () => {
      if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) { setUnsupported(true); setOn(false); return; }
      try {
        const det = new window.BarcodeDetector({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.current.srcObject = stream;
        await video.current.play();
        const tick = async () => {
          if (stopped) return;
          try { const r = await det.detect(video.current); if (r[0]?.rawValue) onCode(r[0].rawValue); } catch { /* frame ignorée */ }
          raf = setTimeout(tick, 400);
        };
        tick();
      } catch { setUnsupported(true); setOn(false); }
    })();
    return () => { stopped = true; clearTimeout(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [on, onCode]);
  return (
    <div>
      <button type="button" onClick={() => { setUnsupported(false); setOn((v) => !v); }} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm text-ink"><Camera size={15} />{on ? ui.cameraStop : ui.camera}</button>
      {unsupported && <p className="text-xs text-ink-faint mt-2">{ui.cameraUnsupported}</p>}
      {on && <video ref={video} muted playsInline className="mt-3 w-full max-w-sm rounded-2xl border border-line" />}
    </div>
  );
}

function Boarding({ initialTrip }) {
  const ui = useTransportUi();
  const b = ui.op.boarding;
  const { lang } = useLanguage();
  const { withAuth, run } = useOp();
  const trips = useLoad(() => withAuth((tk) => api.transport.operator.trips(tk, "upcoming")), []);
  const [tripId, setTripId] = useState(initialTrip || "");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState(null);
  const manifest = useLoad(() => (tripId ? withAuth((tk) => api.transport.operator.manifest(tk, tripId)) : Promise.resolve(null)), [tripId]);
  const last = useRef({ code: "", at: 0 });

  useEffect(() => { if (!tripId && trips.data?.length) setTripId(trips.data[0].id); }, [trips.data, tripId]);

  const board = useCallback(async (raw, undo = false) => {
    const c = String(raw || "").trim().toUpperCase();
    if (!c) return;
    if (!undo && last.current.code === c && Date.now() - last.current.at < 4000) return;
    last.current = { code: c, at: Date.now() };
    try {
      const r = await withAuth((tk) => api.transport.operator.board(tk, c, undo));
      setMsg({ ok: true, text: r.already ? b.already(r.passenger.name) : undo ? `${r.passenger.name} ✓` : b.valid(r.passenger.name, r.seat_number) });
      setCode("");
      manifest.reload();
    } catch (e) { setMsg({ ok: false, text: errMessage(e, ui.common.err) }); }
  }, [withAuth, manifest, b, ui.common.err]);

  if (trips.loading) return <Spinner label="…" />;
  if (!trips.data?.length && !tripId) return <EmptyState icon={Camera} title={b.noTrip} />;
  const pax = manifest.data?.passengers || [];
  const boarded = pax.filter((p) => p.boarded).length;
  return (
    <div className="grid lg:grid-cols-[360px_1fr] gap-6 items-start">
      <Card className="space-y-4">
        <Field label={b.pick}><select className={inputCls} value={tripId} onChange={(e) => { setTripId(Number(e.target.value)); setMsg(null); }}>
          {trips.data.map((t) => <option key={t.id} value={t.id}>{t.origin} → {t.destination} · {fmtDateTime(t.departure_at, lang)}</option>)}
          {tripId && !trips.data.some((t) => t.id === Number(tripId)) && manifest.data && <option value={tripId}>{manifest.data.trip.origin} → {manifest.data.trip.destination}</option>}
        </select></Field>
        <form onSubmit={(e) => { e.preventDefault(); board(code); }} className="space-y-3">
          <Field label={b.scan}><input className={`${inputCls} font-mono uppercase`} value={code} onChange={(e) => setCode(e.target.value)} placeholder={b.scanPlaceholder} autoCapitalize="characters" autoComplete="off" /></Field>
          <button className="w-full rounded-full bg-ink text-cream text-sm font-medium px-6 py-3">{b.validate}</button>
        </form>
        <CameraScan onCode={board} />
        {msg && <p role="status" className={`flex gap-2 rounded-xl p-3 text-sm ${msg.ok ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : "bg-red-500/10 text-red-700 dark:text-red-300"}`}>{msg.ok ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <XCircle size={16} className="shrink-0 mt-0.5" />}{msg.text}</p>}
      </Card>
      <Card>
        <div className="flex items-center justify-between mb-4"><h2 className="font-display text-xl text-ink">{b.manifest}</h2><span className="text-sm text-ink-soft">{b.boardedCount(boarded, pax.length)}</span></div>
        {manifest.loading ? <Spinner label="…" /> : !pax.length ? <p className="text-sm text-ink-soft">{b.empty}</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-ink-faint"><th className="py-2 pr-3">{b.seat}</th><th className="pr-3">{b.passenger}</th><th className="pr-3">{b.phone}</th><th /></tr></thead>
            <tbody className="divide-y divide-line">{pax.map((p) => (
              <tr key={p.id}><td className="py-2.5 pr-3 font-medium">{p.seat_number}</td><td className="pr-3"><span className="text-ink">{p.name}</span><span className="block text-xs text-ink-faint font-mono">{p.ticket_code}</span></td><td className="pr-3 text-ink-soft">{p.phone || p.contact_phone}</td>
                <td className="text-right"><button onClick={() => board(p.ticket_code, p.boarded)} className={`rounded-full px-3.5 py-1.5 text-xs ${p.boarded ? "border border-line text-ink-soft" : "bg-ink text-cream"}`}>{p.boarded ? b.unboard : b.board}</button></td></tr>
            ))}</tbody></table></div>
        )}
      </Card>
    </div>
  );
}

// --- Réservations ---------------------------------------------------------------------------

function Bookings() {
  const ui = useTransportUi();
  const t = ui.op.bk;
  const { lang } = useLanguage();
  const { money } = useShopMoney();
  const { withAuth } = useUser();
  const { data, loading, error, reload } = useLoad(() => withAuth((tk) => api.transport.operator.bookings(tk)), []);
  if (loading) return <Spinner label="…" />;
  if (error) return <ErrorState onRetry={reload} />;
  if (!data.length) return <EmptyState icon={Plus} title={t.none} />;
  return (
    <ul className="space-y-3">{data.map((b) => (
      <li key={b.code} className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="font-medium text-ink"><span className="font-mono text-sm">{b.code}</span> · {b.origin} → {b.destination} <StatusPill status={b.status} /></p>
            <p className="text-xs text-ink-faint capitalize mt-1">{fmtDateTime(b.departure_at, lang)} · {ui.common.seats(b.seats)} ({b.passengers.map((p) => p.seat_number).join(", ")})</p>
            <p className="text-xs text-ink-soft mt-1">{b.contact_name} · {b.contact_phone}</p></div>
          <div className="text-right"><p className="font-display text-lg text-ink">{money(b.operator_net)}</p><p className="text-xs text-ink-faint">{money(b.total)}</p></div>
        </div>
      </li>
    ))}</ul>
  );
}

// --- Revenus ---------------------------------------------------------------------------------

function Earnings({ operator }) {
  const ui = useTransportUi().op.earn;
  const { lang } = useLanguage();
  const { money } = useShopMoney();
  const { withAuth, run } = useOp();
  const wallet = useLoad(() => withAuth((tk) => api.transport.operator.wallet(tk)), []);
  const payouts = useLoad(() => withAuth((tk) => api.transport.operator.payouts(tk)), []);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  if (wallet.loading) return <Spinner label="…" />;
  const w = wallet.data;
  async function send(e) {
    e.preventDefault();
    setBusy(true);
    const r = await run((tk) => api.transport.operator.requestPayout(tk, Number(amount)), ui.sent);
    setBusy(false);
    if (r) { setAmount(""); wallet.reload(); payouts.reload(); }
  }
  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-4 gap-4">{[[ui.available, w.available], [ui.pending, w.pending], [ui.earned, w.total_earned], [ui.paidOut, w.total_paid_out]].map(([l, v]) => <Card key={l}><p className="text-xs text-ink-faint">{l}</p><p className="font-display text-2xl text-ink mt-1">{money(v)}</p></Card>)}</div>
      <p className="text-xs text-ink-faint">{ui.commission(operator.commission_rate)}</p>
      <Card>
        <h2 className="font-display text-xl text-ink mb-3">{ui.request}</h2>
        {!operator.mobile_money_phone ? <p className="text-sm text-ink-soft">{ui.needMomo}</p> : (
          <form onSubmit={send} className="flex flex-wrap items-end gap-3">
            <Field label={ui.amount} hint={ui.min(money(w.min_payout))}><input type="number" min="1" step="any" required className={`${inputCls} !w-44`} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <BusyButton busy={busy} className="rounded-full bg-ink text-cream text-sm px-6 py-3 mb-[22px]">{ui.send}</BusyButton>
          </form>
        )}
      </Card>
      <Card>
        <h2 className="font-display text-xl text-ink mb-3">{ui.history}</h2>
        {!payouts.data?.length ? <p className="text-sm text-ink-soft">{ui.none}</p> : (
          <ul className="divide-y divide-line">{payouts.data.map((p) => (
            <li key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-2 text-sm"><span><span className="font-medium text-ink">{money(p.amount)}</span><span className="text-xs text-ink-faint block">{p.reference} · {fmtDay(p.created_at, lang)}</span></span><StatusPill status={p.status === "requested" ? "requested" : p.status} /></li>
          ))}</ul>
        )}
      </Card>
    </div>
  );
}

// --- Avis -------------------------------------------------------------------------------------

function Reviews() {
  const ui = useTransportUi().op.rv;
  const { lang } = useLanguage();
  const { withAuth, run } = useOp();
  const { data, loading, error, reload } = useLoad(() => withAuth((tk) => api.transport.operator.reviews(tk)), []);
  const [drafts, setDrafts] = useState({});
  if (loading) return <Spinner label="…" />;
  if (error) return <ErrorState onRetry={reload} />;
  if (!data.length) return <EmptyState icon={Plus} title={ui.none} />;
  return (
    <ul className="space-y-3">{data.map((r) => (
      <li key={r.id} className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-sm text-ink">{"★".repeat(r.rating)}<span className="text-ink-faint">{"★".repeat(5 - r.rating)}</span> · {r.author_name} <span className="text-xs text-ink-faint">{r.route} · {fmtDay(r.created_at, lang)}</span></p>
        {r.comment && <p className="text-sm text-ink-soft mt-1">{r.comment}</p>}
        {r.reply ? <p className="text-xs text-ink-faint mt-2">↳ {ui.yourReply} : {r.reply}</p> : (
          <div className="mt-3 flex gap-2"><input className={inputCls} placeholder={ui.reply} value={drafts[r.id] || ""} onChange={(e) => setDrafts({ ...drafts, [r.id]: e.target.value })} maxLength={1000} /><button disabled={(drafts[r.id] || "").trim().length < 2} onClick={async () => { if (await run((tk) => api.transport.operator.reply(tk, r.id, drafts[r.id]))) reload(); }} className="rounded-full bg-ink text-cream text-sm px-5 disabled:opacity-50">{ui.send}</button></div>
        )}
      </li>
    ))}</ul>
  );
}

// --- Conteneur --------------------------------------------------------------------------------------

export default function OperatorTabs({ operator, reloadOperator }) {
  const ui = useTransportUi().op;
  const [tab, setTab] = useState("overview");
  const [boardTrip, setBoardTrip] = useState("");
  const [newTrip, setNewTrip] = useState(false);
  const goto = (t, tripId) => { if (tripId) setBoardTrip(tripId); setTab(t); };
  const clearNew = useCallback(() => setNewTrip(false), []);
  return (
    <div>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line mb-8">
        {TABS.map((k) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`whitespace-nowrap px-4 py-3 text-sm border-b-2 -mb-px ${tab === k ? "border-coffee text-ink font-medium" : "border-transparent text-ink-soft hover:text-ink"}`}>{ui.tabs[k]}</button>)}
      </div>
      {tab === "overview" && <Overview goto={goto} openNew={() => { setNewTrip(true); setTab("trips"); }} />}
      {tab === "trips" && <Trips editNew={newTrip} clearNew={clearNew} goto={goto} />}
      {tab === "fleet" && <OperatorFleet />}
      {tab === "cargo" && <OperatorCargo />}
      {tab === "boarding" && <Boarding key={boardTrip} initialTrip={boardTrip} />}
      {tab === "bookings" && <Bookings />}
      {tab === "earnings" && <Earnings operator={operator} />}
      {tab === "reviews" && <Reviews />}
      {tab === "profile" && <Card className="max-w-2xl"><ProfileForm operator={operator} onSaved={reloadOperator} /></Card>}
    </div>
  );
}
