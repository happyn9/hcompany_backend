import { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

const ToastContext = createContext(null);
let idCounter = 0;

const ICONS = { success: CheckCircle2, error: XCircle, info: Info };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message, type = "info", duration = 4000) => {
      const id = ++idCounter;
      setToasts((t) => [...t, { id, message, type }]);
      if (duration) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const toast = {
    success: (msg, duration) => push(msg, "success", duration),
    error: (msg, duration) => push(msg, "error", duration),
    info: (msg, duration) => push(msg, "info", duration),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2.5 items-end pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => {
            const Icon = ICONS[t.type] || Info;
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="pointer-events-auto flex items-start gap-3 bg-ink text-cream rounded-2xl shadow-2xl px-4 py-3.5 max-w-sm border border-white/10"
              >
                <Icon
                  size={18}
                  className={`shrink-0 mt-0.5 ${
                    t.type === "success" ? "text-coffee-light" : t.type === "error" ? "text-red-300" : "text-cream/70"
                  }`}
                />
                <p className="text-sm leading-snug flex-1">{t.message}</p>
                <button onClick={() => dismiss(t.id)} className="shrink-0 text-cream/50 hover:text-cream transition-colors">
                  <X size={15} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast doit être utilisé à l'intérieur d'un <ToastProvider>.");
  return ctx;
}
