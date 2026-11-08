import { useEffect, useMemo, useState } from "react";
import { Check, X, Loader2, Compass, Inbox, AlertCircle, Users, Clock, Bell, Ban, RotateCcw } from "lucide-react";
import ServiceLogo from "../services/ServiceLogo.jsx";
import NotifyUserModal from "./NotifyUserModal.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";

const STATUS_STYLE = {
  requested: { cls: "bg-latte-soft text-coffee-dark border-latte-light", dot: "bg-latte" },
  active: { cls: "bg-latte-soft text-coffee-dark border-coffee-light", dot: "bg-coffee" },
  suspended: { cls: "bg-chocolate text-cream-fixed border-chocolate", dot: "bg-latte" },
  rejected: { cls: "bg-line/60 text-ink-faint border-line", dot: "bg-ink-faint" },
};

function StatusBadge({ status, t }) {
  const st = STATUS_STYLE[status] || STATUS_STYLE.requested;
  const label = t(`myServices.status${status.charAt(0).toUpperCase()}${status.slice(1)}`);
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${st.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
      {label}
    </span>
  );
}

function EmptyState({ text }) {
  return (
    <div className="bg-surface border border-dashed border-line rounded-2xl px-6 py-12 text-center">
      <span className="mx-auto w-12 h-12 rounded-2xl bg-cream flex items-center justify-center text-ink-faint mb-3">
        <Inbox size={20} strokeWidth={1.6} />
      </span>
      <p className="text-sm text-ink-soft">{text}</p>
    </div>
  );
}

