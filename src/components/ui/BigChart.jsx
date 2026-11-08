import { useId, useMemo, useState } from "react";

/** Grand graphique en aires (SVG pur, responsive, sans dépendance) : points [{label, value}]. */
export default function BigChart({ data = [], title, subtitle, unit = "", height = 220, className = "" }) {
  const gid = useId();
  const [hover, setHover] = useState(null);
  const W = 640, H = height, P = { l: 8, r: 8, t: 16, b: 24 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const pts = useMemo(() => data.map((d, i) => ({
    x: P.l + (data.length < 2 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (data.length - 1)),
    y: P.t + (1 - d.value / max) * (H - P.t - P.b), ...d,
  })), [data, max, H]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = pts.length ? `${line} L${pts[pts.length - 1].x} ${H - P.b} L${pts[0].x} ${H - P.b} Z` : "";
  const total = data.reduce((a, d) => a + d.value, 0);
  const cur = hover != null ? pts[hover] : null;
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          {title && <h3 className="font-display text-lg text-ink">{title}</h3>}
          {subtitle && <p className="text-xs text-ink-soft mt-0.5">{subtitle}</p>}
        </div>
        <div className="text-right">
          <p className="font-display text-3xl text-ink tabular-nums leading-none">{cur ? cur.value : total}<span className="text-sm text-ink-soft ml-1">{unit}</span></p>
          <p className="text-[11px] text-ink-faint mt-1">{cur ? cur.label : "Total"}</p>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-3 touch-none" style={{ height }} role="img" aria-label={title || "Graphique"} preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W; let b = 0; pts.forEach((p, i) => { if (Math.abs(p.x - x) < Math.abs(pts[b].x - x)) b = i; }); setHover(b); }}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#C89A3D" stopOpacity=".45" /><stop offset="1" stopColor="#C89A3D" stopOpacity="0" /></linearGradient></defs>
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={P.l} x2={W - P.r} y1={P.t + g * (H - P.t - P.b)} y2={P.t + g * (H - P.t - P.b)} stroke="currentColor" className="text-line" strokeDasharray="3 5" />)}
        {area && <path d={area} fill={`url(#${gid})`} />}
        {line && <path d={line} fill="none" stroke="#C89A3D" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        {cur && <><line x1={cur.x} x2={cur.x} y1={P.t} y2={H - P.b} stroke="#C89A3D" strokeOpacity=".5" /><circle cx={cur.x} cy={cur.y} r="5" fill="#C89A3D" stroke="#fff" strokeWidth="2" /></>}
        {pts.length > 0 && [0, Math.floor((pts.length - 1) / 2), pts.length - 1].map((i) => <text key={i} x={pts[i].x} y={H - 6} fontSize="11" textAnchor={i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"} className="fill-current text-ink-faint">{pts[i].label}</text>)}
      </svg>
    </section>
  );
}
