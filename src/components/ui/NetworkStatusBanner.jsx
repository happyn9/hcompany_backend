import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { WifiOff } from "lucide-react";

/**
 * Bannière persistante (pas un toast qui disparaît) affichée tant que le
 * navigateur signale une coupure réseau — plus adaptée qu'un message
 * ponctuel pour un problème qui dure. Se ferme automatiquement dès que la
 * connexion revient.
 */
export default function NetworkStatusBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="fixed top-0 inset-x-0 z-[400] bg-ink text-cream px-4 py-2.5 flex items-center justify-center gap-2 text-sm"
        >
          <WifiOff size={15} />
          Pas de connexion Internet : certaines actions peuvent échouer.
        </motion.div>
      )}
    </AnimatePresence>
  );
}
