import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Accessibility, Baby, Beef, Bug, Bus, ChevronLeft, ChevronRight, Coffee, ConciergeBell, CookingPot, Fan, Flame, Heart, Laptop, Minus,
  ParkingCircle, PawPrint, Plus, Refrigerator, ShieldCheck, ShowerHead, Snowflake, Star, Sunset, Trees, Tv, Utensils, Waves, WashingMachine,
  Wifi, X, Zap, Check, BadgeCheck,
} from "lucide-react";
import { LODGE_UI } from "../../i18n/lodgeUi.js";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { api } from "../../lib/api.js";
import { AMENITY_ICONS, bookingTone, buildMonth, formatRating, lastCheckout, parseISO, todayISO } from "../../lib/lodge.js";
import { ShopImage } from "../shop/Shared.jsx";

export { ShopImage as LodgeImage, Spinner, ErrorState, EmptyState, Pagination } from "../shop/Shared.jsx";

export function useLodgeUi() {
  const { lang } = useLanguage();
  return LODGE_UI[lang] || LODGE_UI.fr;
}

// --- Équipements -----------------------------------------------------------------

const ICONS = {
  Wifi, CookingPot, ParkingCircle, Snowflake, Fan, Flame, ShowerHead, Tv, Waves, Trees, Sunset, Beef, Coffee, Utensils, WashingMachine, Laptop, Zap,
  ShieldCheck, ConciergeBell, Bus, Bug, Refrigerator, Baby, PawPrint, Accessibility,
};

export function AmenityIcon({ name, size = 20, className = "" }) {
  const Icon = ICONS[AMENITY_ICONS[name]] || Check;
  return <Icon size={size} className={className} aria-hidden="true" />;
}

let amenityPromise = null;
/** Libellés des équipements (chargés une fois) : label(clé) → texte dans la langue courante. */
export function useAmenities() {
  const { lang } = useLanguage();
  const [list, setList] = useState([]);
  useEffect(() => {
    let alive = true;
    if (!amenityPromise) amenityPromise = api.lodge.amenities().catch(() => { amenityPromise = null; return []; });
    amenityPromise.then((d) => alive && setList(d));
    return () => { alive = false; };
  }, []);
  const map = useMemo(() => Object.fromEntries(list.map((a) => [a.key, lang === "en" ? a.label_en : a.label_fr])), [list, lang]);
  return { list, label: (k) => map[k] || k.replace(/_/g, " ") };
}

// --- Petits éléments ---------------------------------------------------------------

const TONES = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  wait: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  bad: "bg-red-500/10 text-red-700 dark:text-red-300",
  info: "bg-latte-soft text-coffee",
};

