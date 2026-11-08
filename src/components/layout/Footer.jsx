import { Link } from "react-router-dom";
import { ArrowUp, ArrowUpRight, Mail, MapPin, MessageCircle, Moon, Sun } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import Logo from "../ui/Logo.jsx";
import { REGION_LIST, useRegion } from "../../context/RegionContext.jsx";

const SOCIALS = [
  { label: "LinkedIn", mark: "in", href: "https://linkedin.com" },
  { label: "X", mark: "X", href: "https://x.com" },
  { label: "Instagram", mark: "IG", href: "https://instagram.com" },
  { label: "Facebook", mark: "f", href: "https://facebook.com" },
  // TODO : remplacer par le vrai @ H-Company une fois le compte créé.
  { label: "TikTok", mark: "TT", href: "https://tiktok.com/@hcompany" },
  { label: "WhatsApp", mark: "WA", href: "https://wa.me/260770381780" },
];

const COPY = {
  fr: {
    tagline: "Le réseau qui relie entreprises, partenaires et talents autour de la technologie.",
    ctaTitle: "Un seul compte pour voyager, loger, acheter et apprendre.",
    ctaText: "Rejoignez le réseau H-Company : des services concrets, des partenaires vérifiés, des paiements protégés.",
    ctaPrimary: "Créer un compte", ctaSecondary: "Devenir partenaire",
    services: "Services", network: "Réseau", account: "Votre espace", help: "Ressources",
    svc: { bus: "H-Transport · Bus", parcel: "H-Transport · Colis", lodge: "H-Logement", food: "H-Restaurant", learn: "H-Learning", shop: "H-Shopping", soon: "Bientôt" },
    net: { about: "À propos", partners: "Partenaires", join: "Devenir partenaire", interp: "Interprétation" },
    acc: { signin: "Se connecter", signup: "Créer un compte", space: "Mon espace", trips: "Mes séjours", orders: "Mes commandes", host: "Devenir hôte", sell: "Vendre en ligne" },
    res: { track: "Suivre un colis", courses: "Cours gratuits", privacy: "Confidentialité", terms: "Conditions d'utilisation" },
    contact: "Nous écrire", location: "Lusaka, Zambie", whatsapp: "WhatsApp",
    rights: "Tous droits réservés.", madeIn: "Fait à Lusaka, pour tout le réseau.", top: "Haut de page", language: "Langue", theme: "Thème", light: "Clair", dark: "Sombre",
  },
  en: {
    tagline: "The network connecting companies, partners and talent around technology.",
    ctaTitle: "One account to travel, stay, shop and learn.",
    ctaText: "Join the H-Company network: real services, verified partners, protected payments.",
    ctaPrimary: "Create an account", ctaSecondary: "Become a partner",
    services: "Services", network: "Network", account: "Your space", help: "Resources",
    svc: { bus: "H-Transport · Bus", parcel: "H-Transport · Parcels", lodge: "H-Lodging", food: "H-Restaurant", learn: "H-Learning", shop: "H-Shopping", soon: "Soon" },
    net: { about: "About", partners: "Partners", join: "Become a partner", interp: "Interpretation" },
    acc: { signin: "Sign in", signup: "Create an account", space: "My space", trips: "My trips", orders: "My orders", host: "Become a host", sell: "Sell online" },
    res: { track: "Track a parcel", courses: "Free courses", privacy: "Privacy", terms: "Terms of service" },
    contact: "Write to us", location: "Lusaka, Zambia", whatsapp: "WhatsApp",
    rights: "All rights reserved.", madeIn: "Made in Lusaka, for the whole network.", top: "Back to top", language: "Language", theme: "Theme", light: "Light", dark: "Dark",
  },
};

