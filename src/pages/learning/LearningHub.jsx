import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Play, Search } from "lucide-react";
import NavBar from "../../components/layout/NavBar.jsx";
import Footer from "../../components/layout/Footer.jsx";
import FAQ from "../../components/sections/FAQ.jsx";
import CourseCover from "../../components/learning/CourseCover.jsx";
import CertificateSection from "../../components/sections/CertificateSection.jsx";
import { HowItWorks, InPersonBand, PlansTeaser, useLearningUi } from "../../components/learning/Shared.jsx";
import { SkeletonCard } from "../../components/ui/Skeleton.jsx";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";
import { useCourses, formatDuration } from "../../data/courses.js";
import { useLanguage } from "../../context/LanguageContext.jsx";

function UCard({ c, t }) {
  const dur = formatDuration(c.total_seconds);
  const n = c.lesson_count || 0;
  return (
    <Link to={`/formations/${c.id}`} className="group block w-[250px] sm:w-[270px] shrink-0 snap-start">
      <div className="relative aspect-video rounded-lg overflow-hidden border border-line"><CourseCover course={c} className="absolute inset-0" showPlay /></div>
      <h3 className="mt-2.5 font-bold text-[15px] leading-snug text-ink line-clamp-2 group-hover:underline">{c.title}</h3>
      <p className="text-xs text-ink-soft mt-1">H-Learning</p>
      <p className="text-xs text-ink-soft mt-1">{[c.level, n ? t(`${n} vidéo${n > 1 ? "s" : ""}`, `${n} video${n > 1 ? "s" : ""}`) : null, dur].filter(Boolean).join(" · ")}</p>
      <div className="mt-2 flex gap-2">
        <span className="text-[11px] font-bold px-2 py-0.5 bg-[#EEE3D2] text-[#5A3A20]">{c.members_only ? t("Bouquet", "Plan") : t("Gratuit", "Free")}</span>
        {c.category && <span className="text-[11px] font-bold px-2 py-0.5 border border-line text-ink-soft">{c.category}</span>}
      </div>
    </Link>
  );
}

function Rail({ title, sub, list, t }) {
  if (!list.length) return null;
  return (
    <section className="mb-12">
      <h2 className="font-bold text-2xl text-ink">{title}</h2>
      {sub && <p className="text-ink-soft mt-1 mb-4">{sub}</p>}
      <div className="flex gap-4 overflow-x-auto pb-3 snap-x [scrollbar-width:thin] -mx-1 px-1">{list.map((c) => <UCard key={c.id} c={c} t={t} />)}</div>
    </section>
  );
}

