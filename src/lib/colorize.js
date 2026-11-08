/** « Habille » une image détourée avec une couleur : la luminosité d'origine (ombres, reflets)
 * est conservée, la teinte devient celle choisie. Pixels transparents intacts. */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const lum = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/** Modifie `px` (RGBA, Uint8ClampedArray) en place. */
export function tintPixels(px, hex) {
  const t = hexToRgb(hex);
  if (!t) return px;
  const ls = [];
  for (let i = 0; i < px.length; i += 16) if (px[i + 3] > 200) ls.push(lum(px[i], px[i + 1], px[i + 2]));
  if (!ls.length) return px;
  ls.sort((a, b) => a - b);
  const base = Math.max(0.12, ls[Math.floor(ls.length / 2)]);
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const l = lum(px[i], px[i + 1], px[i + 2]);
    const ratio = Math.min(2.2, l / base);
    const shade = Math.pow(ratio, 0.95);
    const spec = Math.max(0, l - 0.82) * 255 * 0.7; // reflets
    px[i] = t[0] * shade + spec;
    px[i + 1] = t[1] * shade + spec;
    px[i + 2] = t[2] * shade + spec;
  }
  return px;
}

export const isCutout = (path) => /-cut\.(png|webp)$/i.test(path || "");

const cache = new Map();
/** Renvoie une URL (data:) de l'image teintée, ou null si impossible (CORS, navigateur). */
export function tintedUrl(src, hex) {
  const key = `${src}|${hex}`;
  if (cache.has(key)) return cache.get(key);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const w = Math.min(img.naturalWidth, 900), h = Math.round((img.naturalHeight * w) / img.naturalWidth);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        tintPixels(data.data, hex);
        ctx.putImageData(data, 0, 0);
        resolve(c.toDataURL("image/png"));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
  cache.set(key, p);
  return p;
}
