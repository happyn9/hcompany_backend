import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useLocation, matchPath } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext.jsx";

// Associe chaque route à sa clé dans translations.js -> meta.<clé>. Les
// pages "détail" (service, cours, partenaire…) affichent d'abord ce
// libellé générique, puis le précisent avec le vrai nom de l'élément dès
// qu'il est chargé, via usePageMeta() ci-dessous.
const ROUTE_META = [
  { pattern: "/", key: "home" },
  { pattern: "/dashboard", key: "dashboard" },
  { pattern: "/settings", key: "settings" },
  { pattern: "/admin", key: "admin" },
  { pattern: "/agent", key: "agent" },
  { pattern: "/services/:slug", key: "services" },
  { pattern: "/h/:slug", key: "services" },
  { pattern: "/cours/:id", key: "cours" },
  { pattern: "/formations", key: "formations" },
  { pattern: "/formations/inscription", key: "inscriptionFormation" },
  { pattern: "/formations/bouquets", key: "bouquetsFormation" },
  { pattern: "/formations/bouquets/:code/paiement", key: "paiementBouquet" },
  { pattern: "/formations/mon-bouquet", key: "monBouquet" },
  { pattern: "/formations/:id", key: "cours" },
  { pattern: "/formations/:id/regarder/:lessonId", key: "cours" },
  { pattern: "/partenaires/:slug", key: "partenaires" },
  { pattern: "/connexion", key: "connexion" },
  { pattern: "/creer-un-compte", key: "creerCompte" },
  { pattern: "/verifier", key: "verifier" },
  { pattern: "/mot-de-passe-oublie", key: "motDePasseOublie" },
  { pattern: "/nouveau-mot-de-passe", key: "nouveauMotDePasse" },
  { pattern: "/paiement/:offerId", key: "paiement" },
  { pattern: "/formation-equipe", key: "formationEquipe" },
  { pattern: "/interpretation", key: "interpretation" },
  { pattern: "/shopping", key: "shopping" },
  { pattern: "/shopping/produits", key: "shoppingProduits" },
  { pattern: "/shopping/produit/:id", key: "shoppingProduit" },
  { pattern: "/shopping/boutique/:slug", key: "shoppingBoutique" },
  { pattern: "/shopping/panier", key: "shoppingPanier" },
  { pattern: "/shopping/commande", key: "shoppingCommande" },
  { pattern: "/shopping/mes-commandes", key: "shoppingCommandes" },
  { pattern: "/shopping/mes-commandes/:code", key: "shoppingCommandes" },
  { pattern: "/shopping/suivi", key: "shoppingSuivi" },
  { pattern: "/shopping/favoris", key: "shoppingFavoris" },
  { pattern: "/shopping/vendre", key: "shoppingVendre" },
  { pattern: "/shopping/vendeur", key: "shoppingVendeur" },
  { pattern: "/shopping/vendeur/produit/:id", key: "shoppingVendeur" },
  { pattern: "/shopping/agence", key: "shoppingAgence" },
  { pattern: "/transport", key: "transport" },
  { pattern: "/transport/recherche", key: "transportRecherche" },
  { pattern: "/transport/trajet/:id", key: "transportTrajet" },
  { pattern: "/transport/reserver/:id", key: "transportReserver" },
  { pattern: "/transport/mes-billets", key: "transportBillets" },
  { pattern: "/transport/mes-billets/:code", key: "transportBillets" },
  { pattern: "/transport/agence", key: "transportAgence" },
  { pattern: "/logement", key: "logement" },
  { pattern: "/logement/recherche", key: "logementRecherche" },
  { pattern: "/logement/s/:slug", key: "logementFiche" },
  { pattern: "/logement/reserver/:slug", key: "logementReserver" },
  { pattern: "/logement/mes-sejours", key: "logementSejours" },
  { pattern: "/logement/mes-sejours/:code", key: "logementSejours" },
  { pattern: "/logement/favoris", key: "logementFavoris" },
  { pattern: "/logement/hote-profil/:id", key: "logementHote" },
  { pattern: "/logement/hote", key: "logementHeberger" },
  { pattern: "/logement/hote/logement/:id", key: "logementHeberger" },
  { pattern: "/bienvenue", key: "bienvenue" },
  { pattern: "/confidentialite", key: "confidentialite" },
  { pattern: "/conditions", key: "conditions" },
];

