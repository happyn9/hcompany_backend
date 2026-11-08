import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, Star } from "lucide-react";

const btn = "rounded-lg px-3.5 py-2 text-xs font-medium transition-colors disabled:opacity-50";
const LABEL = { draft: "Brouillon", pending: "À valider", active: "En ligne", paused: "En pause", rejected: "Refusé", suspended: "Suspendu" };
const TONE = { active: "bg-emerald-50 text-emerald-700 border-emerald-200", pending: "bg-amber-50 text-amber-700 border-amber-200", rejected: "bg-red-50 text-red-700 border-red-200", suspended: "bg-red-50 text-red-700 border-red-200" };
const msgOf = (e) => e?.data?.detail || e?.message || "Une erreur est survenue.";
const fmt = (n) => `${Number(n || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ZMW`;

function Row({ r, busy, onAct }) {
  const [reason, setReason] = useState("");
  return (
    <div className="bg-surface border border-line rounded-2xl p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">{r.title} <span className={`ml-1 inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${TONE[r.status] || "bg-latte-soft text-coffee-dark border-latte-light"}`}>{LABEL[r.status] || r.status}</span>{r.is_featured && <span className="ml-2 text-[11px] text-coffee-dark inline-flex items-center gap-1"><Star size={11} />À la une</span>}</p>
          <p className="text-xs text-ink-soft mt-1">{r.category} · {r.city} · {r.price_adult} ZMW/adulte · {r.open_departures ?? 0} départ(s) ouvert(s) · {r.images?.length || 0} photo(s)</p>
          <p className="text-xs text-ink-faint mt-1">Propriétaire : {r.owner?.name} ({r.owner?.email}){r.phone ? ` · ${r.phone}` : ""}</p>
          {r.summary && <p className="text-xs text-ink-soft mt-2">{r.summary}</p>}
          {r.status_reason && <p className="text-xs text-red-700 mt-2">Motif : {r.status_reason}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-4">
        {["pending", "rejected", "suspended"].includes(r.status) && <button disabled={busy} onClick={() => onAct(r, "approve")} className={`${btn} bg-ink text-cream`}>Approuver</button>}
        {["pending", "active"].includes(r.status) && <>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif" aria-label="Motif" className="rounded-lg border border-line bg-cream px-3 py-2 text-xs w-48" />
          {r.status === "pending" && <button disabled={busy || !reason.trim()} onClick={() => onAct(r, "reject", reason)} className={`${btn} border border-line text-ink-soft`}>Refuser</button>}
          {r.status === "active" && <button disabled={busy || !reason.trim()} onClick={() => onAct(r, "suspend", reason)} className={`${btn} border border-red-200 text-red-700`}>Suspendre</button>}
        </>}
        {r.status === "active" && <button disabled={busy} onClick={() => onAct(r, "feature")} className={`${btn} border border-line text-ink-soft`}>{r.is_featured ? "Retirer de la une" : "Mettre à la une"}</button>}
      </div>
    </div>
  );
}

export default function TourismAdminPanel({ withAuth, api, onCount }) {
  const [ov, setOv] = useState(null);
  const [list, setList] = useState(null);
  const [status, setStatus] = useState("pending");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const [o, l] = await Promise.all([withAuth((t) => api.tour.admin.overview(t)), withAuth((t) => api.tour.admin.list(t, { status: status || undefined, q: q || undefined }))]);
      setOv(o); setList(l); setErr(""); onCount?.(o.tours?.pending || 0);
    } catch (e) { setErr(msgOf(e)); }
  }, [withAuth, api, status, q, onCount]);
  useEffect(() => { load(); }, [load]);
  async function act(r, what, reason) {
    setBusy(true);
    try { await withAuth((t) => api.tour.admin.decide(t, r.id, what, reason)); await load(); } catch (e) { setErr(msgOf(e)); } finally { setBusy(false); }
  }
  const cards = ov ? [["En ligne", ov.tours?.active || 0], ["À valider", ov.tours?.pending || 0], ["Réservations (30 j)", ov.bookings_30d], ["Voyageurs (30 j)", ov.travellers_30d], ["Absents (30 j)", ov.no_show_30d], ["Valeur (30 j)", fmt(ov.value_30d)]] : [];
  return (
    <div className="space-y-6">
      {err && <p role="alert" className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5"><AlertCircle size={15} />{err}</p>}
      {ov && <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">{cards.map(([l, v]) => <div key={l} className="bg-surface border border-line rounded-2xl p-5"><p className="text-xs text-ink-faint mb-1">{l}</p><p className="font-display text-2xl text-ink">{v}</p></div>)}</div>}
      <div className="flex flex-wrap items-center gap-2">
        {[["pending", "À valider"], ["active", "En ligne"], ["paused", "En pause"], ["suspended", "Suspendus"], ["rejected", "Refusés"], ["draft", "Brouillons"], ["", "Tous"]].map(([k, l]) => <button key={k || "all"} onClick={() => setStatus(k)} className={`${btn} border ${status === k ? "bg-ink text-cream border-ink" : "border-line text-ink-soft"}`}>{l}</button>)}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" aria-label="Rechercher" className="ml-auto rounded-lg border border-line bg-cream px-3 py-2 text-xs" />
      </div>
      {!list ? <p className="flex items-center gap-2 text-sm text-ink-soft"><Loader2 className="animate-spin" size={16} />Chargement…</p> : list.length === 0 ? <p className="text-sm text-ink-soft">Aucune excursion.</p> : <div className="space-y-4">{list.map((r) => <Row key={r.id} r={r} busy={busy} onAct={act} />)}</div>}
    </div>
  );
}
