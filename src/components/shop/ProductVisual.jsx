import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { uploadUrl } from "../../lib/api.js";
import { isCutout, tintedUrl } from "../../lib/colorize.js";

/** Image d'article : détourée → posée sur un fond doux avec ombre, et « habillée » de la couleur choisie. */
export default function ProductVisual({ path, alt = "", hex = null, className = "", ratio = "aspect-[4/5]", padded = true }) {
  const src = uploadUrl(path);
  const cut = isCutout(path);
  const [tinted, setTinted] = useState(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    let alive = true;
    setTinted(null);
    if (src && cut && hex) tintedUrl(src, hex).then((u) => alive && setTinted(u));
    return () => { alive = false; };
  }, [src, cut, hex]);
  const shown = tinted || src;
  return (
    <div className={`${ratio} relative overflow-hidden flex items-center justify-center ${cut ? "bg-gradient-to-b from-cream via-latte-soft to-latte-soft/70" : "bg-latte-soft"} ${className}`}>
      {cut && <span aria-hidden="true" className="absolute left-1/2 -translate-x-1/2 bottom-[9%] w-3/5 h-4 rounded-[50%] bg-ink/15 blur-md" />}
      {shown && !broken ? (
        <img src={shown} alt={alt} loading="lazy" onError={() => setBroken(true)}
          decoding="async"
          className={cut ? `relative w-full h-full object-contain ${padded ? "p-[9%]" : ""}` : "w-full h-full object-cover"} />
      ) : <ImageIcon className="text-latte" size={28} aria-hidden="true" />}
    </div>
  );
}

export function Swatches({ colors = [], value, onChange, size = "w-6 h-6", className = "" }) {
  if (!colors.length) return null;
  return (
    <div className={`flex items-center gap-1.5 ${className}`} role="radiogroup">
      {colors.map((c) => (
        <button key={c.name} type="button" role="radio" aria-checked={value === c.name} aria-label={c.name} title={c.name}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(value === c.name ? null : c.name); }}
          className={`${size} rounded-full border border-black/10 ring-offset-2 ring-offset-surface transition ${value === c.name ? "ring-2 ring-coffee scale-110" : "hover:scale-110"}`} style={{ background: c.hex }} />
      ))}
    </div>
  );
}
