import { THREE, addMesh, box, cyl, std } from "../core.js";
import { buildShopModel } from "./shop.js";

const H = 2.7, T = 0.12, DOOR_H = 2.1;
const L = {
  fr: { living: "Salon & cuisine", bedroom: "Chambre", bathroom: "Salle de bain", corridor: "Couloir", lobby: "Réception", room: "Votre chambre", terrace: "Terrasse & jardin", balcony: "Balcon", studio: "Studio", pool: "Piscine", bed: "Lit", bedSingle: "Lit simple", sofa: "Canapé", tv: "Télévision", table: "Table à manger", kitchen: "Cuisine équipée", desk: "Bureau", wardrobe: "Armoire", reception: "Comptoir de réception", ac: "Climatiseur", door: "Chambre", yourDoor: "Votre chambre", toilet: "WC", shower: "Douche", basin: "Lavabo", plant: "Plante", fridge: "Réfrigérateur", entry: "Entrée", garden: "Jardin" },
  en: { living: "Living & kitchen", bedroom: "Bedroom", bathroom: "Bathroom", corridor: "Corridor", lobby: "Reception", room: "Your room", terrace: "Terrace & garden", balcony: "Balcony", studio: "Studio", pool: "Swimming pool", bed: "Bed", bedSingle: "Single bed", sofa: "Sofa", tv: "Television", table: "Dining table", kitchen: "Fitted kitchen", desk: "Desk", wardrobe: "Wardrobe", reception: "Reception desk", ac: "Air conditioner", door: "Room", yourDoor: "Your room", toilet: "Toilet", shower: "Shower", basin: "Basin", plant: "Plant", fridge: "Fridge", entry: "Entrance", garden: "Garden" },
};

function plankTexture(base = "#b58a5e", tile = false, grass = false) {
  const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  if (grass) {
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${i % 2 ? "30,70,20" : "190,225,140"},${0.06 + (i % 5) * 0.012})`; g.fillRect((i * 53) % 256, (i * 97) % 256, 2 + (i % 4), 2 + (i % 3)); }
  } else if (tile) {
    g.strokeStyle = "rgba(0,0,0,.18)"; g.lineWidth = 2;
    for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  } else {
    for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(${i % 2 ? "0,0,0" : "255,255,255"},${0.04 + (i % 3) * 0.02})`; g.fillRect(0, i * 32, 256, 32); g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, i * 32, 256, 1.5); g.fillRect(((i * 97) % 200) + 20, i * 32, 1.5, 32); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function signTexture(text, bg = "#1d1b19", fg = "#f3d9a4") {
  const c = document.createElement("canvas"); c.width = 128; c.height = 64; const g = c.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, 128, 64); g.fillStyle = fg; g.font = "bold 34px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 64, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Petit « moteur » de pièces : murs avec ouvertures, sols, mobilier, collisions, zones. */
