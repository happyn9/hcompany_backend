import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, AlertCircle, Save } from "lucide-react";

const inputCls = "w-full rounded-xl border border-line bg-cream px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-coffee";
const btn = "rounded-lg px-3.5 py-2 text-xs font-medium transition-colors disabled:opacity-50";
const TABS = [["overview", "Vue d'ensemble"], ["operators", "Agences"], ["trips", "Départs"], ["bookings", "Réservations & litiges"], ["payouts", "Retraits"], ["reviews", "Avis"], ["settings", "Réglages"]];
const BOOKING_LABEL = { confirmed: "Confirmée", boarded: "Embarquée", completed: "Terminée", expired: "Expirée", cancelled_user: "Annulée voyageur", cancelled_operator: "Annulée agence", disputed: "Litige", pending_payment: "Paiement en cours" };
const OP_LABEL = { pending: "À valider", approved: "Validée", rejected: "Refusée", suspended: "Suspendue" };
const TRIP_LABEL = { scheduled: "Programmé", departed: "En route", completed: "Terminé", cancelled: "Annulé" };
const SETTING_LABEL = {
  commission_rate: "Commission par défaut (%)", free_cancel_hours: "Annulation gratuite jusqu'à (h avant départ)", partial_cancel_hours: "Remboursement 50 % jusqu'à (h avant départ)",
  sales_close_minutes: "Fermeture des ventes (min avant départ)", release_hours: "Libération des fonds (h après départ)", max_seats_per_booking: "Passagers max par réservation",
  max_advance_days: "Réservation possible jusqu'à (jours)", hold_minutes: "Garde d'un siège pendant le paiement (min)", min_payout: "Retrait minimum (ZMW)",
};
const fmt = (n) => `${Number(n || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ZMW`;
const fdt = (v) => (v ? `${new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })} ${String(v).slice(11, 16)}` : "");
const msgOf = (e) => (typeof e?.data?.detail === "string" ? e.data.detail : e?.message || "Une erreur est survenue.");

