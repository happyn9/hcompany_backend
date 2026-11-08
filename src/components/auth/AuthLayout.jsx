import { motion } from "framer-motion";
import { Link } from "react-router-dom";

/**
 * Mise en page partagée par toutes les pages d'authentification : un
 * panneau de formulaire à gauche, un panneau visuel de marque à droite
 * (masqué sur mobile). Cohérent d'une page à l'autre plutôt que chaque
 * page ait sa propre mise en page.
 */
export default function AuthLayout({ children, visual }) {
  return (
    <main className="min-h-screen grid lg:grid-cols-2 bg-cream">
      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-20 py-16">
        <Link to="/" className="font-display text-2xl text-ink mb-12 inline-block w-fit">
          H-Company
        </Link>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-sm"
        >
          {children}
        </motion.div>
      </div>

      <div className="hidden lg:block relative bg-ink overflow-hidden" aria-hidden="true">
        <div
          className="absolute inset-0 opacity-90"
          style={{ background: "radial-gradient(circle at 30% 20%, #4A3020 0%, #1E1A17 70%)" }}
        />
        {/* Motif de points en fond, décoratif uniquement */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.07]" aria-hidden="true">
          <pattern id="auth-dots" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.4" fill="#C89A3D" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#auth-dots)" />
        </svg>
        <div className="relative h-full flex items-center justify-center p-16">{visual}</div>
      </div>
    </main>
  );
}
