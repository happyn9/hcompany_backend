import { Link } from "react-router-dom";
import { ArrowRight, Banknote, ShieldCheck, Store, Truck, Tag, Shirt, Smartphone, Sofa, Sparkles, Utensils, Palette, Baby, Dumbbell, BookOpen, Car } from "lucide-react";
import ShopLayout from "../../components/shop/ShopLayout.jsx";
import { EmptyState, ErrorState, ProductGrid, SectionTitle, ShopImage, Spinner, Stars, useShopUi } from "../../components/shop/Shared.jsx";
import { useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const ICONS = { shirt: Shirt, smartphone: Smartphone, sofa: Sofa, sparkles: Sparkles, utensils: Utensils, palette: Palette, baby: Baby, dumbbell: Dumbbell, "book-open": BookOpen, car: Car, tag: Tag };
const TRUST_ICONS = [ShieldCheck, Truck, Store, Banknote];

export function ShopCard({ shop }) {
  const ui = useShopUi();
  return (
    <Link to={`/shopping/boutique/${shop.slug}`} className="group rounded-3xl border border-line bg-surface p-5 hover:border-coffee-light transition flex items-center gap-4">
      <ShopImage path={shop.logo} alt={shop.name} ratio="w-14 h-14" className="rounded-2xl shrink-0" />
      <div className="min-w-0">
        <p className="font-medium text-ink truncate">{shop.name}</p>
        <p className="text-xs text-ink-faint truncate">{shop.city || shop.tagline}</p>
        {shop.rating_count > 0 ? <Stars value={shop.rating_avg} size={12} /> : <p className="text-xs text-ink-faint">{ui.common.sold(shop.sold_count)}</p>}
      </div>
    </Link>
  );
}

export default function ShopHome() {
  const ui = useShopUi();
  const h = ui.home;
  const { lang } = useLanguage();
  const { token } = useUser();
  const { money } = useShopMoney();
  usePageMeta({ title: "H-Shopping", description: h.lead });
  const { data, error, loading, reload } = useLoad(() => api.shop.home(token), [token]);

  return (
    <ShopLayout>
      <section className="relative overflow-hidden rounded-[2rem] bg-[#2E1D12] text-cream-fixed px-6 sm:px-12 py-12 sm:py-16 mb-12">
        <svg className="absolute -right-24 -top-24 w-[420px] h-[420px] opacity-40" viewBox="0 0 400 400" aria-hidden="true">
          <circle cx="200" cy="200" r="190" fill="none" stroke="#C49A6C" strokeOpacity="0.35" />
          <circle cx="200" cy="200" r="140" fill="none" stroke="#C49A6C" strokeOpacity="0.25" strokeDasharray="4 8" />
          <circle cx="200" cy="200" r="90" fill="none" stroke="#C49A6C" strokeOpacity="0.2" />
        </svg>
        <div className="relative max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#C49A6C] mb-4">{h.eyebrow}</p>
          <h1 className="font-display text-4xl sm:text-5xl leading-tight mb-5">{h.title}</h1>
          <p className="text-cream-fixed/75 leading-relaxed mb-8">{h.lead}</p>
          <div className="flex flex-wrap gap-3">
            <Link to="/shopping/produits" className="inline-flex items-center gap-2 rounded-full bg-cream-fixed text-ink-fixed text-sm font-medium px-6 py-3.5 hover:bg-white transition-colors">
              {h.ctaShop} <ArrowRight size={16} />
            </Link>
            <Link to="/shopping/vendre" className="inline-flex items-center gap-2 rounded-full border border-white/25 text-cream-fixed text-sm font-medium px-6 py-3.5 hover:bg-white/10 transition-colors">
              {h.ctaSell}
            </Link>
          </div>
          {data && <p className="mt-8 text-xs text-cream-fixed/60">{h.stats(data.stats.products, data.stats.shops, data.stats.agencies).join(" · ")}</p>}
        </div>
      </section>

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-14" aria-label="H-Shopping">
        {h.trust.map((t, i) => {
          const Icon = TRUST_ICONS[i];
          return (
            <div key={t.t} className="rounded-3xl border border-line bg-surface p-5">
              <span className="w-10 h-10 rounded-2xl bg-latte-soft text-coffee flex items-center justify-center mb-3"><Icon size={18} /></span>
              <p className="font-medium text-ink mb-1">{t.t}</p>
              <p className="text-sm text-ink-soft leading-relaxed">{t.d}</p>
            </div>
          );
        })}
      </section>

      {loading && <Spinner label={ui.common.loading} />}
      {error && <ErrorState onRetry={reload} />}
      {data && (
        <>
          {data.categories.filter((c) => !c.parent_id).length > 0 && (
            <section className="mb-14">
              <SectionTitle title={h.categoriesTitle} />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {data.categories.filter((c) => !c.parent_id).map((c) => {
                  const Icon = ICONS[c.icon] || Tag;
                  return (
                    <Link key={c.id} to={`/shopping/produits?categorie=${c.slug}`} className="rounded-2xl border border-line bg-surface p-4 hover:border-coffee-light transition flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-latte-soft text-coffee flex items-center justify-center shrink-0"><Icon size={18} /></span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink leading-tight">{lang === "en" ? c.name_en : c.name_fr}</span>
                        <span className="block text-xs text-ink-faint">{c.product_count}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {data.free_shipping_threshold > 0 && (
            <p className="mb-10 rounded-2xl bg-latte-soft text-coffee text-sm px-5 py-3 text-center">{h.freeShip(money(data.free_shipping_threshold))}</p>
          )}

          {data.newest.length === 0 && <EmptyState icon={Store} title={h.empty} action={<Link to="/shopping/vendre" className="rounded-full bg-ink text-cream text-sm px-6 py-3">{h.ctaSell}</Link>} />}
          {data.featured.length > 0 && (
            <section className="mb-14">
              <SectionTitle title={h.featured} />
              <ProductGrid products={data.featured} />
            </section>
          )}
          {data.best_sellers.length > 0 && (
            <section className="mb-14">
              <SectionTitle title={h.best} to="/shopping/produits?tri=popular" toLabel={ui.common.seeAll} />
              <ProductGrid products={data.best_sellers} />
            </section>
          )}
          {data.newest.length > 0 && (
            <section className="mb-14">
              <SectionTitle title={h.newest} to="/shopping/produits" toLabel={ui.common.seeAll} />
              <ProductGrid products={data.newest} />
            </section>
          )}
          {data.shops.length > 0 && (
            <section className="mb-14">
              <SectionTitle title={h.shops} />
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {data.shops.map((s) => (
                  <ShopCard key={s.id} shop={s} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <section className="rounded-[2rem] bg-latte-soft border border-line p-8 sm:p-12 grid md:grid-cols-[1.4fr_1fr] gap-6 items-center">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl text-ink mb-3">{h.sellBandTitle}</h2>
          <p className="text-ink-soft leading-relaxed">{h.sellBandText}</p>
        </div>
        <div className="md:text-right">
          <Link to="/shopping/vendre" className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5 hover:bg-coffee-dark transition-colors">
            {h.ctaSell} <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </ShopLayout>
  );
}
