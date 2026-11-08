import { useEffect, useRef, useState } from "react";
import { Maximize2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { THREE, disposeTree, webglOk } from "./core.js";
import { useLanguage } from "../context/LanguageContext.jsx";

const T = {
  fr: { help: "Glissez pour regarder · ZQSD / flèches pour marcher · cliquez un objet pour le choisir", full: "Plein écran" },
  en: { help: "Drag to look around · WASD / arrows to walk · click an object to pick it", full: "Fullscreen" },
};
const RADIUS = 0.28;

/** Le joueur (cercle) glisse le long des murs : on résout les axes séparément. */
export function resolveMove(x, z, nx, nz, colliders, bounds, r = RADIUS) {
  const hits = (px, pz) => colliders.some((c) => px > c.x0 - r && px < c.x1 + r && pz > c.z0 - r && pz < c.z1 + r);
  let ax = x, az = z;
  if (!hits(nx, z)) ax = nx;
  if (!hits(ax, nz)) az = nz;
  if (bounds) { ax = Math.max(bounds.x0 + r, Math.min(bounds.x1 - r, ax)); az = Math.max(bounds.z0 + r, Math.min(bounds.z1 - r, az)); }
  return [ax, az];
}

/** Visite à la première personne (souris/tactile + clavier). `build()` renvoie :
 *  { scene, colliders:[{x0,x1,z0,z1}], bounds, spawn:{x,z,yaw}, pickables:[Object3D avec userData.pick], zones?:[{x0,x1,z0,z1,name}], update?(dt) }.
 *  onPick(data) est appelé au clic sur un objet « pickable » ; hoverLabel(data) donne l'étiquette au survol. */
export default function WalkView({ build, deps = [], onPick, hoverLabel, eye = 1.6, speed = 2.1, fov = 70, height = 440, help, onUnsupported, onReady, children, className = "" }) {
  const { lang } = useLanguage();
  const t = T[lang] || T.fr;
  const wrap = useRef(null);
  const live = useRef({});
  const [hud, setHud] = useState("");
  const [zone, setZone] = useState("");
  const [ok, setOk] = useState(true);
  live.current.cb = { onPick, hoverLabel };

  useEffect(() => {
    if (!webglOk()) { setOk(false); onUnsupported?.(); return undefined; }
    const el = wrap.current;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { setOk(false); onUnsupported?.(); return undefined; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    el.appendChild(renderer.domElement);
    const dom = renderer.domElement;
    dom.style.cssText = "width:100%;height:100%;display:block;touch-action:none;outline:none;cursor:grab";
    dom.tabIndex = 0;
    const world = build(THREE);
    const { scene, colliders = [], bounds, spawn = { x: 0, z: 0, yaw: 0 }, pickables = [], zones = [] } = world;
    const camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 220);
    const st = { x: spawn.x, z: spawn.z, yaw: spawn.yaw || 0, pitch: -0.04, keys: new Set(), drag: null, hover: null, zone: "", bob: 0 };
    live.current.extra = {};
    const resize = () => { const w = el.clientWidth || 300, h = el.clientHeight || 300; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    const ray = new THREE.Raycaster(), pt = new THREE.Vector2();
    const pick = (ev) => {
      const r = dom.getBoundingClientRect();
      pt.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(pt, camera); ray.far = 40;
      const hit = ray.intersectObjects(pickables, true)[0];
      if (!hit) return null;
      let o = hit.object; while (o && !o.userData.pick) o = o.parent;
      return o ? o.userData.pick : null;
    };
    const down = (e) => { dom.setPointerCapture?.(e.pointerId); st.drag = { x: e.clientX, y: e.clientY, moved: 0 }; dom.style.cursor = "grabbing"; dom.focus({ preventScroll: true }); };
    const move = (e) => {
      if (st.drag) {
        const dx = e.clientX - st.drag.x, dy = e.clientY - st.drag.y;
        st.drag.moved += Math.abs(dx) + Math.abs(dy); st.drag.x = e.clientX; st.drag.y = e.clientY;
        st.yaw -= dx * 0.0042; st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch - dy * 0.0035));
      } else if (e.pointerType === "mouse") {
        const d = pick(e);
        if (d !== st.hover) { st.hover = d; const f = live.current.cb.hoverLabel; setHud(d && f ? f(d) : ""); dom.style.cursor = d ? "pointer" : "grab"; }
      }
    };
    const up = (e) => {
      const moved = st.drag?.moved || 0; st.drag = null; dom.style.cursor = st.hover ? "pointer" : "grab";
      if (moved < 6) { const d = pick(e); if (d) live.current.cb.onPick?.(d); }
    };
    const KEYS = ["w", "a", "s", "d", "z", "q", "arrowup", "arrowdown", "arrowleft", "arrowright"];
    const key = (isDown) => (e) => { const k = e.key.toLowerCase(); if (!KEYS.includes(k)) return; e.preventDefault(); isDown ? st.keys.add(k) : st.keys.delete(k); };
    const kd = key(true), ku = key(false), blur = () => st.keys.clear();
    dom.addEventListener("pointerdown", down); dom.addEventListener("pointermove", move); dom.addEventListener("pointerup", up); dom.addEventListener("pointercancel", up);
    dom.addEventListener("keydown", kd); dom.addEventListener("keyup", ku); dom.addEventListener("blur", blur);
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
      const dt = Math.min(clock.getDelta(), 0.05), k = st.keys, ex = live.current.extra;
      if (!vis.on || document.hidden) return;
      const fwd = (k.has("w") || k.has("z") || k.has("arrowup") || ex.f ? 1 : 0) - (k.has("s") || k.has("arrowdown") || ex.b ? 1 : 0);
      const str = (k.has("d") || ex.r ? 1 : 0) - (k.has("a") || k.has("q") || ex.l ? 1 : 0);
      st.yaw += ((k.has("arrowleft") ? 1 : 0) - (k.has("arrowright") ? 1 : 0)) * 1.6 * dt;
      const sp = (reduce ? speed * 0.65 : speed) * dt, sy = Math.sin(st.yaw), cy = Math.cos(st.yaw);
      const mx = (-sy * fwd + cy * str), mz = (-cy * fwd - sy * str);
      if (mx || mz) {
        const [ax, az] = resolveMove(st.x, st.z, st.x + mx * sp, st.z + mz * sp, colliders, bounds);
        st.x = ax; st.z = az; st.bob += dt * 7;
      }
      const bobY = reduce || !(mx || mz) ? 0 : Math.sin(st.bob) * 0.025;
      camera.position.set(st.x, eye + bobY, st.z); camera.rotation.set(st.pitch, st.yaw, 0, "YXZ");
      for (const zn of zones) if (st.x >= zn.x0 && st.x <= zn.x1 && st.z >= zn.z0 && st.z <= zn.z1) { if (st.zone !== zn.name) { st.zone = zn.name; setZone(zn.name); } break; }
      world.update?.(dt, st);
      renderer.render(scene, camera);
    };
    loop();
    live.current.teleport = (x, z, yaw, pitch) => { st.x = x; st.z = z; if (yaw !== undefined) st.yaw = yaw; if (pitch !== undefined) st.pitch = pitch; };
    onReady?.({ teleport: live.current.teleport, st, world });
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", vc);
      dom.removeEventListener("pointerdown", down); dom.removeEventListener("pointermove", move); dom.removeEventListener("pointerup", up); dom.removeEventListener("pointercancel", up);
      dom.removeEventListener("keydown", kd); dom.removeEventListener("keyup", ku); dom.removeEventListener("blur", blur);
      disposeTree(scene); renderer.dispose(); renderer.forceContextLoss?.(); dom.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const hold = (key) => {
    const set = (v) => { live.current.extra = { ...(live.current.extra || {}), [key]: v }; };
    return { onPointerDown: (e) => { e.preventDefault(); set(true); }, onPointerUp: () => set(false), onPointerLeave: () => set(false), onPointerCancel: () => set(false) };
  };
  const btn = "w-11 h-11 rounded-full bg-black/45 text-white backdrop-blur flex items-center justify-center active:bg-black/70 select-none touch-none";
  if (!ok) return null;
  return (
    <div className={`relative rounded-3xl overflow-hidden border border-line bg-[#14110e] ${className}`} style={{ height, minHeight: 260 }}>
      <div ref={wrap} className="absolute inset-0" role="application" aria-label={help || t.help} />
      <p className="absolute top-3 left-3 right-14 text-[11px] sm:text-xs text-white/85 bg-black/35 backdrop-blur rounded-full px-3 py-1.5 pointer-events-none">{help || t.help}</p>
      <button type="button" onClick={() => wrap.current?.parentElement?.requestFullscreen?.()} aria-label={t.full} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/45 text-white flex items-center justify-center"><Maximize2 size={16} /></button>
      {zone && <p className="absolute top-14 left-3 rounded-full bg-white/90 text-black text-xs font-medium px-3 py-1 pointer-events-none">{zone}</p>}
      {hud && <p className="absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[80%] truncate rounded-full bg-white/92 text-black text-sm font-medium px-4 py-1.5 pointer-events-none">{hud}</p>}
      <div className="absolute bottom-3 left-3 grid grid-cols-3 gap-1 sm:hidden">
        <span /><button type="button" aria-label="forward" className={btn} {...hold("f")}><ArrowUp size={18} /></button><span />
        <button type="button" aria-label="left" className={btn} {...hold("l")}><ArrowLeft size={18} /></button>
        <button type="button" aria-label="back" className={btn} {...hold("b")}><ArrowDown size={18} /></button>
        <button type="button" aria-label="right" className={btn} {...hold("r")}><ArrowRight size={18} /></button>
      </div>
      {children}
    </div>
  );
}
