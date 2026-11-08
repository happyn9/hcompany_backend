import * as THREE from "three";

export { THREE };

export function webglOk() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
}

/** Boîte aux arêtes arrondies (w × h × d), centrée sur l'origine. */
export function roundedBoxGeometry(w, h, d, r = 0.03) {
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const s = new THREE.Shape();
  const iw = w - 2 * r, ih = h - 2 * r;
  s.moveTo(-iw / 2, -ih / 2); s.lineTo(iw / 2, -ih / 2); s.lineTo(iw / 2, ih / 2); s.lineTo(-iw / 2, ih / 2); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.0001, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 4 });
  g.center();
  return g;
}

export const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.04, ...o });

/** Matériau « habillable » : sa couleur suit la couleur choisie par le client. */
export function tintable(color = "#c9b79c", o = {}) {
  const m = std(color, o);
  m.userData.tint = true;
  return m;
}

export function addMesh(parent, geometry, material, x = 0, y = 0, z = 0, rot) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  m.castShadow = false;
  parent.add(m);
  return m;
}

export const box = (parent, w, h, d, mat, x, y, z, r = 0.02, rot) => addMesh(parent, roundedBoxGeometry(w, h, d, r), mat, x, y, z, rot);
export const cyl = (parent, rt, rb, h, mat, x, y, z, seg = 24, rot) => addMesh(parent, new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, rot);

/** Applique une couleur à tous les matériaux marqués `tint`. */
export function applyTint(root, hex) {
  if (!hex) return;
  root.traverse((o) => {
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    ms.forEach((m) => { if (m.userData?.tint) m.color.set(hex); });
  });
}

export function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose?.();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    ms.forEach((m) => { m.map?.dispose?.(); m.dispose?.(); });
  });
}

/** Ombre portée douce sous un objet (disque dégradé). */
export function blobShadow(radius = 1, opacity = 0.35) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, `rgba(0,0,0,${opacity})`); grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.002; m.renderOrder = -1;
  return m;
}

export function studioLights(scene) {
  scene.add(new THREE.HemisphereLight("#fff6ea", "#8a7a68", 1.05));
  const key = new THREE.DirectionalLight("#ffffff", 1.6); key.position.set(3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight("#ffe2c0", 0.7); rim.position.set(-4, 3, -3); scene.add(rim);
}
