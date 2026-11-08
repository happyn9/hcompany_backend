import { useParams, Navigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import NavBar from "../components/layout/NavBar.jsx";
import Footer from "../components/layout/Footer.jsx";
import DetailHero from "../components/detail/DetailHero.jsx";
import DetailSidebarCard from "../components/detail/DetailSidebarCard.jsx";
import RelatedGrid from "../components/detail/RelatedGrid.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { usePageMeta } from "../components/ui/HeadManager.jsx";
import { TradeArt } from "../components/art/ServiceArt.jsx";
import { SERVICES_META, UNIT_LABEL, findServiceBySlug } from "../data/services.js";

export default function ServiceDetail() {
  const { slug } = useParams();
  const { t, lang } = useLanguage();
  const meta = findServiceBySlug(slug);

  const name = meta ? t(`services.${meta.key}n`) : null;
  const text = meta ? t(`services.${meta.key}t`) : null;
  usePageMeta(meta ? { title: name, description: text } : null);

  if (!meta) return <Navigate to="/infos#marketplace" replace />;

  const category = t(`services.categories.${meta.categoryKey}`);
  const unit = UNIT_LABEL[lang][meta.unitKey];
  const features = t(`services.${meta.key}features`);
  const featureList = Array.isArray(features) ? features : [];

  const otherServices = SERVICES_META.filter((s) => s.slug !== slug).slice(0, 3);

  return (
    <div className="min-h-screen bg-cream">
      <NavBar />

      <DetailHero
        art={<TradeArt name={meta.categoryKey} className="w-full h-full" />}
        overlay="linear-gradient(0deg, rgba(30,26,23,0.92) 5%, rgba(30,26,23,0.55) 55%, rgba(30,26,23,0.15) 100%)"
        backTo="/infos#marketplace"
        backLabel={t("services.heading")}
        icon={Sparkles}
        badge={
          <span className="text-xs font-medium uppercase tracking-widest text-[#C89A3D]">{category}</span>
        }
        title={name}
      />

      <section className="px-6 py-20 max-w-content mx-auto grid lg:grid-cols-[1.6fr_1fr] gap-14">
        <div>
          <p className="text-xl text-stone leading-relaxed mb-12 max-w-2xl">{text}</p>

          {featureList.length > 0 && (
            <>
              <p className="text-sm font-medium text-coffee uppercase tracking-widest mb-2">
                {lang === "fr" ? "Détail de la prestation" : "Service breakdown"}
              </p>
              <h2 className="font-display italic text-2xl text-ink mb-7">
                {lang === "fr" ? "Ce qui est inclus" : "What's included"}
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {featureList.map((f, i) => (
                  <motion.div
                    key={f}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.4, delay: i * 0.07 }}
                    className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4"
                  >
                    <span className="w-7 h-7 rounded-full bg-[#C89A3D]/15 flex items-center justify-center text-coffee-dark shrink-0">
                      <Check size={13} />
                    </span>
                    <span className="text-stone text-sm leading-relaxed pt-0.5">{f}</span>
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="lg:sticky lg:top-24 h-fit">
          <DetailSidebarCard>
            <span className="text-xs text-ink-faint uppercase tracking-widest">{t("services.priceFrom")}</span>
            <p className="font-display text-4xl text-ink mt-2 mb-1">
              {meta.priceFrom} $<span className="text-base text-ink-soft font-sans"> /{unit}</span>
            </p>
            <p className="text-sm text-ink-soft mb-7">
              {lang === "fr" ? "Devis ajusté à votre besoin exact." : "Quote adjusted to your exact needs."}
            </p>
            <Link
              to="/infos#rejoindre"
              className="w-full flex items-center justify-center gap-2 rounded-full bg-ink text-cream text-sm font-medium py-4 hover:bg-coffee-dark hover:scale-[1.02] transition-all"
            >
              {t("services.request")}
              <ArrowRight size={15} />
            </Link>
          </DetailSidebarCard>
        </div>
      </section>

      <RelatedGrid
        eyebrow={lang === "fr" ? "À explorer aussi" : "Also worth exploring"}
        heading={lang === "fr" ? "Autres services" : "Other services"}
        items={otherServices.map((s) => ({
          key: s.slug,
          to: `/services/${s.slug}`,
          art: <TradeArt name={s.categoryKey} className="w-full h-full" />,
          title: t(`services.${s.key}n`),
          subtitle: t(`services.categories.${s.categoryKey}`),
        }))}
      />

      <Footer />
    </div>
  );
}
