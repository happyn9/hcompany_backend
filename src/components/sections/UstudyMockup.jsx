import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "../../context/LanguageContext.jsx";

export default function UstudyMockup() {
  const { t } = useLanguage();
  const [screen, setScreen] = useState(0);
  const screens = [t("companies.ustudy.appScreen1"), t("companies.ustudy.appScreen2")];

  useEffect(() => {
    const timer = setInterval(() => setScreen((s) => (s + 1) % screens.length), 2400);
    return () => clearInterval(timer);
  }, [screens.length]);

  return (
    <div className="flex justify-center py-2">
      {/* Cadre de téléphone dessiné en CSS : pas une vraie capture d'écran,
          juste une illustration stylisée cohérente avec l'identité visuelle. */}
      <div className="relative w-[140px] h-[280px] rounded-[22px] bg-white/10 border border-white/20 p-1.5">
        <div className="w-full h-full rounded-[16px] bg-[#1E1A17] overflow-hidden relative">
          <div className="absolute top-0 inset-x-0 h-4 flex items-center justify-center">
            <div className="w-10 h-1.5 rounded-full bg-white/20" />
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={screen}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 pt-7 px-3"
            >
              <p className="text-[0.6rem] text-[#C89A3D] font-medium mb-2">{screens[screen]}</p>
              {screen === 0 ? (
                <div className="space-y-2">
                  {[70, 45, 90].map((w, i) => (
                    <div key={i} className="h-8 rounded-lg bg-white/[0.07] flex items-center px-2">
                      <div className="h-1.5 rounded-full bg-white/20" style={{ width: `${w}%` }} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="h-16 rounded-lg bg-white/[0.07] flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full border-2 border-dashed border-[#C89A3D]/50" />
                  </div>
                  <div className="h-6 rounded-md bg-[#C89A3D]/80" />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
