import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, Minus, Plus } from "lucide-react";
import { coordOf } from "../../lib/cities.js";
import { areasOf } from "../../lib/cityAreas.js";

const KM_LAT = 110.574;
const GOLD = "#C89A3D";

/** Carte schématique d'une ville, dessinée en SVG (aucun fond externe) : anneaux de distance, quartiers, annonces, épingle à poser.
 *  Glisser = déplacer · molette / pincer = zoom · toucher (mode « poser ») = placer l'épingle. */
export default function CityMap({ city, center, markers = [], onSelect, pin = null, onPick, className = "", showAreas = true }) {
  const box = useRef(null), svg = useRef(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  const c0 = useMemo(() => center || coordOf(city) || [-15.4167, 28.2833], [center, city]);
  const kmLng = 111.32 * Math.cos((c0[0] * Math.PI) / 180);
  const [view, setView] = useState({ x: 0, y: 0, k: 0 }); // x,y : décalage en km ; k : pixels par km (0 = à calculer)
  const k = view.k || Math.min(size.w, size.h) / 16;
  const toKm = (lat, lng) => [(lng - c0[1]) * kmLng, (lat - c0[0]) * KM_LAT];
  const proj = (lat, lng) => { const [x, y] = toKm(lat, lng); return [size.w / 2 + (x - view.x) * k, size.h / 2 - (y - view.y) * k]; };
  const inv = (sx, sy) => { const x = view.x + (sx - size.w / 2) / k, y = view.y - (sy - size.h / 2) / k; return [c0[0] + y / KM_LAT, c0[1] + x / kmLng]; };

  useEffect(() => { const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width || 600, h: e.contentRect.height || 400 })); ro.observe(box.current); return () => ro.disconnect(); }, []);
  useEffect(() => { setView({ x: 0, y: 0, k: 0 }); }, [c0[0], c0[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const zoom = (f, ax = size.w / 2, ay = size.h / 2) => setView((v) => {
    const kk = v.k || Math.min(size.w, size.h) / 16, nk = Math.max(4, Math.min(400, kk * f));
    const wx = v.x + (ax - size.w / 2) / kk, wy = v.y - (ay - size.h / 2) / kk; // point sous le curseur : il reste en place
    return { k: nk, x: wx - (ax - size.w / 2) / nk, y: wy + (ay - size.h / 2) / nk };
  });
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  useEffect(() => { // molette non passive : la page ne défile pas pendant le zoom
    const el = svg.current; const h = (e) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomRef.current(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top); };
    el.addEventListener("wheel", h, { passive: false }); return () => el.removeEventListener("wheel", h);
  }, []);

  const ptrs = useRef(new Map()), moved = useRef(false), pinch = useRef(0);
  const pos = (m) => [...m.values()].map((p) => [p.x, p.y]);
  const down = (e) => {
    svg.current.setPointerCapture?.(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (ptrs.current.size === 1) moved.current = false;
    if (ptrs.current.size === 2) { const [a, b] = pos(ptrs.current); pinch.current = Math.hypot(a[0] - b[0], a[1] - b[1]); moved.current = true; }
  };
  const move = (e) => {
    const p = ptrs.current.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.current.size === 2) {
      const [a, b] = pos(ptrs.current), d = Math.hypot(a[0] - b[0], a[1] - b[1]), r = svg.current.getBoundingClientRect();
      if (pinch.current) zoom(d / pinch.current, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
      pinch.current = d; return;
    }
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 5) moved.current = true;
    if (moved.current) setView((v) => { const kk = v.k || k; return { k: kk, x: v.x - dx / kk, y: v.y + dy / kk }; });
  };
  const up = (e) => {
    const tap = ptrs.current.size === 1 && !moved.current && e.type === "pointerup";
    ptrs.current.delete(e.pointerId); pinch.current = 0;
    if (tap && onPick) { const r = svg.current.getBoundingClientRect(); const [la, ln] = inv(e.clientX - r.left, e.clientY - r.top); onPick(Number(la.toFixed(6)), Number(ln.toFixed(6))); }
  };

  // Graduation : un pas lisible (≈ 70 px minimum entre deux traits)
  const step = [0.25, 0.5, 1, 2, 5, 10, 20, 50].find((s) => s * k >= 70) || 50;
  const lines = [];
  const x0 = Math.floor((view.x - size.w / 2 / k) / step) * step, x1 = view.x + size.w / 2 / k;
  const y0 = Math.floor((view.y - size.h / 2 / k) / step) * step, y1 = view.y + size.h / 2 / k;
  for (let x = x0; x <= x1; x += step) lines.push(["v", size.w / 2 + (x - view.x) * k]);
  for (let y = y0; y <= y1; y += step) lines.push(["h", size.h / 2 - (y - view.y) * k]);
  const [cx, cy] = proj(c0[0], c0[1]);
  const rings = [2, 5, 10, 20, 40].filter((r) => r * k >= 40 && r * k < 2500);
  const areas = showAreas ? areasOf(city) : [];
  const pts = markers.map((m) => ({ ...m, p: proj(m.lat, m.lng) }));
  const pp = pin ? proj(pin.lat, pin.lng) : null;

  return (
    <div ref={box} className={`relative overflow-hidden select-none touch-none ${className}`} style={{ background: "linear-gradient(180deg,#F4EFE6,#EAE2D3)" }}>
      <svg ref={svg} width={size.w} height={size.h} className={`absolute inset-0 ${onPick ? "cursor-crosshair" : "cursor-grab"}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} role="application" aria-label={`Carte de ${city || "la ville"}`}>
        {lines.map(([t, v], i) => (t === "v" ? <line key={i} x1={v} x2={v} y1={0} y2={size.h} stroke="#CDBFA6" strokeWidth=".6" opacity=".55" /> : <line key={i} y1={v} y2={v} x1={0} x2={size.w} stroke="#CDBFA6" strokeWidth=".6" opacity=".55" />))}
        {rings.map((r) => (<g key={r}><circle cx={cx} cy={cy} r={r * k} fill="none" stroke="#B99A68" strokeWidth="1.2" strokeDasharray="5 6" opacity=".7" /><text x={cx + r * k * 0.707 + 4} y={cy - r * k * 0.707 - 4} fontSize="10" fill="#8A6B3A">{r} km</text></g>))}
        {areas.map(([n, la, ln]) => { const [x, y] = proj(la, ln); if (x < -40 || y < -20 || x > size.w + 40 || y > size.h + 20) return null; return (
          <g key={n} pointerEvents="none"><circle cx={x} cy={y} r="3.5" fill="#8A6B3A" opacity=".75" /><text x={x + 7} y={y + 3.5} fontSize="11" fontWeight="600" fill="#5A3A20" stroke="#F4EFE6" strokeWidth="3" paintOrder="stroke">{n}</text></g>); })}
        <g pointerEvents="none"><circle cx={cx} cy={cy} r="5" fill="#2E1D12" /><circle cx={cx} cy={cy} r="9" fill="none" stroke="#2E1D12" opacity=".4" /></g>
        {pts.map((m) => (
          <g key={m.id} transform={`translate(${m.p[0]} ${m.p[1]})`} role="button" tabIndex={0} aria-label={m.label} className="cursor-pointer" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onSelect?.(m.id); }} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect?.(m.id)}>
            <path d="M0 0l-6-9h12z" fill={m.active ? GOLD : "#2E1D12"} /><rect x={-Math.max(26, String(m.label).length * 3.6 + 10)} y="-33" width={Math.max(52, String(m.label).length * 7.2 + 20)} height="24" rx="12" fill={m.active ? GOLD : "#2E1D12"} stroke="#fff" strokeWidth="2" />
            <text y="-17" textAnchor="middle" fontSize="12" fontWeight="700" fill={m.active ? "#2E1D12" : "#fff"}>{m.label}</text>
          </g>))}
        {pp && <g transform={`translate(${pp[0]} ${pp[1]})`} pointerEvents="none"><path d="M0 0c-13-15-16-21-16-28a16 16 0 0132 0c0 7-3 13-16 28z" fill="#D2452E" stroke="#fff" strokeWidth="2" /><circle cy="-28" r="6" fill="#fff" /></g>}
      </svg>
      <div className="absolute z-10 right-3 bottom-3 flex flex-col gap-1.5">
        <button type="button" onClick={() => zoom(1.4)} aria-label="Zoom avant" className="w-9 h-9 rounded-lg bg-surface border border-line shadow flex items-center justify-center hover:bg-latte-soft"><Plus size={16} /></button>
        <button type="button" onClick={() => zoom(1 / 1.4)} aria-label="Zoom arrière" className="w-9 h-9 rounded-lg bg-surface border border-line shadow flex items-center justify-center hover:bg-latte-soft"><Minus size={16} /></button>
        <button type="button" onClick={() => setView({ x: 0, y: 0, k: 0 })} aria-label="Recentrer" className="w-9 h-9 rounded-lg bg-surface border border-line shadow flex items-center justify-center hover:bg-latte-soft"><LocateFixed size={16} /></button>
      </div>
      <p className="absolute z-10 left-3 bottom-2 text-[10px] text-[#8A6B3A] pointer-events-none">Carte schématique · quartiers indicatifs · pas {step < 1 ? `${step * 1000} m` : `${step} km`}</p>
    </div>
  );
}
