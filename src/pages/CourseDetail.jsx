import { useParams, Navigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Clock, GraduationCap, CheckCircle2, BookOpen } from "lucide-react";
import NavBar from "../components/layout/NavBar.jsx";
import Footer from "../components/layout/Footer.jsx";
import DetailHero from "../components/detail/DetailHero.jsx";
import DetailSidebarCard from "../components/detail/DetailSidebarCard.jsx";
import RelatedGrid from "../components/detail/RelatedGrid.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { usePageMeta } from "../components/ui/HeadManager.jsx";
import { useCourses, LEVEL_TONE } from "../data/courses.js";

const LEVEL_HOURS = { "initiation": 6, "intermédiaire": 12, "tous niveaux": 8 };

const TONE_BG = { gold: "#C89A3D", clay: "#A94B32", coffee: "#4A3020" };

// Programme générique par niveau — le backend ne stocke pas encore de
// syllabus détaillé par cours, ce contenu illustre la structure type
// d'un parcours pendant qu'un vrai programme n'est pas encore branché.
const CURRICULUM_BY_LEVEL = {
  "initiation": [
    "Poser les bases et le vocabulaire du domaine",
    "Manipuler les outils essentiels avec un formateur",
    "Mettre en pratique sur un cas concret",
    "Évaluation et certificat de complétion",
  ],
  "intermédiaire": [
    "Rappel des fondamentaux, à votre rythme",
    "Approfondissement technique guidé par un formateur",
    "Projet complet du cahier des charges à la livraison",
    "Retours individuels et certificat de complétion",
  ],
  "tous niveaux": [
    "Diagnostic de votre niveau de départ",
    "Parcours adapté selon votre profil",
    "Mise en pratique sur votre propre projet",
    "Certificat de complétion",
  ],
};

export default function CourseDetail() {
  const { id } = useParams();
  const { t } = useLanguage();
  const { status, courses } = useCourses();
  const course = courses.find((c) => String(c.id) === String(id));
  usePageMeta(course ? { title: course.title, description: course.text || course.description } : null);

  if (status === "loading") {
    return <div className="min-h-screen bg-cream" />;
  }
  if (!course) return <Navigate to="/infos#learning" replace />;

  const tone = LEVEL_TONE[course.level] || "coffee";
  const hours = LEVEL_HOURS[course.level] || 8;
  const curriculum = CURRICULUM_BY_LEVEL[course.level] || CURRICULUM_BY_LEVEL["tous niveaux"];
  const otherCourses = courses.filter((c) => c.id !== course.id).slice(0, 3);

  return (
    <div className="min-h-screen bg-cream">
      <NavBar />

      <DetailHero
        image={course.photo}
        overlay={`linear-gradient(0deg, ${TONE_BG[tone]}f2 5%, ${TONE_BG[tone]}80 45%, rgba(30,26,23,0.25) 100%)`}
        backTo="/infos#learning"
        backLabel={t("learning.heading")}
        icon={GraduationCap}
        badge={
          <span className="text-xs font-medium uppercase tracking-widest text-cream-fixed/90">{course.level}</span>
        }
        title={course.title}
      />

      <section className="px-6 py-20 max-w-content mx-auto grid lg:grid-cols-[1.6fr_1fr] gap-14">
        <div>
          <p className="text-xl text-stone leading-relaxed mb-12 max-w-2xl">{course.text || course.description}</p>

          <p className="text-sm font-medium text-coffee uppercase tracking-widest mb-2 flex items-center gap-2">
            <BookOpen size={14} />
            {t("learning.curriculum")}
          </p>
          <h2 className="font-display italic text-2xl text-ink mb-8">
            {course.title}
          </h2>

          <div className="relative pl-4 space-y-0">
            {curriculum.map((step, i) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, x: -14 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, delay: i * 0.1 }}
                className="relative flex items-start gap-4 pb-8 last:pb-0"
              >
                {i < curriculum.length - 1 && (
                  <span className="absolute left-[15px] top-8 bottom-0 w-px bg-line" />
                )}
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-cream text-xs font-medium"
                  style={{ background: TONE_BG[tone] }}
                >
                  {i + 1}
                </span>
                <span className="text-stone leading-relaxed pt-1">{step}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="lg:sticky lg:top-24 h-fit">
          <DetailSidebarCard>
            <div className="flex items-center gap-5 mb-7 pb-7 border-b border-line">
              <div className="flex items-center gap-2 text-sm text-ink-soft">
                <Clock size={15} />
                {hours}h
              </div>
              <div className="flex items-center gap-2 text-sm text-ink-soft">
                <GraduationCap size={15} />
                {course.level}
              </div>
              <CheckCircle2 size={15} className="text-emerald-600 ml-auto" />
            </div>
            <p className="text-sm text-ink-soft mb-6">
              Certificat de complétion inclus, animé par un formateur H-learning.
            </p>
            <Link
              to="/infos#rejoindre"
              className="w-full flex items-center justify-center gap-2 rounded-full bg-ink text-cream text-sm font-medium py-4 hover:bg-coffee-dark hover:scale-[1.02] transition-all"
            >
              {t("learning.discover")}
              <ArrowRight size={15} />
            </Link>
          </DetailSidebarCard>
        </div>
      </section>

      <RelatedGrid
        eyebrow="H-learning"
        heading="D'autres cours qui pourraient vous intéresser"
        items={otherCourses.map((c) => ({
          key: c.id,
          to: `/cours/${c.id}`,
          image: c.photo,
          title: c.title,
          subtitle: c.level,
        }))}
      />

      <Footer />
    </div>
  );
}
