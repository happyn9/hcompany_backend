import { useRef } from "react";
import { motion, useInView } from "framer-motion";

/**
 * Enveloppe d'une section de la page d'accueil. Le contenu est rendu tout de suite (aucun faux
 * squelette, aucune copie cachée) ; il apparaît par un fondu léger quand il entre à l'écran.
 * `content-visibility: auto` laisse le navigateur ignorer le rendu des sections hors écran,
 * ce qui garde le défilement fluide sur une longue page.
 */
export default function SectionReveal({ children }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px 15% 0px" });
  return (
    <div ref={ref} style={{ contentVisibility: "auto", containIntrinsicSize: "auto 720px" }}>
      <motion.div initial={false} animate={inView ? { opacity: 1, y: 0 } : { opacity: 0.001, y: 10 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
        {children}
      </motion.div>
    </div>
  );
}
