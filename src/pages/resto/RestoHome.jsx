import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarCheck, Crosshair, MapPin, Store, UtensilsCrossed, Box, Zap } from "lucide-react";
import NavBar from "../../components/layout/NavBar.jsx";
import Footer from "../../components/layout/Footer.jsx";
import { RestoImage, Spinner, useRestoUi } from "../../components/restaurant/Shared.jsx";
import SearchForm from "../../components/restaurant/SearchForm.jsx";
import { useLoad } from "../../data/shop.js";
import { api } from "../../lib/api.js";
import { CITY_COORDS, coordOf } from "../../lib/cities.js";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const GOLD = "#F4C95D";
const BLOB = ["60% 40% 55% 45% / 50% 55% 45% 50%", "45% 55% 40% 60% / 55% 45% 55% 45%", "55% 45% 60% 40% / 45% 60% 40% 55%", "50% 50% 45% 55% / 60% 40% 60% 40%"];

function Cloche() {
  return (
    <svg viewBox="0 0 320 300" className="w-full max-w-[360px] drop-shadow-xl" aria-hidden="true">
      <defs><radialGradient id="rh-glow" cx="50%" cy="45%" r="55%"><stop offset="0" stopColor="#FFF6D8" /><stop offset="1" stopColor="#FFF6D8" stopOpacity="0" /></radialGradient></defs>
      <circle cx="160" cy="150" r="140" fill="url(#rh-glow)" />
      <ellipse cx="160" cy="232" rx="118" ry="20" fill="#E9E4DC" /><ellipse cx="160" cy="226" rx="118" ry="19" fill="#F6F2EC" />
      <path d="M62 226c0-62 44-108 98-108s98 46 98 108z" fill="#D8DDE3" /><path d="M72 222c4-52 40-92 88-92" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" opacity=".65" />
      <circle cx="160" cy="112" r="11" fill="#B9C0C9" /><rect x="40" y="224" width="240" height="8" rx="4" fill="#C7CDD4" />
      <path d="M118 84c-8-14 8-20 0-34M160 74c-8-14 8-20 0-34M202 84c-8-14 8-20 0-34" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".8" />
      <g transform="translate(250 150) rotate(18)"><rect x="0" y="0" width="7" height="70" rx="3" fill="#C7CDD4" /><path d="M-6 0v24M3.5 0v24M13 0v24" stroke="#C7CDD4" strokeWidth="4" strokeLinecap="round" /></g>
      <g transform="translate(40 156) rotate(-12)"><path d="M0 0c10 4 18 20 8 52-4 6-12 6-16 0C-18 22-10 4 0 0z" fill="#E8735A" /><path d="M0 0c2-8 8-10 12-8" stroke="#4C8C4A" strokeWidth="4" fill="none" strokeLinecap="round" /></g>
    </svg>
  );
}

const copy = {
  fr: { title: "Les meilleures tables, réservées en 3D.", sub: "Restaurants, cafés et bonnes adresses de RD Congo et de Zambie.", where: "Quelle est votre ville ?", loc: "Ma position", go: "Voir",
        top: "Top restaurants dans H-Company", topSub: "Confismila et tous les restaurants qui rejoignent le réseau.", anything: "Tout pour un bon repas", a1: ["Les meilleures adresses de votre ville", "Cuisine locale, grillades, cafés : choisissez parmi les restaurants du réseau, avec photos, menu et avis."], a2: ["Réservation immédiate", "Choisissez votre table, confirmez, et recevez un rappel. Sans appel ni attente."], a3: ["Salle en 3D & commande à l'avance", "Promenez-vous dans la salle, touchez la table qui vous plaît et passez votre commande avant d'arriver."],
        countries: "Pays où nous sommes présents", soon: "Bientôt", book: "Réserver une table", empty: "Aucun restaurant n'est encore en ligne.", emptyHint: "Les premiers restaurants arrivent.", denied: "Position indisponible : choisissez votre ville.", none: "Aucune ville proche avec des restaurants pour l'instant." },
  en: { title: "The best tables, booked in 3D.", sub: "Restaurants, cafés and great spots in DR Congo and Zambia.", where: "What's your city?", loc: "Use current location", go: "Go",
        top: "Top restaurants on H-Company", topSub: "Confismila and every restaurant joining the network.", anything: "Everything for a great meal", a1: ["Your city's best places", "Local food, grills, cafés: pick from the network's restaurants, with photos, menu and reviews."], a2: ["Instant booking", "Pick your table, confirm, get a reminder. No phone calls, no waiting."], a3: ["3D room & pre-order", "Walk around the room, tap the table you like and order before you arrive."],
        countries: "Countries where we operate", soon: "Coming soon", book: "Book a table", empty: "No restaurant is live yet.", emptyHint: "The first restaurants are on their way.", denied: "Location unavailable: pick your city.", none: "No nearby city with restaurants yet." },
};
const COUNTRIES = [["🇨🇩", "RD Congo", "DR Congo"], ["🇿🇲", "Zambie", "Zambia"]];
const SOON = [["🇳🇦", "Namibie", "Namibia"], ["🇹🇿", "Tanzanie", "Tanzania"], ["🇿🇦", "Afrique du Sud", "South Africa"]];

