import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Eye, Pause, Play, Plus, Send, Store } from "lucide-react";
import TourLayout, { Card, ErrorState, Field, Spinner, StatusPill, TourAuthGate, useTourUi, inputCls } from "../../components/tourism/Shared.jsx";
import { errMessage, useLoad } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { api } from "../../lib/api.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const Tabs = lazy(() => import("./TourProTabs.jsx"));
const TAB_KEYS = ["overview", "departures", "bookings", "info"];

function Create({ onCreated }) {
  const ui = useTourUi();
  const t = ui.pro;
  const { withAuth } = useUser();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function go(e) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { onCreated(await withAuth((tk) => api.tour.owner.create(tk, { title }))); } catch (x) { setErr({ msg: errMessage(x, ui.common.error), module: x?.status === 403 }); } finally { setBusy(false); }
  }
  return (
    <Card className="max-w-xl">
      <h2 className="font-display text-2xl text-ink mb-4">{t.newTitle}</h2>
      <form onSubmit={go} className="space-y-4">
        <Field label={t.name} htmlFor="tt"><input id="tt" value={title} onChange={(e) => setTitle(e.target.value)} minLength={2} maxLength={90} required className={inputCls} /></Field>
        {err && <div role="alert" className="text-sm text-red-600">{err.module ? t.needModule : err.msg}{err.module && <Link to="/dashboard" className="block mt-2 underline text-coffee">{t.openModules}</Link>}</div>}
        <button disabled={busy || title.trim().length < 2} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5 disabled:opacity-50"><Plus size={16} />{t.create}</button>
      </form>
    </Card>
  );
}

function Inner() {
  const ui = useTourUi();
  const t = ui.pro;
  usePageMeta({ title: t.eyebrow });
  const { withAuth } = useUser();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const { data, error, loading, reload } = useLoad(() => withAuth((tk) => api.tour.owner.list(tk)), []);
  const [list, setList] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setList(data); }, [data]);
  const tid = Number(sp.get("r")) || list?.[0]?.id;
  const r = list?.find((x) => x.id === tid);
  const tab = TAB_KEYS.includes(sp.get("tab")) ? sp.get("tab") : "overview";
  const setParam = (k, v) => { const n = new URLSearchParams(sp); n.set(k, v); setSp(n, { replace: true }); };
  const refresh = async () => { const fresh = await withAuth((tk) => api.tour.owner.list(tk)); setList(fresh); return fresh; };
  async function act(what) {
    setBusy(true);
    try { await withAuth((tk) => api.tour.owner.act(tk, r.id, what)); await refresh(); if (what === "submit") toast?.success?.(t.submitted); } catch (e) { toast?.error?.(errMessage(e, ui.common.error)); } finally { setBusy(false); }
  }
  if (loading && !list) return <TourLayout><Spinner label={ui.common.loading} /></TourLayout>;
  if (error && !list) return <TourLayout><ErrorState onRetry={reload} /></TourLayout>;
  if (!list?.length || creating) return (
    <TourLayout width="max-w-4xl">
      <p className="text-xs uppercase tracking-[0.2em] text-coffee mb-3">{t.eyebrow}</p>
      <h1 className="font-display text-4xl text-ink mb-3">{t.title}</h1>
      <p className="text-ink-soft mb-8 max-w-xl">{t.lead}</p>
      <Create onCreated={async (c) => { setCreating(false); await refresh(); setSp({ r: String(c.id), tab: "info" }, { replace: true }); }} />
    </TourLayout>
  );
  if (!r) return null;
  return (
    <TourLayout width="max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-coffee mb-2">{t.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3"><h1 className="font-display text-3xl sm:text-4xl text-ink">{r.title}</h1><StatusPill status={r.status} kind="tour" /></div>
          <p className="text-sm text-ink-soft mt-2 max-w-xl">{r.status_reason ? `${r.status_reason} — ` : ""}{t.statusHint[r.status]}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {list.length > 1 && <select aria-label={t.mine} value={r.id} onChange={(e) => setParam("r", e.target.value)} className={`${inputCls} !w-auto`}>{list.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select>}
          {r.status === "active" && <Link to={`/tourisme/t/${r.slug}`} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm"><Eye size={15} />{ui.page.book}</Link>}
          {["draft", "rejected"].includes(r.status) && <button disabled={busy} onClick={() => act("submit")} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream px-5 py-2.5 text-sm disabled:opacity-50"><Send size={15} />{t.submit}</button>}
          {r.status === "active" && <button disabled={busy} onClick={() => act("pause")} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm"><Pause size={15} />{t.pause}</button>}
          {r.status === "paused" && <button disabled={busy} onClick={() => act("resume")} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream px-5 py-2.5 text-sm"><Play size={15} />{t.resume}</button>}
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm"><Store size={15} />{t.newTitle}</button>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-line mb-8" aria-label="tabs">
        {TAB_KEYS.map((k) => (
          <button key={k} onClick={() => setParam("tab", k)} aria-current={tab === k} className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === k ? "border-coffee text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}>
            {t.tabs[k]}{k === "bookings" && r.pending_bookings > 0 && <span className="ml-2 rounded-full bg-coffee text-cream text-[11px] px-1.5 py-0.5">{r.pending_bookings}</span>}
          </button>
        ))}
      </nav>
      <Suspense fallback={<Spinner label={ui.common.loading} />}><Tabs tab={tab} r={r} refresh={refresh} goTab={(k) => setParam("tab", k)} /></Suspense>
    </TourLayout>
  );
}

export default function TourPro() { return <TourAuthGate><Inner /></TourAuthGate>; }
