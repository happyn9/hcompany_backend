import { useRef } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { Compass, Network, Target } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext.jsx";

const STAGES = [
  { Icon: Compass, tagKey: "stage1Tag", textKey: "stage1" },
  { Icon: Network, tagKey: "stage2Tag", textKey: "stage2" },
  { Icon: Target, tagKey: "stage3Tag", textKey: "stage3" },
];

const PARTNER_NAMES = ["H-learning", "Lukondo", "Confismila", "U-Study"];

function Stage({ Icon, tag, text, index, isLast }) {
  const ref = useRef(null);

  return (
    <div ref={ref} className="relative pl-16 sm:pl-20">
      {/* Pastille numérotée avec icône : s'anime à l'entrée */}
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="absolute left-0 top-0 w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-ink flex items-center justify-center text-cream shadow-[0_12px_28px_-12px_rgba(30,26,23,0.5)]"
      >
        <Icon size={20} strokeWidth={1.8} />
      </motion.div>

      {!isLast && (
        <div className="absolute left-[22px] sm:left-[27px] top-11 sm:top-14 bottom-[-3rem] w-px overflow-hidden">
          <div className="absolute inset-0 bg-line" />
          <motion.div
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.9, delay: 0.2, ease: "easeInOut" }}
            style={{ transformOrigin: "top" }}
            className="absolute inset-0 bg-linear-to-b from-coffee to-coffee-light"
          />
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className={isLast ? "pb-0" : "pb-12"}
      >
        <p className="text-xs font-medium uppercase tracking-widest text-coffee mb-3">{tag}</p>
        <p className="text-lg text-stone leading-relaxed max-w-xl">{text}</p>
      </motion.div>
    </div>
  );
}

function PartnerConstellation() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 60%"] });
  const lineProgress = useSpring(scrollYProgress, { stiffness: 90, damping: 22 });

  return (
    <div ref={ref} className="mt-6">
      <div className="relative rounded-3xl border border-line bg-surface p-7 sm:p-8 overflow-hidden">
        <svg className="absolute inset-0 w-full h-full opacity-[0.035]" aria-hidden="true">
          <pattern id="about-grid" width="26" height="26" patternUnits="userSpaceOnUse">
            <path d="M26 0H0V26" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#about-grid)" />
        </svg>

        <div className="relative flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-ink flex items-center justify-center text-cream font-display italic text-lg shrink-0">
            H
          </div>
          <div className="flex-1 h-px bg-line relative overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 bg-coffee"
              style={{ scaleX: lineProgress, transformOrigin: "left" }}
            />
          </div>
        </div>

        <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          {PARTNER_NAMES.map((name, i) => (
            <motion.div
              key={name}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-xl border border-line bg-cream px-3 py-3 text-center"
            >
              <span className="font-display italic text-sm text-ink">{name}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function About() {
  const { t } = useLanguage();

  return (
    <section id="about" className="px-6 py-28 md:py-32 border-t border-line bg-cream">
      <div className="max-w-content mx-auto grid md:grid-cols-[0.85fr_1.15fr] gap-14 md:gap-16">
        <div className="md:sticky md:top-28 h-fit">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5 }}
            className="text-sm font-medium text-coffee mb-4"
          >
            {t("about.eyebrow")}
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, delay: 0.08 }}
            className="font-display italic text-3xl sm:text-4xl leading-[1.12] text-ink"
          >
            {t("about.heading")}
          </motion.h2>
        </div>

        <div>
          {STAGES.map((s, i) => (
            <Stage
              key={s.tagKey}
              Icon={s.Icon}
              tag={t(`about.${s.tagKey}`)}
              text={t(`about.${s.textKey}`)}
              index={i}
              isLast={i === STAGES.length - 1}
            />
          ))}
          <PartnerConstellation />
        </div>
      </div>
    </section>
  );
}
