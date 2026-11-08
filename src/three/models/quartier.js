import { THREE, addMesh, std } from "../core.js";

const FACADES = ["#f1e3c8", "#e8c9a0", "#d9e3d0", "#e6d3d0", "#f4ecd8", "#cfdde6", "#eed7b5", "#dcd2c0"];
const ROOFS = ["#9b4a36", "#6d4b3a", "#4f5d6b", "#8a5a2f", "#5b6b4f"];
const STEP = 15, ROAD_W = 7, SIDE = 1.6;
const LBL = { fr: { night: "/ nuit", reviews: "avis", types: { lodge: "LODGE", hotel_room: "HÔTEL", apartment: "APPARTEMENT", house: "MAISON", villa: "VILLA", guesthouse: "MAISON D'HÔTES", studio: "STUDIO", room: "CHAMBRE" } }, en: { night: "/ night", reviews: "reviews", types: { lodge: "LODGE", hotel_room: "HOTEL", apartment: "APARTMENT", house: "HOUSE", villa: "VILLA", guesthouse: "GUESTHOUSE", studio: "STUDIO", room: "ROOM" } } };

const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; return x >>> 0; };

function wrapLines(g, text, maxW, max = 2) {
  const words = String(text).split(/\s+/), lines = []; let cur = "";
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  if (lines.length > max) { lines.length = max; lines[max - 1] = lines[max - 1].replace(/.{0,2}$/, "…"); }
  return lines;
}
function signTexture(item, price, lbl) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 288; const g = c.getContext("2d");
  g.fillStyle = "#fffaf0"; g.fillRect(0, 0, 512, 288);
  g.fillStyle = "#3b2a1a"; g.fillRect(0, 0, 512, 56);
  g.fillStyle = "#f3d9a4"; g.font = "bold 28px sans-serif"; g.textBaseline = "middle"; g.fillText(lbl.types[item.type] || String(item.type).toUpperCase(), 22, 29);
  g.fillStyle = "#1d1b19"; g.font = "bold 40px sans-serif";
  wrapLines(g, item.title, 470).forEach((l, i) => g.fillText(l, 22, 106 + i * 46));
  g.fillStyle = "#8b5e34"; g.font = "bold 44px sans-serif"; g.fillText(`${price} ${lbl.night}`, 22, 222);
  if (item.rating_avg) { g.fillStyle = "#6b6258"; g.font = "28px sans-serif"; g.textAlign = "right"; g.fillText(`★ ${item.rating_avg.toFixed(1)}`, 492, 262); g.textAlign = "left"; }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function skyTexture() {
  const c = document.createElement("canvas"); c.width = 4; c.height = 256; const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, "#6fa8dc"); gr.addColorStop(0.6, "#bcdcf0"); gr.addColorStop(1, "#f4ead6");
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function houseBody(g, item, seed, side) {
  // le logement est construit à l'origine, façade vers +z (la rue) ; on le pivote ensuite selon le côté
  const fac = std(FACADES[seed % FACADES.length], { roughness: 0.95, emissive: "#3a342c", emissiveIntensity: 0.25 }), roof = std(ROOFS[(seed >> 3) % ROOFS.length], { roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: "#8fb7d6", roughness: 0.1, metalness: 0.3, emissive: "#203040", emissiveIntensity: 0.3 });
  const trim = std("#fffdf7"), door = std("#6b4a2d");
  const body = (w, h, d, x = 0, y = 0, z = 0, m = fac) => addMesh(g, new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z);
  const win = (x, y, z, w = 1.1, h = 1.2) => { addMesh(g, new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.06), trim, x, y, z + 0.015); addMesh(g, new THREE.BoxGeometry(w, h, 0.08), glass, x, y, z + 0.03); };
  const gable = (w, d, h, y, m = roof) => {
    const s = new THREE.Shape(); s.moveTo(-w / 2 - 0.5, 0); s.lineTo(w / 2 + 0.5, 0); s.lineTo(0, h); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: d + 1, bevelEnabled: false }); geo.translate(0, 0, -(d + 1) / 2);
    return addMesh(g, geo, m, 0, y, 0);
  };
  let w = 8, d = 7, h = 3.2, dx = 0;
  switch (item.type) {
    case "apartment": {
      w = 9; d = 9; h = 9.6; body(w, h, d);
      for (let f = 0; f < 3; f++) for (let i = -1; i <= 1; i++) { win(i * 2.7, 1.9 + f * 3.1, d / 2 + 0.01, 1.2, 1.5); if (f > 0) addMesh(g, new THREE.BoxGeometry(1.8, 0.9, 0.08), new THREE.MeshStandardMaterial({ color: "#d3e4ee", transparent: true, opacity: 0.45 }), i * 2.7, 0.9 + 1.9 + f * 3.1 - 1.0, d / 2 + 0.55); }
      body(w + 0.4, 0.3, d + 0.4, 0, h, 0, std("#8a8479")); break;
    }
    case "lodge": case "hotel_room": case "guesthouse": {
      w = 13; d = 8; h = 5.4; body(w, h, d);
      for (let f = 0; f < 2; f++) for (let i = -2; i <= 2; i++) if (!(f === 0 && i === 0)) win(i * 2.4, 1.7 + f * 2.6, d / 2 + 0.01, 1.2, 1.3);
      addMesh(g, new THREE.BoxGeometry(4.2, 0.18, 2), std("#2d6a4f"), 0, 3.0, d / 2 + 1); // auvent
      gable(w, d, 1.8, h, roof); break;
    }
    case "villa": {
      w = 12; d = 9; h = 3.8; body(w, h, d); body(5, 3.2, 6, -3.5, h, -1, std("#f6f1e6", { roughness: 0.9 }));
      for (const x of [-4, -1.5, 3.6, 5]) win(x, 1.9, d / 2 + 0.01, 1.5, 1.7);
      for (const x of [-4.5, -2.5]) win(x, h + 1.6, 2.51, 1.4, 1.2);
      body(w + 0.5, 0.25, d + 0.5, 0, h - 0.1, 0, std("#8a8479")); break;
    }
    case "room": case "studio": {
      w = 5.6; d = 5; h = 2.9; body(w, h, d); win(-1.7, 1.6, d / 2 + 0.01, 1.0, 1.1); gable(w, d, 1.3, h, roof); dx = 0; break;
    }
    default: { // house
      w = 8.6; d = 7; h = 3.2; body(w, h, d); win(-2.6, 1.7, d / 2 + 0.01, 1.3, 1.3); win(2.6, 1.7, d / 2 + 0.01, 1.3, 1.3);
      gable(w, d, 2.2, h, roof);
      body(2.4, 0.15, 1.8, 0, 2.6, d / 2 + 0.9, std("#fffdf7")); // petit porche
    }
  }
  // porte d'entrée + marche
  const dxPos = item.type === "apartment" || item.type === "lodge" || item.type === "hotel_room" || item.type === "guesthouse" ? 0 : 0.3;
  addMesh(g, new THREE.BoxGeometry(1.0, 2.1, 0.1), door, dxPos, 1.05, d / 2 + 0.04);
  addMesh(g, new THREE.BoxGeometry(1.6, 0.12, 0.8), std("#bdb7aa"), dxPos, 0.06, d / 2 + 0.45);
  void dx; void side;
  return { w, d, h };
}

