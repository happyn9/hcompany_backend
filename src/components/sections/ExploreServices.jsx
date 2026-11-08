import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import Reveal from "../ui/Reveal.jsx";
import ServiceRequestPanel from "../services/ServiceRequestPanel.jsx";
import { servicePath, SERVICE_PAGES } from "../../data/hServicePages.js";
import { useServiceCatalog, resolveServices } from "../../hooks/useServiceCatalog.js";
import { SERVICE_UI } from "../../i18n/servicePageUi.js";
import { useLanguage } from "../../context/LanguageContext.jsx";

/**
 * "Explorez nos services" — une grille sobre (sans logos ni illustrations). Un clic ouvre la
 * page dédiée du service (/h/:slug) : plus de pop-up. La liste s'affiche tout
 * de suite (ordre et états par défaut) puis s'ajuste quand le catalogue du
 * backend répond ; un service créé depuis l'admin et inconnu du site ouvre le
 * panneau de demande à la place.
 */
export default function ExploreServices() {
  const { lang, t } = useLanguage();
  const ui = SERVICE_UI[lang] || SERVICE_UI.fr;
  const catalog = useServiceCatalog();
  const { list } = resolveServices(catalog);
  const [panel, setPanel] = useState(null);

  function labelsFor(item) {
    const tr = t(`exploreServices.catalog.${item.key}`);
    if (tr && typeof tr === "object") return { label: tr.label, description: tr.description };
    const c = item.catalog || {};
    return {
      label: (lang === "fr" ? c.label_fr : c.label_en) || c.label_fr || item.key,
      description: (lang === "fr" ? c.description_fr : c.description_en) || c.description_fr || "",
    };
  }

  const copy = lang === "fr"
    ? { open: "Découvrir", soon: "Bientôt disponible", partnerTitle: "Un seul partenariat, tous les modules.", partnerBody: "Une fois votre partenariat accepté, vous débloquez H-Logement, H-Transport, H-Shopping et H-Learning depuis un seul tableau de bord.", partnerCta: "Devenir partenaire" }
    : { open: "Discover", soon: "Coming soon", partnerTitle: "One partnership, every module.", partnerBody: "Once your partnership is accepted, unlock H-Lodging, H-Transport, H-Shopping and H-Learning from a single dashboard.", partnerCta: "Become a partner" };

  return (
    <section id="explorer" className="px-5 sm:px-6 py-20 sm:py-28 bg-cream">
      <div className="max-w-content mx-auto">
        <Reveal>
          <div className="grid lg:grid-cols-[1fr_auto] gap-6 items-end mb-12 sm:mb-14">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-coffee mb-3">{t("exploreServices.eyebrow")}</p>
              <h2 className="font-display text-3xl sm:text-5xl text-ink leading-[1.1] mb-4">{t("exploreServices.heading")}</h2>
              <p className="text-ink-soft max-w-xl leading-relaxed">{t("exploreServices.lead")}</p>
            </div>
            <p className="hidden lg:block font-display text-6xl text-line tabular-nums leading-none" aria-hidden="true">
              {String(list.length).padStart(2, "0")}
            </p>
          </div>
        </Reveal>

        <ul className={`grid sm:grid-cols-2 ${list.length % 4 === 0 ? "lg:grid-cols-4" : "lg:grid-cols-3"} border-t border-l border-line rounded-2xl overflow-hidden bg-surface`}>
          {list.map((item, i) => {
            const { label, description } = labelsFor(item);
            const hasPage = Boolean(SERVICE_PAGES[item.key]);
            const body = (
              <>
                <div className="flex items-center justify-between mb-8">
                  <span className="text-xs font-semibold tabular-nums tracking-widest text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
                  <span className={`text-[0.65rem] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${item.disabled ? "bg-latte-soft text-ink-soft" : "bg-coffee/10 text-coffee-dark"}`}>
                    {item.disabled ? copy.soon : ui.available}
                  </span>
                </div>
                <p className="font-display text-2xl text-ink leading-tight mb-2">{label}</p>
                <p className="text-sm text-ink-soft leading-relaxed flex-1">{description}</p>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink group-hover:text-coffee-dark">
                  {copy.open}
                  <ArrowUpRight size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </>
            );
            const cls = "group flex flex-col h-full min-h-[15rem] p-6 sm:p-7 text-left transition-colors hover:bg-latte-soft/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-coffee";
            return (
              <li key={item.key} className="border-r border-b border-line">
                <Reveal delay={Math.min(i, 5) * 0.04} className="h-full">
                  {hasPage ? (
                    <Link to={servicePath(item.key)} className={cls} aria-label={label}>{body}</Link>
                  ) : (
                    <button type="button" onClick={() => setPanel({ key: item.key, name: label, description, soon: item.disabled })} className={`${cls} w-full`}>{body}</button>
                  )}
                </Reveal>
              </li>
            );
          })}
        </ul>

        <Reveal>
          <div className="mt-8 rounded-2xl bg-ink-fixed text-cream-fixed p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="max-w-2xl">
              <p className="font-display text-xl sm:text-2xl mb-1.5">{copy.partnerTitle}</p>
              <p className="text-sm text-cream-fixed/70 leading-relaxed">{copy.partnerBody}</p>
            </div>
            <a href="/infos#rejoindre" className="shrink-0 text-center rounded-full bg-cream-fixed text-ink-fixed text-sm font-medium px-7 py-3.5 hover:opacity-90">{copy.partnerCta}</a>
          </div>
        </Reveal>
      </div>

      <ServiceRequestPanel
        open={Boolean(panel)}
        onClose={() => setPanel(null)}
        serviceKey={panel?.key}
        name={panel?.name}
        description={panel?.description}
        soon={panel?.soon}
      />
    </section>
  );
}
