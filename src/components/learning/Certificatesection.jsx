import React, { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  ArrowRight, Award, Sparkles, Shield, Zap, Check, Download,
} from "lucide-react";

/* ═══════════════════════════════════════
   Design tokens — "Academic Gold"
═══════════════════════════════════════ */
const T = {
  ink:      "#0D0C0A",
  ink2:     "#1E1C18",
  gold:     "#B8882A",
  goldLt:   "#E8C96D",
  indigo:   "#4338CA",
  indigoLt: "#818CF8",
  parch:    "#F5F0E4",
  card:     "#FFFFFF",
  muted:    "rgba(30,28,24,.48)",
  line:     "rgba(30,28,24,.12)",
};

const ease = [0.16, 1, 0.3, 1];

/* ═══════════════════════════════════════
   Diploma mockup — the signature element
═══════════════════════════════════════ */
function Diploma({ t }) {
  return (
    <motion.div
      initial={{ opacity: 0, rotate: 3, y: 20 }}
      whileInView={{ opacity: 1, rotate: 1.5, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.75, ease }}
      whileHover={{ rotate: 0, y: -3, transition: { duration: 0.3 } }}
      className="relative w-full max-w-[320px] mx-auto select-none"
      style={{ filter: "drop-shadow(0 28px 48px rgba(13,12,10,.38))" }}
    >
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #FAF4E1 0%, #F0E7C8 100%)",
          border: `1px solid rgba(184,136,42,.3)`,
        }}
      >
        <div
          className="absolute inset-[7px] pointer-events-none"
          style={{ border: `1px solid rgba(184,136,42,.45)` }}
        />
        {["top-2 left-2", "top-2 right-2", "bottom-2 left-2", "bottom-2 right-2"].map((pos) => (
          <div
            key={pos}
            className={`absolute ${pos} w-5 h-5 pointer-events-none`}
            style={{
              borderTop: pos.includes("top") ? `2px solid ${T.gold}` : "none",
              borderBottom: pos.includes("bottom") ? `2px solid ${T.gold}` : "none",
              borderLeft: pos.includes("left") ? `2px solid ${T.gold}` : "none",
              borderRight: pos.includes("right") ? `2px solid ${T.gold}` : "none",
            }}
          />
        ))}

        <div className="relative z-10 px-7 pt-8 pb-7">
          <div className="text-center mb-5">
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 mb-3"
              style={{ border: `1px solid ${T.gold}`, background: `${T.gold}15` }}
            >
              <Award size={11} style={{ color: T.gold }} />
              <span
                className="text-[9px] font-bold tracking-[.16em] uppercase"
                style={{ fontFamily: "'Cormorant Garamond', serif", color: T.gold }}
              >
                hlearning
              </span>
            </div>

            <p className="text-[8px] uppercase tracking-[.18em] mb-1" style={{ color: T.muted }}>
              {t("cert.mock.subtitle")}
            </p>
            <h3
              className="text-[17px] leading-snug"
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontStyle: "italic",
                color: T.ink2,
                letterSpacing: "-.01em",
              }}
            >
              {t("cert.mock.course")}
            </h3>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 h-px" style={{ background: `${T.gold}60` }} />
            <div className="w-1.5 h-1.5 rotate-45" style={{ background: T.gold }} />
            <div className="flex-1 h-px" style={{ background: `${T.gold}60` }} />
          </div>

          <div className="text-center mb-4">
            <p className="text-[8px] uppercase tracking-[.12em] mb-1" style={{ color: T.muted }}>
              {t("cert.mock.recipient")}
            </p>
            <p
              className="text-[22px]"
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontWeight: 600,
                color: T.ink2,
                letterSpacing: "-.01em",
              }}
            >
              Kapend Yav
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-5">
            {[
              [t("cert.mock.date"), "Juin 2025"],
              [t("cert.mock.score"), "96 / 100"],
            ].map(([label, val]) => (
              <div
                key={label}
                className="text-center px-2 py-2"
                style={{ background: `${T.gold}0D`, border: `1px solid ${T.gold}40` }}
              >
                <p className="text-[7px] uppercase tracking-[.1em] mb-0.5" style={{ color: T.muted }}>
                  {label}
                </p>
                <p
                  className="text-[12px] font-semibold"
                  style={{ fontFamily: "'Cormorant Garamond', serif", color: T.ink2 }}
                >
                  {val}
                </p>
              </div>
            ))}
          </div>

          <div
            className="flex items-center justify-center gap-1.5 py-1.5 mb-4"
            style={{ background: "#ECFDF5", border: `1px solid #A7F3D0` }}
          >
            <Check size={10} className="text-emerald-600 shrink-0" />
            <span className="text-[10px] text-emerald-700 font-semibold">{t("cert.mock.verified")}</span>
          </div>

          <div className="flex items-center gap-1.5 mb-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex-1 h-[3px] rounded-full" style={{ background: T.gold, opacity: 0.4 + i * .12 }} />
            ))}
            <span className="text-[8px] font-semibold ml-0.5 whitespace-nowrap" style={{ color: T.gold }}>
              {t("cert.mock.withDistinction")}
            </span>
          </div>

          <button
            type="button"
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold tracking-[.04em] transition-opacity hover:opacity-85"
            style={{ background: T.ink2, color: "#F5F0E4" }}
          >
            <Download size={11} />
            {t("cert.mock.download")}
          </button>
        </div>

        <div
          className="absolute -bottom-3 -right-3 w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: `radial-gradient(circle, #8B1A1A 60%, #6B0F0F 100%)`, boxShadow: "0 4px 14px rgba(139,26,26,.5)" }}
        >
          <span className="font-serif text-[7px] font-bold uppercase tracking-[.06em] text-center text-red-100 leading-tight px-1">
            Officiel<br />Certifié
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════
   Main