function makeWorld(lang) {
  const t = L[lang] || L.fr;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#bcd8ea");
  scene.fog = new THREE.Fog("#bcd8ea", 30, 90);
  const g = new THREE.Group(); scene.add(g);
  const colliders = [], pickables = [], zones = [], rects = [];
  const wallM = std("#efe9df", { roughness: 0.95, emissive: "#6e665a", emissiveIntensity: 0.55 }), trim = std("#5a4a3a"), glassM = new THREE.MeshStandardMaterial({ color: "#b8dcf0", transparent: true, opacity: 0.28, roughness: 0.05, side: THREE.DoubleSide });
  const ceilM = std("#fbf8f3", { roughness: 1, side: THREE.DoubleSide, emissive: "#d8d2c6", emissiveIntensity: 0.8 });
  const lightM = new THREE.MeshBasicMaterial({ color: "#fff6dc" });
  const solid = (x0, x1, z0, z1, y0, y1, m = wallM, collide = true) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
    b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); g.add(b);
    if (collide) colliders.push({ x0, x1, z0, z1 });
    return b;
  };
  /** Mur horizontal (ax="x" : le long de x à z=f) ou vertical (ax="z" : le long de z à x=f).
   *  openings : { c, w, kind: "door" | "open" | "window" | "closed", sign? } (c = centre le long du mur). */
  const wall = (ax, f, a0, a1, openings = [], mat = wallM) => {
    const ops = [...openings].sort((p, q) => p.c - q.c);
    const put = (s, e, y0, y1, m = mat, collide = true) => {
      if (e - s < 0.01) return null;
      return ax === "x" ? solid(s, e, f - T / 2, f + T / 2, y0, y1, m, collide) : solid(f - T / 2, f + T / 2, s, e, y0, y1, m, collide);
    };
    let cur = a0;
    for (const o of ops) {
      const s = o.c - o.w / 2, e = o.c + o.w / 2;
      put(cur, s, 0, H);
      if (o.kind === "closed") {
        const d = put(s, e, 0, DOOR_H, std("#7b5a3c", { roughness: 0.7 }));
        put(s, e, DOOR_H, H);
        if (o.sign) { // plaque numérotée au centre de la porte, des deux côtés
          const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.11), new THREE.MeshBasicMaterial({ map: signTexture(o.sign, o.gold ? "#c9a24a" : "#1d1b19", o.gold ? "#1d1b19" : "#f3d9a4") }));
          const off = T / 2 + 0.005;
          if (ax === "x") { pl.position.set(o.c, 1.55, f + off); } else { pl.position.set(f + off, 1.55, o.c); pl.rotation.y = Math.PI / 2; }
          g.add(pl);
          const pl2 = pl.clone(); if (ax === "x") { pl2.position.z = f - off; pl2.rotation.y = Math.PI; } else { pl2.position.x = f - off; pl2.rotation.y = -Math.PI / 2; } g.add(pl2);
        }
        if (o.label) { d.userData.pick = { label: o.label }; pickables.push(d); }
      } else if (o.kind === "window") {
        put(s, e, 0, 0.95); put(s, e, DOOR_H + 0.1, H);
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(e - s, DOOR_H + 0.1 - 0.95), glassM);
        gl.position.set(ax === "x" ? o.c : f, (0.95 + DOOR_H + 0.1) / 2, ax === "x" ? f : o.c); if (ax === "z") gl.rotation.y = Math.PI / 2; g.add(gl);
        // cadre
        const fr = (a, b, y0, y1) => ax === "x" ? solid(a, b, f - 0.03, f + 0.03, y0, y1, trim, false) : solid(f - 0.03, f + 0.03, a, b, y0, y1, trim, false);
        fr(s, e, 0.93, 0.97); fr(s, e, DOOR_H + 0.08, DOOR_H + 0.12); fr(o.c - 0.015, o.c + 0.015, 0.95, DOOR_H + 0.1);
        // fenêtre infranchissable
        colliders.push(ax === "x" ? { x0: s, x1: e, z0: f - T / 2, z1: f + T / 2 } : { x0: f - T / 2, x1: f + T / 2, z0: s, z1: e });
      } else { // door | open : passage libre sous un linteau
        put(s, e, DOOR_H, H, mat, false);
        if (o.kind === "door") { const fr = (a, b, y0, y1) => ax === "x" ? solid(a, b, f - 0.08, f + 0.08, y0, y1, trim, false) : solid(f - 0.08, f + 0.08, a, b, y0, y1, trim, false); fr(s - 0.04, s, 0, DOOR_H); fr(e, e + 0.04, 0, DOOR_H); fr(s - 0.04, e + 0.04, DOOR_H - 0.04, DOOR_H); }
      }
      cur = e;
    }
    put(cur, a1, 0, H);
  };
  const floorM = new Map();
  const floor = (r, kind = "wood", name) => {
    const key = kind; let m = floorM.get(key);
    if (!m) {
      const tex = plankTexture(kind === "tile" ? "#d9d4cb" : kind === "stone" ? "#b9b2a5" : kind === "grass" ? "#86a862" : kind === "concrete" ? "#9e9a94" : "#b58a5e", kind === "tile" || kind === "stone", kind === "grass");
      m = new THREE.MeshStandardMaterial({ map: tex, roughness: kind === "grass" ? 1 : 0.7, emissive: "#443c33", emissiveIntensity: 0.35 }); floorM.set(key, m); m.userData.base = tex;
    }
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    const mat = m.clone(); mat.map = m.map.clone(); mat.map.needsUpdate = true; mat.map.repeat.set(w / 2, d / 2);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); p.rotation.x = -Math.PI / 2; p.position.set((r.x0 + r.x1) / 2, kind === "grass" ? 0.001 : 0.003, (r.z0 + r.z1) / 2); g.add(p);
    if (kind !== "grass" && kind !== "stone") {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilM); c.rotation.x = Math.PI / 2; c.position.set((r.x0 + r.x1) / 2, H, (r.z0 + r.z1) / 2); g.add(c);
      const n = Math.max(1, Math.round(w / 3.2)), mz = Math.max(1, Math.round(d / 4));
      for (let i = 0; i < n; i++) for (let j = 0; j < mz; j++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), lightM); l.rotation.x = Math.PI / 2; l.position.set(r.x0 + ((i + 0.5) * w) / n, H - 0.01, r.z0 + ((j + 0.5) * d) / mz); g.add(l); }
    }
    if (name) zones.push({ ...r, name });
    rects.push(r);
  };
  const put = (kind, hex, x, z, rot = 0, o = {}) => {
    const m = buildShopModel(kind, hex); if (o.sx) m.scale.x = o.sx;
    m.position.set(x, o.y || 0, z); m.rotation.y = rot; g.add(m);
    if (o.collide !== false) { const bb = new THREE.Box3().setFromObject(m); colliders.push({ x0: bb.min.x + 0.03, x1: bb.max.x - 0.03, z0: bb.min.z + 0.03, z1: bb.max.z - 0.03 }); }
    if (o.label) { m.userData.pick = { label: o.label }; pickables.push(m); }
    return m;
  };
  const prop = (obj, x, z, rot = 0, label, collide = true, bbPad = 0) => {
    obj.position.set(x, 0, z); obj.rotation.y = rot; g.add(obj);
    if (collide) { const bb = new THREE.Box3().setFromObject(obj); colliders.push({ x0: bb.min.x + bbPad, x1: bb.max.x - bbPad, z0: bb.min.z + bbPad, z1: bb.max.z - bbPad }); }
    if (label) { obj.userData.pick = { label }; pickables.push(obj); }
    return obj;
  };
  return { t, scene, g, colliders, pickables, zones, rects, solid, wall, floor, put, prop };
}

