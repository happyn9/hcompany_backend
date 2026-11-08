import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldAlert } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext.jsx";

function formatCountdown(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Affiché à la place du formulaire quand le backend renvoie 429 — un
 * compte à rebours visuel plutôt qu'un simple message d'erreur en rouge,
 * pour que le blocage se sente comme une mesure de protection plutôt
 * qu'une panne.
 */
export default function LockoutNotice({ seconds = 900, onExpire }) {
  const { t } = useLanguage();
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) {
      onExpire?.();
      return;
    }
    const timer = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(timer);
  }, [remaining, onExpire]);

  const progress = 1 - remaining / seconds;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl border border-line bg-surface p-7 text-center"
    >
      <div className="relative w-16 h-16 mx-auto mb-5">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" fill="none" stroke="var(--color-line)" strokeWidth="4" />
          <motion.circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke="#C89A3D"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 28}
            initial={{ strokeDashoffset: 2 * Math.PI * 28 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 28 * (1 - progress) }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <ShieldAlert size={22} className="text-coffee-dark" />
        </div>
      </div>

      <h3 className="font-display text-lg text-ink mb-2">{t("auth.lockedTitle")}</h3>
      <p className="text-sm text-stone leading-relaxed mb-4">{t("auth.lockedBody")}</p>
      <p className="font-display text-2xl text-coffee-dark tabular-nums">{formatCountdown(remaining)}</p>
    </motion.div>
  );
}
