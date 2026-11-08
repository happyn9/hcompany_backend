// Cache mémoire « affiche d'abord, rafraîchit ensuite » pour useLoad : revenir sur une page déjà vue est instantané,
// même quand le serveur (hébergement gratuit) met du temps à répondre. Vidé à la déconnexion.
export const LOAD_TTL = 120_000;
const CACHE = new Map();
export const clearLoadCache = () => CACHE.clear();
export const cacheGet = (k) => { const c = k && CACHE.get(k); return c && Date.now() - c.at < LOAD_TTL ? c : null; };
export const cacheSet = (k, data) => { if (k) { CACHE.set(k, { data, at: Date.now() }); if (CACHE.size > 150) CACHE.delete(CACHE.keys().next().value); } };
export function cacheKey(fn, deps) {
  try { return `${fn.toString()}|${JSON.stringify(deps)}`; } catch { return null; }
}
