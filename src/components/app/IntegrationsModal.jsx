import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowUpRight, X } from "lucide-react";
import { AppLogo, H_APPS } from "./AppLogos.jsx";

const CATS = [
  { k: "all", fr: "Toutes", en: "All" },
  { k: "travel", fr: "Voyager", en: "Travel" },
  { k: "life", fr: "Vivre", en: "Daily life" },
  { k: "learn", fr: "Apprendre", en: "Learn" },
];

/** « Intégrations » façon Mentimeter : toutes les applis H-Company (sauf H-Money, déjà au centre de l'app) avec leur logo. */
export default function IntegrationsModal({ open, onClose, fr }) {
  const [cat, setCat] = useState("all");
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  const list = H_APPS.filter((a) => cat === "all" || a.cat === cat);
  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <button aria-label={fr ? "Fermer" : "Close"} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <motion.div role="dialog" aria-modal="true" aria-label={fr ? "Intégrations" : "Integrations"} initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.2 }}
        className="relative w-full sm:max-w-4xl max-h-[92vh] sm:max-h-[80vh] overflow-hidden rounded-t-3xl sm:rounded-3xl bg-surface border border-line shadow-2xl flex flex-col sm:flex-row">
        <button onClick={onClose} aria-label={fr ? "Fermer" : "Close"} className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full hover:bg-latte-soft flex items-center justify-center"><X size={18} /></button>
        <aside className="sm:w-56 shrink-0 p-5 sm:p-7 sm:border-r border-line">
          <h2 className="font-display text-2xl text-ink">{fr ? "Intégrations" : "Integrations"}</h2>
          <ul className="mt-4 flex sm:flex-col gap-1 overflow-x-auto">
            {CATS.map((c) => (
              <li key={c.k}><button onClick={() => setCat(c.k)} aria-pressed={cat === c.k}
                className={`whitespace-nowrap w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${cat === c.k ? "bg-latte-soft text-coffee-dark font-medium" : "text-ink-soft hover:bg-latte-soft/60"}`}>{fr ? c.fr : c.en}</button></li>
            ))}
          </ul>
        </aside>
        <div className="flex-1 overflow-y-auto p-5 sm:p-8">
          <p className="text-sm text-ink-soft text-center">{fr ? "Toute l'offre H-Company dans une seule app" : "The whole H-Company offer in one app"}</p>
          <h3 className="font-display text-2xl sm:text-3xl text-ink text-center mt-1">{fr ? "Connectez-vous à vos services préférés" : "Connect with your favorite services"}</h3>
          <div className="mt-6 flex flex-wrap justify-center gap-3">{H_APPS.map((a) => <AppLogo key={a.key} app={a} size={46} />)}</div>
          <ul className="mt-8 grid sm:grid-cols-2 gap-3">
            {list.map((a) => (
              <li key={a.key}>
                <Link to={a.to} onClick={onClose} className="group flex items-start gap-3.5 rounded-2xl border border-line bg-cream/50 p-4 hover:bg-latte-soft/50 transition-colors h-full">
                  <AppLogo app={a} size={42} />
                  <span className="min-w-0 flex-1"><span className="flex items-center gap-1 font-medium text-ink">{fr ? a.fr : a.en}<ArrowUpRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-coffee" /></span>
                    <span className="block text-xs text-ink-soft mt-0.5">{fr ? a.dFr : a.dEn}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </motion.div>
    </div>
  );
}
