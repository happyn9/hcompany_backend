import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Check, Circle, Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";
import { Card, EmptyState, Field, RestoImage, RestoUploader, Spinner, StatusPill, useRestoUi, inputCls } from "../../components/restaurant/Shared.jsx";
import TablePlan2D from "../../components/restaurant/TablePlan2D.jsx";
import { useLoad, useShopMoney, errMessage } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { CUISINES, DISH_TAGS, RES_STATUSES, TABLE_SHAPES, TABLE_ZONES, fmtDay, isoToday, nextLabel } from "../../lib/resto.js";

const DiningRoom3D = lazy(() => import("../../components/restaurant/DiningRoom3D.jsx"));

/** Corps de la requête PUT d'une fiche à partir de la fiche renvoyée par l'API. */
export function payloadOf(r, over = {}) {
  return {
    name: r.name, summary: r.summary || "", description: r.description || "", cuisines: r.cuisines || [], city: r.city || "", area: r.area || "", address: r.address || "",
    latitude: r.latitude ?? null, longitude: r.longitude ?? null, phone: r.phone || "", whatsapp: r.whatsapp || "", price_level: r.price_level, open_time: r.open_time, close_time: r.close_time,
    closed_days: r.closed_days || [], slot_minutes: r.slot_minutes, max_party: r.max_party, instant_confirm: !!r.instant_confirm, accepts_preorder: !!r.accepts_preorder, has_terrace: !!r.has_terrace,
    room_w: r.room_w, room_d: r.room_d, images: r.images || [], ...over,
  };
}

function useCall() {
  const { withAuth } = useUser();
  const toast = useToast();
  const ui = useRestoUi();
  return async (fn, ok) => {
    try { const res = await withAuth(fn); if (ok) toast?.success?.(ok); return res; } catch (e) { toast?.error?.(errMessage(e, ui.common.error)); throw e; }
  };
}

/* ------------------------------ Vue d'ensemble ------------------------------ */
function Overview({ r, goTab }) {
  const ui = useRestoUi();
  const s = ui.pro.stats;
  const { money } = useShopMoney();
  const [days, setDays] = useState(30);
  const { withAuth } = useUser();
  const { data } = useLoad(() => withAuth((t) => api.resto.owner.stats(t, r.id, days)), [r.id, days]);
  const checks = [
    [ui.pro.checklist.photo, r.images.length > 0, "info"], [ui.pro.checklist.menu, r.menu.some((c) => c.items.length), "menu"],
    [ui.pro.checklist.tables, r.tables.some((t) => t.is_active), "room"], [ui.pro.checklist.info, !!(r.summary && r.city && r.address), "info"],
  ];
  const max = Math.max(1, ...(data?.series || []).map((x) => x.value));
  return (
    <div className="space-y-8">
      {["draft", "rejected"].includes(r.status) && (
        <Card><h2 className="font-display text-xl text-ink mb-4">{ui.pro.checklistTitle}</h2>
          <ul className="space-y-2">{checks.map(([l, ok, tab]) => <li key={l}><button onClick={() => goTab(tab)} className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink">{ok ? <Check size={16} className="text-emerald-600" /> : <Circle size={16} className="text-ink-faint" />}{l}</button></li>)}</ul></Card>
      )}
      <div className="flex gap-2">{[7, 30, 90].map((d) => <button key={d} onClick={() => setDays(d)} aria-pressed={days === d} className={`rounded-full border px-4 py-2 text-sm ${days === d ? "border-coffee bg-latte-soft" : "border-line text-ink-soft"}`}>{s.days(d)}</button>)}</div>
      {!data ? <Spinner label={ui.common.loading} /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[[s.today, `${data.today} · ${data.today_covers} ${ui.common.people}`], [s.upcoming, data.upcoming], [s.reservations, data.reservations], [s.covers, data.covers], [s.noShow, `${data.no_show_rate}%`], [s.preorder, money(data.preorder_value)], [s.rating, data.rating_count ? `${Number(data.rating_avg).toFixed(1)} (${data.rating_count})` : "—"]].map(([l, v]) => (
              <div key={l} className="rounded-2xl border border-line bg-surface p-5"><p className="text-xs text-ink-faint mb-1">{l}</p><p className="font-display text-2xl text-ink">{v}</p></div>
            ))}
          </div>
          <Card>
            <h2 className="font-display text-lg text-ink mb-4">{s.trend}</h2>
            {data.series.length === 0 ? <p className="text-sm text-ink-faint">—</p> : (
              <div className="flex items-end gap-1 h-32" role="img" aria-label={s.trend}>{data.series.map((x) => <div key={x.date} title={`${x.date} · ${x.value}`} className="flex-1 bg-coffee/70 rounded-t min-w-[3px]" style={{ height: `${(x.value / max) * 100}%` }} />)}</div>
            )}
          </Card>
          {data.top_dishes.length > 0 && <Card><h2 className="font-display text-lg text-ink mb-4">{s.topDishes}</h2><ol className="space-y-2 text-sm">{data.top_dishes.map((d) => <li key={d.name} className="flex justify-between"><span className="text-ink">{d.name}</span><span className="text-ink-soft">× {d.qty}</span></li>)}</ol></Card>}
        </>
      )}
    </div>
  );
}

