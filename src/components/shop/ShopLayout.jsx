import { PageBack } from "../ui/BackButton.jsx";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Heart, Package, Search, ShoppingBag, Store, Truck } from "lucide-react";
import NavBar from "../layout/NavBar.jsx";
import Footer from "../layout/Footer.jsx";
import { useCart } from "../../context/CartContext.jsx";
import { useCategories } from "../../data/shop.js";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useShopUi } from "./Shared.jsx";

function BarLink({ to, icon: Icon, label, badge }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors ${isActive ? "bg-latte-soft text-coffee" : "text-ink-soft hover:text-ink"}`
      }
      aria-label={label}
    >
      <Icon size={18} />
      <span className="hidden lg:inline">{label}</span>
      {badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-coffee text-on-coffee text-[0.65rem] font-semibold flex items-center justify-center">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </NavLink>
  );
}

export function ShopBar() {
  const ui = useShopUi().bar;
  const { lang } = useLanguage();
  const { count } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const cats = useCategories().filter((c) => !c.parent_id).slice(0, 8);

  useEffect(() => {
    if (location.pathname !== "/shopping/produits") setQ("");
  }, [location.pathname]);

  const submit = (e) => {
    e.preventDefault();
    navigate(`/shopping/produits${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
  };

  return (
    <div className="sticky top-[68px] z-40 bg-cream/95 backdrop-blur border-b border-line">
      <div className="max-w-content mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
        <Link to="/shopping" className="font-display text-lg text-ink hidden sm:block whitespace-nowrap pr-1">
          H-Shopping
        </Link>
        <form onSubmit={submit} role="search" className="flex-1 relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={ui.searchPlaceholder}
            aria-label={ui.searchPlaceholder}
            className="w-full rounded-full border border-line bg-surface pl-10 pr-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-coffee focus:ring-2 focus:ring-coffee/15"
          />
        </form>
        <nav className="flex items-center gap-0.5" aria-label="H-Shopping">
          <BarLink to="/shopping/favoris" icon={Heart} label={ui.favorites} />
          <BarLink to="/shopping/mes-commandes" icon={Package} label={ui.orders} />
          <BarLink to="/shopping/panier" icon={ShoppingBag} label={ui.cart} badge={count} />
          <BarLink to="/shopping/vendeur" icon={Store} label={ui.sell} />
        </nav>
      </div>
      <div className="max-w-content mx-auto px-4 sm:px-6 pb-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar text-sm" key={lang}>
        <Link to="/shopping/produits" className="whitespace-nowrap rounded-full px-3 py-1 text-ink hover:bg-latte-soft font-medium">
          {ui.allProducts}
        </Link>
        {cats.map((c) => (
          <Link key={c.id} to={`/shopping/produits?categorie=${c.slug}`} className="whitespace-nowrap rounded-full px-3 py-1 text-ink-soft hover:bg-latte-soft hover:text-ink">
            {lang === "en" ? c.name_en : c.name_fr}
          </Link>
        ))}
        <Link to="/shopping/suivi" className="ml-auto whitespace-nowrap rounded-full px-3 py-1 text-coffee hover:bg-latte-soft inline-flex items-center gap-1.5">
          <Truck size={14} /> {ui.track}
        </Link>
      </div>
    </div>
  );
}

/** Gabarit commun des pages H-Shopping : navigation, barre boutique, pied de page. */
export default function ShopLayout({ children, width = "max-w-content", hideBar = false, className = "" }) {
  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <div className="pt-[68px]">
        {!hideBar && <ShopBar />}
        <main className={`${width} mx-auto px-4 sm:px-6 py-8 sm:py-10 ${className}`}><PageBack root="/shopping" />{children}</main>
      </div>
      <Footer />
    </div>
  );
}
