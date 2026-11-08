import { PageBack } from "../ui/BackButton.jsx";
import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeftRight, ArrowRight, Armchair, BadgeCheck, Bus, Droplets, Loader2, Lock, Luggage, Plug, Search, Snowflake, Star, Ticket, Toilet, Tv, Wifi, Coffee,
  Briefcase, MoveRight, Check, Package,
} from "lucide-react";
import QRCode from "qrcode";
import NavBar from "../layout/NavBar.jsx";
import Footer from "../layout/Footer.jsx";
import { TRANSPORT_UI } from "../../i18n/transportUi.js";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import { api } from "../../lib/api.js";
import { OPERATORS, operatorByKey } from "../../lib/pricing.js";
import { fmtDay, fmtTime, formatDuration, formatRating, nextDays, seatRows, tone, todayISO, addDays } from "../../lib/transport.js";

export { Spinner, ErrorState, EmptyState } from "../shop/Shared.jsx";
export { Modal } from "../lodge/HostUi.jsx";
import { Spinner } from "../shop/Shared.jsx";

export function useTransportUi() {
  const { lang } = useLanguage();
  return TRANSPORT_UI[lang] || TRANSPORT_UI.fr;
}

export const inputCls = "w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-coffee focus:ring-2 focus:ring-coffee/15";

export function Field({ label, hint, error, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-sm font-medium text-ink mb-1.5">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-ink-faint mt-1">{hint}</span>}
      {error && <span role="alert" className="block text-xs text-red-600 dark:text-red-300 mt-1">{error}</span>}
    </label>
  );
}

export function Card({ children, className = "" }) {
  return <section className={`rounded-3xl border border-line bg-surface p-5 sm:p-6 ${className}`}>{children}</section>;
}

// --- Métadonnées (villes, équipements, règles), chargées une fois ---------------

let metaPromise = null;
export function useTransportMeta() {
  const { lang } = useLanguage();
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!metaPromise) metaPromise = api.transport.meta().catch(() => { metaPromise = null; return null; });
    metaPromise.then((d) => alive && setMeta(d));
    return () => { alive = false; };
  }, []);
  const labels = useMemo(() => Object.fromEntries((meta?.amenities || []).map((a) => [a.key, lang === "en" ? a.en : a.fr])), [meta, lang]);
  return { meta, cities: meta?.cities || [], amenities: meta?.amenities || [], label: (k) => labels[k] || k.replace(/_/g, " "), policy: meta?.policy || {} };
}

const AMENITY_ICONS = { ac: Snowflake, wifi: Wifi, usb: Plug, toilet: Toilet, reclining: Armchair, snacks: Coffee, tv: Tv, luggage: Luggage, luggage_extra: Briefcase, water: Droplets };
export function AmenityChip({ name }) {
  const { label } = useTransportMeta();
  const Icon = AMENITY_ICONS[name] || Check;
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-latte-soft text-coffee px-2.5 py-1 text-xs"><Icon size={13} aria-hidden="true" />{label(name)}</span>;
}

// --- Petits éléments -------------------------------------------------------------

const TONES = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  wait: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  bad: "bg-red-500/10 text-red-700 dark:text-red-300",
  info: "bg-latte-soft text-coffee",
};
export function StatusPill({ status, toneOverride }) {
  const ui = useTransportUi();
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${TONES[toneOverride || tone(status)]}`}>{ui.status[status] || status}</span>;
}

export function Rating({ value, count, className = "" }) {
  const { lang } = useLanguage();
  const ui = useTransportUi().common;
  if (!count) return <span className={`text-xs text-ink-faint ${className}`}>{ui.newOperator}</span>;
  return (
    <span className={`inline-flex items-center gap-1 text-sm text-ink ${className}`} aria-label={`${formatRating(value, lang)} / 5 · ${ui.reviews(count)}`}>
      <Star size={13} className="fill-latte text-latte" aria-hidden="true" />
      <span className="font-medium">{formatRating(value, lang)}</span>
      <span className="text-ink-faint">({count})</span>
    </span>
  );
}

export function OperatorBadge({ operator, className = "" }) {
  const ui = useTransportUi().common;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm text-ink ${className}`}>
      <span className="font-medium">{operator.name}</span>
      {operator.is_verified && <BadgeCheck size={15} className="text-coffee" aria-label={ui.verified} />}
    </span>
  );
}

