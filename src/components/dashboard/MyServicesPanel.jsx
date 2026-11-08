import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import StatCard from "./StatCard.jsx";
import ServiceLogo from "../services/ServiceLogo.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";

const STATUS_TONE = {
  requested: "bg-amber-50 text-amber-700 border-amber-200",
  active: "bg-[#F1EAE0] text-coffee-dark border-coffee-light",
  suspended: "bg-red-50 text-red-700 border-red-200",
  rejected: "bg-line text-ink-faint border-line",
};

/** Panneau "Mes services" du tableau de bord client — services H-Company
 * (H-Transport, H-Restaurant, H-Learning...) auxquels l'utilisateur s'est
 * abonné, avec leur statut d'approbation. La demande elle-même se fait
 * depuis la section "Explorez nos services" de la page d'accueil ; ce
 * panneau est purement un suivi, à l'image de AppsTab côté partenaire. */
export default function MyServicesPanel({ summary, catalog = [] }) {
  const { t } = useLanguage();
  const subscriptions = summary?.subscriptions || [];
  const statusLabel = (status) => t(`myServices.status${status.charAt(0).toUpperCase()}${status.slice(1)}`);
  const logoByKey = Object.fromEntries(catalog.map((c) => [c.key, c.logo_url]));

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-4">
        <StatCard
          label={t("myServices.activeLabel")}
          value={summary?.active_count ?? 0}
          hint={t("myServices.activeHint")}
          tone="success"
        />
        <StatCard
          label={t("myServices.totalLabel")}
          value={summary?.total_count ?? 0}
          hint={t("myServices.totalHint")}
        />
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-medium text-ink">{t("myServices.heading")}</h3>
        <Link
          to="/infos#explorer"
          className="flex items-center gap-1.5 text-sm font-medium rounded-full bg-ink text-cream px-4 py-2 hover:bg-coffee-dark transition-colors"
        >
          <Compass size={15} />
          {t("myServices.exploreCta")}
        </Link>
      </div>

      {subscriptions.length === 0 ? (
        <div className="bg-surface border border-line rounded-2xl p-6 text-center">
          <p className="text-sm text-ink-soft">{t("myServices.emptyText")}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {subscriptions.map((sub) => {
            const catalogTr = t(`exploreServices.catalog.${sub.service_key}`);
            const label = (typeof catalogTr === "object" && catalogTr?.label) || sub.service_key;
            return (
              <div key={sub.id} className="bg-surface border border-line rounded-2xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <span className="w-9 h-9 rounded-xl bg-coffee/10 flex items-center justify-center text-coffee shrink-0 overflow-hidden">
                    <ServiceLogo logoUrl={logoByKey[sub.service_key]} serviceKey={sub.service_key} size={16} />
                  </span>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_TONE[sub.status]}`}>
                    {statusLabel(sub.status)}
                  </span>
                </div>
                <h4 className="font-display text-lg text-ink mb-1">{label}</h4>
                {sub.message && <p className="text-sm text-ink-soft mb-2">{sub.message}</p>}
                {sub.admin_note && (
                  <p className="text-xs text-ink-faint pt-2 border-t border-line/70 mt-2">
                    {t("myServices.adminNotePrefix")} {sub.admin_note}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
