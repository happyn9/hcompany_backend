import { useEffect, useMemo, useState } from "react";
import { Loader2, Inbox, AlertCircle, GraduationCap, Users, Clock, Mail, CheckCircle2, PhoneCall } from "lucide-react";

function mailtoHref(request) {
  const subject = encodeURIComponent(`H-Company — Votre demande de formation d'équipe (${request.company})`);
  const body = encodeURIComponent(
    `Bonjour ${request.contact_name},\n\n` +
      `Merci pour votre demande concernant la formation de ${request.employee_count} employé(s) de ${request.company} ` +
      `(formule ${request.plan} mois).\n\n`
  );
  return `mailto:${request.contact_email}?subject=${subject}&body=${body}`;
}

const STATUS_STYLE = {
  new: { cls: "bg-latte-soft text-coffee-dark border-latte-light", dot: "bg-latte", label: "Nouvelle" },
  contacted: { cls: "bg-latte-soft text-coffee-dark border-coffee-light", dot: "bg-coffee", label: "Contactée" },
  closed: { cls: "bg-line/60 text-ink-faint border-line", dot: "bg-ink-faint", label: "Clôturée" },
};

function StatusBadge({ status }) {
  const st = STATUS_STYLE[status] || STATUS_STYLE.new;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${st.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
      {st.label}
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

function formatDate(value) {
  return new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

/** Vue admin des demandes de formation d'équipe H-Learning (une entreprise
 * qui inscrit plusieurs employés) — même schéma que ServiceSubscriptionsPanel :
 * cartes résumé + tableau des demandes avec passage de statut et notification
 * du contact. */
export default function CompanyTrainingPanel({ withAuth, api }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const list = await withAuth((token) => api.admin.listCompanyEnrollments(token));
      setRequests(list || []);
      setError(null);
    } catch {
      setError("Impossible de charger les demandes de formation.");
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
      await withAuth((token) => api.admin.updateCompanyEnrollmentStatus(token, id, status));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const summary = useMemo(() => {
    const newCount = requests.filter((r) => r.status === "new").length;
    const totalEmployees = requests.reduce((sum, r) => sum + (r.employee_count || 0), 0);
    const totalEstimated = requests
      .filter((r) => r.status !== "closed")
      .reduce((sum, r) => sum + (r.estimated_total || 0), 0);
    return { newCount, totalEmployees, totalEstimated };
  }, [requests]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-2xl bg-surface border border-line animate-pulse" />)}
        </div>
        <div className="h-64 rounded-2xl bg-surface border border-line animate-pulse" />
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
    { label: "Nouvelles demandes", value: summary.newCount, icon: Clock, tone: "bg-latte-soft text-coffee-dark" },
    { label: "Employés à former", value: summary.totalEmployees, icon: Users, tone: "bg-ink text-cream" },
    { label: "Potentiel mensuel", value: `${summary.totalEstimated.toLocaleString()} $`, icon: GraduationCap, tone: "bg-latte-soft text-coffee-dark" },
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
          <h2 className="font-display text-xl md:text-2xl text-ink">Demandes de formation d'équipe</h2>
          <p className="text-sm text-ink-soft mt-0.5">{requests.length} demande(s) reçue(s), tous plans confondus.</p>
        </div>
        {requests.length === 0 ? (
          <EmptyState text="Aucune demande de formation d'équipe pour le moment." />
        ) : (
          <>
            <div className="hidden md:block bg-surface border border-line rounded-2xl overflow-hidden">
              <table className="w-full text-sm block overflow-x-auto md:table">
                <thead>
                  <tr className="border-b border-line bg-cream/30 text-left text-[11px] text-ink-faint uppercase tracking-[0.12em]">
                    <th className="px-5 py-3 font-medium">Entreprise</th>
                    <th className="px-5 py-3 font-medium">Contact</th>
                    <th className="px-5 py-3 font-medium">Employés</th>
                    <th className="px-5 py-3 font-medium">Formule</th>
                    <th className="px-5 py-3 font-medium">Estimation</th>
                    <th className="px-5 py-3 font-medium">Statut</th>
                    <th className="px-5 py-3 font-medium">Reçue le</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => {
                    const rowBusy = busyId === r.id;
                    return (
                      <tr key={r.id} className="border-b border-line/60 last:border-0 hover:bg-cream/40 transition-colors align-top">
                        <td className="px-5 py-3.5">
                          <p className="text-ink font-medium">{r.company}</p>
                          {r.domains && <p className="text-xs text-ink-faint mt-0.5 max-w-[180px]">{r.domains}</p>}
                        </td>
                        <td className="px-5 py-3.5 text-ink-soft">
                          <p>{r.contact_name}</p>
                          <p className="text-xs text-ink-faint">{r.contact_email}</p>
                        </td>
                        <td className="px-5 py-3.5 text-ink-soft">{r.employee_count}</td>
                        <td className="px-5 py-3.5 text-ink-soft">{r.plan} mois</td>
                        <td className="px-5 py-3.5 text-ink-soft whitespace-nowrap">
                          {r.estimated_total.toLocaleString()} $/mois
                        </td>
                        <td className="px-5 py-3.5"><StatusBadge status={r.status} /></td>
                        <td className="px-5 py-3.5 text-ink-soft text-xs whitespace-nowrap">{formatDate(r.created_at)}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            <a
                              href={mailtoHref(r)}
                              title="Répondre par email"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-soft hover:bg-line/50 hover:text-ink transition-colors"
                            >
                              <Mail size={14} />
                            </a>
                            {r.status !== "contacted" && r.status !== "closed" && (
                              <button
                                onClick={() => updateStatus(r.id, "contacted")}
                                disabled={rowBusy}
                                title="Marquer comme contactée"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-soft hover:bg-line/50 hover:text-ink disabled:opacity-50 transition-colors"
                              >
                                {rowBusy ? <Loader2 size={14} className="animate-spin" /> : <PhoneCall size={14} />}
                              </button>
                            )}
                            {r.status !== "closed" && (
                              <button
                                onClick={() => updateStatus(r.id, "closed")}
                                disabled={rowBusy}
                                title="Clôturer"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-soft hover:bg-line/50 hover:text-ink disabled:opacity-50 transition-colors"
                              >
                                {rowBusy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
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
              {requests.map((r) => {
                const rowBusy = busyId === r.id;
                return (
                  <div key={r.id} className="bg-surface border border-line rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink truncate">{r.company}</p>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-xs text-ink-faint mt-1">
                      {r.contact_name} · {r.contact_email}
                    </p>
                    <p className="text-xs text-ink-soft mt-1">
                      {r.employee_count} employés · formule {r.plan} mois · {r.estimated_total.toLocaleString()} $/mois
                    </p>
                    <p className="text-xs text-ink-faint mt-1">{formatDate(r.created_at)}</p>
                    <div className="flex items-center gap-3 mt-2.5">
                      <a
                        href={mailtoHref(r)}
                        className="flex items-center gap-1 text-[11px] font-medium text-ink-soft hover:text-ink transition-colors"
                      >
                        <Mail size={12} /> Répondre
                      </a>
                      {r.status !== "contacted" && r.status !== "closed" && (
                        <button
                          onClick={() => updateStatus(r.id, "contacted")}
                          disabled={rowBusy}
                          className="flex items-center gap-1 text-[11px] font-medium text-ink-soft hover:text-ink transition-colors"
                        >
                          <PhoneCall size={12} /> Contactée
                        </button>
                      )}
                      {r.status !== "closed" && (
                        <button
                          onClick={() => updateStatus(r.id, "closed")}
                          disabled={rowBusy}
                          className="flex items-center gap-1 text-[11px] font-medium text-ink-soft hover:text-ink transition-colors"
                        >
                          <CheckCircle2 size={12} /> Clôturer
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
