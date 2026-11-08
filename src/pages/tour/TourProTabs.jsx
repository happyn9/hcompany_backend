import { useEffect, useState } from "react";
import { Check, Circle, Plus, Trash2, X } from "lucide-react";
import { Card, Field, StatusPill, Spinner, TourImage, TourUploader, useTourUi, inputCls } from "../../components/tourism/Shared.jsx";
import { errMessage, useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { BOOKING_STATUSES, CATEGORIES, DIFFICULTIES, LANGS, fmtDay, groupByDay, isoToday, lines } from "../../lib/tourism.js";

export function payloadOf(r, over = {}) {
  return {
    title: r.title, summary: r.summary || "", description: r.description || "", category: r.category, city: r.city || "", meeting_point: r.meeting_point || "",
    latitude: r.latitude ?? null, longitude: r.longitude ?? null, phone: r.phone || "", whatsapp: r.whatsapp || "", duration_hours: r.duration_hours, difficulty: r.difficulty,
    languages: r.languages || ["fr", "en"], min_age: r.min_age || 0, price_adult: r.price_adult, price_child: r.price_child ?? null, max_group: r.max_group,
    includes: r.includes || [], excludes: r.excludes || [], itinerary: r.itinerary || [], instant_confirm: !!r.instant_confirm, cancel_hours: r.cancel_hours ?? 24, images: r.images || [], ...over,
  };
}

function useCall() {
  const { withAuth } = useUser();
  const toast = useToast();
  const ui = useTourUi();
  return async (fn, ok) => {
    try { const res = await withAuth(fn); if (ok) toast?.success?.(ok); return res; } catch (e) { toast?.error?.(errMessage(e, ui.common.error)); throw e; }
  };
}

/* ------------------------------ Vue d'ensemble ------------------------------ */
function Overview({ r, goTab }) {
  const ui = useTourUi();
  const s = ui.pro.stats;
  const { money } = useShopMoney();
  const [days, setDays] = useState(30);
  const { withAuth } = useUser();
  const { data } = useLoad(() => withAuth((t) => api.tour.owner.stats(t, r.id, days)), [r.id, days]);
  const checks = [[ui.pro.checklist.photo, r.images.length > 0, "info"], [ui.pro.checklist.dep, r.open_departures > 0, "departures"], [ui.pro.checklist.price, r.price_adult > 0, "info"], [ui.pro.checklist.info, !!(r.summary && r.city && r.meeting_point), "info"]];
  const max = Math.max(1, ...(data?.series || []).map((x) => x.value));
  return (
    <div className="space-y-8">
      {["draft", "rejected"].includes(r.status) && <Card><h2 className="font-display text-xl text-ink mb-4">{ui.pro.checklistTitle}</h2><ul className="space-y-2">{checks.map(([l, ok, tab]) => <li key={l}><button onClick={() => goTab(tab)} className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink">{ok ? <Check size={16} className="text-emerald-600" /> : <Circle size={16} className="text-ink-faint" />}{l}</button></li>)}</ul></Card>}
      <div className="flex gap-2">{[7, 30, 90].map((d) => <button key={d} onClick={() => setDays(d)} aria-pressed={days === d} className={`rounded-full border px-4 py-2 text-sm ${days === d ? "border-coffee bg-latte-soft" : "border-line text-ink-soft"}`}>{s.days(d)}</button>)}</div>
      {!data ? <Spinner label={ui.common.loading} /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[[s.upcoming, data.upcoming], [s.openDeps, data.open_departures], [s.bookings, data.bookings], [s.travellers, data.travellers], [s.revenue, money(data.revenue)], [s.fill, `${data.fill_rate_30d}%`], [s.noShow, `${data.no_show_rate}%`], [s.rating, data.rating_count ? `${Number(data.rating_avg).toFixed(1)} (${data.rating_count})` : "—"]].map(([l, v]) => (
              <div key={l} className="rounded-2xl border border-line bg-surface p-5"><p className="text-xs text-ink-faint mb-1">{l}</p><p className="font-display text-2xl text-ink">{v}</p></div>
            ))}
          </div>
          <Card><h2 className="font-display text-lg text-ink mb-4">{s.trend}</h2>
            {data.series.length === 0 ? <p className="text-sm text-ink-faint">—</p> : <div className="flex items-end gap-1 h-32" role="img" aria-label={s.trend}>{data.series.map((x) => <div key={x.date} title={`${x.date} · ${x.value}`} className="flex-1 bg-coffee/70 rounded-t min-w-[3px]" style={{ height: `${(x.value / max) * 100}%` }} />)}</div>}</Card>
        </>
      )}
    </div>
  );
}

/* --------------------------------- Départs --------------------------------- */
function Departures({ r, refresh }) {
  const ui = useTourUi();
  const t = ui.pro.dep;
  const { lang } = useLanguage();
  const { money } = useShopMoney();
  const call = useCall();
  const toast = useToast();
  const { withAuth } = useUser();
  const { data, reload } = useLoad(() => withAuth((tk) => api.tour.owner.departures(tk, r.id)), [r.id]);
  const [f, setF] = useState({ start: isoToday(1), end: isoToday(30), weekdays: [0, 1, 2, 3, 4, 5, 6], times: ["08:00"], capacity: "", price_adult: "", price_child: "" });
  const [busy, setBusy] = useState(false);
  const toggleDay = (i) => setF((s) => ({ ...s, weekdays: s.weekdays.includes(i) ? s.weekdays.filter((x) => x !== i) : [...s.weekdays, i] }));
  const setTime = (i, v) => setF((s) => ({ ...s, times: s.times.map((x, k) => (k === i ? v : x)) }));
  const num = (v) => (v === "" ? null : Number(v));
  async function create(e) {
    e.preventDefault(); setBusy(true);
    try {
      const res = await call((tk) => api.tour.owner.addDepartures(tk, r.id, { start: f.start, end: f.end, weekdays: f.weekdays, times: f.times, capacity: num(f.capacity), price_adult: num(f.price_adult), price_child: num(f.price_child) }), null);
      toast?.success?.(t.created(res.created));
      await Promise.all([reload(), refresh()]);
    } catch { /* toast */ } finally { setBusy(false); }
  }
  async function patch(d, body) { try { await call((tk) => api.tour.owner.updateDeparture(tk, d.id, { capacity: d.capacity, price_adult: d.own_price_adult, price_child: d.own_price_child, is_open: d.is_open, ...body })); await Promise.all([reload(), refresh()]); } catch { /* toast */ } }
  async function del(d) { if (!window.confirm(t.deleteConfirm)) return; try { await call((tk) => api.tour.owner.deleteDeparture(tk, d.id)); await Promise.all([reload(), refresh()]); } catch { /* toast */ } }
  const today = isoToday();
  const groups = groupByDay((data || []).filter((d) => d.day >= today));
  return (
    <div className="grid lg:grid-cols-[360px_1fr] gap-8 items-start">
      <Card className="lg:sticky lg:top-[148px]">
        <h2 className="font-display text-xl text-ink mb-4">{t.add}</h2>
        <form onSubmit={create} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.from} htmlFor="df"><input id="df" type="date" min={isoToday()} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} className={inputCls} required /></Field>
            <Field label={t.to} htmlFor="dt"><input id="dt" type="date" min={f.start} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} className={inputCls} required /></Field>
          </div>
          <div><p className="text-sm font-medium text-ink mb-2">{t.weekdays}</p><div className="flex flex-wrap gap-1.5">{t.dayShort.map((d, i) => <button type="button" key={d} onClick={() => toggleDay(i)} aria-pressed={f.weekdays.includes(i)} className={`rounded-full border px-3 py-1.5 text-xs ${f.weekdays.includes(i) ? "border-coffee bg-latte-soft" : "border-line text-ink-soft"}`}>{d}</button>)}</div></div>
          <div><p className="text-sm font-medium text-ink mb-2">{t.times}</p>
            <div className="flex flex-wrap gap-2 items-center">{f.times.map((tm, i) => <span key={i} className="inline-flex items-center gap-1"><input type="time" value={tm} onChange={(e) => setTime(i, e.target.value)} className={`${inputCls} !w-28 !py-2`} required />{f.times.length > 1 && <button type="button" aria-label={ui.common.delete} onClick={() => setF({ ...f, times: f.times.filter((_, k) => k !== i) })}><X size={14} /></button>}</span>)}
              {f.times.length < 6 && <button type="button" onClick={() => setF({ ...f, times: [...f.times, "14:00"] })} className="text-xs text-coffee underline">{t.addTime}</button>}</div></div>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t.capacity} htmlFor="dc"><input id="dc" type="number" min="1" max="200" placeholder={String(r.max_group)} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} className={inputCls} /></Field>
            <Field label={t.price} htmlFor="dpa"><input id="dpa" inputMode="decimal" value={f.price_adult} onChange={(e) => setF({ ...f, price_adult: e.target.value.replace(/[^\d.]/g, "") })} className={inputCls} /></Field>
            <Field label={t.priceChild} htmlFor="dpc"><input id="dpc" inputMode="decimal" value={f.price_child} onChange={(e) => setF({ ...f, price_child: e.target.value.replace(/[^\d.]/g, "") })} className={inputCls} /></Field>
          </div>
          <button disabled={busy || !f.weekdays.length} className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-ink text-cream text-sm font-medium py-3 disabled:opacity-50"><Plus size={15} />{t.create}</button>
        </form>
      </Card>
      <div>
        <h2 className="font-display text-xl text-ink mb-4">{t.list}</h2>
        {!data ? <Spinner label={ui.common.loading} /> : groups.length === 0 ? <p className="text-sm text-ink-soft">{t.none}</p> : (
          <div className="space-y-5">{groups.map((g) => (
            <section key={g.day}><h3 className="text-sm font-medium text-ink mb-2">{fmtDay(g.day, lang, { weekday: "long", day: "numeric", month: "long" })}</h3>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">{g.items.map((d) => (
                <li key={d.id} className={`p-4 flex flex-wrap items-center gap-x-5 gap-y-2 ${d.is_open ? "" : "opacity-60"}`}>
                  <span className="font-medium text-ink w-14">{d.time}</span>
                  <span className="text-sm text-ink-soft">{d.booked}/{d.capacity} {t.booked}{d.pending > 0 && <span className="text-amber-700"> · {d.pending} {t.pending}</span>}</span>
                  <span className="text-sm text-ink-soft">{money(d.price_adult)}</span>
                  <span className="ml-auto inline-flex items-center gap-2">
                    <label className="text-xs text-ink-faint inline-flex items-center gap-1">{t.editCap}<input type="number" min={Math.max(1, d.booked)} max="200" defaultValue={d.capacity} onBlur={(e) => { const v = Number(e.target.value); if (v && v !== d.capacity) patch({ ...d, own_price_adult: d.own_price_adult, own_price_child: d.own_price_child }, { capacity: v }); }} className="w-16 rounded-lg border border-line bg-surface px-2 py-1 text-sm text-ink" /></label>
                    <button onClick={() => patch({ ...d }, { is_open: !d.is_open })} className={`rounded-full border px-3 py-1.5 text-xs ${d.is_open ? "border-line text-ink-soft" : "border-coffee text-coffee"}`}>{d.is_open ? t.open : t.closed}</button>
                    <button onClick={() => del(d)} aria-label={ui.common.delete} className="p-1.5 text-ink-soft hover:text-red-600"><Trash2 size={15} /></button>
                  </span>
                </li>))}</ul></section>))}</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Réservations ------------------------------- */
