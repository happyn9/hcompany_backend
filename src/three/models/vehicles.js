import { THREE, addMesh, box, cyl, std, tintable } from "../core.js";

// Dimensions en mètres. x = longueur (avant vers +x), y = haut, z = largeur.
const SPECS = {
  van:     { cab: 1.5, boxL: 2.4, w: 1.8, h: 1.7, cabH: 1.7, axles: [0.9, -1.5], tire: 0.33, gap: 0.0, integrated: true },
  canter:  { cab: 1.7, boxL: 4.3, w: 2.0, h: 2.1, cabH: 1.95, axles: [1.9, -1.4], tire: 0.38 },
  fuso:    { cab: 1.9, boxL: 6.2, w: 2.3, h: 2.4, cabH: 2.1, axles: [2.2, -2.3], tire: 0.45 },
  truck:   { cab: 2.0, boxL: 7.6, w: 2.4, h: 2.6, cabH: 2.2, axles: [2.6, -2.9, -4.2], tire: 0.5 },
  trailer: { cab: 2.2, boxL: 12, w: 2.5, h: 2.8, cabH: 2.3, axles: [3.0, -6.0, -7.3, -8.6], tire: 0.5, tractor: true },
};
export const VEHICLE_3D_KINDS = Object.keys(SPECS);

const CARD = ["#c9a46c", "#b98d52", "#d2b07a", "#a97c45"];

