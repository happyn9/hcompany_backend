import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { User, Mail, Lock, ArrowRight, Users } from "lucide-react";
import AuthLayout from "../../components/auth/AuthLayout.jsx";
import LockoutNotice from "../../components/auth/LockoutNotice.jsx";
import GoogleButton from "../../components/auth/GoogleButton.jsx";
import SlowHint from "../../components/auth/SlowHint.jsx";
import { startOtp } from "../../lib/otpTracker.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api, ApiError } from "../../lib/api.js";

export default function Register() {
  const { t } = useLanguage();
  const { signUp } = useUser();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signUp(name, email, password);
    } catch (err) {
      // L'inscription elle-même a échoué (e-mail déjà utilisé, etc.) —
      // rien de créé, on reste sur ce formulaire avec l'erreur.
      if (err instanceof ApiError && err.status === 429) setLocked(true);
      else setError(err?.data?.detail || "Une erreur est survenue.");
      setLoading(false);
      return;
    }

    // Le compte existe : on part tout de suite sur l'écran du code. L'envoi
    // de l'e-mail continue en arrière-plan (état et bouton « Réessayer »
    // sur l'écran suivant) au lieu de rallonger l'attente ici.
    startOtp(email.trim(), "register");
    navigate("/verifier", { state: { email: email.trim(), purpose: "register" } });
  }

  // Réveille le serveur pendant que la personne remplit le formulaire.
  useEffect(() => {
    api.auth.warmup();
  }, []);

  return (
    <AuthLayout
      visual={
        <div className="text-center max-w-xs">
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-6">
            <Users className="text-[#C89A3D]" size={28} />
          </div>
          <h2 className="font-display italic text-2xl text-cream-fixed mb-3">{t("partners.heading")}</h2>
          <p className="text-cream-fixed/60 text-sm leading-relaxed">{t("partners.lead")}</p>
        </div>
      }
    >
      {locked ? (
        <LockoutNotice onExpire={() => setLocked(false)} />
      ) : (
        <>
          <h1 className="font-display text-2xl text-ink mb-2">{t("auth.signupTitle")}</h1>
          <p className="text-sm text-stone mb-8">
            {t("auth.alreadyRegistered")}{" "}
            <Link to="/connexion" className="text-coffee-dark font-medium hover:underline">
              {t("auth.signin")}
            </Link>
          </p>

          <GoogleButton />
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-line" />
            <span className="text-xs text-ink-faint">{t("auth.orDivider")}</span>
            <div className="flex-1 h-px bg-line" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                required
                autoFocus
                placeholder={t("auth.namePh")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-line rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-coffee-light transition-colors"
              />
            </div>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                type="email"
                required
                placeholder={t("auth.emailPh")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-line rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-coffee-light transition-colors"
              />
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                type="password"
                required
                minLength={8}
                placeholder={t("auth.passwordPh")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-line rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-coffee-light transition-colors"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <SlowHint active={loading} />
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-ink text-cream text-sm font-medium py-3.5 hover:bg-coffee-dark transition-colors disabled:opacity-60"
            >
              {loading ? t("auth.sending") : t("auth.createAccount")}
              {!loading && <ArrowRight size={15} />}
            </button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
