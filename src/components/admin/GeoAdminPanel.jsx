import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

const msgOf = (e) => e?.data?.detail || e?.message || "Une erreur est survenue.";

function RateRow({ r, onSave }) {
  const [v, setV] = useState({ per_usd: r.per_usd, margin_pct: r.margin_pct });
  const dirty = Number(v.per_usd) !== r.per_usd || Number(v.margin_pct) !== r.margin_pct;
  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-3 py-3 font-medium text-ink">{r.currency}</td>
      <td className="px-3 py-3"><input disabled={r.currency === "USD"} type="number" step="any" min="0" value={v.per_usd} onChange={(e) => setV({ ...v, per_usd: e.target.value })} aria-label={`1 USD en ${r.currency}`} className="w-28 rounded-lg border border-line bg-cream px-3 py-2 text-sm disabled:opacity-50" /></td>
      <td className="px-3 py-3"><input type="number" step="0.1" min="0" max="30" value={v.margin_pct} onChange={(e) => setV({ ...v, margin_pct: e.target.value })} aria-label={`Marge ${r.currency}`} className="w-20 rounded-lg border border-line bg-cream px-3 py-2 text-sm" /> %</td>
      <td className="px-3 py-3 text-xs"><span className={r.source === "seed" ? "text-amber-700" : "text-ink-faint"}>{r.source === "seed" ? "à vérifier" : r.source}</span></td>
      <td className="px-3 py-3 text-right"><button disabled={!dirty || r.currency === "USD"} onClick={() => onSave(r.currency, { per_usd: Number(v.per_usd), margin_pct: Number(v.margin_pct) })} className="rounded-lg bg-ink text-cream text-xs font-medium px-3.5 py-2 disabled:opacity-30">Enregistrer</button></td>
    </tr>
  );
}

/** Pays, devises et taux de change (1 USD = X). Les valeurs « à vérifier » sont les valeurs de départ. */
export default function GeoAdminPanel({ withAuth, api }) {
  const [ov, setOv] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => { try { setOv(await withAuth((t) => api.geo.admin.overview(t))); setErr(""); } catch (e) { if (e?.status !== 428) setErr(msgOf(e)); } }, [withAuth, api]);
  useEffect(() => { load(); }, [load]);
  async function save(cur, body) { try { await withAuth((t) => api.geo.admin.setRate(t, cur, body)); await load(); } catch (e) { setErr(msgOf(e)); } }
  if (!ov) return err ? <p className="text-sm text-red-600">{err}</p> : <Loader2 className="animate-spin text-ink-faint" />;
  const unchecked = ov.rates.some((r) => r.source === "seed" && r.currency !== "USD");
  return (
    <div className="space-y-8">
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      {unchecked && <p className="flex gap-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm p-4"><AlertTriangle size={18} className="shrink-0" />Certains taux sont des valeurs de départ approximatives. Saisissez les taux réels avant d'ouvrir H-Money au public.</p>}
      <section><h2 className="font-display text-xl text-ink mb-3">Taux de change (1 USD = …)</h2>
        <div className="rounded-2xl border border-line bg-surface overflow-x-auto"><table className="w-full text-left"><thead><tr className="text-xs text-ink-faint border-b border-line"><th className="px-3 py-2.5">Devise</th><th className="px-3 py-2.5">Taux</th><th className="px-3 py-2.5">Marge</th><th className="px-3 py-2.5">Source</th><th /></tr></thead><tbody>{ov.rates.map((r) => <RateRow key={r.currency + r.per_usd + r.margin_pct} r={r} onSave={save} />)}</tbody></table></div>
        <p className="text-xs text-ink-faint mt-2">La marge réduit ce que reçoit le bénéficiaire (H-Money) ou augmente le prix converti. Elle est affichée au client avant paiement.</p></section>
      <section><h2 className="font-display text-xl text-ink mb-3">Pays</h2>
        <ul className="grid sm:grid-cols-2 gap-3">{ov.countries.map((c) => <li key={c.code} className="rounded-2xl border border-line bg-surface p-4 flex items-center justify-between"><div><p className="font-medium text-ink">{c.name_fr} <span className="text-xs text-ink-faint">{c.code}</span></p><p className="text-xs text-ink-faint">{c.currency} · +{c.dial_code}</p></div>{c.is_service_country && <span className="text-[11px] rounded-full bg-latte-soft text-coffee-dark px-2.5 py-1">Services sur place</span>}</li>)}</ul></section>
    </div>
  );
}
