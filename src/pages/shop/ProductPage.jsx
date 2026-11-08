import { Suspense, lazy } from "react";
import ProductVisual, { Swatches } from "../../components/shop/ProductVisual.jsx";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, ChevronRight, Minus, Plus, Share2, ShieldCheck, Store, Truck } from "lucide-react";
import ShopLayout from "../../components/shop/ShopLayout.jsx";
import { EmptyState, ErrorState, FavoriteButton, ProductGrid, SectionTitle, ShopImage, Spinner, Stars, useShopUi } from "../../components/shop/Shared.jsx";
import { useLoad, useShopMoney } from "../../data/shop.js";
import { useCart } from "../../context/CartContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const Product3D = lazy(() => import("../../components/shop/Product3D.jsx"));

export default function ProductPage() {
  const ui = useShopUi();
  const p = ui.product;
  const { id } = useParams();
  const { lang } = useLanguage();
  const { token } = useUser();
  const { money } = useShopMoney();
  const cart = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: product, error, loading, reload } = useLoad(() => api.shop.product(id, token), [id, token]);
  const { data: reviews } = useLoad(() => api.shop.productReviews(id), [id]);
  const { data: related } = useLoad(() => api.shop.related(id, token), [id, token]);
  const [variantId, setVariantId] = useState(null);
  const [qty, setQty] = useState(1);
  const [imgIdx, setImgIdx] = useState(0);
  const [needOption, setNeedOption] = useState(false);
  const [color, setColor] = useState(null);
  const [view, setView] = useState("photo");

  usePageMeta(product ? { title: `${product.title} — H-Shopping`, description: (product.description || "").slice(0, 150) } : null);
  useEffect(() => {
    setVariantId(null);
    setQty(1);
    setImgIdx(0);
    setNeedOption(false);
    setColor(null);
    setView("photo");
  }, [id]);

  const variant = product?.variants.find((v) => v.id === variantId);
  const price = variant ? variant.price : product?.price;
  const stock = variant ? variant.stock : product?.variants.length ? null : product?.stock;
  const max = Math.max(1, Math.min(stock ?? 99, 99));
  const hasVariants = (product?.variants.length || 0) > 0;
  const canBuy = product && product.in_stock && (!hasVariants || variant) && (stock === null || stock > 0);
  const cats = useMemo(() => product?.category, [product]);

  function line() {
    return {
      product_id: product.id, variant_id: variant?.id || null, quantity: qty, title: product.title,
      variant_label: [variant?.label, color].filter(Boolean).join(" · "), color: color || null, price, image: product.images[0] || null, max,
      shop_name: product.shop.name, shop_slug: product.shop.slug,
    };
  }
  function add(goCart) {
    if (hasVariants && !variant) {
      setNeedOption(true);
      return;
    }
    cart.add(line());
    if (goCart) navigate("/shopping/panier");
    else toast.success(p.added);
  }
  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: product.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success(p.copied);
      }
    } catch {
      /* partage annulé */
    }
  }

  if (loading && !product) return <ShopLayout><Spinner label={ui.common.loading} /></ShopLayout>;
  if (error?.status === 404) return <ShopLayout><EmptyState icon={Store} title={p.notFound} action={<Link to="/shopping/produits" className="rounded-full bg-ink text-cream text-sm px-6 py-3">{ui.bar.allProducts}</Link>} /></ShopLayout>;
  if (error) return <ShopLayout><ErrorState onRetry={reload} /></ShopLayout>;

  const images = product.images.length ? product.images : [null];
  return (
    <ShopLayout>
      <nav className="text-xs text-ink-faint flex items-center gap-1.5 mb-6 flex-wrap" aria-label="breadcrumb">
        <Link to="/shopping" className="hover:text-ink">H-Shopping</Link><ChevronRight size={12} />
        {cats && (<><Link to={`/shopping/produits?categorie=${cats.slug}`} className="hover:text-ink">{lang === "en" ? cats.name_en : cats.name_fr}</Link><ChevronRight size={12} /></>)}
        <span className="text-ink-soft truncate max-w-[16rem]">{product.title}</span>
      </nav>

      <div className="grid md:grid-cols-2 gap-8 lg:gap-14">
        <div>
          {product.model3d && (
            <div className="inline-flex rounded-full bg-latte-soft p-1 mb-3" role="tablist">
              {[["photo", lang === "en" ? "Photos" : "Photos"], ["3d", lang === "en" ? "View in 3D" : "Voir en 3D"]].map(([k, l]) => (
                <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`px-4 py-1.5 rounded-full text-sm ${view === k ? "bg-ink text-cream" : "text-ink-soft"}`}>{l}</button>
              ))}
            </div>
          )}
          {view === "3d" && product.model3d ? (
            <Suspense fallback={<Spinner label={ui.common.loading} />}>
              <Product3D kind={product.model3d} colors={product.colors || []} color={color} onColor={setColor} />
            </Suspense>
          ) : (
          <div className="relative rounded-3xl overflow-hidden border border-line">
            <ProductVisual path={images[imgIdx]} alt={product.title} hex={product.colors?.find((c) => c.name === color)?.hex} ratio="aspect-square" />
            {product.discount_pct > 0 && <span className="absolute top-4 left-4 rounded-full bg-coffee text-on-coffee text-sm font-semibold px-3 py-1">{p.saving(product.discount_pct)}</span>}
          </div>
          )}
          {images.length > 1 && (
            <div className="mt-3 grid grid-cols-5 gap-2">
              {images.map((src, i) => (
                <button key={src} onClick={() => setImgIdx(i)} aria-label={`${product.title} ${i + 1}`} className={`rounded-xl overflow-hidden border-2 ${i === imgIdx ? "border-coffee" : "border-transparent"}`}>
                  <ShopImage path={src} ratio="aspect-square" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <Link to={`/shopping/boutique/${product.shop.slug}`} className="inline-flex items-center gap-2 text-sm text-coffee hover:underline mb-3"><Store size={14} /> {product.shop.name}</Link>
          <h1 className="font-display text-3xl sm:text-4xl text-ink leading-tight mb-3">{product.title}</h1>
          <div className="flex items-center gap-4 flex-wrap mb-5">
            <Stars value={product.rating_avg} count={product.rating_count} />
            {product.sold_count > 0 && <span className="text-xs text-ink-faint">{ui.common.sold(product.sold_count)}</span>}
          </div>
          <div className="flex items-baseline gap-3 mb-6">
            <span className="font-display text-4xl text-ink">{money(price)}</span>
            {product.compare_at_price && !hasVariants && <span className="text-ink-faint line-through">{money(product.compare_at_price)}</span>}
          </div>

          {product.colors?.length > 0 && (
            <div className="mb-6">
              <p className="text-sm font-medium text-ink mb-3">{lang === "en" ? "Colour" : "Couleur"}{color && <span className="text-ink-soft font-normal"> : {color}</span>}</p>
              <Swatches colors={product.colors} value={color} onChange={setColor} size="w-9 h-9" className="gap-2.5" />
            </div>
          )}

          {hasVariants && (
            <fieldset className="mb-6">
              <legend className="text-sm font-medium text-ink mb-3">{p.chooseOption}</legend>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <button key={v.id} type="button" disabled={v.stock < 1} onClick={() => { setVariantId(v.id); setQty(1); setNeedOption(false); }} aria-pressed={variantId === v.id}
                    className={`rounded-full border px-4 py-2 text-sm transition ${variantId === v.id ? "border-coffee bg-latte-soft text-coffee font-medium" : "border-line text-ink hover:border-coffee-light"} disabled:opacity-40 disabled:line-through`}>
                    {v.label}
                  </button>
                ))}
              </div>
              {needOption && <p role="alert" className="text-sm text-red-600 dark:text-red-300 mt-2">{p.chooseOption}</p>}
            </fieldset>
          )}

          <p className={`text-sm mb-5 ${product.in_stock ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-300"}`}>
            {!product.in_stock ? ui.common.outOfStock : stock !== null && stock <= 5 ? ui.common.lowStock(stock) : ui.common.inStock}
          </p>

          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <div className="inline-flex items-center rounded-full border border-line bg-surface" role="group" aria-label={p.quantity}>
              <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} className="w-11 h-11 flex items-center justify-center text-ink-soft hover:text-ink" aria-label="-"><Minus size={16} /></button>
              <span className="w-8 text-center text-sm font-medium" aria-live="polite">{qty}</span>
              <button type="button" onClick={() => setQty(Math.min(max, qty + 1))} className="w-11 h-11 flex items-center justify-center text-ink-soft hover:text-ink" aria-label="+"><Plus size={16} /></button>
            </div>
            <button onClick={() => add(false)} disabled={!product.in_stock} className="flex-1 min-w-[10rem] rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5 hover:bg-coffee-dark transition-colors disabled:opacity-40">{p.addToCart}</button>
            <button onClick={() => add(true)} disabled={!product.in_stock} className="rounded-full border border-line text-ink text-sm font-medium px-6 py-3.5 hover:border-coffee-light disabled:opacity-40">{p.buyNow}</button>
            <FavoriteButton productId={product.id} initial={product.is_favorite} className="!w-11 !h-11" />
            <button onClick={share} aria-label={p.share} className="w-11 h-11 rounded-full border border-line flex items-center justify-center text-ink-soft hover:text-ink"><Share2 size={16} /></button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 mb-8">
            <div className="rounded-2xl border border-line bg-surface p-4 flex gap-3"><Truck className="text-coffee shrink-0" size={20} /><div><p className="text-sm font-medium text-ink">{p.delivery}</p><p className="text-xs text-ink-soft mt-0.5">{p.deliveryText}</p></div></div>
            <div className="rounded-2xl border border-line bg-surface p-4 flex gap-3"><ShieldCheck className="text-coffee shrink-0" size={20} /><div><p className="text-sm font-medium text-ink">{p.secure}</p><p className="text-xs text-ink-soft mt-0.5">{p.secureText}</p></div></div>
          </div>

          {product.description && (
            <section className="mb-8">
              <h2 className="font-display text-xl text-ink mb-3">{p.description}</h2>
              <p className="text-ink-soft leading-relaxed whitespace-pre-line">{product.description}</p>
            </section>
          )}
          {(product.attributes.length > 0 || product.brand || product.sku || product.weight_kg > 0) && (
            <section>
              <h2 className="font-display text-xl text-ink mb-3">{p.details}</h2>
              <dl className="rounded-2xl border border-line bg-surface divide-y divide-line text-sm">
                {product.brand && <div className="flex justify-between px-4 py-2.5"><dt className="text-ink-soft">{p.brand}</dt><dd className="text-ink">{product.brand}</dd></div>}
                {product.sku && <div className="flex justify-between px-4 py-2.5"><dt className="text-ink-soft">{p.sku}</dt><dd className="text-ink">{product.sku}</dd></div>}
                {product.weight_kg > 0 && <div className="flex justify-between px-4 py-2.5"><dt className="text-ink-soft">{p.weight}</dt><dd className="text-ink">{product.weight_kg} kg</dd></div>}
                {product.attributes.map((a) => <div key={a.label} className="flex justify-between gap-4 px-4 py-2.5"><dt className="text-ink-soft">{a.label}</dt><dd className="text-ink text-right">{a.value}</dd></div>)}
              </dl>
            </section>
          )}
        </div>
      </div>

      <section className="mt-16">
        <SectionTitle title={p.reviewsTitle} />
        {!reviews || reviews.length === 0 ? (
          <p className="text-sm text-ink-soft">{ui.common.noReviews}</p>
        ) : (
          <ul className="grid md:grid-cols-2 gap-4">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-2xl border border-line bg-surface p-5">
                <div className="flex items-center justify-between mb-2"><Stars value={r.rating} size={13} /><span className="text-xs text-ink-faint">{new Date(r.created_at).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR")}</span></div>
                <p className="text-sm text-ink-soft mb-1">{r.comment || "—"}</p>
                <p className="text-xs text-ink-faint flex items-center gap-1.5"><Check size={12} className="text-emerald-600" /> {r.author_name} · {p.verified}</p>
                {r.seller_reply && <p className="mt-3 text-sm bg-latte-soft rounded-xl px-4 py-3 text-ink"><span className="block text-xs font-semibold text-coffee mb-1">{p.sellerReply}</span>{r.seller_reply}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {related && related.length > 0 && (
        <section className="mt-16">
          <SectionTitle title={p.related} />
          <ProductGrid products={related.slice(0, 4)} />
        </section>
      )}
    </ShopLayout>
  );
}
