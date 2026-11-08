import Logo from "../ui/Logo.jsx";
import { Link, useLocation } from "react-router-dom";
import { LayoutGrid, FileText, Activity, Tag, Boxes, Compass, Settings as SettingsIcon, LogOut } from "lucide-react";

const NAV_ITEMS = [
  { key: "overview", label: "Vue d'ensemble", icon: LayoutGrid },
  { key: "apps", label: "Mes apps", icon: Boxes },
  { key: "services", label: "Mes services", icon: Compass },
  { key: "offers", label: "Offres", icon: Tag },
  { key: "contract", label: "Contrat", icon: FileText },
  { key: "activity", label: "Activité", icon: Activity },
];

export default function DashboardSidebar({ active, onSelect, user, onSignOut, items }) {
  const nav = items || NAV_ITEMS;
  const displayName = user?.full_name || user?.email || "";
  const initial = displayName ? displayName[0].toUpperCase() : "";
  const location = useLocation();
  const onDashboard = location.pathname === "/dashboard";

  return (
    <aside className="hidden md:flex md:w-64 shrink-0 flex-col border-r border-line bg-surface h-screen sticky top-0">
      <div className="px-6 py-6 border-b border-line">
        <Link to="/" className="flex items-center gap-2 font-display text-xl text-ink"><Logo size={26} />H-Company</Link>
        <p className="text-xs text-ink-soft mt-1">Espace partenaire</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map(({ key, label, icon: Icon }) =>
          onDashboard ? (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active === key
                  ? "bg-ink text-cream"
                  : "text-ink-soft hover:bg-cream hover:text-ink"
              }`}
            >
              <Icon size={18} strokeWidth={1.8} />
              {label}
            </button>
          ) : (
            <Link
              key={key}
              to="/dashboard"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-ink-soft hover:bg-cream hover:text-ink transition-colors"
            >
              <Icon size={18} strokeWidth={1.8} />
              {label}
            </Link>
          )
        )}

        <Link
          to="/settings"
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            active === "settings" ? "bg-ink text-cream" : "text-ink-soft hover:bg-cream hover:text-ink"
          }`}
        >
          <SettingsIcon size={18} strokeWidth={1.8} />
          Réglages
        </Link>
      </nav>

      <div className="px-3 py-4 border-t border-line">
        <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
          <span className="w-8 h-8 rounded-full bg-[#C89A3D] text-ink flex items-center justify-center text-xs font-semibold shrink-0">
            {initial}
          </span>
          <span className="text-sm text-ink truncate">{displayName}</span>
        </div>
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-ink-soft hover:bg-cream hover:text-ink transition-colors"
        >
          <LogOut size={18} strokeWidth={1.8} />
          Se déconnecter
        </button>
      </div>
    </aside>
  );
}
