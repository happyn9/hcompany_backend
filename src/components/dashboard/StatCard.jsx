export default function StatCard({ label, value, hint, icon: Icon, tone = "default" }) {
  const toneClasses = {
    default: "text-ink",
    success: "text-coffee-dark",
    warning: "text-amber-700",
  };

  return (
    <div className="bg-surface border border-line rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-ink-soft uppercase tracking-wide">{label}</p>
        {Icon && <Icon size={18} strokeWidth={1.8} className="text-ink-faint" />}
      </div>
      <p className={`font-display text-3xl ${toneClasses[tone]}`}>{value}</p>
      {hint && <p className="text-xs text-ink-soft mt-1">{hint}</p>}
    </div>
  );
}
