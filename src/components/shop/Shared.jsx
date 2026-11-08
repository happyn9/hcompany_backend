import ProductVisual, { Swatches } from "./ProductVisual.jsx";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Heart, Image as ImageIcon, Loader2, Star, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { SHOP_UI } from "../../i18n/shopUi.js";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { api, uploadUrl } from "../../lib/api.js";
import { statusTone } from "../../lib/shop.js";
import { useShopMoney } from "../../data/shop.js";

export function useShopUi() {
  const { lang } = useLanguage();
  return SHOP_UI[lang] || SHOP_UI.fr;
}

export function ShopImage({ path, alt = "", className = "", ratio = "aspect-square" }) {
  const src = uploadUrl(path);
  const [broken, setBroken] = useState(false);
  return (
    <div className={`${ratio} bg-latte-soft overflow-hidden flex items-center justify-center ${className}`}>
      {src && !broken ? (
        <img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} className="w-full h-full object-cover" />
      ) : (
        <ImageIcon className="text-latte" size={28} aria-hidden="true" />
      )}
    </div>
  );
}

export function Stars({ value = 0, count, size = 14, className = "" }) {
  const ui = useShopUi().common;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-label={`${value.toFixed(1)} / 5`}>
      <span className="inline-flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} size={size} className={i <= Math.round(value) ? "fill-latte text-latte" : "text-line"} aria-hidden="true" />
        ))}
      </span>
      {count !== undefined && <span className="text-xs text-ink-faint">{count ? `${value.toFixed(1)} · ${ui.reviews(count)}` : ui.noReviews}</span>}
    </span>
  );
}

const TONES = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  wait: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  bad: "bg-red-500/10 text-red-700 dark:text-red-300",
  info: "bg-latte-soft text-coffee",
};

