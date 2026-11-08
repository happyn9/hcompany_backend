import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { OperatorLogo } from "../OperatorPicker.jsx";

/** Design H-Money « façon transfert d'argent moderne » : cartes sobres, bouton bleu nuit arrondi, barre de progression fine. */
export const NAVY = "#32465E";
export const btn = "w-full inline-flex items-center justify-center gap-2 rounded-full text-white font-bold h-14 text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110";
export const btnOutline = "inline-flex items-center justify-center rounded-full border-2 font-bold h-14 px-10 text-base transition-colors hover:bg-black/5";
export const field = "w-full rounded-lg border border-line bg-surface px-4 h-14 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-[#32465E] focus:ring-1 focus:ring-[#32465E]";
export const bare = "flex-1 min-w-0 bg-transparent text-lg outline-none !shadow-none !ring-0 !border-0 text-ink";

export function Primary({ children, busy, ...p }) {
  return <button {...p} disabled={p.disabled || busy} className={`${btn} ${p.className || ""}`} style={{ background: NAVY }}>{busy && <Loader2 size={18} className="animate-spin" />}{children}</button>;
}

/** Cadre d'une étape : « Retour », barre de progression, contenu centré (500 px). */
export function Frame({ onBack, progress = 0, children, wide = false }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 sm:px-10 pt-5 pb-10 min-h-[420px]">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 font-bold text-sm" style={{ color: NAVY }}><ChevronLeft size={18} />Retour</button>
      <div className={`mx-auto mt-2 ${wide ? "max-w-[640px]" : "max-w-[500px]"}`}>
        <div className="h-1 rounded-full bg-line overflow-hidden mb-8"><div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.round(progress * 100)}%`, background: NAVY }} /></div>
        {children}
      </div>
    </div>
  );
}

export const H = ({ children, sub }) => <div className="mb-5"><h2 className="font-bold text-xl text-ink">{children}</h2>{sub && <p className="text-sm text-ink-soft mt-1">{sub}</p>}</div>;

/** Ligne d'opérateur : logo + nom + chevron (liste de choix), ou sélection radio. */
export function OpRow({ op, label, onClick, selected }) {
  return (
    <button type="button" onClick={onClick} role="radio" aria-checked={!!selected} className={`w-full flex items-center gap-4 rounded-lg border bg-surface px-3 py-3 text-left transition-colors hover:border-[#32465E] ${selected ? "border-2 border-[#32465E]" : "border-line"}`}>
      <span className="w-[70px] h-[46px] rounded-md border border-line bg-white overflow-hidden flex items-center justify-center shrink-0"><OperatorLogo op={op} className="w-full h-full" /></span>
      <span className="flex-1 font-bold text-ink">{label}</span>
      <ChevronRight size={18} className="text-ink-soft" />
    </button>
  );
}

export function Row({ k, v, strong, tone }) {
  return <div className={`flex justify-between gap-4 py-1 ${strong ? "font-bold text-ink" : "text-ink"}`}><span>{k}</span><span className={`tabular-nums text-right ${tone === "good" ? "text-emerald-700" : ""}`}>{v}</span></div>;
}

export const SOON = [["NA", "Namibie", "🇳🇦"], ["TZ", "Tanzanie", "🇹🇿"], ["ZA", "Afrique du Sud", "🇿🇦"]];
export function SoonChips({ fr = true }) {
  return (
    <p className="text-xs text-ink-faint leading-relaxed">
      <span className="font-semibold text-ink-soft">{fr ? "Bientôt :" : "Coming soon:"}</span> {SOON.map(([c, n, f]) => <span key={c} className="inline-flex items-center gap-1 mr-2 whitespace-nowrap">{f} {n}</span>)}
    </p>
  );
}

