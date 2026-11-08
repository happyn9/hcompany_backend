import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { StatusPill, nf } from "../money/parts.jsx";

const msgOf = (e) => e?.data?.detail || e?.message || "Une erreur est survenue.";
const TABS = [["overview", "Aperçu"], ["tx", "Transactions"], ["rates", "Taux envoi / retrait"], ["fees", "Frais & plafonds"], ["ops", "Opérateurs (PawaPay)"], ["agents", "Agents par pays"], ["audit", "Journal"]];
const cell = "px-3 py-2.5 text-sm whitespace-nowrap";

function Stat({ label, value, sub }) {
  return <div className="rounded-2xl border border-line bg-surface p-5"><p className="text-xs text-ink-faint">{label}</p><p className="font-display text-2xl sm:text-3xl text-ink mt-1 tabular-nums">{value}</p>{sub && <p className="text-xs text-ink-faint mt-1">{sub}</p>}</div>;
}

import CorridorRates from "../money/CorridorRates.jsx";
import ReviewQueue from "../money/ReviewQueue.jsx";

const FIELDS = [["fee_pct", "Commission de base (%)", "Plancher : les frais montent automatiquement si le coût PawaPay l'exige", "0.1"], ["target_margin_pct", "Marge nette minimale (%)", "Gagnée APRÈS les frais opérateur + PawaPay", "0.1"], ["min_fee_usd", "Frais minimum (USD)", "Plancher de la commission", "0.1"], ["min_usd", "Montant minimum (USD)", "Par opération", "0.5"], ["max_usd", "Montant maximum (USD)", "Par opération", "10"], ["daily_max_usd", "Plafond journalier (USD)", "Par personne et par jour", "50"]];

const tiersText = (t) => (t || []).map(([b, f]) => `${b == null ? "*" : b}:${f}`).join(", ");
const parseTiers = (txt) => txt.split(",").map((x) => x.trim()).filter(Boolean).map((x) => { const [b, f] = x.split(":"); return [b.trim() === "*" ? null : Number(b), Number(f)]; });

function OperatorRow({ r, onSave }) {
  const [v, setV] = useState({ enabled: r.enabled, pct: r.pct, tiers: tiersText(r.tiers), confirmed: r.confirmed, note: r.note });
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  const dirty = v.enabled !== r.enabled || Number(v.pct) !== r.pct || v.tiers !== tiersText(r.tiers) || v.confirmed !== r.confirmed;
  const save = async () => { setBusy(true); setMsg(""); try { await onSave({ country: r.country, operator: r.operator, direction: r.direction, enabled: v.enabled, pct: Number(v.pct), tiers: parseTiers(v.tiers), confirmed: v.confirmed, note: v.note }); setMsg("✓"); } catch (e) { setMsg(msgOf(e)); } finally { setBusy(false); } };
  return (
    <tr className="border-b border-line last:border-0 align-top">
      <td className={cell}>{r.country === "ZM" ? "🇿🇲" : "🇨🇩"} <strong>{r.label}</strong><span className="block text-[11px] text-ink-faint">{r.code}</span></td>
      <td className={cell}>{r.direction === "in" ? "Encaisser" : "Verser"}</td>
      <td className={cell}><input type="checkbox" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} aria-label="Actif" /></td>
      <td className={cell}><input type="number" step="0.01" min="0" value={v.pct} onChange={(e) => setV({ ...v, pct: e.target.value })} className="w-20 rounded-lg border border-line bg-cream px-2 py-1 tabular-nums" /> %</td>
      <td className={cell}><input value={v.tiers} onChange={(e) => setV({ ...v, tiers: e.target.value })} placeholder="150.01:0.5, 500.01:1, *:5.5" className="w-56 rounded-lg border border-line bg-cream px-2 py-1 text-xs" /></td>
      <td className={cell}><label className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" checked={v.confirmed} onChange={(e) => setV({ ...v, confirmed: e.target.checked })} />{v.confirmed ? "Confirmé" : <span className="text-[#8a6a1f]">À vérifier</span>}</label></td>
      <td className={cell}><button disabled={!dirty || busy} onClick={save} className="rounded-full bg-ink text-cream text-xs px-3 py-1.5 disabled:opacity-30">Enregistrer</button> <span className="text-xs">{msg}</span></td>
    </tr>
  );
}

