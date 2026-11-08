import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Handshake, LayoutDashboard, Compass, GraduationCap, Mail } from "lucide-react";
import Reveal from "../ui/Reveal.jsx";
import ContactModal from "./ContactModal.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";

const LINKS = [
  { key: "partner", to: "/infos#rejoindre", Icon: Handshake },
  { key: "dashboard", to: "/connexion", Icon: LayoutDashboard },
  { key: "explore", to: "/infos#explorer", Icon: Compass },
  { key: "training", to: "/formations/bouquets?plan=equipe#equipe", Icon: GraduationCap },
  { key: "contact", modal: true, Icon: Mail },
];

/** Section façon "Connect with us" — un gros titre à gauche, une petite
 * grille de cartes de navigation à droite. Purement des raccourcis vers des
 * parcours qui existent déjà ailleurs sur le site (candidature partenaire,
 * connexion, catalogue de services, formation d'équipe). */
export default function ConnectWithUs() {
  const { t } = useLanguage();
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <section className="px-6 py-24 bg-surface border-t border-line">
      <div className="max-w-content mx-auto grid md:grid-cols-[0.8fr_1.2fr] gap-10 md:gap-16 items-start">
        <Reveal>
          <h2 className="font-display text-3xl sm:text-4xl text-ink">{t("connectWithUs.heading")}</h2>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="grid sm:grid-cols-2 gap-3.5">
            {LINKS.map(({ key, to, modal, Icon }) => {
              const label = t(`connectWithUs.${key}.label`);
              const description = t(`connectWithUs.${key}.description`);
              const cardInner = (
                <>
                  <div className="flex items-start justify-between mb-3">
                    <span className="w-9 h-9 rounded-xl bg-coffee/10 flex items-center justify-center text-coffee shrink-0">
                      <Icon size={17} />
                    </span>
                    <ArrowRight
                      size={17}
                      className="text-ink-faint group-hover:text-coffee-dark group-hover:translate-x-0.5 transition-all"
                    />
                  </div>
                  <p className="font-medium text-ink">{label}</p>
                  <p className="text-sm text-ink-soft mt-1 leading-snug">{description}</p>
                </>
              );
              const cardCls =
                "group rounded-2xl border border-line bg-cream p-5 hover:border-coffee-light hover:-translate-y-0.5 transition-all text-left w-full";

              if (modal) {
                return (
                  <button key={key} type="button" onClick={() => setContactOpen(true)} className={cardCls}>
                    {cardInner}
                  </button>
                );
              }
              return (
                <Link key={key} to={to} className={cardCls}>
                  {cardInner}
                </Link>
              );
            })}
          </div>
        </Reveal>
      </div>

      {contactOpen && <ContactModal onClose={() => setContactOpen(false)} />}
    </section>
  );
}
