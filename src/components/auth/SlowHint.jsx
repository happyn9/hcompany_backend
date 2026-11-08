import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext.jsx";

/** Message rassurant qui n'apparaît que si une requête dure plus de
 * quelques secondes (serveur en train de se réveiller) — évite de laisser
 * croire que la page est bloquée. */
export default function SlowHint({ active, delayMs = 5000 }) {
  const { t } = useLanguage();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!active) {
      setShow(false);
      return;
    }
    const timer = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  if (!show) return null;
  return (
    <motion.p
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      role="status"
      className="flex items-start gap-2 text-xs text-ink-soft bg-latte-soft border border-line rounded-xl px-3.5 py-3"
    >
      <Loader2 size={14} className="animate-spin mt-0.5 shrink-0 text-coffee" />
      {t("auth.slowHint")}
    </motion.p>
  );
}
