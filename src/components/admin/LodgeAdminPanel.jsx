import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, AlertCircle, Save, ExternalLink } from "lucide-react";

const inputCls = "w-full rounded-xl border border-line bg-cream px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-coffee";
const btn = "rounded-lg px-3.5 py-2 text-xs font-medium transition-colors disabled:opacity-50";
const TABS = [["overview", "Vue d'ensemble"], ["properties", "Annonces"], ["bookings", "Réservations & litiges"], ["hosts", "Hôtes"], ["payouts", "Retraits"], ["reviews", "Avis"], ["settings", "Réglages"]];
const BOOKING_LABEL = { pending_host: "Attente hôte", confirmed: "Confirmée", checked_in: "En cours", completed: "Terminée", declined: "Refusée", expired: "Expirée", cancelled_guest: "Annulée voyageur", cancelled_host: "Annulée hôte", disputed: "Litige" };
const PROP_LABEL = { draft: "Brouillon", pending: "À valider", active: "En ligne", paused: "En pause", rejected: "Refusée", suspended: "Suspendue" };
const SETTING_LABEL = {
  commission_rate: "Commission H-Company (%)", host_response_hours: "Délai de réponse de l'hôte (h)", auto_release_hours: "Libération des fonds après l'arrivée (h)",
  dispute_window_hours: "Fenêtre de litige après l'arrivée (h)", min_payout: "Retrait minimum (ZMW)", max_advance_days: "Réservation possible jusqu'à (jours)",
};
const fmt = (n) => `${Number(n || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ZMW`;
const fdate = (v) => new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const msgOf = (e) => e?.data?.detail || e?.message || "Une erreur est survenue.";

