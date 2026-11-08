import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SlidersHorizontal, SearchX, X } from "lucide-react";
import ShopLayout from "../../components/shop/ShopLayout.jsx";
import { EmptyState, ErrorState, Pagination, ProductGrid, Spinner, useShopUi } from "../../components/shop/Shared.jsx";
import { useCategories, useLoad, useShopMoney } from "../../data/shop.js";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import { api } from "../../lib/api.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-coffee focus:ring-2 focus:ring-coffee/15";

export default function ShopCatalog() {
  const ui = useShopUi();
  const c = ui.catalog;
  const { lang } = useLanguage();
  const { token } = useUser();
  const { currency } = useShopMoney();
  const cats = useCategories();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const q = params.get("q") || "";
  const category = params.get("categorie") || "";
  const sort = params.get("tri") || "new";
  const page = Number(params.get("page")) || 1;
  const inStock = params.get("stock") === "1";
  const minP = params.get("min") || "";
  const maxP = params.get("max") || "";
  const [draft, setDraft] = useState({ min: minP, max: maxP });
  useEffect(() => setDraft({ min: minP, max: maxP }), [minP, maxP]);

  usePageMeta({ title: q ? c.resultsFor(q) : c.title });

  const rate = currency?.rate || 1;
  // Les prix de filtre sont saisis dans la devise affichée ; le serveur filtre en monnaie pivot.
  const toPivot = (v) => (v === "" ? "" : Math.round((Number(v) / rate) * 100) / 100);
  const query = { q, categorie: undefined, category, sort, page, in_stock: inStock, min_price: toPivot(minP), max_price: toPivot(maxP), page_size: 24 };
  const { data, error, loading, reload } = useLoad(() => api.shop.products(query, token), [q, category, sort, page, inStock, minP, maxP, rate, token]);

  const set = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries({ page: undefined, ...patch }).forEach(([k, v]) => (v === undefined || v === "" || v === false ? next.delete(k) : next.set(k, String(v))));
    setParams(next);
  };

  const tree = useMemo(() => {
    const parents = cats.filter((x) => !x.parent_id);
    return parents.map((p) => ({ ...p, children: cats.filter((x) => x.parent_id === p.id) }));
  }, [cats]);
  const label = (x) => (lang === "en" ? x.name_en : x.name_fr);
  const activeCat = cats.find((x) => x.slug === category);

  const filters = (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-coffee mb-3">{c.category}</p>
        <ul className="space-y-1 text-sm">
          <li>
            <button onClick={() => set({ categorie: "" })} className={`w-full text-left rounded-lg px-3 py-1.5 ${!category ? "bg-latte-soft text-coffee font-medium" : "text-ink-soft hover:text-ink"}`}>{c.allCategories}</button>
          </li>
          {tree.map((p) => (
            <li key={p.id}>
              <button onClick={() => set({ categorie: p.slug })} className={`w-full text-left rounded-lg px-3 py-1.5 flex justify-between ${category === p.slug ? "bg-latte-soft text-coffee font-medium" : "text-ink-soft hover:text-ink"}`}>
                <span>{label(p)}</span><span className="text-xs text-ink-faint">{p.product_count}</span>
              </button>
              {(category === p.slug || p.children.some((ch) => ch.slug === category)) && p.children.length > 0 && (
                <ul className="ml-3 mt-1 border-l border-line pl-2 space-y-1">
                  {p.children.map((ch) => (
                    <li key={ch.id}>
                      <button onClick={() => set({ categorie: ch.slug })} className={`w-full text-left rounded-lg px-3 py-1 text-[0.82rem] ${category === ch.slug ? "text-coffee font-medium" : "text-ink-soft hover:text-ink"}`}>{label(ch)}</button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-coffee mb-3">{c.price} ({currency?.code})</p>
        <form onSubmit={(e) => { e.preventDefault(); set({ min: draft.min, max: draft.max }); }} className="flex items-center gap-2">
          <input inputMode="decimal" aria-label={c.min} placeholder={c.min} value={draft.min} onChange={(e) => setDraft({ ...draft, min: e.target.value.replace(/[^\d.]/g, "") })} className={field} />
          <span className="text-ink-faint">–</span>
          <input inputMode="decimal" aria-label={c.max} placeholder={c.max} value={draft.max} onChange={(e) => setDraft({ ...draft, max: e.target.value.replace(/[^\d.]/g, "") })} className={field} />
          <button className="rounded-xl bg-ink text-cream text-sm px-3 py-2.5 shrink-0">{c.apply}</button>
        </form>
      </div>
      <label className="flex items-center gap-3 text-sm text-ink cursor-pointer">
        <input type="checkbox" checked={inStock} onChange={(e) => set({ stock: e.target.checked ? "1" : "" })} className="w-4 h-4 accent-[var(--color-coffee)]" />
        {c.inStockOnly}
      </label>
      {(q || category || inStock || minP || maxP) && (
        <button onClick={() => setParams(new URLSearchParams())} className="inline-flex items-center gap-1.5 text-sm text-coffee hover:underline"><X size={14} /> {c.reset}</button>
      )}
    </div>
  );

  return (
    <ShopLayout>
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-ink">{q ? c.resultsFor(q) : activeCat ? label(activeCat) : c.title}</h1>
          {data && <p className="text-sm text-ink-soft mt-1">{c.count(data.total)}</p>}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setOpen(true)} className="lg:hidden inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm text-ink"><SlidersHorizontal size={15} /> {c.filters}</button>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <span className="hidden sm:inline">{c.sort}</span>
            <select value={sort} onChange={(e) => set({ tri: e.target.value === "new" ? "" : e.target.value })} className="rounded-full border border-line bg-surface px-4 py-2.5 text-sm text-ink">
              {Object.entries(c.sorts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="grid lg:grid-cols-[250px_1fr] gap-10">
        <aside className="hidden lg:block">{filters}</aside>
        <div>
          {loading && !data && <Spinner label={ui.common.loading} />}
          {error && <ErrorState onRetry={reload} />}
          {data && data.items.length === 0 && <EmptyState icon={SearchX} title={c.none} hint={c.noneHint} />}
          {data && data.items.length > 0 && (
            <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
              <ProductGrid products={data.items} />
              <Pagination page={data.page} pages={data.pages} onChange={(p) => { set({ page: p === 1 ? "" : p }); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label={c.filters}>
          <button className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-label={ui.common.close} />
          <div className="absolute right-0 top-0 bottom-0 w-[86%] max-w-sm bg-cream p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <p className="font-display text-xl text-ink">{c.filters}</p>
              <button onClick={() => setOpen(false)} aria-label={ui.common.close}><X size={20} /></button>
            </div>
            {filters}
            <button onClick={() => setOpen(false)} className="mt-8 w-full rounded-full bg-ink text-cream text-sm font-medium py-3.5">{c.count(data?.total || 0)}</button>
          </div>
        </div>
      )}
    </ShopLayout>
  );
}