export function LodgeStatusPill({ status, tone }) {
  const ui = useLodgeUi();
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${TONES[tone || bookingTone(status)]}`}>
      {ui.status[status] || status}
    </span>
  );
}

export function RatingBadge({ value, count, className = "" }) {
  const { lang } = useLanguage();
  const ui = useLodgeUi().common;
  if (!count) return <span className={`text-xs text-ink-faint ${className}`}>{ui.new}</span>;
  return (
    <span className={`inline-flex items-center gap-1 text-sm text-ink ${className}`} aria-label={`${formatRating(value, lang)} / 5 · ${ui.reviews(count)}`}>
      <Star size={13} className="fill-latte text-latte" aria-hidden="true" />
      <span className="font-medium">{formatRating(value, lang)}</span>
      <span className="text-ink-faint">({count})</span>
    </span>
  );
}

export function Stepper({ value, onChange, min = 1, max = 20, label }) {
  return (
    <div className="inline-flex items-center gap-3" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`− ${label}`} className="w-8 h-8 rounded-full border border-line flex items-center justify-center text-ink disabled:opacity-30 hover:border-coffee-light">
        <Minus size={14} />
      </button>
      <span className="w-6 text-center text-sm font-medium text-ink tabular-nums" aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`+ ${label}`} className="w-8 h-8 rounded-full border border-line flex items-center justify-center text-ink disabled:opacity-30 hover:border-coffee-light">
        <Plus size={14} />
      </button>
    </div>
  );
}

export function SectionTitle({ title, lead, to, toLabel }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6">
      <div>
        <h2 className="font-display text-2xl sm:text-3xl text-ink">{title}</h2>
        {lead && <p className="text-sm text-ink-soft mt-1">{lead}</p>}
      </div>
      {to && <Link to={to} className="text-sm text-coffee hover:underline whitespace-nowrap">{toLabel}</Link>}
    </div>
  );
}

// --- Favoris -------------------------------------------------------------------------

export function LodgeFavoriteButton({ propertyId, initial = false, className = "" }) {
  const ui = useLodgeUi().common;
  const { isAuthenticated, withAuth } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [fav, setFav] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setFav(initial), [initial]);

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
      await withAuth((t) => (next ? api.lodge.addFavorite(t, propertyId) : api.lodge.removeFavorite(t, propertyId)));
    } catch {
      setFav(!next);
      toast?.error?.(ui.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={toggle} aria-pressed={fav} aria-label={fav ? ui.favoriteRemove : ui.favoriteAdd} className={`w-9 h-9 rounded-full bg-surface/90 backdrop-blur border border-line flex items-center justify-center transition-colors hover:border-coffee-light ${className}`}>
      <Heart size={16} className={fav ? "fill-coffee text-coffee" : "text-ink-soft"} />
    </button>
  );
}

// --- Carte logement ---------------------------------------------------------------------

export function PropertyCard({ property, index = 0, query = "", money }) {
  const ui = useLodgeUi();
  const p = property;
  const photos = p.images?.length ? p.images : p.image ? [p.image] : [];
  const [i, setI] = useState(0);
  const go = (d) => (e) => { e.preventDefault(); e.stopPropagation(); setI((n) => (n + d + photos.length) % photos.length); };
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ delay: Math.min(index, 8) * 0.04 }}>
      <Link to={`/logement/s/${p.slug}${query ? `?${query}` : ""}`} className="group block">
        <div className="relative rounded-3xl overflow-hidden bg-latte-soft">
          <ShopImage path={photos[i]} alt={p.title} ratio="aspect-[4/3]" className="group-hover:scale-[1.02] transition-transform duration-500" />
          {photos.length > 1 && (
            <>
              <button type="button" onClick={go(-1)} aria-label="‹" className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-surface/90 border border-line items-center justify-center hidden group-hover:flex"><ChevronLeft size={15} /></button>
              <button type="button" onClick={go(1)} aria-label="›" className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-surface/90 border border-line items-center justify-center hidden group-hover:flex"><ChevronRight size={15} /></button>
              <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1" aria-hidden="true">
                {photos.map((_, n) => <span key={n} className={`w-1.5 h-1.5 rounded-full ${n === i ? "bg-white" : "bg-white/50"}`} />)}
              </div>
            </>
          )}
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
            {p.is_featured && <span className="rounded-full bg-coffee text-on-coffee text-[0.7rem] font-semibold px-2.5 py-1">H-Logement</span>}
            {p.instant_book && <span className="rounded-full bg-surface/95 text-ink text-[0.7rem] font-medium px-2.5 py-1">{ui.common.instant}</span>}
          </div>
          <LodgeFavoriteButton propertyId={p.id} initial={p.is_favorite} className="absolute top-3 right-3" />
        </div>
        <div className="pt-3 px-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[0.95rem] font-medium text-ink leading-snug line-clamp-1">{p.title}</h3>
            <RatingBadge value={p.rating_avg} count={p.rating_count} className="shrink-0" />
          </div>
          <p className="text-sm text-ink-soft truncate">{ui.types[p.type]} · {[p.area, p.city].filter(Boolean).join(", ")}</p>
          <p className="text-xs text-ink-faint truncate">{ui.common.bedrooms(p.bedrooms)} · {ui.common.upTo(p.max_guests)}</p>
          <p className="mt-1.5 text-sm text-ink">
            {p.total != null ? (
              <><span className="font-semibold">{money(p.total)}</span> <span className="text-ink-soft">· {ui.common.night(p.nights)}</span></>
            ) : (
              <><span className="font-semibold">{money(p.price_per_night)}</span> <span className="text-ink-soft">{ui.common.perNight}</span></>
            )}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}

export function PropertyGrid({ items, query = "", money }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-9">
      {items.map((p, i) => <PropertyCard key={p.id} property={p} index={i} query={query} money={money} />)}
    </div>
  );
}

// --- Calendrier de dates -----------------------------------------------------------------

/**
 * Calendrier de sélection d'une plage. `days` : { "AAAA-MM-JJ": { available, price } }.
 * `value` : { start, end }. `onPick(iso)` : le parent applique pickDate().
 */
export function RangeCalendar({ days, value, onPick, months = 2, showPrices = true }) {
  const ui = useLodgeUi().cal;
  const { lang } = useLanguage();
  const today = todayISO();
  const t0 = parseISO(today);
  const [offset, setOffset] = useState(0);
  const [hover, setHover] = useState(null);
  const base = new Date(t0.getFullYear(), t0.getMonth() + offset, 1);
  const limit = value.start && !value.end ? lastCheckout(days, value.start) : null;
  const preview = value.start && !value.end && hover && hover > value.start && hover <= limit ? hover : null;
  const end = value.end || preview;

  const monthsList = Array.from({ length: months }, (_, i) => new Date(base.getFullYear(), base.getMonth() + i, 1));
  const label = (d) => d.toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { month: "long", year: "numeric" });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button type="button" onClick={() => setOffset((o) => Math.max(0, o - 1))} disabled={offset === 0} aria-label={ui.prev} className="w-9 h-9 rounded-full border border-line flex items-center justify-center disabled:opacity-30 hover:border-coffee-light"><ChevronLeft size={16} /></button>
        <p className="text-sm text-ink-soft capitalize">{label(monthsList[0])}{months > 1 ? ` – ${label(monthsList[months - 1])}` : ""}</p>
        <button type="button" onClick={() => setOffset((o) => Math.min(o + 1, 11))} aria-label={ui.next} className="w-9 h-9 rounded-full border border-line flex items-center justify-center hover:border-coffee-light"><ChevronRight size={16} /></button>
      </div>
      <div className={`grid gap-8 ${months > 1 ? "md:grid-cols-2" : ""}`}>
        {monthsList.map((m) => (
          <div key={m.toISOString()}>
            <p className="font-medium text-ink capitalize text-center mb-3 text-sm">{label(m)}</p>
            <div className="grid grid-cols-7 text-center text-[0.7rem] text-ink-faint mb-1">{ui.days.map((d, i) => <span key={i}>{d}</span>)}</div>
            <div className="grid grid-cols-7 gap-y-1">
              {buildMonth(m.getFullYear(), m.getMonth()).flat().map((iso, i) => {
                if (!iso) return <span key={`e${i}`} />;
                const info = days[iso];
                const past = iso < today;
                const isStart = iso === value.start;
                const isEnd = iso === value.end;
                const inRange = value.start && end && iso > value.start && iso < end;
                // un jour est cliquable s'il peut être une arrivée, ou un départ valide
                const asCheckout = value.start && !value.end && iso > value.start && iso <= limit;
                const clickable = !past && (info?.available || asCheckout);
                const cls = isStart || isEnd
                  ? "bg-ink text-cream"
                  : inRange ? "bg-latte-soft text-ink"
                  : clickable ? "text-ink hover:bg-latte-soft" : "text-ink-faint/60";
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={!clickable}
                    onClick={() => onPick(iso)}
                    onMouseEnter={() => setHover(iso)}
                    onMouseLeave={() => setHover(null)}
                    aria-label={`${iso}${!info?.available && !asCheckout ? ` — ${ui.unavailable}` : ""}`}
                    aria-pressed={isStart || isEnd}
                    className={`relative h-12 rounded-xl text-sm flex flex-col items-center justify-center transition-colors ${cls} ${!clickable && !past ? "line-through" : ""} disabled:cursor-not-allowed`}
                  >
                    <span className="tabular-nums leading-none">{Number(iso.slice(8))}</span>
                    {showPrices && info && !past && info.available && !(isStart || isEnd) && (
                      <span className="text-[0.6rem] text-ink-faint leading-none mt-0.5">{Math.round(info.price)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Galerie ------------------------------------------------------------------------------

export function Lightbox({ images, index, onClose, onIndex }) {
  const ui = useLodgeUi();
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex((index + 1) % images.length);
      if (e.key === "ArrowLeft") onIndex((index - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [index, images.length, onClose, onIndex]);
  return (
    <div className="fixed inset-0 z-[80] bg-black/90 flex flex-col" role="dialog" aria-modal="true" aria-label="Photos">
      <div className="flex items-center justify-between px-4 py-3 text-white/80 text-sm">
        <span>{index + 1} / {images.length}</span>
        <button type="button" onClick={onClose} aria-label={ui.common.close} className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center"><X size={20} /></button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center relative px-2">
        <button type="button" onClick={() => onIndex((index - 1 + images.length) % images.length)} aria-label="‹" className="absolute left-3 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"><ChevronLeft /></button>
        <ShopImage path={images[index]} ratio="w-full h-full" className="!bg-transparent [&>img]:object-contain max-w-5xl" />
        <button type="button" onClick={() => onIndex((index + 1) % images.length)} aria-label="›" className="absolute right-3 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"><ChevronRight /></button>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar p-3 justify-center">
        {images.map((im, n) => (
          <button key={im} type="button" onClick={() => onIndex(n)} aria-label={`${n + 1}`} className={`shrink-0 rounded-lg overflow-hidden border-2 ${n === index ? "border-white" : "border-transparent opacity-60"}`}>
            <ShopImage path={im} ratio="w-16 h-12" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function HostBadge({ verified, className = "" }) {
  const ui = useLodgeUi().common;
  if (!verified) return null;
  return <span className={`inline-flex items-center gap-1 text-xs text-coffee ${className}`}><BadgeCheck size={14} /> {ui.verifiedHost}</span>;
}

