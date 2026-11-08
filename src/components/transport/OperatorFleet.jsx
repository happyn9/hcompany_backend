import { useState } from "react";
import { Bus, Pencil, Plus, Trash2 } from "lucide-react";
import { BusyButton, Card, EmptyState, ErrorState, Field, Modal, SeatMap, Spinner, inputCls, useTransportMeta, useTransportUi } from "./Shared.jsx";
import { errMessage, useLoad } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { BUS_LAYOUTS, BUS_TYPES } from "../../lib/transport.js";

const T = {
  fr: { title: "Ma flotte", lead: "Enregistrez vos bus : les voyageurs choisissent leur siège sur le plan réel, et peuvent visiter l'intérieur en 3D.", add: "Ajouter un bus", edit: "Modifier le bus", empty: "Aucun bus enregistré", emptyHint: "Ajoutez votre premier bus pour créer des départs avec le bon plan de sièges.", name: "Nom du bus", plate: "Plaque", type: "Type", layout: "Disposition", layoutHint: "Sièges par rangée, de chaque côté du couloir.", seats: "Nombre de sièges", color: "Couleur intérieure", amenities: "Équipements", save: "Enregistrer", saved: "Bus enregistré", deleted: "Bus supprimé", upcoming: (n) => `${n} départ${n > 1 ? "s" : ""} à venir`, seatsUnit: "sièges", frozen: "La disposition et le nombre de sièges sont verrouillés tant que des départs sont programmés.", confirm: "Supprimer ce bus ?", preview: "Aperçu du plan", inactive: "Désactivé", dup: "Cette plaque existe déjà." },
  en: { title: "My fleet", lead: "Register your buses: travellers pick a seat on the real plan and can walk through the interior in 3D.", add: "Add a bus", edit: "Edit bus", empty: "No bus registered", emptyHint: "Add your first bus to create trips with the right seat plan.", name: "Bus name", plate: "Plate", type: "Type", layout: "Layout", layoutHint: "Seats per row on each side of the aisle.", seats: "Seats", color: "Interior colour", amenities: "Amenities", save: "Save", saved: "Bus saved", deleted: "Bus removed", upcoming: (n) => `${n} upcoming trip${n > 1 ? "s" : ""}`, seatsUnit: "seats", frozen: "Layout and seat count are locked while trips are scheduled.", confirm: "Remove this bus?", preview: "Plan preview", inactive: "Inactive", dup: "This plate already exists." },
};
const COLORS = ["#c89a3d", "#b84a3a", "#2f6f9f", "#3f8f5a", "#6b4fa0", "#444444"];

