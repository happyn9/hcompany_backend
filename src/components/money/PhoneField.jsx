import { useMemo } from "react";

const DIALS = { ZM: { dial: "260", flag: "🇿🇲", name: "Zambie" }, CD: { dial: "243", flag: "🇨🇩", name: "RD Congo" } };

/** Numéro mobile avec indicateur du pays (drapeau + +260 / +243) : la personne tape le numéro local, l'indicatif est affiché et ajouté. */
export default function PhoneField({ country = "ZM", value, onChange, required = true, className = "" }) {
  const d = DIALS[country] || DIALS.ZM;
  const local = useMemo(() => {
    let v = (value || "").replace(/[^\d+]/g, "");
    if (v.startsWith("+" + d.dial)) v = v.slice(d.dial.length + 1);
    else if (v.startsWith("00" + d.dial)) v = v.slice(d.dial.length + 2);
    else if (v.startsWith(d.dial) && v.length > 9) v = v.slice(d.dial.length);
    return v.replace(/^\+/, "").replace(/^0/, "");
  }, [value, d.dial]);
  return (
    <div className={`flex items-stretch rounded-xl border border-line bg-cream focus-within:border-coffee overflow-hidden ${className}`}>
      <span className="flex items-center gap-1.5 px-3 bg-latte-soft/60 text-sm text-coffee-dark border-r border-line whitespace-nowrap" title={d.name}>
        <span aria-hidden="true">{d.flag}</span>+{d.dial}
      </span>
      <input required={required} type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={12} placeholder="97 123 4567"
        value={local} onChange={(e) => { const n = e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 9); onChange(n ? `+${d.dial}${n}` : ""); }}
        className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm outline-none" />
    </div>
  );
}
