import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCheck } from "lucide-react";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";

const POLL_MS = 45000;

function timeAgo(iso, lang) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return lang === "fr" ? "à l'instant" : "just now";
  if (mins < 60) return lang === "fr" ? `il y a ${mins} min` : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return lang === "fr" ? `il y a ${hours} h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return lang === "fr" ? `il y a ${days} j` : `${days}d ago`;
}

/** Cloche de notifications dans la navbar — poll léger (pas de websocket
 * pour l'instant) des notifications in-app créées par l'admin ou le
 * backend (statut de demande de service, message admin, etc). */
export default function NotificationBell() {
  const { withAuth, isAuthenticated } = useUser();
  const { t, lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await withAuth((token) => api.notifications.mine(token));
      setItems(data || []);
    } catch {
      // silencieux : la cloche ne doit jamais faire planter la navbar
    } finally {
      setLoading(false);
    }
  }, [withAuth]);

  useEffect(() => {
    if (!isAuthenticated) return;
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [isAuthenticated, load]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function handleMarkAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await withAuth((token) => api.notifications.markAllRead(token));
    } catch {
      load();
    }
  }

  async function handleItemClick(notif) {
    if (notif.read) return;
    setItems((prev) => prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)));
    try {
      await withAuth((token) => api.notifications.markRead(token, notif.id));
    } catch {
      load();
    }
  }

  if (!isAuthenticated) return null;
  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("nav.notifications")}
        className="relative w-9 h-9 rounded-full flex items-center justify-center text-ink-soft hover:bg-ink/[0.06] hover:text-ink transition-colors"
      >
        <Bell size={18} strokeWidth={1.8} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#C89A3D] text-ink text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 mt-2.5 w-80 max-w-[90vw] bg-surface border border-line rounded-2xl shadow-xl overflow-hidden origin-top-right"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <p className="text-sm font-semibold text-ink">{t("nav.notifications")}</p>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink transition-colors"
                >
                  <CheckCheck size={13} />
                  {t("nav.markAllRead")}
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="p-4 space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-12 rounded-xl bg-line/40 animate-pulse" />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <p className="text-sm text-ink-faint text-center py-8 px-4">{t("nav.noNotifications")}</p>
              ) : (
                items.map((notif) => (
                  <button
                    key={notif.id}
                    onClick={() => handleItemClick(notif)}
                    className={`w-full text-left px-4 py-3 border-b border-line last:border-b-0 transition-colors hover:bg-ink/[0.03] ${
                      !notif.read ? "bg-[#C89A3D]/[0.06]" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!notif.read && <span className="w-1.5 h-1.5 rounded-full bg-[#C89A3D] mt-1.5 shrink-0" />}
                      <div className={`min-w-0 ${notif.read ? "pl-3.5" : ""}`}>
                        <p className="text-sm font-medium text-ink truncate">{notif.title}</p>
                        <p className="text-xs text-ink-soft mt-0.5 line-clamp-2">{notif.body}</p>
                        <p className="text-[11px] text-ink-faint mt-1">{timeAgo(notif.created_at, lang)}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