export function buildVehicle(kind = "canter", { color = "#f4f1ea", refrigerated = false } = {}) {
  const sp = SPECS[kind] || SPECS.canter;
  const g = new THREE.Group();
  const body = tintable(color, { roughness: 0.45, metalness: 0.15 });
  const dark = std("#232323", { roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: "#8fb7d6", transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.3 });
  const ghost = new THREE.MeshStandardMaterial({ color: "#d8e4ee", transparent: true, opacity: 0.16, roughness: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const frameM = std("#8e98a1", { metalness: 0.6, roughness: 0.4 });
  const W = sp.w, H = sp.h, L = sp.boxL;
  const yb = 0.95; // hauteur du plancher
  const xBoxFront = 0.0;           // le caisson commence à x=0 et s'étend vers -x
  const xBoxCenter = xBoxFront - L / 2 - 0.05;

  // châssis
  box(g, L + sp.cab + 0.6, 0.18, W * 0.7, dark, -L / 2 + sp.cab / 2 - 0.2, yb - 0.2, 0, 0.02);
  // plancher
  box(g, L, 0.08, W, std("#7a5a3a", { roughness: 0.9 }), xBoxCenter, yb, 0, 0.01);

  // caisson : parois translucides + arêtes visibles
  const sides = new THREE.Group(); g.add(sides);
  box(sides, L, H, 0.03, ghost, xBoxCenter, yb + H / 2, W / 2, 0.005);
  box(sides, L, H, 0.03, ghost, xBoxCenter, yb + H / 2, -W / 2, 0.005);
  box(sides, L, 0.03, W, ghost, xBoxCenter, yb + H, 0, 0.005);
  box(sides, 0.06, H, W, body, xBoxCenter + L / 2, yb + H / 2, 0, 0.01); // cloison avant pleine
  const edge = (x, y, z, sx, sy, sz) => box(g, sx, sy, sz, frameM, x, y, z, 0.004);
  for (const sz of [-1, 1]) for (const sy of [0, 1]) edge(xBoxCenter, yb + 0.04 + sy * (H - 0.04), sz * W / 2, L, 0.05, 0.05);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) edge(xBoxCenter + sx * L / 2, yb + H / 2, sz * W / 2, 0.05, H, 0.05);
  for (let i = 1; i < Math.floor(L / 1.2); i++) for (const sz of [-1, 1]) edge(xBoxCenter - L / 2 + i * 1.2, yb + H / 2, sz * W / 2, 0.035, H, 0.035);
  // bande de marque
  box(g, L * 0.98, 0.14, 0.035, tintable("#8b5e34"), xBoxCenter, yb + H * 0.55, W / 2 + 0.01, 0.004).material.userData.tint = false;
  box(g, L * 0.98, 0.14, 0.035, std("#8b5e34"), xBoxCenter, yb + H * 0.55, -W / 2 - 0.01, 0.004);

  // portes arrière (pivots)
  const doors = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(xBoxCenter - L / 2, yb + H / 2, s * W / 2); g.add(pivot);
    const door = box(pivot, 0.04, H, W / 2 - 0.01, ghost, 0, 0, -s * (W / 4 - 0.005), 0.005);
    box(pivot, 0.05, H, 0.04, frameM, 0, 0, -s * (W / 2 - 0.03), 0.004);
    box(pivot, 0.05, 0.04, W / 2, frameM, 0, H / 2 - 0.02, -s * W / 4, 0.004);
    box(pivot, 0.05, 0.04, W / 2, frameM, 0, -H / 2 + 0.02, -s * W / 4, 0.004);
    pivot.userData.sign = s;
    doors.push(pivot);
    void door;
  }

  // cabine
  const cx = xBoxFront + sp.cab / 2 + 0.12;
  if (sp.integrated) {
    box(g, sp.cab, sp.cabH * 0.62, W * 0.97, body, cx, yb + sp.cabH * 0.31, 0, 0.1);
    box(g, sp.cab * 0.6, sp.cabH * 0.45, W * 0.95, body, cx - 0.2, yb + sp.cabH * 0.8, 0, 0.12);
  } else {
    box(g, sp.cab, sp.cabH * 0.55, W * 0.96, body, cx, yb + 0.1 + sp.cabH * 0.275, 0, 0.1);           // soubassement
    box(g, sp.cab * 0.92, sp.cabH * 0.5, W * 0.94, body, cx - 0.05, yb + 0.1 + sp.cabH * 0.78, 0, 0.14); // habitacle
  }
  const wy = yb + 0.1 + sp.cabH * 0.76;
  addMesh(g, new THREE.BoxGeometry(0.03, sp.cabH * 0.36, W * 0.84), glass, cx + sp.cab * 0.46 - 0.02, wy, 0, [0, 0, -0.18]);  // pare-brise
  for (const s of [-1, 1]) box(g, sp.cab * 0.6, sp.cabH * 0.32, 0.03, glass, cx - 0.12, wy, s * (W * 0.47 + 0.005), 0.01);
  box(g, 0.08, 0.5, W * 0.7, dark, cx + sp.cab / 2 + 0.03, yb + 0.3, 0, 0.03);          // calandre
  box(g, 0.14, 0.12, W * 0.98, std("#c9ced2", { metalness: 0.7, roughness: 0.3 }), cx + sp.cab / 2 + 0.06, yb - 0.02, 0, 0.03); // pare-chocs
  for (const s of [-1, 1]) addMesh(g, new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshBasicMaterial({ color: "#fff4cf" }), cx + sp.cab / 2 + 0.05, yb + 0.42, s * W * 0.38).scale.set(0.5, 1, 1.4);

  // groupe frigorifique
  if (refrigerated) {
    box(g, 0.5, 0.7, W * 0.7, std("#d8eaf5"), xBoxFront - 0.1, yb + H + 0.38, 0, 0.04);
    box(g, 0.52, 0.12, W * 0.72, std("#2f80ed"), xBoxFront - 0.1, yb + H + 0.1, 0, 0.02);
  }

  // roues
  const tire = std("#151515", { roughness: 0.95 }), hub = std("#b9bec3", { metalness: 0.7, roughness: 0.35 });
  const axleXs = [cx + sp.cab * 0.22];
  for (let i = 0; i < sp.axles.length - 1; i++) axleXs.push(xBoxFront - L + 1.0 + i * 1.25);
  for (const axX of axleXs) {
    for (const s of [-1, 1]) {
      const r = sp.tire;
      const wh = new THREE.Group(); wh.position.set(axX, r, s * (W * 0.46));
      wh.rotation.x = Math.PI / 2; g.add(wh);
      addMesh(wh, new THREE.CylinderGeometry(r, r, 0.26, 32), tire, 0, 0, 0);
      addMesh(wh, new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.28, 24), hub, 0, 0, 0);
      addMesh(wh, new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.3, 12), dark, 0, 0, 0);
    }
  }

  // cartons : capacité = grille ; on les révèle selon le chargement
  const cw = 0.55, cl = 0.55, ch = 0.5;
  const nz = Math.max(1, Math.floor((W - 0.2) / cw)), nx = Math.max(1, Math.floor((L - 0.2) / cl)), ny = Math.max(1, Math.floor((H - 0.1) / ch));
  const crates = [];
  const crateGeo = new THREE.BoxGeometry(cl - 0.04, ch - 0.04, cw - 0.04);
  const mats = CARD.map((c) => std(c, { roughness: 0.9 }));
  const mine = std("#e0a82e", { roughness: 0.6, emissive: "#8a5a00", emissiveIntensity: 0.25 });
  for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) for (let iz = 0; iz < nz; iz++) {
    const m = new THREE.Mesh(crateGeo, mats[(ix * 7 + iy * 3 + iz) % mats.length]);
    m.position.set(xBoxFront - 0.2 - cl / 2 - ix * cl, yb + 0.04 + ch / 2 + iy * ch, -((nz - 1) * cw) / 2 + iz * cw);
    m.visible = false;
    g.add(m); crates.push(m);
  }
  // ordre de remplissage : couche basse d'abord, de l'avant vers l'arrière
  crates.sort((a, b) => a.position.y - b.position.y || b.position.x - a.position.x);
  g.userData.capacity = crates.length;
  g.userData.setLoad = (booked = 0, yours = 0) => {
    const nb = Math.round(Math.min(1, booked) * crates.length);
    const ny2 = Math.min(crates.length - nb, Math.max(yours > 0 ? 1 : 0, Math.round(Math.min(1, yours) * crates.length)));
    crates.forEach((c, i) => {
      c.visible = i < nb + ny2;
      c.material = i >= nb ? mine : mats[(i * 5) % mats.length];
    });
  };
  g.userData.doors = doors;
  g.userData.setDoors = (open) => { g.userData.doorTarget = open ? 1 : 0; };
  g.userData.doorTarget = 0; g.userData.doorAngle = 0;
  g.userData.tick = (dt) => {
    const u = g.userData; u.doorAngle += (u.doorTarget - u.doorAngle) * Math.min(1, dt * 4);
    for (const p of u.doors) p.rotation.y = p.userData.sign * u.doorAngle * 1.9 * -1;
  };
  g.position.x = L / 2 - sp.cab / 2; // centre l'ensemble
  const holder = new THREE.Group(); holder.add(g);
  holder.userData = g.userData;
  return holder;
}
