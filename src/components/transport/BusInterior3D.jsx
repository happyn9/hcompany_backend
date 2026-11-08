import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Maximize2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { seatRows } from "../../lib/transport.js";
import { useLanguage } from "../../context/LanguageContext.jsx";

const T = {
  fr: { help: "Glissez pour regarder · ZQSD / flèches pour avancer · touchez un siège pour le choisir", seat: "Siège", taken: "occupé", free: "libre", chosen: "choisi", full: "Plein écran", front: "Chauffeur", door: "Entrée", back: "Fond du bus" },
  en: { help: "Drag to look around · WASD / arrows to walk · tap a seat to pick it", seat: "Seat", taken: "taken", free: "free", chosen: "yours", full: "Fullscreen", front: "Driver", door: "Entrance", back: "Back of the bus" },
};
const PITCH = 0.95, AISLE = 0.3, SEAT_W = 0.46, WALL = 1.3;
const COL = { free: "#c9b79c", taken: "#2f2f33", hover: "#e4b968" };

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
}

function labelTexture(n) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"); g.fillStyle = "rgba(0,0,0,0)"; g.clearRect(0, 0, 128, 128);
  g.fillStyle = "#fff"; g.font = "bold 78px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}

function buildBus({ total, layout, color }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#14110e");
  scene.fog = new THREE.Fog("#14110e", 6, 22);
  const rows = seatRows(total, layout);
  const length = 2.6 + rows.length * PITCH + 1.2;
  const g = new THREE.Group(); scene.add(g);
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0.05, ...o });
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  const zc = -length / 2 + 0.2;
  // sol, couloir, plafond
  box(WALL * 2, 0.05, length, mat("#2a2724"), 0, -0.025, zc);
  box(0.56, 0.012, length, mat(color, { roughness: 0.6 }), 0, 0.004, zc);
  box(WALL * 2, 0.05, length, mat("#ece6dc"), 0, 2.2, zc);
  for (let z = -2.4; z > -length + 0.6; z -= 1.9) box(0.22, 0.02, 1.2, new THREE.MeshBasicMaterial({ color: "#fff6e0" }), 0, 2.17, z);
  // parois : soubassement, piliers à chaque rangée, vitres
  const wall = mat("#3a342d"), glass = new THREE.MeshStandardMaterial({ color: "#9cc4e4", transparent: true, opacity: 0.28, roughness: 0.1 });
  for (const s of [-1, 1]) {
    box(0.06, 0.95, length, wall, s * WALL, 0.47, zc);
    box(0.04, 1.2, length, glass, s * WALL, 1.55, zc);
    box(0.08, 0.1, length, wall, s * WALL, 2.1, zc);
    for (let z = -2.4; z > -length; z -= PITCH) box(0.08, 1.3, 0.07, wall, s * WALL, 1.5, z - PITCH / 2);
  }
  // fond du bus, pare-brise, tableau de bord, volant, siège chauffeur, porte
  box(WALL * 2, 2.2, 0.06, mat("#3a342d"), 0, 1.1, -length + 0.2);
  box(WALL * 2, 1.2, 0.04, glass, 0, 1.55, 0.2);
  box(WALL * 2, 0.9, 0.5, mat("#26221e"), 0, 0.55, 0.05);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 10, 28), mat("#111")); wheel.position.set(-0.6, 1.0, -0.25); wheel.rotation.x = -0.9; g.add(wheel);
  box(0.5, 0.5, 0.5, mat("#1f1d1b"), -0.6, 0.45, -0.85); box(0.5, 0.65, 0.1, mat("#1f1d1b"), -0.6, 0.95, -1.1);
  box(0.02, 1.9, 0.9, new THREE.MeshBasicMaterial({ color: "#22c55e" }), WALL - 0.02, 1.0, -0.9);
  // sièges
  const seats = [];
  const lcount = rows[0].indexOf(null);
  rows.forEach((row, ri) => {
    const z = -2.6 - ri * PITCH;
    row.forEach((n, ci) => {
      if (n === null || n === "gap") return;
      const x = ci < lcount ? -(AISLE + SEAT_W / 2 + (lcount - 1 - ci) * SEAT_W) : AISLE + SEAT_W / 2 + (ci - lcount - 1) * SEAT_W;
      const grp = new THREE.Group(); grp.position.set(x, 0, z);
      const fab = new THREE.MeshStandardMaterial({ color: COL.free, roughness: 0.9 });
      const part = (w, h, d, px, py, pz, m = fab) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(px, py, pz); b.userData.seat = n; grp.add(b); return b; };
      part(SEAT_W - 0.04, 0.12, 0.46, 0, 0.45, 0); part(SEAT_W - 0.04, 0.58, 0.09, 0, 0.82, -0.22); part(0.28, 0.16, 0.08, 0, 1.2, -0.22);
      part(0.05, 0.4, 0.05, 0, 0.2, 0, mat("#111")); part(SEAT_W - 0.02, 0.05, 0.05, 0, 0.62, 0.22, mat("#111")).visible = false;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ map: labelTexture(n), transparent: true }));
      label.position.set(0, 0.92, -0.17); label.userData.seat = n; grp.add(label);
      g.add(grp); seats.push({ n, group: grp, fab });
    });
  });
  scene.add(new THREE.HemisphereLight("#fff4e0", "#554433", 0.8));
  for (let z = -2.5; z > -length; z -= 3.2) { const l = new THREE.PointLight("#fff1d6", 1.6, 5); l.position.set(0, 1.9, z); scene.add(l); }
  return { scene, seats, length };
}

