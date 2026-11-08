import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2, X, Check, Ban, Inbox, Eye, EyeOff } from "lucide-react";

const inputCls =
  "w-full rounded-xl border border-line bg-cream px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-coffee";

const SUB_STATUS = {
  active: { label: "Actif", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  pending: { label: "En attente", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  expired: { label: "Expiré", cls: "bg-line/60 text-ink-faint border-line" },
  cancelled: { label: "Annulé", cls: "bg-line/60 text-ink-faint border-line" },
  failed: { label: "Échoué", cls: "bg-red-50 text-red-700 border-red-200" },
};
const METHOD = { zamtel_money: "Zamtel", mtn_momo: "MTN", airtel_money: "Airtel", card: "Carte", cash: "Espèces" };

const EMPTY_PLAN = {
  code: "", name: "", audience: "individual", tagline: "", features: "", price_monthly: 0, price_yearly: 0,
  per_seat: false, min_seats: 1, max_seats: 1, includes_inperson: true, includes_exclusive: true,
  highlight: false, is_active: true, sort_order: 0,
};

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");
const money = (n, cur = "ZMW") => `${new Intl.NumberFormat("fr-FR").format(Math.round(n))} ${cur}`;

function PlanForm({ initial, onSave, onCancel, saving, error }) {
  const [f, setF] = useState({ ...EMPTY_PLAN, ...initial });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const submit = (e) => {
    e.preventDefault();
    onSave({
      ...f,
      price_monthly: Number(f.price_monthly) || 0,
      price_yearly: Number(f.price_yearly) || 0,
      min_seats: Number(f.min_seats) || 1,
      max_seats: f.per_seat ? Number(f.max_seats) || 1 : 1,
      sort_order: Number(f.sort_order) || 0,
    });
  };
  const check = (k, label) => (
    <label className="flex items-center gap-2 text-sm text-ink">
      <input type="checkbox" checked={!!f[k]} onChange={set(k)} />
      {label}
    </label>
  );
  return (
    <form onSubmit={submit} className="bg-surface border border-line rounded-2xl p-5 md:p-6 space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <label className="block text-xs text-ink-soft">Nom
          <input required minLength={2} className={`${inputCls} mt-1.5`} value={f.name} onChange={set("name")} />
        </label>
        <label className="block text-xs text-ink-soft">Code (lien, minuscules)
          <input required pattern="[a-z0-9_-]+" className={`${inputCls} mt-1.5`} value={f.code} onChange={set("code")} placeholder="ex : pro" />
        </label>
        <label className="block text-xs text-ink-soft">Type
          <select className={`${inputCls} mt-1.5`} value={f.audience} onChange={set("audience")}>
            <option value="individual">Individuel</option><option value="pro">Pro</option><option value="team">Équipe</option>
          </select>
        </label>
      </div>
      <label className="block text-xs text-ink-soft">Phrase d'accroche
        <input className={`${inputCls} mt-1.5`} value={f.tagline} onChange={set("tagline")} maxLength={200} />
      </label>
      <label className="block text-xs text-ink-soft">Avantages (une ligne par point)
        <textarea className={`${inputCls} mt-1.5 min-h-28`} value={f.features} onChange={set("features")} />
      </label>
      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
        <label className="block text-xs text-ink-soft">Prix mensuel (ZMW)
          <input type="number" min="0" step="1" className={`${inputCls} mt-1.5`} value={f.price_monthly} onChange={set("price_monthly")} />
        </label>
        <label className="block text-xs text-ink-soft">Prix annuel (ZMW)
          <input type="number" min="0" step="1" className={`${inputCls} mt-1.5`} value={f.price_yearly} onChange={set("price_yearly")} />
        </label>
        <label className="block text-xs text-ink-soft">Places min.
          <input type="number" min="1" disabled={!f.per_seat} className={`${inputCls} mt-1.5 disabled:opacity-50`} value={f.min_seats} onChange={set("min_seats")} />
        </label>
        <label className="block text-xs text-ink-soft">Places max.
          <input type="number" min="1" disabled={!f.per_seat} className={`${inputCls} mt-1.5 disabled:opacity-50`} value={f.max_seats} onChange={set("max_seats")} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {check("per_seat", "Prix par personne (équipe)")}
        {check("includes_inperson", "Inclut le présentiel")}
        {check("includes_exclusive", "Inclut le contenu exclusif")}
        {check("highlight", "Mis en avant")}
        {check("is_active", "Visible sur le site")}
        <label className="flex items-center gap-2 text-xs text-ink-soft">Ordre
          <input type="number" className={`${inputCls} w-20`} value={f.sort_order} onChange={set("sort_order")} />
        </label>
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-5 py-2.5 disabled:opacity-60">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Enregistrer
        </button>
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-2 rounded-full border border-line text-sm px-5 py-2.5 text-ink-soft"><X size={14} />Annuler</button>
      </div>
    </form>
  );
}

function PlansTab({ withAuth, api }) {
  const [plans, setPlans] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => withAuth((t) => api.admin.listPlans(t)).then(setPlans).catch(() => setPlans([])), [withAuth, api]);
  useEffect(() => { load(); }, [load]);

  async function save(body) {
    setSaving(true); setError("");
    try {
      if (editing === "new") await withAuth((t) => api.admin.createPlan(t, body));
      else await withAuth((t) => api.admin.updatePlan(t, editing.id, body));
      setEditing(null); await load();
    } catch (e) { setError(e?.data?.detail || e.message || "Erreur."); } finally { setSaving(false); }
  }
  async function toggle(p) {
    const { id, subscribers, ...body } = p;
    await withAuth((t) => api.admin.updatePlan(t, id, { ...body, is_active: !p.is_active })).catch(() => {});
    load();
  }
  async function del(p) {
    if (!window.confirm(p.subscribers ? `« ${p.name} » a des abonnés : il sera désactivé, pas supprimé.` : `Supprimer le bouquet « ${p.name} » ?`)) return;
    await withAuth((t) => api.admin.deletePlan(t, p.id)).catch(() => {});
    load();
  }

  if (!plans) return <div className="h-40 rounded-2xl bg-surface border border-line animate-pulse" />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft max-w-xl">Les prix sont en monnaie pivot (ZMW). Les autres devises sont converties selon l'onglet « Devises ». Un bouquet déjà acheté ne peut pas être supprimé : il est masqué.</p>
        <button onClick={() => { setError(""); setEditing("new"); }} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-5 py-2.5"><Plus size={15} />Nouveau bouquet</button>
      </div>
      {editing && <PlanForm initial={editing === "new" ? null : editing} onSave={save} onCancel={() => setEditing(null)} saving={saving} error={error} />}
      <ul className="space-y-3">
        {plans.map((p) => (
          <li key={p.id} className="bg-surface border border-line rounded-2xl p-5 flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg text-ink flex items-center gap-2">
                {p.name}
                {p.highlight && <span className="text-[0.65rem] font-sans rounded-full bg-latte-soft text-coffee-dark px-2 py-0.5">Mis en avant</span>}
                {!p.is_active && <span className="text-[0.65rem] font-sans rounded-full bg-line/70 text-ink-faint px-2 py-0.5">Masqué</span>}
              </p>
              <p className="text-xs text-ink-soft mt-1">
                {money(p.price_monthly)} / mois · {money(p.price_yearly)} / an{p.per_seat ? ` · par personne (${p.min_seats}–${p.max_seats})` : ""} · {p.subscribers} abonné(s) actif(s)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggle(p)} title={p.is_active ? "Masquer" : "Afficher"} className="rounded-full border border-line p-2 text-ink-soft">{p.is_active ? <Eye size={14} /> : <EyeOff size={14} />}</button>
              <button onClick={() => { setError(""); setEditing(p); }} className="rounded-full border border-line text-xs px-3.5 py-2 text-ink-soft">Modifier</button>
              <button onClick={() => del(p)} aria-label="Supprimer" className="rounded-full border border-line p-2 text-ink-faint hover:text-red-600"><Trash2 size={14} /></button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CurrenciesTab({ withAuth, api }) {
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => withAuth((t) => api.admin.listCurrencies(t)).then(setRows).catch(() => setRows([])), [withAuth, api]);
  useEffect(() => { load(); }, [load]);
  const pivot = rows?.[0]?.code;

  const edit = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  async function save() {
    setSaving(true); setMsg(null);
    try {
      const saved = await withAuth((t) => api.admin.saveCurrencies(t, rows.map((r) => ({ ...r, code: r.code.toUpperCase(), rate: Number(r.rate) || 0 }))));
      setRows(saved);
      setMsg({ ok: true, text: "Taux enregistrés." });
    } catch (e) { setMsg({ ok: false, text: e?.data?.detail?.[0]?.msg || e?.data?.detail || e.message || "Erreur." }); } finally { setSaving(false); }
  }
  if (!rows) return <div className="h-40 rounded-2xl bg-surface border border-line animate-pulse" />;
  return (
    <div className="space-y-5 max-w-3xl">
      <p className="text-sm text-ink-soft">
        La monnaie pivot ({pivot}) sert à fixer les prix et à facturer. Pour chaque autre devise, indiquez combien d'unités valent 1 {pivot} : ce taux ne sert qu'à l'affichage. Mettez-le à jour quand le change bouge.
      </p>
      <div className="bg-surface border border-line rounded-2xl divide-y divide-line">
        {rows.map((r, i) => (
          <div key={r.code + i} className="grid grid-cols-[4.5rem_1fr_4.5rem_8rem_auto] gap-3 items-center p-4">
            <input className={`${inputCls} uppercase`} maxLength={3} value={r.code} disabled={r.code === pivot} onChange={(e) => edit(i, "code", e.target.value)} aria-label="Code" />
            <input className={inputCls} value={r.label} onChange={(e) => edit(i, "label", e.target.value)} placeholder="Nom" aria-label="Nom" />
            <input className={inputCls} value={r.symbol} maxLength={8} onChange={(e) => edit(i, "symbol", e.target.value)} placeholder="Symb." aria-label="Symbole" />
            <input type="number" step="any" min="0" className={inputCls} value={r.rate} disabled={r.code === pivot} onChange={(e) => edit(i, "rate", e.target.value)} aria-label={`1 ${pivot} en ${r.code}`} />
            {r.code === pivot ? <span className="text-[0.65rem] text-ink-faint px-2">Pivot</span> : (
              <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label="Retirer" className="text-ink-faint hover:text-red-600 p-2"><Trash2 size={14} /></button>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={() => setRows((x) => [...x, { code: "", label: "", symbol: "", rate: 1 }])} className="inline-flex items-center gap-2 rounded-full border border-line text-sm px-4 py-2.5 text-ink-soft"><Plus size={14} />Ajouter une devise</button>
        <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-5 py-2.5 disabled:opacity-60">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Enregistrer les taux
        </button>
        {msg && <span role="status" className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

function SubscriptionsTab({ withAuth, api, plans }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState({ user_email: "", plan_code: "", period: "month", seats: 1, org_name: "", note: "" });
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const load = useCallback(() => withAuth((t) => api.admin.listSubscriptions(t, filter || undefined)).then(setRows).catch(() => setRows([])), [withAuth, api, filter]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(id, status) {
    setBusy(id);
    try { await withAuth((t) => api.admin.updateSubscriptionStatus(t, id, status)); await load(); } finally { setBusy(null); }
  }
  async function create(e) {
    e.preventDefault(); setErr("");
    try {
      await withAuth((t) => api.admin.createSubscription(t, { ...form, seats: Number(form.seats) || 1, org_name: form.org_name || null, note: form.note || null }));
      setOpen(false); setForm({ ...form, user_email: "", org_name: "", note: "" }); await load();
    } catch (x) { setErr(x?.data?.detail || x.message || "Erreur."); }
  }

  const total = (rows || []).filter((r) => r.status === "active").reduce((s, r) => s + r.amount_pivot, 0);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          {[["", "Tous"], ["active", "Actifs"], ["pending", "En attente"], ["expired", "Expirés"], ["cancelled", "Annulés"], ["failed", "Échoués"]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-full text-xs px-3.5 py-2 border ${filter === k ? "bg-ink text-cream border-ink" : "border-line text-ink-soft"}`}>{l}</button>
          ))}
        </div>
        <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-5 py-2.5"><Plus size={15} />Activer un bouquet (espèces / présentiel)</button>
      </div>
      {open && (
        <form onSubmit={create} className="bg-surface border border-line rounded-2xl p-5 grid md:grid-cols-3 gap-4">
          <label className="block text-xs text-ink-soft md:col-span-2">E-mail du compte
            <input type="email" required className={`${inputCls} mt-1.5`} value={form.user_email} onChange={(e) => setForm({ ...form, user_email: e.target.value })} />
          </label>
          <label className="block text-xs text-ink-soft">Bouquet
            <select required className={`${inputCls} mt-1.5`} value={form.plan_code} onChange={(e) => setForm({ ...form, plan_code: e.target.value })}>
              <option value="">Choisir…</option>
              {(plans || []).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
          </label>
          <label className="block text-xs text-ink-soft">Durée
            <select className={`${inputCls} mt-1.5`} value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
              <option value="month">Mensuel</option><option value="year">Annuel</option>
            </select>
          </label>
          <label className="block text-xs text-ink-soft">Places (équipe)
            <input type="number" min="1" className={`${inputCls} mt-1.5`} value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} />
          </label>
          <label className="block text-xs text-ink-soft">Entreprise (équipe)
            <input className={`${inputCls} mt-1.5`} value={form.org_name} onChange={(e) => setForm({ ...form, org_name: e.target.value })} />
          </label>
          <label className="block text-xs text-ink-soft md:col-span-3">Note (ex. « payé en espèces le 12/10, reçu n° 4 »)
            <input className={`${inputCls} mt-1.5`} maxLength={200} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
          {err && <p className="text-sm text-red-600 md:col-span-3" role="alert">{err}</p>}
          <div className="md:col-span-3"><button className="rounded-full bg-ink text-cream text-sm font-medium px-5 py-2.5">Activer</button></div>
        </form>
      )}
      {!rows ? <div className="h-40 rounded-2xl bg-surface border border-line animate-pulse" /> : rows.length === 0 ? (
        <div className="bg-surface border border-dashed border-line rounded-2xl px-6 py-12 text-center">
          <Inbox size={20} className="mx-auto text-ink-faint mb-3" />
          <p className="text-sm text-ink-soft">Aucun abonnement pour le moment.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-ink-soft">{rows.filter((r) => r.status === "active").length} actif(s) · {money(total, rows[0]?.pivot_currency)} de bouquets actifs dans cette liste</p>
          <ul className="space-y-3">
            {rows.map((s) => {
              const st = SUB_STATUS[s.status] || SUB_STATUS.expired;
              return (
                <li key={s.id} className="bg-surface border border-line rounded-2xl p-5 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink flex items-center gap-2 flex-wrap">
                      {s.plan_name}{s.seats > 1 ? ` · ${s.seats} pers.` : ""}
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                      {s.simulated && s.method !== "cash" && <span className="text-[11px] rounded-full bg-latte-soft text-coffee-dark px-2 py-0.5">Test</span>}
                    </p>
                    <p className="text-sm text-ink-soft mt-0.5">{s.user_name || "—"} · {s.user_email}{s.org_name ? ` · ${s.org_name}` : ""}</p>
                    <p className="text-xs text-ink-faint mt-1">
                      {s.reference} · {money(s.amount_pivot, s.pivot_currency)} · {METHOD[s.method] || s.method}{s.phone_number ? ` ${s.phone_number}` : ""} · {s.period === "year" ? "annuel" : "mensuel"} · du {fmtDate(s.starts_at)} au {fmtDate(s.ends_at)}
                    </p>
                    {s.failure_reason && <p className="text-xs text-ink-soft mt-1">{s.failure_reason}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {s.status !== "active" && <button disabled={busy === s.id} onClick={() => setStatus(s.id, "active")} className="inline-flex items-center gap-1.5 rounded-full border border-line text-xs px-3 py-1.5 text-ink-soft hover:border-coffee-light disabled:opacity-50"><Check size={12} />Activer</button>}
                    {s.status === "active" && <button disabled={busy === s.id} onClick={() => setStatus(s.id, "cancelled")} className="inline-flex items-center gap-1.5 rounded-full border border-line text-xs px-3 py-1.5 text-ink-soft hover:text-red-600 disabled:opacity-50"><Ban size={12} />Annuler</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

export default function PlansAdminPanel({ withAuth, api, tab }) {
  const [plans, setPlans] = useState([]);
  useEffect(() => {
    withAuth((t) => api.admin.listPlans(t)).then(setPlans).catch(() => {});
  }, [withAuth, api]);
  if (tab === "currencies") return <CurrenciesTab withAuth={withAuth} api={api} />;
  if (tab === "subscriptions") return <SubscriptionsTab withAuth={withAuth} api={api} plans={plans} />;
  return <PlansTab withAuth={withAuth} api={api} />;
}
