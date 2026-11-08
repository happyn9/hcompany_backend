import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, Banknote, Building2, CalendarCheck, Home, Hotel, ShieldCheck, Tent, BedDouble, Castle, Key, DoorOpen, Footprints } from "lucide-react";
import LodgeLayout from "../../components/lodge/LodgeLayout.jsx";
import SearchForm from "../../components/lodge/SearchForm.jsx";
import { EmptyState, ErrorState, LodgeImage, PropertyGrid, SectionTitle, Spinner, useLodgeUi } from "../../components/lodge/Shared.jsx";
import { useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { api } from "../../lib/api.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const TRUST_ICONS = [ShieldCheck, Banknote, CalendarCheck, BadgeCheck];
const TYPE_ICONS = { lodge: Hotel, hotel_room: BedDouble, apartment: Building2, house: Home, villa: Castle, guesthouse: Key, studio: Tent, room: DoorOpen };

export default function LodgeHome() {
  const ui = useLodgeUi();
  const h = ui.home;
  const { token } = useUser();
  const { money } = useShopMoney();
  usePageMeta({ title: "H-Logement", description: h.lead });
  const { data, error, loading, reload } = useLoad(() => api.lodge.home(token), [token]);
  const empty = data && data.totals.properties === 0;
  const sections = data
    ? [[h.featuredTitle, data.featured], [h.topTitle, data.top_rated], [h.latestTitle, data.latest]].filter(([, l], i, arr) => l.length && (i < 2 || !arr.slice(0, i).some(([, prev]) => prev.length >= 4)))
    : [];

  return (
    <LodgeLayout>
      <section className="relative overflow-hidden rounded-[2rem] bg-[#16261E] text-cream-fixed px-5 sm:px-12 pt-12 sm:pt-16 pb-8 sm:pb-10 mb-12">
        <svg className="absolute -right-24 -top-24 w-[440px] h-[440px] opacity-40" viewBox="0 0 400 400" aria-hidden="true">
          <circle cx="200" cy="200" r="190" fill="none" stroke="#A8D5B5" strokeOpacity="0.3" />
          <circle cx="200" cy="200" r="140" fill="none" stroke="#A8D5B5" strokeOpacity="0.22" strokeDasharray="4 8" />
          <circle cx="200" cy="200" r="90" fill="none" stroke="#A8D5B5" strokeOpacity="0.18" />
        </svg>
        <div className="relative max-w-3xl mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#A8D5B5] mb-4">{h.eyebrow}</p>
          <h1 className="font-display text-4xl sm:text-5xl leading-tight mb-5">{h.title}</h1>
          <p className="text-cream-fixed/75 leading-relaxed max-w-2xl">{h.lead}</p>
        </div>
        <div className="relative">
          <SearchForm />
          {data && !empty && <p className="mt-5 text-xs text-cream-fixed/60">{h.stats(data.totals.properties, data.totals.hosts).join(" · ")}</p>}
        </div>
      </section>

      <Link to="/app/logement" className="group mb-10 flex items-center justify-between gap-4 rounded-3xl border border-line bg-gradient-to-r from-latte-soft to-cream p-6 hover:border-coffee-light transition">
        <span className="flex items-center gap-4"><span className="w-12 h-12 rounded-2xl bg-coffee text-cream-fixed flex items-center justify-center"><Footprints size={22} /></span><span><span className="block font-display text-xl text-ink">{ui.walk.link}</span><span className="block text-sm text-ink-soft">{ui.walk.linkLead}</span></span></span>
        <ArrowRight className="text-coffee group-hover:translate-x-1 transition" size={20} />
      </Link>

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16" aria-label="H-Logement">
        {h.trust.map((t, i) => {
          const Icon = TRUST_ICONS[i];
          return (
            <div key={t.t} className="rounded-3xl border border-line bg-surface p-5">
              <span className="w-10 h-10 rounded-2xl bg-latte-soft text-coffee flex items-center justify-center mb-3"><Icon size={18} /></span>
              <p className="font-medium text-ink mb-1">{t.t}</p>
              <p className="text-sm text-ink-soft leading-relaxed">{t.d}</p>
            </div>
          );
        })}
      </section>

      {loading && <Spinner label={ui.common.loading} />}
      {error && <ErrorState onRetry={reload} />}

      {data && data.cities.length > 0 && (
        <section className="mb-16">
          <SectionTitle title={h.citiesTitle} lead={h.citiesLead} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {data.cities.slice(0, 8).map((c) => (
              <Link key={c.city} to={`/logement/recherche?q=${encodeURIComponent(c.city)}`} className="group relative rounded-3xl overflow-hidden block aspect-[4/5] bg-latte-soft">
                <LodgeImage path={c.image} alt={c.city} ratio="absolute inset-0" className="group-hover:scale-105 transition-transform duration-700" />
                <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <span className="absolute bottom-4 left-4 right-4 text-cream-fixed">
                  <span className="block font-display text-xl">{c.city}</span>
                  <span className="block text-xs text-cream-fixed/80">{h.cityCount(c.count)} · {h.cityFrom(money(c.min_price))}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {data && Object.keys(data.types).length > 0 && (
        <section className="mb-16">
          <SectionTitle title={h.typesTitle} />
          <div className="flex flex-wrap gap-3">
            {Object.entries(data.types).map(([t, n]) => {
              const Icon = TYPE_ICONS[t] || Home;
              return (
                <Link key={t} to={`/logement/recherche?type=${t}`} className="inline-flex items-center gap-3 rounded-full border border-line bg-surface px-5 py-3 text-sm text-ink hover:border-coffee-light transition">
                  <Icon size={18} className="text-coffee" /> {ui.typesPlural[t] || t} <span className="text-ink-faint">{n}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {sections.map(([title, items]) => (
        <section key={title} className="mb-16">
          <SectionTitle title={title} to="/logement/recherche" toLabel={h.seeAll} />
          <PropertyGrid items={items.slice(0, 4)} money={money} />
        </section>
      ))}

      {empty && (
        <div className="mb-16">
          <EmptyState icon={Hotel} title={h.emptyTitle} hint={h.emptyHint} action={<Link to="/logement/hote" className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5 hover:bg-coffee-dark">{h.hostCta}</Link>} />
        </div>
      )}

      <section className="relative overflow-hidden rounded-[2rem] bg-latte-soft px-6 sm:px-12 py-12 flex flex-col md:flex-row md:items-center gap-8 justify-between">
        <div className="max-w-xl">
          <h2 className="font-display text-3xl text-ink mb-3">{h.hostTitle}</h2>
          <p className="text-ink-soft leading-relaxed">{h.hostLead}</p>
        </div>
        <Link to="/logement/hote" className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-7 py-4 hover:bg-coffee-dark transition-colors self-start md:self-auto whitespace-nowrap">
          {h.hostCta} <ArrowRight size={16} />
        </Link>
      </section>
    </LodgeLayout>
  );
}
