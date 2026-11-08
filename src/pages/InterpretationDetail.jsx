import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Languages, CheckCircle2 } from "lucide-react";
import NavBar from "../components/layout/NavBar.jsx";
import Footer from "../components/layout/Footer.jsx";
import FAQ from "../components/sections/FAQ.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";

const INTERPRETERS = [
  { key: "interpreter1", photo: "portrait,african,woman,professional" },
  { key: "interpreter2", photo: "portrait,african,man,professional" },
  { key: "interpreter3", photo: "portrait,african,woman,smiling" },
  { key: "interpreter4", photo: "portrait,african,man,smiling" },
];

export default function InterpretationDetail() {
  const { t } = useLanguage();
  const features = [t("interpretation.feature1"), t("interpretation.feature2"), t("interpretation.feature3")];

  return (
    <div className="min-h-screen bg-cream">
      <NavBar />

      {/* --- Hero --- */}
      <section className="relative h-[46vh] min-h-[380px] overflow-hidden pt-16">
        <img
          src="https://loremflickr.com/1600/900/interpreter,conference,meeting"
          alt="Interprète accompagnant une réunion professionnelle"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-fixed via-ink-fixed/50 to-ink-fixed/20" />
        <div className="relative h-full max-w-content mx-auto px-6 flex flex-col justify-end pb-12">
          <Link to="/infos#interpretation" className="inline-flex items-center gap-1.5 text-cream-fixed/70 text-sm hover:text-cream-fixed transition-colors mb-4 w-fit">
            <ArrowLeft size={14} />
            {t("interpretation.eyebrow")}
          </Link>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-[#C89A3D] mb-4">
              <Languages size={22} />
            </div>
            <h1 className="font-display italic text-3xl sm:text-5xl text-cream-fixed max-w-xl">
              {t("interpretation.heading")}
            </h1>
          </motion.div>
        </div>
      </section>

      {/* --- Description + fonctionnalités --- */}
      <section className="px-6 py-16 max-w-content mx-auto grid lg:grid-cols-[1.4fr_1fr] gap-12">
        <div>
          <p className="text-lg text-stone leading-relaxed mb-10">{t("interpretation.heroLead")}</p>
          <ul className="space-y-4">
            {features.map((f, i) => (
              <motion.li
                key={f}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="flex items-start gap-3 text-stone"
              >
                <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-coffee-dark" />
                {f}
              </motion.li>
            ))}
          </ul>
        </div>

        <div className="lg:sticky lg:top-24 h-fit">
          <div className="rounded-2xl border border-line bg-surface p-7">
            <div className="flex items-center gap-1.5 mb-6 flex-wrap">
              {["FR", "EN", "SW", "BEM", "LIN", "NYA"].map((lg) => (
                <span key={lg} className="text-[0.65rem] font-medium text-ink-soft bg-cream border border-line rounded-full px-2.5 py-1">
                  {lg}
                </span>
              ))}
            </div>
            <Link
              to="/infos#rejoindre"
              className="w-full flex items-center justify-center gap-2 rounded-full bg-ink text-cream text-sm font-medium py-3.5 hover:bg-coffee-dark transition-colors"
            >
              {t("interpretation.cta")}
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* --- Interprètes disponibles --- */}
      <section className="px-6 py-16 border-t border-line max-w-content mx-auto">
        <div className="max-w-xl mb-10">
          <h2 className="font-display italic text-2xl sm:text-3xl text-ink mb-3">
            {t("interpretation.teamHeading")}
          </h2>
          <p className="text-stone leading-relaxed">{t("interpretation.teamLead")}</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {INTERPRETERS.map((interp, i) => (
            <motion.div
              key={interp.key}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="rounded-2xl border border-line bg-surface overflow-hidden"
            >
              <div className="relative h-48 overflow-hidden">
                <img
                  src={`https://loremflickr.com/400/480/${interp.photo}`}
                  alt={t(`interpretation.${interp.key}Name`)}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
                <span className="absolute top-3 right-3 flex items-center gap-1.5 text-[0.65rem] font-medium bg-surface/90 text-emerald-700 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {t("interpretation.availableNow")}
                </span>
              </div>
              <div className="p-5">
                <p className="font-display text-lg text-ink mb-1">{t(`interpretation.${interp.key}Name`)}</p>
                <p className="text-xs text-coffee-dark font-medium mb-2">{t(`interpretation.${interp.key}Langs`)}</p>
                <p className="text-sm text-stone leading-relaxed">{t(`interpretation.${interp.key}Specialty`)}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <FAQ
        eyebrow={t("faq.eyebrow")}
        heading={t("interpretation.faqHeading")}
        items={[1, 2, 3].map((i) => ({
          question: t(`interpretation.faq${i}q`),
          answer: t(`interpretation.faq${i}a`),
        }))}
      />

      <Footer />
    </div>
  );
}
