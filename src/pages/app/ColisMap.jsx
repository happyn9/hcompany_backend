import { Suspense, lazy, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Weight } from "lucide-react";
import { api } from "../../lib/api.js";
import { useLoad, useShopMoney } from "../../data/shop.js";
import { coordOf } from "../../lib/cities.js";
import { fmtDay, fmtTime } from "../../lib/transport.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";
import MapView from "../../components/app/MapView.jsx";
import MapLayout, { Empty, Modal, Skel } from "../../components/app/MapLayout.jsx";

const Vehicle3D = lazy(() => import("../../components/transport/Vehicle3D.jsx"));

export default function ColisMap() {
  usePageMeta({ title: "Colis sur la carte" });
  const { money } = useShopMoney();
  const { data: trips, loading } = useLoad(() => api.transport.cargo.search({}), []);
  const [sel, setSel] = useState(null);
  const [view, setView] = useState(null);
  const [ref, setRef] = useState(""), [tracked, setTracked] = useState(null), [terr, setTerr] = useState("");

  const { markers, lines } = useMemo(() => {
    const m = new Map(), ls = [];
    (trips || []).forEach((t) => {
      const a = coordOf(t.origin), b = coordOf(t.destination); if (!a || !b) return;
      const on = sel?.id === t.id;
      ls.push({ id: `t${t.id}`, from: a, to: b, active: on });
      [[t.origin, a], [t.destination, b]].forEach(([n, c]) => { const p = m.get(n); m.set(n, { id: n, lat: c[0], lng: c[1], label: n, emoji: "📦", active: p?.active || (on && (sel.origin === n || sel.destination === n)) }); });
    });
    return { markers: [...m.values()], lines: ls };
  }, [trips, sel]);
  const onPick = (id) => { const t = (trips || []).find((x) => `t${x.id}` === id || x.origin === id || x.destination === id); if (t) setSel(t); };
  const fit = sel ? [coordOf(sel.origin), coordOf(sel.destination)].filter(Boolean) : undefined;
  const track = async (e) => { e.preventDefault(); setTerr(""); setTracked(null); try { setTracked(await api.transport.cargo.track(ref.trim().toUpperCase())); } catch { setTerr("Colis introuvable."); } };

  return (
    <MapLayout title="Colis sur la carte" lead="Choisissez un trajet de fret, voyez le véhicule en 3D, puis envoyez votre colis."
      map={<MapView markers={markers} lines={lines} fitTo={fit} onSelect={onPick} />}>
      <form onSubmit={track} className="rounded-2xl border border-line bg-surface p-4">
        <label htmlFor="trk" className="text-sm font-medium">Suivre un colis</label>
        <div className="mt-2 flex gap-2"><input id="trk" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="HC-XXXXXX" className="min-w-0 flex-1 rounded-xl border border-line bg-cream px-3 py-2 text-sm" /><button className="rounded-xl bg-ink text-cream text-sm px-4">OK</button></div>
        {terr && <p className="text-xs text-red-600 mt-2">{terr}</p>}
        {tracked && <p className="text-sm mt-2 text-ink-soft">Statut : <b className="text-ink">{tracked.status}</b>{tracked.current_location ? ` · ${tracked.current_location}` : ""}</p>}
      </form>
      {loading ? <Skel /> : !trips?.length ? <Empty>Aucun trajet de fret pour le moment.</Empty> : trips.map((t) => (
        <div key={t.id} className={`rounded-2xl border bg-surface p-4 ${sel?.id === t.id ? "border-[#C89A3D]" : "border-line"}`}>
          <button onClick={() => setSel(t)} className="w-full text-left">
            <p className="font-medium flex items-center gap-2">{t.origin}<ArrowRight size={14} className="text-ink-faint" />{t.destination}</p>
            <p className="text-xs text-ink-soft mt-1">{fmtDay(t.departure_at)} · {fmtTime(t.departure_at)} · {t.operator_name}</p>
          </button>
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-xs text-ink-soft inline-flex items-center gap-1"><Weight size={12} />{money(t.price_per_kg)}/kg · {Math.round(t.kg_left)} kg libres</p>
            <div className="flex gap-2">
              <button onClick={() => { setSel(t); setView(t); }} className="rounded-full border border-line text-xs px-3.5 py-2 hover:bg-latte-soft">Voir en 3D</button>
              {t.bookable && <Link to={`/transport/colis/${t.id}`} className="rounded-full bg-ink text-cream text-xs font-medium px-4 py-2">Envoyer</Link>}
            </div>
          </div>
        </div>))}
      {view && (
        <Modal onClose={() => setView(null)} wide title={`${view.origin} → ${view.destination}`}>
          <Suspense fallback={<Skel />}><Vehicle3D kind={view.vehicle.kind} refrigerated={view.vehicle.refrigerated} booked={view.kg_booked / view.vehicle.capacity_kg} height={360} /></Suspense>
          <div className="mt-4 flex justify-end">{view.bookable && <Link to={`/transport/colis/${view.id}`} className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3">Envoyer un colis</Link>}</div>
        </Modal>)}
    </MapLayout>
  );
}
