import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutDashboard, Settings as SettingsIcon, LogOut } from "lucide-react";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import NotificationBell from "./NotificationBell.jsx";
import Logo from "../ui/Logo.jsx";
import { homeFor } from "../../lib/home.js";

// onDark : la page commence par un bandeau sombre — texte clair tant que la
// barre est transparente (avant le défilement).
export default function NavBar({ onDark = false }) {
  const { t } = useLanguage();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const { user, isAuthenticated, isLoading, signOut } = useUser();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Ferme le menu profil au clic en dehors.
  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  const light = onDark && !scrolled;
  const displayName = user?.full_name || user?.email || "";
  const initial = displayName ? displayName[0].toUpperCase() : "";

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-colors duration-300 ${
          scrolled ? "bg-cream/90 backdrop-blur-sm" : "bg-transparent"
        }`}
      >
        <div className="max-w-content mx-auto flex items-center justify-between px-6 py-5">
          <a href="#top" className={`flex items-center gap-2 font-display text-xl tracking-tight transition-colors ${light ? "text-cream-fixed" : "text-ink"}`}>
            H-Company
          </a>

          {isLoading ? (
            <span className="w-9 h-9 rounded-full bg-ink/10 animate-pulse" aria-hidden="true" />
          ) : isAuthenticated ? (
            <div className="flex items-center gap-2">
              <NotificationBell />
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className={`flex items-center pl-1.5 pr-1.5 py-1.5 rounded-full border transition-colors duration-300 ${light ? "border-white/30 hover:bg-white/10" : "border-ink/20 hover:bg-ink/[0.04]"}`}
                >
                  <span className="w-8 h-8 rounded-full bg-[#C89A3D] text-ink flex items-center justify-center text-xs font-semibold">
                    {initial}
                  </span>
                </button>

                <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, scale: 0.96, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: -4 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="absolute right-0 mt-2.5 w-64 bg-surface border border-line rounded-2xl shadow-xl overflow-hidden origin-top-right"
                  >
                    <div className="flex items-center gap-3 px-4 py-4 bg-ink-fixed text-cream-fixed">
                      <span className="w-10 h-10 rounded-full bg-[#C89A3D] text-ink flex items-center justify-center text-sm font-semibold shrink-0">
                        {initial}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{displayName}</p>
                        {user?.email && <p className="text-xs text-cream-fixed/60 truncate">{user.email}</p>}
                      </div>
                    </div>

                    <div className="py-1.5">
                      <Link
                        to={homeFor(user)}
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 w-full text-left text-sm text-ink px-4 py-2.5 hover:bg-ink/[0.04] transition-colors"
                      >
                        <LayoutDashboard size={15} className="text-ink-soft" />
                        {user?.role === "admin" ? t("nav.adminSpace") : user?.role === "agent" ? t("nav.agentSpace") : user?.role === "partner" ? t("nav.dashboard") : (t("nav.myApp") !== "nav.myApp" ? t("nav.myApp") : "Mon espace")}
                      </Link>
                      <Link
                        to="/settings"
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 w-full text-left text-sm text-ink px-4 py-2.5 hover:bg-ink/[0.04] transition-colors"
                      >
                        <SettingsIcon size={15} className="text-ink-soft" />
                        {t("nav.manageAccount")}
                      </Link>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          signOut();
                        }}
                        className="flex items-center gap-2.5 w-full text-left text-sm text-red-600 px-4 py-2.5 hover:bg-red-50 transition-colors"
                      >
                        <LogOut size={15} />
                        {t("nav.logout")}
                      </button>
                    </div>
                  </motion.div>
                )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <Link
              to="/connexion"
              className={`text-sm font-medium border rounded-full px-5 py-2 transition-colors duration-300 ${light ? "text-cream-fixed border-white/30 hover:bg-white/15" : "text-ink border-ink/20 hover:bg-ink hover:text-cream"}`}
            >
              {t("nav.signin")}
            </Link>
          )}
        </div>
      </header>
    </>
  );
}
