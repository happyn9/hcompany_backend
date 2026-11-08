import { useRef } from "react";
import { tableSize } from "../../three/models/dining.js";
import { snap } from "../../lib/resto.js";
import { useRestoUi } from "./Shared.jsx";

const ZONE_FILL = { indoor: "#c9a574", terrace: "#8ab58f", vip: "#c48a9c" };

/** Plan 2D éditable : glisser une table la déplace (grille 0,5 m), cliquer la sélectionne. */
export default function TablePlan2D({ w, d, tables, selected, onSelect, onMove }) {
  const ui = useRestoUi().pro.room;
  const svg = useRef(null);
  const drag = useRef(null);
  const toRoom = (e) => {
    const r = svg.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * (w + 2) - 1, ((e.clientY - r.top) / r.height) * (d + 2) - 1];
  };
  const down = (k) => (e) => { e.stopPropagation(); svg.current.setPointerCapture?.(e.pointerId); const [px, pz] = toRoom(e); const tb = tables[k]; drag.current = { k, dx: tb.x - px, dz: tb.z - pz, moved: false }; onSelect(k); };
  const move = (e) => {
    const s = drag.current; if (!s) return;
    const [px, pz] = toRoom(e); s.moved = true;
    const tb = tables[s.k], sz = tableSize(tb);
    onMove(s.k, Math.max(sz.w / 2, Math.min(w - sz.w / 2, snap(px + s.dx))), Math.max(sz.d / 2 + 0.7, Math.min(d - sz.d / 2, snap(pz + s.dz))));
  };
  const up = () => { drag.current = null; };
  const overlaps = new Set();
  tables.forEach((a, i) => tables.forEach((b, j) => {
    if (j <= i || a.is_active === false || b.is_active === false) return;
    const sa = tableSize(a), sb = tableSize(b), ra = Math.max(sa.w, sa.d) / 2 + 0.3, rb = Math.max(sb.w, sb.d) / 2 + 0.3;
    if (Math.hypot(a.x - b.x, a.z - b.z) < ra + rb - 0.2) { overlaps.add(i); overlaps.add(j); }
  }));
  return (
    <div>
      <svg ref={svg} viewBox={`-1 -1 ${w + 2} ${d + 2}`} className="w-full rounded-2xl border border-line bg-surface touch-none select-none" style={{ aspectRatio: `${w + 2} / ${d + 2}` }} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerDown={() => onSelect(null)} role="application" aria-label={ui.title}>
        <defs><pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="currentColor" strokeOpacity=".08" strokeWidth=".02" /></pattern></defs>
        <rect x="0" y="0" width={w} height={d} fill="url(#grid)" stroke="currentColor" strokeWidth=".12" className="text-ink" />
        <rect x="0" y="0" width={w} height="1.3" fill="#7a5a3a" fillOpacity=".25" /><text x={w / 2} y=".8" textAnchor="middle" fontSize=".45" fill="currentColor" className="text-ink-soft">Bar</text>
        <rect x={w / 2 - 0.8} y={d - 0.06} width="1.6" height=".3" fill="#b4554b" /><text x={w / 2} y={d + 0.7} textAnchor="middle" fontSize=".42" fill="currentColor" className="text-ink-soft">{ui.entrance}</text>
        {tables.map((tb, k) => {
          const sz = tableSize(tb), sel = selected === k, bad = overlaps.has(k);
          return (
            <g key={tb.id ?? `n${k}`} transform={`translate(${tb.x} ${tb.z}) rotate(${tb.rotation || 0})`} onPointerDown={down(k)} className="cursor-grab" opacity={tb.is_active === false ? 0.35 : 1}>
              {tb.shape === "round" ? <circle r={sz.w / 2} fill={ZONE_FILL[tb.zone] || "#c9a574"} stroke={bad ? "#dc2626" : sel ? "#14110e" : "#5a4030"} strokeWidth={sel || bad ? 0.14 : 0.07} /> : <rect x={-sz.w / 2} y={-sz.d / 2} width={sz.w} height={sz.d} rx=".1" fill={ZONE_FILL[tb.zone] || "#c9a574"} stroke={bad ? "#dc2626" : sel ? "#14110e" : "#5a4030"} strokeWidth={sel || bad ? 0.14 : 0.07} />}
              <text textAnchor="middle" dominantBaseline="central" fontSize=".42" fontWeight="600" fill="#14110e" transform={`rotate(${-(tb.rotation || 0)})`}>{tb.label}</text>
              <text textAnchor="middle" y={.5} fontSize=".3" fill="#14110e" transform={`rotate(${-(tb.rotation || 0)})`}>{tb.seats}</text>
            </g>
          );
        })}
      </svg>
      <p className="text-xs text-ink-faint mt-2">{ui.hintDrag}{overlaps.size > 0 && <span className="text-red-600 ml-2">{ui.overlap}</span>}</p>
    </div>
  );
}