function Pill({ children, tone = "info" }) {
  const cls = { ok: "bg-emerald-50 text-emerald-700 border-emerald-200", wait: "bg-amber-50 text-amber-700 border-amber-200", bad: "bg-red-50 text-red-700 border-red-200", info: "bg-latte-soft text-coffee-dark border-latte-light" }[tone];
  return <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${cls}`}>{children}</span>;
}
const propTone = (s) => (s === "active" ? "ok" : s === "pending" ? "wait" : ["rejected", "suspended"].includes(s) ? "bad" : "info");
const bookTone = (s) => (["completed", "confirmed", "checked_in"].includes(s) ? "ok" : s === "pending_host" ? "wait" : ["disputed", "declined", "expired", "cancelled_guest", "cancelled_host"].includes(s) ? "bad" : "info");
function Box({ children, className = "" }) { return <div className={`bg-surface border border-line rounded-2xl p-5 ${className}`}>{children}</div>; }
function Err({ msg }) { return msg ? <p role="alert" className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5"><AlertCircle size={15} /> {msg}</p> : null; }
function Filters({ options, value, onChange }) {
  return <div className="flex gap-2 flex-wrap">{options.map(([k, l]) => <button key={k || "all"} onClick={() => onChange(k)} className={`${btn} border ${value === k ? "bg-ink text-cream border-ink" : "border-line text-ink-soft"}`}>{l}</button>)}</div>;
}

function PropertyRow({ p, busy, onAct }) {
  const [reason, setReason] = useState("");
  const needsReason = (s) => ["rejected", "suspended"].includes(s);
  return (
    <Box>
      <div className="flex flex-wrap justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">{p.title} <Pill tone={propTone(p.status)}>{PROP_LABEL[p.status] || p.status}</Pill>{p.is_featured && <span className="ml-2"><Pill>★ Mis en avant</Pill></span>}</p>
          <p className="text-xs text-ink-soft mt-1">{p.type} · {p.city}{p.area ? `, ${p.area}` : ""} · {fmt(p.price_per_night)}/nuit · {p.gallery?.length || 0} photo(s) · hôte : {p.host?.display_name} {p.host_email ? `(${p.host_email})` : ""}</p>
          {p.description && <p className="text-xs text-ink-faint mt-2 line-clamp-3">{p.description}</p>}
          {p.status_reason && <p className="text-xs text-red-700 mt-2">Motif : {p.status_reason}</p>}
        </div>
        <a href={`/logement/s/${p.slug}`} target="_blank" rel="noreferrer" className="text-xs text-coffee inline-flex items-center gap-1 h-fit"><ExternalLink size={12} /> Voir</a>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-4">
        {p.status === "pending" && <button disabled={busy} className={`${btn} bg-emerald-600 text-white`} onClick={() => onAct({ status: "active" })}>Approuver</button>}
        {p.status === "pending" && <button disabled={busy || reason.trim().length < 3} className={`${btn} bg-red-600 text-white`} onClick={() => onAct({ status: "rejected", reason })}>Demander des corrections</button>}
        {p.status === "active" && <button disabled={busy || reason.trim().length < 3} className={`${btn} bg-red-600 text-white`} onClick={() => onAct({ status: "suspended", reason })}>Suspendre</button>}
        {p.status === "suspended" && <button disabled={busy} className={`${btn} bg-emerald-600 text-white`} onClick={() => onAct({ status: "active" })}>Réactiver</button>}
        {["pending", "active"].includes(p.status) && <input className={`${inputCls} !w-64`} placeholder="Motif (obligatoire pour refuser/suspendre)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motif" />}
        {p.status === "active" && <button disabled={busy} className={`${btn} border border-line text-ink`} onClick={() => onAct({ status: "active", is_featured: !p.is_featured })}>{p.is_featured ? "Retirer la mise en avant" : "Mettre en avant"}</button>}
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
          <p className="text-xs text-ink-soft mt-1">{b.property.title} · {fdate(b.check_in)} → {fdate(b.check_out)} · {b.nights} nuit(s)</p>
          <p className="text-xs text-ink-soft">Voyageur : {b.guest_name} {b.guest_email ? `· ${b.guest_email}` : ""} {b.guest_phone ? `· ${b.guest_phone}` : ""} · Hôte : {b.host_display}</p>
        </div>
        <div className="text-right"><p className="font-display text-xl text-ink">{fmt(b.total)}</p><p className="text-xs text-ink-faint">Commission {fmt(b.commission_amount)} · Hôte {fmt(b.host_net)}</p><p className="text-xs text-ink-faint">Séquestre : {b.escrow_status}</p></div>
      </div>
      {b.status === "disputed" && (
        <div className="mt-4 border-t border-line pt-4 space-y-3">
          <p className="text-sm text-red-700"><strong>Litige :</strong> {b.dispute_reason}</p>
          {b.dispute_note && <p className="text-sm text-ink-soft whitespace-pre-line">{b.dispute_note}</p>}
          <div className="flex flex-wrap gap-2 items-center">
            <input className={`${inputCls} !w-56`} placeholder="Note de décision" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note de décision" />
            <input className={`${inputCls} !w-40`} type="number" min="0" max={b.total} step="any" placeholder="Remb. partiel (ZMW)" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Remboursement partiel" />
            <button disabled={busy} className={`${btn} bg-ink text-cream`} onClick={() => onResolve({ action: "refund", refund_amount: amount === "" ? null : Number(amount), note })}>{amount === "" ? "Rembourser le voyageur" : "Rembourser partiellement"}</button>
            <button disabled={busy} className={`${btn} border border-line text-ink`} onClick={() => onResolve({ action: "release", note })}>Verser à l'hôte</button>
          </div>
        </div>
      )}
    </Box>
  );
}

export default function LodgeAdminPanel({ withAuth, api, onCount }) {
  const A = api.lodge.admin;
  const [tab, setTab] = useState("overview");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState(null);
  const [props, setProps] = useState([]);
  const [propFilter, setPropFilter] = useState("pending");
  const [bookings, setBookings] = useState([]);
  const [bookFilter, setBookFilter] = useState("disputed");
  const [hosts, setHosts] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [payFilter, setPayFilter] = useState("requested");
  const [reviews, setReviews] = useState([]);
  const [settings, setSettings] = useState(null);
  const [commissionDraft, setCommissionDraft] = useState({});
  const [busy, setBusy] = useState("");
  const [tick, setTick] = useState(0);

  const guard = useCallback(async (fn) => {
    setError(""); setLoading(true);
    try { return (await withAuth(fn)) ?? true; } catch (e) { setError(msgOf(e)); return null; } finally { setLoading(false); }
  }, [withAuth]);

  const loadOverview = useCallback(async () => {
    const o = await guard((t) => A.overview(t));
    if (o) { setOverview(o); onCount?.(o.properties_pending + o.disputes_open + o.payouts_pending); }
  }, [guard, A, onCount]);
  useEffect(() => { loadOverview(); }, [loadOverview]);

  useEffect(() => {
    if (tab === "properties") guard((t) => A.properties(t, propFilter || undefined)).then((d) => d && setProps(d));
    if (tab === "bookings") guard((t) => A.bookings(t, bookFilter || undefined)).then((d) => d && setBookings(d));
    if (tab === "hosts") guard((t) => A.hosts(t)).then((d) => d && setHosts(d));
    if (tab === "payouts") guard((t) => A.payouts(t, payFilter || undefined)).then((d) => d && setPayouts(d));
    if (tab === "reviews") guard((t) => A.reviews(t)).then((d) => d && setReviews(d));
    if (tab === "settings") guard((t) => A.settings(t)).then((d) => d && setSettings(d));
  }, [tab, propFilter, bookFilter, payFilter, tick, guard, A]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => { loadOverview(); setTick((n) => n + 1); };
  async function act(key, fn) {
    setBusy(key);
    const r = await guard(fn);
    setBusy("");
    if (r !== null) refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-line">
        {TABS.map(([k, l]) => {
          const n = k === "properties" ? overview?.properties_pending : k === "bookings" ? overview?.disputes_open : k === "payouts" ? overview?.payouts_pending : 0;
          return <button key={k} onClick={() => setTab(k)} aria-selected={tab === k} role="tab" className={`whitespace-nowrap px-3.5 py-3 text-sm border-b-2 -mb-px ${tab === k ? "border-coffee text-ink font-medium" : "border-transparent text-ink-soft hover:text-ink"}`}>{l}{n > 0 && <span className="ml-1.5 rounded-md bg-latte px-1.5 text-[11px] font-semibold text-ink-fixed">{n}</span>}</button>;
        })}
        <button onClick={refresh} aria-label="Actualiser" className="ml-auto p-2 text-ink-soft hover:text-ink">{loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}</button>
      </div>
      <Err msg={error} />

      {tab === "overview" && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[["Volume d'affaires", fmt(overview.gmv)], ["Commissions encaissées", fmt(overview.commission)], ["Fonds sous séquestre", fmt(overview.escrow_held)], ["Réservations payées", overview.bookings],
              ["Annonces à valider", overview.properties_pending], ["Annonces en ligne", overview.properties_active], ["Hôtes", overview.hosts], ["Litiges ouverts", overview.disputes_open]].map(([l, v]) => (
              <Box key={l}><p className="text-xs text-ink-faint">{l}</p><p className="font-display text-2xl text-ink mt-1">{v}</p></Box>
            ))}
          </div>
          <Box><h3 className="text-sm font-medium text-ink mb-3">Réservations par statut</h3><div className="flex flex-wrap gap-2">{Object.entries(overview.by_status).map(([k, v]) => <Pill key={k} tone={bookTone(k)}>{BOOKING_LABEL[k] || k} · {v}</Pill>)}</div></Box>
          <p className="text-xs text-ink-faint">Retraits à traiter : {overview.payouts_pending}. Les virements mobile money sont effectués manuellement puis marqués « payé » dans l'onglet Retraits.</p>
        </div>
      )}

      {tab === "properties" && (
        <div className="space-y-4">
          <Filters value={propFilter} onChange={setPropFilter} options={[["pending", "À valider"], ["active", "En ligne"], ["suspended", "Suspendues"], ["rejected", "Refusées"], ["paused", "En pause"], ["draft", "Brouillons"], ["", "Toutes"]]} />
          {!props.length && <p className="text-sm text-ink-faint">Aucune annonce.</p>}
          {props.map((p) => <PropertyRow key={p.id} p={p} busy={busy === `p${p.id}`} onAct={(body) => act(`p${p.id}`, (t) => A.updateProperty(t, p.id, body))} />)}
        </div>
      )}

      {tab === "bookings" && (
        <div className="space-y-4">
          <Filters value={bookFilter} onChange={setBookFilter} options={[["disputed", "Litiges"], ["pending_host", "Attente hôte"], ["confirmed", "Confirmées"], ["checked_in", "En cours"], ["completed", "Terminées"], ["", "Toutes"]]} />
          {!bookings.length && <p className="text-sm text-ink-faint">Aucune réservation.</p>}
          {bookings.map((b) => <BookingRow key={b.code} b={b} busy={busy === `b${b.code}`} onResolve={(body) => act(`b${b.code}`, (t) => A.resolve(t, b.code, body))} />)}
        </div>
      )}

      {tab === "hosts" && (
        <div className="space-y-3">
          {!hosts.length && <p className="text-sm text-ink-faint">Aucun hôte.</p>}
          {hosts.map((h) => (
            <Box key={h.id} className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-medium text-ink">{h.display_name} {h.is_verified ? <Pill tone="ok">Vérifié</Pill> : <Pill tone="wait">Non vérifié</Pill>} {h.partner_name && <Pill>{h.partner_name}</Pill>}</p>
                <p className="text-xs text-ink-soft mt-1">{h.user_email} · {h.phone || h.whatsapp || "—"} · {h.properties_count} annonce(s) · {h.bookings_count} réservation(s) · {fmt(h.revenue)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button disabled={busy === `h${h.id}`} className={`${btn} border border-line text-ink`} onClick={() => act(`h${h.id}`, (t) => A.updateHost(t, h.id, { is_verified: !h.is_verified }))}>{h.is_verified ? "Retirer la vérification" : "Vérifier"}</button>
                <input className={`${inputCls} !w-28`} type="number" min="0" max="60" step="any" placeholder={h.commission_rate != null ? `${h.commission_rate} %` : "Défaut"} value={commissionDraft[h.id] ?? ""} onChange={(e) => setCommissionDraft((s) => ({ ...s, [h.id]: e.target.value }))} aria-label="Commission spécifique (%)" />
                <button disabled={commissionDraft[h.id] === undefined || commissionDraft[h.id] === "" || busy === `h${h.id}`} className={`${btn} bg-ink text-cream`} onClick={() => act(`h${h.id}`, (t) => A.updateHost(t, h.id, { commission_rate: Number(commissionDraft[h.id]) }).then((r) => { setCommissionDraft((s) => ({ ...s, [h.id]: undefined })); return r; }))}>Appliquer</button>
                {h.commission_rate != null && <button className={`${btn} border border-line text-ink-soft`} onClick={() => act(`h${h.id}`, (t) => A.updateHost(t, h.id, { clear_commission: true }))}>Taux par défaut</button>}
              </div>
            </Box>
          ))}
        </div>
      )}

      {tab === "payouts" && (
        <div className="space-y-4">
          <Filters value={payFilter} onChange={setPayFilter} options={[["requested", "À payer"], ["paid", "Payés"], ["rejected", "Refusés"], ["", "Tous"]]} />
          {!payouts.length && <p className="text-sm text-ink-faint">Aucun retrait.</p>}
          {payouts.map((p) => (
            <Box key={p.id} className="flex flex-wrap items-center gap-4 justify-between">
              <div><p className="font-medium text-ink">{fmt(p.amount)} <span className="text-ink-faint font-normal text-xs">· {p.host_name}</span></p><p className="text-xs text-ink-soft mt-0.5">{p.operator} · <span className="font-mono">{p.phone}</span> · {p.reference} · {fdate(p.created_at)}</p></div>
              {p.status === "requested" ? (
                <div className="flex gap-2">
                  <button disabled={busy === `y${p.id}`} className={`${btn} bg-emerald-600 text-white`} onClick={() => act(`y${p.id}`, (t) => A.updatePayout(t, p.id, "paid"))}>Marquer payé</button>
                  <button disabled={busy === `y${p.id}`} className={`${btn} border border-line text-red-700`} onClick={() => { const n = window.prompt("Motif du refus ?"); if (n) act(`y${p.id}`, (t) => A.updatePayout(t, p.id, "rejected", n)); }}>Refuser</button>
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
              <div className="min-w-0 flex-1"><p className="text-sm text-ink">{"★".repeat(r.rating)}<span className="text-ink-faint">{"★".repeat(5 - r.rating)}</span> · {r.author_name} <span className="text-ink-faint text-xs">sur {r.property_title}</span> {r.is_hidden && <Pill tone="bad">Masqué</Pill>}</p><p className="text-sm text-ink-soft mt-1 whitespace-pre-line">{r.comment}</p></div>
              <button disabled={busy === `r${r.id}`} className={`${btn} border border-line text-ink`} onClick={() => act(`r${r.id}`, (t) => A.moderateReview(t, r.id, !r.is_hidden))}>{r.is_hidden ? "Réafficher" : "Masquer"}</button>
            </Box>
          ))}
        </div>
      )}

      {tab === "settings" && settings && (
        <Box className="max-w-xl">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); act("settings", (t) => A.saveSettings(t, Object.fromEntries(Object.keys(SETTING_LABEL).map((k) => [k, String(settings[k])])))); }}>
            {Object.entries(SETTING_LABEL).map(([k, label]) => (
              <div key={k}><label className="block text-sm text-ink mb-1.5" htmlFor={`s-${k}`}>{label}</label><input id={`s-${k}`} type="number" min="0" step="any" className={inputCls} value={settings[k] ?? ""} onChange={(e) => setSettings((s) => ({ ...s, [k]: e.target.value }))} /></div>
            ))}
            <button disabled={busy === "settings"} className={`${btn} bg-ink text-cream inline-flex items-center gap-2`}><Save size={14} /> Enregistrer</button>
          </form>
        </Box>
      )}
    </div>
  );
}
