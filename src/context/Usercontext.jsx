import { clearLoadCache } from "../lib/loadCache.js";
import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api.js";

// L'access_token vit uniquement en mémoire (state React), jamais en
// localStorage ni sessionStorage : c'est le refresh_token (cookie httpOnly, non lisible en
// JS) qui assure la persistance de session entre deux visites, via
// /auth/refresh appelé au montage de l'app.
const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [status, setStatus] = useState("loading"); // "loading" | "ready"
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const tokenRef = useRef(null);
  tokenRef.current = token;
  const restoreRef = useRef(null); // promesse de la restauration de session au chargement

  // Tente de restaurer la session via le cookie refresh_token au chargement.
  useEffect(() => {
    restoreRef.current = (async () => {
      try {
        const data = await api.auth.refresh();
        tokenRef.current = data.access_token; // disponible tout de suite pour les écrans qui attendent
        setToken(data.access_token);
        setUser(data.user);
      } catch {
        // Pas de session valide : c'est un cas normal (première visite,
        // cookie expiré...), pas une erreur à afficher.
        setUser(null);
        setToken(null);
      } finally {
        setStatus("ready");
      }
    })();
  }, []);

  async function applyAuthResponse(data) {
    clearLoadCache(); // jamais de données en cache d'un autre compte
    setToken(data.access_token);
    setUser(data.user);
    setError(null);
    return data;
  }

  async function signIn(email, password) {
    const data = await api.auth.signIn(email, password);
    return applyAuthResponse(data);
  }

  async function signInPartner(code, password) {
    const data = await api.auth.signInPartner(code, password);
    return applyAuthResponse(data);
  }

  async function signUp(name, email, password) {
    // /register ne renvoie plus de jeton depuis le passage au service
    // d'authentification commune — un compte fraîchement créé doit
    // d'abord prouver la possession de son e-mail via OTP avant de
    // recevoir quoi que ce soit. Voir la page /verifier.
    return api.auth.signUp(name, email, password);
  }

  async function signInWithOtp(identifier, channel, code, purpose = "login") {
    const data = await api.auth.verifyOtp(identifier, channel, code, purpose);
    return applyAuthResponse(data);
  }

  async function resetPassword(newPassword) {
    return api.auth.resetPassword(tokenRef.current, newPassword);
  }

  async function completeOAuth(accessToken, refreshToken) {
    const data = await api.auth.oauthComplete(accessToken, refreshToken);
    return applyAuthResponse(data);
  }

  // Session ouverte par QR : jeton d'accès seul (8 h), pas de jeton de rafraîchissement.
  function adoptSession(data) {
    return applyAuthResponse(data);
  }

  async function signOut() {
    clearLoadCache();
    try {
      await api.auth.logout();
    } catch {
      // Le cookie sera de toute façon expiré côté client ci-dessous.
    }
    setToken(null);
    setUser(null);
    navigate("/app", { replace: true }); // la déconnexion ramène sur le new app (mode invité) ; la connexion n'est exigée que pour transactionner
  }

  // À utiliser autour d'un appel API protégé : si le token a expiré (401),
  // tente un refresh silencieux puis rejoue l'appel une seule fois.
  const withAuth = useCallback(async (fn) => {
    if (restoreRef.current) await restoreRef.current; // on attend la restauration de session avant le premier appel protégé
    try {
      return await fn(tokenRef.current);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        const data = await api.auth.refresh();
        setToken(data.access_token);
        setUser(data.user);
        return fn(data.access_token);
      }
      throw err;
    }
  }, []);

  const value = {
    user,
    token,
    isAuthenticated: !!user,
    isLoading: status === "loading",
    error,
    signIn,
    signInPartner,
    signUp,
    signInWithOtp,
    resetPassword,
    completeOAuth,
    adoptSession,
    signOut,
    withAuth,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useUser doit être utilisé à l'intérieur d'un <UserProvider>.");
  }
  return ctx;
}