/* Illustrations originales (plates, légères) — pas de ressource externe. */
export const IlloRates = () => (
  <svg viewBox="0 0 96 64" className="w-24 h-16" aria-hidden="true">
    <rect x="6" y="8" width="30" height="30" rx="6" fill="#F7B267" /><circle cx="21" cy="23" r="9" fill="#fff" opacity=".85" /><text x="21" y="27" textAnchor="middle" fontSize="11" fontWeight="700" fill="#B5651D">$</text>
    <rect x="40" y="4" width="46" height="34" rx="6" fill="#7FB7BE" /><rect x="47" y="23" width="6" height="9" fill="#fff" /><rect x="57" y="17" width="6" height="15" fill="#fff" /><rect x="67" y="11" width="6" height="21" fill="#fff" />
    <rect x="22" y="34" width="38" height="24" rx="6" fill="#fff" stroke="#32465E" strokeWidth="2" /><rect x="28" y="42" width="26" height="4" rx="2" fill="#32465E" opacity=".6" /><rect x="28" y="50" width="16" height="4" rx="2" fill="#32465E" opacity=".35" />
    <circle cx="76" cy="46" r="11" fill="#E8735A" /><text x="76" y="50" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">%</text>
  </svg>
);
export const IlloTrack = () => (
  <svg viewBox="0 0 96 64" className="w-24 h-16" aria-hidden="true">
    <rect x="28" y="2" width="38" height="58" rx="7" fill="#fff" stroke="#32465E" strokeWidth="2" /><path d="M38 22l6 6 12-13" fill="none" stroke="#2F8F83" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="36" y="36" width="22" height="3" rx="1.5" fill="#32465E" opacity=".4" /><rect x="36" y="43" width="16" height="3" rx="1.5" fill="#32465E" opacity=".25" />
    <circle cx="16" cy="18" r="5" fill="#E8735A" /><rect x="11" y="24" width="10" height="26" rx="5" fill="#E8735A" /><rect x="12" y="48" width="3" height="12" fill="#32465E" /><rect x="17" y="48" width="3" height="12" fill="#32465E" />
    <path d="M76 56c0-10 2-18 8-24" stroke="#4C8C4A" strokeWidth="3" fill="none" strokeLinecap="round" /><ellipse cx="82" cy="34" rx="7" ry="4" fill="#4C8C4A" /><ellipse cx="74" cy="44" rx="7" ry="4" fill="#6AA84F" /><rect x="70" y="54" width="14" height="8" rx="2" fill="#F7B267" />
  </svg>
);
export const IlloSafe = () => (
  <svg viewBox="0 0 96 64" className="w-24 h-16" aria-hidden="true">
    <path d="M36 30v-8a12 12 0 0124 0v8" fill="none" stroke="#8A8F98" strokeWidth="7" strokeLinecap="round" />
    <rect x="28" y="28" width="40" height="32" rx="6" fill="#F7B267" /><circle cx="48" cy="42" r="4" fill="#32465E" /><rect x="46.5" y="44" width="3" height="8" rx="1.5" fill="#32465E" />
    <path d="M74 10l1.6 4.4L80 16l-4.4 1.6L74 22l-1.6-4.4L68 16l4.4-1.6z" fill="#F7B267" /><path d="M14 22l1.2 3.2L18.5 26l-3.3 1.2L14 30.5l-1.2-3.3L9.5 26l3.3-.8z" fill="#7FB7BE" />
    <rect x="72" y="46" width="14" height="14" rx="4" fill="#7FB7BE" /><rect x="12" y="50" width="9" height="10" rx="4" fill="#E8735A" />
  </svg>
);
export const IlloGift = () => (
  <svg viewBox="0 0 120 120" className="w-full h-full" aria-hidden="true">
    <rect width="120" height="120" fill="#BDE5E8" />
    <rect x="34" y="52" width="52" height="42" rx="4" fill="#7FA650" /><rect x="30" y="44" width="60" height="14" rx="4" fill="#8DB85C" /><rect x="56" y="44" width="8" height="50" fill="#D9E8B8" />
    <path d="M60 44c-10-16-24-10-16-2s16 2 16 2zM60 44c10-16 24-10 16-2s-16 2-16 2z" fill="none" stroke="#D9E8B8" strokeWidth="4" />
    <circle cx="96" cy="46" r="13" fill="#2F7F8F" /><text x="96" y="51" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff">%</text>
    <circle cx="26" cy="60" r="7" fill="#E8735A" /><rect x="20" y="66" width="12" height="30" rx="6" fill="#E8735A" />
    <circle cx="96" cy="76" r="7" fill="#F7B267" /><rect x="90" y="82" width="12" height="26" rx="6" fill="#32465E" />
    <circle cx="16" cy="24" r="2.5" fill="#E8735A" /><circle cx="104" cy="22" r="2.5" fill="#F7B267" /><circle cx="70" cy="22" r="2" fill="#7FA650" />
  </svg>
);
