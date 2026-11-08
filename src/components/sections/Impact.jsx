import { useEffect, useRef, useState } from "react";
import { motion, useInView, animate } from "framer-motion";
import Reveal from "../ui/Reveal.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";

function Counter({ to, suffix = "" }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, to, {
      duration: 1.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, to]);

  return (
    <span ref={ref} className="font-display text-4xl sm:text-5xl text-cream-fixed tabular-nums">
      {display}
      {suffix}
    </span>
  );
}

export default function Impact() {
  const { t } = useLanguage();

  const STATS = [
    { to: 4, suffix: "", label: t("impact.stat1") },
    { to: 1240, suffix: "+", label: t("impact.stat2") },
    { to: 2, suffix: "", label: t("impact.stat3") },
    { to: 99, suffix: "%", label: t("impact.stat4") },
  ];

  return (
    <section id="impact" className="px-6 py-24 md:py-28 border-t border-line bg-ink-fixed text-cream-fixed overflow-hidden">
      <div className="max-w-content mx-auto">
        <Reveal className="text-center max-w-xl mx-auto mb-14">
          <p className="text-sm font-medium text-[#C89A3D] mb-4">{t("impact.eyebrow")}</p>
          <h2 className="font-display italic text-3xl sm:text-4xl leading-tight">
            {t("impact.heading")}
          </h2>
        </Reveal>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-6">
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="text-center"
            >
              <Counter to={s.to} suffix={s.suffix} />
              <p className="text-sm text-cream-fixed/60 mt-2">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
