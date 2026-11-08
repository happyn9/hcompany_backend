import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Hotel, SlidersHorizontal, X } from "lucide-react";
import LodgeLayout from "../../components/lodge/LodgeLayout.jsx";
import SearchForm from "../../components/lodge/SearchForm.jsx";
import { AmenityIcon, EmptyState, ErrorState, Pagination, PropertyGrid, Spinner, useAmenities, useLodgeUi } from "../../components/lodge/Shared.jsx";
import { useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { api } from "../../lib/api.js";
import { STAY_TYPES, nightsBetween, searchQuery } from "../../lib/lodge.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const FILTER_KEYS = ["min_price", "max_price", "type", "bedrooms", "amenities", "instant", "min_rating"];
const input = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-coffee focus:ring-2 focus:ring-coffee/15";

function Chip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-full border px-3.5 py-2 text-sm transition ${active ? "border-coffee bg-latte-soft text-ink" : "border-line text-ink-soft hover:border-coffee-light"}`}>
      {children}
    </button>
  );
}

function Filters({ params, set, toggleList, clear }) {
  const ui = useLodgeUi();
  const f = ui.search;
  const { list, label } = useAmenities();
  const types = (params.get("type") || "").split(",").filter(Boolean);
  const amenities = (params.get("amenities") || "").split(",").filter(Boolean);
  return (
    <div className="space-y-7">
      <fieldset>
        <legend className="text-sm font-medium text-ink mb-3">{f.price}</legend>
        <div className="grid grid-cols-2 gap-3">
          <input className={input} inputMode="numeric" aria-label={f.min} placeholder={f.min} value={params.get("min_price") || ""} onChange={(e) => set("min_price", e.target.value.replace(/\D/g, ""))} />
          <input className={input} inputMode="numeric" aria-label={f.max} placeholder={f.max} value={params.get("max_price") || ""} onChange={(e) => set("max_price", e.target.value.replace(/\D/g, ""))} />
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium text-ink mb-3">{f.type}</legend>
        <div className="flex flex-wrap gap-2">
          {STAY_TYPES.map((t) => <Chip key={t} active={types.includes(t)} onClick={() => toggleList("type", t)}>{ui.types[t]}</Chip>)}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium text-ink mb-3">{f.bedrooms}</legend>
        <div className="flex flex-wrap gap-2">
          <Chip active={!params.get("bedrooms")} onClick={() => set("bedrooms", "")}>{f.any}</Chip>
          {[1, 2, 3, 4].map((n) => <Chip key={n} active={params.get("bedrooms") === String(n)} onClick={() => set("bedrooms", String(n))}>{n}+</Chip>)}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium text-ink mb-3">{f.rating}</legend>
        <div className="flex flex-wrap gap-2">
          <Chip active={!params.get("min_rating")} onClick={() => set("min_rating", "")}>{f.ratingAny}</Chip>
          {[3, 4, 4.5].map((n) => <Chip key={n} active={params.get("min_rating") === String(n)} onClick={() => set("min_rating", String(n))}>★ {n}+</Chip>)}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium text-ink mb-3">{f.amenities}</legend>
        <div className="flex flex-wrap gap-2">
          {list.map((a) => (
            <Chip key={a.key} active={amenities.includes(a.key)} onClick={() => toggleList("amenities", a.key)}>
              <span className="inline-flex items-center gap-1.5"><AmenityIcon name={a.key} size={14} /> {label(a.key)}</span>
            </Chip>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-3 text-sm text-ink cursor-pointer">
        <input type="checkbox" className="accent-[var(--color-coffee)] w-4 h-4" checked={params.get("instant") === "1"} onChange={(e) => set("instant", e.target.checked ? "1" : "")} />
        {f.instant}
      </label>
      <button type="button" onClick={clear} className="text-sm text-coffee hover:underline">{f.clear}</button>
    </div>
  );
}

export default function LodgeSearch() {
  const ui = useLodgeUi();
  const f = ui.search;
  const { token } = useUser();
  const { money } = useShopMoney();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  usePageMeta({ title: f.title });

  const apiParams = useMemo(() => {
    const p = Object.fromEntries(params.entries());
    if (p.instant === "1") p.instant = true;
    else delete p.instant;
    return p;
  }, [params]);
  const key = params.toString();
  const { data, loading, error, reload } = useLoad(() => api.lodge.search({ ...apiParams, per_page: 12 }, token), [key, token]);

  const update = (mutate) => {
    const next = new URLSearchParams(params);
    mutate(next);
    next.delete("page");
    setParams(next, { replace: true });
  };
  const set = (k, v) => update((n) => (v ? n.set(k, v) : n.delete(k)));
  const toggleList = (k, v) =>
    update((n) => {
      const cur = (n.get(k) || "").split(",").filter(Boolean);
      const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
      next.length ? n.set(k, next.join(",")) : n.delete(k);
    });
  const clear = () => update((n) => FILTER_KEYS.forEach((k) => n.delete(k)));
  const activeFilters = FILTER_KEYS.filter((k) => params.get(k)).length;
  const nights = nightsBetween(params.get("check_in"), params.get("check_out"));
  const cardQuery = searchQuery({ check_in: params.get("check_in"), check_out: params.get("check_out"), guests: params.get("guests") });
  const where = params.get("q") || params.get("city") || "";

  return (
    <LodgeLayout hideBar={false}>
      <div className="mb-8">
        <SearchForm
          variant="compact"
          initial={Object.fromEntries(params.entries())}
          onSubmit={(p) => update((n) => { ["q", "city", "check_in", "check_out", "guests"].forEach((k) => (p[k] ? n.set(k, p[k]) : n.delete(k))); n.delete("city"); if (p.q) n.set("q", p.q); })}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-ink">{where ? f.resultsFor(data?.total ?? 0, where) : f.results(data?.total ?? 0)}</h1>
          {!nights && <p className="text-sm text-ink-soft mt-1">{f.datesHint}</p>}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setOpen(true)} className="lg:hidden inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm text-ink hover:border-coffee-light">
            <SlidersHorizontal size={15} /> {f.filters}{activeFilters ? ` (${activeFilters})` : ""}
          </button>
          <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
            <span className="sr-only">{f.sort}</span>
            <select value={params.get("sort") || "recommended"} onChange={(e) => set("sort", e.target.value === "recommended" ? "" : e.target.value)} className="rounded-full border border-line bg-surface px-4 py-2.5 text-sm text-ink">
              {Object.entries(f.sorts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="grid lg:grid-cols-[280px_1fr] gap-10 items-start">
        <aside className="hidden lg:block sticky top-40 max-h-[calc(100vh-11rem)] overflow-y-auto pr-2">
          <p className="font-display text-lg text-ink mb-5">{f.filters}</p>
          <Filters params={params} set={set} toggleList={toggleList} clear={clear} />
        </aside>
        <div>
          {loading && !data && <Spinner label={ui.common.loading} />}
          {error && <ErrorState onRetry={reload} />}
          {data && data.items.length === 0 && (
            <EmptyState icon={Hotel} title={f.noResults} hint={f.noResultsHint} action={<button onClick={() => setParams({}, { replace: true })} className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3 hover:bg-coffee-dark">{f.clear}</button>} />
          )}
          {data && data.items.length > 0 && (
            <div className={loading ? "opacity-60 transition-opacity" : ""}>
              <PropertyGrid items={data.items} query={cardQuery} money={money} />
              <Pagination page={data.page} pages={data.pages} onChange={(p) => { const n = new URLSearchParams(params); n.set("page", String(p)); setParams(n); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label={f.filters}>
          <button className="absolute inset-0 bg-black/50" aria-label={ui.common.close} onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-cream p-6">
            <div className="flex items-center justify-between mb-5">
              <p className="font-display text-xl text-ink">{f.filters}</p>
              <button onClick={() => setOpen(false)} aria-label={ui.common.close} className="w-9 h-9 rounded-full border border-line flex items-center justify-center"><X size={16} /></button>
            </div>
            <Filters params={params} set={set} toggleList={toggleList} clear={clear} />
            <button onClick={() => setOpen(false)} className="mt-8 w-full rounded-full bg-ink text-cream text-sm font-medium py-4">{f.apply}</button>
          </div>
        </div>
      )}
    </LodgeLayout>
  );
}
