import { THREE, addMesh, box, cyl, std, tintable } from "../core.js";

const WOOD = "#8a6a4a", DARK = "#1d1b19", METAL = "#9a9a9a";

function legs(g, w, d, h, x0, z0, r = 0.025, mat = std(DARK)) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, r, r * 0.8, h, mat, sx * (w / 2 - x0), h / 2, sz * (d / 2 - z0), 12);
}

const FURNITURE = {
  sofa(g, hex) {
    const m = tintable(hex), mm = tintable(hex);
    box(g, 2.1, 0.28, 0.9, m, 0, 0.3, 0, 0.06);
    box(g, 2.1, 0.5, 0.2, m, 0, 0.72, -0.35, 0.07);
    for (const s of [-1, 1]) box(g, 0.2, 0.42, 0.9, m, s * 1.0, 0.5, 0, 0.06);
    for (const x of [-0.6, 0, 0.6]) { box(g, 0.58, 0.16, 0.66, mm, x, 0.52, 0.06, 0.06); box(g, 0.56, 0.38, 0.14, mm, x, 0.78, -0.28, 0.06, [-0.18, 0, 0]); }
    legs(g, 2.0, 0.8, 0.16, 0.06, 0.08, 0.03);
  },
  armchair(g, hex) {
    const m = tintable(hex);
    box(g, 0.95, 0.26, 0.9, m, 0, 0.3, 0, 0.06);
    box(g, 0.95, 0.62, 0.18, m, 0, 0.72, -0.36, 0.07, [-0.12, 0, 0]);
    for (const s of [-1, 1]) box(g, 0.16, 0.38, 0.8, m, s * 0.42, 0.5, 0.02, 0.06);
    box(g, 0.62, 0.16, 0.66, m, 0, 0.5, 0.06, 0.06);
    legs(g, 0.85, 0.8, 0.16, 0.05, 0.06, 0.03);
  },
  chair(g, hex) {
    const m = tintable(hex), wood = std(WOOD);
    box(g, 0.46, 0.05, 0.46, m, 0, 0.46, 0, 0.02);
    box(g, 0.46, 0.46, 0.04, m, 0, 0.72, -0.21, 0.02, [-0.06, 0, 0]);
    legs(g, 0.46, 0.46, 0.44, 0.03, 0.03, 0.02, wood);
  },
  table(g, hex) {
    const m = tintable(hex);
    box(g, 1.5, 0.05, 0.85, m, 0, 0.74, 0, 0.02);
    legs(g, 1.5, 0.85, 0.72, 0.06, 0.06, 0.035, std(DARK));
  },
  bed(g, hex) {
    const m = tintable(hex), wood = std(WOOD), white = std("#f1ede6");
    box(g, 1.7, 0.22, 2.1, wood, 0, 0.2, 0, 0.03);
    box(g, 1.62, 0.22, 2.0, white, 0, 0.42, 0.02, 0.07);
    box(g, 1.66, 0.12, 1.3, m, 0, 0.56, 0.32, 0.06);
    box(g, 1.7, 0.95, 0.08, wood, 0, 0.62, -1.04, 0.03);
    for (const x of [-0.42, 0.42]) box(g, 0.62, 0.14, 0.36, white, x, 0.58, -0.78, 0.06);
    legs(g, 1.7, 2.1, 0.1, 0.05, 0.05, 0.03, wood);
  },
  wardrobe(g, hex) {
    const m = tintable(hex), mm = std("#2a2623", { metalness: 0.4 });
    box(g, 1.2, 2.0, 0.55, m, 0, 1.0, 0, 0.02);
    for (const s of [-1, 1]) { box(g, 0.585, 1.9, 0.02, m, s * 0.298, 1.0, 0.285, 0.01); box(g, 0.02, 0.3, 0.03, mm, s * 0.07, 1.0, 0.31, 0.005); }
    box(g, 1.24, 0.06, 0.58, m, 0, 2.03, 0, 0.02);
  },
  shelf(g, hex) {
    const m = tintable(hex);
    for (const s of [-1, 1]) box(g, 0.04, 1.8, 0.32, m, s * 0.48, 0.9, 0, 0.01);
    for (let i = 0; i < 5; i++) box(g, 1.0, 0.035, 0.32, m, 0, 0.04 + i * 0.44, 0, 0.01);
    box(g, 1.0, 1.78, 0.012, std("#e8e1d6"), 0, 0.9, -0.15, 0.002);
  },
  lamp(g, hex) {
    const m = tintable(hex, { side: THREE.DoubleSide });
    cyl(g, 0.16, 0.18, 0.04, std(DARK), 0, 0.02, 0, 32);
    cyl(g, 0.012, 0.012, 1.2, std(METAL, { metalness: 0.7, roughness: 0.3 }), 0, 0.62, 0, 12);
    addMesh(g, new THREE.CylinderGeometry(0.16, 0.3, 0.32, 40, 1, true), m, 0, 1.36, 0);
    addMesh(g, new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: "#fff3c9" }), 0, 1.28, 0);
  },
};

