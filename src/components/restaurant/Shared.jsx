import { PageBack } from "../ui/BackButton.jsx";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, ImageIcon, Loader2, Search, Star, Store, Utensils, Zap } from "lucide-react";
import NavBar from "../layout/NavBar.jsx";
import Footer from "../layout/Footer.jsx";
import { RESTO_UI } from "../../i18n/restoUi.js";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { api } from "../../lib/api.js";
import { priceSigns, resTone, restoTone } from "../../lib/resto.js";
import { LodgeImage as RestoImage, Spinner, ErrorState, EmptyState, Pagination } from "../lodge/Shared.jsx";
import { Card, Field, Modal, inputCls } from "../lodge/HostUi.jsx";

export { RestoImage, Spinner, ErrorState, EmptyState, Pagination, Card, Field, Modal, inputCls };

export function useRestoUi() {
  const { lang } = useLanguage();
  return RESTO_UI[lang] || RESTO_UI.fr;
}

const TONES = { ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", wait: "bg-amber-500/10 text-amber-700 dark:text-amber-300", bad: "bg-red-500/10 text-red-700 dark:text-red-300" };
const T2 = { good: "ok", warn: "wait", bad: "bad" };

export function StatusPill({ status, kind = "res" }) {
  const ui = useRestoUi();
  const tone = T2[(kind === "res" ? resTone : restoTone)(status)];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>{(kind === "res" ? ui.status : ui.rstatus)[status] || status}</span>;
}

export function Rating({ value, count, className = "" }) {
  const ui = useRestoUi().search;
  if (!count) return <span className={`text-xs text-ink-faint ${className}`}>{ui.noReview}</span>;
  return (
    <span className={`inline-flex items-center gap-1 text-sm text-ink ${className}`}>
      <Star size={13} className="fill-latte text-latte" aria-hidden="true" /><span className="font-medium">{Number(value).toFixed(1)}</span><span className="text-ink-faint">({count})</span>
    </span>
  );
}

function BarLink({ to, icon: Icon, label }) {
  return (
    <NavLink to={to} className={({ isActive }) => `inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors ${isActive ? "bg-latte-soft text-coffee" : "text-ink-soft hover:text-ink"}`} aria-label={label}>
      <Icon size={18} /><span className="hidden lg:inline">{label}</span>
    </NavLink>
  );
}

export function RestoBar() {
  const ui = useRestoUi().bar;
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  useEffect(() => { if (location.pathname !== "/restaurant/recherche") setQ(""); }, [location.pathname]);
  const submit = (e) => { e.preventDefault(); navigate(`/restaurant/recherche${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`); };
  return (
    <div className="sticky top-[68px] z-40 bg-cream/95 backdrop-blur border-b border-line">
      <div className="max-w-content mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
        <Link to="/restaurant" className="font-display text-lg text-ink hidden sm:block whitespace-nowrap pr-1">H-Restaurant</Link>
        <form onSubmit={submit} role="search" className="flex-1 relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ui.where} aria-label={ui.where} className="w-full rounded-full border border-line bg-surface pl-10 pr-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-coffee focus:ring-2 focus:ring-coffee/15" />
        </form>
        <nav className="flex items-center gap-0.5" aria-label="H-Restaurant">
          <BarLink to="/restaurant/mes-reservations" icon={CalendarDays} label={ui.mine} />
          <BarLink to="/restaurant/pro" icon={Store} label={ui.pro} />
        </nav>
      </div>
    </div>
  );
}

export default function RestoLayout({ children, width = "max-w-content", hideBar = false, className = "" }) {
  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <div className="pt-[68px]">
        {!hideBar && <RestoBar />}
        <main className={`${width} mx-auto px-4 sm:px-6 py-8 sm:py-10 ${className}`}><PageBack root="/restaurant" />{children}</main>
      </div>
      <Footer />
    </div>
  );
}

export function RestoAuthGate({ children, message, width = "max-w-xl" }) {
  const ui = useRestoUi().common;
  const { isAuthenticated, isLoading } = useUser();
  const loc = useLocation();
  if (isLoading) return <RestoLayout><Spinner label={ui.loading} /></RestoLayout>;
  if (!isAuthenticated) {
    const redirectTo = loc.pathname + loc.search;
    return (
      <RestoLayout width={width}>
        <div className="rounded-3xl border border-line bg-surface p-10 text-center">
          <Utensils className="mx-auto text-coffee mb-4" />
          <p className="text-ink mb-6">{message || ui.signInRequired}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/connexion" state={{ redirectTo }} className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5">{ui.signIn}</Link>
            <Link to="/creer-un-compte" state={{ redirectTo }} className="rounded-full border border-line text-ink text-sm font-medium px-6 py-3.5">{ui.createAccount}</Link>
          </div>
        </div>
      </RestoLayout>
    );
  }
  return children;
}

export function RestoCard({ r, query = "", index = 0 }) {
  const ui = useRestoUi();
  const cuisine = (r.cuisines || []).slice(0, 2).map((c) => ui.cuisines[c] || c).join(" · ");
  return (
    <Link to={`/restaurant/r/${r.slug}${query}`} className="group block rounded-3xl border border-line bg-surface overflow-hidden hover:border-coffee-light transition-colors" style={{ contentVisibility: index > 8 ? "auto" : undefined }}>
      <div className="relative">
        <RestoImage path={r.image} alt={r.name} ratio="aspect-[4/3]" className="group-hover:scale-[1.02] transition-transform duration-500" />
        {r.instant_confirm && <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-white/92 text-black text-[11px] font-medium px-2.5 py-1"><Zap size={11} />{ui.search.instant}</span>}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-lg text-ink leading-tight">{r.name}</h3>
          <Rating value={r.rating_avg} count={r.rating_count} className="shrink-0 mt-0.5" />
        </div>
        <p className="text-sm text-ink-soft mt-1">{[cuisine, priceSigns(r.price_level), r.area || r.city].filter(Boolean).join(" · ")}</p>
        {r.summary && <p className="text-sm text-ink-faint mt-2 line-clamp-2">{r.summary}</p>}
        {r.free_tables != null && <p className={`text-xs font-medium mt-3 ${r.free_tables ? "text-emerald-700 dark:text-emerald-300" : "text-red-600"}`}>{ui.search.freeTables(r.free_tables)}</p>}
      </div>
    </Link>
  );
}

/** Téléverse des images vers /restaurant/owner/uploads. */
export function RestoUploader({ onUploaded, label, multiple = false }) {
  const ui = useRestoUi().pro.info;
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
      for (const f of files) paths.push((await withAuth((t) => api.resto.owner.upload(t, f))).path);
      onUploaded(paths);
    } catch (err) { toast?.error?.(err?.data?.detail || "Upload impossible."); } finally { setBusy(false); }
  }
  return (
    <label className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm text-ink cursor-pointer hover:border-coffee-light">
      {busy ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />} {busy ? ui.uploading : label}
      <input type="file" accept="image/png,image/jpeg,image/webp" multiple={multiple} onChange={pick} className="sr-only" disabled={busy} />
    </label>
  );
}
