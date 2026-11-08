import { useCallback, useEffect, useState } from "react";
import { BarChart3, Loader2, Mail, Plus, Trash2, UserCog, X } from "lucide-react";
import ModuleStats from "../agents/ModuleStats.jsx";
import { DEPARTMENTS, deptLabel } from "../../lib/agents.js";
import { useLanguage } from "../../context/LanguageContext.jsx";

const T = {
  fr: { title: "Agents H-Company", lead: "Créez des agents, affectez-leur des départements (modules) et suivez leurs revenus et statistiques.", add: "Nouvel agent", email: "E-mail", name: "Nom complet", job: "Intitulé du poste", deps: "Départements", create: "Créer l'agent", invited: "Invitation envoyée : le rôle sera appliqué à sa première connexion.", created: "Compte promu agent.", online: "En ligne", offline: "Hors ligne", pending: "Invité", threads: (n) => `${n} conversation${n > 1 ? "s" : ""}`, stats: "Statistiques", edit: "Modifier", save: "Enregistrer", remove: "Retirer", confirm: "Retirer cet agent ? Il redevient client.", empty: "Aucun agent pour l'instant.", inactive: "Désactivé", toggle: "Activer / désactiver", err: "Une erreur est survenue.", pickOne: "Choisissez au moins un département." },
  en: { title: "H-Company agents", lead: "Create agents, assign them departments (modules) and follow their revenue and statistics.", add: "New agent", email: "E-mail", name: "Full name", job: "Job title", deps: "Departments", create: "Create agent", invited: "Invitation sent: the role is applied at first sign-in.", created: "Account promoted to agent.", online: "Online", offline: "Offline", pending: "Invited", threads: (n) => `${n} conversation${n > 1 ? "s" : ""}`, stats: "Statistics", edit: "Edit", save: "Save", remove: "Remove", confirm: "Remove this agent? They become a customer again.", empty: "No agents yet.", inactive: "Inactive", toggle: "Enable / disable", err: "Something went wrong.", pickOne: "Pick at least one department." },
};

function DeptPicker({ value, onChange, lang }) {
  const toggle = (d) => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d]);
  return <div className="flex flex-wrap gap-2">{DEPARTMENTS.map((d) => <button type="button" key={d} aria-pressed={value.includes(d)} onClick={() => toggle(d)} className={`rounded-full border px-3 py-1.5 text-xs ${value.includes(d) ? "border-coffee bg-latte-soft text-ink" : "border-line text-ink-soft"}`}>{deptLabel(lang, d)}</button>)}</div>;
}

