import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const CATEGORY_LABELS = {
  contract: "Contrat",
  parcel: "Colis",
  booking: "Réservations",
  ticket: "Tickets",
  system: "Système",
};

// Palette cohérente avec l'identité H-Company (café/or/vert forêt) plutôt
// que les couleurs par défaut de recharts.
const COLORS = ["#4A3020", "#C89A3D", "#A94B32", "#8B927E", "#2E1D12"];

export default function ActivityDonutChart({ data }) {
  const chartData = data
    .filter((d) => d.count > 0)
    .map((d) => ({ name: CATEGORY_LABELS[d.category] || d.category, value: d.count }));

  if (chartData.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-ink-soft">
        Pas encore d'activité à afficher.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={2}
        >
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #DAD4C2", fontSize: 13 }}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 13, color: "#726A60" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
