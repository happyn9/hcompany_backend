import { mem } from "./memStore.js";
// Client API léger pour communiquer avec le backend FastAPI de H-Company.
// L'URL de base se configure via la variable d'environnement VITE_API_URL
// (voir .env.example). Aucune dépendance externe : fetch natif du navigateur.

// Exporté pour construire des URL absolues vers des fichiers servis par le
// backend (logos de services uploadés, etc.) — voir data/hServices.js.
// Vide ou « / » = même domaine que le site (API servie via le proxy Vercel, voir SECURITY.md).
export // En production l'API est jointe via le MÊME domaine que le site (réécriture dans vercel.json → Render) : le cookie de session
// devient « first-party » et survit au rechargement sur tous les navigateurs. VITE_DIRECT_API=1 force l'appel direct (cas particulier).
const BASE_URL = (import.meta.env.PROD && import.meta.env.VITE_DIRECT_API !== "1" ? "" : (import.meta.env.VITE_API_URL ?? "http://localhost:8000")).replace(/\/+$/, "");

// Les navigateurs modernes bloquent de plus en plus les cookies tiers dès
// que le site et l'API vivent sur deux domaines différents (Vercel +
// Render, notamment) — même correctement réglés en SameSite=None; Secure,
// confirmé en production. Le jeton de rafraîchissement est donc stocké ici
// et renvoyé explicitement, plutôt que de compter sur le cookie httpOnly
// (qui reste posé par le serveur, mais n'est plus la source fiable).
const REFRESH_TOKEN_KEY = "hc_refresh_token";

// Jamais écrit dans le navigateur (ni localStorage ni sessionStorage) : le jeton ne vit qu'en mémoire.
// La persistance de session repose sur le cookie httpOnly posé par le serveur (voir SECURITY.md : proxy Vercel).
function saveRefreshToken(token) {
  if (token) mem.set(REFRESH_TOKEN_KEY, token);
}

function getRefreshToken() {
  return mem.get(REFRESH_TOKEN_KEY);
}

function clearRefreshToken() {
  mem.del(REFRESH_TOKEN_KEY);
}

// Construit une query string en ignorant les valeurs vides.
function qs(params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "" && v !== false) sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** URL absolue d'une image téléversée (chemin relatif renvoyé par l'API). */
export function uploadUrl(path) {
  if (!path) return null;
  if (/^https?:/.test(path)) return path;
  return `${BASE_URL}/uploads/${path}`;
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

class NetworkError extends Error {
  constructor() {
    super("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.");
    this.name = "NetworkError";
  }
}

// Confirmation par mot de passe de l'admin (jeton de 10 min, gardé en mémoire d'onglet uniquement).
const ADMIN_CONFIRM_KEY = "hc_admin_confirm";
export function getAdminConfirm() {
  const v = mem.get(ADMIN_CONFIRM_KEY);
  if (!v) return null;
  if (Date.now() > v.exp) { mem.del(ADMIN_CONFIRM_KEY); return null; }
  return v;
}
export function setAdminConfirm(token, expiresInSec) { mem.set(ADMIN_CONFIRM_KEY, { token, exp: Date.now() + expiresInSec * 1000 - 5000 }); }
export function clearAdminConfirm() { mem.del(ADMIN_CONFIRM_KEY); }

let refreshInFlight = null;

async function request(path, { method = "GET", body, token, headers = {} } = {}) {
  const confirm = path.includes("/admin") ? getAdminConfirm() : null;
  // Un FormData (upload de fichier) ne doit pas être JSON.stringify()'d, et
  // le Content-Type multipart avec sa boundary doit être posé par le
  // navigateur lui-même, pas fixé ici en dur.
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      // Indispensable pour que le cookie httpOnly `refresh_token` posé par
      // /auth/login et /auth/otp/verify soit envoyé sur les appels suivants
      // (ex: /auth/refresh) — le backend est sur une origine différente du site
      // en dev (ports 8000 vs 5173), donc `credentials` doit être explicite.
      credentials: "include",
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(confirm ? { "X-Admin-Confirm": confirm.token } : {}),
        ...headers,
      },
      body: isFormData ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Le fetch lui-même a échoué (serveur injoignable, coupure réseau,
    // CORS bloqué) — distinct d'une réponse HTTP d'erreur, où le serveur a
    // au moins répondu. On le signale spécifiquement pour que l'interface
    // puisse afficher "impossible de contacter le serveur" plutôt qu'un
    // message d'erreur métier trompeur.
    throw new NetworkError();
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    if (res.status === 428 && typeof window !== "undefined") {
      clearAdminConfirm();
      window.dispatchEvent(new CustomEvent("hc:admin-confirm-required"));
    }
    throw new ApiError(data?.detail || res.statusText, res.status, data);
  }

  return data;
}

