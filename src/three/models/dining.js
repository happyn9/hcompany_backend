import { THREE, addMesh, box, cyl, std } from "../core.js";

const H = 3.1, T = 0.14;
export const TABLE_COLORS = { free: "#5b9a6a", taken: "#b4554b", too_small: "#b9a77f", selected: "#e0a43a", neutral: "#d9cdb8" };
const L = {
  fr: { table: "Table", seats: "places", free: "libre", taken: "réservée", too_small: "trop petite", selected: "votre choix", entrance: "Entrée", bar: "Bar", kitchen: "Cuisine", room: "Salle" },
  en: { table: "Table", seats: "seats", free: "free", taken: "booked", too_small: "too small", selected: "your pick", entrance: "Entrance", bar: "Bar", kitchen: "Kitchen", room: "Dining room" },
};

function woodTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
  g.fillStyle = "#9a7048"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(${i % 2 ? "0,0,0" : "255,255,255"},${0.05 + (i % 3) * 0.02})`; g.fillRect(0, i * 32, 256, 32); g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(0, i * 32, 256, 1.5); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function labelTexture(text) {
  const c = document.createElement("canvas"); c.width = 128; c.height = 64; const g = c.getContext("2d");
  g.fillStyle = "rgba(20,17,14,.82)"; g.beginPath(); g.roundRect(4, 8, 120, 48, 22); g.fill();
  g.fillStyle = "#fff"; g.font = "bold 30px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 64, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Empreinte d'une table (pour collisions & chaises) selon sa forme et ses places. */
export function tableSize(tb) {
  const s = Math.max(1, tb.seats || 2);
  if (tb.shape === "round") { const d = Math.min(2.4, 0.7 + s * 0.17); return { w: d, d }; }
  if (tb.shape === "square") { const d = Math.min(1.8, 0.7 + Math.ceil(s / 4) * 0.45); return { w: d, d }; }
  const per = Math.max(1, Math.ceil(s / 2));
  return { w: Math.min(3.8, 0.55 + per * 0.62), d: 0.9 };
}

/** Salle de restaurant : murs, bar, tables (cliquables) avec chaises. `setState` colore les tables. */
export function buildDining(_T, { room_w = 14, room_d = 10, tables = [], statuses = {}, selectedId = null, name = "" } = {}, lang = "fr") {
  const t = L[lang] || L.fr;
  const W = room_w, D = room_d;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#2a211b");
  scene.fog = new THREE.Fog("#2a211b", 22, 60);
  const root = new THREE.Group(); scene.add(root);
  const colliders = [], pickables = [], zones = [{ x0: 0, x1: W, z0: 0, z1: D, name: name || t.room }];
  const wallM = std("#efe4d2", { roughness: 0.95, emissive: "#6e5d46", emissiveIntensity: 0.5 });
  const trim = std("#5a4030"), darkWood = std("#3d2a1c"), glassM = new THREE.MeshStandardMaterial({ color: "#bcd9ee", transparent: true, opacity: 0.3, side: THREE.DoubleSide });

  scene.add(new THREE.HemisphereLight("#fff1dc", "#6b5842", 1.15));
  const sun = new THREE.DirectionalLight("#ffe7c2", 0.9); sun.position.set(W * 0.3, 8, D * 0.2); scene.add(sun);

  // sol
  const wt = woodTexture(); wt.repeat.set(W / 3, D / 3);
  addMesh(root, new THREE.PlaneGeometry(W, D), std("#fff", { map: wt, roughness: 0.8 }), W / 2, 0, D / 2, [-Math.PI / 2, 0, 0]);
  // plafond
  addMesh(root, new THREE.PlaneGeometry(W, D), std("#f6efe3", { side: THREE.DoubleSide, emissive: "#c9b99f", emissiveIntensity: 0.7 }), W / 2, H, D / 2, [Math.PI / 2, 0, 0]);

  // murs (la façade sud a une porte au centre et des vitres)
  const wall = (x0, x1, z0, z1, y0 = 0, y1 = H, m = wallM, col = true) => {
    const b = box(root, x1 - x0, y1 - y0, z1 - z0, m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0.01);
    if (col && y0 < 1) colliders.push({ x0, x1, z0, z1 });
    return b;
  };
  wall(-T, W + T, -T, 0); wall(-T, 0, -T, D + T); wall(W, W + T, -T, D + T);
  const doorW = 1.6, dx0 = W / 2 - doorW / 2, dx1 = W / 2 + doorW / 2;
  wall(-T, dx0, D, D + T); wall(dx1, W + T, D, D + T);
  wall(dx0, dx1, D, D + T, 2.2, H, wallM, false);
  // vitrages
  for (let x = 1.5; x < W - 1; x += 3.2) { if (x > dx0 - 1 && x < dx1 + 1) continue; addMesh(root, new THREE.PlaneGeometry(1.8, 1.3), glassM, x, 1.5, D - 0.02, [0, Math.PI, 0]); box(root, 1.9, 0.06, 0.05, trim, x, 2.17, D - 0.04); box(root, 1.9, 0.06, 0.05, trim, x, 0.82, D - 0.04); }
  // porte
  box(root, 0.06, 2.2, 0.06, trim, dx0, 1.1, D + 0.02); box(root, 0.06, 2.2, 0.06, trim, dx1, 1.1, D + 0.02); box(root, doorW, 0.06, 0.06, trim, W / 2, 2.2, D + 0.02);
  // tableau d'accueil
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(t.entrance), depthTest: false })); sign.scale.set(1.4, 0.7, 1); sign.position.set(W / 2, 2.6, D - 0.3); sign.renderOrder = 2; root.add(sign);

  // bar au nord
  const barW = Math.min(W - 4, 6);
  box(root, barW, 1.05, 0.7, darkWood, W / 2, 0.525, 0.9); box(root, barW + 0.1, 0.07, 0.8, std("#c9a574", { roughness: 0.4 }), W / 2, 1.08, 0.9);
  colliders.push({ x0: W / 2 - barW / 2, x1: W / 2 + barW / 2, z0: 0.5, z1: 1.3 });
  for (let i = 0; i < 3; i++) box(root, barW - 0.4, 0.04, 0.3, trim, W / 2, 1.5 + i * 0.4, 0.2);
  for (let i = 0; i < Math.floor(barW * 3); i++) cyl(root, 0.05, 0.05, 0.28, std(["#3f7a4f", "#a8452d", "#c9a24a"][i % 3], { roughness: 0.3 }), W / 2 - barW / 2 + 0.3 + i * 0.32, 1.64 + (i % 3) * 0.4 - (i % 3) * 0.4 + 0.0, 0.2, 10);
  for (let i = 0; i < 4; i++) { const sx = W / 2 - barW / 2 + 0.8 + i * (barW - 1.6) / 3; cyl(root, 0.2, 0.2, 0.05, std("#7a2e22"), sx, 0.72, 1.6, 16); cyl(root, 0.03, 0.03, 0.7, trim, sx, 0.35, 1.6, 8); }
  const barSign = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(t.bar), depthTest: false })); barSign.scale.set(1.1, 0.55, 1); barSign.position.set(W / 2, 2.55, 0.5); barSign.renderOrder = 2; root.add(barSign);
  // passe-plat cuisine
  wall(1.2, 3.4, 0.0, 0.05, 1.0, 2.2, std("#cfc5b3"), false);

  // lustres
  const lampM = new THREE.MeshBasicMaterial({ color: "#ffe2a8" });
  for (let x = 2.5; x < W; x += 4) for (let z = 3; z < D; z += 3.6) { cyl(root, 0.03, 0.03, 0.9, trim, x, H - 0.45, z, 6); const s = addMesh(root, new THREE.SphereGeometry(0.2, 14, 10), lampM, x, H - 0.95, z); s.scale.y = 0.75; }
  // plantes aux coins
  const plant = (x, z) => { cyl(root, 0.25, 0.2, 0.45, std("#7b4b32"), x, 0.22, z, 14); addMesh(root, new THREE.SphereGeometry(0.42, 14, 10), std("#3f7d44", { roughness: 0.9 }), x, 0.85, z); };
  plant(0.5, D - 0.5); plant(W - 0.5, D - 0.5); plant(0.5, 3.2); plant(W - 0.5, 3.2);

  // tables
  const mats = {};
  const chairM = std("#6d4a30"), cushionM = std("#c97b5a");
  const entries = {};
  const mk = (tb) => {
    const sz = tableSize(tb);
    const g = new THREE.Group(); g.position.set(tb.x, 0, tb.z); g.rotation.y = -(tb.rotation || 0) * Math.PI / 180; root.add(g);
    const clothM = std(TABLE_COLORS.neutral, { roughness: 0.9, emissive: "#000000" });
    const top = tb.shape === "round" ? cyl(g, sz.w / 2, sz.w / 2, 0.06, clothM, 0, 0.74, 0, 28) : box(g, sz.w, 0.06, sz.d, clothM, 0, 0.74, 0, 0.02);
    if (tb.shape === "round") cyl(g, 0.07, 0.1, 0.72, trim, 0, 0.36, 0, 10); else { box(g, 0.1, 0.72, 0.1, trim, sz.w / 2 - 0.15, 0.36, sz.d / 2 - 0.15); box(g, 0.1, 0.72, 0.1, trim, -sz.w / 2 + 0.15, 0.36, -sz.d / 2 + 0.15); box(g, 0.1, 0.72, 0.1, trim, sz.w / 2 - 0.15, 0.36, -sz.d / 2 + 0.15); box(g, 0.1, 0.72, 0.1, trim, -sz.w / 2 + 0.15, 0.36, sz.d / 2 - 0.15); }
    // décor : bougie
    cyl(g, 0.03, 0.03, 0.12, std("#fff3d6", { emissive: "#ffcf80", emissiveIntensity: 0.6 }), 0, 0.83, 0, 8);
    // chaises réparties autour
    const n = Math.max(1, Math.min(tb.seats || 2, 12));
    for (let i = 0; i < n; i++) {
      let cx, cz, ry;
      if (tb.shape === "rect") { const side = i % 2 ? 1 : -1, k = Math.floor(i / 2), per = Math.max(1, Math.ceil(n / 2)); cx = -sz.w / 2 + (k + 0.5) * (sz.w / per); cz = side * (sz.d / 2 + 0.3); ry = side > 0 ? Math.PI : 0; }
      else { const a = (i / n) * Math.PI * 2, r = sz.w / 2 + 0.3; cx = Math.sin(a) * r; cz = Math.cos(a) * r; ry = a + Math.PI; }
      const ch = new THREE.Group(); ch.position.set(cx, 0, cz); ch.rotation.y = ry; g.add(ch);
      box(ch, 0.42, 0.06, 0.42, cushionM, 0, 0.46, 0, 0.02); box(ch, 0.42, 0.5, 0.05, chairM, 0, 0.74, -0.2, 0.02);
      [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].forEach(([lx, lz]) => box(ch, 0.04, 0.44, 0.04, chairM, lx, 0.22, lz, 0.005));
    }
    // anneau de sélection (caché par défaut)
    const ring = addMesh(g, new THREE.RingGeometry(Math.max(sz.w, sz.d) / 2 + 0.55, Math.max(sz.w, sz.d) / 2 + 0.7, 40), new THREE.MeshBasicMaterial({ color: TABLE_COLORS.selected, side: THREE.DoubleSide }), 0, 0.02, 0, [-Math.PI / 2, 0, 0]);
    ring.visible = false;
    // étiquette flottante (non tournée avec la table)
    const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(tb.label), depthTest: false, transparent: true })); lab.scale.set(0.8, 0.4, 1); lab.position.set(tb.x, 1.25, tb.z); lab.renderOrder = 3; root.add(lab);
    // zone cliquable : un cylindre invisible couvrant table + chaises
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(sz.w, sz.d) / 2 + 0.55, Math.max(sz.w, sz.d) / 2 + 0.55, 1.2, 16), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.6; hit.userData.pick = { table: tb }; g.add(hit); pickables.push(hit);
    const r = Math.max(sz.w, sz.d) / 2 + 0.25;
    colliders.push({ x0: tb.x - r, x1: tb.x + r, z0: tb.z - r, z1: tb.z + r });
    entries[tb.id] = { clothM, ring, tb };
    mats[tb.id] = clothM;
  };
  tables.forEach(mk);

  const state = { statuses, selectedId };
  const apply = () => {
    for (const [id, e] of Object.entries(entries)) {
      const sel = String(state.selectedId) === String(id);
      const st = state.statuses[id];
      const col = sel ? TABLE_COLORS.selected : TABLE_COLORS[st] || TABLE_COLORS.neutral;
      e.clothM.color.set(col); e.clothM.emissive.set(sel ? "#8a5a10" : "#000000"); e.ring.visible = sel;
    }
  };
  apply();

  return {
    scene, colliders, bounds: { x0: 0.1, x1: W - 0.1, z0: 0.1, z1: D - 0.1 },
    spawn: { x: W / 2, z: Math.max(2, D - 1.3), yaw: 0 },
    pickables, zones,
    setState(next) { Object.assign(state, next); apply(); },
    statusLabel: (tb) => `${t.table} ${tb.label} · ${tb.seats} ${t.seats}${state.statuses[tb.id] ? " · " + (t[String(state.selectedId) === String(tb.id) ? "selected" : state.statuses[tb.id]] || "") : ""}`,
    update(dt) { for (const e of Object.values(entries)) if (e.ring.visible) e.ring.rotation.z += dt * 0.8; },
  };
}
