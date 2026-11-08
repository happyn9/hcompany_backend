import { useRef, useState, useEffect, useCallback, Children } from "react";
import { motion, useMotionValue, useAnimation } from "framer-motion";

function SealArrow({ dir }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d={dir === "prev" ? "M9.5 3L4.5 7.5L9.5 12" : "M5.5 3L10.5 7.5L5.5 12"}
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Carousel piloté par un index (pas par scrollLeft brut) : chaque carte
 * anime sa position avec Framer Motion, et se laisse aussi faire glisser
 * (drag) à la souris/au doigt. Les couleurs (points, boutons) viennent de
 * variables CSS définies par le composant parent (--hc-gold, --hc-ink,
 * --hc-line...), donc ce composant reste neutre et réutilisable tel quel
 * dans n'importe quelle section du site.
 */
export default function Carousel({ children, gap = 24 }) {
  const items = Children.toArray(children);
  const count = items.length;
  const containerRef = useRef(null);
  const cardRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(0); // largeur carte + gap, mesurée
  const [maxDrag, setMaxDrag] = useState(0);
  const x = useMotionValue(0);
  const controls = useAnimation();

  const measure = useCallback(() => {
    const container = containerRef.current;
    const card = cardRef.current;
    if (!container || !card) return;
    const cardWidth = card.getBoundingClientRect().width;
    const s = cardWidth + gap;
    setStep(s);
    const totalWidth = s * count - gap;
    setMaxDrag(Math.max(0, totalWidth - container.clientWidth));
  }, [count, gap]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const goTo = useCallback(
    (i) => {
      const clamped = Math.max(0, Math.min(i, count - 1));
      const target = -Math.min(clamped * step, maxDrag);
      setIndex(clamped);
      controls.start({ x: target, transition: { type: "spring", stiffness: 260, damping: 32 } });
    },
    [controls, count, maxDrag, step]
  );

  function handleDragEnd(_, info) {
    const draggedBy = info.offset.x;
    const velocity = info.velocity.x;
    let target = index;
    if (draggedBy < -60 || velocity < -400) target = index + 1;
    else if (draggedBy > 60 || velocity > 400) target = index - 1;
    goTo(target);
  }

  const progress = count > 1 ? index / (count - 1) : 0;

  return (
    <div className="hc-carousel">
      <style>{`
        .hc-carousel-nav {
          display: flex; align-items: center; gap: 1.75rem;
          margin-bottom: 2.25rem;
        }
        .hc-carousel-count {
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 0.78rem;
          color: var(--hc-mist, #656B58);
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }
        .hc-carousel-count b { color: var(--hc-ink, #10140F); font-weight: 600; }

        .hc-carousel-dots { display: flex; align-items: center; gap: 0.4rem; flex: 1; }
        .hc-carousel-dot {
          height: 5px; border-radius: 100px;
          background: var(--hc-line-strong, #D4D8CB);
          cursor: pointer; border: none; padding: 0;
          width: 5px;
          transition: background 0.2s ease;
        }
        .hc-carousel-dot[data-active="true"] {
          width: 22px;
          background: var(--hc-gold, #C89A3D);
        }
        .hc-carousel-dot:hover { background: var(--hc-gold, #C89A3D); opacity: 0.7; }

        .hc-carousel-btns { display: flex; gap: 0.6rem; }
        .hc-carousel-btn {
          width: 36px; height: 36px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          border: 1px solid var(--hc-line-strong, #AEB6A2);
          background: transparent;
          color: var(--hc-ink, #10140F);
          cursor: pointer;
          transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
        }
        .hc-carousel-btn:hover:not(:disabled) {
          border-color: var(--hc-gold, #C89A3D);
          background: var(--hc-gold, #C89A3D);
        }
        .hc-carousel-btn:disabled { opacity: 0.35; cursor: default; }
        .hc-carousel-btn:focus-visible { outline: 2px solid var(--hc-gold, #C89A3D); outline-offset: 2px; }

        .hc-carousel-viewport { overflow: hidden; }
        .hc-carousel-track {
          display: flex;
          gap: ${gap}px;
          cursor: grab;
        }
        .hc-carousel-track:active { cursor: grabbing; }
      `}</style>

      <div className="hc-carousel-nav">
        <span className="hc-carousel-count">
          <b>{String(index + 1).padStart(2, "0")}</b> / {String(count).padStart(2, "0")}
        </span>
        <div className="hc-carousel-dots" role="tablist" aria-label="Navigation du carrousel">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Aller à l'élément ${i + 1}`}
              className="hc-carousel-dot"
              data-active={i === index}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
        <div className="hc-carousel-btns">
          <button
            type="button"
            className="hc-carousel-btn"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            aria-label="Précédent"
          >
            <SealArrow dir="prev" />
          </button>
          <button
            type="button"
            className="hc-carousel-btn"
            onClick={() => goTo(index + 1)}
            disabled={index === count - 1}
            aria-label="Suivant"
          >
            <SealArrow dir="next" />
          </button>
        </div>
      </div>

      <div className="hc-carousel-viewport" ref={containerRef}>
        <motion.div
          className="hc-carousel-track"
          drag="x"
          dragConstraints={{ left: -maxDrag, right: 0 }}
          dragElastic={0.08}
          onDragEnd={handleDragEnd}
          animate={controls}
          style={{ x }}
        >
          {items.map((child, i) => (
            <div key={i} ref={i === 0 ? cardRef : undefined}>
              {child}
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
