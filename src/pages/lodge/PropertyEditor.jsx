import { Suspense, lazy } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, Check, Circle, Star, Trash2 } from "lucide-react";
import LodgeLayout from "../../components/lodge/LodgeLayout.jsx";
import LodgeAuthGate from "../../components/lodge/AuthGate.jsx";
import { AmenityIcon, ErrorState, LodgeImage, Spinner, useAmenities, useLodgeUi } from "../../components/lodge/Shared.jsx";
import { Card, Field, HostUploader, inputCls, useHostUi, validationMessage } from "../../components/lodge/HostUi.jsx";
import { errMessage } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { AMENITY_GROUPS } from "../../i18n/lodgeUi.js";
import { RENT_TYPES, STAY_TYPES } from "../../lib/lodge.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const LocationPicker = lazy(() => import("../../components/app/LocationPicker.jsx"));
const EMPTY = {
  title: "", summary: "", description: "", type: "lodge", country: "Zambie", city: "", area: "", address: "", latitude: "", longitude: "",
  price_per_night: "", rent_per_month: "", advance_months: 2, deposit_months: 1, lease_min_months: 12, cleaning_fee: 0, weekly_discount: 0, monthly_discount: 0, max_guests: 2, bedrooms: 1, beds: 1, bathrooms: 1, units: 1,
  min_nights: 1, max_nights: 90, check_in_from: "14:00", check_out_until: "11:00", amenities: [], house_rules: "", cancellation_policy: "flexible", instant_book: false, images: [],
};

const num = (v) => (v === "" || v == null ? null : Number(v));

function toForm(p) {
  return {
    ...EMPTY, title: p.title, summary: p.summary || "", description: p.description || "", type: p.type, country: p.country || "Zambie", city: p.city, area: p.area || "", address: p.address || "",
    latitude: p.latitude ?? "", longitude: p.longitude ?? "", price_per_night: p.price_per_night, rent_per_month: p.rent_terms?.monthly ?? "", advance_months: p.rent_terms?.advance_months ?? 2, deposit_months: p.rent_terms?.deposit_months ?? 1, lease_min_months: p.rent_terms?.lease_min_months ?? 12, cleaning_fee: p.cleaning_fee, weekly_discount: p.weekly_discount, monthly_discount: p.monthly_discount,
    max_guests: p.max_guests, bedrooms: p.bedrooms, beds: p.beds, bathrooms: p.bathrooms, units: p.units, min_nights: p.min_nights, max_nights: p.max_nights,
    check_in_from: p.check_in_from, check_out_until: p.check_out_until, amenities: p.amenity_keys || [], house_rules: p.house_rules || "", cancellation_policy: p.cancellation_policy,
    instant_book: !!p.instant_book, images: p.image_paths || [],
  };
}

function payload(f) {
  return {
    ...f, latitude: num(f.latitude), longitude: num(f.longitude), price_per_night: RENT_TYPES.includes(f.type) ? 0 : Number(f.price_per_night) || 0, rent_per_month: RENT_TYPES.includes(f.type) ? Number(f.rent_per_month) || 0 : 0, advance_months: Number(f.advance_months) || 0, deposit_months: Number(f.deposit_months) || 0, lease_min_months: Number(f.lease_min_months) || 0, cleaning_fee: Number(f.cleaning_fee) || 0,
    weekly_discount: Number(f.weekly_discount) || 0, monthly_discount: Number(f.monthly_discount) || 0, max_guests: Number(f.max_guests), bedrooms: Number(f.bedrooms),
    beds: Number(f.beds), bathrooms: Number(f.bathrooms), units: Number(f.units), min_nights: Number(f.min_nights), max_nights: Number(f.max_nights),
  };
}

function Section({ n, title, children }) {
  return (
    <Card>
      <h2 className="font-display text-xl text-ink mb-5 flex items-center gap-3"><span className="w-7 h-7 rounded-full bg-latte-soft text-coffee text-xs flex items-center justify-center">{n}</span>{title}</h2>
      <div className="space-y-5">{children}</div>
    </Card>
  );
}

