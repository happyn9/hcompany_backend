import { PageBack } from "../ui/BackButton.jsx";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, Clock, ImageIcon, Loader2, Mountain, Search, Star, Store, Zap } from "lucide-react";
import NavBar from "../layout/NavBar.jsx";
import Footer from "../layout/Footer.jsx";
import { TOUR_UI } from "../../i18n/tourUi.js";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useShopMoney } from "../../data/shop.js";
import { api } from "../../lib/api.js";
import { bookingTone, fmtDay, fmtDuration, tourTone } from "../../lib/tourism.js";
import { LodgeImage as TourImage, Spinner, ErrorState, EmptyState, Pagination } from "../lodge/Shared.jsx";
import { Card, Field, Modal, inputCls } from "../lodge/HostUi.jsx";

export { TourImage, Spinner, ErrorState, EmptyState, Pagination, Card, Field, Modal, inputCls };

export function useTourUi() {
  const { lang } = useLanguage();
  return TOUR_UI[lang] || TOUR_UI.fr;
}

const TONES = { ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", wait: "bg-amber-500/10 text-amber-700 dark:text-amber-300", bad: "bg-red-500/10 text-red-700 dark:text-red-300" };
const T2 = { good: "ok", warn: "wait", bad: "bad" };

export function StatusPill({ status, kind = "booking" }) {
  const ui = useTourUi();
  const tone = T2[(kind === "booking" ? bookingTone : tourTone)(status)];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>{(kind === "booking" ? ui.status : ui.tstatus)[status] || status}</span>;
}

export function Rating({ value, count, className = "" }) {
  const ui = useTourUi().search;
  if (!count) return <span className={`text-xs text-ink-faint ${className}`}>{ui.noReview}</span>;
  return <span className={`inline-flex items-center gap-1 text-sm text-ink ${className}`}><Star size={13} className="fill-latte text-latte" aria-hidden="true" /><span className="font-medium">{Number(value).toFixed(1)}</span><span className="text-ink-faint">({count})</span></span>;
}

function BarLink({ to, icon: Icon, label }) {
  return (
    <NavLink to={to} className={({ isActive }) => `inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors ${isActive ? "bg-latte-soft text-coffee" : "text-ink-soft hover:text-ink"}`} aria-label={label}>
      <Icon size={18} /><span className="hidden lg:inline">{label}</span>
    </NavLink>
  );
}

export function TourBar() {
  const ui = useTourUi().bar;
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  useEffect(() => { if (location.pathname !== "/tourisme/recherche") setQ(""); }, [location.pathname]);
  const submit = (e) => { e.preventDefault(); navigate(`/tourisme/recherche${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`); };
  return (
    <div className="sticky top-[68px] z-40 bg-cream/95 backdrop-blur border-b border-line">
      <div className="max-w-content mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
        <Link to="/tourisme" className="font-display text-lg text-ink hidden sm:block whitespace-nowrap pr-1">H-Tourisme</Link>
        <form onSubmit={submit} role="search" className="flex-1 relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ui.where} aria-label={ui.where} className="w-full rounded-full border border-line bg-surface pl-10 pr-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-coffee focus:ring-2 focus:ring-coffee/15" />
        </form>
        <nav className="flex items-center gap-0.5" aria-label="H-Tourisme">
          <BarLink to="/tourisme/mes-reservations" icon={CalendarDays} label={ui.mine} />
          <BarLink to="/tourisme/pro" icon={Store} label={ui.pro} />
        </nav>
      </div>
    </div>
  );
}

export default function TourLayout({ children, width = "max-w-content", hideBar = false }) {
  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <div className="pt-[68px]">
        {!hideBar && <TourBar />}
        <main className={`${width} mx-auto px-4 sm:px-6 py-8 sm:py-10`}><PageBack root="/tourisme" />{children}</main>
      </div>
      <Footer />
    </div>
  );
}

export function TourAuthGate({ children, message, width = "max-w-xl" }) {
  const ui = useTourUi().common;
  const { isAuthenticated, isLoading } = useUser();
  const loc = useLocation();
  if (isLoading) return <TourLayout><Spinner label={ui.loading} /></TourLayout>;
  if (!isAuthenticated) {
    const redirectTo = loc.pathname + loc.search;
    return (
      <TourLayout width={width}>
        <div className="rounded-3xl border border-line bg-surface p-10 text-center">
          <Mountain className="mx-auto text-coffee mb-4" />
          <p className="text-ink mb-6">{message || ui.signInRequired}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/connexion" state={{ redirectTo }} className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5">{ui.signIn}</Link>
            <Link to="/creer-un-compte" state={{ redirectTo }} className="rounded-full border border-line text-ink text-sm font-medium px-6 py-3.5">{ui.createAccount}</Link>
          </div>
        </div>
      </TourLayout>
    );
  }
  return children;
}

export function TourCard({ t, index = 0, query = "" }) {
  const ui = useTourUi();
  const { lang } = useLanguage();
  const { money } = useShopMoney();
  return (
    <Link to={`/tourisme/t/${t.slug}${query}`} className="group block rounded-3xl border border-line bg-surface overflow-hidden hover:border-coffee-light transition-colors" style={{ contentVisibility: index > 8 ? "auto" : undefined }}>
      <div className="relative overflow-hidden">
        <TourImage path={t.image} alt={t.title} ratio="aspect-[4/3]" className="group-hover:scale-[1.02] transition-transform duration-500" />
        <span className="absolute top-3 left-3 rounded-full bg-white/92 text-black text-[11px] font-medium px-2.5 py-1">{ui.cats[t.category] || t.category}</span>
        {t.instant_confirm && <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/92 text-black text-[11px] font-medium px-2.5 py-1"><Zap size={11} />{ui.search.instant}</span>}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3"><h3 className="font-display text-lg text-ink leading-tight">{t.title}</h3><Rating value={t.rating_avg} count={t.rating_count} className="shrink-0 mt-0.5" /></div>
        <p className="text-sm text-ink-soft mt-1 inline-flex flex-wrap items-center gap-x-2"><span>{t.city}</span><span aria-hidden="true">·</span><span className="inline-flex items-center gap-1"><Clock size={13} />{fmtDuration(t.duration_hours, lang)}</span><span aria-hidden="true">·</span><span>{ui.diff[t.difficulty]}</span></p>
        {t.summary && <p className="text-sm text-ink-faint mt-2 line-clamp-2">{t.summary}</p>}
        <div className="flex items-end justify-between mt-4">
          <p className="text-ink"><span className="text-xs text-ink-faint">{ui.common.from} </span><span className="font-medium">{money(t.from_price)}</span><span className="text-xs text-ink-faint"> {ui.common.perAdult}</span></p>
          <p className={`text-xs font-medium ${t.next_day ? "text-emerald-700 dark:text-emerald-300" : "text-ink-faint"}`}>{t.next_day ? `${ui.search.next} : ${fmtDay(t.next_day, lang, { day: "numeric", month: "short" })}` : ui.search.noDeparture}</p>
        </div>
      </div>
    </Link>
  );
}

export function TourUploader({ onUploaded, label, multiple = false }) {
  const ui = useTourUi().pro.info;
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
      for (const f of files) paths.push((await withAuth((t) => api.tour.owner.upload(t, f))).path);
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