export default function LearningHub() {
  const ui = useLearningUi();
  const { status, courses, offline } = useCourses();
  const { lang } = useLanguage();
  const t = (fr, en) => (lang === "en" ? en : fr);
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  usePageMeta({ title: ui.brand, description: ui.hero.lead });

  const categories = useMemo(() => [...new Set(courses.map((c) => c.category).filter(Boolean))], [courses]);
  const shown = courses.filter((c) => (cat === "all" || c.category === cat) && (!q.trim() || `${c.title} ${c.category} ${c.description || ""}`.toLowerCase().includes(q.trim().toLowerCase())));

  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <div className="pt-20" />

      {/* Barre de recherche */}
      <div className="max-w-content mx-auto px-6 pt-4">
        <label className="flex items-center gap-3 rounded-full border border-ink/70 bg-surface px-5 h-12 focus-within:ring-2 focus-within:ring-coffee/30">
          <Search size={18} className="text-ink-soft" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Que voulez-vous apprendre ?", "What do you want to learn?")} className="flex-1 bg-transparent outline-none !shadow-none !ring-0 !border-0 text-ink placeholder:text-ink-soft" aria-label={t("Rechercher une formation", "Search courses")} />
        </label>
      </div>

      {/* Bannière */}
      <section className="max-w-content mx-auto px-6 mt-6">
        <div className="relative overflow-hidden rounded-2xl bg-[#2E1D12] min-h-[320px] sm:min-h-[380px]">
          <div className="absolute inset-0 grid grid-cols-3 gap-2 p-2 opacity-90" aria-hidden="true">
            {[0, 1, 2].map((i) => <div key={i} className={`relative rounded-xl overflow-hidden ${i === 1 ? "translate-y-6" : ""}`}>{courses[i] ? <CourseCover course={courses[i]} className="absolute inset-0" /> : <div className="absolute inset-0 bg-coffee-dark" />}</div>)}
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#2E1D12] via-[#2E1D12]/70 to-transparent sm:from-[#2E1D12]/95 sm:via-[#2E1D12]/40" />
          <div className="relative sm:ml-10 my-6 sm:my-12 mx-4 max-w-[440px] bg-surface rounded-xl p-6 sm:p-8 shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-widest text-coffee mb-2">H-Learning</p>
            <h1 className="font-bold text-3xl sm:text-4xl text-ink leading-tight">{ui.hero.title}</h1>
            <p className="text-ink-soft mt-3 leading-relaxed">{ui.hero.lead}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a href="#catalogue" className="inline-flex items-center gap-2 rounded-lg bg-ink text-cream font-bold text-sm px-5 h-12"><Play size={14} fill="currentColor" />{ui.hero.ctaWatch}</a>
              <Link to="/formations/inscription" className="inline-flex items-center gap-2 rounded-lg border border-ink text-ink font-bold text-sm px-5 h-12">{ui.hero.ctaRegister}<ArrowRight size={15} /></Link>
            </div>
          </div>
        </div>
      </section>

      {/* Atouts */}
      <section className="max-w-content mx-auto px-6 mt-6">
        <ul className="grid sm:grid-cols-3 gap-px rounded-xl overflow-hidden border border-line bg-line text-sm">
          {ui.hero.facts.map((f) => <li key={f.v} className="bg-surface px-5 py-4 flex items-center gap-3"><span className="font-bold text-2xl text-ink">{f.v}</span><span className="text-ink-soft leading-snug">{f.l}</span></li>)}
        </ul>
      </section>

      <section id="catalogue" className="max-w-content mx-auto px-6 pt-12 scroll-mt-24">
        <h2 className="font-bold text-3xl text-ink">{t("Tout ce qu'il faut pour progresser", "Everything you need to grow")}</h2>
        <p className="text-ink-soft mt-2 mb-6">{t("Des formations vidéo gratuites, un parcours clair et un certificat à la clé.", "Free video courses, a clear path and a certificate at the end.")}</p>
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8" role="tablist">
            {["all", ...categories].map((c) => (
              <button key={c} role="tab" aria-selected={cat === c} onClick={() => setCat(c)} className={`rounded-full text-sm font-bold px-4 h-10 border transition-colors ${cat === c ? "bg-ink text-cream border-ink" : "border-ink/60 text-ink hover:bg-latte-soft"}`}>{c === "all" ? ui.catalog.all : c}</button>
            ))}
          </div>
        )}
        {status === "loading" ? (
          <div className="flex gap-4 overflow-hidden">{[0, 1, 2, 3].map((i) => <div key={i} className="w-[270px] shrink-0"><SkeletonCard /></div>)}</div>
        ) : shown.length === 0 ? <p className="text-ink-soft">{q ? t("Aucune formation ne correspond à votre recherche.", "No course matches your search.") : ui.catalog.empty}</p> : (
          <>
            <Rail title={q ? t("Résultats", "Results") : t("Pour commencer", "To get started")} sub={q ? null : t("Les formations les plus accessibles, à regarder dès maintenant.", "The most accessible courses, ready to watch now.")} list={q || cat !== "all" ? shown : shown.filter((c) => !c.members_only)} t={t} />
            {!q && cat === "all" && <Rail title={t("Aller plus loin avec un bouquet", "Go further with a plan")} sub={t("Contenus exclusifs et formation en présentiel.", "Exclusive content and in-person training.")} list={shown.filter((c) => c.members_only)} t={t} />}
            {!q && cat === "all" && <Rail title={t("Toutes les formations", "All courses")} list={shown} t={t} />}
          </>
        )}
        {offline && status === "ready" && <p className="text-xs text-ink-faint">Aperçu hors ligne : les vidéos s'affichent dès que le serveur répond.</p>}
      </section>

      <HowItWorks />

      <CertificateSection onGetStarted={() => document.getElementById("catalogue")?.scrollIntoView({ behavior: "smooth" })} />

      <PlansTeaser />

      <InPersonBand />

      <FAQ eyebrow={ui.faq.eyebrow} heading={ui.faq.heading} items={ui.faq.items.map((i) => ({ question: i.q, answer: i.a }))} />

      <Footer />
    </div>
  );
}