/** Rue d'un quartier : une maison par annonce, de part et d'autre de la chaussée. */
export function buildNeighbourhood(THREE_, items = [], { lang = "fr", money = (n) => String(n) } = {}) {
  const lbl = LBL[lang] || LBL.fr;
  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog("#cfe4f0", 40, 120);
  const g = new THREE.Group(); scene.add(g);
  const colliders = [], pickables = [];
  const rows = Math.max(2, Math.ceil(items.length / 2));
  const len = rows * STEP + 22;
  const zEnd = -len + 8;

  // sol, chaussée, trottoirs, marquage
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, len + 120), std("#86a862", { roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, -len / 2 + 20); g.add(ground);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, len + 40), std("#4a4a4d", { roughness: 0.95 })); road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -len / 2 + 10); g.add(road);
  for (const s of [-1, 1]) { const sw = new THREE.Mesh(new THREE.PlaneGeometry(SIDE, len + 40), std("#c9c3b6", { roughness: 1 })); sw.rotation.x = -Math.PI / 2; sw.position.set(s * (ROAD_W / 2 + SIDE / 2), 0.012, -len / 2 + 10); g.add(sw); }
  for (let z = 8; z > zEnd; z -= 4) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 1.8), std("#f4efe2")); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.014, z); g.add(m); }

  const tree = (x, z, s = 1) => {
    addMesh(g, new THREE.CylinderGeometry(0.14 * s, 0.2 * s, 2 * s, 8), std("#6b4a2d"), x, s, z);
    for (const [dx, dy, dz, r] of [[0, 2.6, 0, 1.2], [0.7, 2.2, 0.3, 0.9], [-0.6, 2.3, -0.3, 0.95]]) addMesh(g, new THREE.SphereGeometry(r * s, 12, 10), std(["#4d8a3f", "#5b9a48", "#3f7a3b"][Math.abs(Math.round(x + z)) % 3], { roughness: 1 }), x + dx * s, dy * s, z + dz * s);
    colliders.push({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 });
  };
  const lamp = (x, z) => {
    addMesh(g, new THREE.CylinderGeometry(0.05, 0.07, 4.4, 8), std("#2b2b2b"), x, 2.2, z);
    addMesh(g, new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshBasicMaterial({ color: "#fff4cf" }), x, 4.5, z);
    colliders.push({ x0: x - 0.1, x1: x + 0.1, z0: z - 0.1, z1: z + 0.1 });
  };

  items.forEach((item, i) => {
    const side = i % 2 === 0 ? -1 : 1, row = Math.floor(i / 2), z = -row * STEP - 4;
    const seed = hash(item.id || i + 1);
    const holder = new THREE.Group(); g.add(holder);
    const dims = houseBody(holder, item, seed, side);
    const setback = ROAD_W / 2 + SIDE + 4.5 + dims.d / 2 + (item.type === "villa" ? 2 : 0);
    holder.position.set(side * setback, 0, z);
    holder.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; // façade tournée vers la rue
    holder.userData.pick = { item };
    pickables.push(holder);
    // collision : emprise du bâtiment en repère monde (façade ↔ rue)
    const cx = holder.position.x, hw = dims.d / 2 + 0.6, hd = dims.w / 2 + 0.6;
    colliders.push({ x0: cx - hw, x1: cx + hw, z0: z - hd, z1: z + hd });
    // panneau planté devant la maison
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.3), new THREE.MeshBasicMaterial({ map: signTexture(item, money(item.price_per_night), lbl), side: THREE.DoubleSide }));
    const sx = side * (ROAD_W / 2 + SIDE + 0.6);
    board.position.set(sx, 2.1, z + dims.w / 2 + 1.2); board.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    const post = new THREE.Group(); post.add(board);
    for (const dz of [-1.0, 1.0]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 8), std("#3b2a1a")); pole.position.set(sx, 1.4, z + dims.w / 2 + 1.2 + dz); post.add(pole); }
    post.userData.pick = { item }; g.add(post); pickables.push(post);
    // haie basse + allée, arbre de jardin
    const hedge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, dims.w + 6), std("#3f7a3b", { roughness: 1 }));
    hedge.position.set(side * (ROAD_W / 2 + SIDE + 0.25), 0.35, z); g.add(hedge);
    colliders.push({ x0: Math.min(side * (ROAD_W / 2 + SIDE), side * (ROAD_W / 2 + SIDE + 0.5)), x1: Math.max(side * (ROAD_W / 2 + SIDE), side * (ROAD_W / 2 + SIDE + 0.5)), z0: z - dims.w / 2 - 3, z1: z + dims.w / 2 + 3 });
    const path = new THREE.Mesh(new THREE.PlaneGeometry(setback - ROAD_W / 2 - SIDE - dims.d / 2, 1.2), std("#cbbfa8", { roughness: 1 }));
    path.rotation.x = -Math.PI / 2; path.position.set(side * (ROAD_W / 2 + SIDE + (setback - ROAD_W / 2 - SIDE - dims.d / 2) / 2), 0.015, z + 0.3); g.add(path);
    tree(side * (setback + dims.d / 2 + 3), z + 3, 1.1 + (seed % 3) * 0.15);
  });
  // allée d'arbres + lampadaires le long de la rue
  for (let k = 0; k < rows + 1; k++) {
    const z = -k * STEP + 2;
    lamp(-(ROAD_W / 2 + 0.5), z - 5); lamp(ROAD_W / 2 + 0.5, z - 12);
    tree(-(ROAD_W / 2 + SIDE - 0.4), z - 9, 0.9); tree(ROAD_W / 2 + SIDE - 0.4, z - 2, 0.9);
  }
  // barrière au bout de la rue
  const bar = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W + 2 * SIDE, 1.1, 0.2), std("#c8372d")); bar.position.set(0, 0.8, zEnd); g.add(bar);
  scene.add(new THREE.HemisphereLight("#eaf3ff", "#8a9a6a", 1.5));
  const sun = new THREE.DirectionalLight("#fff3d6", 1.9); sun.position.set(-12, 24, 10); scene.add(sun);
  return {
    scene, colliders, pickables,
    bounds: { x0: -26, x1: 26, z0: zEnd + 0.5, z1: 14 },
    spawn: { x: 0, z: 9, yaw: 0 },
  };
}
