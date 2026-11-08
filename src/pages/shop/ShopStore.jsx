import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { MapPin, MessageCircle, Phone, Store, BadgeCheck } from "lucide-react";
import ShopLayout from "../../components/shop/ShopLayout.jsx";
import { EmptyState, ErrorState, Pagination, ProductGrid, ShopImage, Spinner, Stars, useShopUi } from "../../components/shop/Shared.jsx";
import { useLoad } from "../../data/shop.js";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import { api } from "../../lib/api.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

export default function ShopStore() {
  const ui = useShopUi();
  const s = ui.store;
  const { slug } = useParams();
  const { lang } = useLanguage();
  const { token } = useUser();
  const [params, setParams] = useSearchParams();
  const tab = params.get("onglet") === "avis" ? "reviews" : "products";
  const page = Number(params.get("page")) || 1;
  const { data: shop, error, loading, reload } = useLoad(() => api.shop.shopBySlug(slug), [slug]);
  const { data: products } = useLoad(() => api.shop.products({ shop: slug, page, page_size: 24 }, token), [slug, page, token]);
  const { data: reviews } = useLoad(() => (tab === "reviews" ? api.shop.shopReviews(slug) : Promise.resolve(null)), [slug, tab]);
  usePageMeta(shop ? { title: `${shop.name} — H-Shopping`, description: shop.tagline || shop.description?.slice(0, 150) } : null);

  if (loading && !shop) return <ShopLayout><Spinner label={ui.common.loading} /></ShopLayout>;
  if (error?.status === 404) return <ShopLayout><EmptyState icon={Store} title={s.notFound} action={<Link to="/shopping" className="rounded-full bg-ink text-cream text-sm px-6 py-3">H-Shopping</Link>} /></ShopLayout>;
  if (error) return <ShopLayout><ErrorState onRetry={reload} /></ShopLayout>;

  const since = new Date(shop.created_at).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { month: "long", year: "numeric" });
  const wa = (shop.whatsapp || "").replace(/\D/g, "");
  const setTab = (t) => { const n = new URLSearchParams(params); t === "reviews" ? n.set("onglet", "avis") : n.delete("onglet"); n.delete("page"); setParams(n); };
  return (
    <ShopLayout>
      <header className="rounded-[2rem] border border-line bg-surface overflow-hidden mb-8">
        <ShopImage path={shop.banner} ratio="h-32 sm:h-48" className="w-full" />
        <div className="p-6 sm:p-8 flex flex-col sm:flex-row gap-5 sm:items-end -mt-12 sm:-mt-14 relative">
          <ShopImage path={shop.logo} alt={shop.name} ratio="w-24 h-24 sm:w-28 sm:h-28" className="rounded-3xl border-4 border-surface shrink-0 shadow-sm" />
          <div className="flex-1 min-w-0 sm:pb-1">
            <h1 className="font-display text-3xl text-ink flex items-center gap-2 flex-wrap">{shop.name}{shop.is_partner && <span title={s.partner} className="inline-flex items-center gap-1 text-xs font-sans font-medium text-coffee bg-latte-soft rounded-full px-2.5 py-1"><BadgeCheck size={13} /> {s.partner}</span>}</h1>
            {shop.tagline && <p className="text-ink-soft mt-1">{shop.tagline}</p>}
            <div className="mt-2 flex items-center gap-4 flex-wrap text-xs text-ink-faint">
              <Stars value={shop.rating_avg} count={shop.rating_count} size={13} />
              {shop.city && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {shop.city}</span>}
              <span>{ui.common.sold(shop.sold_count)}</span>
              <span>{s.since(since)}</span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {wa && <a href={`https://wa.me/${wa.startsWith("0") ? "260" + wa.slice(1) : wa}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm px-5 py-3 hover:bg-coffee-dark"><MessageCircle size={15} /> {s.whatsapp}</a>}
            {shop.phone && <a href={`tel:${shop.phone}`} className="inline-flex items-center gap-2 rounded-full border border-line text-ink text-sm px-5 py-3 hover:border-coffee-light" aria-label={s.contact}><Phone size={15} /></a>}
          </div>
        </div>
        {shop.description && <p className="px-6 sm:px-8 pb-6 sm:pb-8 text-sm text-ink-soft leading-relaxed whitespace-pre-line max-w-3xl">{shop.description}</p>}
      </header>

      <div className="flex gap-2 mb-6" role="tablist">
        {[["products", s.products], ["reviews", `${s.reviews} (${shop.rating_count})`]].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-5 py-2.5 text-sm font-medium ${tab === k ? "bg-ink text-cream" : "border border-line text-ink-soft hover:text-ink"}`}>{label}</button>
        ))}
      </div>

      {tab === "products" && (!products ? <Spinner label={ui.common.loading} /> : products.items.length === 0 ? <EmptyState icon={Store} title={s.noProducts} /> : (
        <><ProductGrid products={products.items} /><Pagination page={products.page} pages={products.pages} onChange={(p) => { const n = new URLSearchParams(params); p === 1 ? n.delete("page") : n.set("page", p); setParams(n); }} /></>
      ))}
      {tab === "reviews" && (!reviews ? <Spinner label={ui.common.loading} /> : reviews.length === 0 ? <p className="text-sm text-ink-soft">{ui.common.noReviews}</p> : (
        <ul className="grid md:grid-cols-2 gap-4">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-surface p-5">
              <Stars value={r.rating} size={13} />
              <p className="text-sm text-ink-soft my-2">{r.comment || "—"}</p>
              <p className="text-xs text-ink-faint">{r.author_name}{r.product_title && <> · <Link className="hover:underline" to={`/shopping/produit/${r.product_id}`}>{r.product_title}</Link></>}</p>
              {r.seller_reply && <p className="mt-3 text-sm bg-latte-soft rounded-xl px-4 py-3">{r.seller_reply}</p>}
            </li>
          ))}
        </ul>
      ))}
    </ShopLayout>
  );
}
