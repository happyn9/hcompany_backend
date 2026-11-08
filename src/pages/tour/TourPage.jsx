import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Check, Clock, Globe, Mountain, Minus, Plus, ShieldCheck, Users, Zap } from "lucide-react";
import TourLayout, { Card, ErrorState, Field, Rating, Spinner, TourImage, useTourUi, inputCls } from "../../components/tourism/Shared.jsx";
import { errMessage, useLoad, useShopMoney } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { fmtDay, fmtDuration, groupByDay, quoteTotal } from "../../lib/tourism.js";
import { osmEmbedUrl, osmLink } from "../../lib/lodge.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

function Stepper({ value, onChange, min = 0, max = 40, label }) {
  return (
    <div className="inline-flex items-center gap-3" role="group" aria-label={label}>
      <button type="button" aria-label="−" disabled={value <= min} onClick={() => onChange(value - 1)} className="w-9 h-9 rounded-full border border-line flex items-center justify-center disabled:opacity-35"><Minus size={15} /></button>
      <span className="w-6 text-center text-ink font-medium" aria-live="polite">{value}</span>
      <button type="button" aria-label="+" disabled={value >= max} onClick={() => onChange(value + 1)} className="w-9 h-9 rounded-full border border-line flex items-center justify-center disabled:opacity-35"><Plus size={15} /></button>
    </div>
  );
}

function Fact({ icon: Icon, label, children }) {
  return <div className="rounded-2xl border border-line bg-surface p-4"><p className="text-xs text-ink-faint mb-1 inline-flex items-center gap-1.5"><Icon size={13} />{label}</p><p className="text-sm text-ink font-medium">{children}</p></div>;
}

