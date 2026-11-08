import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, ChevronLeft, ChevronRight, Lock, Play } from "lucide-react";
import NavBar from "../../components/layout/NavBar.jsx";
import Footer from "../../components/layout/Footer.jsx";
import BackLink from "../../components/ui/BackLink.jsx";
import YouTubePlayer from "../../components/learning/YouTubePlayer.jsx";
import { useLearningUi } from "../../components/learning/Shared.jsx";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";
import { useCourse, formatDuration } from "../../data/courses.js";
import { useUser } from "../../context/Usercontext.jsx";
import { api } from "../../lib/api.js";
import { getLocalProgress, mergeServerProgress, setLocalProgress } from "../../lib/learningProgress.js";

export default function CoursePlayer() {
  const { id, lessonId } = useParams();
  const navigate = useNavigate();
  const ui = useLearningUi();
  const { status, course } = useCourse(id);
  const { withAuth, isAuthenticated } = useUser();
  const [progress, setProgress] = useState(getLocalProgress);
  const lastSent = useRef(0);

  const lessons = course?.lessons || [];
  const index = Math.max(0, lessons.findIndex((l) => String(l.id) === String(lessonId)));
  const lesson = lessons[index];
  usePageMeta(lesson ? { title: `${lesson.title} · ${course.title}`, description: course.text } : null);

  useEffect(() => {
    if (!isAuthenticated || !course || course.id < 0) return;
    withAuth((token) => api.learning.myProgress(token, course.id))
      .then((rows) => setProgress({ ...mergeServerProgress(rows) }))
      .catch(() => {});
  }, [isAuthenticated, course, withAuth]);

  const save = useCallback(
    (l, patch) => {
      setProgress({ ...setLocalProgress(l.id, patch) });
      if (isAuthenticated) {
        withAuth((token) =>
          api.learning.saveProgress(token, l.id, { completed: !!patch.done, position_seconds: patch.t ?? 0 })
        ).catch(() => {});
      }
    },
    [isAuthenticated, withAuth]
  );

  const go = (l) => navigate(`/formations/${course.id}/regarder/${l.id}`);
  const next = lessons[index + 1];
  const prev = lessons[index - 1];
  const allDone = lessons.length > 0 && lessons.filter((l) => !l.locked).every((l) => progress[l.id]?.done);

  const onEnded = () => {
    if (!lesson) return;
    save(lesson, { done: true, t: 0 });
    if (next) go(next);
  };

  const onProgress = (t, total) => {
    if (!lesson || lesson.locked || Date.now() - lastSent.current < 14000) return;
    lastSent.current = Date.now();
    // une vidéo vue à plus de 92 % compte comme terminée
    save(lesson, { done: total > 0 && t / total > 0.92, t });
  };

  if (status === "loading") return <div className="min-h-screen bg-cream"><NavBar /></div>;
  if (status === "missing" || (course && lessons.length === 0)) {
    return <Navigate to={course ? `/formations/${course.id}` : "/formations"} replace />;
  }
  if (!course || !lesson) return <Navigate to="/formations" replace />;

  const done = progress[lesson.id]?.done;
  const startAt = progress[lesson.id]?.done ? 0 : progress[lesson.id]?.t || 0;

  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <div className="max-w-content mx-auto px-6 pt-24 pb-16">
        <BackLink to={`/formations/${course.id}`} className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink mb-6">
          <ArrowLeft size={15} />
          {ui.player.back} · {course.title}
        </BackLink>

        <div className="grid lg:grid-cols-[1.8fr_1fr] gap-8 items-start">
          <div>
            {lesson.locked ? (
              <div className="aspect-video rounded-3xl bg-[#2E1D12] text-cream-fixed flex flex-col items-center justify-center text-center px-6 gap-4">
                <span className="w-14 h-14 rounded-full bg-white/10 text-latte flex items-center justify-center"><Lock size={24} /></span>
                <p className="font-display text-xl sm:text-2xl max-w-md">{ui.locked.title}</p>
                <p className="text-sm text-cream-fixed/70 max-w-md leading-relaxed">{ui.locked.text}</p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Link to="/formations/bouquets" className="rounded-full bg-cream-fixed text-ink-fixed text-sm font-medium px-6 py-3 hover:scale-[1.03] transition-transform">{ui.locked.cta}</Link>
                  {!isAuthenticated && (
                    <Link to="/connexion" state={{ redirectTo: `/formations/${course.id}/regarder/${lesson.id}` }} className="rounded-full border border-cream-fixed/30 text-sm px-6 py-3 hover:bg-white/10 transition-colors">{ui.locked.signin}</Link>
                  )}
                </div>
              </div>
            ) : (
              <YouTubePlayer
                key={lesson.youtube_id}
                videoId={lesson.youtube_id}
                startAt={startAt}
                onEnded={onEnded}
                onProgress={onProgress}
                labels={{ openYoutube: ui.player.openYoutube }}
              />
            )}
            <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-widest text-coffee font-medium mb-2">
                  {ui.player.lessonOf(index + 1, lessons.length)}
                </p>
                <h1 className="font-display text-2xl sm:text-3xl text-ink leading-snug">{lesson.title}</h1>
              </div>
              <button
                type="button"
                disabled={lesson.locked}
                onClick={() => save(lesson, { done: !done, t: 0 })}
                className={`inline-flex items-center gap-2 rounded-full border text-sm px-4 py-2.5 transition-colors ${
                  done ? "bg-coffee text-cream border-coffee" : "border-line text-ink-soft hover:border-coffee-light"
                }`}
              >
                {done ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                {done ? ui.player.doneLabel : ui.player.markDone}
              </button>
            </div>
            {lesson.description && (
              <p className="mt-4 text-stone leading-relaxed whitespace-pre-line line-clamp-6">{lesson.description}</p>
            )}
            <div className="mt-6 flex items-center gap-3">
              <button type="button" disabled={!prev} onClick={() => prev && go(prev)} className="inline-flex items-center gap-1.5 rounded-full border border-line text-sm px-4 py-2.5 text-ink-soft disabled:opacity-40 hover:border-coffee-light">
                <ChevronLeft size={15} />
                {ui.player.prev}
              </button>
              <button type="button" disabled={!next} onClick={() => next && go(next)} className="inline-flex items-center gap-1.5 rounded-full bg-ink text-cream text-sm px-5 py-2.5 disabled:opacity-40 hover:bg-coffee-dark transition-colors">
                {ui.player.next}
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          <aside className="rounded-3xl border border-line bg-surface overflow-hidden lg:sticky lg:top-24">
            <p className="px-5 py-4 text-sm font-medium text-ink border-b border-line">{ui.player.playlist}</p>
            <ol className="max-h-[56vh] overflow-y-auto divide-y divide-line">
              {lessons.map((l, i) => {
                const active = l.id === lesson.id;
                const isDone = progress[l.id]?.done;
                return (
                  <li key={l.id}>
                    <Link
                      to={`/formations/${course.id}/regarder/${l.id}`}
                      replace
                      aria-current={active ? "true" : undefined}
                      className={`flex items-center gap-3 px-5 py-3 text-sm transition-colors ${active ? "bg-latte-soft" : "hover:bg-cream"}`}
                    >
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[0.7rem] shrink-0 ${isDone ? "bg-coffee text-cream" : "bg-latte-soft text-coffee"}`}>
                        {l.locked ? <Lock size={12} /> : isDone ? <CheckCircle2 size={14} /> : active ? <Play size={11} fill="currentColor" /> : i + 1}
                      </span>
                      <span className={`flex-1 leading-snug ${active ? "text-ink font-medium" : "text-ink-soft"}`}>{l.title}</span>
                      {l.duration_seconds ? <span className="text-[0.7rem] text-ink-faint">{formatDuration(l.duration_seconds)}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </aside>
        </div>

        <div className="mt-14 rounded-3xl bg-[#2E1D12] text-cream-fixed p-8 sm:p-10 flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-xl">
            <p className="font-display text-2xl mb-2">{allDone ? ui.player.finished : ui.player.bandTitle}</p>
            <p className="text-cream-fixed/70 text-sm leading-relaxed">{allDone ? ui.player.finishedText : ui.player.bandText}</p>
          </div>
          <Link
            to={`/formations/inscription?cours=${course.id > 0 ? course.id : ""}`}
            className="inline-flex items-center gap-2 rounded-full bg-cream-fixed text-ink-fixed text-sm font-medium px-6 py-3.5 hover:scale-[1.03] transition-transform"
          >
            {ui.player.bandCta}
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}
