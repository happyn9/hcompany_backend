import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Gestion complète du défilement entre les pages.
 *
 *  - Aller vers une nouvelle page (clic sur un lien)  → on repart en haut,
 *    ou à l'ancre #section si l'URL en contient une.
 *  - Revenir en arrière (bouton Retour du navigateur, ou BackLink)       →
 *    on retrouve EXACTEMENT l'endroit où on était : même section, même
 *    hauteur. C'est ce qui manquait : React Router ne le fait pas seul, et
 *    la page d'accueil se reconstruit à chaque retour.
 *
 * Pour que la restauration soit fiable même si la hauteur de la page change
 * entre-temps (images, polices, sections qui se révèlent), on mémorise deux
 * choses : la section visible (son id + la distance parcourue dedans) et la
 * hauteur brute. On restaure d'abord par section, et on réessaie pendant
 * quelques dixièmes de seconde le temps que la mise en page se stabilise.
 */

/** Suivi minimal de la navigation, lu par BackLink (retour "intelligent"). */
export const navTracker = { prevPath: null, currentPath: null };

const STORE_KEY = "hc_scroll_positions_v1";
const MAX_ENTRIES = 60;
const HEADER_OFFSET = 88; // hauteur approximative de la barre fixe en haut

const positions = new Map(); // en mémoire seulement

function persist() {
  while (positions.size > MAX_ENTRIES) positions.delete(positions.keys().next().value);
}

/** Clé de l'entrée d'historique courante, telle que React Router la pose. */
function historyKey() {
  return window.history.state?.key ?? "default";
}

/** Section "en cours de lecture" : la dernière dont le haut est passé sous la barre. */
function measureAnchor() {
  const sections = document.querySelectorAll("main section[id]");
  let found = null;
  for (const el of sections) {
    if (el.getBoundingClientRect().top <= HEADER_OFFSET + 1) found = el;
    else break;
  }
  if (!found) return null;
  return { id: found.id, offset: Math.round(-found.getBoundingClientRect().top) };
}

function savePosition(key) {
  positions.delete(key); // ré-insère en fin de Map : les plus récentes survivent au plafond
  positions.set(key, { path: window.location.pathname, y: Math.round(window.scrollY), anchor: measureAnchor() });
}

const jumpTo = (top) => window.scrollTo({ top, left: 0, behavior: "instant" });

/** Restaure une position, en réessayant le temps que la page ait sa hauteur définitive. */
function restore(saved) {
  let cancelled = false;
  let timer = null;
  let tries = 0;
  let applied = 0;
  const inputEvents = ["wheel", "touchstart", "keydown", "mousedown"];

  const stop = () => {
    cancelled = true;
    clearTimeout(timer);
    inputEvents.forEach((ev) => window.removeEventListener(ev, stop));
  };

  const apply = () => {
    if (cancelled) return;
    tries += 1;
    let target = saved.y;
    if (saved.anchor) {
      const el = document.getElementById(saved.anchor.id);
      if (el) target = window.scrollY + el.getBoundingClientRect().top + saved.anchor.offset;
    }
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    if (maxY >= target - 2 || tries > 40) {
      jumpTo(Math.max(0, Math.min(target, maxY)));
      applied += 1;
      // Quelques passes de plus : une image ou une police qui arrive tard
      // décale la mise en page, on se recale.
      if (applied >= 4 || tries > 40) {
        stop();
        return;
      }
    }
    timer = setTimeout(apply, 60);
  };

  // Dès que la personne reprend la main (molette, tactile, clavier), on arrête.
  inputEvents.forEach((ev) => window.addEventListener(ev, stop, { once: true, passive: true }));
  apply();
  return stop;
}

/** Défile jusqu'à #ancre, en réessayant tant que la section n'est pas rendue. */
function scrollToHash(id) {
  let cancelled = false;
  let timer = null;
  let tries = 0;
  const attempt = () => {
    if (cancelled) return;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "instant", block: "start" });
      return;
    }
    tries += 1;
    if (tries < 20) timer = setTimeout(attempt, 150);
  };
  timer = setTimeout(attempt, 120);
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}

export default function ScrollToTop() {
  const location = useLocation();
  const navType = useNavigationType();
  const keyRef = useRef(location.key);
  const cancelRef = useRef(null);
  const firstRender = useRef(true);

  // On gère nous-mêmes la position : la restauration native du navigateur
  // tombe avant que la page (chargée à la demande) soit prête.
  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  }, []);

  // Mémorise la position de l'entrée courante pendant qu'on défile.
  useEffect(() => {
    let ticking = false;
    const snapshot = () => {
      // Si l'historique pointe déjà vers une autre entrée, une navigation est
      // en cours : le navigateur est en train de rabattre le défilement de
      // l'ancienne page, on ne doit surtout pas l'enregistrer.
      if (historyKey() !== keyRef.current) return;
      savePosition(keyRef.current);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        snapshot();
      });
    };
    const flush = () => {
      snapshot();
      persist();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // Instantané juste avant qu'un clic ne déclenche la navigation (phase de
    // capture = avant le gestionnaire du Link), pour figer la bonne position.
    document.addEventListener("click", flush, true);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", flush, true);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  useLayoutEffect(() => {
    keyRef.current = location.key;
    navTracker.prevPath = navTracker.currentPath;
    navTracker.currentPath = location.pathname;
    cancelRef.current?.();
    cancelRef.current = null;

    const isFirst = firstRender.current;
    firstRender.current = false;
    // Une position n'est valable que pour la même page : après un chargement complet
    // vers une autre adresse, la clé d'historique « default » est réutilisée.
    const found = positions.get(location.key);
    const saved = found && found.path === location.pathname ? found : undefined;

    // Retour / avance dans l'historique (ou actualisation de la page) : on
    // retrouve l'endroit exact. Une URL avec ancre sans position mémorisée
    // (ex: lien partagé) passe par le défilement vers l'ancre ci-dessous.
    if ((navType === "POP" || isFirst) && saved && !(location.hash && !isFirst && location.key === "default")) {
      cancelRef.current = restore(saved);
      return;
    }
    if (location.hash) {
      cancelRef.current = scrollToHash(location.hash.slice(1));
      return;
    }
    jumpTo(0);
  }, [location.key, location.pathname, location.hash, navType]);

  return null;
}