/* -------------------------------- Réservations -------------------------------- */
const ACTIONS = { pending: ["confirm", "decline"], confirmed: ["seat", "no_show", "cancel"], seated: ["complete"] };
function Reservations({ r }) {
  const ui = useRestoUi();
  const t = ui.pro.res;
  const { lang } = useLanguage();
  const { money } = useShopMoney();
  const call = useCall();
  const [f, setF] = useState({ day: "", status: "", upcoming: true });
  const { data, loading, reload } = useLoad(() => call((tk) => api.resto.owner.reservations(tk, r.id, { day: f.day || undefined, status: f.status || undefined, upcoming: f.upcoming && !f.day ? 1 : undefined })), [r.id, f.day, f.status, f.upcoming]);
  const labels = { confirm: t.confirm, decline: t.decline, seat: t.seat, complete: t.complete, no_show: t.noShow, cancel: t.cancel };
  async function act(x, action) {
    let reason = "";
    if (["decline", "cancel"].includes(action)) { reason = window.prompt(t.declineReason) ?? null; if (reason === null) return; }
    await call((tk) => api.resto.owner.action(tk, x.code, { action, reason }), t.done);
    reload();
  }
  async function move(x, table_id) { if (!table_id) return; await call((tk) => api.resto.owner.action(tk, x.code, { action: "move", table_id: Number(table_id) }), t.done); reload(); }
  return (
    <div>
      <div className="flex flex-wrap gap-3 items-end mb-6">
        <label className="text-xs text-ink-soft">{t.filterDay}<input type="date" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} className={`${inputCls} mt-1`} /></label>
        <label className="text-xs text-ink-soft">{t.filterStatus}<select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className={`${inputCls} mt-1`}><option value="">{t.all}</option>{RES_STATUSES.map((s) => <option key={s} value={s}>{ui.status[s]}</option>)}</select></label>
        <label className="inline-flex items-center gap-2 text-sm text-ink-soft pb-3"><input type="checkbox" checked={f.upcoming && !f.day} disabled={!!f.day} onChange={(e) => setF({ ...f, upcoming: e.target.checked })} />{t.upcomingOnly}</label>
      </div>
      {loading && !data ? <Spinner label={ui.common.loading} /> : !data?.length ? <p className="text-sm text-ink-soft">{t.none}</p> : (
        <ul className="space-y-4">
          {data.map((x) => (
            <li key={x.code} className="rounded-3xl border border-line bg-surface p-5">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{x.name} · {x.party_size} {x.party_size > 1 ? ui.common.people : ui.common.person}</p>
                  <p className="text-sm text-ink-soft">{fmtDay(x.day, lang)} · {x.time}{x.table_label ? ` · ${ui.page.table} ${x.table_label}` : ""}{x.phone ? ` · ${x.phone}` : ""}</p>
                  <p className="text-xs text-ink-faint font-mono mt-1">{x.code}</p>
                </div>
                <StatusPill status={x.status} />
              </div>
              {x.note && <p className="text-sm text-ink-soft mt-3 italic">« {x.note} »</p>}
              {x.preorder?.length > 0 && <p className="text-sm text-ink-soft mt-2">{x.preorder.map((l) => `${l.qty}× ${l.name}`).join(", ")} · {money(x.preorder_total)}</p>}
              <div className="flex flex-wrap items-center gap-2 mt-4">
                {(ACTIONS[x.status] || []).map((a) => <button key={a} onClick={() => act(x, a)} className={`rounded-full px-4 py-2 text-sm ${["confirm", "seat", "complete"].includes(a) ? "bg-ink text-cream" : "border border-line text-ink-soft hover:border-red-300 hover:text-red-600"}`}>{labels[a]}</button>)}
                {["pending", "confirmed"].includes(x.status) && (
                  <select aria-label={t.changeTable} value="" onChange={(e) => move(x, e.target.value)} className={`${inputCls} !w-auto !py-2`}><option value="">{t.changeTable}</option>{r.tables.filter((tb) => tb.is_active && tb.id !== x.table_id && tb.seats >= x.party_size).map((tb) => <option key={tb.id} value={tb.id}>{tb.label} · {tb.seats}</option>)}</select>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------ Menu ------------------------------------ */
function DishForm({ r, item, categoryId, onDone, onCancel, refresh }) {
  const ui = useRestoUi();
  const m = ui.pro.menuTab;
  const call = useCall();
  const [f, setF] = useState(item ? { ...item, image_path: item.image } : { name: "", description: "", price: "", image_path: null, tags: [], is_available: true, category_id: categoryId });
  const [busy, setBusy] = useState(false);
  const toggle = (tag) => setF((s) => ({ ...s, tags: s.tags.includes(tag) ? s.tags.filter((x) => x !== tag) : [...s.tags, tag] }));
  async function save(e) {
    e.preventDefault(); setBusy(true);
    const body = { category_id: f.category_id ?? null, name: f.name, description: f.description, price: Number(f.price) || 0, image_path: f.image_path || null, tags: f.tags, is_available: f.is_available };
    try { await call((tk) => (item ? api.resto.owner.updateItem(tk, r.id, item.id, body) : api.resto.owner.addItem(tk, r.id, body)), ui.common.saved); await refresh(); onDone(); } catch { /* toast */ } finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="rounded-2xl border border-coffee-light bg-surface p-5 space-y-4">
      <div className="grid sm:grid-cols-[1fr_140px] gap-4">
        <Field label={m.dishName} htmlFor="dn"><input id="dn" required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} /></Field>
        <Field label={m.price} htmlFor="dp"><input id="dp" required inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^\d.]/g, "") })} className={inputCls} /></Field>
      </div>
      <Field label={m.description} htmlFor="dd"><textarea id="dd" rows={2} maxLength={300} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={inputCls} /></Field>
      <div><p className="text-sm font-medium text-ink mb-2">{m.tags}</p><div className="flex flex-wrap gap-2">{DISH_TAGS.map((tag) => <button type="button" key={tag} onClick={() => toggle(tag)} aria-pressed={f.tags.includes(tag)} className={`rounded-full border px-3 py-1.5 text-xs ${f.tags.includes(tag) ? "border-coffee bg-latte-soft" : "border-line text-ink-soft"}`}>{ui.tags[tag]}</button>)}</div></div>
      <div className="flex flex-wrap items-center gap-4">
        {f.image_path && <RestoImage path={f.image_path} ratio="aspect-square" className="w-16 h-16 rounded-xl" />}
        <RestoUploader label={m.photo} onUploaded={([p]) => setF({ ...f, image_path: p })} />
        <label className="inline-flex items-center gap-2 text-sm text-ink-soft"><input type="checkbox" checked={f.is_available} onChange={(e) => setF({ ...f, is_available: e.target.checked })} />{m.available}</label>
      </div>
      <div className="flex gap-3"><button disabled={busy} className="rounded-full bg-ink text-cream text-sm px-5 py-2.5 disabled:opacity-50">{ui.common.save}</button><button type="button" onClick={onCancel} className="rounded-full border border-line text-sm px-5 py-2.5">{ui.common.cancel}</button></div>
    </form>
  );
}

function MenuTab({ r, refresh }) {
  const ui = useRestoUi();
  const m = ui.pro.menuTab;
  const { money } = useShopMoney();
  const call = useCall();
  const [catName, setCatName] = useState("");
  const [edit, setEdit] = useState(null); // {item?, categoryId}
  async function addCat(e) { e.preventDefault(); if (!catName.trim()) return; try { await call((tk) => api.resto.owner.addCategory(tk, r.id, { name: catName.trim(), sort_order: r.menu.length }), ui.common.saved); setCatName(""); await refresh(); } catch { /* toast */ } }
  async function delCat(c) { if (!window.confirm(`${m.deleteConfirm} ${c.name}`)) return; try { await call((tk) => api.resto.owner.deleteCategory(tk, r.id, c.id)); await refresh(); } catch { /* toast */ } }
  async function renameCat(c) { const name = window.prompt(m.categoryName, c.name); if (!name?.trim() || name === c.name) return; try { await call((tk) => api.resto.owner.updateCategory(tk, r.id, c.id, { name: name.trim(), sort_order: 0 })); await refresh(); } catch { /* toast */ } }
  async function delItem(i) { if (!window.confirm(`${m.deleteConfirm} ${i.name}`)) return; try { await call((tk) => api.resto.owner.deleteItem(tk, r.id, i.id)); await refresh(); } catch { /* toast */ } }
  async function toggleItem(i) { try { await call((tk) => api.resto.owner.updateItem(tk, r.id, i.id, { category_id: i.category_id, name: i.name, description: i.description, price: i.price, image_path: i.image, tags: i.tags, is_available: !i.is_available })); await refresh(); } catch { /* toast */ } }
  const cats = r.menu;
  return (
    <div className="space-y-8 max-w-3xl">
      <form onSubmit={addCat} className="flex gap-3"><input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder={m.categoryName} maxLength={60} aria-label={m.categoryName} className={inputCls} /><button className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm px-5 py-2.5 whitespace-nowrap"><Plus size={15} />{m.addCategory}</button></form>
      {cats.length === 0 && <EmptyState title={m.empty} />}
      {cats.map((c) => (
        <section key={c.id ?? "x"}>
          <div className="flex items-center justify-between mb-3"><h3 className="font-display text-xl text-ink">{c.name || m.noCategory}</h3>
            <div className="flex gap-1">{c.id && <><button onClick={() => renameCat(c)} aria-label={ui.common.edit} className="p-2 text-ink-soft hover:text-ink"><Pencil size={15} /></button><button onClick={() => delCat(c)} aria-label={ui.common.delete} className="p-2 text-ink-soft hover:text-red-600"><Trash2 size={15} /></button></>}
              <button onClick={() => setEdit({ categoryId: c.id })} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-sm"><Plus size={14} />{m.addDish}</button></div></div>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {c.items.map((i) => edit?.item?.id === i.id ? <li key={i.id} className="p-3"><DishForm r={r} item={i} onDone={() => setEdit(null)} onCancel={() => setEdit(null)} refresh={refresh} /></li> : (
              <li key={i.id} className={`p-4 flex items-center gap-4 ${i.is_available ? "" : "opacity-55"}`}>
                {i.image && <RestoImage path={i.image} ratio="aspect-square" className="w-14 h-14 rounded-xl shrink-0" />}
                <div className="flex-1 min-w-0"><p className="font-medium text-ink truncate">{i.name}</p><p className="text-sm text-ink-soft">{money(i.price)}{!i.is_available && ` · ${m.hidden}`}</p></div>
                <button onClick={() => toggleItem(i)} aria-label={m.available} className="p-2 text-ink-soft hover:text-ink">{i.is_available ? <Eye size={16} /> : <EyeOff size={16} />}</button>
                <button onClick={() => setEdit({ item: i })} aria-label={ui.common.edit} className="p-2 text-ink-soft hover:text-ink"><Pencil size={16} /></button>
                <button onClick={() => delItem(i)} aria-label={ui.common.delete} className="p-2 text-ink-soft hover:text-red-600"><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
          {edit && !edit.item && edit.categoryId === c.id && <div className="mt-3"><DishForm r={r} categoryId={c.id} onDone={() => setEdit(null)} onCancel={() => setEdit(null)} refresh={refresh} /></div>}
        </section>
      ))}
    </div>
  );
}

/* ------------------------------- Salle & tables ------------------------------- */
function RoomTab({ r, refresh }) {
  const ui = useRestoUi();
  const t = ui.pro.room;
  const call = useCall();
  const [dims, setDims] = useState({ w: r.room_w, d: r.room_d });
  const [tables, setTables] = useState(r.tables);
  const [sel, setSel] = useState(null);
  const [view, setView] = useState("plan");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTables(r.tables); setDims({ w: r.room_w, d: r.room_d }); }, [r]);
  const cur = sel != null ? tables[sel] : null;
  const patch = (k, v) => setTables((a) => a.map((x, i) => (i === sel ? { ...x, ...v } : x)));
  const add = () => {
    const n = tables.length; setTables([...tables, { label: nextLabel(tables), seats: 4, shape: "round", zone: "indoor", x: Math.min(dims.w - 1.5, 2 + (n % 5) * 2.4), z: Math.min(dims.d - 1.5, 3 + Math.floor(n / 5) * 2.4), rotation: 0, is_active: true }]); setSel(n);
  };
  const remove = () => { setTables(tables.filter((_, i) => i !== sel)); setSel(null); };
  async function save() {
    setBusy(true);
    try {
      if (dims.w !== r.room_w || dims.d !== r.room_d) await call((tk) => api.resto.owner.update(tk, r.id, payloadOf(r, { room_w: Number(dims.w), room_d: Number(dims.d) })));
      await call((tk) => api.resto.owner.saveTables(tk, r.id, tables.map((x) => ({ id: x.id ?? null, label: x.label, seats: Number(x.seats), shape: x.shape, zone: x.zone, x: x.x, z: x.z, rotation: Number(x.rotation) || 0, is_active: x.is_active !== false }))), ui.common.saved);
      await refresh();
    } catch { /* toast */ } finally { setBusy(false); }
  }
  const seats = tables.filter((x) => x.is_active !== false).reduce((s, x) => s + Number(x.seats || 0), 0);
  const preview = useMemo(() => ({ ...r, room_w: Number(dims.w), room_d: Number(dims.d) }), [r, dims]);
  const withIds = tables.map((x, i) => ({ ...x, id: x.id ?? `n${i}` })).filter((x) => x.is_active !== false);
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-8 items-start">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="inline-flex rounded-full border border-line p-1">{[["plan", t.plan], ["3d", t.preview]].map(([k, l]) => <button key={k} onClick={() => setView(k)} aria-pressed={view === k} className={`rounded-full px-4 py-1.5 text-sm ${view === k ? "bg-ink text-cream" : "text-ink-soft"}`}>{l}</button>)}</div>
          <p className="text-sm text-ink-soft">{t.capacity(withIds.length, seats)}</p>
        </div>
        {view === "plan" ? <TablePlan2D w={Number(dims.w)} d={Number(dims.d)} tables={tables} selected={sel} onSelect={setSel} onMove={(k, x, z) => setTables((a) => a.map((tb, i) => (i === k ? { ...tb, x, z } : tb)))} />
          : <Suspense fallback={<Spinner label={ui.common.loading} />}><DiningRoom3D restaurant={preview} tables={withIds} height={440} /></Suspense>}
        {tables.length === 0 && <p className="text-sm text-ink-soft mt-3">{t.noTables}</p>}
      </div>
      <div className="space-y-5 lg:sticky lg:top-[148px]">
        <Card className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.width} htmlFor="rw"><input id="rw" type="number" min="4" max="40" step="0.5" value={dims.w} onChange={(e) => setDims({ ...dims, w: e.target.value })} className={inputCls} /></Field>
            <Field label={t.depth} htmlFor="rd"><input id="rd" type="number" min="4" max="40" step="0.5" value={dims.d} onChange={(e) => setDims({ ...dims, d: e.target.value })} className={inputCls} /></Field>
          </div>
          <button onClick={add} className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-line py-2.5 text-sm hover:border-coffee-light"><Plus size={15} />{t.addTable}</button>
        </Card>
        {cur && (
          <Card className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.label} htmlFor="tl"><input id="tl" maxLength={12} value={cur.label} onChange={(e) => patch("label", { label: e.target.value })} className={inputCls} /></Field>
              <Field label={t.seats} htmlFor="ts"><input id="ts" type="number" min="1" max="20" value={cur.seats} onChange={(e) => patch("seats", { seats: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} className={inputCls} /></Field>
              <Field label={t.shape} htmlFor="tsh"><select id="tsh" value={cur.shape} onChange={(e) => patch("shape", { shape: e.target.value })} className={inputCls}>{TABLE_SHAPES.map((s) => <option key={s} value={s}>{ui.shapes[s]}</option>)}</select></Field>
              <Field label={t.zone} htmlFor="tz"><select id="tz" value={cur.zone} onChange={(e) => patch("zone", { zone: e.target.value })} className={inputCls}>{TABLE_ZONES.map((s) => <option key={s} value={s}>{ui.zones[s]}</option>)}</select></Field>
            </div>
            <Field label={`${t.rotation} (${cur.rotation || 0}°)`} htmlFor="tr"><input id="tr" type="range" min="0" max="345" step="15" value={cur.rotation || 0} onChange={(e) => patch("rotation", { rotation: Number(e.target.value) })} className="w-full" /></Field>
            <label className="inline-flex items-center gap-2 text-sm text-ink-soft"><input type="checkbox" checked={cur.is_active !== false} onChange={(e) => patch("is_active", { is_active: e.target.checked })} />{t.active}</label>
            <button onClick={remove} className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-line py-2.5 text-sm text-red-600 hover:border-red-300"><Trash2 size={15} />{t.removeTable}</button>
          </Card>
        )}
        <button onClick={save} disabled={busy} className="w-full rounded-full bg-ink text-cream text-sm font-medium py-3.5 disabled:opacity-50">{t.saveRoom}</button>
      </div>
    </div>
  );
}

