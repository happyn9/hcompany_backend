import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Compass } from "lucide-react";
import { useLanguage } from "../context/LanguageContext.jsx";

export default function NotFound() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="w-16 h-16 rounded-2xl bg-[#C89A3D]/15 flex items-center justify-center mx-auto mb-6">
          <Compass size={26} className="text-coffee-dark" />
        </div>
        <p className="font-display text-6xl text-ink-faint mb-3">404</p>
        <h1 className="font-display italic text-2xl text-ink mb-3">
          {t("notFound.title")}
        </h1>
        <p className="text-stone max-w-sm mx-auto mb-8">{t("notFound.lead")}</p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-6 py-3 hover:bg-coffee-dark transition-colors"
        >
          <ArrowLeft size={15} />
          {t("notFound.cta")}
        </Link>
      </motion.div>
    </div>
  );
}
