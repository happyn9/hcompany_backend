import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, MapPin, Search } from "lucide-react";
import ShopLayout from "../../components/shop/ShopLayout.jsx";
import { EventTimeline, StatusPill, useShopUi } from "../../components/shop/Shared.jsx";
import { errMessage } from "../../data/shop.js";
import { api } from "../../lib/api.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const input = "w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-coffee focus:ring-2 focus:ring-coffee/15";

export default function TrackPage() {
  const ui = useShopUi();
  const t = ui.track;
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get("code") || "");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState({ loading: false, error: "", data: null });
  usePageMeta({ title: t.title });

  async function submit(e) {
    e.preventDefault();
    if (!code.trim() || phone.replace(/\D/g, "").length < 4) { setState({ loading: false, data: null, error: t.notFound }); return; }
    setState({ loading: true, error: "", data: null });
    try {
      const data = await api.shop.track(code.trim(), phone.replace(/\D/g, "").slice(-4));
      setState({ loading: false, error: "", data });
    } catch (err) {
      setState({ loading: false, data: null, error: err?.status === 404 ? t.notFound : errMessage(err, ui.common.error) });
    }
  }
  const d = state.data;
  return (
    <ShopLayout width="max-w-2xl">
      <h1 className="font-display text-3xl sm:text-4xl text-ink">{t.title}</h1>
      <p className="text-ink-soft mt-2 mb-8">{t.lead}</p>
      <form onSubmit={submit} className="rounded-3xl border border-line bg-surface p-6 grid sm:grid-cols-[1fr_180px_auto] gap-3 items-end" noValidate>
        <label className="block"><span className="block text-sm font-medium text-ink mb-1.5">{t.code}</span><input className={input} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="HS-XXXXXX" autoCapitalize="characters" /></label>
        <label className="block"><span className="block text-sm font-medium text-ink mb-1.5">{t.phone}</span><input className={input} inputMode="numeric" maxLength={4} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="1234" /></label>
        <button disabled={state.loading} className="rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5 inline-flex items-center justify-center gap-2 disabled:opacity-60">{state.loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} {t.go}</button>
      </form>
      {state.error && <p role="alert" className="mt-4 rounded-2xl bg-red-500/10 text-red-700 dark:text-red-300 text-sm p-4">{state.error}</p>}
      {d && (
        <div className="mt-8 rounded-3xl border border-line bg-surface p-6 sm:p-8">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
            <div>
              {d.recipient_first_name && <p className="text-sm text-ink-soft">{t.hello(d.recipient_first_name)}</p>}
              <p className="font-display text-2xl text-ink">{d.shop_name}</p>
              <p className="text-xs text-ink-faint font-mono mt-1">{d.code}{d.tracking_code ? ` · ${d.tracking_code}` : ""}</p>
            </div>
            <StatusPill status={d.status} label={ui.common.orderStatus[d.status] || d.status} />
          </div>
          {d.agency && <p className="flex gap-2 text-sm text-ink-soft mb-6"><MapPin size={16} className="text-coffee shrink-0 mt-0.5" /> <span>{t.pickupAt} <strong className="text-ink font-medium">{d.agency.name}</strong> · {d.agency.address}, {d.agency.city}</span></p>}
          <EventTimeline events={d.events} />
        </div>
      )}
    </ShopLayout>
  );
}
