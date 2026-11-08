import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, MapPin } from "lucide-react";
import TransportLayout, { AmenityChip, Card, ErrorState, OperatorBadge, Rating, RouteLine, SeatMap, Spinner, useTransportUi } from "../../components/transport/Shared.jsx";
import { useLoad, useShopMoney } from "../../data/shop.js";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { fmtDay, searchQuery, toggleSeat, totalFor } from "../../lib/transport.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

export default function TripPage() {
  const { id } = useParams();
  const ui = useTransportUi();
  const t = ui.trip;
  const { lang } = useLanguage();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { money } = useShopMoney();
  usePageMeta({ title: t.title });
  const { data: trip, loading, error, reload } = useLoad(() => api.transport.trip(id), [id]);
  const [selected, setSelected] = useState([]);
  const [count, setCount] = useState(Math.max(1, Number(params.get("seats")) || 1));

  useEffect(() => { if (trip) setSelected((s) => s.filter((x) => !trip.taken_seats.includes(x))); }, [trip]);

  if (loading) return <TransportLayout><Spinner label={ui.common.loading} /></TransportLayout>;
  if (error || !trip) return <TransportLayout><ErrorState onRetry={reload} message={error?.status === 404 ? t.unavailable : undefined} /></TransportLayout>;

  const max = Math.min(trip.max_per_booking, Math.max(1, trip.seats_left));
  const n = selected.length || Math.min(count, max);
  const toggle = (s) => setSelected((cur) => toggleSeat(cur, s, trip.max_per_booking));
  const proceed = () => navigate(`/transport/reserver/${trip.id}?${searchQuery({ n, seats: selected.join(",") })}`);

  return (
    <TransportLayout>
      <Link to={`/transport/recherche?${searchQuery({ origin: trip.origin, destination: trip.destination, date: trip.departure_at.slice(0, 10) })}`} className="text-sm text-coffee hover:underline">← {ui.common.back}</Link>
      <div className="mt-4 grid lg:grid-cols-[1fr_380px] gap-8 items-start">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
              <div><h1 className="font-display text-3xl text-ink">{trip.origin} → {trip.destination}</h1><p className="text-sm text-ink-soft mt-1 capitalize">{fmtDay(trip.departure_at, lang, { weekday: "long", day: "numeric", month: "long" })}</p></div>
              <div className="text-right"><OperatorBadge operator={trip.operator} /><div><Rating value={trip.operator.rating_avg} count={trip.operator.rating_count} /></div></div>
            </div>
            <RouteLine trip={trip} />
            <dl className="mt-6 grid sm:grid-cols-2 gap-4 text-sm">
              <div><dt className="text-ink-faint">{t.boarding}</dt><dd className="text-ink flex items-center gap-1.5"><MapPin size={14} className="text-coffee" />{trip.origin_stop || trip.origin}</dd></div>
              <div><dt className="text-ink-faint">{t.arrival}</dt><dd className="text-ink flex items-center gap-1.5"><MapPin size={14} className="text-coffee" />{trip.destination_stop || trip.destination}</dd></div>
              {trip.stops.length > 0 && <div className="sm:col-span-2"><dt className="text-ink-faint">{t.intermediate}</dt><dd className="text-ink">{trip.stops.join(" · ")}</dd></div>}
              {trip.luggage_note && <div className="sm:col-span-2"><dt className="text-ink-faint">{t.luggage}</dt><dd className="text-ink">{trip.luggage_note}</dd></div>}
            </dl>
            <div className="mt-5 flex flex-wrap gap-2"><span className="rounded-full bg-latte-soft text-coffee px-2.5 py-1 text-xs">{ui.bus[trip.bus_type]}</span>{trip.amenities.map((a) => <AmenityChip key={a} name={a} />)}</div>
            {trip.notes && <p className="mt-5 text-sm text-ink-soft whitespace-pre-line"><strong className="text-ink">{t.notes} : </strong>{trip.notes}</p>}
            {trip.border_crossing && <p className="mt-5 flex gap-2 text-sm rounded-2xl bg-amber-500/10 text-amber-800 dark:text-amber-200 p-3"><AlertTriangle size={16} className="shrink-0 mt-0.5" />{t.borderWarn}</p>}
          </Card>

          <Card>
            <h2 className="font-display text-xl text-ink mb-1">{t.seatMap}</h2>
            <p className="text-sm text-ink-soft mb-5">{t.seatHint}</p>
            <SeatMap total={trip.seats_total} layout={trip.bus_layout || "2+2"} taken={trip.taken_seats} selected={selected} onToggle={trip.bookable ? toggle : undefined} readOnly={!trip.bookable} />
            <Link to="/app/transport" className="mt-4 inline-block text-sm text-coffee hover:underline">{lang === "en" ? "See the inside of the bus in 3D, on the map →" : "Voir l'intérieur du bus en 3D, sur la carte →"}</Link>
          </Card>

          <Card>
            <h2 className="font-display text-xl text-ink mb-2">{t.policyTitle}</h2>
            <p className="text-sm text-ink-soft">{t.policy(trip.free_cancel_hours, trip.partial_cancel_hours)}</p>
          </Card>

          <Card>
            <h2 className="font-display text-xl text-ink mb-3">{t.reviewsTitle}</h2>
            {!trip.reviews.length ? <p className="text-sm text-ink-soft">{t.noReviews}</p> : (
              <ul className="divide-y divide-line">{trip.reviews.map((r) => (
                <li key={r.id} className="py-3 text-sm"><p className="text-ink">{"★".repeat(r.rating)}<span className="text-ink-faint">{"★".repeat(5 - r.rating)}</span> · {r.author_name} <span className="text-ink-faint text-xs">{r.route}</span></p>{r.comment && <p className="text-ink-soft mt-1">{r.comment}</p>}{r.reply && <p className="text-xs text-ink-faint mt-1">↳ {r.reply}</p>}</li>
              ))}</ul>
            )}
          </Card>
        </div>

        <aside className="rounded-3xl border border-line bg-surface p-6 lg:sticky lg:top-40 space-y-5">
          <div className="flex items-baseline justify-between"><span className="font-display text-3xl text-ink">{money(trip.price)}</span><span className="text-sm text-ink-faint">{ui.common.perSeat}</span></div>
          {trip.bookable ? (
            <>
              {!selected.length && (
                <label className="block text-sm"><span className="block text-ink-soft mb-1.5">{t.passengers}</span>
                  <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink">{Array.from({ length: max }, (_, i) => i + 1).map((k) => <option key={k} value={k}>{k}</option>)}</select>
                </label>
              )}
              {selected.length > 0 && <p className="text-sm text-ink">{ui.common.seats(selected.length)} : <strong>{selected.join(", ")}</strong></p>}
              <dl className="border-t border-line pt-4 flex justify-between text-sm"><dt className="text-ink-soft">{t.total(n, money(trip.price))}</dt><dd className="font-display text-xl text-ink">{money(totalFor(trip.price, n))}</dd></dl>
              <button onClick={proceed} className="w-full rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5">{t.continue}</button>
              <p className="text-xs text-ink-faint">{t.maxSeats(trip.max_per_booking)}</p>
            </>
          ) : (
            <p className="rounded-2xl bg-red-500/10 text-red-700 dark:text-red-300 text-sm p-3">{trip.closed_reason || t.unavailable}</p>
          )}
        </aside>
      </div>
    </TransportLayout>
  );
}
