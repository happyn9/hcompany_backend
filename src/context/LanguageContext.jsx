import { cookie } from "../lib/memStore.js";
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { translations } from "../i18n/translations.js";
import { startAutoTranslate } from "../i18n/autoTranslate.js";
import LanguageSwitchOverlay from "../components/ui/LanguageSwitchOverlay.jsx";

const LanguageContext = createContext(null);

function getInitialLang() {
  const stored = cookie.get("hc_lang");
  if (stored === "fr" || stored === "en") return stored;
  const browserLang = typeof navigator !== "undefined" ? navigator.language : "fr";
  return browserLang.startsWith("en") ? "en" : "fr";
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(getInitialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    if (lang === "en") return startAutoTranslate();
  }, [lang]);

  const setLang = useCallback((next) => {
    setLangState(next);
    cookie.set("hc_lang", next);
  }, []);

  // Utilisé par le bouton de bascule dans le footer : sauvegarde la langue
  // puis recharge complètement la page après un court spinner — plus sûr
  // qu'un simple changement d'état React pour garantir que tout le
  // contenu (y compris un composant qui lirait mal le contexte) reflète
  // bien la nouvelle langue.
  const [switching, setSwitching] = useState(false);
  const switchLanguage = useCallback((next) => {
    if (next === lang) return;
    setSwitching(true);
    cookie.set("hc_lang", next);
    setTimeout(() => window.location.reload(), 450);
  }, [lang]);

  const toggleLang = useCallback(() => {
    setLang(lang === "fr" ? "en" : "fr");
  }, [lang, setLang]);

  // t("services.categories.security") -> parcourt le dictionnaire par clé
  // pointée. Si une clé manque, renvoie la clé elle-même (visible et facile
  // à repérer plutôt qu'un écran vide).
  const t = useCallback(
    (path) => {
      const parts = path.split(".");
      let node = translations[lang];
      for (const p of parts) {
        node = node?.[p];
        if (node === undefined) return path;
      }
      return node;
    },
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, switchLanguage, switching, t }}>
      {children}
      {switching && <LanguageSwitchOverlay />}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage doit être utilisé à l'intérieur d'un <LanguageProvider>.");
  return ctx;
}