function BusForm({ bus, onClose, onSaved }) {
  const ui = useTransportUi();
  const { lang } = useLanguage();
  const t = T[lang] || T.fr;
  const { amenities } = useTransportMeta();
  const { withAuth } = useUser();
  const toast = useToast();
  const [f, setF] = useState(() => bus ? { ...bus } : { name: "", plate: "", bus_type: "standard", layout: "2+2", seats_total: 50, amenities: [], color: COLORS[0] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const frozen = !!bus?.upcoming_trips;
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const toggle = (k) => setF((s) => ({ ...s, amenities: s.amenities.includes(k) ? s.amenities.filter((x) => x !== k) : [...s.amenities, k] }));
  async function submit(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    const body = { name: f.name.trim(), plate: f.plate.trim(), bus_type: f.bus_type, layout: f.layout, seats_total: Number(f.seats_total), amenities: f.amenities, color: f.color };
    try {
      await withAuth((tk) => (bus ? api.transport.operator.updateBus(tk, bus.id, body) : api.transport.operator.createBus(tk, body)));
      toast.success(t.saved); onSaved();
    } catch (x) { setErr(x?.status === 409 ? t.dup : errMessage(x, ui.common.err)); } finally { setBusy(false); }
  }
  return (
    <Modal title={bus ? t.edit : t.add} onClose={onClose} closeLabel={ui.common.close}>
      <form onSubmit={submit} className="space-y-4">
        {frozen && <p className="text-xs rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-200 p-3">{t.frozen}</p>}
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={t.name}><input required maxLength={60} className={inputCls} value={f.name} onChange={set("name")} /></Field>
          <Field label={t.plate}><input required maxLength={20} className={`${inputCls} uppercase`} value={f.plate} onChange={set("plate")} /></Field>
          <Field label={t.type}><select className={inputCls} value={f.bus_type} onChange={set("bus_type")}>{BUS_TYPES.map((b) => <option key={b} value={b}>{ui.bus[b]}</option>)}</select></Field>
          <Field label={t.layout} hint={t.layoutHint}><select disabled={frozen} className={inputCls} value={f.layout} onChange={set("layout")}>{Object.keys(BUS_LAYOUTS).map((l) => <option key={l} value={l}>{l}</option>)}</select></Field>
          <Field label={t.seats}><input required disabled={frozen} type="number" min="4" max="80" className={inputCls} value={f.seats_total} onChange={set("seats_total")} /></Field>
          <Field label={t.color}>
            <div className="flex gap-2 pt-1.5">{COLORS.map((c) => <button type="button" key={c} aria-label={c} aria-pressed={f.color === c} onClick={() => setF((s) => ({ ...s, color: c }))} className={`w-8 h-8 rounded-full border-2 ${f.color === c ? "border-ink" : "border-transparent"}`} style={{ background: c }} />)}</div>
          </Field>
        </div>
        <fieldset><legend className="text-sm font-medium text-ink mb-2">{t.amenities}</legend>
          <div className="flex flex-wrap gap-2">{amenities.map((a) => (
            <button type="button" key={a.key} aria-pressed={f.amenities.includes(a.key)} onClick={() => toggle(a.key)} className={`rounded-full border px-3 py-1.5 text-xs ${f.amenities.includes(a.key) ? "border-coffee bg-latte-soft text-ink" : "border-line text-ink-soft"}`}>{lang === "en" ? a.en : a.fr}</button>
          ))}</div>
        </fieldset>
        <div><p className="text-sm font-medium text-ink mb-2">{t.preview}</p><SeatMap total={Math.max(4, Math.min(80, Number(f.seats_total) || 4))} layout={f.layout} readOnly /></div>
        {err && <p role="alert" className="rounded-xl bg-red-500/10 text-red-700 dark:text-red-300 text-sm p-3">{err}</p>}
        <div className="flex justify-end"><BusyButton busy={busy} className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3">{t.save}</BusyButton></div>
      </form>
    </Modal>
  );
}

export default function OperatorFleet() {
  const ui = useTransportUi();
  const { lang } = useLanguage();
  const t = T[lang] || T.fr;
  const { withAuth } = useUser();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => withAuth((tk) => api.transport.operator.buses(tk)), []);
  const [editing, setEditing] = useState(null);
  async function remove(b) {
    if (!window.confirm(t.confirm)) return;
    try { await withAuth((tk) => api.transport.operator.deleteBus(tk, b.id)); toast.success(t.deleted); reload(); } catch (x) { toast.error(errMessage(x, ui.common.err)); }
  }
  if (loading) return <Spinner label={ui.common.loading} />;
  if (error) return <ErrorState onRetry={reload} />;
  const buses = data || [];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="font-display text-2xl text-ink">{t.title}</h2><p className="text-sm text-ink-soft max-w-xl">{t.lead}</p></div>
        <button onClick={() => setEditing({})} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm px-5 py-2.5"><Plus size={16} />{t.add}</button>
      </div>
      {!buses.length ? <EmptyState icon={Bus} title={t.empty} hint={t.emptyHint} /> : (
        <div className="grid md:grid-cols-2 gap-4">
          {buses.map((b) => (
            <Card key={b.id} className={b.is_active ? "" : "opacity-60"}>
              <div className="flex items-start gap-3">
                <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0" style={{ background: b.color }}><Bus size={20} /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink truncate">{b.name} <span className="text-ink-faint font-normal">· {b.plate}</span></p>
                  <p className="text-xs text-ink-soft">{ui.bus[b.bus_type]} · {b.layout} · {b.seats_total} {t.seatsUnit}{!b.is_active && ` · ${t.inactive}`}</p>
                  <p className="text-xs text-ink-faint mt-1">{t.upcoming(b.upcoming_trips)}</p>
                </div>
                <div className="flex gap-1">
                  <button aria-label={t.edit} onClick={() => setEditing(b)} className="w-9 h-9 rounded-full border border-line flex items-center justify-center text-ink-soft"><Pencil size={15} /></button>
                  <button aria-label={ui.common.delete || "Delete"} onClick={() => remove(b)} className="w-9 h-9 rounded-full border border-line flex items-center justify-center text-red-600"><Trash2 size={15} /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && <BusForm bus={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}
