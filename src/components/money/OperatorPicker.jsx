import { Check, Sparkles } from "lucide-react";

/** Tuiles d'opérateurs (marque de couleur + nom), façon « choisir un moyen de paiement ». Ce sont des repères visuels, pas les logos officiels. */
const BRAND = {
  mtn: { tint: "#FFF6D1", bg: "#FFCB05", fg: "#1A1A1A", text: "MTN", shape: "pill" },
  airtel: { tint: "#FDE8E8", bg: "#FFFFFF", fg: "#E40000", text: "airtel", sub: "money", shape: "word" },
  zamtel: { tint: "#E3F4E8", bg: "#FFFFFF", fg: "#1B9E3E", text: "zamtel", shape: "dot" },
  orange: { tint: "#FFEBD9", bg: "#FF7900", fg: "#FFFFFF", text: "orange", shape: "square" },
  mpesa: { tint: "#E3F4E8", bg: "#FFFFFF", fg: "#2E9B3C", text: "M-PESA", shape: "word" },
  africell: { tint: "#F1E3F5", bg: "#7A2A8C", fg: "#FFFFFF", text: "africell", shape: "word" },
};

export function OperatorLogo({ op, className = "" }) {
  const b = BRAND[op] || { bg: "#EEE", fg: "#333", text: op, shape: "word" };
  return (
    <svg viewBox="0 0 120 64" className={className} role="img" aria-label={b.text}>
      
      {b.shape === "pill" && <><ellipse cx="60" cy="32" rx="44" ry="22" fill={b.bg} /><text x="60" y="40" textAnchor="middle" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="24" fill={b.fg}>{b.text}</text></>}
      {b.shape === "square" && <><rect x="40" y="6" width="40" height="40" fill={b.bg} /><text x="60" y="35" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="11" fill={b.fg}>{b.text}</text><text x="60" y="58" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="11" fill="#1A1A1A">Orange Money</text></>}
      {b.shape === "dot" && <><circle cx="60" cy="24" r="14" fill={b.fg} /><text x="60" y="28" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="9" fill="#fff">zamtel</text><text x="60" y="56" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="12" fill={b.fg}>Kwacha</text></>}
      {b.shape === "word" && <><text x="60" y={b.sub ? 34 : 38} textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="800" fontSize={b.text.length > 6 ? 20 : 24} fill={b.text === "africell" ? b.bg : b.fg}>{b.text}</text>{b.sub && <text x="60" y="52" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="13" fill={b.fg}>{b.sub}</text>}</>}
    </svg>
  );
}

/**
 * ops : [{key,label,pay,receive,cheapest_receive}] d'un pays ; role : "pay" (je paie avec) | "receive" (je reçois chez).
 * hints : { [opKey]: { line: "20 USD", sub: "Frais 16,67 ZMW" } } facultatif.
 */
export default function OperatorPicker({ ops = [], role = "pay", value, onChange, hints = {}, fr = true }) {
  const list = ops.filter((o) => (role === "pay" ? o.pay : o.receive));
  if (!list.length) return <p className="text-sm text-ink-soft">{fr ? "Aucun opérateur disponible pour l'instant." : "No operator available right now."}</p>;
  const onKey = (e, i) => {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const n = list[(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length];
    onChange(n.key);
    e.currentTarget.parentElement.querySelector(`[data-op="${n.key}"]`)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={fr ? "Opérateur" : "Operator"} className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 gap-3">
      {list.map((o, i) => {
        const on = value === o.key, h = hints[o.key], brand = BRAND[o.key];
        return (
          <button type="button" key={o.key} data-op={o.key} role="radio" aria-checked={on} tabIndex={on || (!value && i === 0) ? 0 : -1} onClick={() => onChange(o.key)} onKeyDown={(e) => onKey(e, i)}
            className={`group relative text-left rounded-2xl border-2 bg-surface overflow-hidden transition-all duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-latte ${on ? "border-ink shadow-[0_8px_24px_-8px_rgba(16,20,15,.35)] -translate-y-0.5" : "border-line hover:border-coffee/50 hover:-translate-y-0.5 hover:shadow-md"}`}>
            <span className="relative block" style={{ background: brand?.tint || "#F3EFE8" }}>
              <OperatorLogo op={o.key} className="w-full h-[72px] block" />
              <span aria-hidden="true" className={`absolute top-2.5 left-2.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${on ? "bg-ink border-ink text-cream" : "bg-white/80 border-ink/25"}`}>{on && <Check size={12} strokeWidth={3} />}</span>
              {role === "receive" && o.cheapest_receive && (
                <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-[#1F7A3E] text-white text-[10px] font-semibold px-2 py-1 shadow-sm"><Sparkles size={10} />{fr ? "Frais réduits" : "Lower fees"}</span>
              )}
            </span>
            <span className="block px-3.5 pt-3 pb-3.5">
              <span className="block text-sm font-semibold text-ink">{o.label}</span>
              {h ? (
                <span className="block mt-1.5">
                  <span className="block text-[10px] uppercase tracking-[0.14em] text-ink-faint">{fr ? "Reçu" : "Received"}</span>
                  <span className="block font-display text-xl text-coffee-dark tabular-nums leading-tight">{h.line}</span>
                  <span className="block text-xs text-ink-soft mt-0.5">{h.sub}</span>
                </span>
              ) : (
                <span className="block text-xs text-ink-soft mt-1">{fr ? "Mobile money" : "Mobile money"}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
