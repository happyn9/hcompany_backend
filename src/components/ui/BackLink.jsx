import { Link, useNavigate } from "react-router-dom";
import { navTracker } from "./ScrollToTop.jsx";

/**
 * Retour "intelligent" : si la page précédente de l'historique est bien la
 * page vers laquelle ce lien pointe (ex: on vient de /#services et le lien
 * dit "Retour aux services"), on fait exactement comme le bouton Retour du
 * navigateur — ce qui ramène à la section d'origine, à la bonne hauteur de
 * défilement (voir ScrollToTop). Sinon (page ouverte directement par un
 * lien, ou parcours détourné), on va simplement à `fallback`, et son ancre
 * (#services...) est rejointe automatiquement.
 */
export function useSmartBack(fallback = "/") {
  const navigate = useNavigate();
  return (e) => {
    e?.preventDefault?.();
    const idx = window.history.state?.idx;
    const targetPath = (typeof fallback === "string" ? fallback : fallback?.pathname || "/").split("#")[0] || "/";
    if (typeof idx === "number" && idx > 0 && navTracker.prevPath === targetPath) navigate(-1);
    else navigate(fallback);
  };
}

export default function BackLink({ to = "/", className = "", children }) {
  const goBack = useSmartBack(to);
  return (
    <Link to={to} onClick={goBack} className={className}>
      {children}
    </Link>
  );
}
