import { useEffect, useState } from "react";
import { Plus, Loader2, Clock, Repeat, X } from "lucide-react";

const PAYMENT_OPTIONS = [
  { value: "monthly", label: "Mensuel", short: "/ mois" },
  { value: "quarterly", label: "Trimestriel", short: "/ trimestre" },
  { value: "annual", label: "Annuel", short: "/ an" },
  { value: "one_time", label: "Unique", short: "une fois" },
];

const STATUS = {
  proposed: { label: "Envoyée", cls: "bg-latte-soft text-coffee-dark border-latte-light" },
  accepted: { label: "Acceptée", cls: "bg-latte-soft text-coffee-dark border-coffee-light" },
  declined: { label: "Déclinée", cls: "bg-line/60 text-ink-faint border-line" },
};

const MAX_OFFERS = 3;
const EMPTY_FORM = { title: "", price: "", duration_months: "12", payment_mode: "monthly", description: "" };

const inputCls =
  "w-full text-sm rounded-xl border border-line bg-surface px-3.5 py-2.5 outline-none placeholder:text-ink-faint focus:border-coffee-light transition-colors";

function Field({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-ink-soft mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export default function OffersPanel({ offers, onCreate }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(offers.length === 0);

  // Les offres arrivent après l'ouverture du panneau : on referme le formulaire si elles existent.
  useEffect(() => {
    setShowForm(offers.length === 0);
  }, [offers.length]);

  const canAddMore = offers.length < MAX_OFFERS;

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.price) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate({
        title: form.title.trim(),
        price: parseFloat(form.price),
        duration_months: parseInt(form.duration_months, 10),
        payment_mode: form.payment_mode,
        description: form.description.trim() || null,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err) {
      setError(err?.data?.detail || "Impossible d'envoyer cette offre.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Jauge 0/3 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {Array.from({ length: MAX_OFFERS }).map((_, i) => (
              <span key={i} className={`h-1.5 w-6 rounded-full ${i < offers.length ? "bg-coffee" : "bg-line"}`} />
            ))}
          </div>
          <span className="text-xs text-ink-faint">
            {offers.length}/{MAX_OFFERS} offres
          </span>
        </div>
        {canAddMore && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 text-xs font-medium text-coffee-dark bg-cream hover:bg-latte-soft rounded-full px-3 py-1.5 transition-colors"
          >
            <Plus size={13} /> Nouvelle offre
          </button>
        )}
      </div>

      {/* Liste des offres */}
      {offers.length > 0 && (
        <div className="space-y-2.5 mb-4">
          {offers.map((o) => {
            const mode = PAYMENT_OPTIONS.find((p) => p.value === o.payment_mode);
            const st = STATUS[o.status] || STATUS.proposed;
            return (
              <div
                key={o.id}
                className={`rounded-2xl border p-4 transition-colors ${
                  o.status === "accepted" ? "border-coffee-light bg-latte-soft/50" : "border-line bg-cream/30"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{o.title}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-ink-soft">
                      <span className="flex items-center gap-1"><Clock size={11} /> {o.duration_months} mois</span>
                      <span className="flex items-center gap-1"><Repeat size={11} /> {mode?.label}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-display text-2xl text-ink leading-none">
                      {o.price.toFixed(0)}<span className="text-base text-ink-soft"> $</span>
                    </p>
                    <p className="text-[11px] text-ink-faint mt-1">{mode?.short}</p>
                  </div>
                </div>
                {o.description && <p className="text-xs text-ink-soft mt-2.5 leading-relaxed">{o.description}</p>}
                <div className="mt-3">
                  <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Formulaire */}
      {showForm && canAddMore && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-coffee-light/60 bg-cream/40 p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Nouvelle offre</p>
            {offers.length > 0 && (
              <button type="button" onClick={() => setShowForm(false)} aria-label="Fermer" className="text-ink-faint hover:text-ink">
                <X size={16} />
              </button>
            )}
          </div>

          <Field label="Nom de l'offre">
            <input type="text" placeholder="ex : Pro" value={form.title} onChange={(e) => update("title", e.target.value)} className={inputCls} required />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Prix ($)">
              <input type="number" placeholder="0" value={form.price} onChange={(e) => update("price", e.target.value)} className={inputCls} required min="0" />
            </Field>
            <Field label="Durée (mois)">
              <input type="number" value={form.duration_months} onChange={(e) => update("duration_months", e.target.value)} className={inputCls} required min="1" />
            </Field>
          </div>

          <div>
            <span className="block text-xs font-medium text-ink-soft mb-1.5">Paiement</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {PAYMENT_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => update("payment_mode", p.value)}
                  className={`text-xs font-medium rounded-lg px-2 py-2 border transition-colors ${
                    form.payment_mode === p.value
                      ? "bg-ink text-cream border-ink"
                      : "bg-surface text-ink-soft border-line hover:border-coffee-light"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <Field label="Description (optionnel)">
            <textarea
              placeholder="Ce qui est inclus dans cette offre…"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
            />
          </Field>

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 rounded-full bg-ink text-cream text-sm font-medium px-5 py-2.5 disabled:opacity-60 hover:bg-coffee-dark transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Envoyer l'offre
            </button>
            {offers.length > 0 && (
              <button type="button" onClick={() => setShowForm(false)} className="text-sm font-medium text-ink-soft px-4 py-2.5 hover:text-ink">
                Annuler
              </button>
            )}
          </div>
        </form>
      )}

      {!canAddMore && (
        <p className="text-xs text-ink-faint text-center">Limite de {MAX_OFFERS} offres atteinte pour ce partenaire.</p>
      )}
    </div>
  );
}