import { cookie } from "../lib/memStore.js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { useLanguage } from "./LanguageContext.jsx";

const RegionContext = createContext(null);
const KEY = "hc_region";

const FALLBACK = {
  ZM: { name: { fr: "Zambie", en: "Zambia" }, currency: "ZMW", flag: "🇿🇲" },
  CD: { name: { fr: "RD Congo", en: "DR Congo" }, currency: "USD", flag: "🇨🇩" },
  ZA: { name: { fr: "Afrique du Sud", en: "South Africa" }, currency: "ZAR", flag: "🇿🇦" },
  FR: { name: { fr: "France", en: "France" }, currency: "EUR", flag: "🇫🇷" },
  BE: { name: { fr: "Belgique", en: "Belgium" }, currency: "EUR", flag: "🇧🇪" },
  GB: { name: { fr: "Royaume-Uni", en: "United Kingdom" }, currency: "GBP", flag: "🇬🇧" },
  US: { name: { fr: "États-Unis", en: "United States" }, currency: "USD", flag: "🇺🇸" },
};
export const REGION_LIST = Object.entries(FALLBACK).map(([code, v]) => ({ code, ...v }));
export const regionInfo = (code) => FALLBACK[code] || { name: { fr: code, en: code }, currency: "USD", flag: "🌍" };

// Secours quand l'IP n'est pas disponible (dev local, hébergeur sans en-tête) : le fuseau horaire du navigateur.
const TZ = { "Africa/Lusaka": "ZM", "Africa/Lubumbashi": "CD", "Africa/Kinshasa": "CD", "Africa/Johannesburg": "ZA", "Europe/Paris": "FR", "Europe/Brussels": "BE", "Europe/London": "GB", "America/New_York": "US" };

function readStored() {
  try { return JSON.parse(cookie.get(KEY) || "null"); } catch { return null; }
}

export function RegionProvider({ children }) {
  const { lang } = useLanguage();
  const stored = readStored();
  const [country, setCountryState] = useState(stored?.country || "ZM");
  const [manual, setManual] = useState(Boolean(stored?.manual));
  const [currency, setCurrencyState] = useState(stored?.currency || regionInfo(stored?.country || "ZM").currency);
  const [rates, setRates] = useState(null);

  // Détection (une seule fois, et seulement si le visiteur n'a rien choisi lui-même).
  useEffect(() => {
    if (manual) return undefined;
    let alive = true;
    (async () => {
      let code = null;
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2500);
        const r = await fetch("/api/geo", { signal: ctl.signal }); clearTimeout(t);
        if (r.ok && (r.headers.get("content-type") || "").includes("json")) code = (await r.json()).country;
      } catch { /* pas d'IP : on passe au fuseau horaire */ }
      if (!code) { try { code = TZ[Intl.DateTimeFormat().resolvedOptions().timeZone] || null; } catch { code = null; } }
      if (alive && code && FALLBACK[code]) { setCountryState(code); setCurrencyState(FALLBACK[code].currency); }
    })();
    return () => { alive = false; };
  }, [manual]);

  useEffect(() => { api.geo.rates().then((r) => setRates(r?.rates || null)).catch(() => {}); }, []);

  const persist = (next) => { cookie.set(KEY, JSON.stringify(next)); };
  const setCountry = useCallback((code) => {
    const cur = regionInfo(code).currency;
    setCountryState(code); setCurrencyState(cur); setManual(true); persist({ country: code, currency: cur, manual: true });
  }, []);
  const setCurrency = useCallback((cur) => {
    setCurrencyState(cur); setManual(true); persist({ country, currency: cur, manual: true });
  }, [country]);

  // Conversion d'affichage (sans marge : le prix payé reste celui de la devise du vendeur).
  const convert = useCallback((amount, from) => {
    if (!rates || !from || from === currency || amount == null) return amount;
    const a = rates[from]?.per_usd, b = rates[currency]?.per_usd;
    return a && b ? (Number(amount) / a) * b : amount;
  }, [rates, currency]);

  const format = useCallback((amount, cur = currency) => {
    try {
      const big = Math.abs(amount) >= 100 || cur === "CDF";
      return new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB", { style: "currency", currency: cur, maximumFractionDigits: big ? 0 : 2, minimumFractionDigits: 0 }).format(amount);
    } catch { return `${Math.round(amount * 100) / 100} ${cur}`; }
  }, [lang, currency]);

  const value = useMemo(() => ({ country, currency, manual, setCountry, setCurrency, convert, format, ratesReady: Boolean(rates), info: regionInfo(country) }), [country, currency, manual, setCountry, setCurrency, convert, format, rates]);
  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}

export function useRegion() {
  const ctx = useContext(RegionContext);
  if (!ctx) throw new Error("useRegion doit être utilisé dans <RegionProvider>.");
  return ctx;
}

/** Prix affiché dans la devise du visiteur ; l'info-bulle rappelle le prix d'origine. */
export function Price({ amount, from = "ZMW", className = "" }) {
  const { convert, format, currency } = useRegion();
  if (amount == null) return null;
  const shown = convert(amount, from);
  return <span className={className} title={from !== currency ? `${format(amount, from)} (${from})` : undefined}>{format(shown)}</span>;
}
