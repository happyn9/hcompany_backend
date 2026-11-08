import { useState } from "react";
import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";
import { consent } from "../../lib/memStore.js";
import { useLanguage } from "../../context/LanguageContext.jsx";

/** Information cookies : H-Company n'utilise que des cookies essentiels (session) et de préférence (langue, thème, pays). Aucun traceur publicitaire. */
export default function CookieNotice() {
  const { lang } = useLanguage();
  const fr = lang !== "en";
  const [open, setOpen] = useState(() => !consent.get());
  if (!open) return null;
  const choose = (v) => { consent.set(v); setOpen(false); };
  return (
    <div role="dialog" aria-label={fr ? "Cookies" : "Cookies"} className="fixed left-3 right-3 bottom-3 sm:left-5 sm:right-auto sm:bottom-5 sm:max-w-[420px] z-[60] rounded-2xl border border-line bg-surface shadow-2xl p-5">
      <p className="flex items-center gap-2 font-semibold text-ink"><Cookie size={18} />{fr ? "Vos cookies, votre choix" : "Your cookies, your choice"}</p>
      <p className="text-sm text-ink-soft mt-2 leading-relaxed">
        {fr ? "Nous utilisons un cookie de session indispensable (sécurisé, illisible par les scripts) et, si vous le permettez, des cookies de préférence (langue, thème, pays). Aucun cookie publicitaire ni de suivi. "
            : "We use one essential session cookie (secure, unreadable by scripts) and, if you allow it, preference cookies (language, theme, country). No advertising or tracking cookies. "}
        <Link to="/confidentialite" className="underline text-coffee-dark">{fr ? "En savoir plus" : "Learn more"}</Link>
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => choose("all")} className="flex-1 min-w-[140px] rounded-full bg-ink text-cream text-sm font-medium px-4 py-2.5">{fr ? "Accepter" : "Accept"}</button>
        <button onClick={() => choose("essential")} className="flex-1 min-w-[140px] rounded-full border border-line text-ink text-sm font-medium px-4 py-2.5">{fr ? "Essentiels seulement" : "Essential only"}</button>
      </div>
    </div>
  );
}
