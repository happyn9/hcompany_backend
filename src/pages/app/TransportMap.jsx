import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Clock, Users } from "lucide-react";
import { api } from "../../lib/api.js";
import { useLoad, useShopMoney } from "../../data/shop.js";
import { coordOf } from "../../lib/cities.js";
import { fmtDay, fmtTime, searchQuery, toggleSeat } from "../../lib/transport.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";
import MapView from "../../components/app/MapView.jsx";
import MapLayout, { Empty, Modal, Skel } from "../../components/app/MapLayout.jsx";

const BusInterior3D = lazy(() => import("../../components/transport/BusInterior3D.jsx"));

function SeatModal({ id, onClose }) {
  const navigate = useNavigate();
  const { money } = useShopMoney();
  const { data: trip, loading } = useLoad(() => api.transport.trip(id), [id]);
  const [sel, setSel] = useState([]);
  const [n, setN] = useState(1);
  const [flat, setFlat] = useState(false);
  if (loading || !trip) return <Modal onClose={onClose} title="Chargement…"><Skel /></Modal>;
  const max = Math.min(trip.max_per_booking, Math.max(1, trip.seats_left));
  const count = sel.length || Math.min(n, max);
  const go = () => navigate(`/transport/reserver/${trip.id}?${searchQuery({ n: count, seats: sel.join(",") })}`);
  return (
    <Modal onClose={onClose} wide title={`${trip.origin} → ${trip.destination}`}>
      <p className="text-sm text-ink-soft mb-3">{fmtDay(trip.departure_at)} · {fmtTime(trip.departure_at)} · {trip.operator?.name} · {money(trip.price)} / siège</p>
      {!flat ? (
        <Suspense fallback={<Skel />}>
          <div className="rounded-2xl overflow-hidden border border-line">
            <BusInterior3D total={trip.seats_total} layout={trip.bus_layout || "2+2"} color={trip.bus?.color || "#c89a3d"} taken={trip.taken_seats} selected={sel}
              onToggle={trip.bookable ? (s) => setSel((c) => toggleSeat(c, s, trip.max_per_booking)) : undefined} readOnly={!trip.bookable} onUnsupported={() => setFlat(true)} />
          </div>
        </Suspense>
      ) : (
        <div className="grid grid-cols-5 gap-2">{Array.from({ length: trip.seats_total }, (_, i) => i + 1).map((s) => {
          const taken = trip.taken_seats.includes(s), on = sel.includes(s);
          return <button key={s} disabled={taken || !trip.bookable} onClick={() => setSel((c) => toggleSeat(c, s, trip.max_per_booking))} className={`rounded-lg py-2 text-sm border ${taken ? "bg-latte-soft text-ink-faint line-through" : on ? "bg-[#C89A3D] border-[#C89A3D] text-ink-fixed font-semibold" : "bg-surface border-line"}`}>{s}</button>;
        })}</div>
      )}
      <p className="text-xs text-ink-faint mt-3">Touchez un siège pour le choisir (glissez pour tourner la vue). Sans choix, les sièges sont attribués à l'embarquement.</p>
      {!sel.length && <label className="mt-3 flex items-center gap-3 text-sm">Places <input type="number" min={1} max={max} value={n} onChange={(e) => setN(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} className="w-20 rounded-xl border border-line bg-surface px-3 py-2" /></label>}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="font-display text-2xl">{money(trip.price * count)}<span className="text-xs text-ink-faint font-sans"> · {count} place{count > 1 ? "s" : ""}</span></p>
        <button onClick={go} disabled={!trip.bookable} className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3 disabled:opacity-40">Continuer</button>
      </div>
    </Modal>
  );
}

export default function TransportMap() {
  usePageMeta({ title: "Bus sur la carte" });
  const { money } = useShopMoney();
  const { data: routes, loading } = useLoad(() => api.transport.popular(), []);
  const [route, setRoute] = useState(null);
  const [trips, setTrips] = useState(null);
  const [book, setBook] = useState(null);

  useEffect(() => { if (!route) return; let on = true; setTrips(null); api.transport.search({ origin: route.origin, destination: route.destination, sort: "recommended" }).then((r) => on && setTrips(r)).catch(() => on && setTrips([])); return () => { on = false; }; }, [route]);

  const key = (r) => `${r.origin}|${r.destination}`;
  const { markers, lines } = useMemo(() => {
    const m = new Map(), ls = [];
    (routes || []).forEach((r) => {
      const a = coordOf(r.origin), b = coordOf(r.destination); if (!a || !b) return;
      const on = route && key(route) === key(r);
      ls.push({ id: key(r), from: a, to: b, active: on });
      [[r.origin, a], [r.destination, b]].forEach(([name, c]) => { const prev = m.get(name); m.set(name, { id: name, lat: c[0], lng: c[1], label: name, emoji: "🚌", active: prev?.active || (on && (route.origin === name || route.destination === name)) }); });
    });
    return { markers: [...m.values()], lines: ls };
  }, [routes, route]);
  const pick = (id) => {
    const r = (routes || []).find((x) => key(x) === id) || (routes || []).find((x) => x.origin === id || x.destination === id);
    if (r) setRoute(r);
  };
  const fit = route ? [coordOf(route.origin), coordOf(route.destination)].filter(Boolean) : undefined;

  return (
    <MapLayout title="Bus sur la carte" lead="Touchez une ligne ou une ville, puis réservez et choisissez votre siège dans le bus en 3D."
      map={<MapView markers={markers} lines={lines} fitTo={fit} onSelect={pick} />}>
      {loading ? <Skel /> : !routes?.length ? <Empty>Aucune ligne disponible pour le moment.</Empty> : !route ? (
        <>
          <p className="text-sm font-semibold">Lignes populaires</p>
          {routes.map((r) => (
            <button key={key(r)} onClick={() => setRoute(r)} className="w-full text-left rounded-2xl border border-line bg-surface p-4 hover:border-coffee/50">
              <p className="font-medium flex items-center gap-2">{r.origin}<ArrowRight size={14} className="text-ink-faint" />{r.destination}</p>
              <p className="text-xs text-ink-soft mt-1">Dès {money(r.min_price)} · {r.trips} départ(s)</p>
            </button>))}
        </>
      ) : (
        <>
          <button onClick={() => { setRoute(null); setTrips(null); }} className="text-sm text-coffee-dark hover:underline">← Toutes les lignes</button>
          <p className="font-display text-xl">{route.origin} → {route.destination}</p>
          {trips === null ? <Skel /> : !trips.length ? <Empty>Pas de départ à venir sur cette ligne.</Empty> : trips.map((t) => (
            <div key={t.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-medium">{fmtDay(t.departure_at)} · {fmtTime(t.departure_at)}</p><p className="text-xs text-ink-soft mt-0.5">{t.operator?.name} · {t.bus_type}{t.operator?.promoted && <span className="ml-2 rounded-full bg-[#C89A3D]/20 text-[#8a6a1f] text-[0.65rem] font-semibold px-2 py-0.5">Recommandé</span>}</p></div>
                <p className="font-display text-xl">{money(t.price)}</p>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-ink-soft flex items-center gap-3"><span className="inline-flex items-center gap-1"><Clock size={12} />{Math.floor(t.duration_minutes / 60)}h{String(t.duration_minutes % 60).padStart(2, "0")}</span><span className="inline-flex items-center gap-1"><Users size={12} />{t.seats_left} place(s)</span></p>
                <button disabled={!t.bookable} onClick={() => setBook(t.id)} className="rounded-full bg-ink text-cream text-sm font-medium px-5 py-2.5 disabled:opacity-40">Réserver</button>
              </div>
            </div>))}
        </>
      )}
      {book && <SeatModal id={book} onClose={() => setBook(null)} />}
    </MapLayout>
  );
}
