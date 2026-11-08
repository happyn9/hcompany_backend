import { useEffect, useState } from "react";
import { ArrowDownUp, Info } from "lucide-react";
import { api } from "../../lib/api.js";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { input, nf } from "./parts.jsx";

const CUR = ["ZMW"];

/** Change de monnaie en dollars : USD ⇄ kwacha, et l'inverse. Taux H-Money affiché, aucun frais caché. */
export default function ChangeForm() {
  const { lang } = useLanguage();
  const fr = lang !== "en";
  const [local, setLocal] = useState("ZMW");
  const [usdFirst, setUsdFirst] = useState(true); // true : je donne des dollars
  const [amount, setAmount] = useState("");
  const [q, setQ] = useState(null);
  const [err, setErr] = useState("");
  const from = usdFirst ? "USD" : local, to = usdFirst ? local : "USD";

  useEffect(() => {
    const v = Number(amount);
    if (!v || v <= 0) { setQ(null); setErr(""); return undefined; }
    let on = true;
    const t = setTimeout(() => {
      api.money.change(v, from, to).then((r) => { if (on) { setQ(r); setErr(""); } }).catch((e) => { if (on) { setQ(null); setErr(e?.message || "—"); } });
    }, 250);
    return () => { on = false; clearTimeout(t); };
  }, [amount, from, to]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex-1 rounded-2xl border border-line bg-surface p-4"><p className="text-[11px] uppercase tracking-wider text-ink-faint">{fr ? "Je donne" : "I give"}</p><p className="font-medium text-ink mt-0.5">{usdFirst ? "USD — " + (fr ? "Dollar" : "Dollar") : local}</p></div>
        <button type="button" onClick={() => setUsdFirst((u) => !u)} aria-label={fr ? "Inverser le sens" : "Swap direction"} className="w-11 h-11 rounded-full bg-ink text-cream flex items-center justify-center hover:bg-coffee-dark"><ArrowDownUp size={17} /></button>
        <div className="flex-1 rounded-2xl border border-line bg-surface p-4"><p className="text-[11px] uppercase tracking-wider text-ink-faint">{fr ? "Je reçois" : "I get"}</p><p className="font-medium text-ink mt-0.5">{usdFirst ? local : "USD — " + (fr ? "Dollar" : "Dollar")}</p></div>
      </div>
      <div className="grid sm:grid-cols-[1fr_160px] gap-4">
        <label className="block"><span className="text-xs text-ink-soft">{fr ? `Montant (${from})` : `Amount (${from})`}</span><input type="number" min="0" step="0.01" inputMode="decimal" className={`${input} text-2xl font-display py-4`} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></label>
        <label className="block"><span className="text-xs text-ink-soft">{fr ? "Monnaie locale" : "Local currency"}</span><select className={`${input} py-4`} value={local} onChange={(e) => setLocal(e.target.value)}>{CUR.map((c) => <option key={c}>{c}</option>)}</select></label>
      </div>
      {err && <p role="alert" className="rounded-xl bg-red-500/10 text-red-700 text-sm p-3">{err}</p>}
      <div className="rounded-2xl bg-ink-fixed text-cream-fixed p-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-cream-fixed/50">{fr ? "Vous recevez" : "You receive"}</p>
        <p className="font-display text-4xl mt-1 tabular-nums" style={{ color: "#C89A3D" }}>{q ? nf(q.receive, q.to) : "—"}</p>
        {q && <p className="text-xs text-cream-fixed/60 mt-3">1 {q.from} = {q.rate.toLocaleString(fr ? "fr-FR" : "en-GB", { maximumFractionDigits: 4 })} {q.to} · {fr ? "taux du marché" : "market rate"} {q.mid_rate.toLocaleString(fr ? "fr-FR" : "en-GB", { maximumFractionDigits: 4 })}</p>}
      </div>
      <p className="flex gap-2 text-xs text-ink-faint"><Info size={14} className="shrink-0 mt-0.5" />{fr ? "Taux indicatif H-Money (marge incluse), mis à jour par l'équipe. Pour envoyer de l'argent à quelqu'un, utilisez l'onglet Envoyer ; ici, c'est un simulateur de change." : "Indicative H-Money rate (margin included), updated by the team. To send money to someone use the Send tab; this is a currency-exchange calculator."}</p>
    </div>
  );
}
