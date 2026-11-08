import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TransportLayout, { BusyButton, Card, ErrorState, Field, PayBox, Spinner, TransportAuthGate, inputCls, usePayBox, useTransportUi } from "../../components/transport/Shared.jsx";
import { useCargoUi } from "../../i18n/cargoUi.js";
import { errMessage, useLoad, useShopMoney } from "../../data/shop.js";
import { validationMessage } from "../../components/lodge/HostUi.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { buildPhone, phoneIsComplete } from "../../lib/pricing.js";
import { fmtDateTime } from "../../lib/transport.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";


function Form() {
  const { id } = useParams();
  const c = useCargoUi(); const f = c.form; const ui = useTransportUi();
  const { lang } = useLanguage();
  const { withAuth } = useUser();
  const { money } = useShopMoney();
  const navigate = useNavigate();
  usePageMeta({ title: f.title });
  const { data: trip, loading, error, reload } = useLoad(() => api.transport.cargo.trip(id), [id]);
  const { data: meta } = useLoad(() => api.transport.cargo.meta(), []);
  const box = usePayBox();
  const [v, setV] = useState({ weight: "", desc: "", category: "general", rname: "", rphone: "" });
  const [errs, setErrs] = useState({});
  const [payErr, setPayErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (loading) return <TransportLayout hideBar><Spinner label={ui.common.loading} /></TransportLayout>;
  if (error || !trip) return <TransportLayout hideBar><ErrorState onRetry={reload} /></TransportLayout>;
  const w = Number(v.weight) || 0;
  const total = w * trip.price_per_kg;
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    const er = {};
    if (w < trip.min_kg) er.weight = f.errW(trip.min_kg);
    else if (w > trip.kg_left) er.weight = f.full;
    if (v.desc.trim().length < 3) er.desc = f.errDesc;
    if (v.rname.trim().length < 2 || v.rphone.trim().length < 6) er.recv = f.errRecv;
    if (!phoneIsComplete(box.digits)) er.digits = f.errNum;
    setErrs(er);
    if (Object.keys(er).length) return;
    setBusy(true); setPayErr("");
    try {
      const res = await withAuth((t) => api.transport.cargo.book(t, { trip_id: trip.id, weight_kg: w, description: v.desc.trim(), category: v.category, receiver_name: v.rname.trim(), receiver_phone: v.rphone.trim(), method: box.operator, phone: buildPhone(box.prefix, box.digits) }));
      navigate(`/transport/mes-colis?new=${res.code || res.booking?.code || ""}`, { replace: true });
    } catch (x) {
      setPayErr(x?.status === 409 ? errMessage(x, f.full) : validationMessage(x, {}, lang, errMessage(x, ui.common.err)));
      setBusy(false);
    }
  }
  return (
    <TransportLayout hideBar width="max-w-3xl">
      <Link to="/transport/colis" className="text-sm text-ink-soft">← {c.title}</Link>
      <h1 className="font-display text-3xl text-ink mt-3">{trip.origin} → {trip.destination}</h1>
      <p className="text-sm text-ink-soft mb-6 capitalize">{c.kinds[trip.vehicle.kind]} · {fmtDateTime(trip.departure_at, lang)} · {trip.operator_name}</p>
      <form onSubmit={submit} className="space-y-5">
        <Card className="space-y-4">
          <h2 className="font-display text-xl text-ink">{f.title}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label={f.weight} hint={`${trip.min_kg} – ${Math.floor(trip.kg_left)} kg`} error={errs.weight}><input type="number" min={trip.min_kg} step="any" className={inputCls} value={v.weight} onChange={set("weight")} inputMode="decimal" /></Field>
            <Field label={f.category}><select className={inputCls} value={v.category} onChange={set("category")}>{(meta?.categories || ["general"]).map((k) => <option key={k} value={k}>{c.cats[k] || k}</option>)}</select></Field>
          </div>
          <Field label={f.desc} error={errs.desc}><input maxLength={300} className={inputCls} value={v.desc} onChange={set("desc")} /></Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label={f.receiverName} error={errs.recv}><input className={inputCls} value={v.rname} onChange={set("rname")} /></Field>
            <Field label={f.receiverPhone}><input className={inputCls} inputMode="tel" value={v.rphone} onChange={set("rphone")} /></Field>
          </div>
        </Card>
        <Card>
          <PayBox box={box} error={errs.digits} />
          <div className="mt-5 flex items-center justify-between border-t border-line pt-4"><span className="text-ink-soft">{f.total}</span><span className="font-display text-2xl text-ink">{money(total)}</span></div>
          <p className="text-xs text-ink-faint mt-2">{f.escrow} {f.free(meta?.free_cancel_hours || 12)}</p>
          {payErr && <p role="alert" className="mt-3 rounded-xl bg-red-500/10 text-red-700 dark:text-red-300 text-sm p-3">{payErr}</p>}
          <BusyButton busy={busy} className="mt-4 w-full rounded-full bg-ink text-cream font-medium py-3.5">{f.pay}</BusyButton>
        </Card>
      </form>
    </TransportLayout>
  );
}
export default function CargoBook() { return <TransportAuthGate><Form /></TransportAuthGate>; }
