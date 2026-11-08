import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import ShopLayout from "../../components/shop/ShopLayout.jsx";
import AuthGate from "../../components/shop/AuthGate.jsx";
import { EmptyState, ErrorState, ProductGrid, Spinner, useShopUi } from "../../components/shop/Shared.jsx";
import { useLoad } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { api } from "../../lib/api.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

function Inner() {
  const ui = useShopUi();
  const f = ui.favorites;
  const { withAuth } = useUser();
  usePageMeta({ title: f.title });
  const { data, loading, error, reload } = useLoad(() => withAuth((t) => api.shop.favorites(t)), []);
  return (
    <ShopLayout>
      <h1 className="font-display text-3xl sm:text-4xl text-ink mb-8">{f.title}</h1>
      {loading && <Spinner label={ui.common.loading} />}
      {error && <ErrorState onRetry={reload} />}
      {data && data.length === 0 && <EmptyState icon={Heart} title={f.empty} hint={f.emptyHint} action={<Link to="/shopping/produits" className="rounded-full bg-ink text-cream text-sm px-6 py-3">{ui.cart.continue}</Link>} />}
      {data && data.length > 0 && <ProductGrid products={data} />}
    </ShopLayout>
  );
}
export default function FavoritesPage() {
  const ui = useShopUi();
  return <AuthGate message={ui.favorites.signIn}><Inner /></AuthGate>;
}
