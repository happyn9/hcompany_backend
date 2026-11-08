import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Bus, ShieldCheck, Ticket, Undo2 } from "lucide-react";
import TransportLayout, { SearchForm, Spinner, useTransportUi } from "../../components/transport/Shared.jsx";
import { useLoad, useShopMoney } from "../../data/shop.js";
import { api } from "../../lib/api.js";
import { searchQuery, todayISO } from "../../lib/transport.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const ICONS = [ShieldCheck, Ticket, Undo2];

export default function TransportHome() {
  const ui = useTransportUi();
  const h = ui.home;
  const navigate = useNavigate();
  const { money } = useShopMoney();
  usePageMeta({ title: h.eyebrow });
  const { data: routes, loading } = useLoad(() => api.transport.popular(), []);
  const go = (v) => navigate(`/transport/recherche?${searchQuery(v)}`);

  return (
    <TransportLayout>
      <section className="pt-4 pb-10">
        <p className="text-xs uppercase tracking-[0.18em] text-coffee mb-3">{h.eyebrow}</p>
        <h1 className="font-display text-4xl sm:text-5xl text-ink max-w-3xl leading-tight">{h.title}</h1>
        <p className="text-ink-soft mt-4 max-w-2xl">{h.lead}</p>
        <div className="mt-8"><SearchForm onSubmit={go} /></div>
      </section>

      <section className="py-8">
        <h2 className="font-display text-2xl text-ink">{h.popular}</h2>
        <p className="text-sm text-ink-soft mt-1 mb-5">{h.popularLead}</p>
        {loading ? <Spinner label={ui.common.loading} /> : !routes?.length ? (
          <p className="rounded-3xl border border-dashed border-line p-8 text-sm text-ink-soft">{h.noPopular}</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {routes.map((r) => (
              <button key={`${r.origin}-${r.destination}`} onClick={() => go({ origin: r.origin, destination: r.destination, date: todayISO() })} className="text-left rounded-3xl border border-line bg-surface p-5 hover:border-coffee-light hover:shadow-lg hover:shadow-coffee/5 transition">
                <p className="font-medium text-ink flex items-center gap-2">{r.origin} <ArrowRight size={14} className="text-ink-faint" /> {r.destination}</p>
                <p className="text-sm text-coffee mt-2">{h.from(money(r.min_price))}</p>
                <p className="text-xs text-ink-faint mt-1">{h.trips(r.trips)}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="py-8 grid md:grid-cols-3 gap-4">
        {h.trust.map((t, i) => {
          const Icon = ICONS[i];
          return (
            <div key={t.t} className="rounded-3xl border border-line bg-surface p-6">
              <Icon className="text-coffee mb-3" size={22} />
              <p className="font-medium text-ink">{t.t}</p>
              <p className="text-sm text-ink-soft mt-1.5">{t.d}</p>
            </div>
          );
        })}
      </section>

      <section className="mt-8 rounded-3xl bg-latte-soft p-8 sm:p-10 flex flex-col sm:flex-row sm:items-center gap-6 justify-between">
        <div className="max-w-xl">
          <Bus className="text-coffee mb-3" />
          <h2 className="font-display text-2xl text-ink">{h.operatorTitle}</h2>
          <p className="text-sm text-ink-soft mt-2">{h.operatorText}</p>
        </div>
        <Link to="/transport/agence" className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5 whitespace-nowrap self-start sm:self-auto">{h.operatorCta}</Link>
      </section>
    </TransportLayout>
  );
}