// --- accessoires ---------------------------------------------------------------
const mk = (fn) => { const o = new THREE.Group(); fn(o); return o; };
const tv = () => mk((o) => { box(o, 1.2, 0.5, 0.4, std("#6b513a"), 0, 0.25, 0, 0.02); box(o, 1.1, 0.64, 0.04, new THREE.MeshStandardMaterial({ color: "#0b0d10", roughness: 0.2, metalness: 0.5 }), 0, 0.84, 0, 0.01); box(o, 0.05, 0.18, 0.05, std("#222"), 0, 0.57, 0, 0.01); });
const plant = () => mk((o) => { cyl(o, 0.17, 0.12, 0.3, std("#b8632f"), 0, 0.15, 0, 20); for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; addMesh(o, new THREE.SphereGeometry(0.17, 12, 10), std(i % 2 ? "#3f7a3b" : "#4d8d44"), Math.cos(a) * 0.13, 0.62 + (i % 3) * 0.14, Math.sin(a) * 0.13).scale.set(1, 1.5, 1); } });
const rug = (w, d, c) => mk((o) => { box(o, w, 0.012, d, std(c, { roughness: 1 }), 0, 0.012, 0, 0.003); box(o, w - 0.3, 0.014, d - 0.3, std("#f3ede2", { roughness: 1 }), 0, 0.013, 0, 0.003); });
const bedside = () => mk((o) => { box(o, 0.45, 0.5, 0.4, std("#8a6a4a"), 0, 0.25, 0, 0.02); });
const desk = (withLaptop) => mk((o) => { box(o, 1.3, 0.04, 0.6, std("#a98259"), 0, 0.74, 0, 0.01); for (const s of [-1, 1]) box(o, 0.04, 0.72, 0.56, std("#222"), s * 0.6, 0.36, 0, 0.01); if (withLaptop) { box(o, 0.34, 0.02, 0.24, std("#444"), 0, 0.77, 0.05, 0.005); box(o, 0.34, 0.22, 0.012, std("#222"), 0, 0.88, -0.07, 0.003, [-0.2, 0, 0]); } });
const counterRun = (len, fridge) => mk((o) => {
  box(o, len, 0.86, 0.6, std("#e9e2d4"), 0, 0.43, 0, 0.01); box(o, len + 0.02, 0.04, 0.64, std("#3b3b3b"), 0, 0.88, 0, 0.01);
  box(o, len, 0.7, 0.34, std("#e9e2d4"), 0, 1.65, -0.13, 0.01);
  box(o, 0.5, 0.02, 0.4, std("#aab", { metalness: 0.8, roughness: 0.3 }), -len * 0.2, 0.9, 0.02, 0.005);
  for (const [dx, dz] of [[-0.12, -0.1], [0.12, -0.1], [-0.12, 0.12], [0.12, 0.12]]) cyl(o, 0.07, 0.07, 0.015, std("#111"), len * 0.2 + dx, 0.905, dz, 16);
  if (fridge) box(o, 0.75, 1.85, 0.7, std("#d8dde0", { metalness: 0.5, roughness: 0.35 }), len / 2 + 0.4, 0.93, 0.05, 0.02);
});
const toilet = () => mk((o) => { box(o, 0.4, 0.36, 0.5, std("#fff"), 0, 0.2, 0.05, 0.05); box(o, 0.4, 0.4, 0.18, std("#fff"), 0, 0.45, -0.2, 0.03); });
const basin = () => mk((o) => { box(o, 0.6, 0.8, 0.45, std("#ece6da"), 0, 0.4, 0, 0.01); box(o, 0.5, 0.06, 0.36, std("#fff"), 0, 0.84, 0.02, 0.03); box(o, 0.5, 0.7, 0.02, new THREE.MeshStandardMaterial({ color: "#cfe3ee", metalness: 0.9, roughness: 0.05 }), 0, 1.5, -0.2, 0.005); });
const shower = () => mk((o) => { box(o, 0.9, 0.05, 0.9, std("#fff"), 0, 0.03, 0, 0.01); box(o, 0.02, 2.0, 0.9, new THREE.MeshStandardMaterial({ color: "#bfe0ee", transparent: true, opacity: 0.3 }), 0.45, 1.0, 0, 0.005); box(o, 0.9, 2.0, 0.02, new THREE.MeshStandardMaterial({ color: "#bfe0ee", transparent: true, opacity: 0.3 }), 0, 1.0, 0.45, 0.005); cyl(o, 0.1, 0.1, 0.02, std("#bbb", { metalness: 0.8 }), -0.2, 2.0, -0.38, 16); });
const reception = () => mk((o) => { box(o, 2.6, 1.05, 0.7, std("#5b4330"), 0, 0.52, 0, 0.02); box(o, 2.7, 0.05, 0.8, std("#e9d9b8"), 0, 1.07, 0, 0.01); box(o, 0.4, 0.3, 0.02, std("#222"), -0.6, 1.25, -0.1, 0.005); box(o, 0.12, 0.12, 0.12, std("#c9a24a", { metalness: 0.8, roughness: 0.3 }), 0.7, 1.15, 0.1, 0.01); });
const ac = () => mk((o) => { box(o, 0.9, 0.28, 0.2, std("#f3f3f1"), 0, 2.3, 0, 0.04); box(o, 0.8, 0.02, 0.1, std("#cfcfcf"), 0, 2.2, 0.08, 0.005); });
const tree = (s = 1) => mk((o) => { cyl(o, 0.12 * s, 0.17 * s, 1.8 * s, std("#6b4a2d"), 0, 0.9 * s, 0, 10); for (const [x, y, z, r] of [[0, 2.3, 0, 1.1], [0.6, 2.0, 0.2, 0.8], [-0.5, 2.1, -0.3, 0.85]]) addMesh(o, new THREE.SphereGeometry(r * s, 14, 12), std("#4d8a3f", { roughness: 1 }), x * s, y * s, z * s); });
const curtain = (w) => mk((o) => { for (const s of [-1, 1]) box(o, w * 0.22, 2.2, 0.06, std("#d9cbb4", { roughness: 1 }), s * (w / 2 - w * 0.11), 1.25, 0, 0.02); });