export default function TourPage() {
  const { slug } = useParams();
  const ui = useTourUi();
  const p = ui.page;
  const { lang } = useLanguage();
  const nav = useNavigate();
  const loc = useLocation();
  const { isAuthenticated, user, withAuth } = useUser();
  const { money } = useShopMoney();
  const [sp] = useSearchParams();
  const { data: t, error, loading, reload } = useLoad(() => api.tour.detail(slug), [slug]);
  usePageMeta(t ? { title: `${t.title} · H-Tourisme`, description: t.summary } : null);

  const [depId, setDepId] = useState(null);
  const [day, setDay] = useState(sp.get("day") || "");
  const [adults, setAdults] = useState(Math.max(1, Number(sp.get("people")) || 2));
  const [children, setChildren] = useState(0);
  const [form, setForm] = useState({ name: "", phone: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  useEffect(() => { if (user && !form.name) setForm((f) => ({ ...f, name: user.full_name || user.name || "" })); }, [user]); // eslint-disable-line

  const groups = useMemo(() => groupByDay(t?.departures || []), [t]);
  const todays = groups.find((g) => g.day === day) || null;
  useEffect(() => { // jour par défaut : demandé, sinon le premier avec des places
    if (!groups.length) return;
    if (!groups.some((g) => g.day === day)) setDay((groups.find((g) => g.items.some((d) => d.seats_left >= adults)) || groups[0]).day);
  }, [groups]); // eslint-disable-line
  useEffect(() => { // départ par défaut : premier avec assez de places
    if (!todays) { setDepId(null); return; }
    if (!todays.items.some((d) => d.id === depId)) setDepId((todays.items.find((d) => d.seats_left >= adults + children) || todays.items[0]).id);
  }, [todays]); // eslint-disable-line
  const dep = t?.departures.find((d) => d.id === depId);
  const total = quoteTotal(dep, adults, children);
  const n = adults + children;
  const tooMany = dep && n > dep.seats_left;

  async function reserve() {
    if (!isAuthenticated) { nav("/connexion", { state: { redirectTo: loc.pathname + loc.search } }); return; }
    setBusy(true); setErr("");
    try { setDone(await withAuth((tk) => api.tour.book(tk, { departure_id: dep.id, adults, children, name: form.name, phone: form.phone, note: form.note }))); } catch (e) { setErr(errMessage(e, ui.common.error)); reload(); } finally { setBusy(false); }
  }

  if (loading && !t) return <TourLayout><Spinner label={ui.common.loading} /></TourLayout>;
  if (error && !t) return <TourLayout><ErrorState onRetry={reload} message={error?.status === 404 ? p.notFound : undefined} /></TourLayout>;

  if (done) return (
    <TourLayout width="max-w-xl">
      <div className="rounded-3xl border border-line bg-surface p-8 text-center">
        <span className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto mb-4"><Check /></span>
        <h1 className="font-display text-3xl text-ink mb-2">{p.done}</h1>
        <p className="text-ink-soft mb-6">{done.status === "confirmed" ? p.doneConfirmed : p.donePending}</p>
        <dl className="text-sm text-left rounded-2xl bg-latte-soft/60 p-5 space-y-2 mb-6">
          <div className="flex justify-between"><dt className="text-ink-soft">{p.code}</dt><dd className="font-mono font-medium text-ink">{done.code}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-ink-soft">{t.title}</dt><dd className="text-ink text-right">{fmtDay(done.day, lang)} · {done.time}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">{ui.common.people}</dt><dd className="text-ink">{done.adults + done.children}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">{p.total}</dt><dd className="text-ink">{money(done.total)}</dd></div>
        </dl>
        <Link to="/tourisme/mes-reservations" className="inline-block rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5">{p.seeMine}</Link>
      </div>
    </TourLayout>
  );

  return (
    <TourLayout>
      <div className="grid lg:grid-cols-[1fr_380px] gap-10 items-start">
        <div className="min-w-0 space-y-12">
          <header>
            {t.images.length >= 3 ? (
              <div className="grid grid-cols-3 gap-2 rounded-3xl overflow-hidden mb-6">
                <TourImage path={t.images[0]} alt={t.title} ratio="aspect-[16/10]" className="col-span-3 sm:col-span-2 sm:row-span-2" />
                {t.images.slice(1, 3).map((im) => <TourImage key={im} path={im} alt="" ratio="aspect-[4/3]" className="hidden sm:block" />)}
              </div>
            ) : <TourImage path={t.images[0]} alt={t.title} ratio="aspect-[16/9]" className="rounded-3xl mb-6" />}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs uppercase tracking-[0.18em] text-coffee mb-2">{ui.cats[t.category]} · {t.city}</p><h1 className="font-display text-4xl text-ink leading-tight">{t.title}</h1></div>
              <Rating value={t.rating_avg} count={t.rating_count} />
            </div>
            {t.summary && <p className="text-ink-soft mt-3 text-lg">{t.summary}</p>}
          </header>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Fact icon={Clock} label={p.duration}>{fmtDuration(t.duration_hours, lang)}</Fact>
            <Fact icon={Mountain} label={p.level}>{ui.diff[t.difficulty]}{t.min_age ? ` · ${p.minAge(t.min_age)}` : ""}</Fact>
            <Fact icon={Globe} label={p.languages}>{t.languages.map((l) => ui.langs[l] || l).join(", ")}</Fact>
            <Fact icon={Users} label={p.group}>{p.upTo(t.max_group)}</Fact>
          </div>

          {t.description && <section><h2 className="font-display text-2xl text-ink mb-3">{p.about}</h2><p className="text-ink-soft leading-relaxed whitespace-pre-line">{t.description}</p></section>}

          {t.itinerary.length > 0 && (
            <section><h2 className="font-display text-2xl text-ink mb-5">{p.itinerary}</h2>
              <ol className="relative border-l border-line ml-3 space-y-6">{t.itinerary.map((s, i) => (
                <li key={i} className="pl-6 relative"><span className="absolute -left-[13px] top-0 w-6 h-6 rounded-full bg-ink text-cream text-xs flex items-center justify-center">{i + 1}</span><p className="font-medium text-ink">{s.title}</p>{s.text && <p className="text-sm text-ink-soft mt-1">{s.text}</p>}</li>))}</ol></section>
          )}

          {(t.includes.length > 0 || t.excludes.length > 0) && (
            <section className="grid sm:grid-cols-2 gap-6">
              {t.includes.length > 0 && <Card><h2 className="font-display text-xl text-ink mb-3">{p.included}</h2><ul className="space-y-2 text-sm text-ink-soft">{t.includes.map((x) => <li key={x} className="flex gap-2"><Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />{x}</li>)}</ul></Card>}
              {t.excludes.length > 0 && <Card><h2 className="font-display text-xl text-ink mb-3">{p.excluded}</h2><ul className="space-y-2 text-sm text-ink-soft">{t.excludes.map((x) => <li key={x} className="flex gap-2"><span className="w-4 text-center text-red-500 shrink-0">×</span>{x}</li>)}</ul></Card>}
            </section>
          )}

          <section className="grid sm:grid-cols-2 gap-6">
            <Card><h2 className="font-display text-xl text-ink mb-3">{p.meeting}</h2><p className="text-sm text-ink-soft">{t.meeting_point}</p>
              <ul className="mt-4 space-y-2 text-sm text-ink-soft"><li className="flex gap-2"><ShieldCheck size={16} className="text-coffee shrink-0 mt-0.5" />{p.cancel(t.cancel_hours)}</li>{t.instant_confirm && <li className="flex gap-2"><Zap size={16} className="text-coffee shrink-0 mt-0.5" />{p.instant}</li>}</ul></Card>
            {t.latitude != null && t.longitude != null && (
              <div className="rounded-3xl overflow-hidden border border-line min-h-[220px] relative"><iframe title="map" src={osmEmbedUrl(t.latitude, t.longitude)} loading="lazy" className="absolute inset-0 w-full h-full border-0" />
                <a href={osmLink(t.latitude, t.longitude)} target="_blank" rel="noreferrer" className="absolute bottom-3 right-3 rounded-full bg-white text-black text-xs font-medium px-3 py-1.5">{p.map}</a></div>
            )}
          </section>

          <ReviewsBlock id={t.id} />
        </div>

        <aside className="lg:sticky lg:top-[148px]" aria-label={p.book}>
          <Card className="space-y-5">
            <div><p className="text-xs text-ink-faint">{ui.common.from}</p><p className="font-display text-3xl text-ink">{money(t.from_price)}<span className="text-sm text-ink-faint font-sans"> {ui.common.perAdult}</span></p></div>
            {groups.length === 0 ? <p className="text-sm text-ink-soft">{p.noDeparture}</p> : (
              <>
                <div>
                  <p className="text-sm font-medium text-ink mb-2">{p.pickDate}</p>
                  <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                    {groups.map((g) => { const full = g.items.every((d) => d.seats_left < 1); return (
                      <button key={g.day} onClick={() => setDay(g.day)} disabled={full} aria-pressed={day === g.day} className={`shrink-0 rounded-2xl border px-3.5 py-2 text-sm text-center disabled:opacity-35 disabled:line-through ${day === g.day ? "border-coffee bg-latte-soft text-ink" : "border-line text-ink-soft hover:border-coffee-light"}`}>{fmtDay(g.day, lang, { weekday: "short", day: "numeric", month: "short" })}</button>); })}
                  </div>
                </div>
                {todays && (
                  <div>
                    <p className="text-sm font-medium text-ink mb-2">{p.pickTime}</p>
                    <div className="flex flex-wrap gap-2">{todays.items.map((d) => (
                      <button key={d.id} onClick={() => setDepId(d.id)} disabled={d.seats_left < 1} aria-pressed={depId === d.id} className={`rounded-xl border px-3.5 py-2 text-sm text-left disabled:opacity-40 ${depId === d.id ? "border-coffee bg-latte-soft" : "border-line hover:border-coffee-light"}`}>
                        <span className="block text-ink font-medium">{d.time}</span><span className={`block text-xs ${d.seats_left < 1 ? "text-red-600" : d.seats_left <= 3 ? "text-amber-700" : "text-ink-faint"}`}>{d.seats_left < 1 ? p.full : p.seatsLeft(d.seats_left)}</span></button>))}</div>
                  </div>
                )}
                <div className="space-y-3">
                  <div className="flex items-center justify-between"><div><p className="text-sm text-ink">{p.adults}</p><p className="text-xs text-ink-faint">{dep ? money(dep.price_adult) : ""}</p></div><Stepper value={adults} min={1} max={40} onChange={setAdults} label={p.adults} /></div>
                  {dep?.price_child != null && <div className="flex items-center justify-between"><div><p className="text-sm text-ink">{p.children}</p><p className="text-xs text-ink-faint">{money(dep.price_child)}</p></div><Stepper value={children} max={40} onChange={setChildren} label={p.children} /></div>}
                </div>
                <Field label={p.name} htmlFor="tn"><input id="tn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} autoComplete="name" /></Field>
                <Field label={p.phone} htmlFor="tp"><input id="tp" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} inputMode="tel" autoComplete="tel" /></Field>
                <Field label={p.note} htmlFor="tno"><textarea id="tno" rows={2} maxLength={400} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={p.notePh} className={inputCls} /></Field>
                <div className="border-t border-line pt-4"><p className="flex justify-between font-medium text-ink"><span>{p.total}</span><span>{money(total)}</span></p><p className="text-xs text-ink-faint mt-1">{p.payOnSite}</p></div>
                {tooMany && <p role="alert" className="text-sm text-red-600">{p.tooMany(dep.seats_left)}</p>}
                {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
                <button onClick={reserve} disabled={busy || !dep || tooMany || dep.seats_left < 1 || form.name.trim().length < 2} className="w-full rounded-full bg-ink text-cream text-sm font-medium py-3.5 disabled:opacity-45">{busy ? p.booking : !isAuthenticated ? p.loginToBook : p.reserve}</button>
              </>
            )}
          </Card>
        </aside>
      </div>
    </TourLayout>
  );
}

function ReviewsBlock({ id }) {
  const ui = useTourUi();
  const { data } = useLoad(() => api.tour.reviews(id), [id]);
  return (
    <section aria-labelledby="reviews">
      <h2 id="reviews" className="font-display text-2xl text-ink mb-4">{ui.page.reviews}</h2>
      {!data?.length ? <p className="text-sm text-ink-soft">{ui.page.reviewsEmpty}</p> : (
        <ul className="space-y-4">{data.map((x) => <li key={x.id} className="rounded-2xl border border-line bg-surface p-4"><div className="flex items-center justify-between mb-1"><span className="font-medium text-ink text-sm">{x.author}</span><Rating value={x.rating} count={1} /></div>{x.comment && <p className="text-sm text-ink-soft">{x.comment}</p>}</li>)}</ul>
      )}
    </section>
  );
}
