import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Copy, Check } from "lucide-react";
import { useUser } from "../context/Usercontext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { api } from "../lib/api.js";
import DashboardSidebar from "../components/dashboard/DashboardSidebar.jsx";
import { Skeleton } from "../components/ui/Skeleton.jsx";

// Masque tout sauf les 2 premiers et 2 derniers caractères — le code reste
// copiable en un clic (le presse-papiers reçoit toujours la vraie valeur),
// mais un simple coup d'œil ou une capture d'écran ne suffit plus à le lire.
function maskCode(code) {
  if (!code) return "";
  if (code.length <= 5) return "•".repeat(code.length);
  return `${code.slice(0, 3)}${"•".repeat(Math.max(4, code.length - 5))}${code.slice(-2)}`;
}

const STATUS_TONE = {
  active: "bg-[#F1EAE0] text-coffee-dark border-coffee-light",
  disabled: "bg-amber-50 text-amber-700 border-amber-200",
  blocked: "bg-red-50 text-red-700 border-red-200",
};

export default function Settings() {
  const { user, isAuthenticated, isLoading, withAuth, signOut } = useUser();
  const { t } = useLanguage();
  const toast = useToast();

  const [account, setAccount] = useState(null);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [codeRevealed, setCodeRevealed] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    withAuth((token) => api.partners.accountStatus(token))
      .then(setAccount)
      .catch(() => setAccount(null))
      .finally(() => setLoadingAccount(false));
  }, [isLoading, isAuthenticated, withAuth]);

  async function handleCopyCode() {
    if (!account?.partner_code) return;
    try {
      await navigator.clipboard.writeText(account.partner_code);
      setCodeCopied(true);
      toast.success(t("settings.codeCopied"));
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      toast.error(t("settings.codeCopyError"));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError(t("settings.passwordMismatch"));
      return;
    }

    setSaving(true);
    try {
      await withAuth((token) => api.auth.changePassword(token, currentPassword, newPassword));
      toast.success(t("settings.passwordUpdated"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err?.data?.detail || t("settings.passwordMismatch"));
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return <div className="min-h-screen bg-cream" />;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-ink text-lg font-medium">
          {t("nav.signin")}
        </p>
        <Link to="/" className="text-sm underline underline-offset-4 text-ink-soft">
          H-Company
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream md:flex">
      <DashboardSidebar user={user} onSignOut={signOut} active="settings" onSelect={() => {}} />

      <div className="flex-1 min-w-0">
        <main className="px-5 md:px-10 py-8 md:py-10 max-w-2xl">
          <h1 className="font-display text-2xl md:text-3xl text-ink mb-8">{t("settings.title")}</h1>

          {/* --- Compte : code partenaire + statut + essai --- */}
          <section className="bg-surface border border-line rounded-2xl p-6 mb-6">
            <h2 className="font-medium text-ink mb-4">{t("settings.accountSection")}</h2>

            {loadingAccount ? (
              <Skeleton className="h-16 w-full" />
            ) : account ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-xs text-ink-faint uppercase tracking-wide mb-1">{t("settings.partnerCode")}</p>
                    {account.partner_code ? (
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-lg text-ink select-none">
                          {codeRevealed ? account.partner_code : maskCode(account.partner_code)}
                        </p>
                        <button
                          type="button"
                          onClick={() => setCodeRevealed((v) => !v)}
                          title={codeRevealed ? t("settings.codeHide") : t("settings.codeReveal")}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-soft hover:bg-line/50 hover:text-ink transition-colors"
                        >
                          {codeRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={handleCopyCode}
                          title={t("settings.codeCopy")}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-soft hover:bg-line/50 hover:text-ink transition-colors"
                        >
                          {codeCopied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                        </button>
                      </div>
                    ) : (
                      <p className="font-mono text-lg text-ink"> : </p>
                    )}
                    <p className="text-xs text-ink-soft mt-1 max-w-sm">{t("settings.partnerCodeHint")}</p>
                  </div>
                  <span className={`text-xs font-medium px-3 py-1.5 rounded-full border ${STATUS_TONE[account.account_status]}`}>
                    {t(`account.status${account.account_status[0].toUpperCase()}${account.account_status.slice(1)}`)}
                  </span>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-line">
                  <div>
                    <p className="text-xs text-ink-faint uppercase tracking-wide mb-1">{t("settings.infoName")}</p>
                    <p className="text-sm text-ink">{account.full_name || " : "}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-faint uppercase tracking-wide mb-1">{t("settings.infoEmail")}</p>
                    <p className="text-sm text-ink">{account.email || " : "}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-faint uppercase tracking-wide mb-1">{t("settings.infoPhone")}</p>
                    <p className="text-sm text-ink">{account.phone || " : "}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-faint uppercase tracking-wide mb-1">{t("settings.infoMemberSince")}</p>
                    <p className="text-sm text-ink">
                      {account.member_since
                        ? new Date(account.member_since).toLocaleDateString()
                        : " : "}
                    </p>
                  </div>
                </div>

                {account.trial_days_left !== null && account.trial_days_left !== undefined && (
                  <div className="pt-4 border-t border-line">
                    <p className="text-xs text-ink-faint uppercase tracking-wide mb-1">{t("account.trialLabel")}</p>
                    <p className="text-sm text-ink">
                      {account.trial_days_left > 0
                        ? `${account.trial_days_left} ${t("account.daysLeft")}`
                        : t("account.trialEnded")}
                    </p>
                  </div>
                )}

                {account.account_status !== "active" && (
                  <div className="pt-4 border-t border-line">
                    <p className="text-sm text-ink-soft mb-3">
                      {t(account.account_status === "blocked" ? "account.blockedBanner" : "account.disabledBanner")}
                    </p>
                    <Link
                      to="/infos#rejoindre"
                      className="inline-block text-sm font-medium rounded-full bg-ink text-cream px-5 py-2.5 hover:bg-coffee-dark transition-colors"
                    >
                      {t("account.contactSupport")}
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-soft"> : </p>
            )}
          </section>

          {/* --- Mot de passe --- */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="bg-surface border border-line rounded-2xl p-6"
          >
            <h2 className="font-medium text-ink mb-4">{t("settings.passwordSection")}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-ink-faint uppercase tracking-wide mb-1.5">
                  {t("settings.currentPassword")}
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-coffee-light"
                />
              </div>
              <div>
                <label className="block text-xs text-ink-faint uppercase tracking-wide mb-1.5">
                  {t("settings.newPassword")}
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-coffee-light"
                />
              </div>
              <div>
                <label className="block text-xs text-ink-faint uppercase tracking-wide mb-1.5">
                  {t("settings.confirmPassword")}
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-coffee-light"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-2.5 hover:bg-coffee-dark transition-colors disabled:opacity-60"
              >
                {saving ? t("settings.saving") : t("settings.save")}
              </button>
            </form>
          </motion.section>
        </main>
      </div>
    </div>
  );
}