const ACTIONS = { pending: ["confirm", "decline"], confirmed: ["complete", "no_show", "cancel"] };
function Bookings({ r }) {
  const ui = useTourUi();
  const t = ui.pro.res;
  const { lang } = useLanguage();
  const { money } = useShopMoney();
  const call = useCall();
  const [f, setF] = useState({ day: "", status: "", upcoming: true });
  const { data, loading, reload } = useLoad(() => call((tk) => api.tour.owner.bookings(tk, r.id, { day: f.day || undefined, status: f.status || undefined, upcoming: f.upcoming && !f.day ? 1 : undefined })), [r.id, f.day, f.status, f.upcoming]);
  const labels = { confirm: t.confirm, decline: t.decline, complete: t.complete, no_show: t.noShow, cancel: t.cancel };
  async function act(x, action) {
    let reason = "";
    if (["decline", "cancel"].includes(action)) { reason = window.prompt(t.reasonPrompt) ?? null; if (reason === null) return; }
    try { await call((tk) => api.tour.owner.action(tk, x.code, { action, reason }), t.done); reload(); } catch { /* toast */ }
  }
  return (
    <div>
      <div className="flex flex-wrap gap-3 items-end mb-6">
        <label className="text-xs text-ink-soft">{t.day}<input type="date" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} className={`${inputCls} mt-1`} /></label>
        <label className="text-xs text-ink-soft">{t.status}<select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className={`${inputCls} mt-1`}><option value="">{t.all}</option>{BOOKING_STATUSES.map((s) => <option key={s} value={s}>{ui.status[s]}</option>)}</select></label>
        <label className="inline-flex items-center gap-2 text-sm text-ink-soft pb-3"><input type="checkbox" checked={f.upcoming && !f.day} disabled={!!f.day} onChange={(e) => setF({ ...f, upcoming: e.target.checked })} />{t.upcomingOnly}</label>
      </div>
      {loading && !data ? <Spinner label={ui.common.loading} /> : !data?.length ? <p className="text-sm text-ink-soft">{t.none}</p> : (
        <ul className="space-y-4">{data.map((x) => (
          <li key={x.code} className="rounded-3xl border border-line bg-surface p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div><p className="font-medium text-ink">{x.name} · {x.adults + x.children} {x.adults + x.children > 1 ? ui.common.people : ui.common.person}{x.children ? ` (${x.children} ${ui.common.children.toLowerCase()})` : ""}</p>
                <p className="text-sm text-ink-soft">{fmtDay(x.day, lang)} · {x.time}{x.phone ? ` · ${x.phone}` : ""} · {money(x.total)}</p><p className="text-xs text-ink-faint font-mono mt-1">{x.code}</p></div>
              <StatusPill status={x.status} />
            </div>
            {x.note && <p className="text-sm text-ink-soft mt-3 italic">« {x.note} »</p>}
            <div className="flex flex-wrap items-center gap-2 mt-4">{(ACTIONS[x.status] || []).map((a) => <button key={a} onClick={() => act(x, a)} className={`rounded-full px-4 py-2 text-sm ${["confirm", "complete"].includes(a) ? "bg-ink text-cream" : "border border-line text-ink-soft hover:border-red-300 hover:text-red-600"}`}>{labels[a]}</button>)}</div>
          </li>))}</ul>
      )}
    </div>
  );
}

