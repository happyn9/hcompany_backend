import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, ArrowRight, ShieldCheck } from "lucide-react";
import AuthLayout from "../../components/auth/AuthLayout.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";

export default function NewPassword() {
  const { t } = useLanguage();
  const { resetPassword, isAuthenticated, isLoading } = useUser();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate("/mot-de-passe-oublie");
  }, [isLoading, isAuthenticated, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t("settings.passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      await resetPassword(password);
      setDone(true);
      setTimeout(() => navigate("/"), 2000);
    } catch (err) {
      setError(err?.data?.detail || "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      visual={
        <div className="text-center max-w-xs">
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-6">
            <ShieldCheck className="text-[#C89A3D]" size={28} />
          </div>
          <h2 className="font-display italic text-2xl text-cream-fixed mb-3">{t("auth.resetSubmit")}</h2>
        </div>
      }
    >
      {done ? (
        <div className="text-center py-8">
          <div className="w-14 h-14 rounded-full bg-[#C89A3D]/15 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="text-coffee-dark" size={26} />
          </div>
          <p className="text-ink font-medium">{t("auth.resetSuccess")}</p>
        </div>
      ) : (
        <>
          <h1 className="font-display text-2xl text-ink mb-2">{t("auth.newPasswordLabel")}</h1>
          <p className="text-sm text-stone mb-8">{t("auth.resetSubmit")}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                type="password"
                required
                minLength={8}
                autoFocus
                placeholder={t("auth.newPasswordLabel")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-line rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-coffee-light transition-colors"
              />
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                type="password"
                required
                minLength={8}
                placeholder={t("settings.confirmPassword")}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full border border-line rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-coffee-light transition-colors"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-ink text-cream text-sm font-medium py-3.5 hover:bg-coffee-dark transition-colors disabled:opacity-60"
            >
              {loading ? t("settings.saving") : t("auth.resetSubmit")}
              {!loading && <ArrowRight size={15} />}
            </button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
