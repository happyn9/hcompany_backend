import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Smartphone } from "lucide-react";
import NavBar from "../../components/layout/NavBar.jsx";
import Footer from "../../components/layout/Footer.jsx";
import FAQ from "../../components/sections/FAQ.jsx";
import BackLink from "../../components/ui/BackLink.jsx";
import StoreBadges from "../../components/ui/StoreBadges.jsx";
import UstudyMockup from "../../components/sections/UstudyMockup.jsx";
import CourseCard from "../../components/learning/CourseCard.jsx";
import { InPersonBand, SectionHead, useLearningUi } from "../../components/learning/Shared.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";
import { useCourses } from "../../data/courses.js";
import { findPartnerBySlug, getPartnerContent } from "../../data/partners.js";

// Remplace la page détail partenaire d'U-Study : on garde la présentation de
// l'application et le téléchargement, et on y rattache l'espace H-Learning.
export default function UstudyPage() {
  const ui = useLearningUi();
  const { t } = useLanguage();
  const meta = findPartnerBySlug("u-study");
  const content = getPartnerContent(t, meta);
  const { courses } = useCourses();
  usePageMeta({ title: meta.name, description: content.text });

  return (
    <div className="min-h-screen bg-cream">
      <NavBar onDark />

      <section className="relative overflow-hidden bg-[#2E1D12] text-cream-fixed pt-28 pb-20 px-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,#4A3020,transparent_55%)]" aria-hidden="true" />
        <div className="relative max-w-content mx-auto">
          <BackLink to="/infos#partenaires" className="inline-flex items-center gap-2 text-sm text-cream-fixed/70 hover:text-cream-fixed mb-8">
            <ArrowLeft size={15} />
            {t("partners.heading")}
          </BackLink>
          <div className="grid lg:grid-cols-[1.2fr_1fr] gap-14 items-center">
            <div>
              <p className="text-sm font-medium text-latte uppercase tracking-widest mb-4">{ui.ustudy.eyebrow}</p>
              <h1 className="font-display text-5xl sm:text-6xl leading-[1.05] mb-5">{meta.name}</h1>
              <p className="text-latte text-lg mb-4">{content.role}</p>
              <p className="text-cream-fixed/75 text-lg leading-relaxed max-w-xl mb-9">{content.longText}</p>
              <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-5 max-w-md">
                <p className="flex items-center gap-2 text-xs font-medium text-cream-fixed mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {t("companies.ustudy.available")}
                </p>
                <StoreBadges to="#" />
              </div>
            </div>
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="flex justify-center">
              <div className="scale-[1.6] origin-center my-10 rounded-3xl" style={{ background: meta.gradient, padding: "1.25rem 2rem" }}>
                <UstudyMockup />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 max-w-content mx-auto">
        <SectionHead eyebrow={ui.ustudy.presentation} title={content.text} />
        <div className="grid md:grid-cols-3 gap-5 mb-10">
          {content.highlights.map((h, i) => (
            <motion.div
              key={h}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: i * 0.1 }}
              className="rounded-3xl border border-line bg-surface p-7"
            >
              <span className="w-11 h-11 rounded-2xl bg-latte-soft text-coffee flex items-center justify-center mb-5">
                <Smartphone size={20} />
              </span>
              <p className="text-ink leading-relaxed">{h}</p>
            </motion.div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 max-w-xl">
          {content.stats.map((s) => (
            <div key={s.label} className="rounded-2xl bg-surface border border-line p-4 text-center">
              <p className="font-display text-xl text-ink leading-none">{s.value}</p>
              <p className="text-[0.65rem] text-ink-soft mt-2 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 pb-20 max-w-content mx-auto">
        <SectionHead eyebrow={ui.ustudy.partOf} title={ui.ustudy.catalogTitle} lead={ui.ustudy.catalogLead} />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {courses.slice(0, 3).map((c, i) => (
            <CourseCard key={c.id} course={c} index={i} />
          ))}
        </div>
        <Link to="/formations" className="inline-flex items-center gap-2 text-sm font-medium text-coffee hover:gap-3 transition-all">
          {ui.ustudy.seeAll}
          <ArrowRight size={15} />
        </Link>
      </section>

      <InPersonBand />

      {Array.isArray(t("faq.partner.ustudy")) && (
        <FAQ
          eyebrow={t("faq.eyebrow")}
          heading={`${meta.name} : ${t("faq.heading").toLowerCase()}`}
          items={t("faq.partner.ustudy").map((item) => ({ question: item.q, answer: item.a }))}
        />
      )}
      <Footer />
    </div>
  );
}
