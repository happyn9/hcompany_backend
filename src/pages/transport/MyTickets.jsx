import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Ticket } from "lucide-react";
import TransportLayout, { EmptyState, ErrorState, RouteLine, Spinner, StatusPill, TransportAuthGate, useTransportUi } from "../../components/transport/Shared.jsx";
import { useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { fmtDay, fmtTime } from "../../lib/transport.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

function BookingRow({ b, money }) {
  const ui = useTransportUi();
  const { lang } = useLanguage();
  return (
    <Link to={`/transport/mes-billets/${b.code}`} className="block rounded-3xl border border-line bg-surface p-5 hover:border-coffee-light hover:shadow-lg hover:shadow-coffee/5 transition">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="font-medium text-ink">{b.origin} → {b.destination}</p><p className="text-xs text-ink-faint mt-1 capitalize">{fmtDay(b.departure_at, lang)} · {fmtTime(b.departure_at)} · {b.operator_name}</p></div>
        <StatusPill status={b.status} />
      </div>
      <div className="mt-3 flex items-center justify-between text-sm"><span className="text-ink-soft">{ui.common.seats(b.seats)} · {ui.tickets.ref} <span className="font-mono">{b.code}</span></span><span className="font-display text-lg text-ink">{money(b.total)}</span></div>
    </Link>
  );
}

function List() {
  const ui = useTransportUi();
  const t = ui.tickets;
  const { withAuth } = useUser();
  const { money } = useShopMoney();
  usePageMeta({ title: t.title });
  const { data, loading, error, reload } = useLoad(() => withAuth((tk) => api.transport.myBookings(tk)), []);
  const [upcoming, past] = useMemo(() => {
    const live = ["confirmed", "boarded", "disputed"];
    const rows = data || [];
    return [rows.filter((b) => live.includes(b.status)).sort((a, b) => a.departure_at.localeCompare(b.departure_at)), rows.filter((b) => !live.includes(b.status))];
  }, [data]);
  return (
    <TransportLayout width="max-w-3xl">
      <h1 className="font-display text-3xl sm:text-4xl text-ink mb-8">{t.title}</h1>
      {loading ? <Spinner label={ui.common.loading} /> : error ? <ErrorState onRetry={reload} /> : !data.length ? (
        <EmptyState icon={Ticket} title={t.none} hint={t.noneHint} action={<Link to="/transport/recherche" className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3">{t.search}</Link>} />
      ) : (
        <div className="space-y-10">
          {upcoming.length > 0 && <section><h2 className="font-display text-xl text-ink mb-4">{t.upcoming}</h2><div className="space-y-4">{upcoming.map((b) => <BookingRow key={b.code} b={b} money={money} />)}</div></section>}
          {past.length > 0 && <section><h2 className="font-display text-xl text-ink mb-4">{t.past}</h2><div className="space-y-4">{past.map((b) => <BookingRow key={b.code} b={b} money={money} />)}</div></section>}
        </div>
      )}
    </TransportLayout>
  );
}

export default function MyTickets() {
  return <TransportAuthGate width="max-w-3xl"><List /></TransportAuthGate>;
}
