import { mem } from "../lib/memStore.js";
import { useEffect, useState, useRef } from "react";
import NavBar from "../components/layout/NavBar.jsx";
import Footer from "../components/layout/Footer.jsx";
import Hero from "../components/sections/Hero.jsx";
import About from "../components/sections/About.jsx";
import Marketplace from "../components/sections/Marketplace.jsx";
import ExploreServices from "../components/sections/ExploreServices.jsx";
import ConnectWithUs from "../components/sections/ConnectWithUs.jsx";
import Interpretation from "../components/sections/Interpretation.jsx";
import Learning from "../components/sections/Learning.jsx";
import Impact from "../components/sections/Impact.jsx";
import Partners from "../components/sections/Partners.jsx";
import PartnerInfo from "../components/sections/PartnerInfo.jsx";
import FAQ from "../components/sections/FAQ.jsx";
import AdSpace from "../components/sections/AdSpace.jsx";
import SectionReveal from "../components/ui/SectionReveal.jsx";
import BrandLoader from "../components/ui/BrandLoader.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";

export default function Home() {
  const { t } = useLanguage();
  // Court délai le temps que les polices soient prêtes, pour éviter un
  // flash de texte non stylé avant même le premier squelette — pas un
  // portail de chargement global comme avant : chaque section ci-dessous
  // gère sa propre révélation, l'une après l'autre, au fil du défilement.
  const [fontsReady, setFontsReady] = useState(false);
  // Écran de marque animé (lettre H, façon "ta-dum" Netflix) uniquement au
  // tout premier chargement du site pour cette session — pas à chaque retour
  // sur la home, ce qui deviendrait vite lassant.
  const firstVisit = useRef(
    !mem.get("hc_home_seen")
  ).current;
  const [minTimeElapsed, setMinTimeElapsed] = useState(!firstVisit);

  useEffect(() => {
    (document.fonts?.ready || Promise.resolve()).then(() => setFontsReady(true));
    // Marque le site comme "déjà vu" pour cette session — les prochains
    // montages de cette page (retour depuis une autre page, après
    // connexion...) sauteront directement les squelettes.
    mem.set("hc_home_seen", true);
  }, []);

  useEffect(() => {
    if (!firstVisit) return;
    // Temps minimum pour laisser l'animation du H se jouer entièrement,
    // même si les polices sont prêtes quasi instantanément.
    const timer = setTimeout(() => setMinTimeElapsed(true), 500);
    return () => clearTimeout(timer);
  }, [firstVisit]);

  // Défile jusqu'à l'ancre indiquée dans l'URL (#rejoindre, #services...)
  // une fois le contenu prêt — une navigation programmatique (ex: après
  // connexion, redirection vers "/infos#rejoindre") ne déclenche pas le
  // défilement natif du navigateur comme le ferait un lien classique.
  // Réessaie plusieurs fois : la section ciblée peut ne pas encore être
  // révélée (squelette encore affiché) au tout premier essai.
  useEffect(() => {
    if (!fontsReady) return;
    const hash = window.location.hash?.slice(1);
    if (!hash) return;

    let attempts = 0;
    const tryScroll = () => {
      const el = document.getElementById(hash);
      if (el) {
        // "instant" plutôt que "smooth" — d'autres sections peuvent encore
        // être en train de se révéler juste en dessous (mécanisme de
        // squelette), ce qui change la hauteur de la page pendant qu'un
        // défilement fluide serait en cours et lui fait perdre sa cible.
        el.scrollIntoView({ behavior: "instant", block: "start" });
        return;
      }
      attempts += 1;
      if (attempts < 20) setTimeout(tryScroll, 150);
    };
    // Court délai initial pour laisser la mise en page se stabiliser avant
    // la première tentative, plutôt que de se lancer au tout premier rendu.
    const timer = setTimeout(tryScroll, 300);
    return () => clearTimeout(timer);
  }, [fontsReady]);

  if (!fontsReady || !minTimeElapsed) {
    return firstVisit ? <BrandLoader visible /> : <div className="min-h-screen bg-cream" />;
  }

  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <main>
        <SectionReveal variant="hero" delay={0.35}>
          <Hero />
        </SectionReveal>
        <SectionReveal variant="split">
          <About />
        </SectionReveal>
        <SectionReveal variant="center">
          <Marketplace />
        </SectionReveal>
        <SectionReveal variant="grid">
          <ExploreServices />
        </SectionReveal>
        <SectionReveal variant="split">
          <ConnectWithUs />
        </SectionReveal>
        <SectionReveal variant="center">
          <Interpretation />
        </SectionReveal>
        <SectionReveal variant="grid">
          <Learning />
        </SectionReveal>
        <SectionReveal variant="center">
          <Impact />
        </SectionReveal>
        <SectionReveal variant="grid">
          <Partners />
        </SectionReveal>
        <SectionReveal variant="center">
          <FAQ
            eyebrow={t("faq.eyebrow")}
            heading={t("faq.heading")}
            items={t("faq.general").map((item) => ({ question: item.q, answer: item.a }))}
          />
        </SectionReveal>
        <SectionReveal variant="split">
          <PartnerInfo />
        </SectionReveal>
        <AdSpace />
      </main>
      <Footer />
    </div>
  );
}
