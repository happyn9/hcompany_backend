import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Check, Loader2, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { api } from "../../lib/api.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { MODULES, moduleByKey } from "./modules.js";

const L = {
  fr: { title: "Mes modules", lead: "Un seul partenariat : débloquez les applications que vous voulez gérer, quand vous voulez.", activate: "Débloquer", active: "Activé", manage: "Gérer", off: "Désactiver", offConfirm: "Désactiver ce module ? Vos données sont conservées.", activated: "Module activé", failed: "Action impossible", profile: "Profil créé à partir de votre dossier partenaire", noProfile: "Complétez votre profil dans l'espace du module", open: "Ouvrir", shortcuts: "Raccourcis", status: "Statut", none: "Aucun" },
  en: { title: "My modules", lead: "One partnership: unlock the apps you want to manage, whenever you want.", activate: "Unlock", active: "Active", manage: "Manage", off: "Deactivate", offConfirm: "Deactivate this module? Your data is kept.", activated: "Module activated", failed: "Action failed", profile: "Profile created from your partner file", noProfile: "Complete your profile in the module space", open: "Open", shortcuts: "Shortcuts", status: "Status", none: "None" },
};

export function useModules() {
  const { withAuth } = useUser();
  const [state, setState] = useState(null);
  const [error, setError] = useState(false);
  const reload = useCallback(() => withAuth((t) => api.partnerModules.list(t)).then((d) => { setState(d); setError(false); }).catch(() => setError(true)), [withAuth]);
  useEffect(() => { reload(); }, [reload]);
  return { state, setState, error, reload };
}

