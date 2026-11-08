import { useCallback, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";
import NavBar from "../components/layout/NavBar.jsx";
import Footer from "../components/layout/Footer.jsx";
import FAQ from "../components/sections/FAQ.jsx";
import Reveal from "../components/ui/Reveal.jsx";
import BackLink from "../components/ui/BackLink.jsx";
import { HServiceArt, H_SERVICE_THEME } from "../components/art/ServiceArt.jsx";
import ServiceRequestPanel from "../components/services/ServiceRequestPanel.jsx";
import MarketplaceShowcase from "../components/services/showcases/MarketplaceShowcase.jsx";
import {
  RoutesShowcase,
  TrackingShowcase,
  CardsShowcase,
  CoursesShowcase,
  CorridorShowcase,
  LanguagesShowcase,
} from "../components/services/showcases/Showcases.jsx";
import { iconFor } from "../data/serviceIcons.js";
import {
  DEFAULT_SOON,
  KEY_BY_SLUG,
  SERVICE_ORDER,
  SLUG_BY_KEY,
  getServicePage,
  servicePath,
} from "../data/hServicePages.js";
import { useServiceCatalog, resolveServices } from "../hooks/useServiceCatalog.js";
import { useLanguage } from "../context/LanguageContext.jsx";
import { usePageMeta } from "../components/ui/HeadManager.jsx";
import { SERVICE_UI } from "../i18n/servicePageUi.js";

const PARTNER_SLUG = { lukondo: "lukondo", confismila: "confismila", hlearning: "h-learning" };

function Showcase({ page, theme, onNotify }) {
  switch (page.showcase) {
    case "routes":
      return <RoutesShowcase page={page} theme={theme} />;
    case "tracking":
      return <TrackingShowcase page={page} theme={theme} />;
    case "stays":
      return <CardsShowcase page={page} theme={theme} items={page.stays || []} />;
    case "dining":
      return <CardsShowcase page={page} theme={theme} items={page.options || []} />;
    case "courses":
      return <CoursesShowcase page={page} />;
    case "corridor":
      return <CorridorShowcase page={page} theme={theme} />;
    case "languages":
      return <LanguagesShowcase page={page} theme={theme} />;
    case "marketplace":
      return <MarketplaceShowcase onNotify={onNotify} />;
    default:
      return null;
  }
}

// Bouton d'action principal : ouvre le panneau de demande, ou — pour un
// service qui a sa propre page d'accueil (H-Learning) — mène directement à
// cette page.
function PrimaryCta({ page, onOpen, className }) {
  if (page.ctaTo) {
    return (
      <Link to={page.ctaTo} className={className}>
        {page.cta}
        <ArrowRight size={15} />
      </Link>
    );
  }
  return (
    <button type="button" onClick={onOpen} className={className}>
      {page.cta}
      <ArrowRight size={15} />
    </button>
  );
}

export default function HServicePage() {
  const { slug } = useParams();
  const { lang } = useLanguage();
  const ui = SERVICE_UI[lang] || SERVICE_UI.fr;
  const [panelOpen, setPanelOpen] = useState(false);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const catalogState = useServiceCatalog();

  const key = KEY_BY_SLUG[slug];
  const page = key ? getServicePage(key, lang) : null;
  usePageMeta(page ? { title: page.name, description: page.tagline } : null);

  if (!page) return <Navigate to="/infos#explorer" replace />;

  const theme = H_SERVICE_THEME[key];
  const resolved = resolveServices(catalogState).list.find((s) => s.key === key);
  const soon = page.live ? false : resolved ? resolved.disabled : DEFAULT_SOON.includes(key);
  const related = SERVICE_ORDER.filter((k) => k !== key).slice(0, 3);
  const partnerSlug = page.partner ? PARTNER_SLUG[page.partner] : null;
  const faqItems = (page.faq || []).map((f) => ({ question: f.q, answer: f.a }));

  const scrollToPreview = () => document.getElementById("apercu")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const isMarketplace = page.showcase === "marketplace";

  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <main>
        {/* ───────── Héros ───────── */}
        <section
          id="haut"
          className="relative overflow-hidden pt-16 text-cream-fixed"
          style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}
        >
          <div className="absolute inset-y-0 right-0 w-full md:w-[55%] opacity-35 md:opacity-100" aria-hidden="true">
            <HServiceArt name={key} className="w-full h-full" />
            <div className="hidden md:block absolute inset-0" style={{ background: `linear-gradient(90deg, ${theme.from} 0%, transparent 45%)` }} />
          </div>
          <div className="relative max-w-content mx-auto px-6 py-14 md:py-24 min-h-[520px] flex flex-col justify-center">
            <BackLink to="/infos#explorer" className="inline-flex items-center gap-1.5 text-sm text-cream-fixed/70 hover:text-cream-fixed transition-colors mb-8 w-fit">
              <ArrowLeft size={14} />
              {ui.backToServices}
            </BackLink>

            <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="max-w-xl">
              <div className="flex items-center gap-2 mb-5">
                <span className="text-[0.7rem] font-semibold uppercase tracking-[0.16em]" style={{ color: theme.accent }}>
                  {page.category}
                </span>
                <span
                  className={`text-[0.62rem] font-semibold uppercase tracking-wider rounded-full px-2.5 py-1 ${
                    soon ? "bg-white/15 text-cream-fixed" : "bg-white text-ink-fixed"
                  }`}
                >
                  {soon ? ui.soon : ui.available}
                </span>
              </div>
              <h1 className="font-display italic text-4xl sm:text-5xl lg:text-6xl leading-[1.05] mb-5">{page.name}</h1>
              <p className="font-display text-xl sm:text-2xl mb-4" style={{ color: theme.accent }}>
                {page.tagline}
              </p>
              <p className="text-cream-fixed/80 leading-relaxed mb-8">{page.lead}</p>
              <div className="flex flex-wrap gap-3">
                <PrimaryCta
                  page={page}
                  onOpen={() => setPanelOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-cream-fixed text-ink-fixed text-sm font-semibold px-6 py-3.5 hover:bg-white transition-colors"
                />
                {page.secondaryTo ? (
                  <Link
                    to={page.secondaryTo}
                    className="inline-flex items-center gap-2 rounded-full border border-white/35 text-cream-fixed text-sm font-medium px-6 py-3.5 hover:bg-white/10 transition-colors"
                  >
                    {page.secondaryCta}
                    <ArrowRight size={15} />
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={scrollToPreview}
                    className="inline-flex items-center gap-2 rounded-full border border-white/35 text-cream-fixed text-sm font-medium px-6 py-3.5 hover:bg-white/10 transition-colors"
                  >
                    {page.secondaryCta}
                    <ChevronDown size={15} />
                  </button>
                )}
              </div>
            </motion.div>

            <motion.dl
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl"
            >
              {(page.facts || []).map((f) => (
                <div key={f.l} className="rounded-2xl bg-black/25 backdrop-blur border border-white/10 px-4 py-3">
                  <dt className="font-display text-lg leading-tight">{f.v}</dt>
                  <dd className="text-xs text-cream-fixed/65 mt-0.5">{f.l}</dd>
                </div>
              ))}
            </motion.dl>
          </div>
        </section>

        {/* Marketplace : l'aperçu est le contenu principal, on le met tout de suite. */}
        {isMarketplace && <Showcase page={page} theme={theme} onNotify={() => setPanelOpen(true)} />}

        {/* ───────── Atouts ───────── */}
        <section id="atouts" className="px-6 py-20 md:py-24 bg-cream scroll-mt-16">
          <div className="max-w-content mx-auto">
            <Reveal className="max-w-2xl mb-12">
              <h2 className="font-display italic text-3xl sm:text-4xl leading-tight text-ink">{page.highlightsTitle}</h2>
            </Reveal>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {(page.highlights || []).map((h, i) => {
                const Icon = iconFor(h.icon);
                return (
                  <Reveal key={h.title} delay={i * 0.06}>
                    <div className="h-full rounded-3xl bg-surface border border-line p-6 hover:-translate-y-1 hover:border-coffee-light transition-all duration-300">
                      <span
                        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
                        style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})`, color: theme.accent }}
                      >
                        <Icon size={22} />
                      </span>
                      <h3 className="font-display text-lg text-ink mb-2">{h.title}</h3>
                      <p className="text-sm text-stone leading-relaxed">{h.text}</p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* Aperçu interactif des autres services */}
        {!isMarketplace && <Showcase page={page} theme={theme} onNotify={() => setPanelOpen(true)} />}

        {/* ───────── Étapes ───────── */}
        <section id="etapes" className="px-6 py-20 md:py-24 bg-cream scroll-mt-16">
          <div className="max-w-content mx-auto">
            <Reveal className="max-w-2xl mb-12">
              <h2 className="font-display italic text-3xl sm:text-4xl leading-tight text-ink">{page.stepsTitle}</h2>
            </Reveal>
            <ol className="grid gap-5 md:grid-cols-4">
              {(page.steps || []).map((s, i) => (
                <Reveal key={s.title} delay={i * 0.07}>
                  <li className="relative h-full rounded-3xl border border-line bg-surface p-6 list-none">
                    <span className="font-display italic text-5xl leading-none" style={{ color: theme.from, opacity: 0.35 }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="font-display text-lg text-ink mt-3 mb-2">{s.title}</h3>
                    <p className="text-sm text-stone leading-relaxed">{s.text}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Partenaire du réseau */}
        {partnerSlug && (
          <section id="partenaire" className="px-6 pb-20 bg-cream scroll-mt-16">
            <div className="max-w-content mx-auto">
              <Reveal>
                <div className="rounded-3xl border border-line bg-surface p-6 md:p-8 flex flex-wrap items-center justify-between gap-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-coffee mb-1">{ui.partnerLabel}</p>
                    <p className="text-sm text-stone max-w-xl">{page.name}</p>
                  </div>
                  <Link
                    to={`/partenaires/${partnerSlug}`}
                    className="inline-flex items-center gap-2 rounded-full border border-line text-ink text-sm font-medium px-5 py-3 hover:border-coffee-light transition-colors"
                  >
                    {ui.partnerCta}
                    <ArrowRight size={15} />
                  </Link>
                </div>
              </Reveal>
            </div>
          </section>
        )}

        {/* ───────── FAQ ───────── */}
        {faqItems.length > 0 && (
          <div id="faq" className="scroll-mt-16">
            <FAQ eyebrow={ui.faqEyebrow} heading={ui.faqHeading} items={faqItems} />
          </div>
        )}

        {/* ───────── Bandeau final ───────── */}
        <section
          id="rejoindre"
          className="px-6 py-20 md:py-24 text-center text-cream-fixed"
          style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}
        >
          <div className="max-w-2xl mx-auto">
            <h2 className="font-display italic text-3xl sm:text-5xl leading-tight mb-4">{page.closingTitle}</h2>
            <p className="text-cream-fixed/80 mb-8">{page.closingText}</p>
            <PrimaryCta
              page={page}
              onOpen={() => setPanelOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-cream-fixed text-ink-fixed text-sm font-semibold px-7 py-4 hover:bg-white transition-colors"
            />
          </div>
        </section>

        {/* ───────── À explorer aussi ───────── */}
        <section id="autres" className="px-6 py-20 bg-cream">
          <div className="max-w-content mx-auto">
            <Reveal>
              <h2 className="font-display text-2xl sm:text-3xl text-ink mb-8">{ui.exploreMore}</h2>
            </Reveal>
            <div className="grid gap-5 sm:grid-cols-3">
              {related.map((k, i) => {
                const p = getServicePage(k, lang);
                const th = H_SERVICE_THEME[k];
                return (
                  <Reveal key={k} delay={i * 0.07}>
                    <Link
                      to={servicePath(k)}
                      className="group block rounded-3xl overflow-hidden border border-line bg-surface hover:-translate-y-1 hover:border-coffee-light transition-all duration-300"
                    >
                      <div className="relative h-36 overflow-hidden" style={{ background: th.to }}>
                        <HServiceArt name={k} className="absolute inset-0 w-full h-full group-hover:scale-105 transition-transform duration-700" />
                      </div>
                      <div className="p-5">
                        <p className="font-display text-lg text-ink mb-1">{p.name}</p>
                        <p className="text-sm text-stone leading-snug">{p.tagline}</p>
                      </div>
                    </Link>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>
      </main>
      <Footer />

      <ServiceRequestPanel
        open={panelOpen}
        onClose={closePanel}
        serviceKey={key}
        name={page.name}
        description={page.lead}
        soon={soon}
      />
    </div>
  );
}
