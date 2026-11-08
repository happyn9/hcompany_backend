import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Pause, Play, Plus, Trash2 } from "lucide-react";

const msgOf = (e) => (Array.isArray(e?.data?.detail) ? e.data.detail.map((d) => d.msg).join(" ") : e?.data?.detail) || e?.message || "Une erreur est survenue.";
const SRC = { agent: "Appris d'un agent", admin: "Ajouté par l'admin", db: "Base de données" };

/** Ce que l'assistante a appris : réponses d'agents (anonymisées), corrections de l'admin. Relire, corriger, mettre en pause, supprimer. */
export default function KnowledgePanel({ withAuth, api }) {
  const [rows, setRows] = useState(null), [err, setErr] = useState(""), [src, setSrc] = useState("");
  const [f, setF] = useState({ question: "", answer: "", lang: "fr" }), [busy, setBusy] = useState(false);
  const load = useCallback(() => withAuth((t) => api.assistant.admin.list(t, src)).then(setRows).catch((e) => setErr(msgOf(e))), [withAuth, api, src]);
  useEffect(() => { load(); }, [load]);
  const run = async (fn) => { setBusy(true); setErr(""); try { await withAuth(fn); await load(); } catch (e) { setErr(msgOf(e)); } finally { setBusy(false); } };
  const add = async (e) => { e.preventDefault(); await run((t) => api.assistant.admin.create(t, { ...f, active: true })); setF({ question: "", answer: "", lang: f.lang }); };
  return (
    <div className="space-y-6 max-w-4xl">
      <p className="text-sm text-ink-soft">L'assistante apprend des réponses de vos agents et de vos corrections, puis les retrouve par recherche (pas d'IA externe). Les e-mails, numéros et codes sont masqués avant stockage. Une réponse apprise jugée « pas utile » plusieurs fois est mise en pause automatiquement.</p>
      <form onSubmit={add} className="rounded-2xl border border-line bg-surface p-5 space-y-3">
        <p className="font-medium text-ink">Lui apprendre une réponse</p>
        <input required minLength={2} maxLength={500} value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} placeholder="Question type (ex. Comment changer mon mot de passe ?)" className="w-full rounded-xl border border-line bg-cream px-3 py-2.5 text-sm" />
        <textarea required minLength={2} maxLength={1500} rows={3} value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} placeholder="Réponse" className="w-full rounded-xl border border-line bg-cream px-3 py-2.5 text-sm" />
        <div className="flex items-center gap-3"><select value={f.lang} onChange={(e) => setF({ ...f, lang: e.target.value })} className="rounded-xl border border-line bg-cream px-3 py-2 text-sm"><option value="fr">Français</option><option value="en">English</option></select>
          <button disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream px-5 py-2 text-sm disabled:opacity-50"><Plus size={15} />Ajouter</button></div>
      </form>
      <div className="flex gap-2 flex-wrap">{[["", "Tout"], ["agent", "Appris des agents"], ["admin", "Ajoutés"]].map(([k, l]) => <button key={k} onClick={() => setSrc(k)} aria-pressed={src === k} className={`rounded-full px-4 py-1.5 text-sm ${src === k ? "bg-ink text-cream" : "border border-line text-ink-soft hover:bg-latte-soft"}`}>{l}</button>)}</div>
      {err && <p className="text-sm text-[#9B2C2C]" role="alert">{err}</p>}
      {!rows ? <Loader2 className="animate-spin text-ink-soft" /> : rows.length === 0 ? <p className="text-sm text-ink-soft">Rien d'appris pour l'instant : les réponses de vos agents apparaîtront ici.</p> : (
        <ul className="space-y-3">{rows.map((e) => (
          <li key={e.id} className={`rounded-2xl border border-line bg-surface p-4 ${e.active ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="font-medium text-ink">{e.question}</p><p className="text-sm text-ink-soft mt-1 whitespace-pre-line">{e.answer}</p>
                <p className="text-[11px] text-ink-faint mt-2">{SRC[e.source] || e.source} · {e.lang.toUpperCase()} · utilisée {e.uses}× · 👍 {e.helpful} · 👎 {e.unhelpful}{e.active ? "" : " · en pause"}</p></div>
              <div className="flex gap-1 shrink-0">
                <button disabled={busy} onClick={() => run((t) => api.assistant.admin.update(t, e.id, { question: e.question, answer: e.answer, lang: e.lang, active: !e.active }))} aria-label={e.active ? "Mettre en pause" : "Réactiver"} className="w-9 h-9 rounded-lg hover:bg-latte-soft flex items-center justify-center">{e.active ? <Pause size={15} /> : <Play size={15} />}</button>
                <button disabled={busy} onClick={() => window.confirm("Supprimer cette réponse ?") && run((t) => api.assistant.admin.remove(t, e.id))} aria-label="Supprimer" className="w-9 h-9 rounded-lg hover:bg-[#9B2C2C]/10 text-[#9B2C2C] flex items-center justify-center"><Trash2 size={15} /></button>
              </div>
            </div>
          </li>))}</ul>
      )}
    </div>
  );
}
