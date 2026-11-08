import { cookie } from "../lib/memStore.js";
import { createContext, useContext, useEffect, useState, useCallback } from "react";

const ThemeContext = createContext(null);
const STORAGE_KEY = "hc_theme"; // "light" | "dark" | "system"

function getSystemPrefersDark() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function computeEffective(mode) {
  if (mode === "system") return getSystemPrefersDark() ? "dark" : "light";
  return mode;
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(() => cookie.get(STORAGE_KEY) || "system");
  const [effective, setEffective] = useState(() => computeEffective(mode));

  // Applique la classe .dark sur <html> — c'est ce qui fait basculer
  // toutes les variables de couleur définies dans index.css.
  useEffect(() => {
    const next = computeEffective(mode);
    setEffective(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.style.colorScheme = next;
  }, [mode]);

  // En mode "system", suit les changements de préférence du système
  // d'exploitation en direct (pas besoin de recharger la page).
  useEffect(() => {
    if (mode !== "system" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const next = getSystemPrefersDark() ? "dark" : "light";
      setEffective(next);
      document.documentElement.classList.toggle("dark", next === "dark");
      document.documentElement.style.colorScheme = next;
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [mode]);

  const setMode = useCallback((next) => {
    setModeState(next);
    cookie.set(STORAGE_KEY, next);
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, effective, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme doit être utilisé à l'intérieur d'un <ThemeProvider>.");
  return ctx;
}
