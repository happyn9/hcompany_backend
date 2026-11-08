import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowUpRight, Clock, PlayCircle } from "lucide-react";
import CourseCover from "./CourseCover.jsx";
import { formatDuration } from "../../data/courses.js";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { LEARNING_UI } from "../../i18n/learningUi.js";

export default function CourseCard({ course, index = 0, progress }) {
  const { lang } = useLanguage();
  const ui = LEARNING_UI[lang] || LEARNING_UI.fr;
  const dur = formatDuration(course.total_seconds);
  const done = progress?.done || 0;
  const total = course.lesson_count || 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: Math.min(index, 5) * 0.06 }}
      className="h-full"
    >
      <Link
        to={`/formations/${course.id}`}
        className="group flex h-full flex-col rounded-3xl border border-line bg-surface overflow-hidden hover:-translate-y-1 hover:border-coffee-light hover:shadow-[0_24px_50px_-28px_rgba(30,26,23,0.45)] transition-all duration-300"
      >
        <div className="relative h-44">
          <CourseCover course={course} className="absolute inset-0" showPlay />
          <span className="absolute left-3 top-3 text-[0.65rem] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-cream-fixed/90 text-ink-fixed">
            {course.members_only ? ui.locked.badge : ui.free}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-5">
          <p className="text-[0.7rem] font-medium uppercase tracking-widest text-coffee mb-2">
            {course.category} · {course.level}
          </p>
          <h3 className="font-display text-lg text-ink leading-snug mb-2">{course.title}</h3>
          <p className="text-sm text-ink-soft leading-relaxed line-clamp-3 mb-4">{course.text || course.description}</p>
          <div className="mt-auto flex items-center justify-between text-xs text-ink-soft">
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <PlayCircle size={14} />
                {total ? ui.catalog.videos(total) : ui.catalog.noVideos}
              </span>
              {dur && (
                <span className="flex items-center gap-1.5">
                  <Clock size={14} />
                  {dur}
                </span>
              )}
            </span>
            <span className="flex items-center gap-1 text-coffee font-medium group-hover:gap-2 transition-all">
              {ui.catalog.watch}
              <ArrowUpRight size={14} />
            </span>
          </div>
          {total > 0 && done > 0 && (
            <div className="mt-3 h-1 rounded-full bg-line overflow-hidden" title={ui.course.done(done, total)}>
              <div className="h-full bg-coffee" style={{ width: `${Math.round((done / total) * 100)}%` }} />
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
