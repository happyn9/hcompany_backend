import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { api } from "../../lib/api.js";

const THEME = {
  coffee: "linear-gradient(135deg,#4A3020,#2A1A10)", gold: "linear-gradient(135deg,#D9B05A,#B8862C)",
  ink: "linear-gradient(135deg,#2A1A10,#120A05)", cream: "linear-gradient(135deg,#F3E9D6,#E4D3B3)",
};
const LIGHT = new Set(["cream", "gold"]);

function Ad({ p, variant }) {
  const seen = useRef(false), box = useRef(null);
  useEffect(() => { // impression comptée une seule fois, quand l'encart est réellement visible
    const el = box.current; if (!el || seen.current) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting && !seen.current) { seen.current = true; api.promos.seen(p.id); io.disconnect(); } }, { threshold: 0.5 });
    io.observe(el); return () => io.disconnect();
  }, [p.id]);
  const light = LIGHT.has(p.theme) && !p.image_url;
  const ext = /^https?:/.test(p.link);
  const cls = `group relative overflow-hidden rounded-2xl flex ${variant === "banner" ? "flex-row items-center gap-4 p-4 sm:p-5" : "flex-col justify-end p-5 min-h-[150px]"} ${light ? "text-ink-fixed" : "text-cream-fixed"}`;
  const style = { background: p.image_url ? `linear-gradient(0deg,rgba(18,10,5,.82),rgba(18,10,5,.25)), url(${p.image_url}) center/cover` : THEME[p.theme] || THEME.coffee };
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-[0.18em] opacity-70 mb-1">{p.sponsored ? "Sponsorisé" : "H-Company"}</p>
        <p className="font-display text-lg sm:text-xl leading-snug">{p.title}</p>
        {p.body && <p className="text-sm opacity-80 mt-1 line-clamp-2">{p.body}</p>}
      </div>
      <span className={`inline-flex items-center gap-1.5 self-start ${variant === "banner" ? "shrink-0 self-center" : "mt-4"} rounded-full text-xs font-semibold px-4 py-2 ${light ? "bg-ink-fixed text-cream-fixed" : "bg-[#C89A3D] text-ink-fixed"} group-hover:brightness-110`}>{p.cta_label}<ArrowUpRight size={13} /></span>
    </>
  );
  const click = () => api.promos.clicked(p.id);
  return (
    <div ref={box}>
      {ext
        ? <a href={p.link} target="_blank" rel="noopener noreferrer sponsored" onClick={click} className={cls} style={style}>{inner}</a>
        : <Link to={p.link} onClick={click} className={cls} style={style}>{inner}</Link>}
    </div>
  );
}

/** Espace pub responsive : « grid » (cartes en colonnes) ou « banner » (bandeau pleine largeur). N'affiche rien s'il n'y a rien à montrer. */
export default function PromoSlot({ placement = "app_home", limit = 3, variant = "grid", className = "" }) {
  const [items, setItems] = useState([]);
  useEffect(() => { let on = true; api.promos.serve(placement, limit).then((r) => on && setItems(r)).catch(() => {}); return () => { on = false; }; }, [placement, limit]);
  if (!items.length) return null;
  const cols = variant === "banner" ? "grid-cols-1" : items.length === 1 ? "grid-cols-1" : items.length === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3";
  return <aside aria-label="Publicités" className={`grid gap-3 ${cols} ${className}`}>{items.map((p) => <Ad key={p.id} p={p} variant={variant} />)}</aside>;
}
