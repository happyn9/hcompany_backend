import { afterLogin } from "../../lib/home.js";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { MailCheck, ArrowRight, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import AuthLayout from "../../components/auth/AuthLayout.jsx";
import LockoutNotice from "../../components/auth/LockoutNotice.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import SlowHint from "../../components/auth/SlowHint.jsx";
import { ApiError } from "../../lib/api.js";
import { startOtp, useOtpStatus } from "../../lib/otpTracker.js";

const CODE_LENGTH = 6;
const RESEND_SECONDS = 45;

const LEAD_KEY = {
  register: "auth.otpPageLeadRegister",
  login: "auth.otpPageLeadLogin",
  reset_password: "auth.otpPageLeadReset",
};

export default function VerifyOtp() {
  const { t } = useLanguage();
  const { signInWithOtp } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const email = location.state?.email;
  const purpose = location.state?.purpose || "login";
  const redirectTo = location.state?.redirectTo || "/";

  const [digits, setDigits] = useState(Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const inputsRef = useRef([]);
  const otp = useOtpStatus();
  const forThisEmail = otp.email === email && otp.purpose === purpose;

  useEffect(() => {
    if (!email) navigate(purpose === "register" ? "/creer-un-compte" : "/connexion");
  }, [email, purpose, navigate]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((r) => r - 1), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  function handleDigitChange(index, value) {
    const clean = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    if (clean && index < CODE_LENGTH - 1) inputsRef.current[index + 1]?.focus();
    if (next.every((d) => d) && next.join("").length === CODE_LENGTH) {
      submit(next.join(""));
    }
  }

  function handlePaste(e) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = pasted.split("").concat(Array(CODE_LENGTH).fill("")).slice(0, CODE_LENGTH);
    setDigits(next);
    inputsRef.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
    if (pasted.length === CODE_LENGTH) submit(pasted);
  }

  function handleKeyDown(index, e) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  async function submit(code) {
    setError(null);
    setLoading(true);
    try {
      const d = await signInWithOtp(email, "email", code, purpose);
      if (purpose === "register") navigate("/bienvenue");
      else if (purpose === "reset_password") navigate("/nouveau-mot-de-passe");
      else navigate(afterLogin(redirectTo, d?.user), { state: { justSignedIn: true } });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setLocked(true);
      else {
        setError(err?.data?.detail || "Code invalide, réessayez.");
        setDigits(Array(CODE_LENGTH).fill(""));
        inputsRef.current[0]?.focus();
      }
    } finally {
      setLoading(false);
    }
  }

  // Arrivée directe sur cette page (actualisation, lien) sans envoi en cours :
  // le code a pu être envoyé juste avant, on n'en renvoie pas un de nous-mêmes.
  useEffect(() => {
    if (forThisEmail && otp.status === "error" && otp.rateLimited) setLocked(true);
  }, [forThisEmail, otp.status, otp.rateLimited]);

  function handleResend() {
    if (resendIn > 0 || (forThisEmail && otp.status === "sending")) return;
    startOtp(email, purpose);
    setResendIn(RESEND_SECONDS);
  }

  if (!email) return null;

  return (
    <AuthLayout
      visual={
        <div className="text-center max-w-xs">
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-6">
            <MailCheck className="text-[#C89A3D]" size={28} />
          </div>
          <h2 className="font-display italic text-2xl text-cream-fixed mb-3">{t("auth.otpPageTitle")}</h2>
          <p className="text-cream-fixed/60 text-sm leading-relaxed">
            {t(LEAD_KEY[purpose])} <span className="text-cream-fixed/90">{email}</span>
          </p>
        </div>
      }
    >
      {locked ? (
        <LockoutNotice onExpire={() => setLocked(false)} />
      ) : (
        <>
          <h1 className="font-display text-2xl text-ink mb-2">{t("auth.otpPageTitle")}</h1>
          <p className="text-sm text-stone mb-8">
            {t(LEAD_KEY[purpose])} <strong className="text-ink">{email}</strong>
          </p>

          {forThisEmail && otp.status === "sending" && (
            <p role="status" className="flex items-center gap-2 text-xs text-ink-soft bg-latte-soft border border-line rounded-xl px-3.5 py-2.5 mb-4">
              <Loader2 size={14} className="animate-spin text-coffee shrink-0" />
              {t("auth.otpSendingCode")}
            </p>
          )}
          {forThisEmail && otp.status === "sent" && (
            <p role="status" className="flex items-center gap-2 text-xs text-ink-soft bg-latte-soft border border-line rounded-xl px-3.5 py-2.5 mb-4">
              <CheckCircle2 size={14} className="text-coffee shrink-0" />
              {t("auth.otpSentOk")}
            </p>
          )}
          {forThisEmail && otp.status === "error" && !otp.rateLimited && (
            <div role="alert" className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 mb-4">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span className="flex-1">
                {t("auth.otpSendError")}{" "}
                <button type="button" onClick={() => startOtp(email, purpose)} className="underline font-medium">
                  {t("auth.otpRetry")}
                </button>
              </span>
            </div>
          )}
          <SlowHint active={forThisEmail && otp.status === "sending"} delayMs={6000} />

          <div className="flex gap-2 mb-6 mt-4" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => (inputsRef.current[i] = el)}
                value={d}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                inputMode="numeric"
                maxLength={1}
                autoFocus={i === 0}
                className="w-full aspect-square text-center text-xl font-display border border-line rounded-xl outline-none focus:border-coffee-light transition-colors"
              />
            ))}
          </div>

          {error && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-red-600 mb-4">
              {error}
            </motion.p>
          )}

          <button
            onClick={() => submit(digits.join(""))}
            disabled={loading || digits.some((d) => !d)}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-ink text-cream text-sm font-medium py-3.5 hover:bg-coffee-dark transition-colors disabled:opacity-40 mb-4"
          >
            {loading ? t("auth.otpVerifying") : t("auth.otpVerify")}
            {!loading && <ArrowRight size={15} />}
          </button>

          <div className="flex items-center justify-between text-xs">
            <button
              onClick={handleResend}
              disabled={resendIn > 0}
              className="text-ink-soft hover:text-ink transition-colors disabled:text-ink-faint"
            >
              {resendIn > 0 ? `${t("auth.otpResendIn")} ${resendIn}s` : t("auth.otpResend")}
            </button>
            <Link to="/connexion" className="text-ink-soft hover:text-ink transition-colors">
              {t("auth.otpChangeEmail")}
            </Link>
          </div>
        </>
      )}
    </AuthLayout>
  );
}
