import { mem } from "../../lib/memStore.js";
import { useState } from "react";
import { Link } from "react-router-dom";
import Logo from "../ui/Logo.jsx";
import { Megaphone, Users, ClipboardList, LogOut, ExternalLink, Search, Compass, Layers, GraduationCap, ShieldCheck, PlayCircle, ShoppingBag, BedDouble, Bus, UtensilsCrossed, Mountain, Crown, Wallet, Globe2, ChevronsLeft, ChevronsRight, Bot } from "lucide-react";

const NAV_ITEMS = [
  { key: "applications", label: "Candidatures", icon: Users },
  { key: "money", label: "H-Money", icon: Wallet },
  { key: "geo", label: "Pays & taux", icon: Globe2 },
  { key: "promos", label: "Publicités", icon: Megaphone },
  { key: "assistant", label: "Assistante", icon: Bot },
  { key: "partnerHub", label: "Invitations & plans", icon: Crown },
  { key: "requests", label: "Toutes les demandes", icon: ClipboardList },
  { key: "serviceRequests", label: "Abonnements clients", icon: Compass },
  { key: "serviceCatalog", label: "Catalogue services", icon: Layers },
  { key: "learning", label: "H-Learning", icon: PlayCircle },
  { key: "shopping", label: "H-Shopping", icon: ShoppingBag },
  { key: "lodging", label: "H-Logement", icon: BedDouble },
  { key: "transport", label: "H-Transport", icon: Bus },
  { key: "restaurant", label: "H-Restaurant", icon: UtensilsCrossed },
  { key: "tourism", label: "H-Tourisme", icon: Mountain },
  { key: "trainingRequests", label: "Formations d'équipe", icon: GraduationCap },
  { key: "agents", label: "Agents", icon: ShieldCheck },
];

const GOLD = "var(--color-latte)"; // café au lait — suit le thème clair/sombre
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");

/**
 * Sidebar admin sombre aux couleurs H-Company.
 * Props optionnelles :
 *  - counts : { applications: 3, requests: 2 } → pastilles
 *  - onOpenPalette : ouvre la palette de commandes
 */
export default function AdminSidebar({ user, onSignOut, view, onViewChange, counts = {}, onOpenPalette }) {
  const displayName = user?.full_name || (user?.email || "").split("@")[0] || "Administrateur";
  const [rail, setRail] = useState(() => mem.get("hc_admin_rail", false));
  const toggle = () => setRail((r) => { const n = !r; mem.set("hc_admin_rail", n); return n; });
  const initial = displayName ? displayName[0].toUpperCase() : "A";

  return (
    <>
      <aside
        aria-label="Navigation admin"
        data-testid="admin-sidebar"
        className={`hidden md:flex shrink-0 flex-col bg-ink-fixed text-cream-fixed h-screen sticky top-0 self-start border-r border-white/10 transition-[width] duration-200 ${rail ? "w-[68px]" : "w-60"}`}
      >
        <div className={`h-14 shrink-0 flex items-center border-b border-white/10 ${rail ? "justify-center" : "justify-between px-4"}`}>
          <Link to="/" className="flex items-center gap-2.5 min-w-0" title="H-Company">
            <Logo size={28} />
            {!rail && <span className="font-display text-lg leading-none truncate">H-Company</span>}
          </Link>
          {!rail && (
            <button onClick={toggle} aria-label="Réduire le menu" className="w-8 h-8 rounded-md text-cream-fixed/50 hover:bg-white/10 hover:text-cream-fixed flex items-center justify-center">
              <ChevronsLeft size={16} />
            </button>
          )}
        </div>

        {onOpenPalette && (
          <div className="px-2.5 pt-3">
            <button
              onClick={onOpenPalette}
              title="Rechercher"
              className={`w-full flex items-center gap-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] px-3 py-2 text-sm text-cream-fixed/55 transition-colors ${rail ? "justify-center" : ""}`}
            >
              <Search size={15} />
              {!rail && <><span className="flex-1 text-left">Rechercher…</span>
              <kbd className="text-[10px] font-sans border border-white/15 rounded px-1.5 py-0.5 text-cream-fixed/60">{isMac ? "⌘" : "Ctrl"} K</kbd></>}
            </button>
          </div>
        )}

        <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2.5 py-3 space-y-0.5">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
            const active = view === key;
            const count = counts[key];
            return (
              <button
                key={key}
                onClick={() => onViewChange(key)}
                aria-current={active ? "page" : undefined}
                title={rail ? label : undefined}
                className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${rail ? "justify-center" : ""} ${
                  active ? "bg-white/[0.09] text-cream-fixed font-medium" : "text-cream-fixed/60 hover:bg-white/[0.05] hover:text-cream-fixed"
                }`}
              >
                {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r" style={{ backgroundColor: GOLD }} />}
                <span className="relative shrink-0" style={active ? { color: GOLD } : undefined}>
                  <Icon size={18} strokeWidth={1.8} />
                  {rail && count > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ backgroundColor: GOLD }} />}
                </span>
                {!rail && <span className="flex-1 text-left truncate">{label}</span>}
                {!rail && count > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-md text-[11px] font-semibold flex items-center justify-center text-ink-fixed" style={{ backgroundColor: GOLD }}>
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-white/10 p-2.5 space-y-1.5">
          {rail && (
            <button onClick={toggle} aria-label="Agrandir le menu" className="w-full h-9 rounded-lg text-cream-fixed/50 hover:bg-white/10 hover:text-cream-fixed flex items-center justify-center">
              <ChevronsRight size={17} />
            </button>
          )}
          <div className={`flex items-center gap-2.5 ${rail ? "justify-center" : "px-1.5"}`}>
            <span className="w-9 h-9 rounded-full bg-white/[0.09] flex items-center justify-center font-display shrink-0" title={displayName}>{initial}</span>
            {!rail && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{displayName}</p>
                <p className="text-[11px] text-cream-fixed/50">Administrateur</p>
              </div>
            )}
            {!rail && (
              <button onClick={onSignOut} title="Se déconnecter" aria-label="Se déconnecter" className="w-8 h-8 rounded-md flex items-center justify-center text-cream-fixed/50 hover:bg-white/10 hover:text-latte">
                <LogOut size={16} />
              </button>
            )}
          </div>
          {rail && (
            <button onClick={onSignOut} title="Se déconnecter" aria-label="Se déconnecter" className="w-full h-9 rounded-lg flex items-center justify-center text-cream-fixed/50 hover:bg-white/10 hover:text-latte"><LogOut size={16} /></button>
          )}
        </div>
      </aside>

      {/* Mobile : barre du bas */}
      <nav
        aria-label="Navigation admin"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-ink-fixed text-cream-fixed flex overflow-x-auto border-t border-white/10"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
          const active = view === key;
          const count = counts[key];
          return (
            <button
              key={key}
              onClick={() => onViewChange(key)}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center gap-1 py-2.5 px-4 text-[11px] font-medium shrink-0 min-w-[76px] ${active ? "text-cream-fixed" : "text-cream-fixed/50"}`}
            >
              <span
                className={`absolute top-0 h-[2px] w-10 rounded-full ${active ? "opacity-100" : "opacity-0"}`}
                style={{ backgroundColor: GOLD }}
              />
              <span className="relative" style={active ? { color: GOLD } : undefined}>
                <Icon size={20} strokeWidth={1.8} />
                {count > 0 && (
                  <span
                    className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full text-ink-fixed text-[10px] font-semibold flex items-center justify-center"
                    style={{ backgroundColor: GOLD }}
                  >
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </span>
              {label}
            </button>
          );
        })}
      </nav>
    </>
  );
}