import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Package, X, Bus, BedDouble, UtensilsCrossed, GraduationCap, Banknote, Check } from "lucide-react";

const STATUS_TONE = {
  requested: "bg-amber-50 text-amber-700 border-amber-200",
  active: "bg-[#F1EAE0] text-coffee-dark border-coffee-light",
  suspended: "bg-red-50 text-red-700 border-red-200",
  rejected: "bg-line text-ink-faint border-line",
};

const STATUS_LABEL = {
  requested: "En attente",
  active: "Active",
  suspended: "Suspendue",
  rejected: "Refusée",
};

// Catalogue fermé plutôt qu'un champ libre — correspond aux modules que
// H-Company sait effectivement intégrer à la marketplace.
const APPS_CATALOG = [
  { key: "transport", name: "Transport (bus)", Icon: Bus, description: "Lignes, horaires et billetterie de bus." },
  { key: "colis", name: "Colis", Icon: Package, description: "Dépôt, suivi et livraison de colis." },
  { key: "lodge", name: "Lodge", Icon: BedDouble, description: "Réservation d'hébergement." },
  { key: "restau", name: "Restau", Icon: UtensilsCrossed, description: "Menu et commandes de restaurant." },
  {
    key: "elearning",
    name: "E-learning",
    Icon: GraduationCap,
    description: "Proposer une formation sur H-learning.",
    needsCourse: true,
  },
  {
    key: "transfert",
    name: "Agence de transfert d'argent",
    Icon: Banknote,
    description: "Envoi et réception d'argent.",
    disabled: true,
  },
];

function CatalogCard({ item, selected, onSelect }) {
  return (
    <button
      type="button"
      disabled={item.disabled}
      onClick={() => onSelect(item.key)}
      className={`relative flex flex-col items-start gap-2.5 rounded-2xl border p-4 text-left transition-colors ${
        item.disabled
          ? "opacity-50 cursor-not-allowed border-line"
          : selected === item.key
          ? "border-ink bg-cream"
          : "border-line hover:border-coffee-light"
      }`}
    >
      <div className="flex items-center justify-between w-full">
        <span className="w-9 h-9 rounded-xl bg-coffee/10 flex items-center justify-center text-coffee">
          <item.Icon size={17} />
        </span>
        {selected === item.key && !item.disabled && (
          <span className="w-5 h-5 rounded-full bg-ink text-cream flex items-center justify-center">
            <Check size={12} />
          </span>
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-ink">{item.name}</p>
        <p className="text-xs text-ink-soft mt-0.5">{item.description}</p>
      </div>
      {item.disabled && (
        <span className="absolute top-3 right-3 text-[0.6rem] font-medium uppercase tracking-wide bg-line text-ink-faint px-2 py-0.5 rounded-full">
          Bientôt
        </span>
      )}
    </button>
  );
}

export default function AppsTab({ apps, billing, onRequestApp }) {
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [courseName, setCourseName] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const selectedItem = APPS_CATALOG.find((a) => a.key === selected);

  function resetForm() {
    setSelected(null);
    setCourseName("");
    setError(null);
    setFormOpen(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedItem) return;
    if (selectedItem.needsCourse && !courseName.trim()) {
      setError("Précisez le cours que vous souhaitez enseigner.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const description = selectedItem.needsCourse
        ? `Devenir formateur du cours : ${courseName.trim()}`
        : selectedItem.description;
      await onRequestApp(selectedItem.name, description);
      resetForm();
    } catch (err) {
      setError(err?.data?.detail || "Impossible d'envoyer cette demande.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* --- Facturation --- */}
      {billing && (
        <div className="bg-surface border border-line rounded-2xl p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs text-ink-faint uppercase tracking-wide mb-1">
                {billing.subscribed ? "Abonnement actif" : "Facturation à la commission"}
              </p>
              {billing.subscribed ? (
                <p className="font-display text-2xl text-ink">{billing.plan_name || "Abonné"}</p>
              ) : (
                <div>
                  <p className="font-display text-2xl text-ink">
                    {billing.total_owed.toFixed(0)} $ <span className="text-sm font-sans text-ink-soft">dus</span>
                  </p>
                  <a href="#offers-tab" className="text-xs text-coffee-dark font-medium hover:underline">
                    Voir les offres pour vous abonner →
                  </a>
                </div>
              )}
            </div>
            <div className="flex gap-6 text-center">
              <div>
                <p className="font-display text-xl text-ink">{billing.total_revenue.toFixed(0)} $</p>
                <p className="text-xs text-ink-soft">revenu total</p>
              </div>
              <div>
                <p className="font-display text-xl text-ink">{billing.active_apps_count}</p>
                <p className="text-xs text-ink-soft">apps actives</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- Liste des apps --- */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-ink">Mes apps</h3>
        <button
          onClick={() => setFormOpen(true)}
          className="flex items-center gap-1.5 text-sm font-medium rounded-full bg-ink text-cream px-4 py-2 hover:bg-coffee-dark transition-colors"
        >
          <Plus size={15} />
          Demander une app
        </button>
      </div>

      {apps.length === 0 ? (
        <div className="bg-surface border border-line rounded-2xl p-6 text-center">
          <p className="text-sm text-ink-soft">
            Aucune app pour l'instant : demandez-en une pour démarrer un nouveau service.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {apps.map((app) => (
            <motion.div
              key={app.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-surface border border-line rounded-2xl p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-coffee/10 flex items-center justify-center text-coffee shrink-0">
                  <Package size={16} />
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_TONE[app.status]}`}>
                  {STATUS_LABEL[app.status]}
                </span>
              </div>
              <h4 className="font-display text-lg text-ink mb-1">{app.name}</h4>
              {app.description && <p className="text-sm text-ink-soft mb-4">{app.description}</p>}
              <div className="flex items-center gap-4 pt-3 border-t border-line/70 text-sm">
                <div>
                  <span className="text-ink-faint text-xs block">Revenu</span>
                  <span className="text-ink font-medium">{app.total_revenue.toFixed(0)} $</span>
                </div>
                <div>
                  <span className="text-ink-faint text-xs block">Dû</span>
                  <span className="text-ink font-medium">{app.total_owed.toFixed(0)} $</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* --- Formulaire de demande : catalogue fermé --- */}
      <AnimatePresence>
        {formOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-ink/50 backdrop-blur-sm z-[180]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={resetForm}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[190] bg-surface rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-medium text-ink">Quelle app souhaitez-vous ajouter ?</h3>
                <button onClick={resetForm} className="text-ink-faint hover:text-ink">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  {APPS_CATALOG.map((item) => (
                    <CatalogCard key={item.key} item={item} selected={selected} onSelect={setSelected} />
                  ))}
                </div>

                <AnimatePresence>
                  {selectedItem?.needsCourse && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <label className="block text-sm text-ink-soft mb-1.5">
                        Quel cours souhaitez-vous enseigner ?
                      </label>
                      <input
                        autoFocus
                        placeholder="ex: Développement mobile avec Flutter"
                        value={courseName}
                        onChange={(e) => setCourseName(e.target.value)}
                        className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-coffee-light"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <button
                  type="submit"
                  disabled={sending || !selected}
                  className="w-full rounded-full bg-ink text-cream text-sm font-medium px-5 py-2.5 hover:bg-coffee-dark transition-colors disabled:opacity-50"
                >
                  {sending ? "Envoi…" : "Envoyer la demande"}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
