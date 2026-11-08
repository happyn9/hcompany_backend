import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bus } from "lucide-react";
import TransportLayout, { DayStrip, EmptyState, ErrorState, SearchForm, Spinner, TripCard, inputCls, useTransportUi } from "../../components/transport/Shared.jsx";
import { useLoad, useShopMoney } from "../../data/shop.js";
import { api } from "../../lib/api.js";
import { BUS_TYPES, searchQuery, todayISO } from "../../lib/transport.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

export default function TransportSearch() {
  const ui = useTransportUi();
  const s = ui.search;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { money } = useShopMoney();
  usePageMeta({ title: s.title });

  const q = useMemo(() => ({
    origin: params.get("origin") || "", destination: params.get("destination") || "", date: params.get("date") || todayISO(), seats: Number(params.get("seats")) || 1,
    sort: params.get("sort") || "time", max_price: params.get("max_price") || "", bus_type: params.get("bus_type") || "", border: params.get("border") || "",
  }), [params]);
  const key = JSON.stringify(q);
  const { data, loading, error, reload } = useLoad(() => api.transport.search({ ...q, border: q.border === "1" ? true : undefined }), [key]);

  const update = (patch) => setParams(searchQuery({ ...q, ...patch }), { replace: true });
  const carry = searchQuery({ seats: q.seats, date: q.date });

  return (
    <TransportLayout>
      <SearchForm compact initial={q} onSubmit={(v) => navigate(`/transport/recherche?${searchQuery({ ...q, ...v })}`)} />
      <div className="mt-5"><DayStrip value={q.date} onChange={(d) => update({ date: d })} /></div>

      <div className="mt-8 grid lg:grid-cols-[260px_1fr] gap-8 items-start">
        <aside className="order-2 lg:order-1 rounded-3xl border border-line bg-surface p-5 space-y-5 lg:sticky lg:top-40">
          <h2 className="font-medium text-ink">{s.filters}</h2>
          <label className="block text-sm"><span className="block text-ink-soft mb-1.5">{s.sort}</span>
            <select className={inputCls} value={q.sort} onChange={(e) => update({ sort: e.target.value })}>{Object.entries(s.sorts).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label className="block text-sm"><span className="block text-ink-soft mb-1.5">{s.maxPrice}</span>
            <input type="number" min="0" className={inputCls} value={q.max_price} onChange={(e) => update({ max_price: e.target.value })} placeholder="ZMW" />
          </label>
          <label className="block text-sm"><span className="block text-ink-soft mb-1.5">{s.busType}</span>
            <select className={inputCls} value={q.bus_type} onChange={(e) => update({ bus_type: e.target.value })}><option value="">{s.any}</option>{BUS_TYPES.map((b) => <option key={b} value={b}>{ui.bus[b]}</option>)}</select>
          </label>
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" className="accent-coffee" checked={q.border === "1"} onChange={(e) => update({ border: e.target.checked ? "1" : "" })} />{s.borderOnly}</label>
          <button onClick={() => update({ sort: "time", max_price: "", bus_type: "", border: "" })} className="text-sm text-coffee hover:underline">{s.clear}</button>
        </aside>

        <section aria-live="polite" className="order-1 lg:order-2">
          <div className="flex items-baseline justify-between mb-4">
            <h1 className="font-display text-2xl text-ink">{s.route(q.origin, q.destination)}</h1>
            {data && <span className="text-sm text-ink-soft">{s.results(data.length)}</span>}
          </div>
          {loading ? <Spinner label={ui.common.loading} /> : error ? <ErrorState onRetry={reload} /> : !data.length ? (
            <EmptyState icon={Bus} title={s.noResults} hint={s.noResultsHint} />
          ) : (
            <div className="space-y-4">{data.map((t, i) => <TripCard key={t.id} trip={t} index={i} money={money} query={carry} />)}</div>
          )}
        </section>
      </div>
    </TransportLayout>
  );
}