// --- Vêtements : silhouettes extrudées à bords bombés (effet « rembourré »), plus volumes de révolution ---
function puffed(shape, depth = 0.05, bevel = 0.05) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 6, curveSegments: 16 });
  g.center();
  return g;
}

function tshirtShape(long = false) {
  const s = new THREE.Shape();
  const sl = long ? 0.62 : 0.3;
  s.moveTo(-0.16, 0.5);
  s.quadraticCurveTo(0, 0.4, 0.16, 0.5);           // encolure
  s.lineTo(0.42, 0.42);
  s.lineTo(0.42 + sl * 0.7, 0.42 - sl * 0.7 + (long ? 0.05 : 0));
  s.lineTo(0.34 + sl * 0.7, 0.3 - sl * 0.7 + (long ? 0.05 : 0));
  s.lineTo(0.3, 0.3 - 0.08);
  s.lineTo(0.3, -0.5);
  s.lineTo(-0.3, -0.5);
  s.lineTo(-0.3, 0.22);
  s.lineTo(-0.34 - sl * 0.7, 0.3 - sl * 0.7 + (long ? 0.05 : 0));
  s.lineTo(-0.42 - sl * 0.7, 0.42 - sl * 0.7 + (long ? 0.05 : 0));
  s.lineTo(-0.42, 0.42);
  s.closePath();
  return s;
}

