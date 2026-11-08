import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Pencil, Check, Loader2, Upload, EyeOff, Eye, AlertCircle } from "lucide-react";
import ServiceLogo from "../services/ServiceLogo.jsx";

const EMPTY_FORM = {
  key: "",
  label_fr: "",
  label_en: "",
  description_fr: "",
  description_en: "",
  disabled: false,
  sort_order: 0,
};

const inputCls =
  "w-full text-sm rounded-lg border border-line bg-surface px-3 py-2 outline-none placeholder:text-ink-faint focus:border-coffee-light";

function ItemForm({ initial, onCancel, onSave, saving }) {
  const [form, setForm] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
      className="border-t border-line bg-cream/40 p-4 space-y-3"
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-[11px] font-medium text-ink-soft mb-1">Clé technique</span>
          <input
            value={form.key}
            onChange={(e) => setForm((f) => ({ ...f, key: e.target.value.trim() }))}
            className={inputCls}
            placeholder="ex : h_delivery"
            disabled={!!initial.id}
            required
          />
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium text-ink-soft mb-1">Ordre d'affichage</span>
          <input
            type="number"
            value={form.sort_order}
            onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value, 10) || 0 }))}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium text-ink-soft mb-1">Libellé (FR)</span>
          <input
            value={form.label_fr}
            onChange={(e) => setForm((f) => ({ ...f, label_fr: e.target.value }))}
            className={inputCls}
            required
          />
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium text-ink-soft mb-1">Libellé (EN)</span>
          <input
            value={form.label_en}
            onChange={(e) => setForm((f) => ({ ...f, label_en: e.target.value }))}
            className={inputCls}
            required
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-[11px] font-medium text-ink-soft mb-1">Description (FR)</span>
          <textarea
            rows={2}
            value={form.description_fr}
            onChange={(e) => setForm((f) => ({ ...f, description_fr: e.target.value }))}
            className={`${inputCls} resize-none`}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-[11px] font-medium text-ink-soft mb-1">Description (EN)</span>
          <textarea
            rows={2}
            value={form.description_en}
            onChange={(e) => setForm((f) => ({ ...f, description_en: e.target.value }))}
            className={`${inputCls} resize-none`}
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={form.disabled}
          onChange={(e) => setForm((f) => ({ ...f, disabled: e.target.checked }))}
          className="rounded border-line"
        />
        Désactivé ("Bientôt" côté site — pas encore souscriptible)
      </label>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 text-xs font-medium bg-ink text-cream rounded-full px-4 py-2 disabled:opacity-50 hover:bg-coffee-dark transition-colors"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          Enregistrer
        </button>
        <button type="button" onClick={onCancel} className="text-xs font-medium text-ink-soft px-3 py-2 hover:text-ink">
          Annuler
        </button>
      </div>
    </form>
  );
}

/** Panneau admin de gestion du catalogue des services H-Company — libellés
 * FR/EN, description, logo (upload), activation et ordre d'affichage.
 * Remplace l'ancien catalogue codé en dur : chaque changement ici se
 * répercute immédiatement sur "Explorez nos services" et le formulaire
 * d'abonnement côté site. */
export default function ServiceCatalogPanel({ withAuth, api }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null); // id en cours d'édition, ou "new"
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const fileInputs = useRef({});

  async function load() {
    setLoading(true);
    try {
      const data = await withAuth((token) => api.admin.listServiceCatalog(token));
      setItems(data || []);
      setError(null);
    } catch {
      setError("Impossible de charger le catalogue des services.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(form) {
    setSaving(true);
    try {
      await withAuth((token) => api.admin.createServiceCatalogItem(token, form));
      setEditingId(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id, form) {
    setSaving(true);
    try {
      const { key, ...patch } = form; // la clé technique n'est pas modifiable après création
      await withAuth((token) => api.admin.updateServiceCatalogItem(token, id, patch));
      setEditingId(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleDisabled(item) {
    await withAuth((token) => api.admin.updateServiceCatalogItem(token, item.id, { disabled: !item.disabled }));
    await load();
  }

  async function handleDelete(item) {
    if (!window.confirm(`Supprimer "${item.label_fr}" du catalogue ? Cette action est irréversible.`)) return;
    await withAuth((token) => api.admin.deleteServiceCatalogItem(token, item.id));
    await load();
  }

  async function handleLogoChange(item, file) {
    if (!file) return;
    setUploadingId(item.id);
    try {
      await withAuth((token) => api.admin.uploadServiceCatalogLogo(token, item.id, file));
      await load();
    } finally {
      setUploadingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-2.5">
        {[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl bg-surface border border-line animate-pulse" />)}
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl md:text-2xl text-ink">Catalogue des services</h2>
          <p className="text-sm text-ink-soft mt-0.5">
            {items.length} service{items.length !== 1 ? "s" : ""} — libellés, description, logo et disponibilité.
          </p>
        </div>
        {editingId !== "new" && (
          <button
            onClick={() => setEditingId("new")}
            className="flex items-center gap-1.5 text-sm font-medium rounded-full bg-ink text-cream px-4 py-2.5 hover:bg-coffee-dark transition-colors shrink-0"
          >
            <Plus size={15} />
            Ajouter un service
          </button>
        )}
      </div>

      {editingId === "new" && (
        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          <ItemForm
            initial={EMPTY_FORM}
            saving={saving}
            onCancel={() => setEditingId(null)}
            onSave={handleCreate}
          />
        </div>
      )}

      <div className="space-y-2.5">
        {items.map((item) => (
          <div key={item.id} className="bg-surface border border-line rounded-2xl overflow-hidden">
            <div className="p-4 flex items-center gap-3.5">
              <div className="relative shrink-0">
                <span className="w-12 h-12 rounded-xl bg-cream flex items-center justify-center text-coffee-dark overflow-hidden">
                  {uploadingId === item.id ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <ServiceLogo logoUrl={item.logo_url} serviceKey={item.key} size={20} />
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => fileInputs.current[item.id]?.click()}
                  title="Changer le logo"
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-ink text-cream flex items-center justify-center hover:bg-coffee-dark transition-colors"
                >
                  <Upload size={11} />
                </button>
                <input
                  ref={(el) => (fileInputs.current[item.id] = el)}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={(e) => handleLogoChange(item, e.target.files?.[0])}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-ink">{item.label_fr}</p>
                  <span className="text-xs text-ink-faint">/ {item.label_en}</span>
                  {item.disabled && (
                    <span className="text-[10px] font-medium uppercase tracking-wide bg-line text-ink-faint px-2 py-0.5 rounded-full">
                      Bientôt
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-faint mt-0.5 font-mono">{item.key} · ordre {item.sort_order}</p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleToggleDisabled(item)}
                  title={item.disabled ? "Réactiver" : "Désactiver"}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:bg-line/50 hover:text-ink transition-colors"
                >
                  {item.disabled ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <button
                  onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                  title="Modifier"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:bg-line/50 hover:text-ink transition-colors"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => handleDelete(item)}
                  title="Supprimer"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {editingId === item.id && (
              <ItemForm
                initial={{
                  key: item.key,
                  label_fr: item.label_fr,
                  label_en: item.label_en,
                  description_fr: item.description_fr,
                  description_en: item.description_en,
                  disabled: item.disabled,
                  sort_order: item.sort_order,
                }}
                saving={saving}
                onCancel={() => setEditingId(null)}
                onSave={(form) => handleUpdate(item.id, form)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
