import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";

export const FLAG = { ZM: "🇿🇲", CD: "🇨🇩" };
export const COUNTRY = { ZM: { fr: "Zambie", en: "Zambia" }, CD: { fr: "RD Congo", en: "DR Congo" } };
export const input = "w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-coffee focus:ring-2 focus:ring-coffee/15";
export const msgOf = (e) => e?.data?.detail || e?.message || "Une erreur est survenue.";
export const nf = (n, cur) => `${Number(n || 0).toLocaleString("fr-FR", { maximumFractionDigits: cur === "CDF" ? 0 : 2, minimumFractionDigits: 0 })} ${cur || ""}`.trim();

export function useCorridors() {
  const [d, setD] = useState(null);
  useEffect(() => { api.money.corridors().then(setD).catch(() => setD(false)); }, []);
  return d;
}

/** Devis en direct (anti-rebond 350 ms). mode=send : « j'envoie X » ; mode=receive : « il doit recevoir X ». */
export function useQuote({ amount, from, to, mode = "send", withFee = true, payOp = "", benOp = "" }) {
  const [q, setQ] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    const n = Number(amount);
    if (!n || n <= 0) { setQ(null); setErr(""); return undefined; }
    const id = setTimeout(() => {
      api.money.quote({ amount: n, from, to, mode, ...(mode === "send" ? { with_fee: withFee } : {}), ...(payOp ? { pay_op: payOp } : {}), ...(benOp ? { ben_op: benOp } : {}) }).then((r) => { setQ(r); setErr(""); }).catch((e) => { setQ(null); setErr(msgOf(e)); });
    }, 350);
    return () => clearTimeout(id);
  }, [amount, from, to, mode, withFee, payOp, benOp]);
  return { q, err };
}

/** Pour chaque opérateur de réception : frais et montant reçu (sélecteur d'opérateur). */
export function useCompare({ amount, from, to, withFee = true, payOp = "" }) {
  const [rows, setRows] = useState({});
  useEffect(() => {
    const n = Number(amount);
    if (!n || n <= 0) { setRows({}); return undefined; }
    const id = setTimeout(() => {
      api.money.compare({ amount: n, from, to, with_fee: withFee, ...(payOp ? { pay_op: payOp } : {}) }).then((r) => setRows(Object.fromEntries(r.map((x) => [x.operator, x])))).catch(() => setRows({}));
    }, 400);
    return () => clearTimeout(id);
  }, [amount, from, to, withFee, payOp]);
  return rows;
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink-faint mt-1">{hint}</span>}
    </label>
  );
}

const TONE = { completed: "bg-emerald-50 text-emerald-700 border-emerald-200", awaiting_payer: "bg-amber-50 text-amber-700 border-amber-200", under_review: "bg-violet-50 text-violet-700 border-violet-200", rejected: "bg-red-50 text-red-700 border-red-200", refunded: "bg-sky-50 text-sky-700 border-sky-200", cancelled: "bg-red-50 text-red-700 border-red-200", declined: "bg-red-50 text-red-700 border-red-200", expired: "bg-stone-100 text-stone-600 border-stone-200" };
const LABEL = { under_review: "En contrôle", rejected: "Refusé après contrôle", completed: "Terminé", awaiting_payer: "En attente de paiement", refunded: "Remboursé", cancelled: "Annulé", declined: "Refusé", expired: "Expiré", collected: "En cours", created: "En cours" };
export function StatusPill({ status }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${TONE[status] || "bg-latte-soft text-coffee-dark border-latte"}`}>{LABEL[status] || status}</span>;
}

/** Bandeau honnête : tant qu'aucun agrégateur n'est branché, aucun argent ne circule. */
export function SimulationBanner({ show }) {
  if (!show) return null;
  return <p role="note" className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 leading-relaxed"><strong>Mode démonstration.</strong> Aucun argent réel n'est encaissé ni versé tant que le partenaire de paiement n'est pas branché.</p>;
}
