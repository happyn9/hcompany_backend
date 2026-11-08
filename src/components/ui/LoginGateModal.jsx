import { useEffect } from "react";
import { Link } from "react-router-dom";
import { LockKeyhole, X } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext.jsx";

/** Invité : il peut tout regarder ; au moment de transactionner, on lui propose de se connecter ou de créer un compte. */
export default function LoginGateModal({ onClose, redirectTo = "/app" }) {
  const { lang } = useLanguage();
  const fr = lang !== "en";
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <button aria-label={fr ? "Fermer" : "Close"} className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-3xl bg-surface border border-line shadow-2xl p-7 text-center">
        <button onClick={onClose} aria-label={fr ? "Fermer" : "Close"} className="absolute top-3 right-3 w-8 h-8 rounded-lg hover:bg-latte-soft flex items-center justify-center"><X size={16} /></button>
        <div className="mx-auto w-12 h-12 rounded-2xl bg-latte-soft flex items-center justify-center text-coffee-dark"><LockKeyhole size={22} /></div>
        <h2 className="font-display text-2xl mt-4">{fr ? "Connectez-vous pour continuer" : "Sign in to continue"}</h2>
        <p className="text-sm text-ink-soft mt-2">{fr ? "Pour payer, envoyer ou réserver, un compte est nécessaire. C'est rapide : un code reçu par e-mail suffit, et le compte est créé automatiquement." : "To pay, send or book you need an account. It's quick: a code sent by email is enough, and your account is created automatically."}</p>
        <div className="mt-6 grid gap-2.5">
          <Link to="/connexion" state={{ redirectTo }} className="rounded-full bg-ink text-cream text-sm font-medium py-3 hover:bg-coffee-dark">{fr ? "Se connecter" : "Sign in"}</Link>
          <Link to="/connexion" state={{ redirectTo }} className="rounded-full border border-line text-sm font-medium py-3 hover:bg-latte-soft">{fr ? "Créer un compte" : "Create an account"}</Link>
        </div>
      </div>
    </div>
  );
}
