import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, GraduationCap, Lock, Play, PlayCircle, Sparkles, Users2 } from "lucide-react";
import NavBar from "../../components/layout/NavBar.jsx";
import Footer from "../../components/layout/Footer.jsx";
import BackLink from "../../components/ui/BackLink.jsx";
import CourseCover from "../../components/learning/CourseCover.jsx";
import CourseCard from "../../components/learning/CourseCard.jsx";
import { SectionHead, useLearningUi } from "../../components/learning/Shared.jsx";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";
import { useCourse, useCourses, formatDuration } from "../../data/courses.js";
import { useUser } from "../../context/Usercontext.jsx";
import { api } from "../../lib/api.js";
import { countDone, getLocalProgress, mergeServerProgress, nextLesson } from "../../lib/learningProgress.js";

function groupBySection(lessons) {
  const groups = [];
  for (const l of lessons) {
    const name = l.section || "";
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.items.push(l);
    else groups.push({ name, items: [l] });
  }
  return groups;
}

export default function CourseDetail() {
  const { id } = useParams();
  const ui = useLearningUi();
  const { status, course } = useCourse(id);
  const { courses } = useCourses();
  const { withAuth, isAuthenticated } = useUser();
  const [progress, setProgress] = useState(getLocalProgress);
  usePageMeta(course ? { title: course.title, description: course.text } : null);

  useEffect(() => {
    if (!isAuthenticated || !course || course.id < 0) return;
    withAuth((token) => api.learning.myProgress(token, course.id))
      .then((rows) => setProgress({ ...mergeServerProgress(rows) }))
      .catch(() => {});
  }, [isAuthenticated, course, withAuth]);

  const lessons = course?.lessons || [];
  const groups = useMemo(() => groupBySection(lessons), [lessons]);
  const done = countDone(lessons, progress);
  const hasLocked = lessons.some((l) => l.locked);
  const next = nextLesson(lessons.filter((l) => !l.locked), progress);
  const others = courses.filter((c) => c.id !== course?.id).slice(0, 3);

  if (status === "loading") return <div className="min-h-screen bg-cream"><NavBar /></div>;
  if (status === "missing") return <Navigate to="/formations" replace />;
  if (status === "error" || !course) {
    return (
      <div className="min-h-screen bg-cream">
        <NavBar />
        <div className="max-w-content mx-auto px-6 pt-40 pb-24 text-center">
          <p className="text-ink-soft mb-6">Impossible de charger ce cours pour le moment.</p>
          <Link to="/formations" className="text-coffee underline">{ui.course.back}</Link>
        </div>
        <Footer />
      </div>
    );
  }

  const started = done > 0;
  const watchTo = next ? `/formations/${course.id}/regarder/${next.id}` : hasLocked ? "/formations/bouquets" : null;
  const dur = formatDuration(course.total_seconds);

  return (
    <div className="min-h-screen bg-cream">
      <NavBar onDark />

      <section className="relative overflow-hidden bg-[#2E1D12] text-cream-fixed pt-28 pb-16 px-6">
        <div className="absolute inset-0 opacity-50" aria-hidden="true">
          <CourseCover course={course} className="absolute inset-0 blur-2xl scale-125" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-[#2E1D12] via-[#2E1D12]/85 to-[#2E1D12]/60" aria-hidden="true" />
        <div className="relative max-w-content mx-auto">
          <BackLink to="/formations" className="inline-flex items-center gap-2 text-sm text-cream-fixed/70 hover:text-cream-fixed mb-8">
            <ArrowLeft size={15} />
            {ui.course.back}
          </BackLink>
          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-12 items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-latte mb-4">
                {course.category} · {course.level}
                {course.members_only && <span className="ml-3 rounded-full bg-latte/25 text-latte px-2.5 py-0.5 text-[0.65rem]">{ui.locked.badge}</span>}
              </p>
              <h1 className="font-display text-4xl sm:text-5xl leading-[1.08] mb-5">{course.title}</h1>
              <p className="text-cream-fixed/75 text-lg leading-relaxed max-w-2xl mb-8">{course.text}</p>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-cream-fixed/70 mb-8">
                <span className="flex items-center gap-2"><PlayCircle size={15} />{ui.course.lessons(lessons.length)}</span>
                {dur && <span className="flex items-center gap-2"><Clock size={15} />{dur}</span>}
                <span className="flex items-center gap-2"><GraduationCap size={15} />{course.level}</span>
              </div>
              <div className="flex flex-wrap gap-3">
                {watchTo && (
                  <Link to={watchTo} className="inline-flex items-center gap-2 rounded-full bg-cream-fixed text-ink-fixed text-sm font-medium px-6 py-3.5 hover:scale-[1.03] transition-transform">
                    {next ? <Play size={14} fill="currentColor" /> : <Lock size={14} />}
                    {next ? (started ? ui.course.resume : ui.course.start) : ui.locked.cta}
                  </Link>
                )}
                <Link
                  to={`/formations/inscription?cours=${course.id > 0 ? course.id : ""}`}
                  className="inline-flex items-center gap-2 rounded-full border border-cream-fixed/30 text-cream-fixed text-sm font-medium px-6 py-3.5 hover:bg-white/10 transition-colors"
                >
                  {ui.course.presCta}
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="hidden lg:block">
              <CourseCover course={course} className="aspect-video rounded-3xl border border-white/15 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.6)]" showPlay />
            </motion.div>
          </div>
        </div>
      </section>

      <section className="px-6 py-16 max-w-content mx-auto grid lg:grid-cols-[1.6fr_1fr] gap-14">
        <div className="space-y-14">
          {course.outcomes?.length > 0 && (
            <div>
              <h2 className="font-display text-2xl text-ink mb-6">{ui.course.learn}</h2>
              <ul className="grid sm:grid-cols-2 gap-3">
                {course.outcomes.map((o) => (
                  <li key={o} className="flex items-start gap-3 text-stone leading-relaxed">
                    <CheckCircle2 size={18} className="text-coffee mt-0.5 shrink-0" />
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="flex items-end justify-between mb-6">
              <h2 className="font-display text-2xl text-ink">{ui.course.syllabus}</h2>
              {lessons.length > 0 && (
                <span className="text-sm text-ink-soft">{ui.course.done(done, lessons.length)}</span>
              )}
            </div>
            {lessons.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line bg-surface p-6 text-sm text-ink-soft">{ui.course.noLessons}</p>
            ) : (
              <div className="space-y-6">
                {groups.map((g, gi) => (
                  <div key={gi}>
                    {g.name && <p className="text-xs font-semibold uppercase tracking-widest text-coffee mb-3">{g.name}</p>}
                    <ul className="rounded-2xl border border-line bg-surface divide-y divide-line overflow-hidden">
                      {g.items.map((l) => {
                        const idx = lessons.indexOf(l) + 1;
                        const isDone = progress[l.id]?.done;
                        if (l.locked) {
                          return (
                            <li key={l.id}>
                              <Link to="/formations/bouquets" className="group flex items-center gap-4 px-4 py-3.5 bg-cream/60 hover:bg-latte-soft transition-colors">
                                <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-line text-ink-soft">
                                  <Lock size={14} />
                                </span>
                                <span className="flex-1 text-sm text-ink-soft leading-snug">{l.title}</span>
                                <span className="text-[0.7rem] font-medium uppercase tracking-wider text-coffee">{ui.locked.lesson}</span>
                              </Link>
                            </li>
                          );
                        }
                        return (
                          <li key={l.id}>
                            <Link to={`/formations/${course.id}/regarder/${l.id}`} className="group flex items-center gap-4 px-4 py-3.5 hover:bg-latte-soft transition-colors">
                              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${isDone ? "bg-coffee text-cream" : "bg-latte-soft text-coffee"}`}>
                                {isDone ? <CheckCircle2 size={16} /> : idx}
                              </span>
                              <span className="flex-1 text-sm text-ink leading-snug">{l.title}</span>
                              {l.members_only && <span className="text-[0.65rem] font-medium uppercase tracking-wider text-coffee">{ui.locked.badge}</span>}
                              {l.duration_seconds ? <span className="text-xs text-ink-faint">{formatDuration(l.duration_seconds)}</span> : null}
                              <Play size={14} className="text-coffee opacity-0 group-hover:opacity-100 transition-opacity" />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="font-display text-2xl text-ink mb-4">{ui.course.requirements}</h2>
            {course.requirements?.length ? (
              <ul className="space-y-2 text-stone">
                {course.requirements.map((r) => (
                  <li key={r} className="flex gap-3"><span className="mt-2 w-1.5 h-1.5 rounded-full bg-coffee shrink-0" />{r}</li>
                ))}
              </ul>
            ) : (
              <p className="text-stone">{ui.course.noRequirements}</p>
            )}
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 h-fit space-y-4">
          <div className="rounded-3xl border border-line bg-surface p-6">
            <p className="flex items-center gap-2 text-sm font-medium text-ink mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {ui.course.freeTitle}
            </p>
            <p className="text-sm text-ink-soft mb-5">{ui.course.freeText}</p>
            {watchTo && (
              <Link to={watchTo} className="w-full flex items-center justify-center gap-2 rounded-full bg-ink text-cream text-sm font-medium py-3.5 hover:bg-coffee-dark transition-colors">
                {next ? <Play size={14} fill="currentColor" /> : <Lock size={14} />}
                {next ? (started ? ui.course.resume : ui.course.start) : ui.locked.cta}
              </Link>
            )}
          </div>
          {hasLocked && (
            <div className="rounded-3xl border border-coffee-light/50 bg-latte-soft p-6">
              <p className="flex items-center gap-2 font-medium text-ink mb-1"><Sparkles size={16} className="text-coffee" />{ui.locked.course}</p>
              <p className="text-sm text-ink-soft mb-4">{ui.locked.courseText}</p>
              <Link to="/formations/bouquets" className="text-sm text-coffee font-medium hover:underline">{ui.locked.cta} →</Link>
            </div>
          )}
          {!hasLocked && course.has_exclusive_access && lessons.some((l) => l.members_only) && (
            <p className="rounded-2xl bg-emerald-50 text-emerald-800 text-sm px-5 py-3.5">{ui.locked.yours}</p>
          )}
          <div className="rounded-3xl bg-[#2E1D12] text-cream-fixed p-6">
            <p className="font-display text-xl mb-1">{ui.course.presTitle}</p>
            <p className="text-sm text-cream-fixed/70 mb-5">{ui.course.presText}</p>
            <Link
              to={`/formations/inscription?cours=${course.id > 0 ? course.id : ""}`}
              className="w-full flex items-center justify-center gap-2 rounded-full bg-cream-fixed text-ink-fixed text-sm font-medium py-3.5 hover:scale-[1.02] transition-transform"
            >
              {ui.course.presCta}
              <ArrowRight size={15} />
            </Link>
            <Link to="/formations/bouquets?plan=equipe#equipe" className="mt-3 flex items-center justify-center gap-2 text-sm text-cream-fixed/70 hover:text-cream-fixed">
              <Users2 size={14} />
              {ui.inPerson.team}
            </Link>
          </div>
        </aside>
      </section>

      {others.length > 0 && (
        <section className="px-6 pb-24 max-w-content mx-auto">
          <SectionHead eyebrow="H-Learning" title={ui.course.others} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {others.map((c, i) => (
              <CourseCard key={c.id} course={c} index={i} />
            ))}
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
}