// --- agencement par type ---------------------------------------------------------
/** type → disposition ; chaque fonction retourne le monde prêt pour WalkView. */
export function buildInterior(THREE_, p = {}, lang = "fr") {
  const type = p.type || "apartment";
  const am = new Set(p.amenities || []);
  const W = makeWorld(lang);
  const { t } = W;
  const beds = Math.max(1, p.beds || 1), bedrooms = Math.max(1, Math.min(4, p.bedrooms || 1)), baths = Math.max(1, Math.min(3, Math.ceil(p.bathrooms || 1)));
  const out = { spawn: { x: 1.4, z: -1.0, yaw: 0 } };

  const bathroom = (r, doorSide, doorAt) => {
    W.floor(r, "tile", t.bathroom);
    const cx = (r.x0 + r.x1) / 2;
    // meubles du fond (mur nord) : WC, lavabo, douche
    W.prop(toilet(), r.x0 + 0.5, r.z0 + 0.3, 0, t.toilet);
    W.prop(basin(), Math.min(r.x1 - 0.5, cx + 0.2), r.z0 + 0.25, 0, t.basin);
    W.prop(shower(), r.x1 - 0.5, r.z0 + 0.5, 0, t.shower);
    void doorSide; void doorAt;
  };
  const bedFurn = (r, i, bedCount, { head = "n" } = {}) => {
    const cx = (r.x0 + r.x1) / 2;
    const dbl = i === 0 || bedCount === 1;
    if (head === "n") {
      if (bedCount <= 1) {
        W.put("bed", "#7d97a8", cx, r.z0 + 1.15, 0, { label: dbl ? t.bed : t.bedSingle, sx: dbl ? 1 : 0.55 });
        W.prop(bedside(), cx - 1.2, r.z0 + 0.3, 0, null, true); W.prop(bedside(), cx + 1.2, r.z0 + 0.3, 0, null, true);
      } else {
        W.put("bed", "#7d97a8", cx - 0.65, r.z0 + 1.15, 0, { label: t.bedSingle, sx: 0.55 }); W.put("bed", "#a88a7d", cx + 0.65, r.z0 + 1.15, 0, { label: t.bedSingle, sx: 0.55 });
      }
    }
  };
  const roomWithBeds = (r, bedCount, withTV, withDesk) => {
    W.floor(r, "wood");
    bedFurn(r, 0, Math.min(bedCount, 2));
    W.put("wardrobe", "#9c7a57", r.x0 + 0.35, r.z1 - 1.0, Math.PI / 2, { label: t.wardrobe });
    if (withDesk) { const d = W.prop(desk(true), r.x1 - 0.4, r.z1 - 1.2, -Math.PI / 2, t.desk); void d; W.put("chair", "#3e3a36", r.x1 - 1.05, r.z1 - 1.2, -Math.PI / 2, { collide: false }); }
    if (withTV) W.prop(tv(), (r.x0 + r.x1) / 2, r.z1 - 0.3, Math.PI, t.tv);
    if (am.has("ac")) W.prop(ac(), (r.x0 + r.x1) / 2 + 1.4, r.z0 + 0.12, 0, t.ac, false);
    W.put("lamp", "#f3d9a4", r.x0 + 0.35, r.z0 + 0.35, 0, { collide: false });
    W.prop(rug(2.4, 1.8, "#a97c5a"), (r.x0 + r.x1) / 2, r.z0 + 2.7, 0, null, false);
  };
  const outside = (extent) => { // sol extérieur & ciel
    const gr = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), std("#8fae6b", { roughness: 1 })); gr.rotation.x = -Math.PI / 2; gr.position.y = -0.01; W.g.add(gr);
    void extent;
  };
  outside();

  if (type === "room" || type === "hotel_room" || type === "lodge" || type === "guesthouse") {
    // Hôtel / maison d'hôtes : réception → couloir → chambre. Chambre simple : seulement la chambre.
    const hotel = type !== "room";
    let rr; // rectangle de la chambre
    if (hotel) {
      const lobby = { x0: -3.5, x1: 3.5, z0: -6, z1: 0 };
      const cor = { x0: -1, x1: 1, z0: -16.4, z1: -6 };
      rr = { x0: 1.12, x1: 5.4, z0: -15.4, z1: -11.4 };
      const bath = { x0: 5.52, x1: 7.6, z0: -15.4, z1: -12.6 };
      W.floor(lobby, "tile", t.lobby); W.floor(cor, "concrete", t.corridor);
      // lobby
      W.wall("x", 0, lobby.x0, lobby.x1, [{ c: 0, w: 1.6, kind: "open" }, { c: -2.4, w: 1.6, kind: "window" }, { c: 2.4, w: 1.6, kind: "window" }]);
      W.wall("z", lobby.x0, lobby.z0, 0, [{ c: -3, w: 1.6, kind: "window" }]); W.wall("z", lobby.x1, lobby.z0, 0, [{ c: -3, w: 1.6, kind: "window" }]);
      W.wall("x", -6, lobby.x0, lobby.x1, [{ c: 0, w: 1.6, kind: "open" }]);
      W.prop(reception(), -1.9, -4.9, 0, t.reception);
      W.put("sofa", "#6d8f7d", 2.2, -1.2, Math.PI, { label: t.sofa }); W.put("armchair", "#c9a24a", -2.6, -1.4, Math.PI * 0.75, { label: null });
      W.prop(rug(3, 2, "#8a6a4a"), 1.4, -2.4, 0, null, false);
      W.prop(plant(), -3.1, -0.5, 0, t.plant); W.prop(plant(), 3.1, -5.5, 0, t.plant); W.prop(plant(), 3.1, -0.5, 0, t.plant);
      // couloir
      W.wall("z", cor.x0, cor.z0, -6, [{ c: -8, w: 1, kind: "closed", sign: "101", label: `${t.door} 101` }, { c: -10, w: 1, kind: "closed", sign: "103", label: `${t.door} 103` }, { c: -12, w: 1, kind: "closed", sign: "105", label: `${t.door} 105` }, { c: -14, w: 1, kind: "closed", sign: "107", label: `${t.door} 107` }]);
      W.wall("z", cor.x1, cor.z0, -6, [{ c: -8, w: 1, kind: "closed", sign: "102", label: `${t.door} 102` }, { c: -10, w: 1, kind: "closed", sign: "104", label: `${t.door} 104` }, { c: -14.2, w: 1.0, kind: "door" }]);
      // pancartes dorées sur la porte de la chambre : plaque + halo
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.13), new THREE.MeshBasicMaterial({ map: signTexture("★ 106", "#c9a24a", "#1d1b19") })); plate.position.set(0.9, 1.65, -14.2); plate.rotation.y = -Math.PI / 2; W.g.add(plate);
      W.wall("x", cor.z0, cor.x0, cor.x1, [{ c: 0, w: 1.2, kind: "window" }]);
      for (const z of [-8, -11, -14]) { const l = new THREE.PointLight("#fff1d6", 1.1, 7); l.position.set(0, 2.3, z); W.scene.add(l); }
      // chambre + salle de bain
      W.wall("x", rr.z0 - 0.0, rr.x0, rr.x1 + 0, [{ c: 3.3, w: 1.8, kind: "window" }]);
      W.wall("x", rr.z1 + 0.0, rr.x0, rr.x1, []);
      W.wall("z", rr.x0, rr.z0, rr.z1, [{ c: -14.2, w: 1.0, kind: "door" }]);
      W.wall("z", rr.x1, rr.z0, rr.z1, [{ c: -14, w: 0.9, kind: "door" }]);
      bathroom(bath, "w", -14);
      W.wall("x", bath.z0, bath.x0, bath.x1, [{ c: 6.6, w: 0.8, kind: "window" }]); W.wall("x", bath.z1, bath.x0, bath.x1, []); W.wall("z", bath.x1, bath.z0, bath.z1, []);
      W.wall("x", rr.z1, rr.x1, bath.x0, []);
      roomWithBeds(rr, beds, am.has("tv") || true, am.has("workspace") || true);
      zones_name(W, rr, t.room);
      out.spawn = { x: 0, z: 1.2 - 1.5, yaw: 0 };
      out.bounds = { x0: -3.6, x1: 7.7, z0: -16.5, z1: 0 };
      const rl = new THREE.PointLight("#fff1d6", 1.4, 7); rl.position.set(3.2, 2.3, -13.4); W.scene.add(rl);
    } else {
      rr = { x0: 0, x1: 4.6, z0: -4.2, z1: 0 };
      const bath = { x0: 4.72, x1: 6.8, z0: -4.2, z1: -1.8 };
      roomWithBeds(rr, beds, true, true);
      W.wall("x", 0, rr.x0, rr.x1, [{ c: 0.9, w: 0.95, kind: "door" }, { c: 3.3, w: 1.4, kind: "window" }]);
      W.wall("x", rr.z0, rr.x0, rr.x1, [{ c: 1.3, w: 1.4, kind: "window" }]);
      W.wall("z", rr.x0, rr.z0, rr.z1, [{ c: -2.0, w: 1.2, kind: "window" }]);
      W.wall("z", rr.x1, rr.z0, rr.z1, [{ c: -3.0, w: 0.9, kind: "door" }]);
      bathroom(bath);
      W.wall("x", bath.z0, bath.x0, bath.x1, [{ c: 5.8, w: 0.8, kind: "window" }]); W.wall("x", bath.z1, bath.x0, bath.x1, []); W.wall("z", bath.x1, bath.z0, bath.z1, []);
      zones_name(W, rr, t.room);
      const l = new THREE.PointLight("#fff1d6", 1.4, 8); l.position.set(2.3, 2.3, -2); W.scene.add(l);
      out.bounds = { x0: -0.1, x1: 6.9, z0: -4.3, z1: 3 };
      out.spawn = { x: 0.9, z: 1.6, yaw: 0 };
      W.floor({ x0: -1, x1: 5.6, z0: 0, z1: 3.2 }, "stone", t.entry);
      W.prop(plant(), 3.9, 0.7, 0, t.plant);
    }
  } else if (type === "studio") {
    const r = { x0: 0, x1: 6.2, z0: -4.8, z1: 0 };
    W.floor(r, "wood", t.studio);
    W.wall("x", 0, r.x0, r.x1, [{ c: 1.3, w: 0.95, kind: "door" }, { c: 4.0, w: 1.8, kind: "window" }]);
    W.wall("x", r.z0, r.x0, r.x1, [{ c: 2.2, w: 1.6, kind: "window" }]);
    W.wall("z", r.x0, r.z0, 0, [{ c: -2.4, w: 1.4, kind: "window" }]); W.wall("z", r.x1, r.z0, 0, []);
    const bath = { x0: 4.7, x1: 6.2, z0: -4.8, z1: -2.8 };
    bathroom(bath);
    W.wall("x", -2.8, bath.x0, bath.x1, [{ c: 5.45, w: 0.8, kind: "door" }]); W.wall("z", bath.x0, bath.z0, -2.8, []);
    W.prop(counterRun(2.8, true), 1.9, -4.5, 0, t.kitchen);
    W.put("bed", "#7d97a8", 1.1, -1.9, Math.PI / 2, { label: t.bed });
    W.put("sofa", "#c9a24a", 3.0, -0.5, Math.PI, { label: t.sofa, sx: 0.8 });
    W.prop(tv(), 5.9, -1.4, -Math.PI / 2, t.tv);
    W.put("table", "#a98259", 3.4, -2.8, 0, { label: t.table, sx: 0.6 });
    W.put("chair", "#3e3a36", 3.4, -2.2, Math.PI, { collide: false }); W.put("chair", "#3e3a36", 3.4, -3.4, 0, { collide: false });
    W.put("wardrobe", "#9c7a57", 0.35, -3.5, Math.PI / 2, { label: t.wardrobe });
    if (am.has("ac")) W.prop(ac(), 3.0, -4.7, 0, t.ac, false);
    W.prop(rug(2.4, 1.6, "#a97c5a"), 3.0, -1.6, 0, null, false);
    for (const [x, z] of [[1.8, -2.2], [4.4, -1.2]]) { const l = new THREE.PointLight("#fff1d6", 1.2, 7); l.position.set(x, 2.3, z); W.scene.add(l); }
    W.floor({ x0: -1, x1: 3.4, z0: 0, z1: 3 }, "stone", t.entry);
    out.bounds = { x0: -0.1, x1: 6.3, z0: -4.9, z1: 3 }; out.spawn = { x: 1.3, z: 1.6, yaw: 0 };
  } else {
    // apartment / house / villa
    const big = type === "villa" ? 1.25 : type === "house" ? 1.1 : 1;
    const bw = 3.7 * big, ba = 2.1 * big;
    const sumW = bedrooms * bw + baths * ba;
    const Wt = Math.max(8.4 * big, sumW), D = 5 * big, CH = 1.5, BD = 3.6 * big;
    const s = Wt / sumW;
    const living = { x0: 0, x1: Wt, z0: -D, z1: 0 }, cor = { x0: 0, x1: Wt, z0: -D - CH, z1: -D };
    const zb0 = -D - CH - BD, zb1 = -D - CH;
    W.floor(living, "wood", t.living); W.floor(cor, "wood", t.corridor);
    const terrace = type !== "apartment";
    const doorX = 1.4, slideX = Wt * 0.74;
    W.wall("x", 0, living.x0, living.x1, [{ c: doorX, w: 1.0, kind: "door" }, { c: Wt * 0.42, w: 1.5, kind: "window" }, { c: slideX, w: 2.6, kind: "open" }]);
    W.wall("z", 0, -D, 0, [{ c: -D / 2, w: 1.6, kind: "window" }]); W.wall("z", Wt, -D, 0, [{ c: -D / 2, w: 1.6, kind: "window" }]);
    W.wall("x", -D, 0, Wt, [{ c: Wt * 0.2, w: 1.4, kind: "open" }]);
    W.wall("z", 0, zb0, -D, []); W.wall("z", Wt, zb0, -D, []);
    // salon : canapé face à la télé, table à manger, cuisine équipée à l'est
    W.prop(tv(), 0.4, -D / 2, Math.PI / 2, t.tv);
    W.put("sofa", "#6d8f7d", 3.0, -D / 2, -Math.PI / 2, { label: t.sofa }); W.put("armchair", "#c9a24a", 2.6, -D + 0.9, -Math.PI * 0.8, { collide: true });
    W.prop(rug(2.8, 2.0, "#8a6a4a"), 1.9, -D / 2, 0, null, false);
    const tx = Wt * 0.52; W.put("table", "#a98259", tx, -D / 2, 0, { label: t.table });
    W.put("chair", "#3e3a36", tx - 0.45, -D / 2 - 0.7, 0, { collide: false }); W.put("chair", "#3e3a36", tx + 0.45, -D / 2 - 0.7, 0, { collide: false });
    W.put("chair", "#3e3a36", tx - 0.45, -D / 2 + 0.7, Math.PI, { collide: false }); W.put("chair", "#3e3a36", tx + 0.45, -D / 2 + 0.7, Math.PI, { collide: false });
    W.prop(counterRun(3.0, true), Wt - 2.3, -D + 0.45, 0, t.kitchen);
    W.prop(plant(), 0.5, -0.5, 0, t.plant); W.put("shelf", "#9c7a57", 0.3, -D + 0.9, Math.PI / 2, { collide: true });
    if (am.has("ac")) W.prop(ac(), Wt * 0.5, -D + 0.12, 0, t.ac, false);
    for (const [x, z] of [[2.2, -D / 2], [Wt * 0.6, -D / 2], [Wt - 1.5, -D + 1]]) { const l = new THREE.PointLight("#fff1d6", 1.3, 8); l.position.set(x, 2.3, z); W.scene.add(l); }
    // couloir & rangée de chambres / salles de bain
    let cx = 0; const doors = [];
    const rooms = [];
    for (let i = 0; i < bedrooms; i++) { rooms.push({ kind: "bed", x0: cx, x1: cx + bw * s, i }); cx += bw * s; }
    for (let i = 0; i < baths; i++) { rooms.push({ kind: "bath", x0: cx, x1: cx + ba * s, i }); cx += ba * s; }
    rooms.forEach((r) => doors.push({ c: (r.x0 + r.x1) / 2, w: 0.95, kind: "door" }));
    W.wall("x", zb1, 0, Wt, doors);
    W.wall("x", zb0, 0, Wt, rooms.map((r) => ({ c: (r.x0 + r.x1) / 2, w: Math.min(1.6, (r.x1 - r.x0) * 0.5), kind: "window" })));
    let bedIdx = 0, bedLeft = beds;
    rooms.forEach((r, k) => {
      const rect = { x0: r.x0, x1: r.x1, z0: zb0, z1: zb1 };
      if (k > 0) W.wall("z", r.x0, zb0, zb1, []);
      if (r.kind === "bed") {
        const bc = Math.max(1, Math.min(2, Math.ceil(bedLeft / (bedrooms - r.i)))); bedLeft -= bc;
        roomWithBeds(rect, bc, r.i === 0 || am.has("tv"), r.i === 0 && am.has("workspace"));
        zones_name(W, rect, bedrooms > 1 ? `${t.bedroom} ${r.i + 1}` : t.bedroom); bedIdx++;
        if (r.i < 2) { const l = new THREE.PointLight("#fff1d6", 1.2, 7); l.position.set((r.x0 + r.x1) / 2, 2.3, (zb0 + zb1) / 2); W.scene.add(l); }
      } else bathroom(rect);
    });
    void bedIdx;
    // terrasse / balcon
    if (terrace) {
      const ter = { x0: -2, x1: Wt + 2, z0: 0, z1: 8 * big };
      W.floor(ter, "grass", t.terrace);
      W.floor({ x0: Wt * 0.5, x1: Wt * 0.98, z0: 0, z1: 3.2 }, "stone");
      const pool = am.has("pool") || type === "villa";
      if (pool) {
        const px0 = Wt * 0.06, px1 = Wt * 0.4, pz0 = 2.6, pz1 = 6.6 * big;
        W.floor({ x0: px0 - 0.6, x1: px1 + 0.6, z0: pz0 - 0.6, z1: pz1 + 0.6 }, "stone");
        const water = new THREE.Mesh(new THREE.PlaneGeometry(px1 - px0, pz1 - pz0), new THREE.MeshStandardMaterial({ color: "#46b6d6", roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 }));
        water.rotation.x = -Math.PI / 2; water.position.set((px0 + px1) / 2, 0.012, (pz0 + pz1) / 2); W.g.add(water);
        const rim = (a, b, c, d) => W.solid(a, b, c, d, 0, 0.14, std("#ece6da"), false);
        rim(px0 - 0.1, px1 + 0.1, pz0 - 0.1, pz0); rim(px0 - 0.1, px1 + 0.1, pz1, pz1 + 0.1); rim(px0 - 0.1, px0, pz0, pz1); rim(px1, px1 + 0.1, pz0, pz1);
        W.colliders.push({ x0: px0 - 0.05, x1: px1 + 0.05, z0: pz0 - 0.05, z1: pz1 + 0.05 }); // on ne marche pas dans l'eau
        W.zones.push({ x0: px0 - 0.6, x1: px1 + 0.6, z0: pz0 - 0.6, z1: pz1 + 0.6, name: t.pool });
        for (const [x, z] of [[px1 + 1.4, 3.4], [px1 + 1.4, 4.4]]) W.put("armchair", "#e6dcc8", x, z, Math.PI / 2, { collide: true });
      }
      for (const [x, z, sc] of [[-1.2, 2, 1], [Wt + 1.2, 3, 1.2], [-1.2, 7 * big, 1.1], [Wt + 1.2, 7 * big, 1]]) W.prop(tree(sc), x, z, 0, t.garden, true, 0.1);
      const fence = (a, b, c, d) => W.solid(a, b, c, d, 0, 1.0, std("#e8e2d6"), true);
      fence(ter.x0, ter.x1, ter.z1 - 0.06, ter.z1); fence(ter.x0, ter.x0 + 0.06, 0, ter.z1); fence(ter.x1 - 0.06, ter.x1, 0, ter.z1);
      W.put("table", "#a98259", Wt * 0.76, 1.6, 0, { sx: 0.7 }); W.put("chair", "#e6dcc8", Wt * 0.76 - 0.5, 1.6, Math.PI / 2, { collide: false }); W.put("chair", "#e6dcc8", Wt * 0.76 + 0.5, 1.6, -Math.PI / 2, { collide: false });
      out.bounds = { x0: -2, x1: Wt + 2, z0: zb0 - 0.1, z1: ter.z1 };
      out.spawn = { x: doorX, z: 5.2, yaw: 0 };
    } else {
      // balcon d'appartement
      const bal = { x0: Wt * 0.74 - 1.6, x1: Wt * 0.74 + 1.6, z0: 0, z1: 1.8 };
      W.floor(bal, "stone", t.balcony);
      const rail = (a, b, c, d) => W.solid(a, b, c, d, 0, 1.05, new THREE.MeshStandardMaterial({ color: "#c8dde8", transparent: true, opacity: 0.4 }), true);
      rail(bal.x0, bal.x1, bal.z1 - 0.04, bal.z1); rail(bal.x0, bal.x0 + 0.04, 0, bal.z1); rail(bal.x1 - 0.04, bal.x1, 0, bal.z1);
      W.put("chair", "#3e3a36", bal.x0 + 0.7, 1.0, Math.PI, { collide: false }); W.put("chair", "#3e3a36", bal.x1 - 0.7, 1.0, Math.PI, { collide: false });
      W.prop(plant(), bal.x0 + 0.3, 0.4, 0, t.plant);
      out.bounds = { x0: -0.1, x1: Wt + 0.1, z0: zb0 - 0.1, z1: 1.8 };
      out.spawn = { x: doorX, z: -1.0, yaw: 0 };
    }
  }
  W.scene.add(new THREE.HemisphereLight("#fff6e8", "#8a7a68", 1.25));
  const sun = new THREE.DirectionalLight("#fff0d4", 1.1); sun.position.set(6, 12, 8); W.scene.add(sun);
  return { scene: W.scene, colliders: W.colliders, pickables: W.pickables, zones: W.zones, bounds: out.bounds || boundsOf(W.rects), spawn: out.spawn };
}

function zones_name(W, r, name) { W.zones.push({ ...r, name }); }
function boundsOf(rects) {
  return rects.reduce((b, r) => ({ x0: Math.min(b.x0, r.x0), x1: Math.max(b.x1, r.x1), z0: Math.min(b.z0, r.z0), z1: Math.max(b.z1, r.z1) }), { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 });
}
