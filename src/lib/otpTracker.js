// Envoi du code e-mail "en arrière-plan" : on affiche tout de suite l'écran
// de saisie du code pendant que la demande part, au lieu de faire attendre la
// personne (serveur qui se réveille, e-mail lent) sur le formulaire.
//
// Un petit magasin au niveau du module (pas d'état React) : il survit au
// changement de page, donc l'écran /verifier voit l'état d'un envoi lancé
// depuis /connexion ou /creer-un-compte.
import { useSyncExternalStore } from "react";
import { api, ApiError } from "./api.js";

let state = { status: "idle", email: null, purpose: null, error: null, rateLimited: false, startedAt: 0 };
let inflight = null;
const listeners = new Set();

function set(next) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/** Lance (ou relance) l'envoi du code. Ne jette jamais : l'état dit ce qui s'est passé. */
export function startOtp(email, purpose = "login") {
  // Même demande déjà en cours : on ne double pas l'e-mail.
  if (inflight && state.status === "sending" && state.email === email && state.purpose === purpose) return inflight;
  set({ status: "sending", email, purpose, error: null, rateLimited: false, startedAt: Date.now() });
  const mine = (inflight = api.auth
    .requestOtp(email, "email", purpose)
    .then(() => {
      if (inflight === mine) set({ status: "sent" });
    })
    .catch((err) => {
      if (inflight !== mine) return;
      const limited = err instanceof ApiError && err.status === 429;
      set({
        status: "error",
        rateLimited: limited,
        error: limited ? null : err?.data?.detail || err?.message || "error",
      });
    })
    .finally(() => {
      if (inflight === mine) inflight = null;
    }));
  return mine;
}

export function useOtpStatus() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state
  );
}
