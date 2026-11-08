import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, BadgeCheck, Banknote, CalendarCheck, CalendarDays, Eye, Home, Pause, Pencil, Play, Plus, Send, ShieldCheck, SlidersHorizontal, Star, Trash2, TrendingUp, User, Wallet } from "lucide-react";
import LodgeLayout from "../../components/lodge/LodgeLayout.jsx";
import LodgeAuthGate from "../../components/lodge/AuthGate.jsx";
import { EmptyState, ErrorState, LodgeImage, LodgeStatusPill, Spinner, useLodgeUi } from "../../components/lodge/Shared.jsx";
import { Card, Field, HostUploader, OPERATORS, inputCls, useHostUi, validationMessage } from "../../components/lodge/HostUi.jsx";
import { errMessage, useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { formatRange } from "../../lib/lodge.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const HostTabs = lazy(() => import("./HostTabs.jsx"));

const PROFILE_LABELS = (t) => ({ display_name: t.name, bio: t.bio, phone: t.phone, whatsapp: t.whatsapp, languages: t.languages, mobile_money_phone: t.mmPhone, mobile_money_operator: t.operator });

/* ---------- Création du profil hôte ---------- */
function HostStart({ onCreated }) {
  const h = useHostUi();
  const t = h.start;
  const { lang } = useLanguage();
  const { withAuth, user } = useUser();
  const toast = useToast();
  const [f, setF] = useState({ display_name: user?.full_name || user?.name || "", bio: "", phone: "", whatsapp: "", languages: "Français, English", avatar_path: null, mobile_money_operator: "", mobile_money_phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const me = await withAuth((tk) => api.lodge.hosting.saveMe(tk, f));
      toast?.success?.(t.created);
      onCreated(me);
    } catch (err) { setError(validationMessage(err, PROFILE_LABELS(t), lang, errMessage(err, h.common.error))); } finally { setBusy(false); }
  }
  return (
    <LodgeLayout width="max-w-6xl">
      <div className="grid lg:grid-cols-2 gap-12 items-start">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-coffee mb-3">{t.eyebrow}</p>
          <h1 className="font-display text-4xl sm:text-5xl text-ink leading-tight mb-5">{t.title}</h1>
          <p className="text-ink-soft leading-relaxed mb-10">{t.lead}</p>
          <div className="grid sm:grid-cols-2 gap-4 mb-10">
            {t.benefits.map((b, i) => (
              <div key={b.t} className="rounded-2xl border border-line bg-surface p-5">
                <span className="w-9 h-9 rounded-full bg-latte-soft text-coffee flex items-center justify-center mb-3">{[<ShieldCheck key="a" size={17} />, <SlidersHorizontal key="b" size={17} />, <CalendarCheck key="c" size={17} />, <Banknote key="d" size={17} />][i]}</span>
                <p className="font-medium text-ink text-sm mb-1">{b.t}</p>
                <p className="text-sm text-ink-soft leading-relaxed">{b.d}</p>
              </div>
            ))}
          </div>
          <h2 className="font-display text-xl text-ink mb-4">{t.stepsTitle}</h2>
          <ol className="space-y-4">
            {t.steps.map((s, i) => (
              <li key={s.t} className="flex gap-4"><span className="w-8 h-8 shrink-0 rounded-full bg-ink text-cream text-sm flex items-center justify-center">{i + 1}</span><div><p className="text-sm font-medium text-ink">{s.t}</p><p className="text-sm text-ink-soft">{s.d}</p></div></li>
            ))}
          </ol>
        </div>
        <form onSubmit={submit} className="rounded-3xl border border-line bg-surface p-6 sm:p-8 space-y-5 lg:sticky lg:top-28">
          <h2 className="font-display text-2xl text-ink">{t.formTitle}</h2>
          <Field label={t.name} hint={t.nameHint} htmlFor="hn"><input id="hn" required minLength={2} maxLength={80} className={inputCls} value={f.display_name} onChange={set("display_name")} /></Field>
          <Field label={t.bio} hint={t.bioHint} htmlFor="hb"><textarea id="hb" rows={3} maxLength={1500} className={`${inputCls} resize-none`} value={f.bio} onChange={set("bio")} /></Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={t.phone} htmlFor="hp"><input id="hp" type="tel" required className={inputCls} value={f.phone} onChange={set("phone")} placeholder="097…" /></Field>
            <Field label={t.whatsapp} htmlFor="hw"><input id="hw" type="tel" className={inputCls} value={f.whatsapp} onChange={set("whatsapp")} /></Field>
          </div>
          <Field label={t.languages} htmlFor="hl"><input id="hl" className={inputCls} value={f.languages} onChange={set("languages")} /></Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={t.operator} htmlFor="ho"><select id="ho" className={inputCls} value={f.mobile_money_operator} onChange={set("mobile_money_operator")}><option value="">{t.noOperator}</option>{OPERATORS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label={t.mmPhone} htmlFor="hm"><input id="hm" type="tel" className={inputCls} value={f.mobile_money_phone} onChange={set("mobile_money_phone")} /></Field>
          </div>
          <p className="text-xs text-ink-faint -mt-2">{t.mmHint}</p>
          {error && <p role="alert" className="text-sm text-red-600 flex gap-2"><AlertCircle size={16} className="shrink-0 mt-0.5" /> {error}</p>}
          <button disabled={busy} className="w-full rounded-full bg-ink text-cream text-sm font-medium py-4 hover:bg-coffee-dark disabled:opacity-50">{busy ? h.common.saving : t.create}</button>
        </form>
      </div>
    </LodgeLayout>
  );
}

/* ---------- Vue d'ensemble ---------- */
function Stat({ icon: Icon, label, value, accent }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <span className={`w-9 h-9 rounded-full flex items-center justify-center mb-3 ${accent ? "bg-ink text-cream" : "bg-latte-soft text-coffee"}`}><Icon size={16} /></span>
      <p className="font-display text-2xl text-ink">{value}</p>
      <p className="text-xs text-ink-soft mt-0.5">{label}</p>
    </div>
  );
}

function Overview({ host, go }) {
  const h = useHostUi();
  const o = h.overview;
  const ui = useLodgeUi();
  const { lang } = useLanguage();
  const { token } = useUser();
  const { money } = useShopMoney();
  const stats = useLoad(() => api.lodge.hosting.stats(token), [token]);
  const props = useLoad(() => api.lodge.hosting.properties(token), [token]);
  const recent = useLoad(() => api.lodge.hosting.bookings(token), [token]);
  if (stats.loading && !stats.data) return <Spinner label={h.common.loading} />;
  if (stats.error) return <ErrorState onRetry={stats.reload} />;
  const s = stats.data;
  const drafts = (props.data || []).filter((p) => ["draft", "rejected"].includes(p.status)).length;
  const todos = [];
  if (s.pending_requests > 0) todos.push({ k: "req", text: o.todoRequests(s.pending_requests), action: o.seeRequests, onClick: () => go("bookings") });
  if (props.data && props.data.length === 0) todos.push({ k: "none", text: o.todoNoProperty, action: h.newProperty, to: "/logement/hote/logement/new" });
  if (drafts > 0) todos.push({ k: "draft", text: o.todoDrafts(drafts), action: o.complete, onClick: () => go("properties") });
  if (!host.phone && !host.whatsapp) todos.push({ k: "phone", text: o.todoPhone, action: o.complete, onClick: () => go("profile") });
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={TrendingUp} label={o.revenue} value={money(s.revenue)} accent />
        <Stat icon={Wallet} label={o.month} value={money(s.month_revenue)} />
        <Stat icon={CalendarDays} label={o.occupancy} value={`${Math.round(s.occupancy_30d)} %`} />
        <Stat icon={Star} label={o.rating} value={s.rating_count ? `${s.rating_avg.toFixed(1)} (${s.rating_count})` : "—"} />
        <Stat icon={Send} label={o.pending} value={s.pending_requests} />
        <Stat icon={CalendarCheck} label={o.upcoming} value={s.upcoming} />
        <Stat icon={User} label={o.inHouse} value={s.in_house} />
        <Stat icon={Home} label={o.live} value={`${s.active}/${s.properties}`} />
      </div>
      <Card>
        <h2 className="font-display text-xl text-ink mb-4">{o.todo}</h2>
        {todos.length === 0 ? <p className="text-sm text-ink-soft">{o.todoNone}</p> : (
          <ul className="space-y-3">
            {todos.map((x) => (
              <li key={x.k} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-latte-soft px-4 py-3">
                <span className="text-sm text-ink">{x.text}</span>
                {x.to ? <Link to={x.to} className="text-sm font-medium text-coffee hover:underline">{x.action}</Link> : <button onClick={x.onClick} className="text-sm font-medium text-coffee hover:underline">{x.action}</button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="font-display text-xl text-ink mb-4">{o.recent}</h2>
        {recent.data && recent.data.length === 0 && <p className="text-sm text-ink-soft">{o.noBookings}</p>}
        <ul className="divide-y divide-line">
          {(recent.data || []).slice(0, 5).map((b) => (
            <li key={b.code}>
              <button onClick={() => go("bookings")} className="w-full text-left py-3 flex items-center justify-between gap-3">
                <span className="min-w-0"><span className="block text-sm text-ink truncate">{b.guest_name || "—"} · {b.property.title}</span><span className="block text-xs text-ink-faint">{formatRange(b.check_in, b.check_out, lang)}</span></span>
                <span className="flex items-center gap-3 shrink-0"><span className="text-sm text-ink">{money(b.host_net || b.total)}</span><LodgeStatusPill status={b.status} /></span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* ---------- Logements ---------- */
function Properties() {
  const h = useHostUi();
  const p = h.properties;
  const ui = useLodgeUi();
  const { token, withAuth } = useUser();
  const toast = useToast();
  const { money } = useShopMoney();
  const { data, loading, error, reload } = useLoad(() => api.lodge.hosting.properties(token), [token]);
  const [busy, setBusy] = useState(null);
  async function act(id, fn, ok) {
    setBusy(id);
    try { await withAuth(fn); toast?.success?.(ok); reload(); } catch (e) { toast?.error?.(errMessage(e, h.common.error)); } finally { setBusy(null); }
  }
  if (loading && !data) return <Spinner label={h.common.loading} />;
  if (error) return <ErrorState onRetry={reload} />;
  if (!data.length) return <EmptyState icon={Home} title={p.empty} hint={p.emptyHint} action={<Link to="/logement/hote/logement/new" className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5 hover:bg-coffee-dark">{h.newProperty}</Link>} />;
  return (
    <div className="space-y-4">
      {data.map((x) => (
        <Card key={x.id} className="!p-4">
          <div className="flex gap-4">
            <LodgeImage path={x.image} alt={x.title} ratio="w-28 h-24 sm:w-40 sm:h-28" className="rounded-2xl shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium text-ink">{x.title}</p>
                <LodgeStatusPill status={x.status} tone={undefined} />
              </div>
              <p className="text-sm text-ink-soft">{ui.types[x.type]} · {x.city} · {money(x.price_per_night)} · {ui.common.perNight}</p>
              <p className="text-xs text-ink-faint mt-1">{p.stats(x.booked_count, x.pending_requests)}</p>
              {x.status_reason && ["rejected", "suspended"].includes(x.status) && <p className="mt-2 text-xs rounded-lg bg-red-500/10 text-red-700 dark:text-red-300 px-3 py-2"><strong>{p.reasonLabel} :</strong> {x.status_reason}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Link to={`/logement/hote/logement/${x.id}`} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-ink hover:border-coffee-light"><Pencil size={14} /> {p.edit}</Link>
            {["draft", "rejected"].includes(x.status) && <button disabled={busy === x.id} onClick={() => act(x.id, (t) => api.lodge.hosting.submit(t, x.id), p.submitted)} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream px-4 py-2 text-sm disabled:opacity-50"><Send size={14} /> {p.submit}</button>}
            {x.status === "active" && <><Link to={`/logement/s/${x.slug}`} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-ink hover:border-coffee-light"><Eye size={14} /> {p.view}</Link>
              <button disabled={busy === x.id} onClick={() => act(x.id, (t) => api.lodge.hosting.pause(t, x.id), p.paused)} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-ink hover:border-coffee-light disabled:opacity-50"><Pause size={14} /> {p.pause}</button></>}
            {x.status === "paused" && <button disabled={busy === x.id} onClick={() => act(x.id, (t) => api.lodge.hosting.pause(t, x.id), p.paused)} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-ink hover:border-coffee-light disabled:opacity-50"><Play size={14} /> {p.resume}</button>}
            {x.upcoming === 0 && x.pending_requests === 0 && <button disabled={busy === x.id} onClick={() => window.confirm(p.deleteConfirm) && act(x.id, (t) => api.lodge.hosting.remove(t, x.id), p.deleted)} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-red-700 dark:text-red-300 hover:border-red-500/50 disabled:opacity-50"><Trash2 size={14} /> {p.delete}</button>}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ---------- Profil ---------- */
function Profile({ host, onSaved }) {
  const h = useHostUi();
  const t = h.start;
  const { lang } = useLanguage();
  const { withAuth } = useUser();
  const toast = useToast();
  const [f, setF] = useState({ display_name: host.display_name, bio: host.bio || "", phone: host.phone || "", whatsapp: host.whatsapp || "", languages: host.languages || "", avatar_path: host.avatar_path || null, mobile_money_operator: host.mobile_money_operator || "", mobile_money_phone: host.mobile_money_phone || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try { onSaved(await withAuth((tk) => api.lodge.hosting.saveMe(tk, f))); toast?.success?.(h.profile.saved); } catch (err) { setError(validationMessage(err, PROFILE_LABELS(t), lang, errMessage(err, h.common.error))); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="max-w-2xl space-y-5">
      <div className={`rounded-2xl px-4 py-3 text-sm flex gap-2 ${host.is_verified ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : "bg-latte-soft text-ink-soft"}`}>
        {host.is_verified ? <BadgeCheck size={17} className="shrink-0" /> : <ShieldCheck size={17} className="shrink-0" />}
        <span>{host.is_verified ? h.profile.verified : h.profile.notVerified}{host.partner_name ? ` · ${h.profile.partner(host.partner_name)}` : ""}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="w-20 h-20 rounded-full bg-latte-soft text-coffee flex items-center justify-center font-display text-3xl overflow-hidden shrink-0">{f.avatar_path ? <LodgeImage path={f.avatar_path} alt="" ratio="w-full h-full" /> : (f.display_name[0] || "?").toUpperCase()}</span>
        <HostUploader label={t.avatarAdd} busyLabel={h.editor.uploading} onUploaded={([p]) => setF((s) => ({ ...s, avatar_path: p }))} />
      </div>
      <Field label={t.name} htmlFor="pn"><input id="pn" required minLength={2} className={inputCls} value={f.display_name} onChange={set("display_name")} /></Field>
      <Field label={t.bio} htmlFor="pb"><textarea id="pb" rows={4} maxLength={1500} className={`${inputCls} resize-none`} value={f.bio} onChange={set("bio")} /></Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label={t.phone} htmlFor="pp"><input id="pp" type="tel" className={inputCls} value={f.phone} onChange={set("phone")} /></Field>
        <Field label={t.whatsapp} htmlFor="pw"><input id="pw" type="tel" className={inputCls} value={f.whatsapp} onChange={set("whatsapp")} /></Field>
      </div>
      <Field label={t.languages} htmlFor="pl"><input id="pl" className={inputCls} value={f.languages} onChange={set("languages")} /></Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label={t.operator} htmlFor="po"><select id="po" className={inputCls} value={f.mobile_money_operator} onChange={set("mobile_money_operator")}><option value="">{t.noOperator}</option>{OPERATORS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label={t.mmPhone} hint={t.mmHint} htmlFor="pm"><input id="pm" type="tel" className={inputCls} value={f.mobile_money_phone} onChange={set("mobile_money_phone")} /></Field>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button disabled={busy} className="rounded-full bg-ink text-cream text-sm font-medium px-8 py-3.5 hover:bg-coffee-dark disabled:opacity-50">{busy ? h.common.saving : h.editor.save}</button>
    </form>
  );
}

const TAB_KEYS = ["overview", "bookings", "properties", "calendar", "earnings", "reviews", "profile"];

function Dashboard({ host, setHost }) {
  const h = useHostUi();
  const [params, setParams] = useSearchParams();
  const tab = TAB_KEYS.includes(params.get("tab")) ? params.get("tab") : "overview";
  const go = (k) => { setParams(k === "overview" ? {} : { tab: k }); window.scrollTo({ top: 0 }); };
  usePageMeta({ title: h.title });
  return (
    <LodgeLayout width="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-coffee mb-2">{h.title}</p>
          <h1 className="font-display text-3xl sm:text-4xl text-ink">{h.hello(host.display_name)}</h1>
        </div>
        <div className="flex gap-2">
          <Link to={`/logement/hote-profil/${host.id}`} className="rounded-full border border-line text-ink text-sm px-5 py-3 hover:border-coffee-light">{h.viewSite}</Link>
          <Link to="/logement/hote/logement/new" className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-5 py-3 hover:bg-coffee-dark"><Plus size={15} /> {h.newProperty}</Link>
        </div>
      </div>
      <div className="flex gap-1 mb-8 overflow-x-auto no-scrollbar border-b border-line" role="tablist">
        {TAB_KEYS.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k)} className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 -mb-px transition ${tab === k ? "border-coffee text-ink font-medium" : "border-transparent text-ink-soft hover:text-ink"}`}>{h.tabs[k]}</button>
        ))}
      </div>
      {tab === "overview" && <Overview host={host} go={go} />}
      {tab === "properties" && <Properties />}
      {tab === "profile" && <Profile host={host} onSaved={setHost} />}
      {["bookings", "calendar", "earnings", "reviews"].includes(tab) && (
        <Suspense fallback={<Spinner label={h.common.loading} />}><HostTabs tab={tab} host={host} go={go} /></Suspense>
      )}
    </LodgeLayout>
  );
}

function Content() {
  const h = useHostUi();
  const { token } = useUser();
  const { data, loading, error, reload } = useLoad(() => api.lodge.hosting.me(token), [token]);
  const [host, setHost] = useState(undefined);
  useEffect(() => { if (!loading && !error) setHost(data); }, [loading, error, data]);
  if (error) return <LodgeLayout width="max-w-2xl"><ErrorState onRetry={reload} /></LodgeLayout>;
  if (host === undefined) return <LodgeLayout><Spinner label={h.common.loading} /></LodgeLayout>;
  if (!host) return <HostStart onCreated={setHost} />;
  return <Dashboard host={host} setHost={setHost} />;
}

export default function HostApp() {
  const h = useHostUi();
  usePageMeta({ title: h.title });
  return <LodgeAuthGate message={h.start.signIn}><Content /></LodgeAuthGate>;
}
