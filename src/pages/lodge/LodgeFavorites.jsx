import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import LodgeLayout from "../../components/lodge/LodgeLayout.jsx";
import LodgeAuthGate from "../../components/lodge/AuthGate.jsx";
import { EmptyState, ErrorState, PropertyGrid, Spinner, useLodgeUi } from "../../components/lodge/Shared.jsx";
import { useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { api } from "../../lib/api.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

function Content() {
  const ui = useLodgeUi();
  const f = ui.favorites;
  const { token } = useUser();
  const { money } = useShopMoney();
  usePageMeta({ title: f.title });
  const { data, loading, error, reload } = useLoad(() => api.lodge.favorites(token), [token]);
  return (
    <LodgeLayout>
      <h1 className="font-display text-3xl sm:text-4xl text-ink mb-8">{f.title}</h1>
      {loading && !data && <Spinner label={ui.common.loading} />}
      {error && <ErrorState onRetry={reload} />}
      {data && data.length === 0 && <EmptyState icon={Heart} title={f.empty} hint={f.emptyHint} action={<Link to="/logement/recherche" className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5 hover:bg-coffee-dark">{ui.trips.explore}</Link>} />}
      {data && data.length > 0 && <PropertyGrid items={data} money={money} />}
    </LodgeLayout>
  );
}

export default function LodgeFavorites() {
  const ui = useLodgeUi();
  return <LodgeAuthGate message={ui.favorites.signIn}><Content /></LodgeAuthGate>;
}
