import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, ArrowRight, Sparkles, ShieldCheck, QrCode } from "lucide-react";
import AuthLayout from "../../components/auth/AuthLayout.jsx";
import LockoutNotice from "../../components/auth/LockoutNotice.jsx";
import GoogleButton from "../../components/auth/GoogleButton.jsx";
import SlowHint from "../../components/auth/SlowHint.jsx";
import { startOtp } from "../../lib/otpTracker.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api, ApiError } from "../../lib/api.js";
import { afterLogin } from "../../lib/home.js";

export default function SignIn() {
  const { t, lang } = useLanguage();
  const { signIn, signInPartner } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.redirectTo || "/";

  const [mode, setMode] = useState(location.state?.mode || "otp"); // "otp" | "password" | "partner"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);

  // Réveille le serveur dès l'arrivée sur la page, pendant la saisie.
  useEffect(() => {
    api.auth.warmup();
  }, []);

  // On passe tout de suite à l'écran de saisie du code : l'envoi de l'e-mail
  // continue en arrière-plan (état visible sur l'écran suivant, avec un
  // bouton pour le relancer), au lieu de bloquer ici pendant le réveil du serveur.
  function handleOtpSubmit(e) {
    e.preventDefault();
    setError(null);
    startOtp(email.trim(), "login");
    navigate("/verifier", { state: { email: email.trim(), purpose: "login", redirectTo } });
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const d = await signIn(email, password);
      navigate(afterLogin(redirectTo, d?.user));
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setLocked(true);
      else setError(err?.data?.detail || "E-mail ou mot de passe incorrect.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePartnerSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const d = await signInPartner(code.trim(), password);
      navigate(afterLogin(location.state?.redirectTo, d?.user));
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setLocked(true);
      else setError(err?.data?.detail || "Code partenaire ou mot de passe incorrect.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      visual={
        <div className="text-center max-w-xs">
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-6">
            <Sparkles className="text-[#C89A3D]" size={28} />
          </div>
          <h2 className="font-display italic text-2xl text-cream-fixed mb-3">
            {t("hero.titleEm")}
          </h2>
          <p className="text-cream-fixed/60 text-sm leading-relaxed">{t("hero.lead")}</p>
        </div>
      }
    >
      {locked ? (
        <LockoutNotice onExpire={() => setLocked(false)} />
      ) : (
        <>
          <h1 className="font-display text-2xl text-ink mb-2">{t("auth.signinTitle")}</h1>
          <p className="text-sm text-stone mb-8">{t("auth.noAccount")}{" "}
            <Link to="/creer-un-compte" className="text-coffee-dark font-medium hover:underline">
              {t("auth.joinNetwork")}
            </Link>
          </p>

          {mode !== "partner" && (
            <button type="button" onClick={() => { setError(null); setMode("partner"); }} className="w-full mb-4 inline-flex items-center justify-center gap-2 rounded-xl border border-line text-ink text-sm font-medium py-3 hover:border-coffee-light transition-colors">
              <ShieldCheck size={15} />{lang === "fr" ? "Je suis partenaire (code + mot de passe)" : "I'm a partner (code + password)"}
            </button>
          )}
          <GoogleButton />
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-line" />
            <span className="text-xs text-ink-faint">{t("auth.orDivider")}</span>
            <div className="flex-1 h-px bg-line" />
          </div>

          <AnimatePresence mode="wait">
            {mode === "partner" ? (
              <motion.form key="partner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onSubmit={handlePartnerSubmit} className="space-y-4">
                <p className="text-sm text-ink-soft -mt-2">{lang === "fr" ? "Espace partenaire : votre code (ex. HC-123456) et votre mot de passe, reçus par e-mail." : "Partner space: your code (e.g. HC-123456) and the password sent by e-mail."}</p>
                <div className="relative">
                  <ShieldCheck size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
                  <input type="text" required autoFocus autoCapitalize="characters" autoComplete="username" placeholder="HC-123456" value={code} onChange={(e) => setCode(e.target.value)} className="w-full border border-line rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-coffee-light transition-colors uppercase tracking-wider" />
                </div>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
                  <input type="password" required autoComplete="current-password" placeholder={t("auth.passwordPh")} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-line rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-coffee-light transition-colors" />
                </div>
                <div className="flex justify-between items-center -mt-2">
                  <Link to="/connexion-qr" className="inline-flex items-center gap-1 text-xs text-coffee-dark hover:text-ink underline underline-offset-4"><QrCode size={13} />{lang === "fr" ? "Se connecter avec un QR code" : "Sign in with QR code"}</Link>
                  <Link to="/mot-de-passe-oublie" className="text-xs text-ink-soft hover:text-ink">{t("auth.forgotPassword")}</Link>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <SlowHint active={loading} />
                <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 rounded-xl bg-ink text-cream text-sm font-medium py-3.5 hover:bg-coffee-dark transition-colors disabled:opacity-60">
                  {loading ? t("auth.connecting") : (lang === "fr" ? "Accéder à mon dashboard" : "Open my dashboard")}{!loading && <ArrowRight size={15} />}
                </button>
                <button type="button" onClick={() => setMode("otp")} className="w-full text-center text-xs text-ink-soft hover:text-ink transition-colors pt-1">{t("auth.otpToggle")}</button>
              </motion.form>
            ) : mode === "otp" ? (
              <motion.form
                key="otp"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onSubmit={handleOtpSubmit}
                className="space-y-4"
              >
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
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-ink text-cream text-sm font-medium py-3.5 hover:bg-coffee-dark transition-colors"
                >
                  {t("auth.receiveCode")}
                  <ArrowRight size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setMode("password")}
                  className="w-full text-center text-xs text-ink-soft hover:text-ink transition-colors pt-1"
                >
                  {t("auth.preferPassword")}
                </button>
              </motion.form>
            ) : (
              <motion.form
                key="password"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onSubmit={handlePasswordSubmit}
                className="space-y-4"
              >
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
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
                  <input
                    type="password"
                    required
                    placeholder={t("auth.passwordPh")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-line rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-coffee-light transition-colors"
                  />
                </div>
                <div className="flex justify-between items-center -mt-2">
                  <Link to="/connexion-qr" className="text-xs text-coffee-dark hover:text-ink transition-colors underline underline-offset-4">
                    {lang === "fr" ? "Connexion par QR code" : "Sign in with QR code"}
                  </Link>
                  <Link to="/mot-de-passe-oublie" className="text-xs text-ink-soft hover:text-ink transition-colors">
                    {t("auth.forgotPassword")}
                  </Link>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <SlowHint active={loading} />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-ink text-cream text-sm font-medium py-3.5 hover:bg-coffee-dark transition-colors disabled:opacity-60"
                >
                  {loading ? t("auth.connecting") : t("auth.signin")}
                  {!loading && <ArrowRight size={15} />}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("otp")}
                  className="w-full text-center text-xs text-ink-soft hover:text-ink transition-colors pt-1"
                >
                  {t("auth.otpToggle")}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </>
      )}
    </AuthLayout>
  );
}