export default function AgentsPanel({ withAuth, api }) {
  const { lang } = useLanguage();
  const t = T[lang] || T.fr;
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [form, setForm] = useState(null);
  const [edit, setEdit] = useState(null);
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const fail = (e) => setErr(e?.data?.detail && typeof e.data.detail === "string" ? e.data.detail : t.err);

  const load = useCallback(async () => {
    try { setList((await withAuth((tk) => api.agents.admin.list(tk))) || []); } catch (e) { fail(e); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withAuth, api]);
  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, [load]);

  async function create(e) {
    e.preventDefault(); setErr(""); setMsg("");
    if (!form.departments.length) return setErr(t.pickOne);
    setBusy(true);
    try {
      const r = await withAuth((tk) => api.agents.admin.create(tk, { email: form.email.trim(), full_name: form.full_name.trim(), title: form.title.trim(), departments: form.departments }));
      setMsg(r.status === "invited" ? t.invited : t.created); setForm(null); load();
    } catch (x) { fail(x); } finally { setBusy(false); }
  }
  async function saveEdit() {
    setBusy(true); setErr("");
    try { await withAuth((tk) => api.agents.admin.update(tk, edit.user_id, { title: edit.title, departments: edit.departments })); setEdit(null); load(); } catch (x) { fail(x); } finally { setBusy(false); }
  }
  async function toggleActive(a) { try { await withAuth((tk) => api.agents.admin.update(tk, a.user_id, { is_active: !a.is_active })); load(); } catch (x) { fail(x); } }
  async function remove(a) {
    if (!window.confirm(t.confirm)) return;
    try { await withAuth((tk) => (a.pending ? api.agents.admin.cancelInvite(tk, a.email) : api.agents.admin.remove(tk, a.user_id))); load(); } catch (x) { fail(x); }
  }
  async function showStats(a) {
    setStats({ agent: a, data: null });
    try { setStats({ agent: a, data: await withAuth((tk) => api.agents.admin.stats(tk, a.user_id)) }); } catch (x) { fail(x); setStats(null); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="font-display text-2xl text-ink">{t.title}</h2><p className="text-sm text-ink-soft max-w-xl">{t.lead}</p></div>
        <button onClick={() => setForm({ email: "", full_name: "", title: "", departments: [] })} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm px-5 py-2.5"><Plus size={16} />{t.add}</button>
      </div>
      {msg && <p role="status" className="rounded-xl bg-green-500/10 text-green-800 dark:text-green-300 text-sm p-3">{msg}</p>}
      {err && <p role="alert" className="rounded-xl bg-red-500/10 text-red-700 dark:text-red-300 text-sm p-3">{err}</p>}

      {form && (
        <form onSubmit={create} className="rounded-3xl border border-line bg-surface p-5 space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <input required type="email" placeholder={t.email} aria-label={t.email} className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input placeholder={t.name} aria-label={t.name} className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            <input placeholder={t.job} aria-label={t.job} className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <p className="text-sm font-medium text-ink">{t.deps}</p>
          <DeptPicker lang={lang} value={form.departments} onChange={(d) => setForm({ ...form, departments: d })} />
          <div className="flex gap-2 justify-end"><button type="button" onClick={() => setForm(null)} className="rounded-full border border-line text-sm px-5 py-2.5">×</button><button disabled={busy} className="rounded-full bg-ink text-cream text-sm px-6 py-2.5 disabled:opacity-60">{t.create}</button></div>
        </form>
      )}

      {loading ? <Loader2 className="animate-spin text-coffee mx-auto" /> : !list.length ? <p className="text-sm text-ink-soft rounded-2xl border border-dashed border-line p-8 text-center">{t.empty}</p> : (
        <ul className="grid lg:grid-cols-2 gap-3">
          {list.map((a) => (
            <li key={a.user_id ?? a.email} className={`rounded-3xl border border-line bg-surface p-5 ${a.is_active ? "" : "opacity-60"}`}>
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-full bg-latte-soft text-coffee flex items-center justify-center shrink-0">{a.pending ? <Mail size={17} /> : <UserCog size={17} />}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink font-medium truncate">{a.full_name || a.email}</p>
                  <p className="text-xs text-ink-soft truncate">{a.email}{a.title ? ` · ${a.title}` : ""}</p>
                  <p className="text-xs mt-1 flex items-center gap-1.5 text-ink-soft"><span className={`w-2 h-2 rounded-full ${a.pending ? "bg-amber-500" : a.online ? "bg-green-500" : "bg-ink-faint"}`} />{a.pending ? t.pending : a.online ? t.online : t.offline}{!a.pending && ` · ${t.threads(a.open_threads)}`}{!a.is_active && ` · ${t.inactive}`}</p>
                </div>
                <button aria-label={t.remove} onClick={() => remove(a)} className="w-9 h-9 rounded-full border border-line flex items-center justify-center text-red-600"><Trash2 size={15} /></button>
              </div>
              {edit?.user_id === a.user_id && !a.pending ? (
                <div className="mt-3 space-y-3"><input aria-label={t.job} className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /><DeptPicker lang={lang} value={edit.departments} onChange={(d) => setEdit({ ...edit, departments: d })} /><div className="flex gap-2"><button disabled={busy || !edit.departments.length} onClick={saveEdit} className="rounded-full bg-ink text-cream text-xs px-4 py-2 disabled:opacity-60">{t.save}</button><button onClick={() => setEdit(null)} className="rounded-full border border-line text-xs px-4 py-2"><X size={12} /></button></div></div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-1.5">{a.departments.map((d) => <span key={d} className="rounded-full bg-latte-soft text-coffee-dark text-[11px] px-2.5 py-1">{deptLabel(lang, d)}</span>)}</div>
              )}
              {!a.pending && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => showStats(a)} className="inline-flex items-center gap-1.5 rounded-full border border-line text-xs px-3.5 py-2"><BarChart3 size={13} />{t.stats}</button>
                  <button onClick={() => setEdit({ user_id: a.user_id, title: a.title, departments: a.departments })} className="rounded-full border border-line text-xs px-3.5 py-2">{t.edit}</button>
                  <button onClick={() => toggleActive(a)} className="rounded-full border border-line text-xs px-3.5 py-2">{t.toggle}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {stats && (
        <div className="rounded-3xl border border-line bg-cream p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between"><h3 className="font-display text-xl text-ink">{t.stats} · {stats.agent.full_name || stats.agent.email}</h3><button aria-label="×" onClick={() => setStats(null)}><X size={18} /></button></div>
          {!stats.data ? <Loader2 className="animate-spin text-coffee" /> : Object.entries(stats.data).map(([m, s]) => <ModuleStats key={m} module={m} stats={s} />)}
        </div>
      )}
    </div>
  );
}