function OperatorFees({ load, save }) {
  const [rows, setRows] = useState(null), [err, setErr] = useState("");
  useEffect(() => { load().then(setRows).catch((e) => setErr(msgOf(e))); }, [load]);
  if (!rows) return err ? <p className="text-sm text-[#9B2C2C]">{err}</p> : <Loader2 className="animate-spin text-ink-soft" />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft max-w-3xl">Coût de l'agrégateur (frais opérateur + 1 % PawaPay) par opérateur et par sens. Le prix client est calculé pour couvrir ce coût <strong>plus</strong> la marge nette minimale : on ne perd rien, quel que soit l'opérateur choisi. Tranches : <code>borne:fixe</code> en devise locale (« * » = au-delà). Les lignes « À vérifier » sont des hypothèses : corrigez-les d'après votre contrat.</p>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-left"><thead><tr className="text-xs text-ink-faint border-b border-line"><th className={cell}>Opérateur</th><th className={cell}>Sens</th><th className={cell}>Actif</th><th className={cell}>Taux</th><th className={cell}>Frais fixes par tranche</th><th className={cell}>Statut</th><th className={cell} /></tr></thead>
          <tbody>{rows.map((r) => <OperatorRow key={`${r.country}${r.operator}${r.direction}`} r={r} onSave={save} />)}</tbody></table>
      </div>
    </div>
  );
}

function FeesSettings({ load, save }) {
  const [v, setV] = useState(null), [err, setErr] = useState(""), [ok, setOk] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => { load().then(setV).catch((e) => setErr(msgOf(e))); }, [load]);
  if (!v) return err ? <p className="text-sm text-[#9B2C2C]">{err}</p> : <Loader2 className="animate-spin text-ink-soft" />;
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(""); setOk(false);
    try { setV(await save(Object.fromEntries(FIELDS.map(([k]) => [k, Number(v[k])])))); setOk(true); } catch (x) { setErr(Array.isArray(x?.data?.detail) ? x.data.detail.map((d) => d.msg).join(" ") : msgOf(x)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="max-w-2xl rounded-2xl border border-line bg-surface p-6 space-y-5">
      <p className="text-sm text-ink-soft">Ces valeurs s'appliquent immédiatement à tous les nouveaux envois et demandes. Chaque changement est enregistré dans le journal.</p>
      <div className="grid sm:grid-cols-2 gap-4">
        {FIELDS.map(([k, label, hint, step]) => (
          <label key={k} className="block text-sm"><span className="font-medium text-ink">{label}</span>
            <input type="number" min="0" step={step} required value={v[k]} onChange={(e) => { setOk(false); setV({ ...v, [k]: e.target.value }); }} className="mt-1 w-full rounded-xl border border-line bg-cream px-3 py-2.5 tabular-nums" />
            <span className="text-xs text-ink-faint">{hint}</span></label>
        ))}
      </div>
      {err && <p className="text-sm text-[#9B2C2C]" role="alert">{err}</p>}
      {ok && <p className="text-sm text-[#1F4D2E]" role="status">Enregistré.</p>}
      <button disabled={busy} className="rounded-full bg-ink text-cream px-6 py-2.5 text-sm font-medium disabled:opacity-50">{busy ? "…" : "Enregistrer"}</button>
    </form>
  );
}

