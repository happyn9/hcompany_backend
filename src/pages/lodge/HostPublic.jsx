import { useParams } from "react-router-dom";
import { BadgeCheck, Languages } from "lucide-react";
import LodgeLayout from "../../components/lodge/LodgeLayout.jsx";
import { ErrorState, HostBadge, LodgeImage, PropertyGrid, Spinner, useLodgeUi } from "../../components/lodge/Shared.jsx";
import { useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { api } from "../../lib/api.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

export default function HostPublic() {
  const { id } = useParams();
  const ui = useLodgeUi();
  const h = ui.hostPublic;
  const { token } = useUser();
  const { money } = useShopMoney();
  const { data, loading, error, reload } = useLoad(() => api.lodge.host(id, token), [id, token]);
  usePageMeta({ title: data ? h.title(data.host.display_name) : "H-Logement" });
  if (loading && !data) return <LodgeLayout><Spinner label={ui.common.loading} /></LodgeLayout>;
  if (error) return <LodgeLayout width="max-w-2xl">{error.status === 404 ? <ErrorState message={h.notFound} /> : <ErrorState onRetry={reload} />}</LodgeLayout>;
  const { host, properties } = data;
  return (
    <LodgeLayout>
      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8 flex flex-col sm:flex-row gap-6 sm:items-center mb-12">
        <span className="w-24 h-24 rounded-full bg-latte-soft text-coffee flex items-center justify-center font-display text-4xl overflow-hidden shrink-0">
          {host.avatar ? <LodgeImage path={host.avatar} alt={host.display_name} ratio="w-full h-full" /> : host.display_name[0].toUpperCase()}
        </span>
        <div>
          <h1 className="font-display text-3xl text-ink">{host.display_name}</h1>
          <p className="text-sm text-ink-faint mt-1">{ui.property.memberSince(new Date(host.member_since).getFullYear())} · {ui.property.hostListings(host.properties_count)} · {ui.property.hostReviews(host.reviews_count)}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            <HostBadge verified={host.is_verified} />
            {host.partner_name && <span className="inline-flex items-center gap-1 text-xs text-coffee"><BadgeCheck size={14} /> {ui.property.partnerOf(host.partner_name)}</span>}
            {host.languages && <span className="inline-flex items-center gap-1 text-xs text-ink-soft"><Languages size={14} /> {host.languages}</span>}
          </div>
          {host.bio && <p className="mt-4 text-sm text-ink-soft leading-relaxed whitespace-pre-line max-w-2xl">{host.bio}</p>}
        </div>
      </section>
      <h2 className="font-display text-2xl text-ink mb-6">{h.listings}</h2>
      <PropertyGrid items={properties} money={money} />
    </LodgeLayout>
  );
}