function Pill({ children, tone = "info" }) {
  const cls = { ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", wait: "bg-amber-500/10 text-amber-700 dark:text-amber-300", bad: "bg-red-500/10 text-red-700 dark:text-red-300", info: "bg-latte-soft text-coffee" }[tone];
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${cls}`}>{children}</span>;
}
const bookTone = (s) => (["completed", "confirmed", "boarded"].includes(s) ? "ok" : s === "pending_payment" ? "wait" : "bad");
const opTone = (s) => (s === "approved" ? "ok" : s === "pending" ? "wait" : "bad");
function Box({ children, className = "" }) { return <div className={`bg-surface border border-line rounded-2xl p-5 ${className}`}>{children}</div>; }
function Err({ msg }) { return msg ? <p role="alert" className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300 bg-red-500/10 rounded-xl px-3.5 py-2.5"><AlertCircle size={15} /> {msg}</p> : null; }
function Filters({ options, value, onChange }) {
  return <div className="flex gap-2 flex-wrap">{options.map(([k, l]) => <button key={k || "all"} onClick={() => onChange(k)} className={`${btn} border ${value === k ? "bg-ink text-cream border-ink" : "border-line text-ink-soft"}`}>{l}</button>)}</div>;
}

function OperatorRow({ o, busy, onAct }) {
  const [reason, setReason] = useState("");
  const [rate, setRate] = useState("");
  return (
    <Box>
      <p className="font-medium text-ink">{o.name} <Pill tone={opTone(o.status)}>{OP_LABEL[o.status]}</Pill> {o.is_verified && <Pill tone="ok">Vérifiée</Pill>}</p>
      <p className="text-xs text-ink-soft mt-1">{o.email} · {o.phone || "—"}{o.whatsapp ? ` · WhatsApp ${o.whatsapp}` : ""} · {o.city || "—"} · {o.trips_count} départ(s) · {o.bookings_count} réservation(s) · commission {o.commission_rate} %</p>
      {o.description && <p className="text-xs text-ink-faint mt-2 line-clamp-3">{o.description}</p>}
      {o.mobile_money_phone && <p className="text-xs text-ink-faint mt-1">Mobile money : {o.mobile_money_operator} {o.mobile_money_phone}</p>}
      {o.status_reason && <p className="text-xs text-red-700 dark:text-red-300 mt-2">Motif : {o.status_reason}</p>}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        {["pending", "suspended", "rejected"].includes(o.status) && <button disabled={busy} className={`${btn} bg-emerald-600 text-white`} onClick={() => onAct({ status: "approved" })}>{o.status === "pending" ? "Valider" : "Réactiver"}</button>}
        {o.status === "pending" && <button disabled={busy || reason.trim().length < 3} className={`${btn} bg-red-600 text-white`} onClick={() => onAct({ status: "rejected", reason })}>Refuser</button>}
        {o.status === "approved" && <button disabled={busy || reason.trim().length < 3} className={`${btn} bg-red-600 text-white`} onClick={() => onAct({ status: "suspended", reason })}>Suspendre</button>}
        {["pending", "approved"].includes(o.status) && <input className={`${inputCls} !w-64`} placeholder="Motif (pour refuser / suspendre)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motif" />}
        <button disabled={busy} className={`${btn} border border-line text-ink`} onClick={() => onAct({ is_verified: !o.is_verified })}>{o.is_verified ? "Retirer « vérifiée »" : "Marquer vérifiée"}</button>
        <input className={`${inputCls} !w-28`} type="number" min="0" max="60" step="any" placeholder="Commission %" value={rate} onChange={(e) => setRate(e.target.value)} aria-label="Commission spécifique (%)" />
        <button disabled={busy || rate === ""} className={`${btn} bg-ink text-cream`} onClick={() => { onAct({ commission_rate: Number(rate) }); setRate(""); }}>Appliquer</button>
        <button className={`${btn} border border-line text-ink-soft`} onClick={() => onAct({ clear_commission: true })}>Taux par défaut</button>
      </div>
    </Box>
  );
}

function BookingRow({ b, busy, onResolve }) {
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <Box>
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="font-medium text-ink"><span className="font-mono text-sm">{b.code}</span> <Pill tone={bookTone(b.status)}>{BOOKING_LABEL[b.status] || b.status}</Pill></p>
          <p className="text-xs text-ink-soft mt-1">{b.origin} → {b.destination} · {fdt(b.departure_at)} · {b.seats} place(s) · {b.operator_name}</p>
          <p className="text-xs text-ink-soft">Voyageur : {b.contact_name} {b.user_email ? `· ${b.user_email}` : ""} {b.contact_phone ? `· ${b.contact_phone}` : ""}</p>
        </div>
        <div className="text-right"><p className="font-display text-xl text-ink">{fmt(b.total)}</p><p className="text-xs text-ink-faint">Commission {fmt(b.commission_amount)} · Agence {fmt(b.operator_net)}</p><p className="text-xs text-ink-faint">Séquestre : {b.escrow_status}</p></div>
      </div>
      {b.status === "disputed" && (
        <div className="mt-4 border-t border-line pt-4 space-y-3">
          <p className="text-sm text-red-700 dark:text-red-300"><strong>Litige :</strong> {b.dispute_reason}{b.dispute_note ? ` — ${b.dispute_note}` : ""}</p>
          <div className="flex flex-wrap gap-2 items-center">
            <input className={`${inputCls} !w-56`} placeholder="Note de décision" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note de décision" />
            <input className={`${inputCls} !w-44`} type="number" min="0" max={b.total} step="any" placeholder="Remb. partiel (ZMW)" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Remboursement partiel" />
            <button disabled={busy} className={`${btn} bg-ink text-cream`} onClick={() => onResolve({ action: "refund", refund_amount: amount === "" ? null : Number(amount), note })}>{amount === "" ? "Rembourser le voyageur" : "Rembourser partiellement"}</button>
            <button disabled={busy} className={`${btn} border border-line text-ink`} onClick={() => onResolve({ action: "release", note })}>Verser à l'agence</button>
          </div>
        </div>
      )}
    </Box>
  );
}

export default function TransportAdminPanel({ withAuth, api, onCount }) {
  const A = api.transport.admin;
  const [tab, setTab] = useState("overview");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState(null);
  const [ops, setOps] = useState([]);
  const [opFilter, setOpFilter] = useState("pending");
  const [trips, setTrips] = useState([]);
  const [tripFilter, setTripFilter] = useState("scheduled");
  const [bookings, setBookings] = useState([]);
  const [bookFilter, setBookFilter] = useState("disputed");
  const [payouts, setPayouts] = useState([]);
  const [payFilter, setPayFilter] = useState("requested");
  const [reviews, setReviews] = useState([]);
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState("");
  const [tick, setTick] = useState(0);

  const guard = useCallback(async (fn) => {
    setError(""); setLoading(true);
    try { return (await withAuth(fn)) ?? true; } catch (e) { setError(msgOf(e)); return null; } finally { setLoading(false); }
  }, [withAuth]);

  const loadOverview = useCallback(async () => {
    const o = await guard((t) => A.overview(t));
    if (o) { setOverview(o); onCount?.(o.operators_pending + o.disputes_open + o.payouts_pending); }
  }, [guard, A, onCount]);
  useEffect(() => { loadOverview(); }, [loadOverview]);

  useEffect(() => {
    if (tab === "operators") guard((t) => A.operators(t, opFilter || undefined)).then((d) => d && setOps(d));
    if (tab === "trips") guard((t) => A.trips(t, tripFilter || undefined)).then((d) => d && setTrips(d));
    if (tab === "bookings") guard((t) => A.bookings(t, bookFilter || undefined)).then((d) => d && setBookings(d));
    if (tab === "payouts") guard((t) => A.payouts(t, payFilter || undefined)).then((d) => d && setPayouts(d));
    if (tab === "reviews") guard((t) => A.reviews(t)).then((d) => d && setReviews(d));
    if (tab === "settings") guard((t) => A.settings(t)).then((d) => d && setSettings(d));
  }, [tab, opFilter, tripFilter, bookFilter, payFilter, tick, guard, A]);

  const refresh = () => { loadOverview(); setTick((n) => n + 1); };
  async function act(key, fn) {
    setBusy(key);
    const r = await guard(fn);
    setBusy("");
    if (r !== null) refresh();
  }

  return (
    <div className="space-y-6">
      <div role="tablist" className="flex items-center gap-1 overflow-x-auto border-b border-line">
        {TABS.map(([k, l]) => {
          const n = k === "operators" ? overview?.operators_pending : k === "bookings" ? overview?.disputes_open : k === "payouts" ? overview?.payouts_pending : 0;
          return <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`whitespace-nowrap px-3.5 py-3 text-sm border-b-2 -mb-px ${tab === k ? "border-coffee text-ink font-medium" : "border-transparent text-ink-soft hover:text-ink"}`}>{l}{n > 0 && <span className="ml-1.5 rounded-md bg-latte px-1.5 text-[11px] font-semibold text-ink-fixed">{n}</span>}</button>;
        })}
        <button onClick={refresh} aria-label="Actualiser" className="ml-auto p-2 text-ink-soft hover:text-ink">{loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}</button>
      </div>
      <Err msg={error} />

      {tab === "overview" && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[["Volume de ventes", fmt(overview.gmv)], ["Commissions encaissées", fmt(overview.commission)], ["Fonds sous séquestre", fmt(overview.escrow_held)], ["Réservations payées", overview.bookings],
              ["Agences à valider", overview.operators_pending], ["Agences actives", overview.operators_active], ["Départs à venir", overview.trips_upcoming], ["Litiges ouverts", overview.disputes_open]].map(([l, v]) => (
              <Box key={l}><p className="text-xs text-ink-faint">{l}</p><p className="font-display text-2xl text-ink mt-1">{v}</p></Box>
            ))}
          </div>
          <Box><h3 className="text-sm font-medium text-ink mb-3">Réservations par statut</h3><div className="flex flex-wrap gap-2">{Object.entries(overview.by_status).map(([k, v]) => <Pill key={k} tone={bookTone(k)}>{BOOKING_LABEL[k] || k} · {v}</Pill>)}{!Object.keys(overview.by_status).length && <span className="text-sm text-ink-faint">Aucune réservation pour l'instant.</span>}</div></Box>
          <p className="text-xs text-ink-faint">Retraits à traiter : {overview.payouts_pending}. Les virements mobile money sont effectués manuellement puis marqués « payé » dans l'onglet Retraits.</p>
        </div>
      )}

      {tab === "operators" && (
        <div className="space-y-4">
          <Filters value={opFilter} onChange={setOpFilter} options={[["pending", "À valider"], ["approved", "Validées"], ["suspended", "Suspendues"], ["rejected", "Refusées"], ["", "Toutes"]]} />
          {!ops.length && <p className="text-sm text-ink-faint">Aucune agence.</p>}
          {ops.map((o) => <OperatorRow key={o.id} o={o} busy={busy === `o${o.id}`} onAct={(body) => act(`o${o.id}`, (t) => A.updateOperator(t, o.id, body))} />)}
        </div>
      )}

      {tab === "trips" && (
        <div className="space-y-4">
          <Filters value={tripFilter} onChange={setTripFilter} options={[["scheduled", "Programmés"], ["departed", "En route"], ["completed", "Terminés"], ["cancelled", "Annulés"], ["", "Tous"]]} />
          {!trips.length && <p className="text-sm text-ink-faint">Aucun départ.</p>}
          {trips.map((t) => (
            <Box key={t.id} className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-medium text-ink">{t.origin} → {t.destination} <Pill tone={t.status === "scheduled" ? "ok" : t.status === "cancelled" ? "bad" : "info"}>{TRIP_LABEL[t.status]}</Pill></p>
                <p className="text-xs text-ink-soft mt-1">{t.operator.name} · {fdt(t.departure_at)} · {fmt(t.price)} · {t.booked_seats}/{t.seats_total} places · {fmt(t.revenue)}</p>
                {t.cancel_reason && <p className="text-xs text-red-700 dark:text-red-300 mt-1">Motif : {t.cancel_reason}</p>}
              </div>
              {t.status === "scheduled" && <button disabled={busy === `t${t.id}`} className={`${btn} border border-line text-red-700 dark:text-red-300`} onClick={() => { const n = window.prompt("Motif de l'annulation ? Tous les billets payés seront remboursés."); if (n && n.trim().length >= 3) act(`t${t.id}`, (tk) => A.cancelTrip(tk, t.id, n.trim())); }}>Annuler le départ</button>}
            </Box>
          ))}
        </div>
      )}

      {tab === "bookings" && (
        <div className="space-y-4">
          <Filters value={bookFilter} onChange={setBookFilter} options={[["disputed", "Litiges"], ["confirmed", "Confirmées"], ["boarded", "Embarquées"], ["completed", "Terminées"], ["cancelled_operator", "Annulées agence"], ["", "Toutes"]]} />
          {!bookings.length && <p className="text-sm text-ink-faint">Aucune réservation.</p>}
          {bookings.map((b) => <BookingRow key={b.code} b={b} busy={busy === `b${b.code}`} onResolve={(body) => act(`b${b.code}`, (t) => A.resolve(t, b.code, body))} />)}
        </div>
      )}

      {tab === "payouts" && (
        <div className="space-y-4">
          <Filters value={payFilter} onChange={setPayFilter} options={[["requested", "À payer"], ["paid", "Payés"], ["rejected", "Refusés"], ["", "Tous"]]} />
          {!payouts.length && <p className="text-sm text-ink-faint">Aucun retrait.</p>}
          {payouts.map((p) => (
            <Box key={p.id} className="flex flex-wrap items-center gap-4 justify-between">
              <div><p className="font-medium text-ink">{fmt(p.amount)} <span className="text-ink-faint font-normal text-xs">· {p.operator_name}</span></p><p className="text-xs text-ink-soft mt-0.5">{p.operator} · <span className="font-mono">{p.phone}</span> · {p.reference} · {fdt(p.created_at)}</p></div>
              {p.status === "requested" ? (
                <div className="flex gap-2">
                  <button disabled={busy === `y${p.id}`} className={`${btn} bg-emerald-600 text-white`} onClick={() => act(`y${p.id}`, (t) => A.updatePayout(t, p.id, "paid"))}>Marquer payé</button>
                  <button disabled={busy === `y${p.id}`} className={`${btn} border border-line text-red-700 dark:text-red-300`} onClick={() => { const n = window.prompt("Motif du refus ?"); if (n) act(`y${p.id}`, (t) => A.updatePayout(t, p.id, "rejected", n)); }}>Refuser</button>
                </div>
              ) : <Pill tone={p.status === "paid" ? "ok" : "bad"}>{p.status === "paid" ? "Payé" : "Refusé"}</Pill>}
            </Box>
          ))}
        </div>
      )}

      {tab === "reviews" && (
        <div className="space-y-3">
          {!reviews.length && <p className="text-sm text-ink-faint">Aucun avis.</p>}
          {reviews.map((r) => (
            <Box key={r.id} className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1"><p className="text-sm text-ink">{"★".repeat(r.rating)}<span className="text-ink-faint">{"★".repeat(5 - r.rating)}</span> · {r.author_name} <span className="text-ink-faint text-xs">sur {r.operator_name} ({r.route})</span> {r.is_hidden && <Pill tone="bad">Masqué</Pill>}</p><p className="text-sm text-ink-soft mt-1 whitespace-pre-line">{r.comment}</p></div>
              <button disabled={busy === `r${r.id}`} className={`${btn} border border-line text-ink`} onClick={() => act(`r${r.id}`, (t) => A.moderateReview(t, r.id, !r.is_hidden))}>{r.is_hidden ? "Réafficher" : "Masquer"}</button>
            </Box>
          ))}
        </div>
      )}

      {tab === "settings" && settings && (
        <Box className="max-w-xl">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); act("settings", (t) => A.saveSettings(t, Object.fromEntries(Object.keys(SETTING_LABEL).map((k) => [k, String(settings[k])])))); }}>
            {Object.entries(SETTING_LABEL).map(([k, label]) => (
              <div key={k}><label className="block text-sm text-ink mb-1.5" htmlFor={`ts-${k}`}>{label}</label><input id={`ts-${k}`} type="number" min="0" step="any" className={inputCls} value={settings[k] ?? ""} onChange={(e) => setSettings((s) => ({ ...s, [k]: e.target.value }))} /></div>
            ))}
            <button disabled={busy === "settings"} className={`${btn} bg-ink text-cream inline-flex items-center gap-2`}><Save size={14} /> Enregistrer</button>
          </form>
        </Box>
      )}
    </div>
  );
}