export default function MoneyAdminPanel({ withAuth, api }) {
  const M = api.money.admin;
  const [tab, setTab] = useState("overview");
  const [days, setDays] = useState(30);
  const [ov, setOv] = useState(null);
  const [tx, setTx] = useState(null);
  const [agents, setAgents] = useState(null);
  const [audit, setAudit] = useState(null);
  const [filter, setFilter] = useState({ status: "", country: "", flagged: "" });
  const [form, setForm] = useState({ email: "", country: "CD", can_set_rates: false, can_review: true });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setErr("");
      if (tab === "overview") setOv(await withAuth((t) => M.overview(t, days)));
      if (tab === "tx") setTx(await withAuth((t) => M.transactions(t, { status: filter.status, country: filter.country, flagged: filter.flagged === "" ? undefined : filter.flagged === "1" })));
      if (tab === "agents") setAgents(await withAuth((t) => M.agents(t)));
      if (tab === "audit") setAudit(await withAuth((t) => M.audit(t)));
    } catch (e) { if (e?.status !== 428) setErr(msgOf(e)); }
  }, [tab, days, filter, withAuth, M]);
  useEffect(() => { load(); }, [load]);

  async function assign(e) {
    e.preventDefault(); setBusy(true);
    try { await withAuth((t) => M.assign(t, form)); setForm({ ...form, email: "" }); await load(); } catch (x) { setErr(msgOf(x)); } finally { setBusy(false); }
  }
  async function remove(id) {
    if (!window.confirm("Retirer cet agent de ce pays ?")) return;
    try { await withAuth((t) => M.remove(t, id)); await load(); } catch (x) { setErr(msgOf(x)); }
  }

  return (
    <div>
      <div role="tablist" className="flex gap-1 overflow-x-auto rounded-2xl bg-latte-soft p-1 mb-6">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium ${tab === k ? "bg-ink text-cream" : "text-coffee-dark"}`}>{l}</button>)}
      </div>
      {err && <p role="alert" className="text-sm text-red-600 mb-4">{err}</p>}

      {tab === "overview" && (!ov ? <Loader2 className="animate-spin text-ink-faint" /> : (
        <div className="space-y-6">
          <div className="flex items-center gap-3"><select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">{[7, 30, 90, 365].map((d) => <option key={d} value={d}>{d} derniers jours</option>)}</select>{ov.simulated && <span className="text-xs rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1">Données de démonstration</span>}</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Opérations" value={ov.total} sub={`${ov.completed} terminées`} />
            <Stat label="Volume (équiv. USD)" value={ov.volume_usd.toLocaleString("fr-FR")} />
            <Stat label="Frais perçus (USD)" value={ov.fees_usd.toLocaleString("fr-FR")} sub={`Coût PawaPay ${(ov.cost_usd || 0).toLocaleString("fr-FR")} · marge nette ${(ov.net_usd || 0).toLocaleString("fr-FR")}`} />
            <Stat label="Signalées" value={ov.flagged} />
          </div>
          <div className="rounded-2xl border border-line bg-surface overflow-x-auto">
            <table className="w-full text-left"><thead><tr className="text-xs text-ink-faint border-b border-line"><th className={cell}>Corridor</th><th className={cell}>Opérations</th><th className={cell}>Volume USD</th><th className={cell}>Frais USD</th></tr></thead>
              <tbody>{Object.entries(ov.corridors).map(([k, c]) => <tr key={k} className="border-b border-line last:border-0"><td className={cell}>{k}</td><td className={cell}>{c.count}</td><td className={cell}>{c.volume_usd.toLocaleString("fr-FR")}</td><td className={cell}>{c.fees_usd.toLocaleString("fr-FR")}</td></tr>)}
                {!Object.keys(ov.corridors).length && <tr><td colSpan={4} className="p-5 text-sm text-ink-soft">Aucune opération terminée sur la période.</td></tr>}</tbody></table>
          </div>
          <div className="flex flex-wrap gap-2">{Object.entries(ov.by_status).map(([s, n]) => <span key={s} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs"><StatusPill status={s} />{n}</span>)}</div>
        </div>
      ))}

      {tab === "tx" && (
        <div className="space-y-4">
          <ReviewQueue rows={tx} onDecide={async (code, approve, reason) => { await withAuth((t) => M.review(t, code, { approve, reason })); await load(); }} />
          <div className="flex flex-wrap gap-3">
            <select aria-label="Statut" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm"><option value="">Tous statuts</option>{["completed", "awaiting_payer", "refunded", "cancelled", "declined", "expired"].map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select aria-label="Pays" value={filter.country} onChange={(e) => setFilter({ ...filter, country: e.target.value })} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm"><option value="">Tous pays</option><option value="ZM">Zambie</option><option value="CD">RD Congo</option></select>
            <select aria-label="Signalement" value={filter.flagged} onChange={(e) => setFilter({ ...filter, flagged: e.target.value })} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm"><option value="">Signalées ou non</option><option value="1">Signalées</option></select>
          </div>
          {!tx ? <Loader2 className="animate-spin text-ink-faint" /> : (
            <div className="rounded-2xl border border-line bg-surface overflow-x-auto">
              <table className="w-full text-left"><thead><tr className="text-xs text-ink-faint border-b border-line"><th className={cell}>Code</th><th className={cell}>Type</th><th className={cell}>Sens</th><th className={cell}>Payé</th><th className={cell}>Reçu</th><th className={cell}>Statut</th><th className={cell}>Date</th></tr></thead>
                <tbody>{tx.map((t) => <tr key={t.code} className="border-b border-line last:border-0"><td className={cell}>{t.code}{t.flagged && <span title={t.review_note} className="ml-1">🚩</span>}</td><td className={cell}>{t.kind === "send" ? "Envoi" : "Demande"}</td><td className={cell}>{t.from_country}→{t.to_country}</td><td className={`${cell} tabular-nums`}>{nf(t.total_paid, t.send_currency)}</td><td className={`${cell} tabular-nums`}>{nf(t.receive_amount, t.receive_currency)}</td><td className={cell}><StatusPill status={t.status} /></td><td className={cell}>{new Date(t.created_at).toLocaleString("fr-FR")}</td></tr>)}
                  {!tx.length && <tr><td colSpan={7} className="p-5 text-sm text-ink-soft">Aucune transaction.</td></tr>}</tbody></table>
            </div>)}
        </div>
      )}

      {tab === "ops" && <OperatorFees load={() => withAuth((t) => M.operators(t))} save={(b) => withAuth((t) => M.setOperator(t, b))} />}
      {tab === "fees" && <FeesSettings load={() => withAuth((t) => M.settings(t))} save={(b) => withAuth((t) => M.saveSettings(t, b))} />}
      {tab === "rates" && <CorridorRates maxPct={50} load={() => withAuth((t) => M.corridorRates(t))} save={(b) => withAuth((t) => M.setCorridorRate(t, b))} />}
      {tab === "agents" && (
        <div className="space-y-6">
          <form onSubmit={assign} className="rounded-2xl border border-line bg-surface p-5 grid gap-4 sm:grid-cols-[1.4fr_1fr_auto] items-end">
            <label className="block text-sm"><span className="block font-medium mb-1.5">E-mail de l'agent</span><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-xl border border-line bg-cream px-4 py-3 text-sm" /></label>
            <label className="block text-sm"><span className="block font-medium mb-1.5">Pays (code ISO)</span><input required maxLength={2} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} className="w-full rounded-xl border border-line bg-cream px-4 py-3 text-sm uppercase" /></label>
            <button disabled={busy} className="rounded-xl bg-ink text-cream text-sm font-medium px-6 py-3 disabled:opacity-50">Affecter</button>
            <label className="sm:col-span-3 flex flex-wrap gap-5 text-sm"><span className="inline-flex items-center gap-2"><input type="checkbox" checked={form.can_review} onChange={(e) => setForm({ ...form, can_review: e.target.checked })} />Contrôle les transactions</span><span className="inline-flex items-center gap-2"><input type="checkbox" checked={form.can_set_rates} onChange={(e) => setForm({ ...form, can_set_rates: e.target.checked })} />Peut fixer le taux de la devise du pays (±25 %)</span></label>
          </form>
          {!agents ? <Loader2 className="animate-spin text-ink-faint" /> : (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {agents.filter((a) => a.active).map((a) => <li key={a.id} className="p-4 flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium text-ink">{a.name || a.email} <span className="text-xs text-ink-faint">· {a.country}</span></p><p className="text-xs text-ink-faint">{a.email} · {a.can_review ? "contrôle" : ""}{a.can_set_rates ? " · taux" : ""}</p></div><button onClick={() => remove(a.id)} className="text-xs text-red-700 border border-red-200 rounded-lg px-3 py-2">Retirer</button></li>)}
              {!agents.some((a) => a.active) && <li className="p-5 text-sm text-ink-soft">Aucun agent affecté. Le compte de l'agent doit déjà exister (il crée un compte, puis vous l'affectez à un pays).</li>}
            </ul>)}
        </div>
      )}

      {tab === "audit" && (!audit ? <Loader2 className="animate-spin text-ink-faint" /> : (
        <div className="rounded-2xl border border-line bg-surface overflow-x-auto"><table className="w-full text-left"><thead><tr className="text-xs text-ink-faint border-b border-line"><th className={cell}>Date</th><th className={cell}>Action</th><th className={cell}>Cible</th><th className={cell}>Détail</th></tr></thead>
          <tbody>{audit.map((a, i) => <tr key={i} className="border-b border-line last:border-0"><td className={cell}>{new Date(a.at).toLocaleString("fr-FR")}</td><td className={cell}>{a.action}</td><td className={cell}>{a.target}</td><td className="px-3 py-2.5 text-sm">{a.detail}</td></tr>)}{!audit.length && <tr><td colSpan={4} className="p-5 text-sm text-ink-soft">Journal vide.</td></tr>}</tbody></table></div>
      ))}
    </div>
  );
}
