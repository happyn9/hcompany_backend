import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import LodgeLayout from "../../components/lodge/LodgeLayout.jsx";
import LodgeAuthGate from "../../components/lodge/AuthGate.jsx";
import { EmptyState, ErrorState, LodgeImage, LodgeStatusPill, Spinner, useLodgeUi } from "../../components/lodge/Shared.jsx";
import { useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { formatRange, todayISO } from "../../lib/lodge.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const CANCELLED = ["declined", "expired", "cancelled_guest", "cancelled_host"];

export function TripCard({ b, money }) {
  const ui = useLodgeUi();
  const { lang } = useLanguage();
  return (
    <Link to={`/logement/mes-sejours/${b.code}`} className="group flex gap-4 sm:gap-6 rounded-3xl border border-line bg-surface p-4 hover:border-coffee-light hover:shadow-lg hover:shadow-coffee/5 transition">
      <LodgeImage path={b.property.image} alt={b.property.title} ratio="w-28 h-28 sm:w-40 sm:h-32" className="rounded-2xl shrink-0" />
      <div className="min-w-0 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <p className="font-medium text-ink truncate">{b.property.title}</p>
          <LodgeStatusPill status={b.status} />
        </div>
        <p className="text-sm text-ink-soft">{b.property.city} · {ui.types[b.property.type]}</p>
        <p className="text-sm text-ink mt-1">{formatRange(b.check_in, b.check_out, lang)} · {ui.trips.nights(b.nights)}</p>
        <div className="mt-auto pt-2 flex items-end justify-between gap-3">
          <p className="text-xs text-ink-faint">{ui.trips.confirmation} <span className="font-mono">{b.code}</span></p>
          <p className="font-display text-lg text-ink">{money(b.total)}</p>
        </div>
      </div>
    </Link>
  );
}

function Content() {
  const ui = useLodgeUi();
  const t = ui.trips;
  const { token } = useUser();
  const { money } = useShopMoney();
  usePageMeta({ title: t.title });
  const { data, loading, error, reload } = useLoad(() => api.lodge.myBookings(token), [token]);
  const [tab, setTab] = useState("upcoming");
  const today = todayISO();
  const groups = useMemo(() => {
    const g = { upcoming: [], past: [], cancelled: [] };
    (data || []).forEach((b) => {
      if (CANCELLED.includes(b.status)) g.cancelled.push(b);
      else if (b.status === "completed" || b.check_out < today) g.past.push(b);
      else g.upcoming.push(b);
    });
    g.upcoming.sort((a, b) => a.check_in.localeCompare(b.check_in));
    return g;
  }, [data, today]);
  const list = groups[tab];

  return (
    <LodgeLayout width="max-w-4xl">
      <h1 className="font-display text-3xl sm:text-4xl text-ink mb-6">{t.title}</h1>
      <div className="flex gap-2 mb-8 overflow-x-auto no-scrollbar" role="tablist">
        {Object.entries(t.tabs).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full border px-5 py-2.5 text-sm whitespace-nowrap transition ${tab === k ? "border-coffee bg-latte-soft text-ink" : "border-line text-ink-soft hover:border-coffee-light"}`}>
            {label}{data ? ` · ${groups[k].length}` : ""}
          </button>
        ))}
      </div>
      {loading && !data && <Spinner label={ui.common.loading} />}
      {error && <ErrorState onRetry={reload} />}
      {data && list.length === 0 && (
        <EmptyState icon={CalendarDays} title={t.empty} hint={t.emptyHint} action={<Link to="/logement/recherche" className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5 hover:bg-coffee-dark">{t.explore}</Link>} />
      )}
      <div className="space-y-4">{list.map((b) => <TripCard key={b.code} b={b} money={money} />)}</div>
    </LodgeLayout>
  );
}

export default function MyTrips() {
  const ui = useLodgeUi();
  return <LodgeAuthGate message={ui.trips.signIn}><Content /></LodgeAuthGate>;
}
