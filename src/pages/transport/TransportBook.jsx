import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Lock } from "lucide-react";
import TransportLayout, { BusyButton, Card, ErrorState, Field, PayBox, RouteLine, Spinner, TransportAuthGate, inputCls, usePayBox, useTransportUi } from "../../components/transport/Shared.jsx";
import { errMessage, useLoad, useShopMoney } from "../../data/shop.js";
import { validationMessage } from "../../components/lodge/HostUi.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { buildPhone, phoneIsComplete } from "../../lib/pricing.js";
import { fmtDay, seatsForPassengers, totalFor } from "../../lib/transport.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

function Form() {
  const { id } = useParams();
  const ui = useTransportUi();
  const b = ui.book;
  const { lang } = useLanguage();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, withAuth } = useUser();
  const { money, testMode } = useShopMoney();
  usePageMeta({ title: b.title });
  const { data: trip, loading, error, reload } = useLoad(() => api.transport.trip(id), [id]);

  const chosen = useMemo(() => (params.get("seats") || "").split(",").map(Number).filter(Boolean), [params]);
  const n = chosen.length || Math.max(1, Number(params.get("n")) || 1);
  const seats = useMemo(() => seatsForPassengers(chosen, n), [chosen, n]);
  const [pax, setPax] = useState(() => Array.from({ length: n }, () => ({ name: "", phone: "", document: "" })));
  const [contact, setContact] = useState({ name: "", phone: "" });
  const box = usePayBox();
  const [errors, setErrors] = useState({});
  const [payError, setPayError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) setContact((c) => ({ name: c.name || user.full_name || "", phone: c.phone }));
  }, [user]);
  useEffect(() => { setPax((p) => (p.length === n ? p : Array.from({ length: n }, (_, i) => p[i] || { name: "", phone: "", document: "" }))); }, [n]);
  useEffect(() => {
    if (user && pax[0] && !pax[0].name) setPax((p) => p.map((x, i) => (i === 0 ? { ...x, name: user.full_name || "" } : x)));
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <TransportLayout hideBar><Spinner label={ui.common.loading} /></TransportLayout>;
  if (error || !trip) return <TransportLayout hideBar><ErrorState onRetry={reload} /></TransportLayout>;

  const back = `/transport/trajet/${trip.id}?seats=${n}`;
  const setP = (i, k) => (e) => setPax((p) => p.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)));

  async function submit(e) {
    e.preventDefault();
    const er = {};
    pax.forEach((p, i) => {
      if (p.name.trim().length < 2) er[`n${i}`] = b.errName;
      if (trip.border_crossing && p.document.trim().length < 5) er[`d${i}`] = b.errDocument;
    });
    if (contact.name.trim().length < 2 || contact.phone.trim().length < 6) er.contact = b.errContact;
    if (!phoneIsComplete(box.digits)) er.digits = b.errNumber;
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    setPayError("");
    try {
      const res = await withAuth((t) => api.transport.book(t, {
        trip_id: trip.id, contact_name: contact.name.trim(), contact_phone: contact.phone.trim(), method: box.operator, phone: buildPhone(box.prefix, box.digits),
        passengers: pax.map((p, i) => ({ name: p.name.trim(), phone: p.phone.trim(), document: p.document.trim(), seat: seats[i] })),
      }));
      navigate(`/transport/mes-billets/${res.booking.code}?new=1`, { replace: true });
    } catch (err) {
      setPayError(err?.status === 409 ? `${errMessage(err, b.seatTaken)}` : validationMessage(err, { name: b.name, document: b.document }, lang, errMessage(err, ui.common.err)));
      setBusy(false);
    }
  }

  return (
    <TransportLayout hideBar>
      <Link to={back} className="text-sm text-coffee hover:underline">← {b.backToTrip}</Link>
      <h1 className="font-display text-3xl sm:text-4xl text-ink mt-3 mb-8">{b.title}</h1>
      <form onSubmit={submit} noValidate className="grid lg:grid-cols-[1fr_380px] gap-8 items-start">
        <div className="space-y-6">
          <Card>
            <h2 className="font-display text-xl text-ink mb-4">1 · {b.passengers}</h2>
            <div className="space-y-6">
              {pax.map((p, i) => (
                <fieldset key={i} className="space-y-3">
                  <legend className="text-sm font-medium text-coffee mb-1">{b.passenger(i + 1)} · {b.seat} {seats[i] ?? b.seatAuto}</legend>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Field label={b.name} error={errors[`n${i}`]} className="sm:col-span-2"><input className={inputCls} value={p.name} onChange={setP(i, "name")} autoComplete={i === 0 ? "name" : "off"} /></Field>
                    <Field label={b.phone}><input className={inputCls} value={p.phone} onChange={setP(i, "phone")} inputMode="tel" /></Field>
                    {trip.border_crossing && <Field label={b.document} hint={b.documentHint} error={errors[`d${i}`]}><input className={inputCls} value={p.document} onChange={setP(i, "document")} /></Field>}
                  </div>
                </fieldset>
              ))}
            </div>
          </Card>
          <Card>
            <h2 className="font-display text-xl text-ink mb-4">2 · {b.contact}</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={b.contactName}><input className={inputCls} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} autoComplete="name" /></Field>
              <Field label={b.contactPhone} error={errors.contact}><input className={inputCls} value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} inputMode="tel" autoComplete="tel" placeholder="097 1234567" /></Field>
            </div>
          </Card>
          <Card>
            <h2 className="font-display text-xl text-ink mb-5">3 · {b.payment}</h2>
            <PayBox box={box} error={errors.digits} />
            {testMode && <p className="mt-4 text-xs rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-200 px-3 py-2">{ui.common.testMode}</p>}
          </Card>
        </div>

        <aside className="rounded-3xl border border-line bg-surface p-6 lg:sticky lg:top-24 space-y-5">
          <p className="font-medium text-ink">{trip.operator.name}</p>
          <p className="text-xs text-ink-faint capitalize -mt-3">{fmtDay(trip.departure_at, lang, { weekday: "long", day: "numeric", month: "long" })}</p>
          <RouteLine trip={trip} />
          <dl className="border-t border-line pt-4 space-y-2 text-sm">
            <h2 className="font-display text-lg text-ink mb-2">{b.summary}</h2>
            <div className="flex justify-between"><dt className="text-ink-soft">{ui.trip.total(n, money(trip.price))}</dt><dd>{money(totalFor(trip.price, n))}</dd></div>
            <div className="flex justify-between pt-3 border-t border-line text-base"><dt className="font-medium text-ink">{ui.common.total}</dt><dd className="font-display text-2xl text-ink">{money(totalFor(trip.price, n))}</dd></div>
          </dl>
          {payError && <p role="alert" className="rounded-xl bg-red-500/10 text-red-700 dark:text-red-300 text-sm p-3">{payError}</p>}
          <BusyButton busy={busy} className="w-full rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5">{busy ? b.paying : b.pay(money(totalFor(trip.price, n)))}</BusyButton>
          <p className="flex items-center gap-2 text-xs text-ink-faint"><Lock size={13} />{b.secure}</p>
        </aside>
      </form>
    </TransportLayout>
  );
}

export default function TransportBook() {
  return <TransportAuthGate width="max-w-xl"><Form /></TransportAuthGate>;
}