/* ------------------------------- Informations ------------------------------- */
function InfoTab({ r, refresh }) {
  const ui = useRestoUi();
  const t = ui.pro.info;
  const call = useCall();
  const [f, setF] = useState(() => payloadOf(r));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const toggle = (k, v) => setF((s) => ({ ...s, [k]: s[k].includes(v) ? s[k].filter((x) => x !== v) : [...s[k], v] }));
  const num = (v) => (v === "" || v == null ? null : Number(v));
  async function save(e) {
    e.preventDefault(); setBusy(true);
    try { await call((tk) => api.resto.owner.update(tk, r.id, { ...f, latitude: num(f.latitude), longitude: num(f.longitude), slot_minutes: Number(f.slot_minutes), max_party: Number(f.max_party), price_level: Number(f.price_level) }), ui.common.saved); await refresh(); } catch { /* toast */ } finally { setBusy(false); }
  }
  const chip = (on) => `rounded-full border px-3.5 py-2 text-sm ${on ? "border-coffee bg-latte-soft text-ink" : "border-line text-ink-soft hover:border-coffee-light"}`;
  return (
    <form onSubmit={save} className="space-y-6 max-w-3xl">
      <Card className="space-y-4">
        <Field label={ui.pro.name} htmlFor="in"><input id="in" required minLength={2} maxLength={80} value={f.name} onChange={set("name")} className={inputCls} /></Field>
        <Field label={t.summary} htmlFor="isu"><input id="isu" maxLength={160} value={f.summary} onChange={set("summary")} className={inputCls} /></Field>
        <Field label={t.description} htmlFor="ide"><textarea id="ide" rows={5} maxLength={4000} value={f.description} onChange={set("description")} className={inputCls} /></Field>
        <div><p className="text-sm font-medium text-ink mb-2">{t.cuisines}</p><div className="flex flex-wrap gap-2">{CUISINES.map((c) => <button type="button" key={c} onClick={() => toggle("cuisines", c)} aria-pressed={f.cuisines.includes(c)} className={chip(f.cuisines.includes(c))}>{ui.cuisines[c]}</button>)}</div></div>
      </Card>
      <Card className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t.city} htmlFor="ic"><input id="ic" value={f.city} onChange={set("city")} className={inputCls} /></Field>
          <Field label={t.area} htmlFor="ia"><input id="ia" value={f.area} onChange={set("area")} className={inputCls} /></Field>
        </div>
        <Field label={t.address} htmlFor="iad"><input id="iad" value={f.address} onChange={set("address")} className={inputCls} /></Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t.phone} htmlFor="ip"><input id="ip" value={f.phone} onChange={set("phone")} inputMode="tel" className={inputCls} /></Field>
          <Field label={t.whatsapp} htmlFor="iw"><input id="iw" value={f.whatsapp} onChange={set("whatsapp")} inputMode="tel" className={inputCls} /></Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={`${t.mapHelp} — lat`} htmlFor="ila"><input id="ila" inputMode="decimal" value={f.latitude ?? ""} onChange={set("latitude")} className={inputCls} /></Field>
          <Field label="lng" htmlFor="ilo"><input id="ilo" inputMode="decimal" value={f.longitude ?? ""} onChange={set("longitude")} className={inputCls} /></Field>
        </div>
      </Card>
      <Card className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label={t.price} htmlFor="ipr"><select id="ipr" value={f.price_level} onChange={set("price_level")} className={inputCls}>{[1, 2, 3].map((n) => <option key={n} value={n}>{"$".repeat(n)}</option>)}</select></Field>
          <Field label={t.open} htmlFor="io"><input id="io" type="time" value={f.open_time} onChange={set("open_time")} className={inputCls} /></Field>
          <Field label={t.close} htmlFor="icl"><input id="icl" type="time" value={f.close_time} onChange={set("close_time")} className={inputCls} /></Field>
          <Field label={t.slot} htmlFor="isl"><input id="isl" type="number" min="30" max="240" step="15" value={f.slot_minutes} onChange={set("slot_minutes")} className={inputCls} /></Field>
          <Field label={t.maxParty} htmlFor="imp"><input id="imp" type="number" min="1" max="40" value={f.max_party} onChange={set("max_party")} className={inputCls} /></Field>
        </div>
        <div><p className="text-sm font-medium text-ink mb-2">{t.closedDays}</p><div className="flex flex-wrap gap-2">{ui.daysShort.map((d, i) => <button type="button" key={d} onClick={() => toggle("closed_days", i)} aria-pressed={f.closed_days.includes(i)} className={chip(f.closed_days.includes(i))}>{d}</button>)}</div></div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
          {[["instant_confirm", t.instant], ["accepts_preorder", t.preorder], ["has_terrace", t.terrace]].map(([k, l]) => <label key={k} className="inline-flex items-center gap-2"><input type="checkbox" checked={f[k]} onChange={set(k)} />{l}</label>)}
        </div>
      </Card>
      <Card>
        <p className="text-sm font-medium text-ink mb-3">{t.photos}</p>
        <div className="flex flex-wrap gap-3 mb-4">{f.images.map((im, i) => (
          <div key={im} className="relative"><RestoImage path={im} ratio="aspect-[4/3]" className="w-28 rounded-xl" /><button type="button" onClick={() => setF((s) => ({ ...s, images: s.images.filter((x) => x !== im) }))} aria-label={ui.common.delete} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-ink text-cream flex items-center justify-center"><X size={12} /></button>{i === 0 && <span className="absolute bottom-1 left-1 rounded-full bg-white/90 text-black text-[10px] px-2">1</span>}</div>
        ))}</div>
        <RestoUploader multiple label={t.addPhotos} onUploaded={(ps) => setF((s) => ({ ...s, images: [...s.images, ...ps].slice(0, 10) }))} />
      </Card>
      <button disabled={busy} className="rounded-full bg-ink text-cream text-sm font-medium px-8 py-3.5 disabled:opacity-50">{ui.common.save}</button>
    </form>
  );
}

export default function RestoProTabs({ tab, r, refresh, goTab }) {
  if (tab === "reservations") return <Reservations r={r} />;
  if (tab === "menu") return <MenuTab r={r} refresh={refresh} />;
  if (tab === "room") return <RoomTab r={r} refresh={refresh} />;
  if (tab === "info") return <InfoTab key={r.id} r={r} refresh={refresh} />;
  return <Overview r={r} goTab={goTab} />;
}
