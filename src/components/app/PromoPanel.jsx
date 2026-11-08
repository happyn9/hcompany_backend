import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Lock, Pause, Play, Trash2, X } from "lucide-react";

const msgOf = (e) => (Array.isArray(e?.data?.detail) ? e.data.detail.map((d) => d.msg).join(" ") : e?.data?.detail) || e?.message || "Une erreur est survenue.";
const PLACEMENTS = [["any", "Partout"], ["app_home", "Accueil"], ["app_transport", "Bus"], ["app_colis", "Colis"], ["app_logement", "Logement"], ["app_money", "H-Money"]];
const THEMES = [["coffee", "Café"], ["gold", "Or"], ["ink", "Nuit"], ["cream", "Crème"]];
const MODULES = ["internal", "lodging", "transport", "shopping", "learning", "restaurant", "tourism", "money", "translate"];
const STATUS = { pending: ["En validation", "bg-amber-100 text-amber-800"], active: ["Diffusée", "bg-emerald-100 text-emerald-800"], paused: ["En pause", "bg-latte-soft text-ink-soft"], rejected: ["Refusée", "bg-red-100 text-red-700"], expired: ["Terminée", "bg-latte-soft text-ink-soft"] };
const field = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm";
const EMPTY = { title: "", body: "", link: "", cta_label: "Découvrir", image_url: "", theme: "coffee", placement: "app_home", module: "internal" };

function Form({ admin, onSubmit, busy }) {
  const [f, setF] = useState(EMPTY);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async (e) => { e.preventDefault(); if (await onSubmit({ ...f, image_url: f.image_url.trim() })) setF(EMPTY); };
  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-5 grid sm:grid-cols-2 gap-4">
      <label className="sm:col-span-2 text-sm">Titre<input required minLength={3} maxLength={80} className={`${field} mt-1`} value={f.title} onChange={set("title")} /></label>
      <label className="sm:col-span-2 text-sm">Texte court<input maxLength={200} className={`${field} mt-1`} value={f.body} onChange={set("body")} /></label>
      <label className="text-sm">Lien (/shopping… ou https://…)<input required className={`${field} mt-1`} value={f.link} onChange={set("link")} /></label>
      <label className="text-sm">Bouton<input maxLength={24} className={`${field} mt-1`} value={f.cta_label} onChange={set("cta_label")} /></label>
      <label className="text-sm">Image (https://, facultatif)<input className={`${field} mt-1`} value={f.image_url} onChange={set("image_url")} /></label>
      <label className="text-sm">Couleur de fond<select className={`${field} mt-1`} value={f.theme} onChange={set("theme")}>{THEMES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="text-sm">Où l'afficher<select className={`${field} mt-1`} value={f.placement} onChange={set("placement")}>{PLACEMENTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="text-sm">Service concerné<select className={`${field} mt-1`} value={f.module} onChange={set("module")}>{MODULES.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
      <div className="sm:col-span-2 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-faint">{admin ? "Publiée tout de suite (annonce H-Company)." : "Votre promotion est publiée après validation par H-Company."}</p>
        <button disabled={busy} className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-2.5 disabled:opacity-50">{busy ? "…" : admin ? "Publier" : "Envoyer pour validation"}</button>
      </div>
    </form>
  );
}

/** Gestion des promotions. admin=true : toutes les promos + validation ; sinon : celles du partenaire (fonction payante « promotion »). */
export default function PromoPanel({ admin = false, withAuth, api }) {
  const [rows, setRows] = useState(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [locked, setLocked] = useState(false);
  const load = useCallback(async () => {
    try { setRows(await withAuth((t) => (admin ? api.promos.admin.list(t) : api.promos.mine(t)))); setErr(""); }
    catch (e) { if (e?.status !== 428) setErr(msgOf(e)); setRows([]); }
  }, [admin, withAuth, api]);
  useEffect(() => { load(); }, [load]);
  const run = async (fn) => { setBusy(true); try { await withAuth(fn); setErr(""); setLocked(false); await load(); return true; } catch (e) { if (e?.status === 402) setLocked(true); else if (e?.status !== 428) setErr(msgOf(e)); return false; } finally { setBusy(false); } };
  const reject = (p) => { const reason = window.prompt("Motif du refus ?"); if (reason?.trim()) run((t) => api.promos.admin.decide(t, p.id, "rejected", reason)); };

  return (
    <div className="space-y-6">
      {locked && <p role="alert" className="rounded-2xl bg-latte-soft p-4 text-sm text-coffee-dark flex items-center gap-2"><Lock size={16} />La fonction « Promotion » est payante : débloquez-la depuis « Mon espace » (ou passez en Pro).</p>}
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      <Form admin={admin} busy={busy} onSubmit={(b) => run((t) => (admin ? api.promos.admin.create(t, b) : api.promos.create(t, b)))} />
      {rows === null ? <Loader2 className="animate-spin text-ink-faint" /> : !rows.length ? <p className="text-sm text-ink-soft">Aucune promotion pour l'instant.</p> : (
        <ul className="grid gap-3">
          {rows.map((p) => {
            const [label, tone] = STATUS[p.status] || [p.status, ""];
            const ctr = p.impressions ? ((p.clicks / p.impressions) * 100).toFixed(1) : "0";
            return (
              <li key={p.id} className="rounded-2xl border border-line bg-surface p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.title} <span className={`ml-2 text-[0.68rem] font-semibold rounded-full px-2 py-0.5 ${tone}`}>{label}</span></p>
                  <p className="text-xs text-ink-faint mt-1">{admin && p.owner ? `${p.owner} · ` : ""}{p.placement} · {p.impressions} vues · {p.clicks} clics ({ctr} %){p.reject_reason ? ` · Motif : ${p.reject_reason}` : ""}</p>
                </div>
                <div className="flex gap-2">
                  {admin && p.status === "pending" && <><button disabled={busy} onClick={() => run((t) => api.promos.admin.decide(t, p.id, "active"))} className="rounded-full bg-emerald-600 text-white text-xs px-3.5 py-2 inline-flex items-center gap-1"><Check size={13} />Valider</button><button disabled={busy} onClick={() => reject(p)} className="rounded-full border border-line text-xs px-3.5 py-2 inline-flex items-center gap-1"><X size={13} />Refuser</button></>}
                  {(p.status === "active" || p.status === "paused") && <button disabled={busy} onClick={() => run((t) => (admin ? api.promos.admin.decide(t, p.id, p.status === "active" ? "paused" : "active") : api.promos.pause(t, p.id, p.status === "active")))} className="rounded-full border border-line text-xs px-3.5 py-2 inline-flex items-center gap-1">{p.status === "active" ? <><Pause size={13} />Pause</> : <><Play size={13} />Reprendre</>}</button>}
                  <button disabled={busy} aria-label="Supprimer" onClick={() => window.confirm("Supprimer cette promotion ?") && run((t) => (admin ? api.promos.admin.remove(t, p.id) : api.promos.remove(t, p.id)))} className="rounded-full border border-line w-9 h-9 flex items-center justify-center text-ink-faint hover:text-red-600"><Trash2 size={14} /></button>
                </div>
              </li>);
          })}
        </ul>
      )}
    </div>
  );
}
