import { useSearchParams } from "react-router-dom";
import { Mountain } from "lucide-react";
import TourLayout, { EmptyState, ErrorState, Pagination, Spinner, TourCard, useTourUi, inputCls } from "../../components/tourism/Shared.jsx";
import TourSearchForm from "../../components/tourism/SearchForm.jsx";
import { useLoad } from "../../data/shop.js";
import { api } from "../../lib/api.js";
import { CATEGORIES, DIFFICULTIES } from "../../lib/tourism.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const KEYS = ["q", "city", "category", "difficulty", "day", "people", "max_price", "sort"];

export default function TourSearch() {
  const ui = useTourUi();
  const s = ui.search;
  usePageMeta({ title: `${s.title} · H-Tourisme` });
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") || 1);
  const query = {}; KEYS.forEach((k) => { if (params.get(k)) query[k] = params.get(k); });
  const { data, error, loading, reload } = useLoad(() => api.tour.search({ ...query, page, per_page: 12 }), [params.toString()]);
  const home = useLoad(() => api.tour.home(), []);
  const set = (k, v) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); n.delete("page"); setParams(n, { replace: true }); };
  const carry = params.get("day") ? `?day=${params.get("day")}&people=${params.get("people") || 2}` : "";
  return (
    <TourLayout>
      <TourSearchForm cities={home.data?.cities || []} initial={{ day: params.get("day") || "", people: params.get("people") || "2", city: params.get("city") || "" }} key={`${params.get("day")}|${params.get("people")}|${params.get("city")}`} />
      <div className="flex flex-wrap items-end justify-between gap-4 my-6">
        <div><h1 className="font-display text-3xl text-ink">{s.title}</h1>{data && <p className="text-sm text-ink-soft mt-1">{s.results(data.total)}</p>}</div>
        <div className="flex flex-wrap gap-3">
          <select aria-label={s.category} value={params.get("category") || ""} onChange={(e) => set("category", e.target.value)} className={`${inputCls} !w-auto`}><option value="">{s.category} : {s.all}</option>{CATEGORIES.map((c) => <option key={c} value={c}>{ui.cats[c]}</option>)}</select>
          <select aria-label={s.level} value={params.get("difficulty") || ""} onChange={(e) => set("difficulty", e.target.value)} className={`${inputCls} !w-auto`}><option value="">{s.level} : {s.all}</option>{DIFFICULTIES.map((c) => <option key={c} value={c}>{ui.diff[c]}</option>)}</select>
          <input aria-label={s.maxPrice} placeholder={s.maxPrice} inputMode="numeric" value={params.get("max_price") || ""} onChange={(e) => set("max_price", e.target.value.replace(/\D/g, ""))} className={`${inputCls} !w-36`} />
          <select aria-label={s.sort} value={params.get("sort") || "recommended"} onChange={(e) => set("sort", e.target.value)} className={`${inputCls} !w-auto`}>{Object.entries(s.sorts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
      </div>
      {loading && !data ? <Spinner label={ui.common.loading} /> : error && !data ? <ErrorState onRetry={reload} /> : data.items.length === 0 ? (
        <EmptyState icon={Mountain} title={s.none} hint={s.noneHint} action={<button onClick={() => setParams({}, { replace: true })} className="rounded-full border border-line px-5 py-2.5 text-sm">{s.reset}</button>} />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{data.items.map((t, i) => <TourCard key={t.id} t={t} index={i} query={carry} />)}</div>
          <Pagination page={data.page} pages={data.pages} onChange={(p) => { const n = new URLSearchParams(params); n.set("page", p); setParams(n); window.scrollTo({ top: 0 }); }} />
        </>
      )}
    </TourLayout>
  );
}
