import { useEffect, useMemo, useState } from "react";
import { Package, CreditCard, Smartphone, Clock, Wallet, Receipt, AlertCircle, Inbox } from "lucide-react";

const METHOD_ICON = { card: CreditCard, airtel_money: Smartphone, mtn_momo: Smartphone };
const METHOD_LABEL = { card: "Carte", airtel_money: "Airtel Money", mtn_momo: "MTN MoMo" };

const PAYMENT_STATUS = {
  completed: { label: "Complété", cls: "bg-latte-soft text-coffee-dark border-coffee-light", dot: "bg-coffee" },
  pending: { label: "En attente", cls: "bg-latte-soft text-coffee-dark border-latte-light", dot: "bg-latte" },
  failed: { label: "Échoué", cls: "bg-line/60 text-ink-soft border-line", dot: "bg-ink-faint" },
};

function formatDate(value) {
  return new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ status }) {
  const st = PAYMENT_STATUS[status] || PAYMENT_STATUS.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${st.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
      {st.label}
    </span>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-xl md:text-2xl text-ink">{title}</h2>
      <p className="text-sm text-ink-soft mt-0.5">{subtitle}</p>
    </div>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="bg-surface border border-dashed border-line rounded-2xl px-6 py-12 text-center">
      <span className="mx-auto w-12 h-12 rounded-2xl bg-cream flex items-center justify-center text-ink-faint mb-3">
        <Icon size={20} strokeWidth={1.6} />
      </span>
      <p className="text-sm text-ink-soft">{text}</p>
    </div>
  );
}

/** Vue agrégée, tous partenaires confondus : demandes d'apps en attente
 * et paiements récents — pour ne pas devoir ouvrir chaque candidature une
 * par une pour voir ce qui nécessite une action. */
export default function AllRequestsPanel({ withAuth, api }) {
  const [apps, setApps] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      withAuth((token) => api.admin.pendingApps(token)).catch(() => []),
      withAuth((token) => api.admin.listPayments(token)).catch(() => []),
    ])
      .then(([pendingApps, allPayments]) => {
        setApps(pendingApps);
        setPayments(allPayments);
      })
      .catch(() => setError("Impossible de charger les demandes."))
      .finally(() => setLoading(false));
  }, [withAuth, api]);

  const summary = useMemo(() => {
    const completed = payments.filter((p) => p.status === "completed");
    return {
      collected: completed.reduce((sum, p) => sum + (p.amount || 0), 0),
      pendingPayments: payments.filter((p) => p.status === "pending").length,
    };
  }, [payments]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-2xl bg-surface border border-line animate-pulse" />)}
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-36 rounded-2xl bg-surface border border-line animate-pulse" />)}
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
    { label: "Apps à valider", value: apps.length, icon: Package, tone: "bg-latte-soft text-coffee-dark" },
    { label: "Total encaissé", value: `${summary.collected.toFixed(0)} $`, icon: Wallet, tone: "bg-ink text-cream" },
    { label: "Paiements en attente", value: summary.pendingPayments, icon: Clock, tone: "bg-latte-soft text-coffee-dark" },
  ];

  return (
    <div className="space-y-10 md:space-y-12">
      {/* Résumé */}
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

      {/* Apps en attente */}
      <section>
        <SectionHeader
          title="Demandes d'apps en attente"
          subtitle={`${apps.length} demande${apps.length !== 1 ? "s" : ""} à traiter, tous partenaires confondus.`}
        />
        {apps.length === 0 ? (
          <EmptyState icon={Inbox} text="Aucune demande d'app en attente pour l'instant." />
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {apps.map((app) => (
              <article
                key={app.id}
                className="group bg-surface border border-line rounded-2xl p-5 flex flex-col transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-coffee-light"
              >
                <div className="flex items-start justify-between mb-4">
                  <span className="w-11 h-11 rounded-xl bg-cream flex items-center justify-center text-coffee-dark group-hover:bg-coffee group-hover:text-white transition-colors">
                    <Package size={19} strokeWidth={1.8} />
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border bg-latte-soft text-coffee-dark border-latte-light">
                    <span className="w-1.5 h-1.5 rounded-full bg-latte animate-pulse" />
                    En attente
                  </span>
                </div>
                <p className="font-display text-lg text-ink leading-snug">{app.name}</p>
                {app.description && (
                  <p className="text-sm text-ink-soft mt-1.5 leading-relaxed line-clamp-3">{app.description}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Paiements */}
      <section>
        <SectionHeader
          title="Paiements récents"
          subtitle={`${payments.length} paiement${payments.length !== 1 ? "s" : ""} enregistré${payments.length !== 1 ? "s" : ""}, tous partenaires confondus.`}
        />
        {payments.length === 0 ? (
          <EmptyState icon={Receipt} text="Aucun paiement enregistré pour l'instant." />
        ) : (
          <>
            {/* Desktop : tableau */}
            <div className="hidden md:block bg-surface border border-line rounded-2xl overflow-hidden">
              <table className="w-full text-sm block overflow-x-auto md:table">
                <thead>
                  <tr className="border-b border-line bg-cream/30 text-left text-[11px] text-ink-faint uppercase tracking-[0.12em]">
                    <th className="px-5 py-3 font-medium">Référence</th>
                    <th className="px-5 py-3 font-medium">Méthode</th>
                    <th className="px-5 py-3 font-medium text-right">Montant</th>
                    <th className="px-5 py-3 font-medium">Statut</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const Icon = METHOD_ICON[p.method] || CreditCard;
                    return (
                      <tr key={p.id} className="border-b border-line/60 last:border-0 hover:bg-cream/40 transition-colors">
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-xs text-ink bg-cream/70 rounded-md px-2 py-1">{p.reference}</span>
                        </td>
                        <td className="px-5 py-3.5 text-ink-soft">
                          <span className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-lg bg-cream flex items-center justify-center text-coffee-dark">
                              <Icon size={13} />
                            </span>
                            {METHOD_LABEL[p.method] || p.method}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right text-ink font-semibold tabular-nums">{p.amount.toFixed(0)} $</td>
                        <td className="px-5 py-3.5"><StatusBadge status={p.status} /></td>
                        <td className="px-5 py-3.5 text-ink-soft text-xs whitespace-nowrap">{formatDate(p.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile : cartes */}
            <div className="md:hidden space-y-2.5">
              {payments.map((p) => {
                const Icon = METHOD_ICON[p.method] || CreditCard;
                return (
                  <div key={p.id} className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-cream flex items-center justify-center text-coffee-dark shrink-0">
                      <Icon size={17} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink">{METHOD_LABEL[p.method] || p.method}</p>
                      <p className="font-mono text-[11px] text-ink-faint truncate">{p.reference} · {formatDate(p.created_at)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-ink tabular-nums mb-1">{p.amount.toFixed(0)} $</p>
                      <StatusBadge status={p.status} />
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