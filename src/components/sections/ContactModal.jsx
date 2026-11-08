import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Loader2, CheckCircle2 } from "lucide-react";
import { api } from "../../lib/api.js";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import FormLoadingOverlay from "../ui/FormLoadingOverlay.jsx";

/** Formulaire de contact général — jusqu'ici le backend (api.contact.send)
 * n'avait aucun appelant côté frontend : aucun moyen concret pour un
 * visiteur ou un client d'écrire à H-Company (ou, dans le contexte d'une
 * page partenaire, de signaler son intérêt pour un partenaire précis).
 * `context` est un texte optionnel préfixé au message (ex: nom du
 * partenaire consulté) pour donner à l'admin le contexte de la demande. */
export default function ContactModal({ onClose, context }) {
  const { t } = useLanguage();
  const { user } = useUser();
  const [name, setName] = useState(user?.full_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const fullMessage = context ? `[${context}]\n\n${message}` : message;
      await api.contact.send({ name, email, message: fullMessage });
      setStatus("success");
    } catch (err) {
      setErrorMsg(err?.data?.detail || t("contactModal.genericError"));
      setStatus("error");
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
        <FormLoadingOverlay show={status === "loading"} label={t("contactModal.sending")} rounded="rounded-2xl" />
        {status === "success" ? (
          <div className="flex flex-col items-center text-center py-6">
            <CheckCircle2 size={40} className="text-emerald-600 mb-3" />
            <p className="text-base font-medium text-ink mb-1">{t("contactModal.successTitle")}</p>
            <p className="text-sm text-ink-soft">{t("contactModal.successBody")}</p>
            <button
              onClick={onClose}
              className="mt-5 rounded-full bg-ink text-cream text-sm font-medium px-6 py-2.5 hover:bg-coffee-dark transition-colors"
            >
              {t("contactModal.close")}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-display text-lg text-ink">{t("contactModal.title")}</h3>
                {context && <p className="text-xs text-ink-soft mt-0.5">{context}</p>}
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:bg-line/50 hover:text-ink transition-colors">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <label className="block">
                <span className="block text-[11px] font-medium text-ink-soft mb-1">{t("contactModal.fieldName")}</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full text-sm rounded-lg border border-line bg-cream/40 px-3 py-2 outline-none focus:border-coffee-light"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-ink-soft mb-1">{t("contactModal.fieldEmail")}</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full text-sm rounded-lg border border-line bg-cream/40 px-3 py-2 outline-none focus:border-coffee-light"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-ink-soft mb-1">{t("contactModal.fieldMessage")}</span>
                <textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  className="w-full text-sm rounded-lg border border-line bg-cream/40 px-3 py-2 outline-none focus:border-coffee-light resize-none"
                />
              </label>

              {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full flex items-center justify-center gap-2 text-sm font-medium rounded-full bg-ink text-cream py-2.5 hover:bg-coffee-dark disabled:opacity-60 transition-colors"
              >
                {status === "loading" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {t("contactModal.send")}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
