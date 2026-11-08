import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { KeyRound, Mail, ArrowRight, ArrowLeft } from "lucide-react";
import AuthLayout from "../../components/auth/AuthLayout.jsx";
import LockoutNotice from "../../components/auth/LockoutNotice.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api, ApiError } from "../../lib/api.js";

export default function ForgotPassword() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.auth.requestOtp(email, "email", "reset_password");
      navigate("/verifier", { state: { email, purpose: "reset_password" } });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setLocked(true);
      else setError(err?.data?.detail || "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      visual={
        <div className="text-center max-w-xs">
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-6">
            <KeyRound className="text-[#C89A3D]" size={28} />
          </div>
          <h2 className="font-display italic text-2xl text-cream-fixed mb-3">{t("auth.forgotTitle")}</h2>
          <p className="text-cream-fixed/60 text-sm leading-relaxed">{t("auth.forgotLead")}</p>
        </div>
      }
    >
      {locked ? (
        <LockoutNotice onExpire={() => setLocked(false)} />
      ) : (
        <>
          <Link to="/connexion" className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink mb-6 transition-colors">
            <ArrowLeft size={13} />
            {t("auth.backToSignin")}
          </Link>
          <h1 className="font-display text-2xl text-ink mb-2">{t("auth.forgotTitle")}</h1>
          <p className="text-sm text-stone mb-8">{t("auth.forgotLead")}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                type="email"
                required
                autoFocus
                placeholder={t("auth.emailPh")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-line rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-coffee-light transition-colors"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-ink text-cream text-sm font-medium py-3.5 hover:bg-coffee-dark transition-colors disabled:opacity-60"
            >
              {loading ? t("auth.sending") : t("auth.receiveCode")}
              {!loading && <ArrowRight size={15} />}
            </button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