export const api = {
  // Authentification par e-mail + mot de passe
  auth: {
    signIn: (email, password) =>
      request("/api/v1/auth/login", { method: "POST", body: { email, password } }).then((data) => {
        saveRefreshToken(data?.refresh_token);
        return data;
      }),
    signInPartner: (code, password) =>
      request("/api/v1/auth/login-partner", { method: "POST", body: { code, password } }).then((data) => {
        saveRefreshToken(data?.refresh_token);
        return data;
      }),
    signUp: (name, email, password) =>
      request("/api/v1/auth/register", { method: "POST", body: { full_name: name, email, password } }),
    me: (token) => request("/api/v1/auth/me", { token }),
    updateMe: (token, full_name) => request("/api/v1/auth/me", { method: "PATCH", token, body: { full_name } }),
    // Réveille l'API et le service d'authentification (hébergeur gratuit en
    // veille) avant que la personne n'ait fini de remplir le formulaire.
    // Sans effet de bord ; au plus un appel toutes les 4 minutes.
    warmup: () => {
      const last = Number(mem.get("hc_warm_at", 0));
      if (Date.now() - last < 4 * 60 * 1000) return Promise.resolve();
      mem.set("hc_warm_at", Date.now());
      return request("/api/v1/auth/warmup").catch(() => {});
    },
    // Renouvelle l'access_token à partir du jeton de rafraîchissement
    // stocké localement — le cookie httpOnly est envoyé aussi (au cas où),
    // mais ce corps JSON est la source réellement fiable désormais (voir
    // commentaire sur REFRESH_TOKEN_KEY plus haut).
    // Un seul /auth/refresh à la fois : le jeton de rafraîchissement tourne à chaque usage, donc deux appels
    // simultanés (restauration au chargement + un écran qui appelle l'API avant d'avoir son jeton) feraient
    // rejeter le second et déconnecteraient la personne à chaque rechargement.
    refresh: () => {
      if (refreshInFlight) return refreshInFlight;
      refreshInFlight = request("/api/v1/auth/refresh", { method: "POST", body: { refresh_token: getRefreshToken() } })
        .then((data) => {
          saveRefreshToken(data?.refresh_token);
          return data;
        })
        .finally(() => { refreshInFlight = null; });
      return refreshInFlight;
    },
    logout: () => {
      clearRefreshToken();
      return request("/api/v1/auth/logout", { method: "POST" });
    },

    // Connexion par code à usage unique (email ou WhatsApp) — utilisée
    // notamment par les partenaires lors de leur première connexion.
    requestOtp: (identifier, channel, purpose = "login") =>
      request("/api/v1/auth/otp/request", { method: "POST", body: { identifier, channel, purpose } }),
    verifyOtp: (identifier, channel, code, purpose = "login") =>
      request("/api/v1/auth/otp/verify", { method: "POST", body: { identifier, channel, purpose, code } }).then(
        (data) => {
          saveRefreshToken(data?.refresh_token);
          return data;
        }
      ),
    changePassword: (token, currentPassword, newPassword) =>
      request("/api/v1/auth/change-password", {
        method: "POST",
        token,
        body: { current_password: currentPassword, new_password: newPassword },
      }),
    resetPassword: (token, newPassword) =>
      request("/api/v1/auth/reset-password", {
        method: "POST",
        token,
        body: { new_password: newPassword },
      }),
    googleLoginUrl: () => request("/api/v1/auth/google/login"),
    oauthComplete: (accessToken, refreshToken) =>
      request("/api/v1/auth/oauth/complete", {
        method: "POST",
        body: { access_token: accessToken, refresh_token: refreshToken },
      }).then((data) => {
        saveRefreshToken(data?.refresh_token);
        return data;
      }),
  },

  // Candidatures / espace partenaires
  partners: {
    // Formulaire unique de candidature (KYC inclus) — multipart/form-data
    // car il embarque la pièce d'identité. `fields` = { company,
    // contactName, category, message, phone, address, id_document_type,
    // id_document_number }, `idDocumentFile` = objet File natif du <input type="file">.
    apply: (token, fields, idDocumentFile) => {
      const form = new FormData();
      Object.entries(fields).forEach(([key, value]) => {
        if (value !== undefined && value !== null) form.append(key, value);
      });
      form.append("id_document", idDocumentFile);
      return request("/api/v1/partners/apply", { method: "POST", token, body: form });
    },
    // Ma candidature (utilisateur connecté)
    me: (token) => request("/api/v1/partners/me", { token }),
    contract: (token) => request("/api/v1/partners/me/contract", { token }),
    signContract: (token, signedByName) =>
      request("/api/v1/partners/me/contract/sign", {
        method: "POST",
        token,
        body: { signed_by_name: signedByName },
      }),
    activities: (token) => request("/api/v1/partners/me/activities", { token }),
    stats: (token) => request("/api/v1/partners/me/stats", { token }),
    myOffers: (token) => request("/api/v1/partners/me/offers", { token }),
    acceptOffer: (token, offerId) =>
      request(`/api/v1/partners/me/offers/${offerId}/accept`, { method: "POST", token }),
    createPayment: (token, offerPublicId, method, phoneNumber) =>
      request("/api/v1/partners/me/payments", {
        method: "POST",
        token,
        body: { offer_public_id: offerPublicId, method, phone_number: phoneNumber || null },
      }),
    myPayments: (token) => request("/api/v1/partners/me/payments", { token }),
    accountStatus: (token) => request("/api/v1/partners/me/account", { token }),
    myApps: (token) => request("/api/v1/partners/me/apps", { token }),
    requestApp: (token, name, description) =>
      request("/api/v1/partners/me/apps", { method: "POST", token, body: { name, description } }),
    billing: (token) => request("/api/v1/partners/me/billing", { token }),
  },

  // H-Shopping : place de marché (catalogue, panier, commandes, vendeurs, agences, admin)
  shop: {
    home: (token) => request("/api/v1/shopping/home", { token }),
    categories: () => request("/api/v1/shopping/categories"),
    products: (params = {}, token) => request(`/api/v1/shopping/products${qs(params)}`, { token }),
    product: (id, token) => request(`/api/v1/shopping/products/${id}`, { token }),
    related: (id, token) => request(`/api/v1/shopping/products/${id}/related`, { token }),
    productReviews: (id) => request(`/api/v1/shopping/products/${id}/reviews`),
    shops: (q = "") => request(`/api/v1/shopping/shops${qs({ q })}`),
    shopBySlug: (slug) => request(`/api/v1/shopping/shops/${slug}`),
    shopReviews: (slug) => request(`/api/v1/shopping/shops/${slug}/reviews`),
    agencies: () => request("/api/v1/shopping/agencies"),
    quote: (body) => request("/api/v1/shopping/cart/quote", { method: "POST", body }),
    track: (code, phone) => request(`/api/v1/shopping/track/${encodeURIComponent(code)}${qs({ phone })}`),
    checkout: (token, body) => request("/api/v1/shopping/checkout", { method: "POST", token, body }),
    myOrders: (token) => request("/api/v1/shopping/me/orders", { token }),
    myOrder: (token, code) => request(`/api/v1/shopping/me/orders/${code}`, { token }),
    confirmReceipt: (token, code) => request(`/api/v1/shopping/me/orders/${code}/confirm`, { method: "POST", token }),
    cancelOrder: (token, code, reason) => request(`/api/v1/shopping/me/orders/${code}/cancel`, { method: "POST", token, body: { reason } }),
    dispute: (token, code, reason, note) => request(`/api/v1/shopping/me/orders/${code}/dispute`, { method: "POST", token, body: { reason, note } }),
    review: (token, body) => request("/api/v1/shopping/reviews", { method: "POST", token, body }),
    favorites: (token) => request("/api/v1/shopping/me/favorites", { token }),
    addFavorite: (token, id) => request(`/api/v1/shopping/me/favorites/${id}`, { method: "POST", token }),
    removeFavorite: (token, id) => request(`/api/v1/shopping/me/favorites/${id}`, { method: "DELETE", token }),

    seller: {
      upload: (token, file, cutout = false) => {
        const fd = new FormData();
        fd.append("file", file);
        return request(`/api/v1/shopping/seller/uploads${cutout ? "?cutout=true" : ""}`, { method: "POST", token, body: fd });
      },
      shops: (token) => request("/api/v1/shopping/seller/shops", { token }),
      createShop: (token, body) => request("/api/v1/shopping/seller/shops", { method: "POST", token, body }),
      updateShop: (token, id, body) => request(`/api/v1/shopping/seller/shops/${id}`, { method: "PATCH", token, body }),
      products: (token, shopId) => request(`/api/v1/shopping/seller/shops/${shopId}/products`, { token }),
      product: (token, id) => request(`/api/v1/shopping/seller/products/${id}`, { token }),
      createProduct: (token, shopId, body) => request(`/api/v1/shopping/seller/shops/${shopId}/products`, { method: "POST", token, body }),
      updateProduct: (token, id, body) => request(`/api/v1/shopping/seller/products/${id}`, { method: "PUT", token, body }),
      patchProduct: (token, id, body) => request(`/api/v1/shopping/seller/products/${id}`, { method: "PATCH", token, body }),
      deleteProduct: (token, id) => request(`/api/v1/shopping/seller/products/${id}`, { method: "DELETE", token }),
      orders: (token, shopId, status) => request(`/api/v1/shopping/seller/shops/${shopId}/orders${qs({ status })}`, { token }),
      accept: (token, shopId, code) => request(`/api/v1/shopping/seller/shops/${shopId}/orders/${code}/accept`, { method: "POST", token }),
      ship: (token, shopId, code, note = "") => request(`/api/v1/shopping/seller/shops/${shopId}/orders/${code}/ship`, { method: "POST", token, body: { note } }),
      cancel: (token, shopId, code, reason = "") => request(`/api/v1/shopping/seller/shops/${shopId}/orders/${code}/cancel`, { method: "POST", token, body: { reason } }),
      stats: (token, shopId) => request(`/api/v1/shopping/seller/shops/${shopId}/stats`, { token }),
      wallet: (token, shopId) => request(`/api/v1/shopping/seller/shops/${shopId}/wallet`, { token }),
      payouts: (token, shopId) => request(`/api/v1/shopping/seller/shops/${shopId}/payouts`, { token }),
      requestPayout: (token, shopId, body) => request(`/api/v1/shopping/seller/shops/${shopId}/payouts`, { method: "POST", token, body }),
      coupons: (token, shopId) => request(`/api/v1/shopping/seller/shops/${shopId}/coupons`, { token }),
      createCoupon: (token, shopId, body) => request(`/api/v1/shopping/seller/shops/${shopId}/coupons`, { method: "POST", token, body }),
      deleteCoupon: (token, shopId, id) => request(`/api/v1/shopping/seller/shops/${shopId}/coupons/${id}`, { method: "DELETE", token }),
      reviews: (token, shopId) => request(`/api/v1/shopping/seller/shops/${shopId}/reviews`, { token }),
      reply: (token, shopId, reviewId, reply) => request(`/api/v1/shopping/seller/shops/${shopId}/reviews/${reviewId}/reply`, { method: "POST", token, body: { reply } }),
    },

    agency: {
      me: (token) => request("/api/v1/shopping/agency/me", { token }),
      orders: (token) => request("/api/v1/shopping/agency/orders", { token }),
      setStatus: (token, code, status, note = "") => request(`/api/v1/shopping/agency/orders/${code}/status`, { method: "POST", token, body: { status, note } }),
    },

    admin: {
      overview: (token) => request("/api/v1/shopping/admin/overview", { token }),
      shops: (token, status) => request(`/api/v1/shopping/admin/shops${qs({ status })}`, { token }),
      updateShop: (token, id, body) => request(`/api/v1/shopping/admin/shops/${id}`, { method: "PATCH", token, body }),
      moderateProduct: (token, id, body) => request(`/api/v1/shopping/admin/products/${id}`, { method: "PATCH", token, body }),
      hideReview: (token, id) => request(`/api/v1/shopping/admin/reviews/${id}`, { method: "DELETE", token }),
      categories: (token) => request("/api/v1/shopping/admin/categories", { token }),
      createCategory: (token, body) => request("/api/v1/shopping/admin/categories", { method: "POST", token, body }),
      updateCategory: (token, id, body) => request(`/api/v1/shopping/admin/categories/${id}`, { method: "PUT", token, body }),
      deleteCategory: (token, id) => request(`/api/v1/shopping/admin/categories/${id}`, { method: "DELETE", token }),
      partners: (token) => request("/api/v1/shopping/admin/partners", { token }),
      agencies: (token) => request("/api/v1/shopping/admin/agencies", { token }),
      createAgency: (token, body) => request("/api/v1/shopping/admin/agencies", { method: "POST", token, body }),
      updateAgency: (token, id, body) => request(`/api/v1/shopping/admin/agencies/${id}`, { method: "PUT", token, body }),
      orders: (token, params = {}) => request(`/api/v1/shopping/admin/orders${qs(params)}`, { token }),
      resolve: (token, code, decision, note = "") => request(`/api/v1/shopping/admin/orders/${code}/resolve`, { method: "POST", token, body: { decision, note } }),
      payouts: (token, status) => request(`/api/v1/shopping/admin/payouts${qs({ status })}`, { token }),
      updatePayout: (token, id, status, note) => request(`/api/v1/shopping/admin/payouts/${id}`, { method: "PATCH", token, body: { status, note } }),
      coupons: (token) => request("/api/v1/shopping/admin/coupons", { token }),
      createCoupon: (token, body) => request("/api/v1/shopping/admin/coupons", { method: "POST", token, body }),
      deleteCoupon: (token, id) => request(`/api/v1/shopping/admin/coupons/${id}`, { method: "DELETE", token }),
      settings: (token) => request("/api/v1/shopping/admin/settings", { token }),
      saveSettings: (token, body) => request("/api/v1/shopping/admin/settings", { method: "PUT", token, body }),
    },
  },

  // H-Transport : billetterie de bus (recherche, réservation, agences, admin)
  transport: {
    meta: () => request("/api/v1/transport/meta"),
    popular: () => request("/api/v1/transport/routes/popular"),
    search: (params = {}) => request(`/api/v1/transport/trips${qs(params)}`),
    trip: (id) => request(`/api/v1/transport/trips/${id}`),
    book: (token, body) => request("/api/v1/transport/book", { method: "POST", token, body }),
    myBookings: (token) => request("/api/v1/transport/me/bookings", { token }),
    myBooking: (token, code) => request(`/api/v1/transport/me/bookings/${code}`, { token }),
    cancel: (token, code, reason = "") => request(`/api/v1/transport/me/bookings/${code}/cancel`, { method: "POST", token, body: { reason } }),
    dispute: (token, code, reason, note = "") => request(`/api/v1/transport/me/bookings/${code}/dispute`, { method: "POST", token, body: { reason, note } }),
    review: (token, body) => request("/api/v1/transport/reviews", { method: "POST", token, body }),
    cargo: {
      meta: () => request("/api/v1/transport/cargo/meta"),
      search: (params = {}) => request(`/api/v1/transport/cargo/trips${qs(params)}`),
      trip: (id) => request(`/api/v1/transport/cargo/trips/${id}`),
      book: (token, body) => request("/api/v1/transport/cargo/book", { method: "POST", token, body }),
      mine: (token) => request("/api/v1/transport/cargo/me/bookings", { token }),
      cancel: (token, code) => request(`/api/v1/transport/cargo/me/bookings/${code}/cancel`, { method: "POST", token }),
      track: (code) => request(`/api/v1/transport/cargo/track/${encodeURIComponent(code)}`),
    },
    operator: {
      me: (token) => request("/api/v1/transport/operator/me", { token }),
      create: (token, body) => request("/api/v1/transport/operator/me", { method: "POST", token, body }),
      save: (token, body) => request("/api/v1/transport/operator/me", { method: "PUT", token, body }),
      overview: (token) => request("/api/v1/transport/operator/overview", { token }),
      trips: (token, scope = "upcoming") => request(`/api/v1/transport/operator/trips${qs({ scope })}`, { token }),
      createTrip: (token, body) => request("/api/v1/transport/operator/trips", { method: "POST", token, body }),
      updateTrip: (token, id, body) => request(`/api/v1/transport/operator/trips/${id}`, { method: "PUT", token, body }),
      duplicate: (token, id, days) => request(`/api/v1/transport/operator/trips/${id}/duplicate`, { method: "POST", token, body: days }),
      cancelTrip: (token, id, reason) => request(`/api/v1/transport/operator/trips/${id}/cancel`, { method: "POST", token, body: { reason } }),
      manifest: (token, id) => request(`/api/v1/transport/operator/trips/${id}/manifest`, { token }),
      buses: (token) => request("/api/v1/transport/operator/buses", { token }),
      createBus: (token, body) => request("/api/v1/transport/operator/buses", { method: "POST", token, body }),
      updateBus: (token, id, body) => request(`/api/v1/transport/operator/buses/${id}`, { method: "PUT", token, body }),
      deleteBus: (token, id) => request(`/api/v1/transport/operator/buses/${id}`, { method: "DELETE", token }),
      cargo: {
        vehicles: (token) => request("/api/v1/transport/operator/cargo/vehicles", { token }),
        createVehicle: (token, body) => request("/api/v1/transport/operator/cargo/vehicles", { method: "POST", token, body }),
        updateVehicle: (token, id, body) => request(`/api/v1/transport/operator/cargo/vehicles/${id}`, { method: "PUT", token, body }),
        deleteVehicle: (token, id) => request(`/api/v1/transport/operator/cargo/vehicles/${id}`, { method: "DELETE", token }),
        trips: (token, scope = "active") => request(`/api/v1/transport/operator/cargo/trips${qs({ scope })}`, { token }),
        createTrip: (token, body) => request("/api/v1/transport/operator/cargo/trips", { method: "POST", token, body }),
        bookings: (token, tripId) => request(`/api/v1/transport/operator/cargo/trips/${tripId}/bookings`, { token }),
        setStatus: (token, tripId, body) => request(`/api/v1/transport/operator/cargo/trips/${tripId}/status`, { method: "POST", token, body }),
        deliver: (token, code, deliveryCode) => request(`/api/v1/transport/operator/cargo/bookings/${code}/deliver`, { method: "POST", token, body: { code: deliveryCode } }),
      },
      board: (token, ticket_code, undo = false) => request("/api/v1/transport/operator/boarding", { method: "POST", token, body: { ticket_code, undo } }),
      bookings: (token, trip_id) => request(`/api/v1/transport/operator/bookings${qs({ trip_id })}`, { token }),
      wallet: (token) => request("/api/v1/transport/operator/wallet", { token }),
      payouts: (token) => request("/api/v1/transport/operator/payouts", { token }),
      requestPayout: (token, amount) => request("/api/v1/transport/operator/payouts", { method: "POST", token, body: { amount } }),
      reviews: (token) => request("/api/v1/transport/operator/reviews", { token }),
      reply: (token, id, reply) => request(`/api/v1/transport/operator/reviews/${id}/reply`, { method: "POST", token, body: { reply } }),
    },
    admin: {
      overview: (token) => request("/api/v1/transport/admin/overview", { token }),
      operators: (token, status) => request(`/api/v1/transport/admin/operators${qs({ status })}`, { token }),
      updateOperator: (token, id, body) => request(`/api/v1/transport/admin/operators/${id}`, { method: "PATCH", token, body }),
      trips: (token, status) => request(`/api/v1/transport/admin/trips${qs({ status })}`, { token }),
      cancelTrip: (token, id, reason) => request(`/api/v1/transport/admin/trips/${id}/cancel`, { method: "POST", token, body: { reason } }),
      bookings: (token, status) => request(`/api/v1/transport/admin/bookings${qs({ status })}`, { token }),
      resolve: (token, code, body) => request(`/api/v1/transport/admin/bookings/${code}/resolve`, { method: "POST", token, body }),
      payouts: (token, status) => request(`/api/v1/transport/admin/payouts${qs({ status })}`, { token }),
      updatePayout: (token, id, status, admin_note = "") => request(`/api/v1/transport/admin/payouts/${id}`, { method: "PATCH", token, body: { status, admin_note } }),
      reviews: (token) => request("/api/v1/transport/admin/reviews", { token }),
      moderateReview: (token, id, hidden) => request(`/api/v1/transport/admin/reviews/${id}${qs({ hidden: hidden ? "true" : "false" })}`, { method: "PATCH", token }),
      settings: (token) => request("/api/v1/transport/admin/settings", { token }),
      saveSettings: (token, values) => request("/api/v1/transport/admin/settings", { method: "PUT", token, body: { values } }),
    },
  },

  // H-Logement : hébergements (recherche, réservation, hôtes, admin)
  resto: {
    home: () => request("/api/v1/restaurant/home"),
    search: (params = {}) => request(`/api/v1/restaurant/search${qs(params)}`),
    detail: (slug) => request(`/api/v1/restaurant/restaurants/${slug}`),
    tables: (id, params = {}) => request(`/api/v1/restaurant/restaurants/${id}/tables${qs(params)}`),
    slots: (id, params = {}) => request(`/api/v1/restaurant/restaurants/${id}/slots${qs(params)}`),
    reviews: (id) => request(`/api/v1/restaurant/restaurants/${id}/reviews`),
    reserve: (token, body) => request("/api/v1/restaurant/reservations", { method: "POST", token, body }),
    mine: (token) => request("/api/v1/restaurant/me/reservations", { token }),
    cancel: (token, code) => request(`/api/v1/restaurant/me/reservations/${code}/cancel`, { method: "POST", token }),
    review: (token, code, body) => request(`/api/v1/restaurant/me/reservations/${code}/review`, { method: "POST", token, body }),
    owner: {
      upload: (token, file) => { const fd = new FormData(); fd.append("file", file); return request("/api/v1/restaurant/owner/uploads", { method: "POST", token, body: fd }); },
      list: (token) => request("/api/v1/restaurant/owner/restaurants", { token }),
      create: (token, body) => request("/api/v1/restaurant/owner/restaurants", { method: "POST", token, body }),
      get: (token, id) => request(`/api/v1/restaurant/owner/restaurants/${id}`, { token }),
      update: (token, id, body) => request(`/api/v1/restaurant/owner/restaurants/${id}`, { method: "PUT", token, body }),
      act: (token, id, what) => request(`/api/v1/restaurant/owner/restaurants/${id}/${what}`, { method: "POST", token }),
      addCategory: (token, id, body) => request(`/api/v1/restaurant/owner/restaurants/${id}/categories`, { method: "POST", token, body }),
      updateCategory: (token, id, cid, body) => request(`/api/v1/restaurant/owner/restaurants/${id}/categories/${cid}`, { method: "PUT", token, body }),
      deleteCategory: (token, id, cid) => request(`/api/v1/restaurant/owner/restaurants/${id}/categories/${cid}`, { method: "DELETE", token }),
      addItem: (token, id, body) => request(`/api/v1/restaurant/owner/restaurants/${id}/items`, { method: "POST", token, body }),
      updateItem: (token, id, iid, body) => request(`/api/v1/restaurant/owner/restaurants/${id}/items/${iid}`, { method: "PUT", token, body }),
      deleteItem: (token, id, iid) => request(`/api/v1/restaurant/owner/restaurants/${id}/items/${iid}`, { method: "DELETE", token }),
      saveTables: (token, id, tables) => request(`/api/v1/restaurant/owner/restaurants/${id}/tables`, { method: "PUT", token, body: tables }),
      reservations: (token, id, params = {}) => request(`/api/v1/restaurant/owner/restaurants/${id}/reservations${qs(params)}`, { token }),
      action: (token, code, body) => request(`/api/v1/restaurant/owner/reservations/${code}/action`, { method: "POST", token, body }),
      stats: (token, id, days = 30) => request(`/api/v1/restaurant/owner/restaurants/${id}/stats${qs({ days })}`, { token }),
    },
    admin: {
      overview: (token) => request("/api/v1/restaurant/admin/overview", { token }),
      list: (token, params = {}) => request(`/api/v1/restaurant/admin/restaurants${qs(params)}`, { token }),
      decide: (token, id, what, reason = "") => request(`/api/v1/restaurant/admin/restaurants/${id}/${what}`, { method: "POST", token, body: ["reject", "suspend"].includes(what) ? { reason } : undefined }),
    },
  },

  tour: {
    home: () => request("/api/v1/tourism/home"),
    search: (params = {}) => request(`/api/v1/tourism/search${qs(params)}`),
    detail: (slug) => request(`/api/v1/tourism/tours/${slug}`),
    departures: (id, days = 90) => request(`/api/v1/tourism/tours/${id}/departures${qs({ days })}`),
    reviews: (id) => request(`/api/v1/tourism/tours/${id}/reviews`),
    book: (token, body) => request("/api/v1/tourism/bookings", { method: "POST", token, body }),
    mine: (token) => request("/api/v1/tourism/me/bookings", { token }),
    cancel: (token, code) => request(`/api/v1/tourism/me/bookings/${code}/cancel`, { method: "POST", token }),
    review: (token, code, body) => request(`/api/v1/tourism/me/bookings/${code}/review`, { method: "POST", token, body }),
    owner: {
      upload: (token, file) => { const fd = new FormData(); fd.append("file", file); return request("/api/v1/tourism/owner/uploads", { method: "POST", token, body: fd }); },
      list: (token) => request("/api/v1/tourism/owner/tours", { token }),
      create: (token, body) => request("/api/v1/tourism/owner/tours", { method: "POST", token, body }),
      update: (token, id, body) => request(`/api/v1/tourism/owner/tours/${id}`, { method: "PUT", token, body }),
      act: (token, id, what) => request(`/api/v1/tourism/owner/tours/${id}/${what}`, { method: "POST", token }),
      departures: (token, id) => request(`/api/v1/tourism/owner/tours/${id}/departures`, { token }),
      addDepartures: (token, id, body) => request(`/api/v1/tourism/owner/tours/${id}/departures`, { method: "POST", token, body }),
      updateDeparture: (token, did, body) => request(`/api/v1/tourism/owner/departures/${did}`, { method: "PUT", token, body }),
      deleteDeparture: (token, did) => request(`/api/v1/tourism/owner/departures/${did}`, { method: "DELETE", token }),
      bookings: (token, id, params = {}) => request(`/api/v1/tourism/owner/tours/${id}/bookings${qs(params)}`, { token }),
      action: (token, code, body) => request(`/api/v1/tourism/owner/bookings/${code}/action`, { method: "POST", token, body }),
      stats: (token, id, days = 30) => request(`/api/v1/tourism/owner/tours/${id}/stats${qs({ days })}`, { token }),
    },
    admin: {
      overview: (token) => request("/api/v1/tourism/admin/overview", { token }),
      list: (token, params = {}) => request(`/api/v1/tourism/admin/tours${qs(params)}`, { token }),
      decide: (token, id, what, reason = "") => request(`/api/v1/tourism/admin/tours/${id}/${what}`, { method: "POST", token, body: ["reject", "suspend"].includes(what) ? { reason } : undefined }),
    },
  },

  lodge: {
    home: (token) => request("/api/v1/lodging/home", { token }),
    amenities: () => request("/api/v1/lodging/amenities"),
    cities: () => request("/api/v1/lodging/cities"),
    search: (params = {}, token) => request(`/api/v1/lodging/search${qs(params)}`, { token }),
    property: (slug, token) => request(`/api/v1/lodging/properties/${slug}`, { token }),
    calendar: (id, start, days = 180) => request(`/api/v1/lodging/properties/${id}/calendar${qs({ start, days })}`),
    reviews: (id, offset = 0) => request(`/api/v1/lodging/properties/${id}/reviews${qs({ offset })}`),
    quote: (body) => request("/api/v1/lodging/quote", { method: "POST", body }),
    host: (id, token) => request(`/api/v1/lodging/hosts/${id}`, { token }),
    book: (token, body) => request("/api/v1/lodging/book", { method: "POST", token, body }),
    myBookings: (token) => request("/api/v1/lodging/me/bookings", { token }),
    myBooking: (token, code) => request(`/api/v1/lodging/me/bookings/${code}`, { token }),
    cancel: (token, code, reason = "") => request(`/api/v1/lodging/me/bookings/${code}/cancel`, { method: "POST", token, body: { reason } }),
    dispute: (token, code, reason, note = "") => request(`/api/v1/lodging/me/bookings/${code}/dispute`, { method: "POST", token, body: { reason, note } }),
    messages: (token, code) => request(`/api/v1/lodging/me/bookings/${code}/messages`, { token }),
    sendMessage: (token, code, body) => request(`/api/v1/lodging/me/bookings/${code}/messages`, { method: "POST", token, body: { body } }),
    review: (token, body) => request("/api/v1/lodging/reviews", { method: "POST", token, body }),
    favorites: (token) => request("/api/v1/lodging/me/favorites", { token }),
    addFavorite: (token, id) => request(`/api/v1/lodging/favorites/${id}`, { method: "POST", token }),
    removeFavorite: (token, id) => request(`/api/v1/lodging/favorites/${id}`, { method: "DELETE", token }),

    hosting: {
      upload: (token, file) => {
        const fd = new FormData();
        fd.append("file", file);
        return request("/api/v1/lodging/host/uploads", { method: "POST", token, body: fd });
      },
      me: (token) => request("/api/v1/lodging/host/me", { token }),
      saveMe: (token, body) => request("/api/v1/lodging/host/me", { method: "PUT", token, body }),
      properties: (token) => request("/api/v1/lodging/host/properties", { token }),
      property: (token, id) => request(`/api/v1/lodging/host/properties/${id}`, { token }),
      create: (token, body) => request("/api/v1/lodging/host/properties", { method: "POST", token, body }),
      update: (token, id, body) => request(`/api/v1/lodging/host/properties/${id}`, { method: "PUT", token, body }),
      submit: (token, id) => request(`/api/v1/lodging/host/properties/${id}/submit`, { method: "POST", token }),
      pause: (token, id) => request(`/api/v1/lodging/host/properties/${id}/pause`, { method: "POST", token }),
      remove: (token, id) => request(`/api/v1/lodging/host/properties/${id}`, { method: "DELETE", token }),
      addBlock: (token, id, body) => request(`/api/v1/lodging/host/properties/${id}/blocks`, { method: "POST", token, body }),
      removeBlock: (token, id, blockId) => request(`/api/v1/lodging/host/properties/${id}/blocks/${blockId}`, { method: "DELETE", token }),
      addRule: (token, id, body) => request(`/api/v1/lodging/host/properties/${id}/rules`, { method: "POST", token, body }),
      removeRule: (token, id, ruleId) => request(`/api/v1/lodging/host/properties/${id}/rules/${ruleId}`, { method: "DELETE", token }),
      bookings: (token, status) => request(`/api/v1/lodging/host/bookings${qs({ status })}`, { token }),
      accept: (token, code) => request(`/api/v1/lodging/host/bookings/${code}/accept`, { method: "POST", token }),
      decline: (token, code, reason = "") => request(`/api/v1/lodging/host/bookings/${code}/decline`, { method: "POST", token, body: { reason } }),
      cancel: (token, code, reason) => request(`/api/v1/lodging/host/bookings/${code}/cancel`, { method: "POST", token, body: { reason } }),
      messages: (token, code) => request(`/api/v1/lodging/host/bookings/${code}/messages`, { token }),
      sendMessage: (token, code, body) => request(`/api/v1/lodging/host/bookings/${code}/messages`, { method: "POST", token, body: { body } }),
      stats: (token) => request("/api/v1/lodging/host/stats", { token }),
      wallet: (token) => request("/api/v1/lodging/host/wallet", { token }),
      payouts: (token) => request("/api/v1/lodging/host/payouts", { token }),
      requestPayout: (token, amount) => request("/api/v1/lodging/host/payouts", { method: "POST", token, body: { amount } }),
      reviews: (token) => request("/api/v1/lodging/host/reviews", { token }),
      reply: (token, id, reply) => request(`/api/v1/lodging/host/reviews/${id}/reply`, { method: "POST", token, body: { reply } }),
    },

    admin: {
      overview: (token) => request("/api/v1/lodging/admin/overview", { token }),
      properties: (token, status) => request(`/api/v1/lodging/admin/properties${qs({ status })}`, { token }),
      updateProperty: (token, id, body) => request(`/api/v1/lodging/admin/properties/${id}`, { method: "PATCH", token, body }),
      hosts: (token) => request("/api/v1/lodging/admin/hosts", { token }),
      updateHost: (token, id, body) => request(`/api/v1/lodging/admin/hosts/${id}`, { method: "PATCH", token, body }),
      bookings: (token, status) => request(`/api/v1/lodging/admin/bookings${qs({ status })}`, { token }),
      resolve: (token, code, body) => request(`/api/v1/lodging/admin/bookings/${code}/resolve`, { method: "POST", token, body }),
      payouts: (token, status) => request(`/api/v1/lodging/admin/payouts${qs({ status })}`, { token }),
      updatePayout: (token, id, status, admin_note = "") => request(`/api/v1/lodging/admin/payouts/${id}`, { method: "PATCH", token, body: { status, admin_note } }),
      reviews: (token) => request("/api/v1/lodging/admin/reviews", { token }),
      moderateReview: (token, id, hidden) => request(`/api/v1/lodging/admin/reviews/${id}${qs({ hidden: hidden ? "true" : "false" })}`, { method: "PATCH", token }),
      settings: (token) => request("/api/v1/lodging/admin/settings", { token }),
      saveSettings: (token, values) => request("/api/v1/lodging/admin/settings", { method: "PUT", token, body: { values } }),
    },
  },

  // Agents H-Company : admin, espace agent, chat d'assistance
  agents: {
    admin: {
      list: (token) => request("/api/v1/agents/admin", { token }),
      create: (token, body) => request("/api/v1/agents/admin", { method: "POST", token, body }),
      update: (token, userId, body) => request(`/api/v1/agents/admin/${userId}`, { method: "PUT", token, body }),
      remove: (token, userId) => request(`/api/v1/agents/admin/${userId}`, { method: "DELETE", token }),
      cancelInvite: (token, email) => request(`/api/v1/agents/admin/invite/${encodeURIComponent(email)}`, { method: "DELETE", token }),
      stats: (token, userId) => request(`/api/v1/agents/admin/${userId}/stats`, { token }),
    },
    me: (token) => request("/api/v1/agents/me", { token }),
    heartbeat: (token) => request("/api/v1/agents/heartbeat", { method: "POST", token }),
    stats: (token) => request("/api/v1/agents/me/stats", { token }),
    threads: (token, status = "active") => request(`/api/v1/agents/threads${qs({ status })}`, { token }),
    thread: (token, code, after = 0) => request(`/api/v1/agents/threads/${code}${qs({ after })}`, { token }),
    claim: (token, code) => request(`/api/v1/agents/threads/${code}/claim`, { method: "POST", token }),
    reply: (token, code, body) => request(`/api/v1/agents/threads/${code}/messages`, { method: "POST", token, body: { body } }),
    close: (token, code) => request(`/api/v1/agents/threads/${code}/close`, { method: "POST", token }),
  },
  support: {
    availability: (module) => request(`/api/v1/support/availability${qs({ module })}`),
    open: (token, body) => request("/api/v1/support/threads", { method: "POST", token, body }),
    mine: (token) => request("/api/v1/support/threads", { token }),
    thread: (token, code, after = 0) => request(`/api/v1/support/threads/${code}${qs({ after })}`, { token }),
    send: (token, code, body) => request(`/api/v1/support/threads/${code}/messages`, { method: "POST", token, body: { body } }),
    close: (token, code) => request(`/api/v1/support/threads/${code}/close`, { method: "POST", token }),
  },

  // Centralisation : modules débloqués depuis le dashboard partenaire
  partnerModules: {
    list: (token) => request("/api/v1/partner/modules", { token }),
    activate: (token, key) => request(`/api/v1/partner/modules/${key}/activate`, { method: "POST", token }),
    deactivate: (token, key) => request(`/api/v1/partner/modules/${key}/deactivate`, { method: "POST", token }),
  },

  // Dashboard partenaire unique : plan, fonctions payantes, marque, revenus par app
  partnerHub: {
    get: (token) => request("/api/v1/partner/hub", { token }),
    upgrade: (token) => request("/api/v1/partner/hub/upgrade", { method: "POST", token }),
    unlock: (token, key) => request(`/api/v1/partner/hub/features/${key}/unlock`, { method: "POST", token }),
    saveBranding: (token, body) => request("/api/v1/partner/hub/branding", { method: "PUT", token, body }),
    invite: (code) => request(`/api/v1/partner/invites/${encodeURIComponent(code)}`),
    admin: {
      requests: (token) => request("/api/v1/partner/hub/admin/requests", { token }),
      setPlan: (token, userId, body) => request(`/api/v1/partner/hub/admin/users/${userId}/plan`, { method: "PUT", token, body }),
      decideFeature: (token, id, body) => request(`/api/v1/partner/hub/admin/features/${id}`, { method: "PUT", token, body }),
      invites: (token) => request("/api/v1/partner/hub/admin/invites", { token }),
      createInvite: (token, body) => request("/api/v1/partner/hub/admin/invites", { method: "POST", token, body }),
    },
  },

  // Confirmation par mot de passe avant les chiffres sensibles (admin)
  adminSecurity: {
    confirm: (token, password) => request("/api/v1/admin-security/confirm", { method: "POST", token, body: { password } }),
    sendCode: (token) => request("/api/v1/admin-security/otp", { method: "POST", token }),
    confirmCode: (token, code) => request("/api/v1/admin-security/confirm-otp", { method: "POST", token, body: { code } }),
  },

  // H-Money : envoyer ou demander de l'argent entre la Zambie et la RD Congo
  assistant: {
    ask: (question, lang) => request("/api/v1/assistant/ask", { method: "POST", body: { question, lang } }),
    feedback: (entry_id, helpful) => request("/api/v1/assistant/feedback", { method: "POST", body: { entry_id, helpful } }),
    admin: {
      list: (token, source = "") => request(`/api/v1/assistant/admin/entries${source ? `?source=${source}` : ""}`, { token }),
      create: (token, body) => request("/api/v1/assistant/admin/entries", { method: "POST", token, body }),
      update: (token, id, body) => request(`/api/v1/assistant/admin/entries/${id}`, { method: "PATCH", token, body }),
      remove: (token, id) => request(`/api/v1/assistant/admin/entries/${id}`, { method: "DELETE", token }),
    },
  },
  money: {
    corridors: () => request("/api/v1/money/corridors"),
    quote: (params) => request(`/api/v1/money/quote${qs(params)}`),
    compare: (params) => request(`/api/v1/money/quote/compare${qs(params)}`),
    send: (token, body) => request("/api/v1/money/transfers", { method: "POST", token, body }),
    mine: (token) => request("/api/v1/money/transfers", { token }),
    request: (token, body) => request("/api/v1/money/requests", { method: "POST", token, body }),
    viewRequest: (token, code, payOp = "") => request(`/api/v1/money/requests/${encodeURIComponent(code)}${payOp ? `?pay_op=${encodeURIComponent(payOp)}` : ""}`, { token }),
    payRequest: (token, code, body) => request(`/api/v1/money/requests/${encodeURIComponent(code)}/pay`, { method: "POST", token, body }),
    change: (amount, from, to) => request(`/api/v1/money/change${qs({ amount, from, to })}`),
    profile: (token, body) => request("/api/v1/money/profile", { method: "POST", token, body }),
    invoices: {
      clients: (token, q) => request(`/api/v1/money/invoices/clients${qs({ q })}`, { token }),
      list: (token) => request("/api/v1/money/invoices", { token }),
      create: (token, body) => request("/api/v1/money/invoices", { method: "POST", token, body }),
      view: (token, code, payOp = "") => request(`/api/v1/money/invoices/${encodeURIComponent(code)}${payOp ? `?pay_op=${encodeURIComponent(payOp)}` : ""}`, { token }),
      pay: (token, code, body) => request(`/api/v1/money/invoices/${encodeURIComponent(code)}/pay`, { method: "POST", token, body }),
      cancel: (token, code) => request(`/api/v1/money/invoices/${encodeURIComponent(code)}/cancel`, { method: "POST", token }),
    },
    earnings: (token) => request("/api/v1/money/earnings", { token }),
    declineRequest: (token, code) => request(`/api/v1/money/requests/${encodeURIComponent(code)}/decline`, { method: "POST", token }),
    agent: {
      me: (token) => request("/api/v1/money/agent/me", { token }),
      transactions: (token, params = {}) => request(`/api/v1/money/agent/transactions${qs(params)}`, { token }),
      review: (token, code, body) => request(`/api/v1/money/agent/transactions/${code}/review`, { method: "POST", token, body }),
      flag: (token, code, body) => request(`/api/v1/money/agent/transactions/${code}/flag`, { method: "POST", token, body }),
      setRate: (token, body) => request("/api/v1/money/agent/rate", { method: "PUT", token, body }),
      corridorRates: (token) => request("/api/v1/money/agent/corridor-rates", { token }),
      setCorridorRate: (token, body) => request("/api/v1/money/agent/corridor-rates", { method: "PUT", token, body }),
    },
    admin: {
      overview: (token, days = 30) => request(`/api/v1/money/admin/overview${qs({ days })}`, { token }),
      transactions: (token, params = {}) => request(`/api/v1/money/admin/transactions${qs(params)}`, { token }),
      agents: (token) => request("/api/v1/money/admin/agents", { token }),
      assign: (token, body) => request("/api/v1/money/admin/agents", { method: "POST", token, body }),
      remove: (token, id) => request(`/api/v1/money/admin/agents/${id}`, { method: "DELETE", token }),
      audit: (token) => request("/api/v1/money/admin/audit", { token }),
      review: (token, code, body) => request(`/api/v1/money/admin/transactions/${code}/review`, { method: "POST", token, body }),
      corridorRates: (token) => request("/api/v1/money/admin/corridor-rates", { token }),
      setCorridorRate: (token, body) => request("/api/v1/money/admin/corridor-rates", { method: "PUT", token, body }),
      operators: (token) => request("/api/v1/money/admin/operators", { token }),
      setOperator: (token, body) => request("/api/v1/money/admin/operators", { method: "PUT", token, body }),
      settings: (token) => request("/api/v1/money/admin/settings", { token }),
      saveSettings: (token, body) => request("/api/v1/money/admin/settings", { method: "PUT", token, body }),
    },
  },

  // Espaces publicitaires (H-Company + partenaires ayant débloqué la promotion)
  promos: {
    serve: (placement = "app_home", limit = 3) => request(`/api/v1/promos${qs({ placement, limit })}`),
    seen: (id) => request(`/api/v1/promos/${id}/impression`, { method: "POST" }).catch(() => {}),
    clicked: (id) => request(`/api/v1/promos/${id}/click`, { method: "POST" }).catch(() => {}),
    mine: (token) => request("/api/v1/promos/mine", { token }),
    create: (token, body) => request("/api/v1/promos/mine", { method: "POST", token, body }),
    update: (token, id, body) => request(`/api/v1/promos/mine/${id}`, { method: "PUT", token, body }),
    pause: (token, id, paused) => request(`/api/v1/promos/mine/${id}`, { method: "PATCH", token, body: { paused } }),
    remove: (token, id) => request(`/api/v1/promos/mine/${id}`, { method: "DELETE", token }),
    admin: {
      list: (token, status) => request(`/api/v1/promos/admin/all${qs({ status })}`, { token }),
      create: (token, body) => request("/api/v1/promos/admin", { method: "POST", token, body }),
      decide: (token, id, status, reason = "") => request(`/api/v1/promos/admin/${id}`, { method: "PATCH", token, body: { status, reason } }),
      remove: (token, id) => request(`/api/v1/promos/admin/${id}`, { method: "DELETE", token }),
    },
  },

  // Pays, taux de change, bénéficiaires (services hors frontières)
  geo: {
    countries: () => request("/api/v1/geo/countries"),
    rates: () => request("/api/v1/geo/rates"),
    admin: {
      overview: (token) => request("/api/v1/geo/admin/overview", { token }),
      setRate: (token, cur, body) => request(`/api/v1/geo/admin/rates/${cur}`, { method: "PUT", token, body }),
      setCountry: (token, code, body) => request(`/api/v1/geo/admin/countries/${code}`, { method: "PUT", token, body }),
    },
  },

  // Connexion par QR code (façon WhatsApp Web)
  qr: {
    start: (deviceLabel) => request("/api/v1/qr/sessions", { method: "POST", body: { device_label: deviceLabel || "" } }),
    poll: (code, secret) => request(`/api/v1/qr/sessions/${encodeURIComponent(code)}/poll`, { method: "POST", body: { secret } }),
    info: (token, code) => request(`/api/v1/qr/sessions/${encodeURIComponent(code)}`, { token }),
    approve: (token, code) => request(`/api/v1/qr/sessions/${encodeURIComponent(code)}/approve`, { method: "POST", token }),
  },

  // Plateforme e-learning H-learning
  learning: {
    courses: () => request("/api/v1/learning/courses"),
  },

  // Espace admin — gestion des candidatures partenaires et de leurs contrats
  admin: {
    listApplications: (token) => request("/api/v1/partners/admin", { token }),
    getApplication: (token, id) => request(`/api/v1/partners/admin/${id}`, { token }),
    updateStatus: (token, id, status) =>
      request(`/api/v1/partners/admin/${id}/status`, { method: "PATCH", token, body: { status } }),
    updateAccountStatus: (token, id, status) =>
      request(`/api/v1/partners/admin/${id}/account-status`, { method: "PATCH", token, body: { status } }),
    getContract: (token, id) => request(`/api/v1/partners/admin/${id}/contract`, { token }),
    updateContract: (token, id, content) =>
      request(`/api/v1/partners/admin/${id}/contract`, { method: "PATCH", token, body: { content } }),
    listOffers: (token, id) => request(`/api/v1/partners/admin/${id}/offers`, { token }),
    createOffer: (token, id, payload) =>
      request(`/api/v1/partners/admin/${id}/offers`, { method: "POST", token, body: payload }),
    pendingApps: (token) => request("/api/v1/partners/admin/apps/pending", { token }),
    listPartnerApps: (token, applicationId) =>
      request(`/api/v1/partners/admin/${applicationId}/apps`, { token }),
    updateAppStatus: (token, appId, appStatus) =>
      request(`/api/v1/partners/admin/apps/${appId}/status`, { method: "PATCH", token, body: { status: appStatus } }),
    addRevenue: (token, appId, payload) =>
      request(`/api/v1/partners/admin/apps/${appId}/revenue`, { method: "POST", token, body: payload }),
    listPayments: (token) => request("/api/v1/partners/admin/payments", { token }),
    listContactMessages: (token) => request("/api/v1/contact/admin", { token }),
    replyToContact: (token, id, admin_reply) =>
      request(`/api/v1/contact/admin/${id}`, { method: "PATCH", token, body: { admin_reply } }),
    pendingSubscriptions: (token) => request("/api/v1/services/admin/pending", { token }),
    listSubscriptions: (token) => request("/api/v1/services/admin", { token }),
    updateSubscriptionStatus: (token, id, status, adminNote) =>
      request(`/api/v1/services/admin/${id}/status`, {
        method: "PATCH",
        token,
        body: { status, admin_note: adminNote || null },
      }),
    // Catalogue des services (libellés FR/EN, description, logo, activation)
    listServiceCatalog: (token) => request("/api/v1/services/admin/catalog", { token }),
    createServiceCatalogItem: (token, payload) =>
      request("/api/v1/services/admin/catalog", { method: "POST", token, body: payload }),
    updateServiceCatalogItem: (token, id, payload) =>
      request(`/api/v1/services/admin/catalog/${id}`, { method: "PATCH", token, body: payload }),
    deleteServiceCatalogItem: (token, id) =>
      request(`/api/v1/services/admin/catalog/${id}`, { method: "DELETE", token }),
    uploadServiceCatalogLogo: (token, id, file) => {
      const form = new FormData();
      form.append("file", file);
      return request(`/api/v1/services/admin/catalog/${id}/logo`, { method: "POST", token, body: form });
    },
    searchUsers: (token, q) =>
      request(`/api/v1/notifications/admin/users/search?q=${encodeURIComponent(q || "")}`, { token }),
    listAgents: (token) => request("/api/v1/partners/admin/agents", { token }),
    setUserRole: (token, userId, role) =>
      request(`/api/v1/partners/admin/users/${userId}/role`, { method: "PATCH", token, body: { role } }),
    sendNotification: (token, payload) =>
      request("/api/v1/notifications/admin/send", { method: "POST", token, body: payload }),
    listCourses: (token) => request("/api/v1/learning/admin/courses", { token }),
    createCourse: (token, body) => request("/api/v1/learning/admin/courses", { method: "POST", token, body }),
    updateCourse: (token, id, body) => request(`/api/v1/learning/admin/courses/${id}`, { method: "PUT", token, body }),
    deleteCourse: (token, id) => request(`/api/v1/learning/admin/courses/${id}`, { method: "DELETE", token }),
    syncCourse: (token, id) => request(`/api/v1/learning/admin/courses/${id}/sync`, { method: "POST", token }),
    listLessons: (token, id) => request(`/api/v1/learning/admin/courses/${id}/lessons`, { token }),
    addLesson: (token, id, body) => request(`/api/v1/learning/admin/courses/${id}/lessons`, { method: "POST", token, body }),
    deleteLesson: (token, id) => request(`/api/v1/learning/admin/lessons/${id}`, { method: "DELETE", token }),
    updateLesson: (token, id, body) =>
      request(`/api/v1/learning/admin/lessons/${id}`, { method: "PATCH", token, body }),
    listPlans: (token) => request("/api/v1/learning/admin/plans", { token }),
    createPlan: (token, body) => request("/api/v1/learning/admin/plans", { method: "POST", token, body }),
    updatePlan: (token, id, body) => request(`/api/v1/learning/admin/plans/${id}`, { method: "PUT", token, body }),
    deletePlan: (token, id) => request(`/api/v1/learning/admin/plans/${id}`, { method: "DELETE", token }),
    listCurrencies: (token) => request("/api/v1/learning/admin/currencies", { token }),
    saveCurrencies: (token, currencies) =>
      request("/api/v1/learning/admin/currencies", { method: "PUT", token, body: { currencies } }),
    listSubscriptions: (token, status) =>
      request(`/api/v1/learning/admin/subscriptions${status ? `?status=${status}` : ""}`, { token }),
    createSubscription: (token, body) =>
      request("/api/v1/learning/admin/subscriptions", { method: "POST", token, body }),
    updateSubscriptionStatus: (token, id, status) =>
      request(`/api/v1/learning/admin/subscriptions/${id}/status`, { method: "PATCH", token, body: { status } }),
    listRegistrations: (token) => request("/api/v1/learning/admin/registrations", { token }),
    updateRegistrationStatus: (token, id, statusValue) =>
      request(`/api/v1/learning/admin/registrations/${id}/status`, { method: "PATCH", token, body: { status: statusValue } }),
    listCompanyEnrollments: (token) => request("/api/v1/learning/admin/company-enrollments", { token }),
    updateCompanyEnrollmentStatus: (token, id, statusValue) =>
      request(`/api/v1/learning/admin/company-enrollments/${id}/status`, {
        method: "PATCH",
        token,
        body: { status: statusValue },
      }),
  },

  // Espace agent — revue KYC des candidatures partenaires avant confirmation admin
  agent: {
    queue: (token) => request("/api/v1/partners/agent/queue", { token }),
    history: (token) => request("/api/v1/partners/agent/history", { token }),
    getApplication: (token, id) => request(`/api/v1/partners/agent/${id}`, { token }),
    review: (token, id, decision, note) =>
      request(`/api/v1/partners/agent/${id}/review`, { method: "PATCH", token, body: { decision, note: note || null } }),
    // Le document ne peut pas être chargé via une simple balise <img src="">
    // (il exige un en-tête Authorization) — on le récupère en blob puis on
    // construit une URL objet locale pour l'afficher/télécharger.
    documentBlobUrl: async (token, id) => {
      const res = await fetch(`${BASE_URL}/api/v1/partners/agent/${id}/document`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new ApiError("Document introuvable.", res.status, null);
      const blob = await res.blob();
      return { url: URL.createObjectURL(blob), contentType: blob.type };
    },
  },

  // Notifications de l'utilisateur connecté (cloche navbar)
  notifications: {
    mine: (token) => request("/api/v1/notifications/me", { token }),
    markRead: (token, id) => request(`/api/v1/notifications/me/${id}/read`, { method: "POST", token }),
    markAllRead: (token) => request("/api/v1/notifications/me/read-all", { method: "POST", token }),
  },

  // Mes demandes (contact) — utilisateur connecté
  contactMessages: {
    mine: (token) => request("/api/v1/contact/me", { token }),
  },

  // H-Learning — cours (vidéos YouTube gratuites), progression, inscription
  // au présentiel et formation d'équipe (entreprise)
  learning: {
    courses: () => request("/api/v1/learning/courses"),
    // Avec un jeton, le serveur sait si le compte a un bouquet actif et
    // débloque les leçons exclusives.
    course: (id, token) => request(`/api/v1/learning/courses/${id}`, { token }),
    plans: () => request("/api/v1/learning/plans"),
    checkout: (token, payload) => request("/api/v1/learning/checkout", { method: "POST", token, body: payload }),
    mySubscription: (token) => request("/api/v1/learning/me/subscription", { token }),
    addMember: (token, subId, email) =>
      request(`/api/v1/learning/me/subscription/${subId}/members`, { method: "POST", token, body: { email } }),
    removeMember: (token, subId, memberId) =>
      request(`/api/v1/learning/me/subscription/${subId}/members/${memberId}`, { method: "DELETE", token }),
    myProgress: (token, courseId) =>
      request(`/api/v1/learning/me/progress${courseId ? `?course_id=${courseId}` : ""}`, { token }),
    saveProgress: (token, lessonId, body) =>
      request(`/api/v1/learning/lessons/${lessonId}/progress`, { method: "PUT", token, body }),
    register: (payload, token) =>
      request("/api/v1/learning/registrations", { method: "POST", body: payload, token }),
    myRegistrations: (token) => request("/api/v1/learning/me/registrations", { token }),
    enrollCompany: (payload) =>
      request("/api/v1/learning/company-enrollment", { method: "POST", body: payload }),
  },

  // Onboarding après première connexion
  onboarding: {
    get: (token) => request("/api/v1/onboarding/me", { token }),
    submit: (token, payload) => request("/api/v1/onboarding/me", { method: "POST", token, body: payload }),
  },

  // Produits/services proposés sur la marketplace
  products: {
    list: () => request("/api/v1/products"),
  },

  // Abonnements des clients aux services H-Company (H-Transport, H-Restaurant,
  // H-Learning, H-Money, H-Translate, H-Shopping...) — distinct de
  // `partners.myApps`, qui concerne les partenaires exploitant un service.
  services: {
    catalog: () => request("/api/v1/services/catalog"),
    mine: (token) => request("/api/v1/services/me", { token }),
    request: (token, serviceKey, message) =>
      request("/api/v1/services/me", {
        method: "POST",
        token,
        body: { service_key: serviceKey, message: message || null },
      }),
  },

  // Formulaire de contact / prise de contact générale
  contact: {
    send: (payload) =>
      request("/api/v1/contact", { method: "POST", body: payload }),
  },
};

export { ApiError, NetworkError };
