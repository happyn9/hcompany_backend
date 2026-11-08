const CATEGORY_LABELS = {
  contract: "Contrat",
  parcel: "Colis",
  booking: "Réservations",
  ticket: "Tickets",
  system: "Système",
};

export default function ActivityTab({ activities }) {
  if (activities.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-6">
        <p className="text-sm text-ink-soft">Aucune activité pour l'instant.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
            <th className="px-5 py-3 font-medium">Catégorie</th>
            <th className="px-5 py-3 font-medium">Événement</th>
            <th className="px-5 py-3 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {activities.map((a) => (
            <tr key={a.id} className="border-b border-line/60 last:border-0">
              <td className="px-5 py-3">
                <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-cream text-ink-soft">
                  {CATEGORY_LABELS[a.category] || a.category}
                </span>
              </td>
              <td className="px-5 py-3">
                <p className="text-ink font-medium">{a.label}</p>
                {a.detail && <p className="text-ink-soft text-xs mt-0.5">{a.detail}</p>}
              </td>
              <td className="px-5 py-3 text-ink-soft whitespace-nowrap">
                {new Date(a.created_at).toLocaleDateString("fr-FR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
