import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, LogIn, UserPlus, CheckCircle2, Loader2, Send, BellRing, ShieldCheck } from "lucide-react";
import { api } from "../../lib/api.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { HServiceArt, H_SERVICE_THEME } from "../art/ServiceArt.jsx";
import { SERVICE_UI } from "../../i18n/servicePageUi.js";

/**
 * Panneau latéral de demande d'un service — remplace l'ancienne pop-up
 * centrée. S'ouvre depuis la page d'un service :
 *  - service ouvert  : demande (connexion requise, suivi dans l'espace client)
 *  - service "bientôt": simple liste d'attente (nom + e-mail, sans compte)
 */
export default function ServiceRequestPanel({ open, onClose, serviceKey, name, description, soon = false }) {
  const { lang, t } = useLanguage();
  const ui = SERVICE_UI[lang] || SERVICE_UI.fr;
  const { isAuthenticated, withAuth, user } = useUser();
  const toast = useToast();
  const location = useLocation();
  const panelRef = useRef(null);

  const [message, setMessage] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState("");

  // Repart d'un formulaire propre à chaque ouverture, pré-rempli si connecté.
  useEffect(() => {
    if (!open) return;
    setStatus("idle");
    setErrorMsg("");
    setMessage("");
    setFullName(user?.full_name || "");
    setEmail(user?.email || "");
  }, [open, user?.full_name, user?.email]);

  // Échap pour fermer, défilement de la page bloqué, focus dans le panneau.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = setTimeout(() => panelRef.current?.focus(), 60);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      clearTimeout(focusTimer);
    };
  }, [open, onClose]);

  const hasArt = Boolean(H_SERVICE_THEME[serviceKey]);
  const redirectState = { redirectTo: location.pathname };

  function readError(err, fallback) {
    const detail = err?.data?.detail;
    return typeof detail === "string" ? detail : fallback;
  }

  async function submitRequest(e) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      await withAuth((token) => api.services.request(token, serviceKey, message));
      setStatus("success");
      toast.success(t("subscribeModal.toastSuccess"));
    } catch (err) {
      const msg = readError(err, t("subscribeModal.genericError"));
      setStatus("error");
      setErrorMsg(msg);
      toast.error(msg);
    }
  }

  async function submitWaitlist(e) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const note = message.trim();
      await api.contact.send({
        name: fullName.trim(),
        email: email.trim(),
        message: `[${name} — ${lang === "fr" ? "liste d'attente" : "waiting list"}]${note ? ` ${note}` : ""}`,
      });
      setStatus("success");
    } catch (err) {
      const msg = readError(err, ui.waitError);
      setStatus("error");
      setErrorMsg(msg);
    }
  }

  const steps = soon ? [ui.waitNext1, ui.waitNext2, ui.waitNext3] : [ui.panelNext1, ui.panelNext2, ui.panelNext3];
  const inputClass =
    "w-full border border-line bg-surface text-ink rounded-xl px-3.5 py-3 text-sm outline-none focus:border-coffee-light transition-colors placeholder:text-ink-faint";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 bg-ink-fixed/55 backdrop-blur-sm z-[180]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            key="panel"
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={name}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 34, stiffness: 320 }}
            className="fixed top-0 right-0 h-full w-full sm:max-w-[440px] z-[190] bg-cream shadow-2xl flex flex-col outline-none"
          >
            {/* Bandeau illustré */}
            <div className="relative h-44 shrink-0 overflow-hidden bg-ink-fixed">
              {hasArt && <HServiceArt name={serviceKey} className="absolute inset-0 w-full h-full" />}
              <div className="absolute inset-0 bg-gradient-to-t from-ink-fixed/85 via-ink-fixed/20 to-transparent" />
              <button
                type="button"
                onClick={onClose}
                aria-label={ui.close}
                className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/35 backdrop-blur text-cream-fixed flex items-center justify-center hover:bg-black/55 transition-colors"
              >
                <X size={17} />
              </button>
              <div className="absolute bottom-4 left-5 right-5">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#E4B968] mb-1">
                  {soon ? ui.panelWaitlist : ui.panelRequest}
                </p>
                <h2 className="font-display italic text-2xl text-cream-fixed leading-tight">{name}</h2>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-6">
              {description && <p className="text-sm text-ink-soft leading-relaxed mb-6">{description}</p>}

              {status === "success" ? (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center py-6">
                  <span className="w-16 h-16 rounded-full bg-coffee/10 text-coffee-dark flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={32} />
                  </span>
                  <p className="font-display text-xl text-ink mb-2">
                    {soon ? ui.waitSuccessTitle : t("subscribeModal.successTitle")}
                  </p>
                  <p className="text-sm text-ink-soft mb-7 max-w-xs mx-auto leading-relaxed">
                    {soon ? ui.waitSuccessText : t("subscribeModal.successText")}
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    {!soon && (
                      <Link
                        to="/dashboard"
                        className="text-sm font-medium rounded-full bg-ink text-cream px-5 py-2.5 hover:bg-coffee-dark transition-colors"
                      >
                        {t("subscribeModal.viewDashboard")}
                      </Link>
                    )}
                    <button onClick={onClose} className="text-sm text-ink-soft hover:text-ink px-3 py-2">
                      {ui.close}
                    </button>
                  </div>
                </motion.div>
              ) : !soon && !isAuthenticated ? (
                <div>
                  <p className="text-sm text-ink-soft mb-5 leading-relaxed">
                    {t("subscribeModal.connectPrefix")} <strong className="text-ink">{name}</strong>.
                  </p>
                  <div className="flex flex-col gap-3">
                    <Link
                      to="/connexion"
                      state={redirectState}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5 hover:bg-coffee-dark transition-colors"
                    >
                      <LogIn size={15} />
                      {t("subscribeModal.signIn")}
                    </Link>
                    <Link
                      to="/creer-un-compte"
                      state={redirectState}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-line text-ink text-sm font-medium px-6 py-3.5 hover:border-coffee-light transition-colors"
                    >
                      <UserPlus size={15} />
                      {t("subscribeModal.createAccount")}
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={soon ? submitWaitlist : submitRequest} className="space-y-4">
                  {soon ? (
                    <>
                      <div>
                        <label htmlFor="srp-name" className="block text-xs font-medium text-ink-soft mb-1.5">
                          {ui.nameLabel}
                        </label>
                        <input
                          id="srp-name"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          autoComplete="name"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label htmlFor="srp-email" className="block text-xs font-medium text-ink-soft mb-1.5">
                          {ui.emailLabel}
                        </label>
                        <input
                          id="srp-email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          autoComplete="email"
                          className={inputClass}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-ink-soft">
                      {t("subscribeModal.connectedAs")} <span className="font-medium text-ink">{user?.email}</span>
                    </p>
                  )}
                  <div>
                    <label htmlFor="srp-message" className="block text-xs font-medium text-ink-soft mb-1.5">
                      {soon ? ui.waitMessageLabel : t("subscribeModal.precisionsLabel")}
                    </label>
                    <textarea
                      id="srp-message"
                      rows={3}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={soon ? ui.waitMessagePh : t("subscribeModal.precisionsPlaceholder")}
                      className={`${inputClass} resize-none`}
                    />
                  </div>

                  {status === "error" && (
                    <p role="alert" className="text-sm text-red-600">
                      {errorMsg}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="w-full flex items-center justify-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-5 py-3.5 hover:bg-coffee-dark transition-colors disabled:opacity-60"
                  >
                    {status === "loading" ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : soon ? (
                      <BellRing size={15} />
                    ) : (
                      <Send size={15} />
                    )}
                    {status === "loading" ? t("subscribeModal.sending") : soon ? ui.waitSubmit : t("subscribeModal.send")}
                  </button>
                  <p className="flex items-center justify-center gap-1.5 text-[0.7rem] text-ink-faint">
                    <ShieldCheck size={12} />
                    {ui.secure}
                  </p>
                </form>
              )}

              {status !== "success" && (
                <div className="mt-8 pt-6 border-t border-line">
                  <p className="text-xs font-semibold uppercase tracking-widest text-coffee mb-4">{ui.panelNextTitle}</p>
                  <ol className="space-y-4">
                    {steps.map((text, i) => (
                      <li key={text} className="flex gap-3.5 items-start">
                        <span className="w-7 h-7 rounded-full bg-coffee text-on-coffee text-xs font-semibold flex items-center justify-center shrink-0 font-mono">
                          {i + 1}
                        </span>
                        <span className="text-sm text-ink-soft leading-snug pt-1">{text}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
