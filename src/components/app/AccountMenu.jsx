import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Globe2, Handshake, LogOut, Pencil, Settings, Wallet } from "lucide-react";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";

/** Nom à afficher : nom complet, sinon la partie avant le « @ » mise en forme (jamais l'e-mail brut). */
export function displayName(user) {
  if (user?.full_name?.trim()) return user.full_name.trim();
  const local = (user?.email || "").split("@")[0].replace(/[._-]+/g, " ").replace(/\d+/g, "").trim();
  return local ? local.replace(/\b\w/g, (c) => c.toUpperCase()) : "";
}
export function initials(user) {
  const p = displayName(user).split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || "H") + (p[1]?.[0] || "")).toUpperCase();
}
const ROLE = { admin: ["Administrateur", "Admin"], agent: ["Agent", "Agent"], partner: ["Partenaire", "Partner"] };

/** Pastille de profil + menu déroulant (nom, e-mail, statut, paramètres, langue, déconnexion), modifiable en place. */
export default function AccountMenu({ onPartner = true }) {
  const { user, signOut, withAuth } = useUser();
  const { lang, setLang } = useLanguage();
  const fr = lang !== "en";
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const d = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const k = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", d); window.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", d); window.removeEventListener("keydown", k); };
  }, [open]);

  const shownUser = shown ? { ...user, full_name: shown } : user;
  async function save(e) {
    e.preventDefault();
    if (name.trim().length < 2) return;
    setBusy(true);
    try { const u = await withAuth((t) => api.auth.updateMe(t, name.trim())); setShown(u.full_name); setEdit(false); } catch { /* le nom reste inchangé */ } finally { setBusy(false); }
  }
  const role = ROLE[user?.role];
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label={fr ? "Mon profil" : "My profile"}
        className="w-10 h-10 rounded-full bg-[#F4C9C0] text-[#7A2E22] text-xs font-semibold flex items-center justify-center hover:ring-4 hover:ring-latte-soft transition-shadow">{initials(shownUser)}</button>
      <AnimatePresence>
        {open && (
          <motion.div role="menu" initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.14 }}
            className="absolute right-0 mt-2.5 w-[19rem] max-w-[92vw] rounded-2xl border border-line bg-surface shadow-xl p-2 origin-top-right z-50">
            <div className="px-3 pt-3 pb-2">
              {edit ? (
                <form onSubmit={save} className="flex gap-2">
                  <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={fr ? "Votre nom" : "Your name"} className="min-w-0 flex-1 rounded-lg border border-line bg-cream px-3 py-2 text-sm" />
                  <button disabled={busy || name.trim().length < 2} aria-label="OK" className="w-9 h-9 rounded-lg bg-ink text-cream flex items-center justify-center disabled:opacity-40"><Check size={16} /></button>
                </form>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="font-medium text-ink truncate">{displayName(shownUser) || (fr ? "Mon compte" : "My account")}</p>
                  {role && <span className="rounded-full bg-[#F6E2A8] text-[#6B4E0C] text-[10px] font-semibold px-2 py-0.5">{fr ? role[0] : role[1]}</span>}
                  <button onClick={() => { setName(displayName(shownUser)); setEdit(true); }} aria-label={fr ? "Modifier mon nom" : "Edit my name"} className="ml-auto w-7 h-7 rounded-md hover:bg-latte-soft text-ink-soft flex items-center justify-center"><Pencil size={13} /></button>
                </div>
              )}
              <p className="text-xs text-ink-soft truncate mt-0.5">{user?.email}</p>
            </div>
            {onPartner && !role && (
              <Link to="/infos#rejoindre" onClick={() => setOpen(false)} className="mx-1 my-1 flex items-center gap-3 rounded-xl bg-[#E3F0E5] text-[#1F4D2E] px-4 py-3 text-sm hover:bg-[#d7e9da]">
                <Handshake size={18} /><span><strong className="block font-semibold">{fr ? "Devenir partenaire" : "Become a partner"}</strong><span className="text-xs opacity-80">{fr ? "Proposez vos services sur H-Company" : "Offer your services on H-Company"}</span></span>
              </Link>
            )}
            {[
              { to: "/settings", Icon: Settings, l: fr ? "Paramètres du compte" : "Account settings" },
              { to: "/app/money", Icon: Wallet, l: "H-Money" },
            ].map(({ to, Icon, l }) => (
              <Link key={to} to={to} role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm text-ink hover:bg-latte-soft/60"><Icon size={16} className="text-ink-soft" />{l}</Link>
            ))}
            <button role="menuitem" onClick={() => setLang(fr ? "en" : "fr")} className="w-full flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm text-ink hover:bg-latte-soft/60"><Globe2 size={16} className="text-ink-soft" />{fr ? "Language : English" : "Langue : Français"}</button>
            <button role="menuitem" onClick={() => signOut()} className="w-full flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm text-[#9B2C2C] hover:bg-[#9B2C2C]/8"><LogOut size={16} />{fr ? "Se déconnecter" : "Sign out"}</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
