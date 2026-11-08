import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Check, Clock, MapPin, Minus, Phone, Plus, Utensils, Zap } from "lucide-react";
import RestoLayout, { Card, ErrorState, Field, RestoImage, Rating, Spinner, useRestoUi, inputCls } from "../../components/restaurant/Shared.jsx";
import { TABLE_COLORS } from "../../three/models/dining.js";
import { useLoad, useShopMoney, errMessage } from "../../data/shop.js";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { api } from "../../lib/api.js";
import { fmtDay, indexMenu, isoToday, preorderTotal, priceSigns, slotPassed, weekday } from "../../lib/resto.js";
import { osmEmbedUrl, osmLink } from "../../lib/lodge.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const DiningRoom3D = lazy(() => import("../../components/restaurant/DiningRoom3D.jsx"));

function Legend() {
  const l = useRestoUi().page.legend;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
      {["free", "taken", "too_small", "selected"].map((k) => <li key={k} className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ background: TABLE_COLORS[k] }} />{l[k]}</li>)}
    </ul>
  );
}

function Menu({ menu, qty, setQty, canOrder, money }) {
  const ui = useRestoUi();
  const p = ui.page;
  if (!menu?.length) return <p className="text-sm text-ink-soft">{p.empty}</p>;
  return (
    <div className="space-y-8">
      {menu.map((c) => (
        <section key={c.id ?? "x"}>
          {c.name && <h3 className="font-display text-xl text-ink mb-3">{c.name}</h3>}
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {c.items.map((i) => (
              <li key={i.id} className="p-4 flex gap-4">
                {i.image && <RestoImage path={i.image} alt={i.name} ratio="aspect-square" className="w-20 h-20 rounded-xl shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-3"><p className="font-medium text-ink">{i.name}</p><p className="text-ink whitespace-nowrap">{money(i.price)}</p></div>
                  {i.description && <p className="text-sm text-ink-soft mt-0.5">{i.description}</p>}
                  {i.tags.length > 0 && <p className="flex flex-wrap gap-1.5 mt-2">{i.tags.map((t) => <span key={t} className="rounded-full bg-latte-soft text-coffee text-[11px] px-2 py-0.5">{ui.tags[t] || t}</span>)}</p>}
                </div>
                {canOrder && (
                  <div className="self-center shrink-0">
                    {qty[i.id] ? (
                      <div className="inline-flex items-center gap-2 rounded-full border border-line px-1.5 py-1">
                        <button aria-label="−" onClick={() => setQty(i.id, qty[i.id] - 1)} className="w-7 h-7 rounded-full hover:bg-latte-soft flex items-center justify-center"><Minus size={14} /></button>
                        <span className="text-sm w-4 text-center">{qty[i.id]}</span>
                        <button aria-label="+" onClick={() => setQty(i.id, Math.min(20, qty[i.id] + 1))} className="w-7 h-7 rounded-full hover:bg-latte-soft flex items-center justify-center"><Plus size={14} /></button>
                      </div>
                    ) : <button onClick={() => setQty(i.id, 1)} className="inline-flex items-center gap-1 rounded-full border border-line px-3.5 py-2 text-sm hover:border-coffee-light"><Plus size={14} />{p.addItem}</button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function RestoPage() {
  const { slug } = useParams();
  const ui = useRestoUi();
  const { lang } = useLanguage();
  const p = ui.page;
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const { isAuthenticated, user, withAuth } = useUser();
  const { money } = useShopMoney();
  const [sp] = useSearchParams();

  const { data: r, error, loading, reload } = useLoad(() => api.resto.detail(slug), [slug]);
  usePageMeta(r ? { title: `${r.name} · H-Restaurant`, description: r.summary } : null);

  const [day, setDay] = useState(sp.get("day") || isoToday());
  const [time, setTime] = useState(sp.get("time") || "");
  const [party, setParty] = useState(Number(sp.get("party")) || 2);
  const [tableId, setTableId] = useState(null);
  const [qty, setQtyState] = useState({});
  const [form, setForm] = useState({ name: "", phone: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  const [no3d, setNo3d] = useState(false);

  useEffect(() => { if (user && !form.name) setForm((f) => ({ ...f, name: user.full_name || user.name || "" })); }, [user]); // eslint-disable-line

  const rid = r?.id;
  const slots = useLoad(() => (rid ? api.resto.slots(rid, { day, party }) : Promise.resolve(null)), [rid, day, party]);
  useEffect(() => { // choisit un créneau par défaut cohérent
    const list = slots.data?.slots;
    if (!list) return;
    if (!time || !list.some((s) => s.time === time)) {
      const want = sp.get("time") || "19:00";
      const ok = list.filter((s) => s.free > 0 && !slotPassed(day, s.time));
      setTime((ok.find((s) => s.time >= want) || ok[0] || {}).time || "");
    }
  }, [slots.data]); // eslint-disable-line
  const tablesQ = useLoad(() => (rid && time ? api.resto.tables(rid, { day, time, party }) : Promise.resolve(null)), [rid, day, time, party]);
  const statuses = useMemo(() => Object.fromEntries((tablesQ.data?.tables || []).map((t) => [t.id, t.status])), [tablesQ.data]);
  useEffect(() => { if (tableId && statuses[tableId] && statuses[tableId] !== "free") setTableId(null); }, [statuses]); // eslint-disable-line

  const menuIdx = useMemo(() => indexMenu(r?.menu), [r]);
  const lines = Object.entries(qty).filter(([, q]) => q > 0).map(([id, q]) => ({ item_id: Number(id), qty: q }));
  const setQty = (id, q) => setQtyState((s) => ({ ...s, [id]: Math.max(0, q) }));
  const total = preorderTotal(lines, menuIdx);
  const freeCount = Object.values(statuses).filter((s) => s === "free").length;
  const table = r?.tables.find((t) => t.id === tableId);
  const closedToday = r && r.closed_days.includes(weekday(day));

  async function reserve() {
    if (!isAuthenticated) { nav("/connexion", { state: { redirectTo: loc.pathname + loc.search } }); return; }
    setBusy(true); setErr("");
    try {
      const res = await withAuth((tk) => api.resto.reserve(tk, { restaurant_id: r.id, day, time, party_size: party, table_id: tableId, name: form.name, phone: form.phone, note: form.note, preorder: lines }));
      setDone(res);
    } catch (e) { setErr(errMessage(e, ui.common.error)); tablesQ.reload(); slots.reload(); } finally { setBusy(false); }
  }

  if (loading && !r) return <RestoLayout><Spinner label={ui.common.loading} /></RestoLayout>;
  if (error && !r) return <RestoLayout><ErrorState onRetry={reload} message={error?.status === 404 ? p.notFound : undefined} /></RestoLayout>;

  if (done) return (
    <RestoLayout width="max-w-xl">
      <div className="rounded-3xl border border-line bg-surface p-8 text-center">
        <span className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto mb-4"><Check /></span>
        <h1 className="font-display text-3xl text-ink mb-2">{p.done}</h1>
        <p className="text-ink-soft mb-6">{done.status === "confirmed" ? p.doneConfirmed : p.donePending}</p>
        <dl className="text-sm text-left rounded-2xl bg-latte-soft/60 p-5 space-y-2 mb-6">
          <div className="flex justify-between"><dt className="text-ink-soft">{p.code}</dt><dd className="font-mono font-medium text-ink">{done.code}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">{r.name}</dt><dd className="text-ink">{fmtDay(done.day, lang)} · {done.time}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">{p.party}</dt><dd className="text-ink">{done.party_size}</dd></div>
          {done.table_label && <div className="flex justify-between"><dt className="text-ink-soft">{p.table}</dt><dd className="text-ink">{done.table_label}</dd></div>}
        </dl>
        <Link to="/restaurant/mes-reservations" className="inline-block rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5">{p.seeMine}</Link>
      </div>
    </RestoLayout>
  );

  const cuisine = r.cuisines.map((c) => ui.cuisines[c] || c).join(" · ");
  const days = ui.days;
  return (
    <RestoLayout>
      <div className="grid lg:grid-cols-[1fr_380px] gap-10 items-start">
        <div className="min-w-0 space-y-12">
          <header>
            {r.images.length >= 3 ? (
              <div className="grid grid-cols-3 gap-2 rounded-3xl overflow-hidden mb-6">
                <RestoImage path={r.images[0]} alt={r.name} ratio="aspect-[16/10]" className="col-span-3 sm:col-span-2 sm:row-span-2" />
                {r.images.slice(1, 3).map((im) => <RestoImage key={im} path={im} alt="" ratio="aspect-[4/3]" className="hidden sm:block" />)}
              </div>
            ) : <RestoImage path={r.images[0]} alt={r.name} ratio="aspect-[16/9]" className="rounded-3xl mb-6" />}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h1 className="font-display text-4xl text-ink leading-tight">{r.name}</h1><p className="text-ink-soft mt-1">{[cuisine, priceSigns(r.price_level), [r.area, r.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</p></div>
              <Rating value={r.rating_avg} count={r.rating_count} />
            </div>
            <div className="flex flex-wrap gap-2 mt-4 text-xs">
              {r.instant_confirm && <span className="inline-flex items-center gap-1 rounded-full bg-latte-soft text-coffee px-3 py-1.5"><Zap size={12} />{p.instant}</span>}
              {r.has_terrace && <span className="rounded-full bg-latte-soft text-coffee px-3 py-1.5">{p.terrace}</span>}
              {r.accepts_preorder && <span className="rounded-full bg-latte-soft text-coffee px-3 py-1.5">{p.preorderOn}</span>}
              <span className="inline-flex items-center gap-1 rounded-full bg-latte-soft text-coffee px-3 py-1.5"><Clock size={12} />{r.open_time}–{r.close_time}</span>
            </div>
            {r.description && <p className="text-ink-soft leading-relaxed mt-6 whitespace-pre-line">{r.description}</p>}
          </header>

          {r.tables.length > 0 && !no3d && (
            <section aria-labelledby="visit">
              <h2 id="visit" className="font-display text-2xl text-ink mb-2">{p.visit}</h2>
              <p className="text-sm text-ink-soft mb-4">{p.visitHint}</p>
              <Suspense fallback={<div className="h-[460px] rounded-3xl bg-latte-soft/50 flex items-center justify-center"><Spinner label={ui.common.loading} /></div>}>
                <DiningRoom3D restaurant={r} tables={r.tables} statuses={statuses} selectedId={tableId} onSelect={(tb) => { if (statuses[tb.id] && statuses[tb.id] !== "free") { toast?.info?.(`${p.table} ${tb.label} — ${p.legend[statuses[tb.id]]}`); return; } setTableId(tb.id === tableId ? null : tb.id); }} onUnsupported={() => setNo3d(true)} />
              </Suspense>
              <div className="mt-3"><Legend /></div>
            </section>
          )}
          {(no3d || r.tables.length > 0) && no3d && (
            <section><h2 className="font-display text-2xl text-ink mb-3">{p.table}</h2><p className="text-sm text-ink-soft mb-3">{p.pickTable}</p>
              <div className="flex flex-wrap gap-2">{r.tables.map((tb) => <button key={tb.id} disabled={statuses[tb.id] && statuses[tb.id] !== "free"} onClick={() => setTableId(tb.id)} className={`rounded-full border px-4 py-2 text-sm disabled:opacity-40 ${tableId === tb.id ? "border-coffee bg-latte-soft" : "border-line"}`}>{tb.label} · {p.seatsN(tb.seats)}</button>)}</div></section>
          )}

          <section aria-labelledby="menu">
            <h2 id="menu" className="font-display text-2xl text-ink mb-4">{p.menu}</h2>
            {r.accepts_preorder && r.menu.length > 0 && <p className="text-sm text-ink-soft mb-4">{p.preorderHint}</p>}
            <Menu menu={r.menu} qty={qty} setQty={setQty} canOrder={r.accepts_preorder} money={money} />
          </section>

          <ReviewsBlock id={r.id} />

          <section aria-labelledby="info" className="grid sm:grid-cols-2 gap-6">
            <Card>
              <h2 id="info" className="font-display text-xl text-ink mb-4">{p.info}</h2>
              <ul className="space-y-3 text-sm text-ink-soft">
                {r.address && <li className="flex gap-2"><MapPin size={16} className="shrink-0 mt-0.5 text-coffee" />{r.address}</li>}
                {r.phone && <li className="flex gap-2"><Phone size={16} className="shrink-0 mt-0.5 text-coffee" /><a href={`tel:${r.phone}`} className="hover:text-ink">{r.phone}</a></li>}
                {r.whatsapp && <li className="flex gap-2"><Utensils size={16} className="shrink-0 mt-0.5 text-coffee" /><a href={`https://wa.me/${r.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="hover:text-ink">WhatsApp</a></li>}
              </ul>
              <h3 className="text-sm font-medium text-ink mt-5 mb-2">{p.hours}</h3>
              <ul className="text-sm text-ink-soft grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">{days.map((d, i) => <li key={d} className="contents"><span>{d}</span><span className={r.closed_days.includes(i) ? "text-red-600" : ""}>{r.closed_days.includes(i) ? p.closed : `${r.open_time}–${r.close_time}`}</span></li>)}</ul>
            </Card>
            {r.latitude != null && r.longitude != null && (
              <div className="rounded-3xl overflow-hidden border border-line min-h-[240px] relative">
                <iframe title="map" src={osmEmbedUrl(r.latitude, r.longitude)} loading="lazy" className="absolute inset-0 w-full h-full border-0" />
                <a href={osmLink(r.latitude, r.longitude)} target="_blank" rel="noreferrer" className="absolute bottom-3 right-3 rounded-full bg-white text-black text-xs font-medium px-3 py-1.5">{p.map}</a>
              </div>
            )}
          </section>
        </div>

        {/* Réservation */}
        <aside className="lg:sticky lg:top-[148px]" aria-label={p.reserve}>
          <Card className="space-y-5">
            <h2 className="font-display text-2xl text-ink">{p.reserve}</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label={p.date} htmlFor="rd"><input id="rd" type="date" min={isoToday()} value={day} onChange={(e) => { setDay(e.target.value); setTime(""); setTableId(null); }} className={inputCls} /></Field>
              <Field label={p.party} htmlFor="rp"><input id="rp" type="number" min="1" max={r.max_party} value={party} onChange={(e) => { setParty(Math.max(1, Math.min(r.max_party, Number(e.target.value) || 1))); setTableId(null); }} className={inputCls} /></Field>
            </div>
            <div>
              <p className="text-sm font-medium text-ink mb-2">{p.slotsTitle}</p>
              {closedToday || slots.data?.closed ? <p className="text-sm text-red-600">{p.closedDay}</p>
                : slots.loading && !slots.data ? <Spinner label="" /> : !slots.data?.slots?.length ? <p className="text-sm text-ink-soft">{p.noSlots}</p> : (
                  <div className="flex flex-wrap gap-2">
                    {slots.data.slots.map((s) => { const off = s.free <= 0 || slotPassed(day, s.time); return (
                      <button key={s.time} disabled={off} onClick={() => { setTime(s.time); setTableId(null); }} aria-pressed={time === s.time} title={slotPassed(day, s.time) ? p.pastSlot : s.free <= 0 ? p.slotFull : ""}
                        className={`rounded-full border px-3.5 py-2 text-sm transition ${time === s.time ? "border-coffee bg-latte-soft text-ink" : "border-line text-ink-soft hover:border-coffee-light"} disabled:opacity-35 disabled:line-through`}>{s.time}</button>); })}
                  </div>)}
            </div>
            <div className="rounded-2xl bg-latte-soft/60 p-4 text-sm">
              {table ? <p className="text-ink"><b>{p.table} {table.label}</b> · {p.seatsN(table.seats)}</p> : time && freeCount === 0 && tablesQ.data ? <p className="text-red-600">{p.noTable}</p> : <p className="text-ink-soft">{r.tables.length ? p.pickTable : p.autoTable}</p>}
              {table && <button onClick={() => setTableId(null)} className="text-xs text-coffee underline mt-1">{p.autoTable}</button>}
            </div>
            <Field label={p.yourName} htmlFor="rn"><input id="rn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} autoComplete="name" /></Field>
            <Field label={p.yourPhone} htmlFor="rt"><input id="rt" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} inputMode="tel" autoComplete="tel" /></Field>
            <Field label={p.note} htmlFor="rno"><textarea id="rno" rows={2} maxLength={400} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={p.notePh} className={inputCls} /></Field>
            {lines.length > 0 && (
              <div className="text-sm border-t border-line pt-4">
                <ul className="space-y-1 mb-2">{lines.map((l) => <li key={l.item_id} className="flex justify-between text-ink-soft"><span>{l.qty} × {menuIdx[l.item_id]?.name}</span><span>{money(menuIdx[l.item_id]?.price * l.qty)}</span></li>)}</ul>
                <p className="flex justify-between font-medium text-ink"><span>{p.total}</span><span>{money(total)}</span></p>
              </div>
            )}
            {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
            <button onClick={reserve} disabled={busy || !time || form.name.trim().length < 2 || closedToday || (!!tablesQ.data && freeCount === 0 && !!time)} className="w-full rounded-full bg-ink text-cream text-sm font-medium py-3.5 disabled:opacity-45">
              {busy ? p.booking : !isAuthenticated ? p.loginToBook : table ? p.book : p.bookAny}
            </button>
            <p className="text-xs text-ink-faint text-center">{p.maxParty(r.max_party)}</p>
          </Card>
        </aside>
      </div>
    </RestoLayout>
  );
}

function ReviewsBlock({ id }) {
  const ui = useRestoUi();
  const { data } = useLoad(() => api.resto.reviews(id), [id]);
  return (
    <section aria-labelledby="reviews">
      <h2 id="reviews" className="font-display text-2xl text-ink mb-4">{ui.page.reviews}</h2>
      {!data?.length ? <p className="text-sm text-ink-soft">{ui.page.reviewsEmpty}</p> : (
        <ul className="space-y-4">{data.map((x) => (
          <li key={x.id} className="rounded-2xl border border-line bg-surface p-4"><div className="flex items-center justify-between mb-1"><span className="font-medium text-ink text-sm">{x.author}</span><Rating value={x.rating} count={1} /></div>{x.comment && <p className="text-sm text-ink-soft">{x.comment}</p>}</li>
        ))}</ul>
      )}
    </section>
  );
}