═══════════════════════════════════════ */
export default function CertificateSection({ onGetStarted }) {
  const { t } = useTranslation();
  const heroRef = useRef(null);
  const heroInView = useInView(heroRef, { once: true, margin: "-50px" });
  const ctaRef = useRef(null);
  const ctaInView = useInView(ctaRef, { once: true, margin: "-60px" });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,600&display=swap');
      `}</style>

      <section style={{ background: T.parch }}>
        <div ref={heroRef} style={{ background: T.ink }} className="px-4 sm:px-8 pt-12 pb-14">
          <div className="max-w-[1080px] mx-auto flex flex-col lg:flex-row gap-10 lg:gap-16 items-center">
            <div className="flex-1">
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={heroInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.4, ease }}
                className="flex items-center gap-2 mb-5"
              >
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: T.gold }} />
                <span className="text-[10px] font-bold tracking-[.16em] uppercase" style={{ color: T.gold }}>
                  {t("cert.eyebrow")}
                </span>
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 16 }} animate={heroInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, ease, delay: 0.07 }}
                className="text-[40px] sm:text-[52px] leading-[.95] tracking-[-0.03em] mb-4"
                style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, color: "#F5F0E4" }}
              >
                {t("cert.title1")}
                <br />
                <em style={{ fontStyle: "italic", color: T.goldLt }}>{t("cert.title2")}</em>
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 10 }} animate={heroInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.42, ease, delay: 0.14 }}
                className="text-[14px] leading-[1.72] max-w-[360px] mb-6"
                style={{ color: "rgba(245,240,228,.52)" }}
              >
                {t("cert.subtitle")}
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={heroInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.38, ease, delay: 0.2 }}
                className="flex flex-wrap gap-2"
              >
                {[
                  { icon: Shield, k: "cert.trust.recognized" },
                  { icon: Sparkles, k: "cert.trust.ai" },
                  { icon: Zap, k: "cert.trust.instant" },
                ].map(({ icon: Icon, k }) => (
                  <span
                    key={k}
                    className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5"
                    style={{ border: `1px solid rgba(184,136,42,.35)`, color: "rgba(245,240,228,.6)" }}
                  >
                    <Icon size={10} style={{ color: T.gold }} />
                    {t(k)}
                  </span>
                ))}
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, x: 20 }} animate={heroInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, ease, delay: 0.1 }}
              className="w-full lg:w-auto shrink-0 flex justify-center pr-4"
            >
              <Diploma t={t} />
            </motion.div>
          </div>
        </div>

        <div className="max-w-[1080px] mx-auto px-4 sm:px-8 pt-10 pb-10">
          <div className="flex items-center gap-4 mb-7">
            <span className="text-[10px] font-bold uppercase tracking-[.14em] whitespace-nowrap" style={{ color: T.muted }}>
              {t("cert.stepsLabel")}
            </span>
            <div className="flex-1 h-px" style={{ background: T.line }} />
            <span className="text-[10px]" style={{ color: T.muted }}>
              4 {t("cert.stepsCount")}
            </span>
          </div>

          {/* ⚠️ Aucune liste d'étapes n'est rendue ici — à ajouter si voulu */}

          <motion.div
            ref={ctaRef}
            initial={{ opacity: 0, y: 18 }} animate={ctaInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, ease }}
            className="relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 px-7 py-6"
            style={{ background: T.ink2 }}
          >
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${T.gold}, transparent)` }} />

            <div>
              <p className="text-[9px] font-bold tracking-[.18em] uppercase mb-2" style={{ color: T.goldLt }}>
                {t("cert.cta.eyebrow")}
              </p>
              <p
                className="text-[20px] sm:text-[24px] leading-[1.15] tracking-[-0.02em]"
                style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, color: "#F5F0E4" }}
              >
                {t("cert.cta.title")}
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="flex -space-x-2">
                {[["#4338CA", "AL"], ["#0369A1", "MR"], ["#B45309", "JK"], ["#047857", "SC"]].map(([bg, init]) => (
                  <div
                    key={init}
                    className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-[9px] font-black text-white"
                    style={{ background: bg, borderColor: T.ink2 }}
                  >
                    {init}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={onGetStarted}
                className="group flex items-center gap-2 text-[13px] font-bold px-5 py-2.5 transition-opacity hover:opacity-88"
                style={{ background: T.gold, color: T.ink }}
              >
                {t("cert.cta.btn")}
                <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