export function BusyButton({ busy, children, className = "", ...rest }) {
  return (
    <button {...rest} disabled={busy || rest.disabled} className={`inline-flex items-center justify-center gap-2 disabled:opacity-60 ${className}`}>
      {busy && <Loader2 size={16} className="animate-spin" />} {children}
    </button>
  );
}

// --- Gabarit ----------------------------------------------------------------------

function BarLink({ to, icon: Icon, label }) {
  return (
    <NavLink to={to} aria-label={label} className={({ isActive }) => `inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors ${isActive ? "bg-latte-soft text-coffee" : "text-ink-soft hover:text-ink"}`}>
      <Icon size={18} /><span className="hidden sm:inline">{label}</span>
    </NavLink>
  );
}

export default function TransportLayout({ children, width = "max-w-content", hideBar = false, className = "" }) {
  const ui = useTransportUi().bar;
  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <div className="pt-[68px]">
        {!hideBar && (
          <div className="sticky top-[68px] z-40 bg-cream/95 backdrop-blur border-b border-line print:hidden">
            <div className="max-w-content mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 justify-between">
              <Link to="/transport" className="font-display text-lg text-ink whitespace-nowrap inline-flex items-center gap-2"><Bus size={18} className="text-coffee" />H-Transport</Link>
              <nav className="flex items-center gap-0.5" aria-label="H-Transport">
                <BarLink to="/transport/recherche" icon={Search} label={ui.search} />
                <BarLink to="/transport/mes-billets" icon={Ticket} label={ui.tickets} />
                <BarLink to="/transport/colis" icon={Package} label={ui.cargo || "Colis"} />
                <BarLink to="/transport/agence" icon={Bus} label={ui.operator} />
              </nav>
            </div>
          </div>
        )}
        <main className={`${width} mx-auto px-4 sm:px-6 py-8 sm:py-10 ${className}`}><PageBack root="/transport" />{children}</main>
      </div>
      <div className="print:hidden"><Footer /></div>
    </div>
  );
}

export function TransportAuthGate({ children, message, width = "max-w-xl" }) {
  const ui = useTransportUi().common;
  const { isAuthenticated, isLoading } = useUser();
  const loc = useLocation();
  if (isLoading) return <TransportLayout><Spinner label={ui.loading} /></TransportLayout>;
  if (!isAuthenticated) {
    const redirectTo = loc.pathname + loc.search;
    return (
      <TransportLayout width={width}>
        <div className="rounded-3xl border border-line bg-surface p-10 text-center">
          <Lock className="mx-auto text-coffee mb-4" />
          <p className="text-ink mb-6">{message || ui.signInRequired}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/connexion" state={{ redirectTo }} className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5">{ui.signIn}</Link>
            <Link to="/creer-un-compte" state={{ redirectTo }} className="rounded-full border border-line text-ink text-sm font-medium px-6 py-3.5">{ui.createAccount}</Link>
          </div>
        </div>
      </TransportLayout>
    );
  }
  return children;
}

// --- Formulaire de recherche -------------------------------------------------------

export function SearchForm({ initial = {}, onSubmit, compact = false }) {
  const ui = useTransportUi().form;
  const { cities } = useTransportMeta();
  const [v, setV] = useState({ origin: initial.origin || "", destination: initial.destination || "", date: initial.date || todayISO(), seats: Number(initial.seats) || 1 });
  useEffect(() => { setV((s) => ({ ...s, origin: initial.origin || "", destination: initial.destination || "", date: initial.date || s.date, seats: Number(initial.seats) || 1 })); }, [initial.origin, initial.destination, initial.date, initial.seats]);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const swap = () => setV((s) => ({ ...s, origin: s.destination, destination: s.origin }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...v, seats: Math.max(1, Math.min(8, Number(v.seats) || 1)) }); }} className={`rounded-3xl border border-line bg-surface p-4 sm:p-5 grid gap-3 ${compact ? "md:grid-cols-[1fr_auto_1fr_160px_90px_auto]" : "md:grid-cols-[1fr_auto_1fr_170px_100px_auto]"} items-end`} role="search">
      <Field label={ui.from}><input list="tr-cities" className={inputCls} value={v.origin} onChange={set("origin")} placeholder={ui.fromPlaceholder} autoComplete="off" /></Field>
      <button type="button" onClick={swap} aria-label={ui.swap} className="hidden md:flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink-soft hover:text-coffee self-end"><ArrowLeftRight size={16} /></button>
      <Field label={ui.to}><input list="tr-cities" className={inputCls} value={v.destination} onChange={set("destination")} placeholder={ui.toPlaceholder} autoComplete="off" /></Field>
      <Field label={ui.date}><input type="date" className={inputCls} value={v.date} min={todayISO()} onChange={set("date")} /></Field>
      <Field label={ui.seats}><input type="number" min="1" max="8" className={inputCls} value={v.seats} onChange={set("seats")} /></Field>
      <button className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5 inline-flex items-center justify-center gap-2 h-[46px]"><Search size={16} />{ui.search}</button>
      <datalist id="tr-cities">{cities.map((c) => <option key={c} value={c} />)}</datalist>
    </form>
  );
}

