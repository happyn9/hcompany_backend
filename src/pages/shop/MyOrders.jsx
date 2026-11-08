import { Link } from "react-router-dom";
import { Package } from "lucide-react";
import ShopLayout from "../../components/shop/ShopLayout.jsx";
import AuthGate from "../../components/shop/AuthGate.jsx";
import { EmptyState, ErrorState, ShopImage, Spinner, StatusPill, useShopUi } from "../../components/shop/Shared.jsx";
import { useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

function Inner() {
  const ui = useShopUi();
  const o = ui.orders;
  const { lang } = useLanguage();
  const { withAuth } = useUser();
  const { pivotMoney } = useShopMoney();
  usePageMeta({ title: o.title });
  const { data, loading, error, reload } = useLoad(() => withAuth((t) => api.shop.myOrders(t)), []);
  const date = (iso) => new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" });
  return (
    <ShopLayout width="max-w-4xl">
      <h1 className="font-display text-3xl sm:text-4xl text-ink">{o.title}</h1>
      <p className="text-ink-soft mt-2 mb-8 max-w-xl">{o.lead}</p>
      {loading && <Spinner label={ui.common.loading} />}
      {error && <ErrorState onRetry={reload} />}
      {data && data.length === 0 && <EmptyState icon={Package} title={o.empty} action={<Link to="/shopping/produits" className="rounded-full bg-ink text-cream text-sm px-6 py-3">{ui.cart.continue}</Link>} />}
      {data && data.length > 0 && (
        <ul className="space-y-4">
          {data.map((ord) => (
            <li key={ord.code}>
              <Link to={`/shopping/mes-commandes/${ord.code}`} className="block rounded-3xl border border-line bg-surface p-5 hover:border-coffee-light transition-colors">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-medium text-ink">{ord.shop.name}</p>
                    <p className="text-xs text-ink-faint mt-0.5"><span className="font-mono">{ord.code}</span> · {o.placed(date(ord.created_at))}</p>
                  </div>
                  <StatusPill status={ord.status} label={ui.common.orderStatus[ord.status] || ord.status} />
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {ord.items.slice(0, 4).map((i) => <ShopImage key={i.id} path={i.image_path} ratio="w-12 h-12" className="rounded-xl ring-2 ring-surface" />)}
                  </div>
                  <p className="text-sm text-ink-soft flex-1">{o.items(ord.items.reduce((s, i) => s + i.quantity, 0))}</p>
                  <p className="font-display text-xl text-ink">{pivotMoney(ord.total)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ShopLayout>
  );
}
export default function MyOrders() { return <AuthGate><Inner /></AuthGate>; }