export function ModulesTab({ state, setState, onOpen }) {
  const { lang } = useLanguage();
  const t = L[lang] || L.fr;
  const { withAuth } = useUser();
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const by = Object.fromEntries((state?.modules || []).map((m) => [m.key, m]));

  async function toggle(key, on) {
    if (!on && !window.confirm(t.offConfirm)) return;
    setBusy(key);
    try {
      setState(await withAuth((tk) => (on ? api.partnerModules.activate(tk, key) : api.partnerModules.deactivate(tk, key))));
      if (on) { toast?.success?.(t.activated); onOpen?.(key); }
    } catch (e) { toast?.error?.(e?.message || t.failed); } finally { setBusy(""); }
  }

  return (
    <div>
      <h2 className="font-display text-2xl text-ink mb-1">{t.title}</h2>
      <p className="text-sm text-ink-soft mb-6 max-w-xl">{t.lead}</p>
      <div className="grid sm:grid-cols-2 gap-4">
        {MODULES.map((m) => {
          const c = m[lang] || m.fr; const s = by[m.key]; const on = Boolean(s?.active); const Icon = m.icon;
          return (
            <div key={m.key} className={`rounded-2xl border p-5 sm:p-6 flex flex-col ${on ? "border-coffee/40 bg-surface" : "border-line bg-surface"}`}>
              <div className="flex items-center justify-between mb-4">
                <span className="w-10 h-10 rounded-xl bg-latte-soft text-coffee-dark flex items-center justify-center"><Icon size={19} strokeWidth={1.7} /></span>
                {on && <span className="inline-flex items-center gap-1 text-[0.68rem] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300"><Check size={13} />{t.active}</span>}
              </div>
              <p className="font-display text-xl text-ink">{c.name}</p>
              <p className="text-sm text-ink-soft leading-relaxed mt-1 mb-5 flex-1">{c.desc}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {on ? (
                  <>
                    <button onClick={() => onOpen?.(m.key)} className="rounded-full bg-ink text-cream text-sm font-medium px-5 py-2.5 hover:bg-coffee-dark">{t.manage}</button>
                    <button disabled={busy === m.key} onClick={() => toggle(m.key, false)} className="text-xs text-ink-faint hover:text-ink px-2 py-2">{t.off}</button>
                  </>
                ) : (
                  <button disabled={busy === m.key || state?.partner_status !== "approved"} onClick={() => toggle(m.key, true)} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-5 py-2.5 hover:bg-coffee-dark disabled:opacity-50">
                    {busy === m.key ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}{t.activate}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LearningInline() {
  const { lang } = useLanguage();
  const fr = lang === "fr";
  const { withAuth } = useUser();
  const toast = useToast();
  const [data, setData] = useState(undefined);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => withAuth((t) => api.learning.mySubscription(t)).then(setData).catch(() => setData(null)), [withAuth]);
  useEffect(() => { load(); }, [load]);
  if (data === undefined) return <Loader2 className="animate-spin text-ink-faint" />;
  const sub = data?.active;
  if (!sub) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-6 text-center">
        <p className="text-sm text-ink-soft mb-4">{fr ? "Aucun bouquet actif. Choisissez un bouquet individuel ou équipe." : "No active plan. Pick an individual or team plan."}</p>
        <Link to="/formations/bouquets" className="inline-block rounded-full bg-ink text-cream text-sm font-medium px-6 py-3">{fr ? "Voir les bouquets" : "See plans"}</Link>
      </div>
    );
  }
  const team = sub.seats > 1 || (sub.members || []).length > 0 || /team|équipe|equipe/i.test(sub.plan_code + sub.plan_name);
  async function add(e) {
    e.preventDefault(); setBusy(true);
    try { await withAuth((t) => api.learning.addMember(t, sub.id, email.trim())); setEmail(""); await load(); } catch (err) { toast?.error?.(err?.message || "Erreur"); } finally { setBusy(false); }
  }
  async function remove(id) {
    try { await withAuth((t) => api.learning.removeMember(t, sub.id, id)); await load(); } catch (err) { toast?.error?.(err?.message || "Erreur"); }
  }
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-latte-soft p-5 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div><p className="text-xs text-ink-faint">{fr ? "Bouquet" : "Plan"}</p><p className="text-ink font-medium">{sub.plan_name}</p></div>
        <div><p className="text-xs text-ink-faint">{team ? (fr ? "Équipe" : "Team") : (fr ? "Type" : "Type")}</p><p className="text-ink font-medium">{team ? (sub.org_name || "—") : (fr ? "Individuel" : "Individual")}</p></div>
        <div><p className="text-xs text-ink-faint">{fr ? "Places" : "Seats"}</p><p className="text-ink font-medium">{(sub.members || []).length + 1} / {sub.seats}</p></div>
        {sub.days_left != null && <div><p className="text-xs text-ink-faint">{fr ? "Jours restants" : "Days left"}</p><p className="text-ink font-medium">{sub.days_left}</p></div>}
      </div>
      {sub.is_owner && sub.seats > 1 && (
        <div className="rounded-2xl border border-line p-5">
          <p className="font-medium text-ink flex items-center gap-2 mb-3"><Users size={16} />{fr ? "Membres de l'équipe" : "Team members"}</p>
          <ul className="divide-y divide-line mb-4">
            {(sub.members || []).map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2.5 text-sm"><span className="truncate">{m.email}</span><button onClick={() => remove(m.id)} aria-label="remove" className="text-ink-faint hover:text-red-600 p-1"><Trash2 size={15} /></button></li>
            ))}
            {!(sub.members || []).length && <li className="py-2.5 text-sm text-ink-faint">{fr ? "Aucun membre ajouté." : "No members yet."}</li>}
          </ul>
          <form onSubmit={add} className="flex gap-2">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemple.com" className="flex-1 min-w-0 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm" />
            <button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-ink text-cream text-sm px-4 disabled:opacity-50"><UserPlus size={15} />{fr ? "Ajouter" : "Add"}</button>
          </form>
        </div>
      )}
    </div>
  );
}

export function ModuleWorkspace({ moduleKey, state }) {
  const { lang } = useLanguage();
  const t = L[lang] || L.fr;
  const m = moduleByKey(moduleKey);
  const c = m[lang] || m.fr;
  const info = (state?.modules || []).find((x) => x.key === moduleKey);
  const Icon = m.icon;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-latte-soft text-coffee-dark flex items-center justify-center"><Icon size={20} strokeWidth={1.7} /></span>
        <div><h2 className="font-display text-2xl text-ink leading-tight">{c.name}</h2><p className="text-sm text-ink-soft">{c.desc}</p></div>
      </div>
      {moduleKey !== "learning" && (
        <p className="text-sm text-ink-soft rounded-2xl bg-latte-soft px-4 py-3">{info?.has_profile ? t.profile : t.noProfile}</p>
      )}
      {moduleKey === "learning" && <LearningInline />}
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-ink-faint mb-3">{t.shortcuts}</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {c.links.map(([label, to]) => (
            <Link key={to} to={to} className="group flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4 text-sm font-medium text-ink hover:border-coffee-light">
              {label}<ArrowUpRight size={16} className="text-ink-faint group-hover:text-coffee-dark transition" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
