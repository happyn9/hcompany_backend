import { motion } from "framer-motion";

/**
 * Wrapper d'animation d'entrée au scroll, réutilisé par toutes les sections
 * du site — évite de dupliquer les mêmes props Framer Motion partout et
 * garantit un rythme d'animation cohérent sur l'ensemble du site.
 *
 * `once` reste à true par défaut : une section ne rejoue pas son animation
 * à chaque fois qu'on scrolle dessus, ce qui serait distrayant.
 */
export default function Reveal({
  children,
  delay = 0,
  y = 24,
  duration = 0.6,
  className,
  as = "div",
  ...props
}) {
  const MotionTag = motion[as] || motion.div;
  return (
    <MotionTag
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
      {...props}
    >
      {children}
    </MotionTag>
  );
}

/**
 * Conteneur à utiliser autour d'une liste d'éléments pour les faire
 * apparaître en cascade (stagger) plutôt que tous en même temps.
 * Les enfants directs doivent utiliser <RevealItem>.
 */
export function RevealGroup({ children, className, stagger = 0.08, ...props }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: stagger } },
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, y = 18, className, as = "div", ...props }) {
  const MotionTag = motion[as] || motion.div;
  return (
    <MotionTag
      variants={{
        hidden: { opacity: 0, y },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
      }}
      className={className}
      {...props}
    >
      {children}
    </MotionTag>
  );
}
