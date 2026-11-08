import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { DEFAULT_SOON, SERVICE_ORDER } from "../data/hServicePages.js";

// Le catalogue est partagé entre la section "Explorez nos services" et les
// pages de service : un seul appel réseau, mis en cache pour toute la visite.
let cache = null;
let inflight = null;

function load() {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = api.services
      .catalog()
      .then((data) => {
        cache = Array.isArray(data) ? data : [];
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useServiceCatalog() {
  const [state, setState] = useState(() =>
    cache ? { items: cache, status: "ready" } : { items: [], status: "loading" }
  );

  useEffect(() => {
    if (cache) return undefined;
    let alive = true;
    load()
      .then((items) => alive && setState({ items, status: "ready" }))
      .catch(() => alive && setState({ items: [], status: "error" }));
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

/**
 * Liste ordonnée des services à afficher. Le backend reste la source de
 * vérité pour la disponibilité (ex: ouvrir H-Money depuis l'admin) ; si
 * l'appel échoue ou renvoie une liste vide, on retombe sur l'ordre et les
 * états "bientôt" codés dans hServicePages.js, pour que la section ne soit
 * jamais vide. Les services créés depuis l'admin et inconnus du site sont
 * conservés (`custom: true`) en fin de liste.
 */
export function resolveServices({ items, status }) {
  const byKey = new Map((items || []).map((i) => [i.key, i]));
  const known = SERVICE_ORDER.map((key) => {
    const item = byKey.get(key);
    return {
      key,
      disabled: item ? !!item.disabled : DEFAULT_SOON.includes(key),
      logo_url: item?.logo_url || null,
      catalog: item || null,
    };
  });
  const custom = (items || [])
    .filter((i) => !SERVICE_ORDER.includes(i.key))
    .map((item) => ({ key: item.key, disabled: !!item.disabled, logo_url: item.logo_url || null, catalog: item, custom: true }));
  return { list: [...known, ...custom], status };
}
