import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, MessageCircle, Phone, Send, Star, Wallet } from "lucide-react";
import { EmptyState, ErrorState, LodgeStatusPill, Spinner, useLodgeUi } from "../../components/lodge/Shared.jsx";
import { Card, Field, Modal, inputCls, useHostUi } from "../../components/lodge/HostUi.jsx";
import { errMessage, useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { formatDay, formatRange, todayISO } from "../../lib/lodge.js";

const CANCELLED = ["declined", "expired", "cancelled_guest", "cancelled_host"];

/* ---------- Messagerie d'une réservation ---------- */
function Thread({ code }) {
  const b = useHostUi().bookings;
  const { withAuth } = useUser();
  const [list, setList] = useState(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { withAuth((t) => api.lodge.hosting.messages(t, code)).then(setList).catch(() => setList([])); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  async function send(e) {
    e.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    try { setList(await withAuth((t) => api.lodge.hosting.sendMessage(t, code, body.trim()))); setBody(""); } finally { setBusy(false); }
  }
  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="text-sm font-medium text-ink mb-3 flex items-center gap-2"><MessageCircle size={15} className="text-coffee" /> {b.messages}</p>
      <div className="space-y-2 max-h-60 overflow-y-auto mb-3">
        {list && !list.length && <p className="text-sm text-ink-faint">{b.noMessages}</p>}
        {(list || []).map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : ""}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${m.mine ? "bg-ink text-cream" : "bg-latte-soft text-ink"}`}>
              <p className="whitespace-pre-line">{m.body}</p>
              <p className={`text-[0.65rem] mt-0.5 ${m.mine ? "text-cream/60" : "text-ink-faint"}`}>{m.mine ? b.you : b.guestLabel} · {new Date(m.created_at).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input className={inputCls} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder={b.write} aria-label={b.write} />
        <button disabled={!body.trim() || busy} className="rounded-xl bg-ink text-cream px-4 disabled:opacity-40" aria-label={b.send}><Send size={16} /></button>
      </form>
    </div>
  );
}

/* ---------- Réservations ---------- */
function Bookings() {
  const h = useHostUi();
  const b = h.bookings;
  const ui = useLodgeUi();
  const { lang } = useLanguage();
  const { token, withAuth } = useUser();
  const toast = useToast();
  const { money } = useShopMoney();
  const { data, loading, error, reload } = useLoad(() => api.lodge.hosting.bookings(token), [token]);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null);
  const [modal, setModal] = useState(null); // {kind, code}
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const list = useMemo(() => {
    const rows = data || [];
    const f = rows.filter((x) => filter === "all" || (filter === "cancelled" ? CANCELLED.includes(x.status) : x.status === filter));
    return f.sort((x, y) => (x.status === "pending_host" ? -1 : 0) - (y.status === "pending_host" ? -1 : 0) || y.check_in.localeCompare(x.check_in));
  }, [data, filter]);
  const counts = useMemo(() => {
    const c = { all: (data || []).length };
    Object.keys(b.filters).forEach((k) => { if (k !== "all") c[k] = (data || []).filter((x) => (k === "cancelled" ? CANCELLED.includes(x.status) : x.status === k)).length; });
    return c;
  }, [data, b.filters]);

  async function run(fn, ok) {
    setBusy(true); setFormError("");
    try { await withAuth(fn); toast?.success?.(ok); setModal(null); setReason(""); reload(); } catch (e) { setFormError(errMessage(e, h.common.error)); } finally { setBusy(false); }
  }
  if (loading && !data) return <Spinner label={h.common.loading} />;
  if (error) return <ErrorState onRetry={reload} />;
  return (
    <div>
      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar">
        {Object.entries(b.filters).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} className={`rounded-full border px-4 py-2 text-sm whitespace-nowrap ${filter === k ? "border-coffee bg-latte-soft text-ink" : "border-line text-ink-soft hover:border-coffee-light"}`}>{label} · {counts[k]}</button>
        ))}
      </div>
      {!list.length && <EmptyState icon={Clock} title={b.empty} />}
      <div className="space-y-4">
        {list.map((x) => (
          <Card key={x.code} className="!p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{x.guest_name || "—"} <span className="text-ink-faint font-mono text-xs ml-1">{x.code}</span></p>
                <p className="text-sm text-ink-soft">{x.property.title}</p>
                <p className="text-sm text-ink mt-1">{formatRange(x.check_in, x.check_out, lang)} · {h.common.nights(x.nights)} · {h.common.guests(x.guests)}</p>
              </div>
              <div className="text-right">
                <LodgeStatusPill status={x.status} />
                <p className="font-display text-xl text-ink mt-2">{money(x.host_net || x.total)}</p>
                <p className="text-xs text-ink-faint">{b.net}</p>
              </div>
            </div>
            {x.status === "pending_host" && x.host_deadline && <p className="mt-3 text-xs text-amber-800 dark:text-amber-200 bg-amber-500/10 rounded-lg px-3 py-2 inline-flex items-center gap-2"><Clock size={13} /> {b.respondBefore(new Date(x.host_deadline + "Z").toLocaleString(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</p>}
            {x.status === "disputed" && <p className="mt-3 text-xs text-red-700 dark:text-red-300 bg-red-500/10 rounded-lg px-3 py-2">{b.dispute} : {x.dispute_reason}</p>}
            <div className="flex flex-wrap gap-2 mt-4">
              {x.status === "pending_host" && <>
                <button onClick={() => run((t) => api.lodge.hosting.accept(t, x.code), b.accepted)} disabled={busy} className="rounded-full bg-ink text-cream text-sm font-medium px-5 py-2.5 hover:bg-coffee-dark disabled:opacity-50">{b.accept}</button>
                <button onClick={() => { setModal({ kind: "decline", code: x.code }); setFormError(""); }} className="rounded-full border border-line text-ink text-sm px-5 py-2.5 hover:border-coffee-light">{b.decline}</button>
              </>}
              {["confirmed"].includes(x.status) && x.can_cancel && <button onClick={() => { setModal({ kind: "cancel", code: x.code }); setFormError(""); }} className="rounded-full border border-line text-red-700 dark:text-red-300 text-sm px-5 py-2.5 hover:border-red-500/50">{b.cancel}</button>}
              <button onClick={() => setOpen(open === x.code ? null : x.code)} aria-expanded={open === x.code} className="rounded-full border border-line text-ink text-sm px-5 py-2.5 hover:border-coffee-light">{b.details}</button>
            </div>
            {open === x.code && (
              <div className="mt-4 border-t border-line pt-4 grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <div><p className="text-ink-faint text-xs">{b.guest}</p><p className="text-ink">{x.guest_name}</p>{x.guest_email && <p className="text-ink-soft text-xs">{x.guest_email}</p>}{x.guest_phone && <a href={`tel:${x.guest_phone}`} className="inline-flex items-center gap-1 text-coffee text-xs mt-1"><Phone size={12} /> {x.guest_phone}</a>}</div>
                <div><p className="text-ink-faint text-xs">{b.stay}</p><p className="text-ink">{formatDay(x.check_in, lang, { weekday: "short", day: "numeric", month: "short" })} → {formatDay(x.check_out, lang, { weekday: "short", day: "numeric", month: "short" })}</p>{x.arrival_time && <p className="text-xs text-ink-soft">{b.arrival} : {x.arrival_time}</p>}</div>
                <div><p className="text-ink-faint text-xs">{b.amount}</p><p className="text-ink">{money(x.total)} · {b.commission} {money(x.commission_amount)} ({x.commission_rate}%)</p><p className="text-xs text-ink-soft">{b.escrow[x.escrow_status] || ""}</p></div>
                {x.note && <div><p className="text-ink-faint text-xs">{b.note}</p><p className="text-ink-soft whitespace-pre-line">{x.note}</p></div>}
                {x.cancel_reason && <div className="sm:col-span-2 text-ink-soft">{x.cancel_reason}</div>}
                {["pending_host", "confirmed", "checked_in", "completed", "disputed"].includes(x.status) && <div className="sm:col-span-2"><Thread code={x.code} /></div>}
              </div>
            )}
          </Card>
        ))}
      </div>
      {modal && (
        <Modal title={modal.kind === "decline" ? b.declineTitle : b.cancelTitle} onClose={() => setModal(null)} closeLabel={b.close}>
          <p className="text-sm text-ink-soft mb-4">{modal.kind === "decline" ? b.declineLead : b.cancelLead}</p>
          <Field label={b.reason} htmlFor="hr"><textarea id="hr" rows={3} maxLength={500} className={`${inputCls} resize-none`} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          {formError && <p role="alert" className="text-sm text-red-600 mt-3">{formError}</p>}
          <div className="mt-6 flex gap-3">
            <button onClick={() => setModal(null)} className="flex-1 rounded-full border border-line text-ink text-sm font-medium py-3.5">{h.common.cancel}</button>
            <button disabled={busy || (modal.kind === "cancel" && reason.trim().length < 3)} onClick={() => run((t) => modal.kind === "decline" ? api.lodge.hosting.decline(t, modal.code, reason) : api.lodge.hosting.cancel(t, modal.code, reason || "—"), modal.kind === "decline" ? b.declined : b.cancelled)} className="flex-1 rounded-full bg-red-600 text-white text-sm font-medium py-3.5 disabled:opacity-50">{b.confirm}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------- Calendrier : dates bloquées + prix saisonniers ---------- */
function CalendarTab() {
  const h = useHostUi();
  const c = h.calendar;
  const { lang } = useLanguage();
  const { token, withAuth } = useUser();
  const toast = useToast();
  const { money } = useShopMoney();
  const { data, loading, error, reload } = useLoad(() => api.lodge.hosting.properties(token), [token]);
  const [pid, setPid] = useState(null);
  const [blk, setBlk] = useState({ start_date: todayISO(), end_date: "", reason: "" });
  const [rule, setRule] = useState({ label: "", start_date: todayISO(), end_date: "", price_per_night: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const prop = (data || []).find((p) => p.id === pid) || (data || [])[0];
  useEffect(() => { if (!pid && data && data[0]) setPid(data[0].id); }, [data, pid]);
  async function run(fn, ok, done) {
    setBusy(true); setErr("");
    try { await withAuth(fn); toast?.success?.(ok); done?.(); reload(); } catch (e) { setErr(errMessage(e, h.common.error)); } finally { setBusy(false); }
  }
  if (loading && !data) return <Spinner label={h.common.loading} />;
  if (error) return <ErrorState onRetry={reload} />;
  if (!data.length) return <EmptyState icon={Clock} title={c.none} action={<Link to="/logement/hote/logement/new" className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5">{h.newProperty}</Link>} />;
  const fd = (v) => formatDay(v, lang, { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="space-y-6 max-w-3xl">
      <Field label={c.pick} htmlFor="cp"><select id="cp" className={inputCls} value={prop.id} onChange={(e) => setPid(Number(e.target.value))}>{data.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      <Card>
        <h2 className="font-display text-xl text-ink mb-1">{c.blocksTitle}</h2>
        <p className="text-sm text-ink-soft mb-5">{c.blocksLead}</p>
        <form className="grid sm:grid-cols-[1fr_1fr_1.4fr_auto] gap-3 items-end mb-5" onSubmit={(e) => { e.preventDefault(); run((t) => api.lodge.hosting.addBlock(t, prop.id, blk), c.blocked, () => setBlk({ ...blk, end_date: "", reason: "" })); }}>
          <Field label={c.from} htmlFor="bf"><input id="bf" type="date" required min={todayISO()} className={inputCls} value={blk.start_date} onChange={(e) => setBlk({ ...blk, start_date: e.target.value })} /></Field>
          <Field label={c.to} htmlFor="bt"><input id="bt" type="date" required min={blk.start_date} className={inputCls} value={blk.end_date} onChange={(e) => setBlk({ ...blk, end_date: e.target.value })} /></Field>
          <Field label={c.reason} htmlFor="br"><input id="br" maxLength={120} className={inputCls} value={blk.reason} onChange={(e) => setBlk({ ...blk, reason: e.target.value })} /></Field>
          <button disabled={busy} className="rounded-xl bg-ink text-cream text-sm font-medium px-5 py-3 disabled:opacity-50">{c.block}</button>
        </form>
        {!prop.blocks.length ? <p className="text-sm text-ink-faint">{c.noBlocks}</p> : (
          <ul className="divide-y divide-line">{prop.blocks.map((b) => (
            <li key={b.id} className="py-3 flex items-center justify-between gap-3 text-sm"><span className="text-ink">{c.range(fd(b.start_date), fd(b.end_date))}{b.reason ? <span className="text-ink-faint"> · {b.reason}</span> : null}</span><button onClick={() => run((t) => api.lodge.hosting.removeBlock(t, prop.id, b.id), c.unblock)} className="text-coffee hover:underline shrink-0">{c.unblock}</button></li>
          ))}</ul>
        )}
      </Card>
      <Card>
        <h2 className="font-display text-xl text-ink mb-1">{c.rulesTitle}</h2>
        <p className="text-sm text-ink-soft mb-1">{c.rulesLead}</p>
        <p className="text-xs text-ink-faint mb-5">{c.base(money(prop.price_per_night))}</p>
        <form className="grid sm:grid-cols-2 gap-3 mb-5" onSubmit={(e) => { e.preventDefault(); run((t) => api.lodge.hosting.addRule(t, prop.id, { ...rule, price_per_night: Number(rule.price_per_night) }), c.added, () => setRule({ ...rule, label: "", end_date: "", price_per_night: "" })); }}>
          <Field label={c.label} htmlFor="rl" className="sm:col-span-2"><input id="rl" maxLength={60} className={inputCls} value={rule.label} onChange={(e) => setRule({ ...rule, label: e.target.value })} /></Field>
          <Field label={c.from} htmlFor="rf"><input id="rf" type="date" required min={todayISO()} className={inputCls} value={rule.start_date} onChange={(e) => setRule({ ...rule, start_date: e.target.value })} /></Field>
          <Field label={c.to} htmlFor="rt"><input id="rt" type="date" required min={rule.start_date} className={inputCls} value={rule.end_date} onChange={(e) => setRule({ ...rule, end_date: e.target.value })} /></Field>
          <Field label={c.price} htmlFor="rp"><input id="rp" type="number" required min="1" step="any" className={inputCls} value={rule.price_per_night} onChange={(e) => setRule({ ...rule, price_per_night: e.target.value })} /></Field>
          <div className="flex items-end"><button disabled={busy} className="rounded-xl bg-ink text-cream text-sm font-medium px-6 py-3 disabled:opacity-50">{c.add}</button></div>
        </form>
        {!prop.rules.length ? <p className="text-sm text-ink-faint">{c.noRules}</p> : (
          <ul className="divide-y divide-line">{prop.rules.map((r) => (
            <li key={r.id} className="py-3 flex items-center justify-between gap-3 text-sm"><span className="text-ink">{r.label ? `${r.label} · ` : ""}{c.range(fd(r.start_date), fd(r.end_date))} · <strong>{money(r.price_per_night)}</strong></span><button onClick={() => run((t) => api.lodge.hosting.removeRule(t, prop.id, r.id), c.remove)} className="text-coffee hover:underline shrink-0">{c.remove}</button></li>
          ))}</ul>
        )}
      </Card>
    </div>
  );
}

/* ---------- Revenus ---------- */
function Earnings({ host, go }) {
  const h = useHostUi();
  const e = h.earnings;
  const { lang } = useLanguage();
  const { token, withAuth } = useUser();
  const toast = useToast();
  const { money } = useShopMoney();
  const wallet = useLoad(() => api.lodge.hosting.wallet(token), [token]);
  const payouts = useLoad(() => api.lodge.hosting.payouts(token), [token]);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (wallet.loading && !wallet.data) return <Spinner label={h.common.loading} />;
  if (wallet.error) return <ErrorState onRetry={wallet.reload} />;
  const w = wallet.data;
  const hasMm = !!host.mobile_money_phone && !!host.mobile_money_operator;
  async function request(ev) {
    ev.preventDefault();
    setBusy(true); setErr("");
    try { await withAuth((t) => api.lodge.hosting.requestPayout(t, Number(amount))); toast?.success?.(e.requested); setAmount(""); wallet.reload(); payouts.reload(); } catch (x) { setErr(errMessage(x, h.common.error)); } finally { setBusy(false); }
  }
  const tone = { requested: "bg-amber-500/15 text-amber-800 dark:text-amber-200", paid: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200", rejected: "bg-red-500/15 text-red-700 dark:text-red-300" };
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-3xl bg-ink text-cream p-6"><p className="text-sm opacity-70">{e.available}</p><p className="font-display text-4xl mt-1">{money(w.available)}</p><p className="text-xs opacity-60 mt-2">{e.availableHint}</p></div>
        <div className="rounded-3xl border border-line bg-surface p-6"><p className="text-sm text-ink-soft">{e.pending}</p><p className="font-display text-4xl text-ink mt-1">{money(w.pending)}</p><p className="text-xs text-ink-faint mt-2">{e.pendingHint}</p></div>
        <div className="rounded-2xl border border-line bg-surface p-5"><p className="text-xs text-ink-soft">{e.totalEarned}</p><p className="font-display text-xl text-ink">{money(w.total_earned)}</p></div>
        <div className="rounded-2xl border border-line bg-surface p-5"><p className="text-xs text-ink-soft">{e.paidOut}</p><p className="font-display text-xl text-ink">{money(w.total_paid_out)}</p></div>
      </div>
      <Card>
        <h2 className="font-display text-xl text-ink mb-4 flex items-center gap-2"><Wallet size={18} className="text-coffee" /> {e.withdraw}</h2>
        {!hasMm ? (
          <p className="text-sm text-ink-soft">{e.needMm} <button onClick={() => go("profile")} className="text-coffee hover:underline">{e.toProfile}</button></p>
        ) : (
          <form onSubmit={request} className="flex flex-wrap gap-3 items-end">
            <Field label={e.amount} hint={e.minPayout(money(w.min_payout))} htmlFor="wa" className="flex-1 min-w-[10rem]"><input id="wa" type="number" required min={w.min_payout} max={w.available} step="any" className={inputCls} value={amount} onChange={(x) => setAmount(x.target.value)} /></Field>
            <button disabled={busy || !amount} className="rounded-xl bg-ink text-cream text-sm font-medium px-6 py-3 disabled:opacity-50 mb-[1.4rem]">{e.send}</button>
          </form>
        )}
        {err && <p role="alert" className="text-sm text-red-600 mt-3">{err}</p>}
      </Card>
      <Card>
        <h2 className="font-display text-xl text-ink mb-4">{e.history}</h2>
        {payouts.data && !payouts.data.length && <p className="text-sm text-ink-faint">{e.empty}</p>}
        <ul className="divide-y divide-line">
          {(payouts.data || []).map((p) => (
            <li key={p.id} className="py-3 flex items-center justify-between gap-3 text-sm">
              <div><p className="text-ink"><span className="font-mono text-xs text-ink-faint mr-2">{p.reference}</span>{money(p.amount)}</p><p className="text-xs text-ink-faint">{new Date(p.created_at).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short", year: "numeric" })} · {e.method} {p.phone}{p.admin_note ? ` · ${p.admin_note}` : ""}</p></div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone[p.status] || ""}`}>{e.status[p.status] || p.status}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* ---------- Avis ---------- */
function Reviews() {
  const h = useHostUi();
  const r = h.reviews;
  const { lang } = useLanguage();
  const { token, withAuth } = useUser();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.lodge.hosting.reviews(token), [token]);
  const [target, setTarget] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function send(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await withAuth((t) => api.lodge.hosting.reply(t, target.id, text)); toast?.success?.(r.sent); setTarget(null); reload(); } catch (x) { setErr(errMessage(x, h.common.error)); } finally { setBusy(false); }
  }
  if (loading && !data) return <Spinner label={h.common.loading} />;
  if (error) return <ErrorState onRetry={reload} />;
  if (!data.length) return <EmptyState icon={Star} title={r.empty} />;
  return (
    <div className="space-y-4 max-w-3xl">
      {data.map((x) => (
        <Card key={x.id} className="!p-5">
          <div className="flex justify-between gap-3 flex-wrap">
            <div><p className="font-medium text-ink">{x.author_name}</p><p className="text-xs text-ink-faint">{x.property_title} · {new Date(x.created_at).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { month: "long", year: "numeric" })}</p></div>
            <div className="flex gap-0.5" aria-label={`${x.rating}/5`}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={15} className={n <= x.rating ? "fill-latte text-latte" : "text-line"} />)}</div>
          </div>
          {x.comment && <p className="text-sm text-ink-soft mt-3 whitespace-pre-line">{x.comment}</p>}
          {x.host_reply ? (
            <div className="mt-4 rounded-2xl bg-latte-soft p-4"><p className="text-xs font-medium text-coffee mb-1">{r.yourReply}</p><p className="text-sm text-ink whitespace-pre-line">{x.host_reply}</p><button onClick={() => { setTarget(x); setText(x.host_reply); setErr(""); }} className="text-xs text-coffee hover:underline mt-2">{r.edit}</button></div>
          ) : <button onClick={() => { setTarget(x); setText(""); setErr(""); }} className="mt-4 rounded-full border border-line text-ink text-sm px-5 py-2 hover:border-coffee-light">{r.reply}</button>}
        </Card>
      ))}
      {target && (
        <Modal title={r.replyTitle} onClose={() => setTarget(null)} closeLabel={h.bookings.close}>
          <form onSubmit={send}>
            <textarea required rows={5} minLength={2} maxLength={1000} className={`${inputCls} resize-none`} placeholder={r.replyPlaceholder} value={text} onChange={(e) => setText(e.target.value)} aria-label={r.replyTitle} />
            {err && <p role="alert" className="text-sm text-red-600 mt-3">{err}</p>}
            <button disabled={busy || text.trim().length < 2} className="mt-5 w-full rounded-full bg-ink text-cream text-sm font-medium py-3.5 disabled:opacity-50">{r.send}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default function HostTabs({ tab, host, go }) {
  if (tab === "bookings") return <Bookings />;
  if (tab === "calendar") return <CalendarTab />;
  if (tab === "earnings") return <Earnings host={host} go={go} />;
  return <Reviews />;
}
