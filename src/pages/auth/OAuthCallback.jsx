import { afterLogin } from "../../lib/home.js";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";

/**
 * Page de retour après connexion Google — le service d'authentification
 * commune redirige ici avec les jetons dans le fragment d'URL (#...),
 * jamais dans la query string, pour ne pas finir dans des journaux de
 * serveur. On les récupère, on finalise côté H-Company (pose du cookie de
 * rafraîchissement), puis on redirige.
 */
export default function OAuthCallback() {
  const { completeOAuth } = useUser();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return; // évite un double appel en StrictMode
    ranRef.current = true;

    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const isNewAccount = params.get("new_account") === "1";

    if (!accessToken || !refreshToken) {
      setError("Connexion Google incomplète.");
      return;
    }

    completeOAuth(accessToken, refreshToken)
      .then((d) => {
        navigate(isNewAccount ? "/bienvenue" : afterLogin("/", d?.user), { replace: true });
      })
      .catch(() => setError("Impossible de finaliser la connexion Google."));
  }, [completeOAuth, navigate]);

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-6 text-center">
      {error ? (
        <>
          <p className="text-ink font-medium mb-3">{error}</p>
          <button
            onClick={() => navigate("/connexion")}
            className="text-sm text-coffee-dark underline underline-offset-4"
          >
            {t("auth.backToSignin")}
          </button>
        </>
      ) : (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-line border-t-coffee-dark rounded-full"
        />
      )}
    </div>
  );
}