function Content() {
  const { id } = useParams();
  const isNew = id === "new";
  const h = useHostUi();
  const t = h.editor;
  const ui = useLodgeUi();
  const navigate = useNavigate();
  const toast = useToast();
  const { token, withAuth } = useUser();
  const amen = useAmenities();
  const { lang } = useLanguage();
  const fr = lang !== "en";
  const formRef = useRef(null);
  const labels = { title: t.title, summary: t.summary, description: t.description, city: t.city, area: t.area, address: t.address, country: t.country, latitude: t.latitude, longitude: t.longitude, price_per_night: t.price, cleaning_fee: t.cleaning, weekly_discount: t.weekly, monthly_discount: t.monthly, max_guests: t.maxGuests, bedrooms: t.bedrooms, beds: t.beds, bathrooms: t.bathrooms, units: t.units, min_nights: t.minNights, max_nights: t.maxNights, check_in_from: t.checkIn, check_out_until: t.checkOut, house_rules: t.rulesLabel };
  usePageMeta({ title: isNew ? t.newTitle : t.editTitle });
  const [f, setF] = useState(EMPTY);
  const [loaded, setLoaded] = useState(isNew);
  const [loadErr, setLoadErr] = useState(false);
  const [host, setHost] = useState(null);
  const [status, setStatus] = useState("draft");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    withAuth((tk) => api.lodge.hosting.me(tk)).then(setHost).catch(() => {});
    if (isNew) return;
    withAuth((tk) => api.lodge.hosting.property(tk, id)).then((p) => { setF(toForm(p)); setStatus(p.status); setLoaded(true); }).catch(() => setLoadErr(true));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (k) => (e) => { setDirty(true); setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value })); };
  const toggleAmenity = (k) => { setDirty(true); setF((s) => ({ ...s, amenities: s.amenities.includes(k) ? s.amenities.filter((x) => x !== k) : [...s.amenities, k] })); };
  const addImages = (paths) => { setDirty(true); setF((s) => ({ ...s, images: [...s.images, ...paths] })); };
  const removeImage = (p) => { setDirty(true); setF((s) => ({ ...s, images: s.images.filter((x) => x !== p) })); };
  const makeCover = (p) => { setDirty(true); setF((s) => ({ ...s, images: [p, ...s.images.filter((x) => x !== p)] })); };

  const hasPhone = !!(host && (host.phone || host.whatsapp));
  const checks = useMemo(() => [
    [t.ok.photos, f.images.length >= 3], [t.ok.description, f.description.trim().length >= 60], [t.ok.price, (RENT_TYPES.includes(f.type) ? Number(f.rent_per_month) : Number(f.price_per_night)) > 0], [t.ok.phone, hasPhone],
  ], [f.images.length, f.description, f.price_per_night, f.rent_per_month, f.type, hasPhone, t.ok]);
  const ready = checks.every(([, ok]) => ok);

  async function save(submit) {
    if (formRef.current && !formRef.current.reportValidity()) { setError(t.fixErrors); return; }
    setBusy(true); setError("");
    try {
      const body = payload(f);
      let saved;
      if (isNew) saved = await withAuth((tk) => api.lodge.hosting.create(tk, body));
      else saved = await withAuth((tk) => api.lodge.hosting.update(tk, id, body));
      if (submit) await withAuth((tk) => api.lodge.hosting.submit(tk, saved.id));
      setDirty(false);
      toast?.success?.(submit ? t.submitted : t.saved);
      navigate(submit || isNew ? "/logement/hote?tab=properties" : `/logement/hote/logement/${saved.id}`, { replace: !isNew });
      if (!isNew && !submit) setStatus(saved.status);
    } catch (e) { setError(validationMessage(e, labels, lang, errMessage(e, h.common.error))); window.scrollTo({ top: 0, behavior: "smooth" }); } finally { setBusy(false); }
  }

  if (loadErr) return <LodgeLayout width="max-w-2xl"><ErrorState message={t.loadError} /></LodgeLayout>;
  if (!loaded) return <LodgeLayout><Spinner label={h.common.loading} /></LodgeLayout>;

  return (
    <LodgeLayout width="max-w-4xl">
      <Link to="/logement/hote?tab=properties" className="inline-flex items-center gap-2 text-sm text-coffee hover:underline"><ArrowLeft size={15} /> {t.back}</Link>
      <h1 className="font-display text-3xl sm:text-4xl text-ink mt-4 mb-8">{isNew ? t.newTitle : t.editTitle}</h1>
      {error && <p role="alert" className="mb-6 rounded-2xl bg-red-500/10 text-red-700 dark:text-red-300 text-sm px-4 py-3 flex gap-2"><AlertCircle size={16} className="shrink-0 mt-0.5" /> {error}</p>}
      <form ref={formRef} noValidate={false} onSubmit={(e) => { e.preventDefault(); save(false); }} className="space-y-6">
        <Section n={1} title={t.sections.basics}>
          <Field label={t.title} hint={t.titleHint} htmlFor="e-title"><input id="e-title" required minLength={4} maxLength={120} className={inputCls} value={f.title} onChange={set("title")} /></Field>
          <Field label={t.type} htmlFor="e-type"><select id="e-type" className={inputCls} value={f.type} onChange={set("type")}>{STAY_TYPES.map((k) => <option key={k} value={k}>{ui.types[k]}</option>)}</select></Field>
          <Field label={t.summary} hint={t.summaryHint} htmlFor="e-sum"><input id="e-sum" maxLength={240} className={inputCls} value={f.summary} onChange={set("summary")} /></Field>
          <Field label={t.description} hint={`${t.descriptionHint} · ${f.description.trim().length}/5000`} htmlFor="e-desc"><textarea id="e-desc" rows={7} maxLength={5000} className={`${inputCls} resize-y`} value={f.description} onChange={set("description")} /></Field>
        </Section>

        <Section n={2} title={t.sections.place}>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label={t.country} htmlFor="e-country"><input id="e-country" className={inputCls} value={f.country} onChange={set("country")} /></Field>
            <Field label={t.city} htmlFor="e-city"><input id="e-city" required minLength={2} className={inputCls} value={f.city} onChange={set("city")} placeholder="Lusaka, Livingstone…" /></Field>
            <Field label={t.area} htmlFor="e-area"><input id="e-area" className={inputCls} value={f.area} onChange={set("area")} /></Field>
          </div>
          <Field label={t.address} hint={t.addressHint} htmlFor="e-addr"><input id="e-addr" maxLength={240} className={inputCls} value={f.address} onChange={set("address")} /></Field>
          <Suspense fallback={<div className="h-80 rounded-2xl bg-latte-soft/60 animate-pulse" />}>
            <LocationPicker lat={f.latitude} lng={f.longitude} city={f.city} onChange={(la, ln) => { setDirty(true); setF((s) => ({ ...s, latitude: la, longitude: ln })); }} />
          </Suspense>
          <p className="text-xs text-ink-faint -mt-2">Les voyageurs voient une position approximative (environ 1 km) avant de réserver ; l'adresse exacte n'est donnée qu'après réservation.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={t.latitude} htmlFor="e-lat"><input id="e-lat" type="number" step="any" min="-90" max="90" className={inputCls} value={f.latitude} onChange={set("latitude")} placeholder="-15.4167" /></Field>
            <Field label={t.longitude} htmlFor="e-lng"><input id="e-lng" type="number" step="any" min="-180" max="180" className={inputCls} value={f.longitude} onChange={set("longitude")} placeholder="28.2833" /></Field>
          </div>
          <p className="text-xs text-ink-faint -mt-2">{t.coordsHint}</p>
        </Section>

        <Section n={3} title={t.sections.capacity}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label={t.maxGuests} htmlFor="e-g"><input id="e-g" type="number" min="1" max="60" required className={inputCls} value={f.max_guests} onChange={set("max_guests")} /></Field>
            <Field label={t.bedrooms} htmlFor="e-br"><input id="e-br" type="number" min="0" max="40" required className={inputCls} value={f.bedrooms} onChange={set("bedrooms")} /></Field>
            <Field label={t.beds} htmlFor="e-b"><input id="e-b" type="number" min="1" max="80" required className={inputCls} value={f.beds} onChange={set("beds")} /></Field>
            <Field label={t.bathrooms} htmlFor="e-ba"><input id="e-ba" type="number" min="0" max="40" step="0.5" required className={inputCls} value={f.bathrooms} onChange={set("bathrooms")} /></Field>
          </div>
          <Field label={t.units} hint={t.unitsHint} htmlFor="e-u" className="max-w-xs"><input id="e-u" type="number" min="1" max="200" required className={inputCls} value={f.units} onChange={set("units")} /></Field>
        </Section>

        <Section n={4} title={t.sections.photos}>
          <p className="text-sm text-ink-soft -mt-2">{t.photosHint}</p>
          {f.images.length > 0 && (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {f.images.map((p, i) => (
                <li key={p} className="relative rounded-2xl overflow-hidden border border-line bg-surface">
                  <LodgeImage path={p} alt="" ratio="aspect-[4/3]" />
                  {i === 0 && <span className="absolute top-2 left-2 rounded-full bg-ink text-cream text-[0.65rem] px-2.5 py-1">{t.cover}</span>}
                  <div className="flex justify-between gap-2 p-2">
                    {i !== 0 ? <button type="button" onClick={() => makeCover(p)} className="text-xs text-coffee hover:underline inline-flex items-center gap-1"><Star size={12} /> {t.makeCover}</button> : <span />}
                    <button type="button" onClick={() => removeImage(p)} className="text-xs text-red-700 dark:text-red-300 hover:underline inline-flex items-center gap-1" aria-label={t.removePhoto}><Trash2 size={12} /> {t.removePhoto}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <HostUploader multiple label={t.addPhotos} busyLabel={t.uploading} onUploaded={addImages} />
        </Section>

        <Section n={5} title={t.sections.amenities}>
          {Object.entries(AMENITY_GROUPS).map(([g, keys]) => (
            <fieldset key={g}>
              <legend className="text-sm font-medium text-ink mb-3">{ui.amenityGroups[g]}</legend>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {keys.map((k) => {
                  const on = f.amenities.includes(k);
                  return (
                    <label key={k} className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm cursor-pointer transition ${on ? "border-coffee bg-latte-soft text-ink" : "border-line text-ink-soft hover:border-coffee-light"}`}>
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleAmenity(k)} />
                      <AmenityIcon name={k} size={17} className={on ? "text-coffee" : ""} /> <span className="flex-1">{amen.label(k)}</span>{on && <Check size={14} className="text-coffee" />}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </Section>

        {RENT_TYPES.includes(f.type) ? (
          <Section n={6} title={fr ? "Loyer et conditions d'entrée" : "Rent and move-in terms"}>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label={`${fr ? "Loyer par mois" : "Rent per month"} (ZMW)`} htmlFor="e-rent"><input id="e-rent" type="number" required min="1" step="any" className={inputCls} value={f.rent_per_month} onChange={set("rent_per_month")} /></Field>
              <Field label={fr ? "Durée minimale du bail (mois)" : "Minimum lease (months)"} htmlFor="e-lease"><input id="e-lease" type="number" min="0" max="60" className={inputCls} value={f.lease_min_months} onChange={set("lease_min_months")} /></Field>
              <Field label={fr ? "Mois à payer avant d'entrer" : "Months to pay before moving in"} hint={fr ? "Ex. 2 = deux loyers d'avance" : "E.g. 2 = two months up front"} htmlFor="e-adv"><input id="e-adv" type="number" min="0" max="12" className={inputCls} value={f.advance_months} onChange={set("advance_months")} /></Field>
              <Field label={fr ? "Garantie / caution (en mois de loyer)" : "Security deposit (in months of rent)"} htmlFor="e-dep"><input id="e-dep" type="number" min="0" max="12" step="0.5" className={inputCls} value={f.deposit_months} onChange={set("deposit_months")} /></Field>
            </div>
            {Number(f.rent_per_month) > 0 && (() => {
              const r = Number(f.rent_per_month), adv = r * (Number(f.advance_months) || 0), dep = r * (Number(f.deposit_months) || 0);
              return <p className="rounded-2xl bg-latte-soft text-sm text-coffee-dark p-4">{fr ? "Le locataire paiera avant d'entrer" : "The tenant pays before moving in"} : <b>{adv.toLocaleString()} ZMW</b> {fr ? "d'avance" : "up front"} + <b>{dep.toLocaleString()} ZMW</b> {fr ? "de garantie" : "deposit"} + {fr ? "la commission H-Company (affichée sur l'annonce, visible par vous et par le locataire)." : "the H-Company commission (shown on the listing, visible to you and the tenant)."}</p>;
            })()}
          </Section>
        ) : (
        <Section n={6} title={t.sections.pricing}>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={`${t.price} (ZMW)`} htmlFor="e-p"><input id="e-p" type="number" required min="1" step="any" className={inputCls} value={f.price_per_night} onChange={set("price_per_night")} /></Field>
            <Field label={`${t.cleaning} (ZMW)`} htmlFor="e-c"><input id="e-c" type="number" min="0" step="any" className={inputCls} value={f.cleaning_fee} onChange={set("cleaning_fee")} /></Field>
            <Field label={t.weekly} htmlFor="e-w"><input id="e-w" type="number" min="0" max="60" step="any" className={inputCls} value={f.weekly_discount} onChange={set("weekly_discount")} /></Field>
            <Field label={t.monthly} htmlFor="e-m"><input id="e-m" type="number" min="0" max="80" step="any" className={inputCls} value={f.monthly_discount} onChange={set("monthly_discount")} /></Field>
            <Field label={t.minNights} htmlFor="e-mn"><input id="e-mn" type="number" min="1" max="90" className={inputCls} value={f.min_nights} onChange={set("min_nights")} /></Field>
            <Field label={t.maxNights} htmlFor="e-mx"><input id="e-mx" type="number" min="1" max="365" className={inputCls} value={f.max_nights} onChange={set("max_nights")} /></Field>
            <Field label={t.checkIn} htmlFor="e-ci"><input id="e-ci" type="time" required className={inputCls} value={f.check_in_from} onChange={set("check_in_from")} /></Field>
            <Field label={t.checkOut} htmlFor="e-co"><input id="e-co" type="time" required className={inputCls} value={f.check_out_until} onChange={set("check_out_until")} /></Field>
          </div>
        </Section>
        )}

        <Section n={7} title={t.sections.rules}>
          <label className={`flex items-start gap-3 rounded-2xl border p-4 cursor-pointer ${f.instant_book ? "border-coffee bg-latte-soft" : "border-line"}`}>
            <input type="checkbox" checked={f.instant_book} onChange={set("instant_book")} className="mt-1 accent-[var(--color-coffee)]" />
            <span><span className="block text-sm font-medium text-ink">{t.instant}</span><span className="block text-xs text-ink-soft mt-0.5">{t.instantHint}</span></span>
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-ink mb-3">{t.policy}</legend>
            <div className="grid sm:grid-cols-3 gap-3">
              {["flexible", "moderate", "strict"].map((k) => (
                <label key={k} className={`rounded-2xl border p-4 cursor-pointer ${f.cancellation_policy === k ? "border-coffee bg-latte-soft" : "border-line"}`}>
                  <input type="radio" name="policy" className="sr-only" checked={f.cancellation_policy === k} onChange={() => { setDirty(true); setF((s) => ({ ...s, cancellation_policy: k })); }} />
                  <span className="block text-sm font-medium text-ink">{ui.policy[k].label}</span>
                  <span className="block text-xs text-ink-soft mt-1 leading-relaxed">{ui.policy[k].text}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label={t.rulesLabel} hint={t.rulesHint} htmlFor="e-rules"><textarea id="e-rules" rows={4} maxLength={2000} className={`${inputCls} resize-y`} value={f.house_rules} onChange={set("house_rules")} /></Field>
          {isNew && <p className="text-xs text-ink-faint">{t.saveFirst}</p>}
        </Section>

        <Card>
          <p className="text-sm font-medium text-ink mb-3">{t.checklist}</p>
          <ul className="space-y-2 mb-6">
            {checks.map(([label, ok]) => <li key={label} className={`flex items-center gap-2 text-sm ${ok ? "text-emerald-700 dark:text-emerald-300" : "text-ink-soft"}`}>{ok ? <Check size={15} /> : <Circle size={15} />} {label}</li>)}
          </ul>
          <div className="flex flex-col sm:flex-row gap-3">
            <button type="submit" disabled={busy} className="rounded-full border border-line text-ink text-sm font-medium px-8 py-3.5 hover:border-coffee-light disabled:opacity-50">{busy ? h.common.saving : t.save}</button>
            {["draft", "rejected"].includes(status) && <button type="button" disabled={busy || !ready} onClick={() => save(true)} className="rounded-full bg-ink text-cream text-sm font-medium px-8 py-3.5 hover:bg-coffee-dark disabled:opacity-40">{t.saveSubmit}</button>}
          </div>
        </Card>
      </form>
    </LodgeLayout>
  );
}

export default function PropertyEditor() {
  const h = useHostUi();
  return <LodgeAuthGate message={h.start.signIn}><Content /></LodgeAuthGate>;
}
