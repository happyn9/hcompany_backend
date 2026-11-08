import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BadgeCheck, BedDouble, Bath, Clock, ExternalLink, Info, MapPin, MessageCircle, Share2, ShieldCheck, Users, Zap } from "lucide-react";
import LodgeLayout from "../../components/lodge/LodgeLayout.jsx";
import {
  AmenityIcon, ErrorState, HostBadge, LodgeFavoriteButton, LodgeImage, Lightbox, PropertyGrid, RangeCalendar, RatingBadge, SectionTitle, Spinner,
  Stepper, useAmenities, useLodgeUi,
} from "../../components/lodge/Shared.jsx";
import { useLoad, useShopMoney, errMessage } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { api } from "../../lib/api.js";
import { addDays, formatDay, formatRating, nightsBetween, osmEmbedUrl, osmLink, pickDate, searchQuery, todayISO } from "../../lib/lodge.js";
import PropertyTour from "../../components/lodge/PropertyTour.jsx";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

function Gallery({ images, title }) {
  const ui = useLodgeUi().property;
  const [lb, setLb] = useState(null);
  const count = images.length >= 5 ? 5 : images.length >= 3 ? 3 : images.length;
  const shown = images.slice(0, count);
  const layout = { 1: "grid-cols-1 grid-rows-1", 2: "grid-cols-2 grid-rows-1", 3: "grid-cols-2 grid-rows-2", 5: "grid-cols-4 grid-rows-2" }[count];
  const big = count === 3 ? "row-span-2" : count === 5 ? "col-span-2 row-span-2" : "";
  if (!images.length) return <LodgeImage path={null} ratio="aspect-[16/7]" className="rounded-3xl" />;
  return (
    <>
      <div className={`hidden md:grid ${layout} gap-2 rounded-3xl overflow-hidden h-[420px] relative`}>
        {shown.map((im, i) => (
          <button key={`${im}-${i}`} type="button" onClick={() => setLb(i)} aria-label={`${title} — ${i + 1}`} className={`relative overflow-hidden ${i === 0 ? big : ""}`}>
            <LodgeImage path={im} alt={`${title} — ${i + 1}`} ratio="w-full h-full" className="hover:scale-[1.03] transition-transform duration-500" />
          </button>
        ))}
        {images.length > 1 && (
          <button type="button" onClick={() => setLb(0)} className="absolute bottom-4 right-4 rounded-full bg-surface text-ink text-sm font-medium px-4 py-2 border border-line shadow">{ui.photos(images.length)}</button>
        )}
      </div>
      <div className="md:hidden -mx-4 sm:-mx-6 flex overflow-x-auto snap-x snap-mandatory no-scrollbar">
        {images.map((im, i) => (
          <button key={`${im}-${i}`} type="button" onClick={() => setLb(i)} className="snap-center shrink-0 w-[88%] first:ml-4 last:mr-4 mr-2" aria-label={`${title} — ${i + 1}`}>
            <LodgeImage path={im} alt={`${title} — ${i + 1}`} ratio="aspect-[4/3]" className="rounded-2xl" />
          </button>
        ))}
      </div>
      {lb !== null && <Lightbox images={images} index={lb} onIndex={setLb} onClose={() => setLb(null)} />}
    </>
  );
}

function ReviewBars({ summary }) {
  const ui = useLodgeUi().property;
  const { lang } = useLanguage();
  const rows = [["cleanliness", summary.cleanliness], ["accuracy", summary.accuracy], ["location", summary.location], ["value", summary.value]].filter(([, v]) => v);
  return (
    <div className="grid sm:grid-cols-2 gap-x-10 gap-y-3 mb-8">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center gap-3 text-sm">
          <span className="w-40 text-ink-soft">{ui.ratings[k]}</span>
          <span className="flex-1 h-1.5 rounded-full bg-line overflow-hidden"><span className="block h-full bg-coffee rounded-full" style={{ width: `${(v / 5) * 100}%` }} /></span>
          <span className="w-8 text-right text-ink tabular-nums">{formatRating(v, lang)}</span>
        </div>
      ))}
    </div>
  );
}