function nearest(lat, lng, names) {
  let best = null, bd = Infinity;
  names.forEach((n) => { const c = coordOf(n); if (!c) return; const d = (c[0] - lat) ** 2 + (c[1] - lng) ** 2; if (d < bd) { bd = d; best = n; } });
  return best;
}

export default function RestoHome() {
  const ui = useRestoUi();
  const { lang } = useLanguage();
  const c = copy[lang === "en" ? "en" : "fr"];
  const navigate = useNavigate();
  const toast = useToast();
  usePageMeta({ title: "H-Restaurant", description: c.sub });
  const { data, error, loading } = useLoad(() => api.resto.home(), []);
  const [city, setCity] = useState("");
  const cityNames = useMemo(() => (data?.cities || []).map((x) => x.city), [data]);
  const goCity = (e) => { e?.preventDefault(); navigate(`/restaurant/recherche${city.trim() ? `?city=${encodeURIComponent(city.trim())}` : ""}`); };
  const locate = () => {
    if (!navigator.geolocation) { toast?.error?.(c.denied); return; }
    navigator.geolocation.getCurrentPosition((p) => {
      const pool = cityNames.length ? cityNames : Object.keys(CITY_COORDS);
      const n = nearest(p.coords.latitude, p.coords.longitude, pool);
      if (!n) { toast?.error?.(c.none); return; }
      navigate(`/restaurant/recherche?city=${encodeURIComponent(n)}`);
    }, () => toast?.error?.(c.denied), { timeout: 8000, maximumAge: 600000 });
  };
  const top = useMemo(() => [...(data?.featured || [])].sort((a, b) => (/confismila/i.test(b.name) ? 1 : 0) - (/confismila/i.test(a.name) ? 1 : 0)).slice(0, 8), [data]);

  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      {/* Hero */}
      <section className="relative pt-[68px] text-[#2A1A10]" style={{ background: GOLD }}>
        <div className="max-w-content mx-auto px-5 sm:px-6 py-10 sm:py-16 grid md:grid-cols-2 gap-8 items-center">
          <div className="flex justify-center order-2 md:order-1"><Cloche /></div>
          <div className="order-1 md:order-2">
            <h1 className="font-display text-4xl sm:text-6xl leading-[1.05] font-extrabold">{c.title}</h1>
            <p className="mt-5 text-xl font-bold">{c.sub}</p>
            <form onSubmit={goCity} className="mt-6 flex items-center rounded-lg bg-white shadow-lg p-1.5 gap-1.5 max-w-xl">
              <MapPin size={18} className="ml-3 text-neutral-500 shrink-0" />
              <input list="rh-cities" value={city} onChange={(e) => setCity(e.target.value)} placeholder={c.where} aria-label={c.where} className="flex-1 min-w-0 px-2 py-3 text-neutral-900 placeholder:text-neutral-500 outline-none !shadow-none !ring-0 !border-0 bg-transparent" />
              <datalist id="rh-cities">{(cityNames.length ? cityNames : Object.keys(CITY_COORDS)).map((n) => <option key={n} value={n} />)}</datalist>
              <button type="button" onClick={locate} className="hidden sm:inline-flex items-center gap-2 rounded-md bg-[#E6F2EC] text-[#0B5B45] font-bold text-sm px-4 py-3 whitespace-nowrap"><Crosshair size={16} />{c.loc}</button>
              <button className="inline-flex items-center rounded-md bg-[#2A1A10] text-white font-bold text-sm px-4 py-3 whitespace-nowrap">{c.go}</button>
            </form>
            <button type="button" onClick={locate} className="sm:hidden mt-3 inline-flex items-center gap-2 rounded-md bg-[#E6F2EC] text-[#0B5B45] font-bold text-sm px-4 py-3"><Crosshair size={16} />{c.loc}</button>
          </div>
        </div>
        <svg viewBox="0 0 1440 80" preserveAspectRatio="none" className="block w-full h-10 sm:h-16 -mb-px" aria-hidden="true"><path d="M0 80V40C240 0 480 0 720 24s480 40 720 0v56z" className="fill-cream" /></svg>
      </section>

      <main className="max-w-content mx-auto px-5 sm:px-6">
        {/* Réserver une table */}
        <section className="-mt-2 mb-14">
          <h2 className="font-bold text-xl text-ink mb-3 flex items-center gap-2"><CalendarCheck size={20} />{c.book}</h2>
          <SearchForm cities={data?.cities || []} />
        </section>

        {/* Top restaurants */}
        <section className="mb-16">
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-ink text-center">{c.top}</h2>
          <p className="text-ink-soft text-center mt-2 mb-10">{c.topSub}</p>
          {loading && !data ? <Spinner label={ui.common.loading} /> : error && !data ? null : top.length ? (
            <ul className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-10">
              {top.map((r, i) => (
                <li key={r.id}><Link to={`/restaurant/r/${r.slug}`} className="group block text-center">
                  <span className="relative block mx-auto w-full max-w-[200px] overflow-hidden" style={{ borderRadius: BLOB[i % 4] }}><RestoImage path={r.image} alt={r.name} ratio="aspect-square" className="group-hover:scale-105 transition-transform duration-500" /></span>
                  <span className="relative -mt-4 inline-block rounded-md bg-[#F6E7C6] text-[#7A4B12] font-bold text-sm px-3 py-1">{r.name}</span>
                </Link></li>
              ))}
            </ul>
          ) : (
            <div className="text-center">
              <Link to="/restaurant/recherche?q=confismila" className="group inline-block">
                <span className="flex items-center justify-center w-44 h-44 mx-auto text-5xl font-display font-extrabold text-[#7A4B12]" style={{ background: "#F6E7C6", borderRadius: BLOB[0] }}>C</span>
                <span className="relative -mt-4 inline-block rounded-md bg-[#F6E7C6] text-[#7A4B12] font-bold text-sm px-3 py-1 border border-[#E5D2A5]">Confismila</span>
              </Link>
              <p className="text-ink-soft mt-6">{c.empty} {c.emptyHint}</p>
            </div>
          )}
        </section>

        {data?.cuisines?.length > 0 && (
          <section className="mb-16"><div className="flex flex-wrap justify-center gap-2.5">{data.cuisines.map((x) => <Link key={x.key} to={`/restaurant/recherche?cuisine=${x.key}`} className="rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink hover:border-coffee-light">{ui.cuisines[x.key] || x.key} <span className="text-ink-faint">· {x.count}</span></Link>)}</div></section>
        )}

        {/* Tout pour un bon repas */}
        <section className="mb-16">
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-ink text-center mb-10">{c.anything}</h2>
          <div className="grid md:grid-cols-3 gap-10">
            {[[Store, c.a1], [Zap, c.a2], [Box, c.a3]].map(([Ic, [t, d]]) => (
              <div key={t} className="text-center">
                <span className="mx-auto w-28 h-24 flex items-center justify-center" style={{ background: GOLD, borderRadius: BLOB[1] }}><Ic size={40} className="text-[#2A1A10]" strokeWidth={1.6} /></span>
                <h3 className="font-bold text-xl text-ink mt-5">{t}</h3><p className="text-ink-soft mt-2 leading-relaxed max-w-xs mx-auto">{d}</p>
              </div>))}
          </div>
        </section>
      </main>

      {/* Pays */}
      <section className="text-[#2A1A10] py-14 px-5 text-center" style={{ background: GOLD }}>
        <UtensilsCrossed className="mx-auto mb-4" size={36} />
        <h2 className="font-display text-3xl sm:text-4xl font-extrabold">{c.countries}</h2>
        <ul className="mt-8 flex flex-wrap justify-center gap-3 max-w-3xl mx-auto">
          {COUNTRIES.map(([f, fr, en]) => <li key={fr} className="rounded-full bg-neutral-100 text-neutral-900 font-bold px-5 py-2.5">{f} {lang === "en" ? en : fr}</li>)}
          {SOON.map(([f, fr, en]) => <li key={fr} className="rounded-full bg-white/40 text-[#2A1A10] font-semibold px-5 py-2.5 border border-[#2A1A10]/20">{f} {lang === "en" ? en : fr} · {c.soon}</li>)}
        </ul>
      </section>

      <section className="max-w-content mx-auto px-5 sm:px-6 py-14">
        <div className="rounded-3xl bg-ink text-cream p-8 sm:p-12 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="max-w-xl"><h2 className="font-display text-3xl mb-3">{ui.home.proTitle}</h2><p className="text-cream/75 leading-relaxed">{ui.home.proLead}</p></div>
          <Link to="/restaurant/pro" className="inline-flex items-center gap-2 rounded-full bg-cream text-ink text-sm font-medium px-6 py-3.5 whitespace-nowrap">{ui.home.proCta}<ArrowRight size={16} /></Link>
        </div>
      </section>
      <Footer />
    </div>
  );
}