export default function BusInterior3D({ total, layout = "2+2", color = "#c89a3d", taken = [], selected = [], onToggle, readOnly = false, onUnsupported }) {
  const { lang } = useLanguage();
  const t = T[lang] || T.fr;
  const wrap = useRef(null);
  const live = useRef({});
  const [hud, setHud] = useState("");
  live.current.props = { taken, selected, onToggle, readOnly, t, color };

  useEffect(() => {
    if (!webglAvailable()) { onUnsupported?.(); return undefined; }
    const el = wrap.current;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { onUnsupported?.(); return undefined; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none;outline:none;cursor:grab";
    renderer.domElement.tabIndex = 0;
    const { scene, seats, length } = buildBus({ total, layout, color });
    const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 40);
    const st = { x: 0, z: -0.9, yaw: 0, pitch: -0.04, keys: new Set(), drag: null, hover: null };
    live.current.seats = seats;
    const resize = () => { const w = el.clientWidth || 300, h = el.clientHeight || 300; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    const ray = new THREE.Raycaster(), pt = new THREE.Vector2();
    const pick = (ev) => {
      const r = renderer.domElement.getBoundingClientRect();
      pt.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(pt, camera);
      const hit = ray.intersectObjects(seats.map((s) => s.group), true).find((h) => h.object.userData.seat);
      return hit ? hit.object.userData.seat : null;
    };
    const dom = renderer.domElement;
    const down = (e) => { dom.setPointerCapture?.(e.pointerId); st.drag = { x: e.clientX, y: e.clientY, moved: 0 }; dom.style.cursor = "grabbing"; };
    const move = (e) => {
      if (st.drag) {
        const dx = e.clientX - st.drag.x, dy = e.clientY - st.drag.y;
        st.drag.moved += Math.abs(dx) + Math.abs(dy); st.drag.x = e.clientX; st.drag.y = e.clientY;
        st.yaw -= dx * 0.0042; st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch - dy * 0.0035));
      } else if (e.pointerType === "mouse") {
        const n = pick(e); if (n !== st.hover) { st.hover = n; setHud(n ? `${live.current.props.t.seat} ${n}` : ""); }
      }
    };
    const up = (e) => {
      const moved = st.drag?.moved || 0; st.drag = null; dom.style.cursor = "grab";
      if (moved < 6) { const n = pick(e); const p = live.current.props; if (n && !p.readOnly && !p.taken.includes(n)) p.onToggle?.(n); }
    };
    const key = (down) => (e) => {
      const k = e.key.toLowerCase(); if (!["w", "a", "s", "d", "z", "q", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) return;
      e.preventDefault(); down ? st.keys.add(k) : st.keys.delete(k);
    };
    const kd = key(true), ku = key(false);
    dom.addEventListener("pointerdown", down); dom.addEventListener("pointermove", move); dom.addEventListener("pointerup", up); dom.addEventListener("pointercancel", up);
    dom.addEventListener("keydown", kd); dom.addEventListener("keyup", ku); dom.addEventListener("blur", () => st.keys.clear());
    live.current.st = st;


    // Pas de rendu quand le canvas est hors écran ou l'onglet masqué : économise batterie et défilement.
    const vis = { on: true };
    const io = new IntersectionObserver(([e]) => { vis.on = e.isIntersecting; }, { threshold: 0 });
    io.observe(el);
    const vc = () => { vis.on = vis.on && !document.hidden; };
    document.addEventListener("visibilitychange", vc);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const clock = new THREE.Clock(); let raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.05), k = st.keys, ex = live.current.extra || {};
      if (!vis.on || document.hidden) return;
      const fwd = (k.has("w") || k.has("z") || k.has("arrowup") || ex.f ? 1 : 0) - (k.has("s") || k.has("arrowdown") || ex.b ? 1 : 0);
      const str = (k.has("d") || ex.r ? 1 : 0) - (k.has("a") || k.has("q") || ex.l ? 1 : 0);
      st.yaw += ((k.has("arrowleft") ? 1 : 0) - (k.has("arrowright") ? 1 : 0)) * 1.6 * dt;
      const sp = (reduce ? 1.3 : 2.1) * dt, sy = Math.sin(st.yaw), cy = Math.cos(st.yaw);
      let nx = st.x + (-sy * fwd + cy * str) * sp, nz = st.z + (-cy * fwd - sy * str) * sp;
      nz = Math.max(-length + 0.55, Math.min(-0.45, nz));
      const lim = nz < -2.1 ? AISLE - 0.05 : WALL - 0.25;
      nx = Math.max(-lim, Math.min(lim, nx));
      st.x = nx; st.z = nz;
      camera.position.set(st.x, 1.6, st.z); camera.rotation.set(st.pitch, st.yaw, 0, "YXZ");
      // couleurs des sièges
      const p = live.current.props;
      for (const s of seats) {
        const c = p.taken.includes(s.n) ? COL.taken : p.selected.includes(s.n) ? p.color : st.hover === s.n && !p.readOnly ? COL.hover : COL.free;
        s.fab.color.set(c);
        s.group.scale.y = p.selected.includes(s.n) ? 1.04 : 1;
      }
      renderer.render(scene, camera);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", vc);
      dom.removeEventListener("pointerdown", down); dom.removeEventListener("pointermove", move); dom.removeEventListener("pointerup", up); dom.removeEventListener("pointercancel", up);
      dom.removeEventListener("keydown", kd); dom.removeEventListener("keyup", ku);
      scene.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); }); });
      renderer.dispose(); dom.remove();
    };
  }, [total, layout, color, onUnsupported]);

  const hold = (key) => ({
    onPointerDown: (e) => { e.preventDefault(); live.current.extra = { ...(live.current.extra || {}), [key]: true }; },
    onPointerUp: () => { live.current.extra = { ...(live.current.extra || {}), [key]: false }; },
    onPointerLeave: () => { live.current.extra = { ...(live.current.extra || {}), [key]: false }; },
    onPointerCancel: () => { live.current.extra = { ...(live.current.extra || {}), [key]: false }; },
  });
  const btn = "w-11 h-11 rounded-full bg-black/45 text-white backdrop-blur flex items-center justify-center active:bg-black/70 select-none touch-none";
  return (
    <div className="relative rounded-3xl overflow-hidden border border-line bg-[#14110e]" style={{ aspectRatio: "4 / 3", minHeight: 260 }}>
      <div ref={wrap} className="absolute inset-0" role="application" aria-label={t.help} />
      <p className="absolute top-3 left-3 right-14 text-[11px] sm:text-xs text-white/80 bg-black/35 backdrop-blur rounded-full px-3 py-1.5 pointer-events-none">{t.help}</p>
      <button type="button" onClick={() => wrap.current?.parentElement?.requestFullscreen?.()} aria-label={t.full} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/45 text-white flex items-center justify-center"><Maximize2 size={16} /></button>
      {hud && <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/90 text-black text-sm font-medium px-4 py-1.5 pointer-events-none">{hud}</p>}
      <div className="absolute bottom-3 left-3 grid grid-cols-3 gap-1 sm:hidden">
        <span /><button type="button" aria-label="forward" className={btn} {...hold("f")}><ArrowUp size={18} /></button><span />
        <button type="button" aria-label="left" className={btn} {...hold("l")}><ArrowLeft size={18} /></button>
        <button type="button" aria-label="back" className={btn} {...hold("b")}><ArrowDown size={18} /></button>
        <button type="button" aria-label="right" className={btn} {...hold("r")}><ArrowRight size={18} /></button>
      </div>
    </div>
  );
}