function FootLink({ to, children, external }) {
  const cls = "group inline-flex items-center gap-1 text-sm text-cream-fixed/70 hover:text-cream-fixed transition-colors py-1.5 focus-visible:outline-2 focus-visible:outline-latte focus-visible:outline-offset-2 rounded";
  if (external || to.startsWith("mailto:") || to.startsWith("https://")) return <a href={to} className={cls} {...(to.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{children}</a>;
  return <Link to={to} className={cls}>{children}</Link>;
}

function Column({ title, children }) {
  return (
    <nav aria-label={title}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-latte mb-4">{title}</p>
      <ul className="space-y-0.5">{children}</ul>
    </nav>
  );
}

function Segmented({ label, children }) {
  return <div role="group" aria-label={label} className="inline-flex rounded-full border border-cream-fixed/20 p-0.5 gap-0.5">{children}</div>;
}

function SegBtn({ active, onClick, label, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} aria-label={label} title={label}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors inline-flex items-center focus-visible:outline-2 focus-visible:outline-latte ${active ? "bg-cream-fixed text-ink-fixed" : "text-cream-fixed/65 hover:text-cream-fixed"}`}>
      {children}
    </button>
  );
}

export default function Footer() {
  const { lang, switchLanguage } = useLanguage();
  const region = useRegion();
  const { mode, setMode } = useTheme();
  const c = COPY[lang] || COPY.fr;
  return (
    <footer className="bg-ink-fixed text-cream-fixed" aria-label="H-Company">
      <div className="max-w-content mx-auto px-6 pt-16 md:pt-20">
        {/* Bandeau d'appel */}
        <div className="rounded-3xl border border-cream-fixed/15 bg-cream-fixed/[0.04] p-8 md:p-12 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="max-w-xl">
            <h2 className="font-display italic text-3xl md:text-4xl leading-tight">{c.ctaTitle}</h2>
            <p className="mt-4 text-cream-fixed/70 leading-relaxed">{c.ctaText}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <Link to="/creer-un-compte" className="inline-flex items-center justify-center gap-2 rounded-full bg-latte text-ink-fixed text-sm font-semibold px-7 py-3.5 hover:brightness-110 transition">
              {c.ctaPrimary} <ArrowUpRight size={16} />
            </Link>
            <Link to="/infos#rejoindre" className="inline-flex items-center justify-center rounded-full border border-cream-fixed/30 text-cream-fixed text-sm font-medium px-7 py-3.5 hover:bg-cream-fixed/10 transition">
              {c.ctaSecondary}
            </Link>
          </div>
        </div>

        {/* Corps */}
        <div className="grid gap-12 lg:gap-8 py-14 md:py-16 lg:grid-cols-[1.4fr_2.6fr]">
          <div className="max-w-xs">
            <Link to="/" className="inline-flex items-center gap-2.5" aria-label="H-Company">
              <Logo size={30} />
              <span className="font-display italic text-2xl">H-Company</span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-cream-fixed/65">{c.tagline}</p>
            <ul className="mt-6 space-y-2.5 text-sm text-cream-fixed/75">
              <li><a href="mailto:contact@h-company.com" className="inline-flex items-center gap-2.5 hover:text-cream-fixed transition-colors"><Mail size={15} className="text-latte" /> contact@h-company.com</a></li>
              <li><a href="https://wa.me/260770381780" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2.5 hover:text-cream-fixed transition-colors"><MessageCircle size={15} className="text-latte" /> {c.whatsapp}</a></li>
              <li className="inline-flex items-center gap-2.5"><MapPin size={15} className="text-latte" /> {c.location}</li>
            </ul>
            <ul className="mt-6 flex flex-wrap gap-2">
              {SOCIALS.map((s) => (
                <li key={s.label}>
                  <a href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} title={s.label}
                    className="w-10 h-10 rounded-full border border-cream-fixed/20 flex items-center justify-center font-display italic text-sm text-cream-fixed/80 hover:border-latte hover:text-latte transition-colors focus-visible:outline-2 focus-visible:outline-latte">
                    {s.mark}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-10">
            <Column title={c.services}>
              <li><FootLink to="/h/transport-bus">{c.svc.bus}</FootLink></li>
              <li><FootLink to="/h/transport-colis">{c.svc.parcel}</FootLink></li>
              <li><FootLink to="/logement">{c.svc.lodge}</FootLink></li>
              <li><FootLink to="/h/restaurant">{c.svc.food}</FootLink></li>
              <li><FootLink to="/formations">{c.svc.learn}</FootLink></li>
              <li><FootLink to="/shopping">{c.svc.shop}</FootLink></li>
            </Column>
            <Column title={c.network}>
              <li><FootLink to="/infos#about">{c.net.about}</FootLink></li>
              <li><FootLink to="/infos#explorer">{c.net.partners}</FootLink></li>
              <li><FootLink to="/infos#rejoindre">{c.net.join}</FootLink></li>
              <li><FootLink to="/interpretation">{c.net.interp}</FootLink></li>
            </Column>
            <Column title={c.account}>
              <li><FootLink to="/connexion">{c.acc.signin}</FootLink></li>
              <li><FootLink to="/creer-un-compte">{c.acc.signup}</FootLink></li>
              <li><FootLink to="/dashboard">{c.acc.space}</FootLink></li>
              <li><FootLink to="/logement/mes-sejours">{c.acc.trips}</FootLink></li>
              <li><FootLink to="/shopping/mes-commandes">{c.acc.orders}</FootLink></li>
              <li><FootLink to="/logement/hote">{c.acc.host}</FootLink></li>
              <li><FootLink to="/shopping/vendre">{c.acc.sell}</FootLink></li>
            </Column>
            <Column title={c.help}>
              <li><FootLink to="/shopping/suivi">{c.res.track}</FootLink></li>
              <li><FootLink to="/formations#catalogue">{c.res.courses}</FootLink></li>
              <li><FootLink to="/confidentialite">{c.res.privacy}</FootLink></li>
              <li><FootLink to="/conditions">{c.res.terms}</FootLink></li>
            </Column>
          </div>
        </div>

        {/* Barre basse */}
        <div className="border-t border-cream-fixed/15 py-7 flex flex-col md:flex-row md:items-center justify-between gap-5 text-xs text-cream-fixed/60">
          <p>© {new Date().getFullYear()} H-Company. {c.rights} <span className="hidden sm:inline">· {c.madeIn}</span></p>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented label={c.theme}>
              <SegBtn active={mode === "light"} onClick={() => setMode("light")} label={c.light}><Sun size={13} /></SegBtn>
              <SegBtn active={mode === "dark"} onClick={() => setMode("dark")} label={c.dark}><Moon size={13} /></SegBtn>
            </Segmented>
            <label className="inline-flex items-center gap-2 rounded-full border border-cream-fixed/20 pl-3.5 pr-2 py-1.5">
              <span aria-hidden="true">{region.info.flag}</span>
              <span className="sr-only">{lang === "fr" ? "Pays" : "Country"}</span>
              <select value={region.country} onChange={(e) => region.setCountry(e.target.value)} className="bg-transparent text-cream-fixed/85 text-xs outline-none cursor-pointer max-w-[9rem]">
                {REGION_LIST.map((r) => <option key={r.code} value={r.code} className="text-ink">{r.name[lang] || r.name.fr}</option>)}
              </select>
              <span className="text-cream-fixed/50">·</span>
              <select value={region.currency} onChange={(e) => region.setCurrency(e.target.value)} aria-label={lang === "fr" ? "Devise" : "Currency"} className="bg-transparent text-cream-fixed/85 text-xs outline-none cursor-pointer">
                {["ZMW", "USD", "CDF", "EUR", "ZAR", "GBP"].map((cu) => <option key={cu} value={cu} className="text-ink">{cu}</option>)}
              </select>
            </label>
            <Segmented label={c.language}>
              <SegBtn active={lang === "fr"} onClick={() => switchLanguage("fr")} label="Français">FR</SegBtn>
              <SegBtn active={lang === "en"} onClick={() => switchLanguage("en")} label="English">EN</SegBtn>
            </Segmented>
            <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="inline-flex items-center gap-1.5 rounded-full border border-cream-fixed/20 px-3.5 py-2 font-medium text-cream-fixed/75 hover:text-cream-fixed hover:border-cream-fixed/40 transition-colors">
              <ArrowUp size={13} /> {c.top}
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
