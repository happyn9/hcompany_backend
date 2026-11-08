import { PageBack } from "../ui/BackButton.jsx";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, Heart, Home, Search } from "lucide-react";
import NavBar from "../layout/NavBar.jsx";
import Footer from "../layout/Footer.jsx";
import { useLodgeUi } from "./Shared.jsx";

function BarLink({ to, icon: Icon, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors ${isActive ? "bg-latte-soft text-coffee" : "text-ink-soft hover:text-ink"}`
      }
      aria-label={label}
    >
      <Icon size={18} />
      <span className="hidden lg:inline">{label}</span>
    </NavLink>
  );
}

export function LodgeBar() {
  const ui = useLodgeUi().bar;
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");

  useEffect(() => {
    if (location.pathname !== "/logement/recherche") setQ("");
  }, [location.pathname]);

  const submit = (e) => {
    e.preventDefault();
    navigate(`/logement/recherche${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
  };

  return (
    <div className="sticky top-[68px] z-40 bg-cream/95 backdrop-blur border-b border-line">
      <div className="max-w-content mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
        <Link to="/logement" className="font-display text-lg text-ink hidden sm:block whitespace-nowrap pr-1">
          H-Logement
        </Link>
        <form onSubmit={submit} role="search" className="flex-1 relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={ui.where}
            aria-label={ui.where}
            className="w-full rounded-full border border-line bg-surface pl-10 pr-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-coffee focus:ring-2 focus:ring-coffee/15"
          />
        </form>
        <nav className="flex items-center gap-0.5" aria-label="H-Logement">
          <BarLink to="/logement/favoris" icon={Heart} label={ui.favorites} />
          <BarLink to="/logement/mes-sejours" icon={CalendarDays} label={ui.trips} />
          <BarLink to="/logement/hote" icon={Home} label={ui.host} />
        </nav>
      </div>
    </div>
  );
}

/** Gabarit commun des pages H-Logement : navigation, barre, pied de page. */
export default function LodgeLayout({ children, width = "max-w-content", hideBar = false, className = "" }) {
  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <div className="pt-[68px]">
        {!hideBar && <LodgeBar />}
        <main className={`${width} mx-auto px-4 sm:px-6 py-8 sm:py-10 ${className}`}><PageBack root="/logement" />{children}</main>
      </div>
      <Footer />
    </div>
  );
}
