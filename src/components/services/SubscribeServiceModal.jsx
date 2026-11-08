import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, LogIn, UserPlus, CheckCircle2 } from "lucide-react";
import { api } from "../../lib/api.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import ServiceLogo from "./ServiceLogo.jsx";
import FormLoadingOverlay from "../ui/FormLoadingOverlay.jsx";

/** Formulaire d'abonnement à un service H-Company — ouvert depuis
 * "Explore our services". Le nom du service est déjà renseigné (l'utilisateur
 * n'a qu'à confirmer et, s'il le souhaite, préciser sa demande). Une fois
 * envoyée, la demande apparaît côté client dans /dashboard ("Mes services")
 * en statut "En attente", en attendant l'approbation d'un admin. */
export default function SubscribeServiceModal({ service, onClose, onSubscribed }) {
  const { isAuthenticated, withAuth, user } = useUser();
  const { t } = useLanguage();
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState("");
  const toast = useToast();

  if (!service) return null;
  const catalogTr = t(`exploreServices.catalog.${service.key}`);
  const serviceLabel = (typeof catalogTr === "object" && catalogTr?.label) || service.label;
  const serviceDescription = (typeof catalogTr === "object" && catalogTr?.description) || service.description;

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      await withAuth((token) => api.services.request(token, service.key, message));
      setStatus("success");
      toast.success(t("subscribeModal.toastSuccess"));
      onSubscribed?.();
    } catch (err) {
      const msg = err?.data?.detail || t("subscribeModal.genericError");
      setStatus("error");
      setErrorMsg(msg);
      toast.error(msg);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-ink/50 backdrop-blur-sm z-[180]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[190] bg-surface rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-coffee/10 flex items-center justify-center text-coffee shrink-0 overflow-hidden">
              <ServiceLogo logoUrl={service.logo_url} serviceKey={service.key} size={18} />
            </span>
            <h3 className="font-display text-lg text-ink">{serviceLabel}</h3>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        {!isAuthenticated ? (
          <div className="text-center py-2">
            <p className="text-sm text-ink-soft mb-6">
              {t("subscribeModal.connectPrefix")} <strong className="text-ink">{serviceLabel}</strong>.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/connexion"
                state={{ redirectTo: "/infos#explorer" }}
                className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-6 py-3 hover:bg-coffee-dark transition-colors"
              >
                <LogIn size={15} />
                {t("subscribeModal.signIn")}
              </Link>
              <Link
                to="/creer-un-compte"
                state={{ redirectTo: "/infos#explorer" }}
                className="inline-flex items-center gap-2 rounded-full border border-line text-ink text-sm font-medium px-6 py-3 hover:border-coffee-light transition-colors"
              >
                <UserPlus size={15} />
                {t("subscribeModal.createAccount")}
              </Link>
            </div>
          </div>
        ) : status === "success" ? (
          <div className="text-center py-4">
            <CheckCircle2 size={36} className="mx-auto text-coffee-dark mb-3" />
            <p className="text-ink font-medium mb-1">{t("subscribeModal.successTitle")}</p>
            <p className="text-sm text-ink-soft mb-6">{t("subscribeModal.successText")}</p>
            <div className="flex items-center justify-center gap-3">
              <Link
                to="/dashboard"
                className="text-sm font-medium rounded-full bg-ink text-cream px-5 py-2.5 hover:bg-coffee-dark transition-colors"
              >
                {t("subscribeModal.viewDashboard")}
              </Link>
              <button onClick={onClose} className="text-sm text-ink-soft hover:text-ink">
                {t("subscribeModal.close")}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-ink-soft">
              {t("subscribeModal.connectedAs")} <span className="font-medium text-ink">{user?.email}</span>
            </p>
            <p className="text-sm text-ink-soft">{serviceDescription}</p>
            <div>
              <label htmlFor="sub-message" className="block text-sm text-ink-soft mb-1.5">
                {t("subscribeModal.precisionsLabel")}
              </label>
              <textarea
                id="sub-message"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("subscribeModal.precisionsPlaceholder")}
                className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-coffee-light resize-none"
              />
            </div>

            {status === "error" && <p className="text-sm text-red-600">{errorMsg}</p>}

            <button
              type="submit"
              disabled={status === "loading"}
              className="w-full rounded-full bg-ink text-cream text-sm font-medium px-5 py-2.5 hover:bg-coffee-dark transition-colors disabled:opacity-50"
            >
              {status === "loading" ? t("subscribeModal.sending") : t("subscribeModal.send")}
            </button>
          </form>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