/** Bandeau des 7 prochains jours : choisir un autre jour en un geste. */
export function DayStrip({ value, onChange }) {
  const { lang } = useLanguage();
  const days = nextDays(10);
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label={useTransportUi().search.dayStrip}>
      {days.map((d) => (
        <button key={d} onClick={() => onChange(d)} aria-pressed={d === value} className={`shrink-0 rounded-2xl border px-3.5 py-2 text-center text-sm transition ${d === value ? "border-coffee bg-latte-soft text-ink" : "border-line text-ink-soft hover:border-coffee-light"}`}>
          <span className="block text-xs capitalize">{fmtDay(d, lang, { weekday: "short" })}</span>
          <span className="block font-medium">{fmtDay(d, lang, { day: "numeric", month: "short" })}</span>
        </button>
      ))}
    </div>
  );
}

// --- Départ ------------------------------------------------------------------------

export function RouteLine({ trip }) {
  const ui = useTransportUi();
  const { lang } = useLanguage();
  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <div className="text-left"><p className="font-display text-2xl text-ink leading-none">{fmtTime(trip.departure_at)}</p><p className="text-xs text-ink-soft mt-1">{trip.origin}</p></div>
      <div className="flex-1 flex flex-col items-center min-w-[70px]">
        <span className="text-[11px] text-ink-faint">{formatDuration(trip.duration_minutes, lang)}</span>
        <span className="w-full flex items-center text-line"><span className="h-px flex-1 bg-line" /><MoveRight size={16} className="text-ink-faint -ml-1" /></span>
      </div>
      <div className="text-right"><p className="font-display text-2xl text-ink leading-none">{fmtTime(trip.arrival_at)}</p><p className="text-xs text-ink-soft mt-1">{trip.destination}</p></div>
      <span className="sr-only">{ui.search.arrives}</span>
    </div>
  );
}

export function TripCard({ trip, query = "", money, index = 0 }) {
  const ui = useTransportUi();
  const { lang } = useLanguage();
  const seatsText = !trip.bookable ? (trip.seats_left <= 0 ? ui.search.full : ui.search.closed) : trip.seats_left <= 5 ? ui.search.onlyLeft(trip.seats_left) : ui.search.left(trip.seats_left);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.04 }}>
      <Link to={`/transport/trajet/${trip.id}${query ? `?${query}` : ""}`} className="block rounded-3xl border border-line bg-surface p-5 hover:border-coffee-light hover:shadow-lg hover:shadow-coffee/5 transition">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <OperatorBadge operator={trip.operator} />
            <div className="flex items-center gap-3 mt-1"><Rating value={trip.operator.rating_avg} count={trip.operator.rating_count} /><span className="text-xs text-ink-faint capitalize">{fmtDay(trip.departure_at, lang)}</span></div>
          </div>
          <div className="text-right"><p className="font-display text-2xl text-ink">{money(trip.price)}</p><p className="text-xs text-ink-faint">{ui.common.perSeat}</p></div>
        </div>
        <RouteLine trip={trip} />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-latte-soft text-coffee px-2.5 py-1 text-xs">{ui.bus[trip.bus_type] || trip.bus_type}</span>
          {trip.border_crossing && <span className="rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2.5 py-1 text-xs">{ui.common.border}</span>}
          {trip.amenities.slice(0, 3).map((a) => <AmenityChip key={a} name={a} />)}
          <span className={`ml-auto text-xs font-medium ${trip.bookable && trip.seats_left > 5 ? "text-ink-soft" : trip.bookable ? "text-amber-700 dark:text-amber-300" : "text-red-700 dark:text-red-300"}`}>{seatsText}</span>
          <span className="inline-flex items-center gap-1 text-sm text-coffee font-medium">{ui.search.view} <ArrowRight size={14} /></span>
        </div>
      </Link>
    </motion.div>
  );
}

// --- Plan du bus ---------------------------------------------------------------------