/* ----------------------------------- Fiche ----------------------------------- */
function Info({ r, refresh }) {
  const ui = useTourUi();
  const t = ui.pro.info;
  const call = useCall();
  const [f, setF] = useState(() => ({ ...payloadOf(r), includesText: (r.includes || []).join("\n"), excludesText: (r.excludes || []).join("\n") }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const toggleLang = (l) => setF((s) => ({ ...s, languages: s.languages.includes(l) ? s.languages.filter((x) => x !== l) : [...s.languages, l] }));
  const step = (i, k, v) => setF((s) => ({ ...s, itinerary: s.itinerary.map((x, n) => (n === i ? { ...x, [k]: v } : x)) }));
  const num = (v) => (v === "" || v == null ? null : Number(v));
  async function save(e) {
    e.preventDefault(); setBusy(true);
    const { includesText, excludesText, ...rest } = f;
    try {
      await call((tk) => api.tour.owner.update(tk, r.id, { ...rest, includes: lines(includesText), excludes: lines(excludesText), latitude: num(f.latitude), longitude: num(f.longitude), duration_hours: Number(f.duration_hours), price_adult: Number(f.price_adult) || 0, price_child: num(f.price_child), max_group: Number(f.max_group), min_age: Number(f.min_age) || 0, cancel_hours: Number(f.cancel_hours) || 0 }), ui.common.saved);
      await refresh();
    } catch { /* toast */ } finally { setBusy(false); }
  }
  const chip = (on) => `rounded-full border px-3.5 py-2 text-sm ${on ? "border-coffee bg-latte-soft text-ink" : "border-line text-ink-soft hover:border-coffee-light"}`;
  return (
    <form onSubmit={save} className="space-y-6 max-w-3xl">
      <Card className="space-y-4">
        <Field label={ui.pro.name} htmlFor="ti"><input id="ti" required minLength={2} maxLength={90} value={f.title} onChange={set("title")} className={inputCls} /></Field>
        <Field label={t.summary} htmlFor="tsu"><input id="tsu" maxLength={160} value={f.summary} onChange={set("summary")} className={inputCls} /></Field>
        <Field label={t.description} htmlFor="tde"><textarea id="tde" rows={5} maxLength={5000} value={f.description} onChange={set("description")} className={inputCls} /></Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t.category} htmlFor="tca"><select id="tca" value={f.category} onChange={set("category")} className={inputCls}>{CATEGORIES.map((c) => <option key={c} value={c}>{ui.cats[c]}</option>)}</select></Field>
          <Field label={t.level} htmlFor="tle"><select id="tle" value={f.difficulty} onChange={set("difficulty")} className={inputCls}>{DIFFICULTIES.map((c) => <option key={c} value={c}>{ui.diff[c]}</option>)}</select></Field>
        </div>
        <div><p className="text-sm font-medium text-ink mb-2">{t.langs}</p><div className="flex flex-wrap gap-2">{LANGS.map((l) => <button type="button" key={l} onClick={() => toggleLang(l)} aria-pressed={f.languages.includes(l)} className={chip(f.languages.includes(l))}>{ui.langs[l]}</button>)}</div></div>
      </Card>
      <Card className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t.city} htmlFor="tci"><input id="tci" value={f.city} onChange={set("city")} className={inputCls} /></Field>
          <Field label={t.meeting} htmlFor="tme"><input id="tme" value={f.meeting_point} onChange={set("meeting_point")} className={inputCls} /></Field>
          <Field label={t.phone} htmlFor="tph"><input id="tph" value={f.phone} onChange={set("phone")} inputMode="tel" className={inputCls} /></Field>
          <Field label={t.whatsapp} htmlFor="twa"><input id="twa" value={f.whatsapp} onChange={set("whatsapp")} inputMode="tel" className={inputCls} /></Field>
          <Field label={`${t.map} — lat`} htmlFor="tla"><input id="tla" inputMode="decimal" value={f.latitude ?? ""} onChange={set("latitude")} className={inputCls} /></Field>
          <Field label="lng" htmlFor="tlo"><input id="tlo" inputMode="decimal" value={f.longitude ?? ""} onChange={set("longitude")} className={inputCls} /></Field>
        </div>
      </Card>
      <Card className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label={t.priceAdult} htmlFor="tpa"><input id="tpa" inputMode="decimal" value={f.price_adult} onChange={(e) => setF({ ...f, price_adult: e.target.value.replace(/[^\d.]/g, "") })} className={inputCls} /></Field>
          <Field label={t.priceChild} htmlFor="tpc"><input id="tpc" inputMode="decimal" value={f.price_child ?? ""} onChange={(e) => setF({ ...f, price_child: e.target.value.replace(/[^\d.]/g, "") })} className={inputCls} /></Field>
          <Field label={t.maxGroup} htmlFor="tmg"><input id="tmg" type="number" min="1" max="60" value={f.max_group} onChange={set("max_group")} className={inputCls} /></Field>
          <Field label={t.duration} htmlFor="tdu"><input id="tdu" type="number" min="0.5" step="0.5" value={f.duration_hours} onChange={set("duration_hours")} className={inputCls} /></Field>
          <Field label={t.minAge} htmlFor="tma"><input id="tma" type="number" min="0" max="18" value={f.min_age} onChange={set("min_age")} className={inputCls} /></Field>
          <Field label={t.cancelHours} htmlFor="tch"><input id="tch" type="number" min="0" max="240" value={f.cancel_hours} onChange={set("cancel_hours")} className={inputCls} /></Field>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-ink-soft"><input type="checkbox" checked={f.instant_confirm} onChange={set("instant_confirm")} />{t.instant}</label>
      </Card>
      <Card className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t.includes} htmlFor="tin"><textarea id="tin" rows={4} value={f.includesText} onChange={set("includesText")} className={inputCls} /></Field>
          <Field label={t.excludes} htmlFor="tex"><textarea id="tex" rows={4} value={f.excludesText} onChange={set("excludesText")} className={inputCls} /></Field>
        </div>
        <div><p className="text-sm font-medium text-ink mb-2">{t.itinerary}</p>
          <ol className="space-y-3 mb-3">{f.itinerary.map((s, i) => (
            <li key={i} className="rounded-2xl border border-line p-3 flex gap-3"><span className="w-7 h-7 rounded-full bg-ink text-cream text-xs flex items-center justify-center shrink-0 mt-1">{i + 1}</span>
              <div className="flex-1 space-y-2"><input aria-label={t.stepTitle} placeholder={t.stepTitle} maxLength={80} value={s.title} onChange={(e) => step(i, "title", e.target.value)} className={inputCls} /><textarea aria-label={t.stepText} placeholder={t.stepText} rows={2} maxLength={500} value={s.text} onChange={(e) => step(i, "text", e.target.value)} className={inputCls} /></div>
              <button type="button" aria-label={ui.common.delete} onClick={() => setF((x) => ({ ...x, itinerary: x.itinerary.filter((_, n) => n !== i) }))} className="p-1.5 text-ink-soft hover:text-red-600 self-start"><Trash2 size={15} /></button></li>))}</ol>
          {f.itinerary.length < 20 && <button type="button" onClick={() => setF((x) => ({ ...x, itinerary: [...x.itinerary, { title: "", text: "" }] }))} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm"><Plus size={14} />{t.addStep}</button>}
        </div>
      </Card>
      <Card>
        <p className="text-sm font-medium text-ink mb-3">{t.photos}</p>
        <div className="flex flex-wrap gap-3 mb-4">{f.images.map((im) => <div key={im} className="relative"><TourImage path={im} ratio="aspect-[4/3]" className="w-28 rounded-xl" /><button type="button" onClick={() => setF((s) => ({ ...s, images: s.images.filter((x) => x !== im) }))} aria-label={ui.common.delete} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-ink text-cream flex items-center justify-center"><X size={12} /></button></div>)}</div>
        <TourUploader multiple label={t.addPhotos} onUploaded={(ps) => setF((s) => ({ ...s, images: [...s.images, ...ps].slice(0, 10) }))} />
      </Card>
      <button disabled={busy} className="rounded-full bg-ink text-cream text-sm font-medium px-8 py-3.5 disabled:opacity-50">{ui.common.save}</button>
    </form>
  );
}

export default function TourProTabs({ tab, r, refresh, goTab }) {
  if (tab === "departures") return <Departures r={r} refresh={refresh} />;
  if (tab === "bookings") return <Bookings r={r} />;
  if (tab === "info") return <Info key={r.id} r={r} refresh={refresh} />;
  return <Overview r={r} goTab={goTab} />;
}
