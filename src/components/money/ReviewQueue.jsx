import { useState } from "react";
import { ArrowRight, Check, Loader2, ShieldAlert, X } from "lucide-react";
import { nf } from "./parts.jsx";

const FLAG = { ZM: "🇿🇲", CD: "🇨🇩" };
const msgOf = (e) => e?.data?.detail || e?.message || "Action impossible.";

/** File des opérations « under_review » : l'argent du payeur est gardé ; confirmer = verser le bénéficiaire, refuser = rembourser. */
export default function ReviewQueue({ rows, onDecide }) {
  const [busy, setBusy] = useState(""), [err, setErr] = useState("");
  const pending = (rows || []).filter((t) => t.status === "under_review");
  async function act(t, approve) {
    let reason = "";
    if (!approve) { reason = window.prompt("Motif du refus (le payeur sera remboursé) ?") || ""; if (!reason.trim()) return; }
    else if (!window.confirm(`Confirmer ${t.code} et verser ${nf(t.receive_amount, t.receive_currency)} à ${t.counterpart_name} ?`)) return;
    setBusy(t.code); setErr("");
    try { await onDecide(t.code, approve, reason); } catch (e) { setErr(msgOf(e)); } finally { setBusy(""); }
  }
  return (
    <section aria-label="Opérations à contrôler" className="rounded-3xl border border-violet-200 bg-violet-50/60 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg flex items-center gap-2 text-violet-900"><ShieldAlert size={18} />À contrôler <span className="text-sm font-sans rounded-full bg-violet-200 text-violet-900 px-2.5 py-0.5">{pending.length}</span></h2>
        <p className="text-xs text-violet-800/70 hidden sm:block">L'argent est gardé tant que vous n'avez pas décidé.</p>
      </div>
      {err && <p role="alert" className="text-sm text-red-600 mt-3">{err}</p>}
      {!pending.length ? <p className="text-sm text-violet-900/70 mt-3">Rien à contrôler pour le moment.</p> : (
        <ul className="mt-4 grid gap-3">
          {pending.map((t) => (
            <li key={t.code} className="rounded-2xl bg-surface border border-line p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink flex items-center gap-2">{t.code} · {FLAG[t.from_country]} <ArrowRight size={13} className="text-ink-faint" /> {FLAG[t.to_country]}</p>
                <p className="text-sm text-ink-soft mt-0.5">Payé <b>{nf(t.total_paid, t.send_currency)}</b> → <b>{t.counterpart_name}</b> reçoit <b>{nf(t.receive_amount, t.receive_currency)}</b></p>
                <p className="text-xs text-ink-faint mt-0.5">{t.counterpart_phone} · {t.counterpart_operator}{t.note ? ` · « ${t.note} »` : ""}{t.flagged ? " · 🚩 signalée" : ""}</p>
              </div>
              <div className="flex gap-2">
                <button disabled={!!busy} onClick={() => act(t, true)} className="rounded-full bg-emerald-600 text-white text-sm font-medium px-4 py-2 inline-flex items-center gap-1.5 disabled:opacity-50">{busy === t.code ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Confirmer</button>
                <button disabled={!!busy} onClick={() => act(t, false)} className="rounded-full border border-line text-sm px-4 py-2 inline-flex items-center gap-1.5 disabled:opacity-50"><X size={14} />Refuser</button>
              </div>
            </li>))}
        </ul>)}
    </section>
  );
}
