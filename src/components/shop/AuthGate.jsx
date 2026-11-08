import { Link, useLocation } from "react-router-dom";
import { Lock } from "lucide-react";
import ShopLayout from "./ShopLayout.jsx";
import { Spinner, useShopUi } from "./Shared.jsx";
import { useUser } from "../../context/Usercontext.jsx";

/** Affiche `children` uniquement pour un utilisateur connecté, sinon invite à se connecter. */
export default function AuthGate({ children, message, width = "max-w-xl" }) {
  const ui = useShopUi().common;
  const { isAuthenticated, isLoading } = useUser();
  const loc = useLocation();
  if (isLoading) return <ShopLayout><Spinner label={ui.loading} /></ShopLayout>;
  if (!isAuthenticated) {
    const redirectTo = loc.pathname + loc.search;
    return (
      <ShopLayout width={width}>
        <div className="rounded-3xl border border-line bg-surface p-10 text-center">
          <Lock className="mx-auto text-coffee mb-4" />
          <p className="text-ink mb-6">{message || ui.signInRequired}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/connexion" state={{ redirectTo }} className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5">{ui.signIn}</Link>
            <Link to="/creer-un-compte" state={{ redirectTo }} className="rounded-full border border-line text-ink text-sm font-medium px-6 py-3.5">{ui.createAccount}</Link>
          </div>
        </div>
      </ShopLayout>
    );
  }
  return children;
}
