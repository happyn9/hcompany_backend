import { cacheGet, cacheKey, cacheSet } from "../lib/loadCache.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { FALLBACK_PLANS, loadCurrency, saveCurrency } from "./plans.js";
import { convert, formatMoney } from "../lib/pricing.js";
import { useLanguage } from "../context/LanguageContext.jsx";

/** Charge une ressource ; `reload()` relance. deps = quand relancer. */
export function useLoad(fn, deps = []) {
  const [state, setState] = useState(() => {
    const c = cacheGet(cacheKey(fn, deps));
    return c ? { data: c.data, error: null, loading: false } : { data: null, error: null, loading: true };
  });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const run = useCallback(() => {
    let cancelled = false;
    const k = cacheKey(fnRef.current, deps), c = cacheGet(k);
    if (c) setState({ data: c.data, error: null, loading: false });
    else setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(() => fnRef.current())
      .then((data) => { cacheSet(k, data); if (!cancelled) setState({ data, error: null, loading: false }); })
      .catch((error) => { if (!cancelled) setState((s) => (s.data && c ? { ...s, error: null, loading: false } : { data: null, error, loading: false })); });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => run(), [run]);
  return { ...state, reload: run };
}

// Devises : même source que H-Learning (monnaie pivot + taux d'affichage).
let currencyPromise = null;
function loadCurrencies() {
  if (!currencyPromise) {
    currencyPromise = api.learning
      .plans()
      .then((d) => ({ pivot: d.pivot, currencies: d.currencies, testMode: d.test_mode !== false }))
      .catch(() => {
        currencyPromise = null;
        return { pivot: FALLBACK_PLANS.pivot, currencies: FALLBACK_PLANS.currencies, testMode: true };
      });
  }
  return currencyPromise;
}

/** money(montantPivot) → texte dans la devise choisie. pivotMoney → toujours en pivot. */
export function useShopMoney() {
  const { lang } = useLanguage();
  const [info, setInfo] = useState({ pivot: FALLBACK_PLANS.pivot, currencies: FALLBACK_PLANS.currencies, testMode: true });
  const [code, setCode] = useState(() => loadCurrency(FALLBACK_PLANS.pivot));
  useEffect(() => {
    let alive = true;
    loadCurrencies().then((d) => alive && setInfo(d));
    return () => {
      alive = false;
    };
  }, []);
  const current = info.currencies.find((c) => c.code === code) || info.currencies.find((c) => c.code === info.pivot) || info.currencies[0];
  const pivotCur = info.currencies.find((c) => c.code === info.pivot) || { code: info.pivot, symbol: info.pivot };
  const choose = (c) => {
    setCode(c);
    saveCurrency(c);
  };
  return {
    ...info,
    currency: current,
    choose,
    money: (n) => formatMoney(convert(n || 0, current?.rate), current, lang),
    pivotMoney: (n) => formatMoney(n || 0, pivotCur, lang),
  };
}

// Catégories partagées par la barre, l'accueil et le catalogue.
let catPromise = null;
export function useCategories() {
  const [cats, setCats] = useState([]);
  useEffect(() => {
    let alive = true;
    if (!catPromise) catPromise = api.shop.categories().catch(() => { catPromise = null; return []; });
    catPromise.then((d) => alive && setCats(d));
    return () => {
      alive = false;
    };
  }, []);
  return cats;
}
export function resetCategoriesCache() {
  catPromise = null;
}

export function errMessage(err, fallback) {
  return err?.data?.detail && typeof err.data.detail === "string" ? err.data.detail : err?.message || fallback;
}