function formatDate(value, lang) {
  return new Date(value).toLocaleDateString(lang === "en" ? "en-US" : "fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Vue admin des abonnements clients aux services H-Company (H-Transport,
 * H-Restaurant, H-Learning...) — sur le modèle de AllRequestsPanel/
 * PartnerAppsPanel : cartes résumé + demandes en attente à traiter +
 * historique complet, tous clients confondus. */
export default function ServiceSubscriptionsPanel({ withAuth, api }) {
  const { t, lang } = useLanguage();
  const [pending, setPending] = useState([]);
  const [all, setAll] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [noteDraft, setNoteDraft] = useState({});
  const [notifyTarget, setNotifyTarget] = useState(null); // sub en cours de notification

  function localizedLabel(serviceKey) {
    const tr = t(`exploreServices.catalog.${serviceKey}`);
    return (typeof tr === "object" && tr?.label) || serviceKey;
  }

  const logoByKey = Object.fromEntries(catalog.map((c) => [c.key, c.logo_url]));

  async function load() {
    setLoading(true);
    try {
      const [p, a, c] = await Promise.all([
        withAuth((token) => api.admin.pendingSubscriptions(token)).catch(() => []),
        withAuth((token) => api.admin.listSubscriptions(token)).catch(() => []),
        api.services.catalog().catch(() => []),
      ]);
      setPending(p || []);
      setAll(a || []);
      setCatalog(c || []);
      setError(null);
    } catch {
      setError(t("adminServices.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateStatus(id, status) {
    setBusyId(id);
    try {
      await withAuth((token) => api.admin.updateSubscriptionStatus(token, id, status, noteDraft[id]));
      setNoteDraft((d) => ({ ...d, [id]: "" }));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const summary = useMemo(() => {
    const active = all.filter((s) => s.status === "active");
    const uniqueUsers = new Set(all.map((s) => s.user_id));
    return { activeCount: active.length, userCount: uniqueUsers.size };
  }, [all]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-2xl bg-surface border border-line animate-pulse" />)}
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-40 rounded-2xl bg-surface border border-line animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-2xl p-5 text-sm text-red-700">
        <AlertCircle size={16} /> {error}
      </div>
    );
  }

  const cards = [
    { label: t("adminServices.statToProcess"), value: pending.length, icon: Clock, tone: "bg-latte-soft text-coffee-dark" },
    { label: t("adminServices.statActive"), value: summary.activeCount, icon: Compass, tone: "bg-ink text-cream" },
    { label: t("adminServices.statClients"), value: summary.userCount, icon: Users, tone: "bg-latte-soft text-coffee-dark" },
  ];

  return (
    <div className="space-y-10 md:space-y-12">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="bg-surface border border-line rounded-2xl p-5 flex items-center gap-4">
            <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
              <Icon size={19} strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <p className="font-display text-2xl md:text-3xl text-ink leading-none truncate">{value}</p>
              <p className="text-xs text-ink-soft mt-1.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <section>
        <div className="mb-4">
          <h2 className="font-display text-xl md:text-2xl text-ink">{t("adminServices.pendingTitle")}</h2>
          <p className="text-sm text-ink-soft mt-0.5">
            {pending.length} {t("adminServices.pendingSubtitle")}
          </p>
        </div>
        {pending.length === 0 ? (
          <EmptyState text={t("adminServices.emptyPending")} />
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {pending.map((sub) => {
              const busy = busyId === sub.id;
              return (
                <article key={sub.id} className="bg-surface border border-line rounded-2xl p-5 flex flex-col">
                  <div className="flex items-start justify-between mb-3">
                    <span className="w-11 h-11 rounded-xl bg-cream flex items-center justify-center text-coffee-dark shrink-0 overflow-hidden">
                      <ServiceLogo logoUrl={logoByKey[sub.service_key]} serviceKey={sub.service_key} size={19} />
                    </span>
                    <StatusBadge status={sub.status} t={t} />
                  </div>
                  <p className="font-display text-lg text-ink leading-snug">{localizedLabel(sub.service_key)}</p>
                  <p className="text-xs text-ink-faint mt-1">
                    {sub.user_full_name || sub.user_email || `#${sub.user_id}`} · {formatDate(sub.created_at, lang)}
                  </p>
                  {sub.message && (
                    <p className="text-sm text-ink-soft mt-2 leading-relaxed line-clamp-3">{sub.message}</p>
                  )}

                  <input
                    type="text"
                    placeholder={t("adminServices.notePlaceholder")}
                    value={noteDraft[sub.id] || ""}
                    onChange={(e) => setNoteDraft((d) => ({ ...d, [sub.id]: e.target.value }))}
                    className="mt-3 w-full text-xs rounded-lg border border-line bg-cream/50 px-3 py-2 outline-none placeholder:text-ink-faint focus:border-coffee-light"
                  />

                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      onClick={() => updateStatus(sub.id, "active")}
                      disabled={busy}
                      className="flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg bg-coffee text-white py-2 hover:bg-coffee-dark disabled:opacity-50 transition-colors"
                    >
                      {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      {t("adminServices.approve")}
                    </button>
                    <button
                      onClick={() => updateStatus(sub.id, "rejected")}
                      disabled={busy}
                      className="flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg border border-line text-ink-soft py-2 hover:bg-line/50 hover:text-ink hover:border-ink-faint disabled:opacity-50 transition-colors"
                    >
                      <X size={13} />
                      {t("adminServices.reject")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4">
          <h2 className="font-display text-xl md:text-2xl text-ink">{t("adminServices.historyTitle")}</h2>
          <p className="text-sm text-ink-soft mt-0.5">
            {all.length} {t("adminServices.historySubtitle")}
          </p>
        </div>
        {all.length === 0 ? (
          <EmptyState text={t("adminServices.emptyHistory")} />
        ) : (
          <>
            <div className="hidden md:block bg-surface border border-line rounded-2xl overflow-hidden">
              <table className="w-full text-sm block overflow-x-auto md:table">
                <thead>
                  <tr className="border-b border-line bg-cream/30 text-left text-[11px] text-ink-faint uppercase tracking-[0.12em]">
                    <th className="px-5 py-3 font-medium">{t("adminServices.colService")}</th>
                    <th className="px-5 py-3 font-medium">{t("adminServices.colClient")}</th>
                    <th className="px-5 py-3 font-medium">{t("adminServices.colStatus")}</th>
                    <th className="px-5 py-3 font-medium">{t("adminServices.colRequestedOn")}</th>
                    <th className="px-5 py-3 font-medium">{t("adminServices.colAdminNote")}</th>
                    <th className="px-5 py-3 font-medium text-right">{t("adminServices.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((sub) => {
                    const rowBusy = busyId === sub.id;
                    return (
                      <tr key={sub.id} className="border-b border-line/60 last:border-0 hover:bg-cream/40 transition-colors">
                        <td className="px-5 py-3.5">
                          <span className="flex items-center gap-2 text-ink">
                            <span className="w-7 h-7 rounded-lg bg-cream flex items-center justify-center text-coffee-dark overflow-hidden">
                              <ServiceLogo logoUrl={logoByKey[sub.service_key]} serviceKey={sub.service_key} size={13} />
                            </span>
                            {localizedLabel(sub.service_key)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-ink-soft">
                          {sub.user_full_name || sub.user_email || `#${sub.user_id}`}
                        </td>
                        <td className="px-5 py-3.5"><StatusBadge status={sub.status} t={t} /></td>
                        <td className="px-5 py-3.5 text-ink-soft text-xs whitespace-nowrap">{formatDate(sub.created_at, lang)}</td>
                        <td className="px-5 py-3.5 text-ink-faint text-xs">{sub.admin_note || "—"}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setNotifyTarget(sub)}
                              title={t("adminServices.notify")}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-soft hover:bg-line/50 hover:text-ink transition-colors"
                            >
                              <Bell size={14} />
                            </button>
                            {sub.status === "active" && (
                              <button
                                onClick={() => updateStatus(sub.id, "suspended")}
                                disabled={rowBusy}
                                title={t("adminServices.suspend")}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-soft hover:bg-red-50 hover:text-red-600 disabled:opacity-50 transition-colors"
                              >
                                {rowBusy ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                              </button>
                            )}
                            {sub.status === "suspended" && (
                              <button
                                onClick={() => updateStatus(sub.id, "active")}
                                disabled={rowBusy}
                                title={t("adminServices.reactivate")}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-soft hover:bg-line/50 hover:text-ink disabled:opacity-50 transition-colors"
                              >
                                {rowBusy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-2.5">
              {all.map((sub) => {
                return (
                  <div key={sub.id} className="bg-surface border border-line rounded-2xl p-4 flex items-start gap-3">
                    <span className="w-10 h-10 rounded-xl bg-cream flex items-center justify-center text-coffee-dark shrink-0 overflow-hidden">
                      <ServiceLogo logoUrl={logoByKey[sub.service_key]} serviceKey={sub.service_key} size={17} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-ink truncate">{localizedLabel(sub.service_key)}</p>
                        <StatusBadge status={sub.status} t={t} />
                      </div>
                      <p className="text-xs text-ink-faint mt-1 truncate">
                        {sub.user_full_name || sub.user_email || `#${sub.user_id}`} · {formatDate(sub.created_at, lang)}
                      </p>
                      {sub.admin_note && <p className="text-xs text-ink-soft mt-1">{sub.admin_note}</p>}
                      <div className="flex items-center gap-1 mt-2">
                        <button
                          onClick={() => setNotifyTarget(sub)}
                          className="flex items-center gap-1 text-[11px] font-medium text-ink-soft hover:text-ink transition-colors"
                        >
                          <Bell size={12} /> {t("adminServices.notify")}
                        </button>
                        {sub.status === "active" && (
                          <button
                            onClick={() => updateStatus(sub.id, "suspended")}
                            disabled={busyId === sub.id}
                            className="flex items-center gap-1 text-[11px] font-medium text-red-600 hover:text-red-700 transition-colors ml-3"
                          >
                            <Ban size={12} /> {t("adminServices.suspend")}
                          </button>
                        )}
                        {sub.status === "suspended" && (
                          <button
                            onClick={() => updateStatus(sub.id, "active")}
                            disabled={busyId === sub.id}
                            className="flex items-center gap-1 text-[11px] font-medium text-ink-soft hover:text-ink transition-colors ml-3"
                          >
                            <RotateCcw size={12} /> {t("adminServices.reactivate")}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {notifyTarget && (
        <NotifyUserModal
          user={{ id: notifyTarget.user_id, email: notifyTarget.user_email, full_name: notifyTarget.user_full_name }}
          defaultTitle={`${localizedLabel(notifyTarget.service_key)}`}
          onClose={() => setNotifyTarget(null)}
          onSend={(payload) => withAuth((token) => api.admin.sendNotification(token, payload))}
        />
      )}
    </div>
  );
}