function BookingWidget({ p, sel, setSel, guests, setGuests, rooms, setRooms, quote, quoteError, quoting, onReserve, money }) {
  const ui = useLodgeUi();
  const w = ui.widget;
  const { lang } = useLanguage();
  const today = todayISO();
  const nights = nightsBetween(sel.start, sel.end);
  const dateField = "w-full bg-transparent text-sm text-ink focus:outline-none";
  const rt = p.rent_terms;
  if (rt) {
    const fr = lang !== "en";
    const row = (l, v, strong) => <div className={`flex justify-between ${strong ? "border-t border-line pt-3 items-baseline" : ""}`}><dt className={strong ? "font-medium text-ink" : "text-ink-soft"}>{l}</dt><dd className={strong ? "font-display text-2xl text-ink" : "text-ink"}>{v}</dd></div>;
    return (
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-lg shadow-coffee/5">
        <p className="mb-1"><span className="font-display text-3xl text-ink">{money(rt.monthly)}</span> <span className="text-ink-soft text-sm">{fr ? "/ mois" : "/ month"}</span></p>
        {rt.lease_min_months > 0 && <p className="text-xs text-ink-faint mb-4">{fr ? `Bail minimum : ${rt.lease_min_months} mois` : `Minimum lease: ${rt.lease_min_months} months`}</p>}
        <p className="text-sm font-medium text-ink mt-4 mb-3">{fr ? "À payer avant d'entrer" : "To pay before moving in"}</p>
        <dl className="space-y-2.5 text-sm">
          {rt.advance_months > 0 && row(fr ? `${rt.advance_months} mois d'avance` : `${rt.advance_months} months up front`, money(rt.advance_total))}
          {rt.deposit_months > 0 && row(fr ? `Garantie (${rt.deposit_months} mois)` : `Security deposit (${rt.deposit_months} mo.)`, money(rt.deposit_total))}
          {rt.commission_amount > 0 && row(fr ? `Commission H-Company (${rt.commission_pct}% d'un loyer)` : `H-Company commission (${rt.commission_pct}% of one rent)`, money(rt.commission_amount))}
          {row(fr ? "Total à l'entrée" : "Total at move-in", money(rt.move_in_total), true)}
        </dl>
        <p className="mt-4 text-xs text-ink-faint">{fr ? "Mêmes montants pour le bailleur et le locataire. La demande de location en ligne arrive bientôt." : "Same figures for the landlord and the tenant. Online rental requests are coming soon."}</p>
      </div>
    );
  }
  return (
    <div className="rounded-3xl border border-line bg-surface p-6 shadow-lg shadow-coffee/5">
      <p className="mb-5">
        <span className="font-display text-3xl text-ink">{money(quote ? quote.avg_night : p.price_per_night)}</span> <span className="text-ink-soft text-sm">{w.perNight}</span>
      </p>
      <div className="rounded-2xl border border-line overflow-hidden mb-4">
        <div className="grid grid-cols-2 divide-x divide-line">
          <label className="px-4 py-3 block">
            <span className="block text-[0.65rem] font-semibold uppercase tracking-wider text-ink-faint">{w.checkIn}</span>
            <input type="date" className={dateField} value={sel.start || ""} min={today} onChange={(e) => setSel({ start: e.target.value || null, end: e.target.value && sel.end && sel.end > e.target.value ? sel.end : e.target.value ? addDays(e.target.value, Math.max(p.min_nights, 1)) : null })} />
          </label>
          <label className="px-4 py-3 block">
            <span className="block text-[0.65rem] font-semibold uppercase tracking-wider text-ink-faint">{w.checkOut}</span>
            <input type="date" className={dateField} value={sel.end || ""} min={sel.start ? addDays(sel.start, 1) : today} onChange={(e) => setSel({ start: sel.start, end: e.target.value || null })} />
          </label>
        </div>
        <div className="border-t border-line px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-ink">{w.guests}<span className="block text-xs text-ink-faint">{w.capacity(p.max_guests * rooms)}</span></span>
          <Stepper value={guests} onChange={setGuests} min={1} max={p.max_guests * rooms} label={w.guests} />
        </div>
        {p.units > 1 && (
          <div className="border-t border-line px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-ink">{w.rooms}<span className="block text-xs text-ink-faint">{ui.property.roomsAvailable(p.units)}</span></span>
            <Stepper value={rooms} onChange={setRooms} min={1} max={p.units} label={w.rooms} />
          </div>
        )}
      </div>

      {p.min_nights > 1 && <p className="text-xs text-ink-faint mb-3">{w.minNights(p.min_nights)}</p>}
      {quoteError && <p role="alert" className="rounded-xl bg-red-500/10 text-red-700 dark:text-red-300 text-sm p-3 mb-3">{quoteError}</p>}

      <button type="button" onClick={onReserve} disabled={!quote || quoting} className="w-full rounded-full bg-ink text-cream text-sm font-medium py-4 hover:bg-coffee-dark transition-colors disabled:opacity-50">
        {!sel.start || !sel.end ? w.selectDates : quoting ? w.checking : p.instant_book ? w.reserve : w.request}
      </button>
      {quote && (
        <>
          <p className="text-center text-xs text-ink-faint mt-3">{w.chargeNote}</p>
          <dl className="space-y-2.5 text-sm mt-5">
            <div className="flex justify-between"><dt className="text-ink-soft underline decoration-dotted underline-offset-4">{w.nightsX(money(quote.avg_night), nights)}</dt><dd className="text-ink">{money(quote.nightly_total)}</dd></div>
            {quote.discount > 0 && <div className="flex justify-between text-emerald-700 dark:text-emerald-300"><dt>{w.discount(quote.discount_pct)}</dt><dd>− {money(quote.discount)}</dd></div>}
            {quote.cleaning_fee > 0 && <div className="flex justify-between"><dt className="text-ink-soft">{w.cleaning}</dt><dd className="text-ink">{money(quote.cleaning_fee)}</dd></div>}
            <div className="flex justify-between items-baseline border-t border-line pt-3"><dt className="font-medium text-ink">{w.total}</dt><dd className="font-display text-2xl text-ink">{money(quote.total)}</dd></div>
          </dl>
          <p className="mt-4 text-xs text-ink-soft flex gap-2"><ShieldCheck size={14} className="text-coffee shrink-0 mt-0.5" />{w.freeUntil(formatDay(quote.cancel_free_until, lang, { day: "numeric", month: "long" }))}</p>
          <p className="mt-2 text-xs text-ink-faint flex gap-2">{p.instant_book ? <Zap size={14} className="text-coffee shrink-0 mt-0.5" /> : <Clock size={14} className="text-coffee shrink-0 mt-0.5" />}{p.instant_book ? w.instantNote : w.requestNote}</p>
        </>
      )}
    </div>
  );
}

