import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useUser } from "../../context/Usercontext.jsx";

/** Retour intelligent : revient à la page précédente de l'app ; si on est arrivé directement (lien, favori), va vers `fallback`. */
export default function BackButton({ fallback = "/", label, className = "", compact = false, tone = "dark" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useLanguage();
  const text = label || (lang === "en" ? "Back" : "Retour");
  const go = () => {
    // history.state.idx > 0 : il existe une page précédente dans cette session (React Router)
    const idx = window.history.state?.idx ?? 0;
    if (idx > 0) navigate(-1); else navigate(fallback, { replace: true, state: { from: location.pathname } });
  };
  const color = tone === "light" ? "text-white/90 hover:bg-white/10 border-white/25" : "text-ink hover:bg-latte-soft border-line";
  return (
    <button type="button" onClick={go} aria-label={text} title={text}
      className={`inline-flex items-center gap-1.5 rounded-full border bg-transparent transition-colors ${compact ? "w-9 h-9 justify-center" : "px-3.5 py-2 text-sm"} ${color} ${className}`}>
      <ArrowLeft size={16} />{!compact && <span>{text}</span>}
    </button>
  );
}

/** Barre de retour discrète en haut du contenu d'un service. Sur la page d'accueil du service, le retour mène à « Mon espace ». */
export function PageBack({ root }) {
  const { pathname } = useLocation();
  const { isAuthenticated } = useUserSafe();
  const atRoot = pathname === root;
  if (atRoot && !isAuthenticated) return null;
  return <div className="mb-4 print:hidden"><BackButton fallback={atRoot ? "/app" : root} label={atRoot ? (document.documentElement.lang === "en" ? "My space" : "Mon espace") : undefined} /></div>;
}
function useUserSafe() { try { return useUser(); } catch { return {}; } }
