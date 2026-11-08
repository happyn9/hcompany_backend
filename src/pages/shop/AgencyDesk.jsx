import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, MapPin, Package, Search } from "lucide-react";
import ShopLayout from "../../components/shop/ShopLayout.jsx";
import AuthGate from "../../components/shop/AuthGate.jsx";
import { EmptyState, ErrorState, ShopImage, Spinner, StatusPill, useShopUi } from "../../components/shop/Shared.jsx";
import { errMessage, useLoad } from "../../data/shop.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const T = {
  fr: {
    title: "Guichet agence H-Shopping", lead: "Réceptionnez les colis des vendeurs, suivez-les et remettez-les aux clients.",
    search: "Rechercher un colis ou un client", none: "Aucun colis pour l'instant.", notAgency: "Votre compte n'est pas rattaché à une agence H-Shopping.",
    notAgencyHint: "Si vous êtes partenaire, demandez à H-Company d'activer votre agence. Sinon, devenez partenaire.", becomePartner: "Devenir partenaire",
    recipient: "Destinataire", seller: "Vendeur", mode: "Mode", note: "Note (facultatif)",
    actions: { received: "Colis reçu", in_transit: "En transit", available: "Disponible au retrait", picked_up: "Remis au client" },
    done: "Statut mis à jour.", filters: { open: "En cours", all: "Tous" }, fee: "Tarifs", pickup: "Retrait", home: "Domicile",
  },
  en: {
    title: "H-Shopping agency desk", lead: "Receive sellers' parcels, track them and hand them over to customers.",
    search: "Search a parcel or customer", none: "No parcels yet.", notAgency: "Your account isn't linked to an H-Shopping agency.",
    notAgencyHint: "If you are a partner, ask H-Company to activate your agency. Otherwise, become a partner.", becomePartner: "Become a partner",
    recipient: "Recipient", seller: "Seller", mode: "Mode", note: "Note (optional)",
    actions: { received: "Parcel received", in_transit: "In transit", available: "Ready for pickup", picked_up: "Handed to customer" },
    done: "Status updated.", filters: { open: "In progress", all: "All" }, fee: "Fees", pickup: "Pickup", home: "Home",
  },
};
const ORDER = ["received", "in_transit", "available", "picked_up"];

