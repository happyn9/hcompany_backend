import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

const ProgressContext = createContext(null);

export function ProgressProvider({ children }) {
  const [active, setActive] = useState(false);
  const [value, setValue] = useState(0);
  const timerRef = useRef(null);
  const location = useLocation();

  const start = useCallback(() => {
    clearInterval(timerRef.current);
    setActive(true);
    setValue(12);
    timerRef.current = setInterval(() => {
      setValue((v) => (v < 88 ? v + (88 - v) * 0.12 : v));
    }, 180);
  }, []);

  const done = useCallback(() => {
    clearInterval(timerRef.current);
    setValue(100);
    setTimeout(() => {
      setActive(false);
      setValue(0);
    }, 300);
  }, []);

  // Déclenche automatiquement la barre à chaque changement de route.
  useEffect(() => {
    start();
    const t = setTimeout(done, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Déclenche aussi la barre sur chaque clic sur un élément interactif
  // (bouton, lien, élément avec role="button") — donne un retour visuel
  // immédiat même quand l'action elle-même est quasi instantanée.
  useEffect(() => {
    function onClick(e) {
      const target = e.target.closest("button, a, [role='button']");
      if (!target || target.disabled) return;
      // Évite de redéclencher pour des liens qui vont de toute façon
      // provoquer un changement de route (déjà couvert ci-dessus).
      start();
      const t = setTimeout(done, 420);
      return () => clearTimeout(t);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ProgressContext.Provider value={{ start, done }}>
      <div className="fixed top-0 left-0 right-0 z-[300] h-[3px] pointer-events-none">
        <AnimatePresence>
          {active && (
            <motion.div
              key="bar"
              className="h-full bg-coffee origin-left"
              initial={{ scaleX: 0, opacity: 1 }}
              animate={{ scaleX: value / 100, opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.25 } }}
              transition={{ ease: "easeOut", duration: 0.25 }}
              style={{ transformOrigin: "0% 50%" }}
            />
          )}
        </AnimatePresence>
      </div>
      {children}
    </ProgressContext.Provider>
  );
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress doit être utilisé à l'intérieur d'un <ProgressProvider>.");
  return ctx;
}

/**
 * Enveloppe une action asynchrone (clic sur un bouton, soumission de
 * formulaire...) avec la barre de progression globale — évite de dupliquer
 * start()/done() partout où on fait un appel API.
 */
export function useProgressAction() {
  const { start, done } = useProgress();
  return useCallback(
    async (fn) => {
      start();
      try {
        return await fn();
      } finally {
        done();
      }
    },
    [start, done]
  );
}
