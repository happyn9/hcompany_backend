import { mem } from "../lib/memStore.js";
import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

// Repli si l'API est injoignable : mêmes bouquets que ceux créés au premier
// démarrage du serveur. L'achat, lui, passe toujours par le serveur.
export const FALLBACK_PLANS = {
  pivot: "ZMW",
  testMode: true,
  currencies: [
    { code: "ZMW", label: "Kwacha zambien", symbol: "K", rate: 1 },
    { code: "USD", label: "Dollar américain", symbol: "$", rate: 0.04 },
    { code: "CDF", label: "Franc congolais", symbol: "FC", rate: 110 },
  ],
  plans: [
    { id: -1, code: "individuel", name: "Individuel", audience: "individual", tagline: "", features: [], price_monthly: 150, price_yearly: 1500, yearly_saving_pct: 17, per_seat: false, min_seats: 1, max_seats: 1, includes_inperson: true, includes_exclusive: true, highlight: false },
    { id: -2, code: "pro", name: "Pro", audience: "pro", tagline: "", features: [], price_monthly: 400, price_yearly: 4000, yearly_saving_pct: 17, per_seat: false, min_seats: 1, max_seats: 1, includes_inperson: true, includes_exclusive: true, highlight: true },
    { id: -3, code: "equipe", name: "Équipe", audience: "team", tagline: "", features: [], price_monthly: 120, price_yearly: 1200, yearly_saving_pct: 17, per_seat: true, min_seats: 5, max_seats: 200, includes_inperson: true, includes_exclusive: true, highlight: false },
  ],
};

/** Bouquets + devises. status : loading | ready ; offline = repli local. */
export function usePlans() {
  const [state, setState] = useState({ status: "loading", offline: false, ...FALLBACK_PLANS, plans: [] });

  useEffect(() => {
    let cancelled = false;
    api.learning
      .plans()
      .then((d) => !cancelled && setState({ status: "ready", offline: false, testMode: d.test_mode !== false, pivot: d.pivot, currencies: d.currencies, plans: d.plans }))
      .catch(() => !cancelled && setState({ status: "ready", offline: true, ...FALLBACK_PLANS }));
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/** Devise choisie, mémorisée sur l'appareil (jamais bloquant si le stockage est refusé). */
const CURRENCY_KEY = "hc_learning_currency";
export function loadCurrency(fallback = "ZMW") {
  return mem.get(CURRENCY_KEY, fallback);
}
export function saveCurrency(code) {
  mem.set(CURRENCY_KEY, code);
}
