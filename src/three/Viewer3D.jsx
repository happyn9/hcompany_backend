import { useEffect, useRef, useState } from "react";
import { RotateCw, Pause } from "lucide-react";
import { THREE, applyTint, blobShadow, disposeTree, studioLights, webglOk } from "./core.js";
import { useLanguage } from "../context/LanguageContext.jsx";

/** Visionneuse 3D : l'objet tourne sur un plateau, se fait tourner au doigt/à la souris, se zoome (molette/pincement)
 * et se recolore. `build()` renvoie un Object3D posé au sol (y = 0) ; `tint` colore ses matériaux « tintables ». */
export default function Viewer3D({ build, tint = null, deps = [], className = "", height = 380, autoRotate = true, onReady, onUnsupported, background = null, children, interactive = true }) {
  const { lang } = useLanguage();
  const wrap = useRef(null);
  const live = useRef({});
  const [spin, setSpin] = useState(autoRotate);
  const [ok, setOk] = useState(true);
  live.current.spin = spin;
  live.current.tint = tint;

  useEffect(() => {
    if (!webglOk()) { setOk(false); onUnsupported?.(); return undefined; }
    const el = wrap.current;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false }); } catch { setOk(false); onUnsupported?.(); return undefined; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    const dom = renderer.domElement;
    dom.style.cssText = "width:100%;height:100%;display:block;touch-action:none;cursor:grab;outline:none";
    const scene = new THREE.Scene();
    if (background) scene.background = new THREE.Color(background);
    studioLights(scene);
    const holder = new THREE.Group();
    scene.add(holder);
    const obj = build(THREE);
    holder.add(obj);
    const bb = new THREE.Box3().setFromObject(obj);
    const size = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3());
    const R = Math.max(size.x, size.y, size.z) || 1;
    scene.add(Object.assign(blobShadow(R * 0.7), {}));
    const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 100);
    const st = { yaw: 0.6, pitch: 0.28, dist: R * 2.5, minD: R * 1.2, maxD: R * 5, vy: 0, last: 0, ptrs: new Map(), pinch: 0 };
    live.current.st = st;
    live.current.root = obj;
    const target = new THREE.Vector3(ctr.x, size.y * 0.5, ctr.z);
    const resize = () => { const w = el.clientWidth || 300, h = el.clientHeight || 300; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    applyTint(obj, live.current.tint);

    const down = (e) => { dom.setPointerCapture?.(e.pointerId); st.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); st.last = performance.now(); dom.style.cursor = "grabbing"; };
    const move = (e) => {
      const p = st.ptrs.get(e.pointerId); if (!p || !interactive) return;
      if (st.ptrs.size === 2) {
        const [a, b] = [...st.ptrs.values()];
        const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const [c, d] = [...st.ptrs.values()];
        const d1 = Math.hypot(c.x - d.x, c.y - d.y);
        if (d0) st.dist = Math.max(st.minD, Math.min(st.maxD, st.dist * (d0 / d1)));
        return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      st.yaw -= dx * 0.008; st.vy = -dx * 0.008;
      st.pitch = Math.max(-0.15, Math.min(1.35, st.pitch + dy * 0.006));
      st.last = performance.now();
    };
    const up = (e) => { st.ptrs.delete(e.pointerId); dom.style.cursor = "grab"; st.last = performance.now(); };
    const wheel = (e) => { if (!interactive) return; e.preventDefault(); st.dist = Math.max(st.minD, Math.min(st.maxD, st.dist * (1 + e.deltaY * 0.0012))); };
    dom.addEventListener("pointerdown", down); dom.addEventListener("pointermove", move); dom.addEventListener("pointerup", up); dom.addEventListener("pointercancel", up);
    dom.addEventListener("wheel", wheel, { passive: false });


    // Pas de rendu quand le canvas est hors écran ou l'onglet masqué : économise batterie et défilement.
    const vis = { on: true };
    const io = new IntersectionObserver(([e]) => { vis.on = e.isIntersecting; }, { threshold: 0 });
    io.observe(el);
    const vc = () => { vis.on = vis.on && !document.hidden; };
    document.addEventListener("visibilitychange", vc);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const clock = new THREE.Clock();
    let raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.05), now = performance.now();
      if (!vis.on || document.hidden) return;
      if (!st.ptrs.size) {
        st.yaw += st.vy; st.vy *= 0.92;
        if (live.current.spin && !reduce && now - st.last > 1800) st.yaw += dt * 0.6;
      }
      camera.position.set(target.x + Math.sin(st.yaw) * Math.cos(st.pitch) * st.dist, target.y + Math.sin(st.pitch) * st.dist, target.z + Math.cos(st.yaw) * Math.cos(st.pitch) * st.dist);
      camera.lookAt(target);
      live.current.frame?.(dt, obj);
      renderer.render(scene, camera);
    };
    loop();
    onReady?.({ root: obj, live });
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", vc);
      dom.removeEventListener("pointerdown", down); dom.removeEventListener("pointermove", move); dom.removeEventListener("pointerup", up); dom.removeEventListener("pointercancel", up); dom.removeEventListener("wheel", wheel);
      disposeTree(scene); renderer.dispose(); renderer.forceContextLoss?.(); dom.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { if (live.current.root) applyTint(live.current.root, tint); }, [tint]);

  if (!ok) return null;
  return (
    <div className={`relative rounded-3xl overflow-hidden border border-line bg-gradient-to-b from-cream via-latte-soft to-latte-soft/70 ${className}`} style={{ height }}>
      <div ref={wrap} className="absolute inset-0" role="img" aria-label={lang === "en" ? "Interactive 3D view" : "Vue 3D interactive"} />
      <p className="absolute top-3 left-3 text-[11px] text-ink-soft bg-surface/80 backdrop-blur rounded-full px-3 py-1.5 pointer-events-none">{lang === "en" ? "Drag to rotate · pinch/scroll to zoom" : "Glissez pour tourner · pincez/molette pour zoomer"}</p>
      <button type="button" onClick={() => setSpin((s) => !s)} aria-pressed={spin} aria-label={lang === "en" ? "Auto-rotate" : "Rotation automatique"} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-surface/85 backdrop-blur text-ink flex items-center justify-center border border-line">{spin ? <Pause size={15} /> : <RotateCw size={15} />}</button>
      {children}
    </div>
  );
}