const GARMENTS = {
  tshirt(g, hex) {
    const m = tintable(hex, { roughness: 0.92 });
    const body = addMesh(g, puffed(tshirtShape(false), 0.07, 0.045), m, 0, 0.62, 0);
    body.scale.set(1.05, 1.05, 1);
    addMesh(g, new THREE.TorusGeometry(0.15, 0.018, 8, 24, Math.PI), tintable(hex, { roughness: 0.9 }), 0, 1.07, 0.02, [Math.PI, 0, 0]);
  },
  hoodie(g, hex) {
    const m = tintable(hex, { roughness: 0.95 });
    addMesh(g, puffed(tshirtShape(true), 0.1, 0.06), m, 0, 0.66, 0).scale.set(1.12, 1.1, 1);
    const hood = addMesh(g, new THREE.SphereGeometry(0.2, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), tintable(hex, { roughness: 0.95, side: THREE.DoubleSide }), 0, 1.18, -0.05);
    hood.scale.set(1.2, 1, 0.9);
    box(g, 0.44, 0.2, 0.04, tintable(hex), 0, 0.3, 0.08, 0.03);
    for (const x of [-0.05, 0.05]) cyl(g, 0.006, 0.006, 0.18, std("#e9e4da"), x, 1.0, 0.1, 8);
  },
  dress(g, hex) {
    const m = tintable(hex, { roughness: 0.85, side: THREE.DoubleSide });
    const pts = [[0.0, 0], [0.5, 0], [0.62, 0.02], [0.5, 0.35], [0.3, 0.72], [0.2, 0.88], [0.22, 1.0], [0.16, 1.14], [0.0, 1.17]].map(([x, y]) => new THREE.Vector2(x * 0.78, y * 1.25));
    addMesh(g, new THREE.LatheGeometry(pts, 48), m, 0, 0, 0);
    for (const s of [-1, 1]) cyl(g, 0.012, 0.012, 0.26, tintable(hex), s * 0.085, 1.6, 0, 8);
    addMesh(g, new THREE.TorusGeometry(0.1, 0.012, 8, 24, Math.PI), tintable(hex), 0, 1.5, 0.0, [0, 0, 0]);
  },
  trousers(g, hex) {
    const m = tintable(hex, { roughness: 0.9 });
    for (const s of [-1, 1]) addMesh(g, new THREE.CylinderGeometry(0.115, 0.085, 1.0, 20), m, s * 0.11, 0.5, 0);
    addMesh(g, new THREE.CylinderGeometry(0.2, 0.2, 0.22, 28), m, 0, 1.08, 0).scale.set(1.0, 1, 0.7);
    addMesh(g, new THREE.CylinderGeometry(0.205, 0.205, 0.05, 28), tintable(hex, { roughness: 0.7 }), 0, 1.21, 0).scale.set(1.0, 1, 0.7);
    box(g, 0.02, 0.18, 0.02, std("#2a2623", { metalness: 0.5 }), 0, 1.06, 0.145, 0.004);
  },
  shoe(g, hex) {
    const m = tintable(hex, { roughness: 0.55 });
    const sole = new THREE.Shape();
    sole.moveTo(-0.13, -0.4); sole.quadraticCurveTo(-0.17, 0, -0.12, 0.33); sole.quadraticCurveTo(0, 0.5, 0.12, 0.33); sole.quadraticCurveTo(0.17, 0, 0.13, -0.4); sole.quadraticCurveTo(0, -0.46, -0.13, -0.4);
    const sg = new THREE.ExtrudeGeometry(sole, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 3 });
    sg.rotateX(-Math.PI / 2); sg.center();
    addMesh(g, sg, std("#f2efe9", { roughness: 0.9 }), 0, 0.045, 0.02);
    const up = addMesh(g, new THREE.SphereGeometry(1, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 0.07, 0.03);
    up.scale.set(0.145, 0.2, 0.42);
    const toe = addMesh(g, new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), tintable(hex, { roughness: 0.5 }), 0, 0.07, 0.27);
    toe.scale.set(0.13, 0.1, 0.17);
    const col = addMesh(g, new THREE.TorusGeometry(0.075, 0.018, 10, 24), tintable(hex, { roughness: 0.6 }), 0, 0.2, -0.17, [Math.PI / 2.4, 0, 0]);
    col.scale.set(1, 1.2, 1);
    for (let i = 0; i < 4; i++) cyl(g, 0.012, 0.012, 0.2, std("#ffffff", { roughness: 0.9 }), 0, 0.2 - i * 0.02, 0.02 + i * 0.07, 8, [0, 0, Math.PI / 2]);
  },
  bag(g, hex) {
    const m = tintable(hex, { roughness: 0.6 });
    box(g, 0.5, 0.36, 0.2, m, 0, 0.3, 0, 0.06);
    box(g, 0.5, 0.1, 0.2, tintable(hex, { roughness: 0.5 }), 0, 0.5, 0.0, 0.05);
    addMesh(g, new THREE.TorusGeometry(0.14, 0.012, 10, 28, Math.PI), std("#222"), 0, 0.55, 0, [0, 0, 0]);
    box(g, 0.05, 0.05, 0.02, std("#d8b45a", { metalness: 0.8, roughness: 0.3 }), 0, 0.42, 0.105, 0.006);
  },
};

export const SHOP_3D_KINDS = [...Object.keys(FURNITURE), ...Object.keys(GARMENTS)];
export const isGarment = (k) => k in GARMENTS;

export function buildShopModel(kind, hex = "#c9b79c") {
  const g = new THREE.Group();
  const fn = FURNITURE[kind] || GARMENTS[kind];
  if (fn) fn(g, hex);
  if (kind in GARMENTS) {
    // les vêtements sont posés sur un petit socle pour se lire « en vitrine »
    cyl(g, 0.55, 0.6, 0.04, std("#ece5d8", { roughness: 0.6 }), 0, -0.02, 0, 48);
    if (kind === "tshirt" || kind === "hoodie") g.position.y = 0.0;
  }
  return g;
}