export function StatusPill({ status, label }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${TONES[statusTone(status)]}`}>{label}</span>;
}

export function Spinner({ label }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-ink-soft text-sm" role="status">
      <Loader2 className="animate-spin" size={18} /> {label}
    </div>
  );
}

export function ErrorState({ onRetry, message }) {
  const ui = useShopUi().common;
  return (
    <div className="rounded-3xl border border-line bg-surface p-10 text-center">
      <AlertCircle className="mx-auto text-coffee mb-3" />
      <p className="text-ink-soft text-sm mb-4">{message || ui.error}</p>
      {onRetry && (
        <button onClick={onRetry} className="rounded-full border border-line px-5 py-2.5 text-sm text-ink hover:border-coffee-light">
          {ui.retry}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-surface/60 p-12 text-center">
      {Icon && <Icon className="mx-auto text-latte mb-4" size={34} />}
      <p className="font-display text-xl text-ink mb-2">{title}</p>
      {hint && <p className="text-sm text-ink-soft max-w-sm mx-auto">{hint}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

export function Pagination({ page, pages, onChange }) {
  const ui = useShopUi().catalog;
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-center gap-4 mt-10" aria-label="Pagination">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="inline-flex items-center gap-1 rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40 hover:border-coffee-light">
        <ChevronLeft size={15} /> {ui.prev}
      </button>
      <span className="text-sm text-ink-soft">{ui.page(page, pages)}</span>
      <button disabled={page >= pages} onClick={() => onChange(page + 1)} className="inline-flex items-center gap-1 rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40 hover:border-coffee-light">
        {ui.next} <ChevronRight size={15} />
      </button>
    </nav>
  );
}

/** Cœur favori : demande de se connecter si besoin. */
export function FavoriteButton({ productId, initial = false, className = "" }) {
  const all = useShopUi();
  const ui = all.product;
  const { isAuthenticated, withAuth } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [fav, setFav] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      navigate("/connexion", { state: { redirectTo: location.pathname + location.search } });
      return;
    }
    if (busy) return;
    setBusy(true);
    const next = !fav;
    setFav(next);
    try {
      await withAuth((t) => (next ? api.shop.addFavorite(t, productId) : api.shop.removeFavorite(t, productId)));
    } catch {
      setFav(!next);
      toast.error(all.common.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={fav}
      aria-label={fav ? ui.favoriteRemove : ui.favoriteAdd}
      className={`w-9 h-9 rounded-full bg-surface/90 backdrop-blur border border-line flex items-center justify-center transition-colors hover:border-coffee-light ${className}`}
    >
      <Heart size={16} className={fav ? "fill-coffee text-coffee" : "text-ink-soft"} />
    </button>
  );
}

export function ProductCard({ product, index = 0 }) {
  const ui = useShopUi();
  const [color, setColor] = useState(null);
  const { money } = useShopMoney();
  const p = product;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ delay: Math.min(index, 8) * 0.04 }}>
      <Link to={`/shopping/produit/${p.id}`} className="group block rounded-3xl border border-line bg-surface overflow-hidden hover:border-coffee-light hover:shadow-lg hover:shadow-coffee/5 transition">
        <div className="relative">
          <ProductVisual path={p.image} alt={p.title} hex={p.colors?.find((c) => c.name === color)?.hex} ratio="aspect-[4/5]" className="group-hover:scale-[1.03] transition-transform duration-500" />
          {p.discount_pct > 0 && <span className="absolute top-3 left-3 rounded-full bg-coffee text-on-coffee text-xs font-semibold px-2.5 py-1">{ui.product.saving(p.discount_pct)}</span>}
          {!p.in_stock && <span className="absolute bottom-3 left-3 rounded-full bg-ink/80 text-cream-fixed text-xs px-2.5 py-1">{ui.common.outOfStock}</span>}
          <FavoriteButton productId={p.id} initial={p.is_favorite} className="absolute top-3 right-3" />
        </div>
        <div className="p-4">
          <p className="text-xs text-ink-faint truncate mb-1">{p.shop.name}</p>
          <h3 className="text-sm font-medium text-ink leading-snug line-clamp-2 min-h-[2.5rem]">{p.title}</h3>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-lg text-ink">
              {p.has_variants && <span className="text-xs text-ink-faint font-sans mr-1">{ui.common.from}</span>}
              {money(p.price)}
            </span>
            {p.compare_at_price && <span className="text-xs text-ink-faint line-through">{money(p.compare_at_price)}</span>}
          </div>
          {p.colors?.length > 0 && <Swatches colors={p.colors.slice(0, 6)} value={color} onChange={setColor} size="w-5 h-5" className="mt-2" />}
          <div className="mt-2 min-h-[1.25rem]">{p.rating_count > 0 ? <Stars value={p.rating_avg} count={p.rating_count} size={12} /> : null}</div>
        </div>
      </Link>
    </motion.div>
  );
}

export function ProductGrid({ products }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} index={i} />
      ))}
    </div>
  );
}

export function SectionTitle({ title, to, toLabel }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6">
      <h2 className="font-display text-2xl sm:text-3xl text-ink">{title}</h2>
      {to && (
        <Link to={to} className="text-sm text-coffee hover:underline whitespace-nowrap">
          {toLabel}
        </Link>
      )}
    </div>
  );
}

/** Frise horizontale/verticale des événements d'une commande. */
export function EventTimeline({ events }) {
  const { lang } = useLanguage();
  const fmt = (iso) => new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <ol className="relative border-l border-line ml-2 space-y-5">
      {[...events].reverse().map((e, i) => (
        <li key={`${e.created_at}-${i}`} className="pl-6 relative">
          <span className={`absolute -left-[7px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-cream ${i === 0 ? "bg-coffee" : "bg-latte"}`} />
          <p className={`text-sm ${i === 0 ? "text-ink font-medium" : "text-ink-soft"}`}>{e.label}</p>
          {e.note && <p className="text-xs text-ink-faint mt-0.5">{e.note}</p>}
          <p className="text-xs text-ink-faint mt-0.5">{fmt(e.created_at)}</p>
        </li>
      ))}
    </ol>
  );
}

/** Barre de progression en 5 étapes. */
export function StepBar({ status, labels, steps }) {
  const idx = steps.indexOf(status);
  const reached = idx === -1 ? 0 : idx;
  return (
    <div className="flex items-center" aria-hidden="true">
      {steps.map((s, i) => (
        <div key={s} className="flex-1 flex items-center last:flex-none">
          <div className="flex flex-col items-center gap-1.5">
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${i <= reached ? "bg-coffee text-on-coffee" : "bg-latte-soft text-ink-faint"}`}>{i + 1}</span>
            <span className={`text-[0.7rem] ${i <= reached ? "text-ink" : "text-ink-faint"} hidden sm:block`}>{labels[s]}</span>
          </div>
          {i < steps.length - 1 && <span className={`flex-1 h-0.5 mx-2 rounded ${i < reached ? "bg-coffee" : "bg-line"}`} />}
        </div>
      ))}
    </div>
  );
}

import { SELLER_UI } from "../../i18n/shopSellerUi.js";
export function useSellerUi() {
  const { lang } = useLanguage();
  return SELLER_UI[lang] || SELLER_UI.fr;
}

/** Bouton + aperçu pour téléverser une image (logo, bannière…). */
export function ImagePicker({ value, onChange, label, hint, ratio = "w-24 h-24", multiple = false, cutout = false, onCutoutMiss }) {
  const { withAuth } = useUser();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function pick(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    try {
      const paths = [];
      for (const f of files) {
        const r = await withAuth((t) => api.shop.seller.upload(t, f, cutout));
        if (cutout && !r.cutout) onCutoutMiss?.();
        paths.push(r.path);
      }
      onChange(multiple ? paths : paths[0]);
    } catch (err) {
      toast?.error?.(err?.data?.detail || "Upload impossible.");
    } finally { setBusy(false); }
  }
  return (
    <div className="flex items-center gap-4">
      {!multiple && <ShopImage path={value} ratio={ratio} className="rounded-2xl shrink-0" />}
      <div>
        <label className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm text-ink cursor-pointer hover:border-coffee-light">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />} {label}
          <input type="file" accept="image/png,image/jpeg,image/webp" multiple={multiple} onChange={pick} className="sr-only" disabled={busy} />
        </label>
        {hint && <p className="text-xs text-ink-faint mt-1.5">{hint}</p>}
      </div>
    </div>
  );
}
