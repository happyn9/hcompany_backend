import { Suspense, lazy, useState } from "react";
import { Bus } from "lucide-react";
import TransportLayout, { BusyButton, Card, Field, Spinner, TransportAuthGate, inputCls, useTransportUi } from "../../components/transport/Shared.jsx";
import { OPERATORS as MM } from "../../components/lodge/HostUi.jsx";
import { validationMessage } from "../../components/lodge/HostUi.jsx";
import { errMessage, useLoad } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const OperatorTabs = lazy(() => import("../../components/transport/OperatorTabs.jsx"));

export function ProfileForm({ operator, onSaved }) {
  const ui = useTransportUi().op.create;
  const common = useTransportUi().common;
  const { lang } = useLanguage();
  const { withAuth } = useUser();
  const toast = useToast();
  const [f, setF] = useState({
    name: operator?.name || "", city: operator?.city || "", description: operator?.description || "", phone: operator?.phone || "", whatsapp: operator?.whatsapp || "",
    mobile_money_operator: operator?.mobile_money_operator || "", mobile_money_phone: operator?.mobile_money_phone || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const res = await withAuth((t) => (operator ? api.transport.operator.save(t, f) : api.transport.operator.create(t, f)));
      toast.success(ui.saved);
      onSaved(res);
    } catch (x) { setErr(validationMessage(x, { name: ui.name, description: ui.description }, lang, errMessage(x, common.err))); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label={ui.name}><input required minLength={2} className={inputCls} value={f.name} onChange={set("name")} /></Field>
        <Field label={ui.city}><input className={inputCls} value={f.city} onChange={set("city")} /></Field>
        <Field label={ui.phone}><input className={inputCls} value={f.phone} onChange={set("phone")} inputMode="tel" /></Field>
        <Field label={ui.whatsapp}><input className={inputCls} value={f.whatsapp} onChange={set("whatsapp")} inputMode="tel" /></Field>
        <Field label={ui.description} hint={ui.descriptionHint} className="sm:col-span-2"><textarea rows={4} maxLength={2000} className={`${inputCls} resize-none`} value={f.description} onChange={set("description")} /></Field>
      </div>
      <div>
        <p className="text-sm font-medium text-ink mb-2">{ui.momo}</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={ui.operator}><select className={inputCls} value={f.mobile_money_operator} onChange={set("mobile_money_operator")}><option value="">—</option>{MM.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label={ui.number}><input className={inputCls} value={f.mobile_money_phone} onChange={set("mobile_money_phone")} inputMode="tel" placeholder="097 1234567" /></Field>
        </div>
      </div>
      {err && <p role="alert" className="rounded-xl bg-red-500/10 text-red-700 dark:text-red-300 text-sm p-3">{err}</p>}
      <BusyButton busy={busy} className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3">{operator ? ui.save : ui.create}</BusyButton>
    </form>
  );
}

function Space() {
  const ui = useTransportUi().op;
  const { withAuth } = useUser();
  usePageMeta({ title: ui.title });
  const { data: op, loading, reload } = useLoad(() => withAuth((t) => api.transport.operator.me(t)), []);
  if (loading) return <TransportLayout><Spinner label="…" /></TransportLayout>;
  if (!op) {
    return (
      <TransportLayout width="max-w-2xl">
        <Bus className="text-coffee mb-3" />
        <h1 className="font-display text-3xl text-ink">{ui.create.title}</h1>
        <p className="text-ink-soft mt-2 mb-8">{ui.create.lead}</p>
        <Card><ProfileForm operator={null} onSaved={reload} /></Card>
      </TransportLayout>
    );
  }
  if (op.status !== "approved") {
    const msg = op.status === "pending" ? null : op.status === "rejected" ? ui.rejected(op.status_reason) : ui.suspended(op.status_reason);
    return (
      <TransportLayout width="max-w-2xl">
        <h1 className="font-display text-3xl text-ink mb-6">{op.name}</h1>
        <Card className="mb-6"><p className="font-medium text-ink">{op.status === "pending" ? ui.pending.title : msg}</p>{op.status === "pending" && <p className="text-sm text-ink-soft mt-2">{ui.pending.text}</p>}</Card>
        <Card><ProfileForm operator={op} onSaved={reload} /></Card>
      </TransportLayout>
    );
  }
  return (
    <TransportLayout>
      <div className="mb-8"><h1 className="font-display text-3xl sm:text-4xl text-ink">{op.name}</h1><p className="text-ink-soft mt-1">{ui.lead}</p></div>
      <Suspense fallback={<Spinner label="…" />}><OperatorTabs operator={op} reloadOperator={reload} /></Suspense>
    </TransportLayout>
  );
}

export default function OperatorApp() {
  const ui = useTransportUi().op;
  return <TransportAuthGate message={ui.signInMessage} width="max-w-2xl"><Space /></TransportAuthGate>;
}
