import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Loader2, Mail, CheckCircle2 } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext.jsx";

/** Modale admin pour envoyer une notification (in-app, + e-mail en option)
 * à un utilisateur précis — depuis une demande de service ou pour tout
 * autre motif. `user` = { id, email, full_name } ; `defaultTitle`/
 * `defaultBody` pré-remplissent le formulaire quand on part d'un contexte
 * connu (ex: une demande de service en particulier). */
export default function NotifyUserModal({ user, defaultTitle = "", defaultBody = "", onClose, onSend }) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(defaultTitle);
  const [body, setBody] = useState(defaultBody);
  const [alsoEmail, setAlsoEmail] = useState(true);
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState("");

  if (!user) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      await onSend({ user_id: user.id, title, body, also_email: alsoEmail });
      setStatus("success");
      setTimeout(onClose, 900);
    } catch (err) {
      setErrorMsg(err?.data?.detail || t("notifyModal.genericError"));
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
        {status === "success" ? (
          <div className="flex flex-col items-center text-center py-6">
            <CheckCircle2 size={40} className="text-emerald-600 mb-3" />
            <p className="text-sm font-medium text-ink">{t("notifyModal.sent")}</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-display text-lg text-ink">{t("notifyModal.title")}</h3>
                <p className="text-xs text-ink-soft mt-0.5">
                  {user.full_name || user.email} {user.full_name && user.email ? `· ${user.email}` : ""}
                </p>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:bg-line/50 hover:text-ink transition-colors">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <label className="block">
                <span className="block text-[11px] font-medium text-ink-soft mb-1">{t("notifyModal.fieldTitle")}</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="w-full text-sm rounded-lg border border-line bg-cream/40 px-3 py-2 outline-none focus:border-coffee-light"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-ink-soft mb-1">{t("notifyModal.fieldBody")}</span>
                <textarea
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  className="w-full text-sm rounded-lg border border-line bg-cream/40 px-3 py-2 outline-none focus:border-coffee-light resize-none"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={alsoEmail}
                  onChange={(e) => setAlsoEmail(e.target.checked)}
                  className="rounded border-line"
                />
                <Mail size={13} />
                {t("notifyModal.alsoEmail")}
              </label>

              {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full flex items-center justify-center gap-2 text-sm font-medium rounded-full bg-ink text-cream py-2.5 hover:bg-coffee-dark disabled:opacity-60 transition-colors"
              >
                {status === "loading" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {t("notifyModal.send")}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
