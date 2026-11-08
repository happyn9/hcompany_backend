import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Users2 } from "lucide-react";
import StoreBadges from "../ui/StoreBadges.jsx";
import Carousel from "./Carousel.jsx";
import { SkeletonCard } from "../ui/Skeleton.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useCourses, levelTone } from "../../data/courses.js";
import CourseCover from "../learning/CourseCover.jsx";

export default function Learning() {
  const { status, courses } = useCourses();
  const { t } = useLanguage();
  return (
    <section className="hc-learning">
      <style>{`
        .hc-learning {
          --hc-ink: #10140F;
          --hc-canvas: #F3EEDF;
          --hc-coffee: #4A3020;
          --hc-coffee-2: #2E1D12;
          --hc-gold: #C89A3D;
          --hc-clay: #A94B32;
          --hc-mist: #656B58;
          --hc-line: rgba(243,238,223,0.16);
          --hc-line-strong: rgba(243,238,223,0.35);
          font-family: 'Inter', sans-serif;
        }

        .hc-learning-head {
          background: var(--hc-coffee);
          background-image: radial-gradient(circle at 85% 0%, var(--hc-coffee-2), var(--hc-coffee) 60%);
          color: var(--hc-canvas);
          padding: 6rem 1.5rem 5rem;
        }
        .hc-learning-head-inner {
          max-width: 68rem; margin: 0 auto;
          display: flex; flex-wrap: wrap; gap: 3rem;
          justify-content: space-between; align-items: flex-end;
        }
        .hc-learning-label {
          font-size: 0.85rem; font-weight: 600; color: var(--hc-gold);
          margin-bottom: 1.25rem;
        }
        .hc-heading {
          font-family: 'Instrument Serif', serif;
          font-style: italic;
          font-weight: 400;
          font-size: clamp(2.2rem, 1.6rem + 2.4vw, 3.4rem);
          line-height: 1.12; letter-spacing: -0.01em;
          max-width: 16ch;
        }
        .hc-learning-desc {
          max-width: 26rem; color: var(--hc-mist); line-height: 1.75; font-size: 0.98rem;
        }

        .hc-learning-body {
          background: #FFFFFF;
          padding: 5rem 1.5rem 6rem;
          border-bottom: 1px solid rgba(16,20,15,0.1);
        }
        .hc-learning-body-inner { max-width: 68rem; margin: 0 auto; }
        .hc-learning-body .hc-line { --hc-line-strong: #D4D8CB; --hc-line: rgba(16,20,15,.12); }
        .hc-learning-body .hc-carousel { --hc-line-strong: #D4D8CB; --hc-line: rgba(16,20,15,.12); }

        .hc-course-card {
          width: 280px;
          background: var(--hc-canvas);
          display: flex; flex-direction: column;
          position: relative;
        }
        @media (min-width: 640px) { .hc-course-card { width: 305px; } }

        .hc-course-photo { position: relative; width: 100%; height: 165px; overflow: hidden; }
        .hc-course-photo img {
          width: 100%; height: 100%; object-fit: cover; display: block;
          filter: none;
        }
        .hc-course-photo[data-tone="gold"]::after,
        .hc-course-photo[data-tone="clay"]::after,
        .hc-course-photo[data-tone="coffee"]::after {
          content: ""; position: absolute; inset: 0; mix-blend-mode: multiply; opacity: 0.42;
        }
        .hc-course-photo[data-tone="gold"]::after { background: #C89A3D; }
        .hc-course-photo[data-tone="clay"]::after { background: #A94B32; }
        .hc-course-photo[data-tone="coffee"]::after { background: #4A3020; }

        .hc-course-content { padding: 1.6rem 1.6rem 1.8rem; display: flex; flex-direction: column; flex: 1; }
        .hc-course-level {
          display: inline-flex; align-self: flex-start;
          font-size: 0.74rem; font-weight: 600;
          padding: 0.25rem 0.65rem;
          border-radius: 100px;
          margin-bottom: 1.1rem;
        }
        .hc-course-level[data-tone="gold"] { background: rgba(200,154,61,0.16); color: #664A13; }
        .hc-course-level[data-tone="clay"] { background: rgba(169,75,50,0.14); color: #7D3623; }
        .hc-course-level[data-tone="coffee"] { background: rgba(30,68,54,0.12); color: #4A3020; }

        .hc-course-title {
          font-family: 'Instrument Serif', serif;
          font-weight: 400; font-size: 1.35rem;
          line-height: 1.28; margin-bottom: 0.85rem; color: var(--hc-ink);
        }
        .hc-course-text { font-size: 0.92rem; line-height: 1.65; color: #5C6357; flex: 1; }
        .hc-course-link {
          margin-top: 1.5rem; display: inline-flex; align-items: center; gap: 0.4rem;
          font-size: 0.88rem; font-weight: 600;
          color: var(--hc-ink); text-decoration: none;
        }
        .hc-course-link svg { transition: transform 0.15s ease; }
        .hc-course-link:hover svg { transform: translateX(3px); }
        .hc-course-link:focus-visible { outline: 2px solid var(--hc-gold); outline-offset: 3px; }
      `}</style>

      <div className="hc-learning-head">
        <motion.div
          className="hc-learning-head-inner"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div>
            <p className="hc-learning-label">{t("learning.label")}</p>
            <h2 className="hc-heading">{t("learning.heading")}</h2>
          </div>
          <p className="hc-learning-desc">
            {t("learning.lead")}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="max-w-content mx-auto mt-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 rounded-2xl bg-white/[0.06] border border-white/10 p-6"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#C89A3D]/15 flex items-center justify-center text-[#C89A3D] font-display text-lg shrink-0">
              U
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <p className="text-[#C89A3D] text-xs font-medium">{t("companies.ustudy.appLabel")} : {t("companies.ustudy.role")}</p>
              </div>
              <p className="text-sm text-[#F3EEDF]/75 max-w-md mb-3">
                {t("companies.ustudy.text")}
              </p>
              <StoreBadges to="/partenaires/u-study" size="small" />
            </div>
          </div>
          <Link
            to="/partenaires/u-study"
            className="shrink-0 text-sm font-medium rounded-full border border-white/20 text-[#F3EEDF] px-5 py-2.5 hover:bg-white/10 transition-colors whitespace-nowrap"
          >
            {t("learning.discoverUstudy")}
          </Link>
        </motion.div>
      </div>

      <div className="hc-learning-body">
        <div className="hc-learning-body-inner">
          {status === "loading" ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : (
          <Carousel>
            {courses.map((c, i) => {
              const tone = levelTone(c.level);
              return (
                <motion.article
                  key={c.title}
                  className="hc-course-card"
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ y: -6 }}
                >
                  <Link to={`/formations/${c.id}`} className="hc-course-photo" data-tone={tone}>
                    <CourseCover course={c} className="absolute inset-0" showPlay />
                  </Link>
                  <div className="hc-course-content">
                    <span className="hc-course-level" data-tone={tone}>{c.level}</span>
                    <Link to={`/formations/${c.id}`} className="hc-course-title block" style={{ textDecoration: "none" }}>
                      {c.title}
                    </Link>
                    <p className="hc-course-text">{c.text}</p>
                    <Link to={`/formations/${c.id}`} className="hc-course-link">
                      {t("learning.discover")}
                      <svg width="13" height="11" viewBox="0 0 13 11" aria-hidden="true">
                        <path d="M1 5.5H12M7.5 1L12 5.5L7.5 10" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Link>
                  </div>
                </motion.article>
              );
            })}
          </Carousel>
          )}

          <div className="flex flex-wrap items-center gap-3 mt-8">
            <Link to="/formations" className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-6 py-3 hover:bg-coffee-dark transition-colors">
              {t("learning.seeAll")}
            </Link>
            <Link to="/formations/inscription" className="inline-flex items-center gap-2 rounded-full border border-line text-ink text-sm font-medium px-6 py-3 hover:bg-line/50 transition-colors">
              {t("learning.register")}
            </Link>
          </div>

          {/* Formation d'équipe / entreprise — distincte des cours individuels */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mt-10 rounded-3xl border border-line bg-surface p-7 sm:p-9 flex flex-col md:flex-row md:items-center gap-6 md:gap-10"
          >
            <div className="w-14 h-14 rounded-2xl bg-ink flex items-center justify-center text-cream shrink-0">
              <Users2 size={24} strokeWidth={1.8} />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium uppercase tracking-widest text-coffee mb-2">
                {t("learning.teamEyebrow")}
              </p>
              <h3 className="font-display italic text-xl sm:text-2xl text-ink mb-3">
                {t("learning.teamHeading")}
              </h3>
              <p className="text-sm text-stone leading-relaxed max-w-xl mb-4">
                {t("learning.teamText")}
              </p>
              <div className="flex flex-wrap gap-2">
                {["teamTag1", "teamTag2", "teamTag3", "teamTag4"].map((key) => (
                  <span
                    key={key}
                    className="text-xs font-medium bg-cream border border-line text-ink-soft px-3 py-1.5 rounded-full"
                  >
                    {t(`learning.${key}`)}
                  </span>
                ))}
              </div>
            </div>
            <Link
              to="/formations/bouquets?plan=equipe#equipe"
              className="shrink-0 inline-flex items-center justify-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5 hover:bg-coffee-dark transition-colors whitespace-nowrap"
            >
              {t("learning.teamCta")}
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}