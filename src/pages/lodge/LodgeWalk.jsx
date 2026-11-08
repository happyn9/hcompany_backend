import { Suspense, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Footprints, MapPin, Star, X } from "lucide-react";
import LodgeLayout from "../../components/lodge/LodgeLayout.jsx";
import { EmptyState, ErrorState, LodgeImage, Spinner, useLodgeUi } from "../../components/lodge/Shared.jsx";
import WalkView from "../../three/WalkView.jsx";
import { buildNeighbourhood } from "../../three/models/quartier.js";
import { useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

/** Balade 3D dans une rue de logements : une maison par annonce, un clic ouvre sa fiche et sa visite intérieure. */
export default function LodgeWalk() {
  const ui = useLodgeUi();
  const w = ui.walk;
  const { lang } = useLanguage();
  const { token } = useUser();
  const { money } = useShopMoney();
  const [sp, setSp] = useSearchParams();
  const city = sp.get("ville") || "";
  const [picked, setPicked] = useState(null);
  const [bad, setBad] = useState(false);
  usePageMeta({ title: w.title, description: w.lead });
  const cities = useLoad(() => api.lodge.cities(), []);
  const { data, error, loading, reload } = useLoad(() => api.lodge.search({ city: city || undefined, per_page: 24 }, token), [city, token]);
  const items = data?.items || [];
  const ids = items.map((i) => i.id).join(",");
  const build = useMemo(() => () => buildNeighbourhood(null, items, { lang, money }), [ids, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LodgeLayout>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-ink flex items-center gap-3"><Footprints className="text-coffee" size={30} /> {w.title}</h1>
          <p className="mt-2 text-ink-soft max-w-2xl">{w.lead}</p>
        </div>
        <label className="text-sm text-ink-soft">
          <span className="block mb-1">{w.city}</span>
          <select value={city} onChange={(e) => { setPicked(null); setSp(e.target.value ? { ville: e.target.value } : {}); }} className="rounded-full border border-line bg-surface px-4 py-2.5 text-sm text-ink">
            <option value="">{w.all}</option>
            {(cities.data || []).map((c) => <option key={c.city} value={c.city}>{c.city} ({c.count})</option>)}
          </select>
        </label>
      </div>
      {error && <ErrorState onRetry={reload} />}
      {loading && !data && <Spinner label={ui.common.loading} />}
      {data && items.length === 0 && <EmptyState title={w.empty} />}
      {items.length > 0 && !bad && (
        <div className="relative">
          <Suspense fallback={<Spinner />}>
            <WalkView key={ids} build={build} deps={[ids, lang]} height={560} help={w.help} eye={1.65} speed={3.2} fov={68}
              hoverLabel={(d) => `${d.item.title} · ${money(d.item.price_per_night)}`} onPick={(d) => setPicked(d.item)} onUnsupported={() => setBad(true)} />
          </Suspense>
          <p className="mt-2 text-xs text-ink-faint">{w.loaded(items.length)}</p>
          {picked && (
            <aside className="absolute right-3 bottom-10 sm:bottom-6 w-[min(22rem,calc(100%-1.5rem))] rounded-3xl bg-surface border border-line shadow-xl overflow-hidden" aria-live="polite">
              <button type="button" onClick={() => setPicked(null)} aria-label={w.close} className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-surface/90 text-ink flex items-center justify-center border border-line"><X size={15} /></button>
              <LodgeImage path={picked.image} alt={picked.title} ratio="aspect-[16/9]" />
              <div className="p-4">
                <p className="text-[11px] uppercase tracking-wide text-ink-faint">{ui.types[picked.type]}</p>
                <h2 className="font-display text-lg text-ink leading-snug">{picked.title}</h2>
                <p className="mt-1 text-xs text-ink-soft flex items-center gap-2"><MapPin size={12} /> {[picked.area, picked.city].filter(Boolean).join(", ")}{picked.rating_avg > 0 && <span className="inline-flex items-center gap-0.5"><Star size={12} className="text-coffee" /> {picked.rating_avg.toFixed(1)}</span>}</p>
                <p className="mt-2 text-ink"><span className="font-semibold">{money(picked.price_per_night)}</span> <span className="text-sm text-ink-soft">/ {ui.common.perNight.replace(/^par /, "")}</span></p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to={`/logement/s/${picked.slug}?visite=1`} className="rounded-full bg-coffee text-cream-fixed px-4 py-2 text-sm font-medium hover:opacity-90">{w.visit}</Link>
                  <Link to={`/logement/s/${picked.slug}`} className="rounded-full border border-line px-4 py-2 text-sm text-ink hover:border-coffee-light">{w.listing}</Link>
                </div>
              </div>
            </aside>
          )}
        </div>
      )}
    </LodgeLayout>
  );
}