function routeKeyFor(pathname) {
  const hit = ROUTE_META.find((r) => matchPath({ path: r.pattern, end: true }, pathname));
  return hit?.key || "notFound";
}

function upsertMeta(attr, value, content) {
  if (!content) return;
  let el = document.querySelector(`meta[${attr}="${value}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, value);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

const MetaOverrideContext = createContext(null);

/**
 * Fournit le contexte de surcharge du <head> et applique, à chaque
 * changement de route ou de langue, le titre / la description / les
 * balises Open Graph correspondant à la section visitée — voir
 * ROUTE_META et translations.js -> meta.*. À placer une fois, à
 * l'intérieur du <BrowserRouter> (voir App.jsx).
 */
export function HeadManager({ children }) {
  const location = useLocation();
  const { lang, t } = useLanguage();
  const [override, setOverrideState] = useState(null);

  // Une page détail (ServiceDetail, CourseDetail…) précise le titre une
  // fois ses données chargées ; on efface cette surcharge dès qu'on
  // change de route pour ne pas la laisser fuiter sur la page suivante.
  useEffect(() => {
    setOverrideState(null);
  }, [location.pathname]);

  const setOverride = useCallback((partial) => {
    setOverrideState((prev) => ({ ...prev, ...partial }));
  }, []);
  const clearOverride = useCallback(() => setOverrideState(null), []);

  useEffect(() => {
    const key = routeKeyFor(location.pathname);
    const fallback = t(`meta.${key}`);
    const base =
      fallback && typeof fallback === "object"
        ? fallback
        : { title: t("meta.home.title"), description: t("meta.home.description") };

    const title = override?.title || base.title;
    const description = override?.description || base.description;
    const suffix = t("meta.suffix");
    const fullTitle = key === "home" && !override?.title ? title : `${title}${suffix}`;

    document.title = fullTitle;
    document.documentElement.lang = lang;

    upsertMeta("name", "description", description);
    upsertMeta("property", "og:title", fullTitle);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:site_name", "H-Company");
    upsertMeta("property", "og:url", window.location.href);
    upsertMeta("property", "og:locale", lang === "fr" ? "fr_FR" : "en_US");
    upsertMeta("name", "twitter:card", "summary");
    upsertMeta("name", "twitter:title", fullTitle);
    upsertMeta("name", "twitter:description", description);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", window.location.href);
  }, [location.pathname, lang, override, t]);

  // Valeur mémorisée : un objet recréé à chaque rendu relançait l'effet de
  // usePageMeta en boucle (cleanup → setOverride → rendu → nouvel objet…),
  // ce qui empêchait React de terminer les changements de page.
  const ctxValue = useMemo(() => ({ setOverride, clearOverride }), [setOverride, clearOverride]);
  return <MetaOverrideContext.Provider value={ctxValue}>{children}</MetaOverrideContext.Provider>;
}

/**
 * À appeler depuis une page "détail" une fois l'élément chargé, pour
 * remplacer le titre générique de la section par le vrai nom (ex : le
 * titre du cours plutôt que "Formation H-Learning"). Se nettoie tout
 * seul au démontage / changement de route.
 *
 * usePageMeta(item ? { title: item.name, description: item.description } : null)
 */
export function usePageMeta(meta) {
  const ctx = useContext(MetaOverrideContext);
  const title = meta?.title;
  const description = meta?.description;

  useEffect(() => {
    if (!ctx || (!title && !description)) return undefined;
    ctx.setOverride({ title, description });
    return () => ctx.clearOverride();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, title, description]);
}
