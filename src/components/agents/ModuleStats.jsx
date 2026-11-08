import { useShopMoney } from "../../data/shop.js";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { deptLabel, sparkPoints } from "../../lib/agents.js";

const T = {
  fr: { gross: "Revenu brut", commission: "Part H-Company", count: "Opérations", d30: "30 derniers jours", recent: "Dernières opérations", none: "Aucune opération pour le moment.", soon: "Module bientôt disponible : les statistiques apparaîtront à son lancement.", applications: "Candidatures", toReview: "à examiner", days: "14 derniers jours" },
  en: { gross: "Gross revenue", commission: "H-Company share", count: "Operations", d30: "Last 30 days", recent: "Recent operations", none: "No operations yet.", soon: "Module coming soon: statistics will show up at launch.", applications: "Applications", toReview: "to review", days: "Last 14 days" },
};

export default function ModuleStats({ module, stats }) {
  const { lang } = useLanguage();
  const t = T[lang] || T.fr;
  const { money } = useShopMoney();
  if (!stats) return null;
  const values = (stats.series || []).map((s) => s.value);
  const Tile = ({ label, value, sub }) => (
    <div className="rounded-2xl bg-cream border border-line p-4"><p className="text-xs text-ink-soft">{label}</p><p className="font-display text-2xl text-ink mt-1">{value}</p>{sub && <p className="text-[11px] text-ink-faint mt-0.5">{sub}</p>}</div>
  );
  return (
    <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6" aria-label={deptLabel(lang, module)}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="font-display text-xl text-ink">{deptLabel(lang, module)}</h3>
        {stats.available && <svg viewBox="0 0 120 32" width="120" height="32" role="img" aria-label={t.days} className="text-coffee"><polyline fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={sparkPoints(values)} /></svg>}
      </div>
      {!stats.available ? <p className="text-sm text-ink-soft">{t.soon}</p> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {module !== "partnerships" && <>
              <Tile label={t.gross} value={money(stats.gross)} sub={`${t.d30} : ${money(stats.gross_30d)}`} />
              <Tile label={t.commission} value={money(stats.commission)} sub={`${t.d30} : ${money(stats.commission_30d)}`} />
            </>}
            <Tile label={t.count} value={stats.count} sub={`${t.d30} : ${stats.count_30d}`} />
            {stats.applications && <Tile label={t.applications} value={Object.values(stats.applications).reduce((a, b) => a + b, 0)} sub={`${stats.to_review} ${t.toReview}`} />}
          </div>
          {module !== "partnerships" && (
            <div className="mt-5"><p className="text-sm font-medium text-ink mb-2">{t.recent}</p>
              {!stats.recent?.length ? <p className="text-sm text-ink-soft">{t.none}</p> : (
                <ul className="divide-y divide-line text-sm">{stats.recent.map((r) => (
                  <li key={r.code} className="py-2 flex items-center justify-between gap-3"><span className="min-w-0 truncate text-ink"><span className="font-mono text-xs text-ink-faint mr-2">{r.code}</span>{r.label}</span><span className="text-ink whitespace-nowrap">{money(r.amount)}</span></li>
                ))}</ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