function Inner() {
  const ui = useShopUi();
  const { lang } = useLanguage();
  const t = T[lang] || T.fr;
  const { withAuth } = useUser();
  const toast = useToast();
  usePageMeta({ title: t.title });
  const me = useLoad(() => withAuth((tk) => api.shop.agency.me(tk)), []);
  const orders = useLoad(() => (me.data ? withAuth((tk) => api.shop.agency.orders(tk)) : Promise.resolve(null)), [me.data?.id]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("open");
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState({});

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (orders.data || []).filter((o) => (filter === "all" || ["shipped", "delivered"].includes(o.status)) && (!term || [o.code, o.tracking_code, o.recipient_name, o.recipient_phone, o.shop.name].some((x) => (x || "").toLowerCase().includes(term))));
  }, [orders.data, q, filter]);

  async function setStatus(o, st) {
    setBusy(`${o.code}:${st}`);
    try { await withAuth((tk) => api.shop.agency.setStatus(tk, o.code, st, notes[o.code] || "")); toast?.success?.(t.done); orders.reload(); }
    catch (e) { toast?.error?.(errMessage(e, ui.common.error)); } finally { setBusy(""); }
  }

  if (me.loading) return <ShopLayout><Spinner label={ui.common.loading} /></ShopLayout>;
  if (me.error) {
    return (
      <ShopLayout width="max-w-2xl">
        <EmptyState icon={MapPin} title={t.notAgency} hint={t.notAgencyHint} action={<Link to="/infos#rejoindre" className="rounded-full bg-ink text-cream text-sm px-6 py-3">{t.becomePartner}</Link>} />
      </ShopLayout>
    );
  }
  const a = me.data;
  return (
    <ShopLayout width="max-w-5xl">
      <h1 className="font-display text-3xl sm:text-4xl text-ink">{t.title}</h1>
      <p className="text-ink-soft mt-2 mb-6">{t.lead}</p>
      <div className="rounded-3xl bg-latte-soft p-5 mb-8 text-sm flex flex-wrap gap-x-8 gap-y-2">
        <p className="font-medium text-ink flex items-center gap-2"><MapPin size={16} className="text-coffee" /> {a.name} · {a.city}</p>
        <p className="text-ink-soft">{a.address}</p>
        <p className="text-ink-soft">{t.fee} : {t.pickup} {a.pickup_fee || 0}{a.home_fee !== null ? ` · ${t.home} ${a.home_fee}` : ""}</p>
      </div>
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[14rem]"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} aria-label={t.search} className="w-full rounded-full border border-line bg-surface pl-11 pr-4 py-3 text-sm text-ink focus:outline-none focus:border-coffee" /></div>
        {["open", "all"].map((k) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)} className={`rounded-full px-5 py-3 text-sm border ${filter === k ? "bg-ink text-cream border-ink" : "border-line text-ink-soft"}`}>{t.filters[k]}</button>)}
      </div>
      {orders.loading && <Spinner label={ui.common.loading} />}
      {orders.error && <ErrorState onRetry={orders.reload} />}
      {orders.data && list.length === 0 && <EmptyState icon={Package} title={t.none} />}
      <ul className="space-y-4">
        {list.map((o) => (
          <li key={o.code} className="rounded-3xl border border-line bg-surface p-5">
            <div className="flex justify-between gap-3 flex-wrap">
              <div><p className="font-mono text-ink">{o.tracking_code || o.code}</p><p className="text-xs text-ink-faint">{o.code} · {t.seller} : {o.shop.name}</p></div>
              <StatusPill status={o.status} label={ui.common.orderStatus[o.status] || o.status} />
            </div>
            <div className="mt-3 grid sm:grid-cols-2 gap-3 text-sm">
              <p className="text-ink-soft"><span className="text-xs text-ink-faint block">{t.recipient}</span>{o.recipient_name} · {o.recipient_phone}</p>
              <p className="text-ink-soft"><span className="text-xs text-ink-faint block">{t.mode}</span>{ui.common.delivery[o.delivery_mode]}{o.delivery_mode === "home_delivery" ? ` · ${o.address}${o.city ? `, ${o.city}` : ""}` : ""}</p>
            </div>
            <div className="mt-3 flex -space-x-2">{o.items.slice(0, 5).map((i) => <ShopImage key={i.id} path={i.image_path} ratio="w-9 h-9" className="rounded-lg ring-2 ring-surface" />)}</div>
            <div className="mt-4 flex flex-wrap gap-2 items-center">
              <input value={notes[o.code] || ""} onChange={(e) => setNotes((n) => ({ ...n, [o.code]: e.target.value }))} placeholder={t.note} maxLength={300} aria-label={t.note} className="flex-1 min-w-[10rem] rounded-full border border-line bg-surface px-4 py-2.5 text-xs text-ink focus:outline-none focus:border-coffee" />
              {ORDER.filter((s) => s !== "picked_up" || o.delivery_mode === "agency_pickup" || true).map((s) => (
                <button key={s} disabled={!!busy} onClick={() => setStatus(o, s)} className={`rounded-full text-xs font-medium px-4 py-2.5 inline-flex items-center gap-1.5 disabled:opacity-60 ${s === "picked_up" ? "bg-ink text-cream" : "border border-line text-ink hover:border-coffee-light"}`}>{busy === `${o.code}:${s}` && <Loader2 size={12} className="animate-spin" />}{t.actions[s]}</button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </ShopLayout>
  );
}
export default function AgencyDesk() { return <AuthGate><Inner /></AuthGate>; }
