import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Flag, Loader2 } from "lucide-react";
import { api } from "../../lib/api.js";
import { useUser } from "../../context/Usercontext.jsx";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";
import { StatusPill, input, msgOf, nf } from "../../components/money/parts.jsx";
import CorridorRates from "../../components/money/CorridorRates.jsx";
import ReviewQueue from "../../components/money/ReviewQueue.jsx";

/** Espace des agents H-Money : contrôle des transactions de leur pays et, si autorisé, taux de leur devise. */
export default function MoneyAgent() {
  usePageMeta({ title: "Agent H-Money" });
  const { isAuthenticated, isLoading, withAuth } = useUser();
  const navigate = useNavigate();
  const [me, setMe] = useState(undefined);
  const [tx, setTx] = useState([]);
  const [only, setOnly] = useState(false);
  const [rate, setRate] = useState({});
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => { if (!isLoading && !isAuthenticated) navigate("/connexion", { state: { redirectTo: "/money/agent" } }); }, [isLoading, isAuthenticated, navigate]);
  const load = useCallback(async () => {
    try {
      const m = await withAuth((t) => api.money.agent.me(t)); setMe(m);
      setRate(Object.fromEntries(m.map((c) => [c.country, { per_usd: c.per_usd ?? "", margin_pct: c.margin_pct ?? 0 }])));
      if (m.some((c) => c.can_review)) setTx(await withAuth((t) => api.money.agent.transactions(t, only ? { flagged: true } : {})));
    } catch (e) { setMe(e?.status === 403 ? null : null); setErr(msgOf(e)); }
  }, [withAuth, only]);
  useEffect(() => { if (isAuthenticated) load(); }, [isAuthenticated, load]);

  async function flag(t) {
    const note = t.flagged ? "" : window.prompt("Motif du signalement ?");
    if (!t.flagged && !note) return;
    try { await withAuth((tk) => api.money.agent.flag(tk, t.code, { flagged: !t.flagged, note: note || "" })); await load(); } catch (e) { setErr(msgOf(e)); }
  }
  async function saveRate(country) {
    setErr(""); setOk("");
    try { await withAuth((t) => api.money.agent.setRate(t, { country, per_usd: Number(rate[country].per_usd), margin_pct: Number(rate[country].margin_pct) })); setOk("Taux enregistré."); await load(); } catch (e) { setErr(msgOf(e)); }
  }

  if (me === undefined) return <div className="min-h-screen bg-cream flex items-center justify-center"><Loader2 className="animate-spin text-ink-faint" /></div>;
  return (
    <div className="min-h-screen bg-cream px-5 py-8">
      <div className="max-w-4xl mx-auto">
        <Link to="/app" className="inline-flex items-center gap-1.5 text-sm text-ink-soft"><ArrowLeft size={15} />Accueil</Link>
        <h1 className="font-display text-3xl text-ink mt-4">Agent H-Money</h1>
        {!me ? <p className="mt-6 text-ink-soft">{err || "Vous n'êtes agent d'aucun pays pour l'instant."}</p> : (
          <>
            <p className="text-sm text-ink-soft mt-1">Pays : {me.map((c) => c.country).join(", ")}</p>
            {err && <p role="alert" className="text-sm text-red-600 mt-3">{err}</p>}{ok && <p className="text-sm text-emerald-700 mt-3">{ok}</p>}
            {me.some((c) => c.can_set_rates) && <div className="mt-6"><CorridorRates load={() => withAuth((t) => api.money.agent.corridorRates(t))} save={(b) => withAuth((t) => api.money.agent.setCorridorRate(t, b))} /></div>}
            {me.filter((c) => c.can_set_rates && c.currency !== "USD").map((c) => (
              <section key={c.country} className="mt-6 rounded-2xl border border-line bg-surface p-5">
                <h2 className="font-display text-lg text-ink">Taux {c.currency} ({c.country})</h2>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="text-sm">1 USD =<input type="number" step="any" className={`${input} mt-1 w-36`} value={rate[c.country]?.per_usd ?? ""} onChange={(e) => setRate({ ...rate, [c.country]: { ...rate[c.country], per_usd: e.target.value } })} /></label>
                  <label className="text-sm">Marge %<input type="number" step="0.1" min="0" max="15" className={`${input} mt-1 w-24`} value={rate[c.country]?.margin_pct ?? 0} onChange={(e) => setRate({ ...rate, [c.country]: { ...rate[c.country], margin_pct: e.target.value } })} /></label>
                  <button onClick={() => saveRate(c.country)} className="rounded-xl bg-ink text-cream text-sm font-medium px-5 py-3">Enregistrer</button>
                </div>
                <p className="text-xs text-ink-faint mt-2">Variation limitée à ±25 % par changement. Chaque modification est journalisée.</p>
              </section>
            ))}
            {me.some((c) => c.can_review) && tx && <div className="mt-8"><ReviewQueue rows={tx} onDecide={async (code, approve, reason) => { await withAuth((t) => api.money.agent.review(t, code, { approve, reason })); await load(); }} /></div>}
            {me.some((c) => c.can_review) && (
              <section className="mt-8">
                <div className="flex items-center justify-between mb-3"><h2 className="font-display text-xl text-ink">Transactions</h2><label className="text-sm inline-flex items-center gap-2"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />Signalées seulement</label></div>
                <div className="rounded-2xl border border-line bg-surface overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-xs text-ink-faint border-b border-line"><th className="px-3 py-2.5">Code</th><th className="px-3 py-2.5">Sens</th><th className="px-3 py-2.5">Reçu</th><th className="px-3 py-2.5">Bénéficiaire</th><th className="px-3 py-2.5">Statut</th><th /></tr></thead>
                  <tbody>{tx.map((t) => <tr key={t.code} className="border-b border-line last:border-0"><td className="px-3 py-2.5 whitespace-nowrap">{t.code}</td><td className="px-3 py-2.5">{t.from_country}→{t.to_country}</td><td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{nf(t.receive_amount, t.receive_currency)}</td><td className="px-3 py-2.5 whitespace-nowrap">{t.counterpart_name} <span className="text-ink-faint">{t.counterpart_phone}</span></td><td className="px-3 py-2.5"><StatusPill status={t.status} /></td><td className="px-3 py-2.5 text-right"><button onClick={() => flag(t)} className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs ${t.flagged ? "border-red-200 text-red-700 bg-red-50" : "border-line text-ink-soft"}`}><Flag size={12} />{t.flagged ? "Retirer" : "Signaler"}</button></td></tr>)}
                    {!tx.length && <tr><td colSpan={6} className="p-5 text-ink-soft">Aucune transaction.</td></tr>}</tbody></table></div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