export default function PropertyPage() {
  const { slug } = useParams();
  const ui = useLodgeUi();
  const pr = ui.property;
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const toast = useToast();
  const { token } = useUser();
  const { money } = useShopMoney();
  const { label } = useAmenities();
  const [params] = useSearchParams();
  const { data: p, loading, error, reload } = useLoad(() => api.lodge.property(slug, token), [slug, token]);
  usePageMeta({ title: p ? p.title : "H-Logement", description: p?.summary });

  const [sel, setSel] = useState({ start: params.get("check_in"), end: params.get("check_out") });
  const [guests, setGuests] = useState(Math.max(1, Number(params.get("guests")) || 1));
  const [rooms, setRooms] = useState(Math.max(1, Number(params.get("rooms")) || 1));
  const [days, setDays] = useState({});
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [allAmenities, setAllAmenities] = useState(false);
  const [moreReviews, setMoreReviews] = useState([]);
  const [reviewsDone, setReviewsDone] = useState(false);
  const calRef = useRef(null);

  useEffect(() => {
    if (!p) return;
    let alive = true;
    api.lodge.calendar(p.id, todayISO(), 365).then((rows) => alive && setDays(Object.fromEntries(rows.map((r) => [r.date, r])))).catch(() => {});
    return () => { alive = false; };
  }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (p && guests > p.max_guests * rooms) setGuests(p.max_guests * rooms);
  }, [rooms, p]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!p || !sel.start || !sel.end || sel.end <= sel.start) { setQuote(null); setQuoteError(""); return; }
    let alive = true;
    setQuoting(true);
    const t = setTimeout(() => {
      api.lodge.quote({ property_id: p.id, check_in: sel.start, check_out: sel.end, guests, units: rooms })
        .then((q) => { if (alive) { setQuote(q); setQuoteError(""); } })
        .catch((e) => { if (alive) { setQuote(null); setQuoteError(errMessage(e, ui.common.error)); } })
        .finally(() => alive && setQuoting(false));
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [p?.id, sel.start, sel.end, guests, rooms]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPick = (iso) => setSel((s) => pickDate(days, s, iso, p?.min_nights || 1));
  const reserve = () => {
    if (!quote) return;
    navigate(`/logement/reserver/${slug}?${searchQuery({ check_in: sel.start, check_out: sel.end, guests, rooms })}`);
  };

  const share = async () => {
    const url = window.location.origin + `/logement/s/${slug}`;
    try {
      if (navigator.share) await navigator.share({ title: p.title, url });
      else { await navigator.clipboard.writeText(url); toast?.success?.(pr.copied); }
    } catch { /* annulé */ }
  };

  async function loadMore() {
    const rows = await api.lodge.reviews(p.id, p.reviews.length + moreReviews.length).catch(() => []);
    setMoreReviews((m) => [...m, ...rows]);
    if (rows.length < 20) setReviewsDone(true);
  }

  const reviews = useMemo(() => (p ? [...p.reviews, ...moreReviews] : []), [p, moreReviews]);
  const amenityList = p?.amenities || [];
  const year = p ? new Date(p.host.member_since).getFullYear() : "";

  if (loading && !p) return <LodgeLayout><Spinner label={ui.common.loading} /></LodgeLayout>;
  if (error) {
    return (
      <LodgeLayout width="max-w-2xl">
        {error.status === 404 ? (
          <div className="rounded-3xl border border-line bg-surface p-10 text-center">
            <p className="font-display text-2xl text-ink mb-2">{pr.unavailable}</p>
            <p className="text-sm text-ink-soft mb-6">{pr.unavailableHint}</p>
            <Link to="/logement/recherche" className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5 inline-block">{pr.backToSearch}</Link>
          </div>
        ) : <ErrorState onRetry={reload} />}
      </LodgeLayout>
    );
  }
  if (!p) return null;

  const shownAmenities = allAmenities ? amenityList : amenityList.slice(0, 8);
  const longText = p.description.length > 420;

  return (
    <LodgeLayout hideBar>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-ink leading-tight">{p.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
            <RatingBadge value={p.rating_avg} count={p.rating_count} />
            <span className="inline-flex items-center gap-1"><MapPin size={14} /> {p.address_hint}</span>
            <HostBadge verified={p.host_verified} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={share} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm text-ink hover:border-coffee-light"><Share2 size={15} /> {pr.share}</button>
          <LodgeFavoriteButton propertyId={p.id} initial={p.is_favorite} className="!w-11 !h-11" />
        </div>
      </div>

      <Gallery images={p.images} title={p.title} />

      <div className="grid lg:grid-cols-[1fr_400px] gap-12 mt-10 items-start">
        <div className="min-w-0 space-y-12">
          <section>
            <h2 className="font-display text-2xl text-ink">{ui.types[p.type]} · {p.host.display_name}</h2>
            <p className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft">
              <span className="inline-flex items-center gap-1.5"><Users size={15} /> {ui.common.upTo(p.max_guests)}</span>
              <span className="inline-flex items-center gap-1.5"><BedDouble size={15} /> {ui.common.bedrooms(p.bedrooms)} · {ui.common.beds(p.beds)}</span>
              <span className="inline-flex items-center gap-1.5"><Bath size={15} /> {ui.common.baths(p.bathrooms)}</span>
            </p>
            <div className="mt-6 grid sm:grid-cols-2 gap-3">
              {p.instant_book && <div className="rounded-2xl border border-line bg-surface p-4 flex gap-3"><Zap className="text-coffee shrink-0" size={20} /><div><p className="text-sm font-medium text-ink">{ui.common.instant}</p><p className="text-xs text-ink-soft mt-0.5">{ui.widget.instantNote}</p></div></div>}
              <div className="rounded-2xl border border-line bg-surface p-4 flex gap-3"><ShieldCheck className="text-coffee shrink-0" size={20} /><div><p className="text-sm font-medium text-ink">{ui.home.trust[0].t}</p><p className="text-xs text-ink-soft mt-0.5">{ui.home.trust[0].d}</p></div></div>
            </div>
          </section>

          <PropertyTour p={p} autoStart={params.get("visite") === "1"} />

          <section>
            <h2 className="font-display text-2xl text-ink mb-4">{pr.about}</h2>
            {p.summary && <p className="text-ink mb-3 font-medium">{p.summary}</p>}
            <p className={`text-ink-soft leading-relaxed whitespace-pre-line ${longText && !expanded ? "line-clamp-6" : ""}`}>{p.description}</p>
            {longText && <button onClick={() => setExpanded((e) => !e)} className="mt-3 text-sm text-coffee hover:underline">{expanded ? pr.showLess : pr.showMore}</button>}
          </section>

          {amenityList.length > 0 && (
            <section>
              <h2 className="font-display text-2xl text-ink mb-5">{pr.amenities}</h2>
              <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
                {shownAmenities.map((a) => (
                  <li key={a} className="flex items-center gap-3 text-sm text-ink"><AmenityIcon name={a} className="text-coffee" /> {label(a)}</li>
                ))}
              </ul>
              {amenityList.length > 8 && <button onClick={() => setAllAmenities((v) => !v)} className="mt-5 rounded-full border border-line px-5 py-2.5 text-sm text-ink hover:border-coffee-light">{allAmenities ? pr.showLess : pr.amenitiesAll(amenityList.length)}</button>}
            </section>
          )}

          <section ref={calRef} aria-labelledby="avail">
            <h2 id="avail" className="font-display text-2xl text-ink mb-1">{pr.availability}</h2>
            <p className="text-sm text-ink-soft mb-5">{pr.availabilityHint}</p>
            <div className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
              {Object.keys(days).length ? <RangeCalendar days={days} value={sel} onPick={onPick} /> : <Spinner label={ui.common.loading} />}
              {(sel.start || sel.end) && <button onClick={() => setSel({ start: null, end: null })} className="mt-4 text-sm text-coffee hover:underline">{ui.widget.clear}</button>}
            </div>
          </section>

          <section>
            <h2 className="font-display text-2xl text-ink mb-4">{pr.location}</h2>
            <p className="text-sm text-ink-soft mb-4 inline-flex items-center gap-2"><MapPin size={15} className="text-coffee" /> {p.address_hint}</p>
            {p.latitude != null && p.longitude != null && (
              <div className="rounded-3xl overflow-hidden border border-line">
                <iframe title={pr.location} src={osmEmbedUrl(p.latitude, p.longitude)} loading="lazy" className="w-full h-72 block" referrerPolicy="no-referrer" />
                <a href={osmLink(p.latitude, p.longitude, 14)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-3 text-sm text-coffee hover:underline bg-surface"><ExternalLink size={14} /> {pr.openMap}</a>
              </div>
            )}
            <p className="text-xs text-ink-faint mt-3 flex gap-2"><Info size={14} className="shrink-0 mt-0.5" /> {pr.locationNote}</p>
          </section>

          <section>
            <h2 className="font-display text-2xl text-ink mb-5">{pr.rules}</h2>
            <ul className="space-y-3 text-sm text-ink">
              <li className="flex gap-3"><Clock size={17} className="text-coffee shrink-0" /> {pr.checkInFrom(p.check_in_from)}</li>
              <li className="flex gap-3"><Clock size={17} className="text-coffee shrink-0" /> {pr.checkOutUntil(p.check_out_until)}</li>
              <li className="flex gap-3"><Users size={17} className="text-coffee shrink-0" /> {pr.maxGuests(p.max_guests * p.units)}</li>
              {p.min_nights > 1 && <li className="flex gap-3"><Info size={17} className="text-coffee shrink-0" /> {pr.minStay(p.min_nights)}</li>}
            </ul>
            {p.house_rules && <p className="mt-4 text-sm text-ink-soft whitespace-pre-line leading-relaxed">{p.house_rules}</p>}
            <div className="mt-6 rounded-2xl bg-latte-soft p-4">
              <p className="text-sm font-medium text-ink">{pr.cancellation} · {ui.policy[p.cancellation_policy]?.label || p.cancellation_label}</p>
              <p className="text-sm text-ink-soft mt-1">{ui.policy[p.cancellation_policy]?.text || p.cancellation_text}</p>
            </div>
          </section>

          <section>
            <h2 className="font-display text-2xl text-ink mb-5 flex items-center gap-3">{pr.reviews} {p.rating_count > 0 && <RatingBadge value={p.rating_avg} count={p.rating_count} />}</h2>
            {reviews.length === 0 ? <p className="text-sm text-ink-soft">{pr.noReviews}</p> : (
              <>
                <ReviewBars summary={p.review_summary} />
                <ul className="grid md:grid-cols-2 gap-x-10 gap-y-8">
                  {reviews.map((r) => (
                    <li key={r.id}>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="w-10 h-10 rounded-full bg-latte-soft text-coffee flex items-center justify-center font-medium">{(r.author_name || "?")[0].toUpperCase()}</span>
                        <div><p className="text-sm font-medium text-ink">{r.author_name}</p><p className="text-xs text-ink-faint">{formatDay(r.created_at.slice(0, 10), lang, { month: "long", year: "numeric" })}</p></div>
                        <span className="ml-auto text-sm text-ink">★ {r.rating}</span>
                      </div>
                      {r.comment && <p className="text-sm text-ink-soft leading-relaxed">{r.comment}</p>}
                      {r.host_reply && <div className="mt-3 rounded-xl bg-latte-soft p-3 text-sm"><p className="text-xs font-medium text-coffee mb-1">{pr.hostReply}</p><p className="text-ink-soft">{r.host_reply}</p></div>}
                    </li>
                  ))}
                </ul>
                {!reviewsDone && p.rating_count > reviews.length && <button onClick={loadMore} className="mt-8 rounded-full border border-line px-5 py-2.5 text-sm text-ink hover:border-coffee-light">{pr.more}</button>}
              </>
            )}
          </section>

          <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
            <div className="flex items-center gap-4">
              <span className="w-16 h-16 rounded-full bg-latte-soft text-coffee flex items-center justify-center font-display text-2xl overflow-hidden">
                {p.host.avatar ? <LodgeImage path={p.host.avatar} alt={p.host.display_name} ratio="w-full h-full" /> : p.host.display_name[0].toUpperCase()}
              </span>
              <div>
                <p className="font-display text-xl text-ink">{pr.hostedBy(p.host.display_name)}</p>
                <p className="text-xs text-ink-faint">{pr.memberSince(year)} · {pr.hostListings(p.host.properties_count)} · {pr.hostReviews(p.host.reviews_count)}</p>
                <div className="flex flex-wrap gap-x-4 mt-1">
                  <HostBadge verified={p.host.is_verified} />
                  {p.host.partner_name && <span className="inline-flex items-center gap-1 text-xs text-coffee"><BadgeCheck size={14} /> {pr.partnerOf(p.host.partner_name)}</span>}
                </div>
              </div>
            </div>
            {p.host.bio && <p className="mt-5 text-sm text-ink-soft leading-relaxed whitespace-pre-line">{p.host.bio}</p>}
            <p className="mt-4 text-xs text-ink-faint flex gap-2"><MessageCircle size={14} className="shrink-0 mt-0.5" /> {ui.book.requestInfo}</p>
            <Link to={`/logement/hote-profil/${p.host.id}`} className="mt-5 inline-block text-sm text-coffee hover:underline">{ui.hostPublic.listings} →</Link>
          </section>
        </div>

        <aside className="lg:sticky lg:top-28 order-first lg:order-none hidden lg:block">
          <BookingWidget p={p} sel={sel} setSel={setSel} guests={guests} setGuests={setGuests} rooms={rooms} setRooms={setRooms} quote={quote} quoteError={quoteError} quoting={quoting} onReserve={reserve} money={money} />
        </aside>
      </div>

      {/* Mobile : widget complet dans la page + barre d'action fixe */}
      <div className="lg:hidden mt-10">
        <BookingWidget p={p} sel={sel} setSel={setSel} guests={guests} setGuests={setGuests} rooms={rooms} setRooms={setRooms} quote={quote} quoteError={quoteError} quoting={quoting} onReserve={reserve} money={money} />
      </div>
      {!p.rent_terms && <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-cream/95 backdrop-blur border-t border-line px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-ink"><span className="font-display text-xl">{money(quote ? quote.total : p.price_per_night)}</span> <span className="text-xs text-ink-soft">{quote ? ui.widget.nights(quote.nights) : ui.widget.perNight}</span></p>
        </div>
        {quote ? (
          <button onClick={reserve} className="rounded-full bg-ink text-cream text-sm font-medium px-7 py-3.5">{p.instant_book ? ui.widget.reserve : ui.widget.request}</button>
        ) : (
          <button onClick={() => document.getElementById("avail")?.scrollIntoView({ behavior: "smooth" })} className="rounded-full bg-ink text-cream text-sm font-medium px-7 py-3.5">{ui.widget.addDates}</button>
        )}
      </div>}
      <div className="lg:hidden h-20" />

      {p.similar.length > 0 && (
        <section className="mt-20">
          <SectionTitle title={pr.similar} />
          <PropertyGrid items={p.similar} money={money} />
        </section>
      )}
    </LodgeLayout>
  );
}
