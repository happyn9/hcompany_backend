import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Loader2, RotateCcw } from "lucide-react";

const FLAG = { ZM: "🇿🇲", CD: "🇨🇩" };
const msgOf = (e) => (Array.isArray(e?.data?.detail) ? e.data.detail.map((d) => d.msg).join(" ") : e?.data?.detail) || e?.message || "Une erreur est survenue.";
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmt = (v) => (v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toFixed(4));

function Row({ id, r, onSave, maxPct }) {
  const [from, to] = id.split(">");
  const [send, setSend] = useState(r.send), [wd, setWd] = useState(r.withdraw);
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  useEffect(() => { setSend(r.send); setWd(r.withdraw); }, [r.send, r.withdraw]);
  const dev = (v) => (r.market ? ((num(v) - r.market) / r.market) * 100 : 0);
  const run = async (body) => { setBusy(true); setErr(""); try { await onSave({ from_country: from, to_country: to, ...body }); } catch (e) { setErr(msgOf(e)); } finally { setBusy(false); } };
  const bad = (v) => Math.abs(dev(v)) > maxPct;
  const field = (label, val, set, custom) => (
    <label className="text-sm block">
      <span className="flex items-center gap-2">{label}{custom && <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-[#8a6a1f]">fixé</span>}</span>
      <div className="mt-1 flex items-center gap-2">
        <input type="number" step="any" min="0" value={val} onChange={(e) => set(e.target.value)} className={`w-full rounded-xl border bg-surface px-3 py-2.5 tabular-nums ${bad(val) ? "border-red-400" : "border-line"}`} />
      </div>
      <span className={`text-xs ${bad(val) ? "text-red-600" : "text-ink-faint"}`}>{dev(val) >= 0 ? "+" : ""}{dev(val).toFixed(1)} % vs marché (max ±{maxPct} %)</span>
    </label>
  );
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="font-display text-lg flex items-center gap-2">{FLAG[from]} {from} <ArrowRight size={16} className="text-ink-faint" /> {FLAG[to]} {to}</p>
      <p className="text-xs text-ink-faint mt-1">1 {r.send_currency} = <b className="text-ink">{fmt(r.market)}</b> {r.receive_currency} au taux du marché</p>
      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        {field("Taux d'envoi (Envoyer)", send, setSend, r.send_custom)}
        {field("Taux de retrait (Demander)", wd, setWd, r.withdraw_custom)}
      </div>
      {err && <p role="alert" className="text-sm text-red-600 mt-3">{err}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={busy || bad(send) || bad(wd)} onClick={() => run({ send_rate: num(send), withdraw_rate: num(wd) })} className="rounded-full bg-ink text-cream text-sm font-medium px-5 py-2.5 disabled:opacity-40 inline-flex items-center gap-2">{busy && <Loader2 size={14} className="animate-spin" />}Enregistrer</button>
        <button disabled={busy || !(r.send_custom || r.withdraw_custom)} onClick={() => run({ reset: true })} className="rounded-full border border-line text-sm px-4 py-2.5 inline-flex items-center gap-2 disabled:opacity-40"><RotateCcw size={13} />Taux du marché</button>
      </div>
    </div>
  );
}

/** Taux d'envoi (opération « Envoyer ») et de retrait (opération « Demander »), pour chaque sens. */
export default function CorridorRates({ load, save, maxPct = 25 }) {
  const [rates, setRates] = useState(null), [err, setErr] = useState("");
  const refresh = useCallback(async () => { try { setRates(await load()); setErr(""); } catch (e) { if (e?.status !== 428) setErr(msgOf(e)); setRates({}); } }, [load]);
  useEffect(() => { refresh(); }, [refresh]);
  if (!rates) return <Loader2 className="animate-spin text-ink-faint" />;
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-xl">Taux d'envoi et de retrait</h2>
        <p className="text-sm text-ink-soft mt-1">Chaque sens a deux taux : celui de l'envoi (le payeur envoie, le bénéficiaire reçoit) et celui du retrait (une demande : le demandeur retire dans son pays). Valeur affichée = unités reçues pour 1 unité payée. Vide ou « Taux du marché » = taux de change courant moins la marge.</p>
      </div>
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      <div className="grid lg:grid-cols-2 gap-4">
        {Object.entries(rates).map(([id, r]) => <Row key={id} id={id} r={r} maxPct={maxPct} onSave={async (b) => { await save(b); await refresh(); }} />)}
      </div>
    </section>
  );
}
