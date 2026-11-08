import { CheckCircle2, FileText, Activity, Calendar } from "lucide-react";
import StatCard from "./StatCard.jsx";
import { useMemo } from "react";
import BigChart from "../ui/BigChart.jsx";
import ActivityDonutChart from "./ActivityDonutChart.jsx";

const CONTRACT_LABELS = {
  awaiting_signature: "À signer",
  signed: "Signé",
};

export default function OverviewTab({ application, stats, activities }) {
  const sinceLabel = stats?.partner_since
    ? new Date(stats.partner_since).toLocaleDateString("fr-FR", { year: "numeric", month: "long" })
    : " : ";

  const series = useMemo(() => {
    const days = [];
    for (let i = 29; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); days.push({ key: d.toDateString(), label: d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }), value: 0 }); }
    (activities || []).forEach((a) => { const k = new Date(a.created_at).toDateString(); const row = days.find((x) => x.key === k); if (row) row.value += 1; });
    return days;
  }, [activities]);

  return (
    <div className="space-y-6">
      <BigChart title="Activité" subtitle="30 derniers jours" unit="actions" height={260} data={series} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Candidature"
          value={application.status === "approved" ? "Approuvée" : application.status === "pending" ? "En attente" : "Non retenue"}
          icon={CheckCircle2}
          tone={application.status === "approved" ? "success" : application.status === "pending" ? "warning" : "default"}
        />
        <StatCard
          label="Contrat"
          value={stats?.contract_status ? CONTRACT_LABELS[stats.contract_status] : " : "}
          icon={FileText}
          tone={stats?.contract_status === "signed" ? "success" : "warning"}
        />
        <StatCard
          label="Activités totales"
          value={stats?.total_activities ?? 0}
          hint={`${stats?.activities_last_30_days ?? 0} sur les 30 derniers jours`}
          icon={Activity}
        />
        <StatCard label="Partenaire depuis" value={sinceLabel} icon={Calendar} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 bg-surface border border-line rounded-2xl p-6">
          <h3 className="font-medium text-ink mb-1">Répartition des activités</h3>
          <p className="text-xs text-ink-soft mb-2">Par catégorie</p>
          <ActivityDonutChart data={stats?.activities_by_category || []} />
        </div>

        <div className="lg:col-span-3 bg-surface border border-line rounded-2xl p-6">
          <h3 className="font-medium text-ink mb-4">Dernières activités</h3>
          {activities.length === 0 ? (
            <p className="text-sm text-ink-soft">Aucune activité pour l'instant.</p>
          ) : (
            <ul className="space-y-3">
              {activities.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-start justify-between text-sm border-b border-line/60 pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="text-ink font-medium">{a.label}</p>
                    {a.detail && <p className="text-ink-soft">{a.detail}</p>}
                  </div>
                  <span className="text-ink-soft whitespace-nowrap ml-4 text-xs">
                    {new Date(a.created_at).toLocaleDateString("fr-FR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