export function SeatMap({ total, taken = [], selected = [], onToggle, readOnly = false, layout = "2+2" }) {
  const ui = useTransportUi().trip;
  const rows = useMemo(() => seatRows(total, layout), [total, layout]);
  const takenSet = new Set(taken);
  return (
    <div>
      <div className="flex flex-wrap gap-4 text-xs text-ink-soft mb-4" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><i className="w-4 h-4 rounded border border-line bg-surface inline-block" />{ui.free}</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-4 h-4 rounded bg-coffee inline-block" />{ui.chosen}</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-4 h-4 rounded bg-line inline-block" />{ui.taken}</span>
      </div>
      <div className="mx-auto w-full max-w-[280px] rounded-[2rem] border border-line bg-cream p-4">
        <p className="text-center text-[11px] text-ink-faint mb-3 border-b border-dashed border-line pb-2">{ui.front}</p>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="grid gap-2" style={{ gridTemplateColumns: row.map((c) => (c === null ? "20px" : "1fr")).join(" ") }}>
              {row.map((s, j) => {
                if (s === null) return <span key={j} />;
                if (s === "gap") return <span key={j} />;
                const isTaken = takenSet.has(s);
                const isSel = selected.includes(s);
                return (
                  <button
                    key={j} type="button" disabled={isTaken || readOnly} aria-pressed={isSel} aria-label={`${ui.free === "Libre" ? "Siège" : "Seat"} ${s}${isTaken ? ` (${ui.taken})` : ""}`}
                    onClick={() => onToggle?.(s)}
                    className={`h-10 rounded-lg text-xs font-medium transition ${isTaken ? "bg-line text-ink-faint cursor-not-allowed" : isSel ? "bg-coffee text-cream-fixed" : "border border-line bg-surface text-ink hover:border-coffee"}`}
                  >{s}</button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Billet QR --------------------------------------------------------------------------

export function TicketQR({ code, size = 168 }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(code, { width: size * 2, margin: 1, errorCorrectionLevel: "M", color: { dark: "#1a1a1a", light: "#ffffff" } })
      .then((u) => alive && setSrc(u)).catch(() => alive && setSrc(""));
    return () => { alive = false; };
  }, [code, size]);
  return (
    <div className="rounded-2xl bg-white p-2 inline-block" style={{ width: size + 16, height: size + 16 }}>
      {src ? <img src={src} alt={`QR ${code}`} width={size} height={size} /> : <div className="flex items-center justify-center h-full text-ink-faint"><Loader2 className="animate-spin" size={18} /></div>}
    </div>
  );
}

// --- Paiement mobile money -----------------------------------------------------------------

export function usePayBox() {
  const [operator, setOperator] = useState(OPERATORS[0].key);
  const [prefix, setPrefix] = useState(OPERATORS[0].prefixes[0]);
  const [digits, setDigits] = useState("");
  return { operator, setOperator, prefix, setPrefix, digits, setDigits };
}

export function PayBox({ box, error }) {
  const b = useTransportUi().book;
  const op = operatorByKey(box.operator);
  return (
    <div>
      <p className="text-sm font-medium text-ink mb-3">{b.payWith}</p>
      <div className="grid grid-cols-3 gap-3 mb-5" role="radiogroup" aria-label={b.payWith}>
        {OPERATORS.map((o) => (
          <button key={o.key} type="button" role="radio" aria-checked={box.operator === o.key} onClick={() => { box.setOperator(o.key); box.setPrefix(operatorByKey(o.key).prefixes[0]); }}
            className={`rounded-2xl border p-3 text-sm font-medium transition ${box.operator === o.key ? "border-coffee bg-latte-soft text-ink" : "border-line text-ink-soft hover:border-coffee-light"}`}>
            <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: o.accent }} />{o.label}
          </button>
        ))}
      </div>
      <Field label={b.number} hint={b.numberHint} error={error}>
        <div className="flex gap-2">
          {op.prefixes.length > 1 ? (
            <select aria-label="prefix" value={box.prefix} onChange={(e) => box.setPrefix(e.target.value)} className={`${inputCls} !w-24`}>{op.prefixes.map((x) => <option key={x} value={x}>0{x}</option>)}</select>
          ) : <span className={`${inputCls} !w-24 text-center`}>0{box.prefix}</span>}
          <input className={inputCls} inputMode="numeric" autoComplete="tel-national" maxLength={7} value={box.digits} onChange={(e) => box.setDigits(e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="1234567" />
        </div>
      </Field>
    </div>
  );
}

export { addDays };
