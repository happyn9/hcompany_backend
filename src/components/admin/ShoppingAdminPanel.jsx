import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Check, X, Ban, Plus, Save, AlertCircle, Store, Pencil } from "lucide-react";

const inputCls = "w-full rounded-xl border border-line bg-cream px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-coffee";
const btn = "rounded-lg px-3.5 py-2 text-xs font-medium transition-colors disabled:opacity-50";
const TABS = [
  ["overview", "Vue d'ensemble"], ["shops", "Boutiques"], ["orders", "Commandes & litiges"], ["payouts", "Retraits"],
  ["categories", "Catégories"], ["agencies", "Agences"], ["settings", "Réglages"],
];
const ORDER_LABEL = { pending_payment: "Paiement en attente", paid: "Payée", processing: "En préparation", shipped: "Expédiée", delivered: "Livrée", completed: "Terminée", cancelled: "Annulée", refunded: "Remboursée", disputed: "Litige" };
const SHOP_LABEL = { pending: "À valider", approved: "Validée", rejected: "Refusée", suspended: "Suspendue" };
const fmt = (n) => `${Number(n || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ZMW`;
const fdate = (v) => new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

function Pill({ children, tone = "info" }) {
  const cls = { ok: "bg-emerald-50 text-emerald-700 border-emerald-200", wait: "bg-amber-50 text-amber-700 border-amber-200", bad: "bg-red-50 text-red-700 border-red-200", info: "bg-latte-soft text-coffee-dark border-latte-light" }[tone];
  return <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${cls}`}>{children}</span>;
}
const shopTone = (s) => (s === "approved" ? "ok" : s === "pending" ? "wait" : "bad");
const orderTone = (s) => (["completed", "delivered"].includes(s) ? "ok" : ["cancelled", "refunded", "disputed"].includes(s) ? "bad" : s === "pending_payment" ? "wait" : "info");

function Box({ children, className = "" }) { return <div className={`bg-surface border border-line rounded-2xl p-5 ${className}`}>{children}</div>; }
function Err({ msg }) { return msg ? <p role="alert" className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5"><AlertCircle size={15} /> {msg}</p> : null; }
const msgOf = (e) => e?.data?.detail || e?.message || "Une erreur est survenue.";

export default function ShoppingAdminPanel({ withAuth, api, onCount }) {
  const A = api.shop.admin;
  const [tab, setTab] = useState("overview");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState(null);
  const [shops, setShops] = useState([]);
  const [shopFilter, setShopFilter] = useState("pending");
  const [orders, setOrders] = useState([]);
  const [orderFilter, setOrderFilter] = useState("disputed");
  const [orderQ, setOrderQ] = useState("");
  const [payouts, setPayouts] = useState([]);
  const [payFilter, setPayFilter] = useState("requested");
  const [cats, setCats] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [partners, setPartners] = useState([]);
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState("");
  const [tick, setTick] = useState(0);

  const guard = useCallback(async (fn) => {
    setError(""); setLoading(true);
    try { return (await withAuth(fn)) ?? true; } catch (e) { setError(msgOf(e)); return null; } finally { setLoading(false); }
  }, [withAuth]);

  const loadOverview = useCallback(async () => {
    const o = await guard((t) => A.overview(t));
    if (o) { setOverview(o); onCount?.(o.shops_pending + o.disputes_open + o.payouts_pending); }
  }, [guard, A, onCount]);
  useEffect(() => { loadOverview(); }, [loadOverview]);

  useEffect(() => {
    if (tab === "shops") guard((t) => A.shops(t, shopFilter || undefined)).then((d) => d && setShops(d));
    if (tab === "orders") guard((t) => A.orders(t, { status: orderFilter || undefined, q: orderQ || undefined })).then((d) => d && setOrders(d));
    if (tab === "payouts") guard((t) => A.payouts(t, payFilter || undefined)).then((d) => d && setPayouts(d));
    if (tab === "categories") guard((t) => A.categories(t)).then((d) => d && setCats(d));
    if (tab === "agencies") Promise.all([guard((t) => A.agencies(t)), guard((t) => A.partners(t))]).then(([a, p]) => { a && setAgencies(a); p && setPartners(p); });
    if (tab === "settings") guard((t) => A.settings(t)).then((d) => d && setSettings(d));
  }, [tab, shopFilter, orderFilter, payFilter, tick, guard, A]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => { loadOverview(); setTick((n) => n + 1); };
  async function act(key, fn, reloadTab) {
    setBusy(key);
    const r = await guard(fn);
    setBusy("");
    if (r !== null) { loadOverview(); reloadTab?.(); }
  }
  const reloadShops = () => guard((t) => A.shops(t, shopFilter || undefined)).then((d) => d && setShops(d));
  const reloadOrders = () => guard((t) => A.orders(t, { status: orderFilter || undefined, q: orderQ || undefined })).then((d) => d && setOrders(d));
  const reloadPayouts = () => guard((t) => A.payouts(t, payFilter || undefined)).then((d) => d && setPayouts(d));
  const reloadCats = () => guard((t) => A.categories(t)).then((d) => d && setCats(d));
  const reloadAgencies = () => guard((t) => A.agencies(t)).then((d) => d && setAgencies(d));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-line">
        {TABS.map(([k, l]) => {
          const n = k === "shops" ? overview?.shops_pending : k === "orders" ? overview?.disputes_open : k === "payouts" ? overview?.payouts_pending : 0;
          return <button key={k} onClick={() => setTab(k)} aria-selected={tab === k} role="tab" className={`whitespace-nowrap px-3.5 py-3 text-sm border-b-2 -mb-px ${tab === k ? "border-coffee text-ink font-medium" : "border-transparent text-ink-soft hover:text-ink"}`}>{l}{n > 0 && <span className="ml-1.5 rounded-md bg-latte px-1.5 text-[11px] font-semibold text-ink-fixed">{n}</span>}</button>;
        })}
        <button onClick={refresh} aria-label="Actualiser" className="ml-auto p-2 text-ink-soft hover:text-ink">{loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}</button>
      </div>
      <Err msg={error} />

      {tab === "overview" && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[["Volume d'affaires", fmt(overview.gmv)], ["Commissions encaissées", fmt(overview.commission)], ["Fonds sous séquestre", fmt(overview.escrow_held)], ["Commandes", overview.orders],
              ["Boutiques à valider", overview.shops_pending], ["Boutiques actives", overview.shops_approved], ["Produits en ligne", overview.products_active], ["Litiges ouverts", overview.disputes_open]].map(([l, v]) => (
              <Box key={l}><p className="text-xs text-ink-faint">{l}</p><p className="font-display text-2xl text-ink mt-1">{v}</p></Box>
            ))}
          </div>
          <Box><h3 className="text-sm font-medium text-ink mb-3">Commandes par statut</h3><div className="flex flex-wrap gap-2">{Object.entries(overview.by_status).map(([k, v]) => <Pill key={k} tone={orderTone(k)}>{ORDER_LABEL[k] || k} · {v}</Pill>)}</div></Box>
          <p className="text-xs text-ink-faint">Retraits à traiter : {overview.payouts_pending}. Les virements mobile money sont effectués manuellement puis marqués « payé » dans l'onglet Retraits.</p>
        </div>
      )}

      {tab === "shops" && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">{["pending", "approved", "suspended", "rejected", ""].map((s) => <button key={s || "all"} onClick={() => setShopFilter(s)} className={`${btn} border ${shopFilter === s ? "bg-ink text-cream border-ink" : "border-line text-ink-soft"}`}>{s ? SHOP_LABEL[s] : "Toutes"}</button>)}</div>
          {shops.length === 0 && <p className="text-sm text-ink-faint">Aucune boutique.</p>}
          {shops.map((s) => <ShopRow key={s.id} s={s} busy={busy} onAct={(body) => act(`shop${s.id}`, (t) => A.updateShop(t, s.id, body), reloadShops)} />)}
        </div>
      )}

      {tab === "orders" && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap items-center">
            {["disputed", "paid", "processing", "shipped", "delivered", "completed", "cancelled", ""].map((s) => <button key={s || "all"} onClick={() => setOrderFilter(s)} className={`${btn} border ${orderFilter === s ? "bg-ink text-cream border-ink" : "border-line text-ink-soft"}`}>{s ? ORDER_LABEL[s] : "Toutes"}</button>)}
            <form onSubmit={(e) => { e.preventDefault(); reloadOrders(); }} className="flex gap-2 ml-auto"><input className={`${inputCls} !w-48`} placeholder="Code HS-…" value={orderQ} onChange={(e) => setOrderQ(e.target.value)} /><button className={`${btn} bg-ink text-cream`}>Chercher</button></form>
          </div>
          {orders.length === 0 && <p className="text-sm text-ink-faint">Aucune commande.</p>}
          {orders.map((o) => <OrderRow key={o.code} o={o} busy={busy} onResolve={(decision, note) => act(`o${o.code}`, (t) => A.resolve(t, o.code, decision, note), reloadOrders)} />)}
        </div>
      )}

      {tab === "payouts" && (
        <div className="space-y-4">
          <div className="flex gap-2">{["requested", "paid", "rejected", ""].map((s) => <button key={s || "all"} onClick={() => setPayFilter(s)} className={`${btn} border ${payFilter === s ? "bg-ink text-cream border-ink" : "border-line text-ink-soft"}`}>{{ requested: "À payer", paid: "Payés", rejected: "Refusés", "": "Tous" }[s]}</button>)}</div>
          {payouts.length === 0 && <p className="text-sm text-ink-faint">Aucun retrait.</p>}
          {payouts.map((p) => (
            <Box key={p.id} className="flex flex-wrap items-center gap-4 justify-between">
              <div><p className="font-medium text-ink">{fmt(p.amount)} <span className="text-ink-faint font-normal text-xs">· {p.shop_name}</span></p><p className="text-xs text-ink-soft mt-0.5">{p.operator} · <span className="font-mono">{p.phone}</span> · {p.reference} · {fdate(p.created_at)}</p></div>
              {p.status === "requested" ? (
                <div className="flex gap-2">
                  <button disabled={busy === `p${p.id}`} onClick={() => window.confirm(`Confirmer que ${fmt(p.amount)} a été envoyé au ${p.phone} ?`) && act(`p${p.id}`, (t) => A.updatePayout(t, p.id, "paid"), reloadPayouts)} className={`${btn} bg-emerald-600 text-white`}>Marquer payé</button>
                  <button disabled={busy === `p${p.id}`} onClick={() => { const n = window.prompt("Motif du refus ?"); if (n) act(`p${p.id}`, (t) => A.updatePayout(t, p.id, "rejected", n), reloadPayouts); }} className={`${btn} border border-line text-ink-soft`}>Refuser</button>
                </div>
              ) : <Pill tone={p.status === "paid" ? "ok" : "bad"}>{p.status === "paid" ? "Payé" : "Refusé"}</Pill>}
            </Box>
          ))}
        </div>
      )}

      {tab === "categories" && <Categories cats={cats} busy={busy} onSave={(id, body) => act("cat", (t) => (id ? A.updateCategory(t, id, body) : A.createCategory(t, body)), reloadCats)} onDelete={(id) => act("cat", (t) => A.deleteCategory(t, id), reloadCats)} />}
      {tab === "agencies" && <Agencies agencies={agencies} partners={partners} busy={busy} onSave={(id, body) => act("ag", (t) => (id ? A.updateAgency(t, id, body) : A.createAgency(t, body)), () => { reloadAgencies(); guard((t) => A.partners(t)).then((p) => p && setPartners(p)); })} />}
      {tab === "settings" && settings && <Settings settings={settings} busy={busy === "set"} onSave={(body) => act("set", (t) => A.saveSettings(t, body), () => guard((t) => A.settings(t)).then((d) => d && setSettings(d)))} />}
    </div>
  );
}

function ShopRow({ s, busy, onAct }) {
  const [rate, setRate] = useState(s.shop_commission_rate ?? "");
  return (
    <Box>
      <div className="flex flex-wrap justify-between gap-3">
        <div className="min-w-0"><p className="font-medium text-ink flex items-center gap-2 flex-wrap"><Store size={15} className="text-coffee" /> {s.name} <Pill tone={shopTone(s.status)}>{SHOP_LABEL[s.status]}</Pill>{s.is_partner && <Pill>Partenaire</Pill>}{s.is_featured && <Pill>Vedette</Pill>}</p>
          <p className="text-xs text-ink-soft mt-1">{s.owner_name} · {s.owner_email} · {s.city || "—"} · {s.phone || "—"}</p>
          <p className="text-xs text-ink-faint mt-0.5">{s.product_count} produits · {s.orders_count} commandes · {fmt(s.revenue)} libérés · créée le {fdate(s.created_at)}</p>
          {s.status_reason && <p className="text-xs text-amber-700 mt-1">Motif : {s.status_reason}</p>}
          {s.description && <p className="text-xs text-ink-soft mt-2 line-clamp-2 max-w-2xl">{s.description}</p>}
        </div>
        <div className="flex gap-2 items-start flex-wrap">
          {s.status !== "approved" && <button disabled={busy === `shop${s.id}`} onClick={() => onAct({ status: "approved" })} className={`${btn} bg-emerald-600 text-white inline-flex items-center gap-1`}><Check size={13} /> Valider</button>}
          {s.status === "pending" && <button onClick={() => { const r = window.prompt("Motif du refus (visible par le vendeur) ?"); if (r) onAct({ status: "rejected", reason: r }); }} className={`${btn} border border-line text-ink-soft inline-flex items-center gap-1`}><X size={13} /> Refuser</button>}
          {s.status === "approved" && <button onClick={() => { const r = window.prompt("Motif de la suspension ?"); if (r) onAct({ status: "suspended", reason: r }); }} className={`${btn} border border-line text-red-700 inline-flex items-center gap-1`}><Ban size={13} /> Suspendre</button>}
          <button onClick={() => onAct({ status: s.status, is_featured: !s.is_featured })} className={`${btn} border border-line text-ink-soft`}>{s.is_featured ? "Retirer vedette" : "Mettre en vedette"}</button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-ink-soft">Commission propre (%) <input type="number" min="0" max="60" step="0.5" className={`${inputCls} !w-24 !py-1.5`} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="auto" /><button onClick={() => onAct({ status: s.status, commission_rate: rate === "" ? null : Number(rate) })} className={`${btn} border border-line`}>Appliquer</button></div>
    </Box>
  );
}

function OrderRow({ o, busy, onResolve }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <Box>
      <div className="flex flex-wrap justify-between gap-3">
        <div><p className="font-mono text-sm text-ink">{o.code} <Pill tone={orderTone(o.status)}>{ORDER_LABEL[o.status] || o.status}</Pill></p><p className="text-xs text-ink-soft mt-1">{o.shop.name} → {o.buyer_name || o.recipient_name} · {fdate(o.created_at)}</p><p className="text-xs text-ink-faint">Séquestre : {o.escrow_status} · commission {fmt(o.commission_amount)} · net vendeur {fmt(o.seller_net)}</p></div>
        <p className="font-display text-xl text-ink">{fmt(o.total)}</p>
      </div>
      {o.status === "disputed" && (
        <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
          <p className="font-medium">{o.dispute_reason}</p>{o.dispute_note && <p className="text-xs mt-1">{o.dispute_note}</p>}
          {!open ? <button onClick={() => setOpen(true)} className={`${btn} mt-3 bg-ink text-cream`}>Trancher le litige</button> : (
            <div className="mt-3 space-y-2">
              <textarea className={inputCls} rows={2} placeholder="Note de décision (visible dans l'historique)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex gap-2"><button disabled={busy === `o${o.code}`} onClick={() => window.confirm("Rembourser l'acheteur ?") && onResolve("refund", note)} className={`${btn} bg-ink text-cream`}>Rembourser l'acheteur</button><button disabled={busy === `o${o.code}`} onClick={() => window.confirm("Verser le paiement au vendeur ?") && onResolve("release", note)} className={`${btn} border border-line bg-surface text-ink`}>Payer le vendeur</button></div>
            </div>
          )}
        </div>
      )}
    </Box>
  );
}

function Categories({ cats, busy, onSave, onDelete }) {
  const empty = { name_fr: "", name_en: "", icon: "tag", parent_id: "", commission_rate: "", sort_order: 0, is_active: true };
  const [f, setF] = useState(empty);
  const [editing, setEditing] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const roots = cats.filter((c) => !c.parent_id);
  function submit(e) {
    e.preventDefault();
    onSave(editing, { name_fr: f.name_fr, name_en: f.name_en, icon: f.icon || "tag", parent_id: f.parent_id ? Number(f.parent_id) : null, commission_rate: f.commission_rate === "" || f.commission_rate === null ? null : Number(f.commission_rate), sort_order: Number(f.sort_order) || 0, is_active: f.is_active });
    setF(empty); setEditing(null);
  }
  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
      <div className="space-y-2">
        {cats.map((c) => (
          <Box key={c.id} className={`!py-3 flex items-center gap-3 justify-between ${c.parent_id ? "ml-6" : ""}`}>
            <div className="min-w-0"><p className="text-sm text-ink">{c.name_fr} <span className="text-ink-faint text-xs">/ {c.name_en}</span> {!c.is_active && <Pill tone="bad">Masquée</Pill>}</p><p className="text-xs text-ink-faint">{c.product_count} produits · commission {c.commission_rate ?? "globale"}{c.commission_rate !== null && c.commission_rate !== undefined ? " %" : ""}</p></div>
            <div className="flex gap-2"><button aria-label="Modifier" onClick={() => { setEditing(c.id); setF({ name_fr: c.name_fr, name_en: c.name_en, icon: c.icon, parent_id: c.parent_id || "", commission_rate: c.commission_rate ?? "", sort_order: c.sort_order, is_active: c.is_active }); }} className="text-ink-soft hover:text-ink"><Pencil size={15} /></button><button aria-label="Supprimer" onClick={() => window.confirm("Supprimer cette catégorie ?") && onDelete(c.id)} className="text-ink-faint hover:text-red-600"><X size={16} /></button></div>
          </Box>
        ))}
      </div>
      <form onSubmit={submit} className="bg-surface border border-line rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-medium text-ink">{editing ? "Modifier la catégorie" : "Nouvelle catégorie"}</h3>
        <input required minLength={2} className={inputCls} placeholder="Nom (FR)" value={f.name_fr} onChange={set("name_fr")} />
        <input className={inputCls} placeholder="Nom (EN)" value={f.name_en} onChange={set("name_en")} />
        <select className={inputCls} value={f.parent_id} onChange={set("parent_id")}><option value="">Catégorie principale</option>{roots.filter((r) => r.id !== editing).map((r) => <option key={r.id} value={r.id}>{r.name_fr}</option>)}</select>
        <div className="grid grid-cols-2 gap-3"><input className={inputCls} placeholder="Icône (ex. shirt)" value={f.icon} onChange={set("icon")} /><input type="number" min="0" max="60" step="0.5" className={inputCls} placeholder="Commission %" value={f.commission_rate} onChange={set("commission_rate")} /></div>
        <label className="flex items-center gap-2 text-xs text-ink-soft"><input type="checkbox" checked={f.is_active} onChange={set("is_active")} /> Visible</label>
        <div className="flex gap-2"><button disabled={!!busy} className={`${btn} bg-ink text-cream inline-flex items-center gap-1`}><Save size={13} /> Enregistrer</button>{editing && <button type="button" onClick={() => { setEditing(null); setF(empty); }} className={`${btn} border border-line`}>Annuler</button>}</div>
      </form>
    </div>
  );
}

function Agencies({ agencies, partners, busy, onSave }) {
  const empty = { partner_application_id: "", name: "", city: "", address: "", phone: "", hours: "", pickup_fee: 0, home_fee: "", is_active: true };
  const [f, setF] = useState(empty);
  const [editing, setEditing] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  function submit(e) {
    e.preventDefault();
    onSave(editing, { ...f, partner_application_id: Number(f.partner_application_id), pickup_fee: Number(f.pickup_fee) || 0, home_fee: f.home_fee === "" ? null : Number(f.home_fee) });
    setF(empty); setEditing(null);
  }
  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
      <div className="space-y-3">
        {agencies.length === 0 && <p className="text-sm text-ink-faint">Aucune agence. Rattachez un partenaire approuvé (ex. Lukondo) pour activer la livraison.</p>}
        {agencies.map((a) => (
          <Box key={a.id} className="flex justify-between gap-3 items-start">
            <div><p className="text-sm font-medium text-ink">{a.name} <span className="text-ink-faint font-normal">· {a.city}</span> {!a.is_active && <Pill tone="bad">Inactive</Pill>}</p><p className="text-xs text-ink-soft">{a.address} · {a.phone}</p><p className="text-xs text-ink-faint">Retrait {fmt(a.pickup_fee)} · Domicile {a.home_fee === null ? "non proposé" : fmt(a.home_fee)}{a.hours ? ` · ${a.hours}` : ""}</p></div>
            <button aria-label="Modifier" onClick={() => { setEditing(a.id); setF({ partner_application_id: a.partner_application_id ?? "", name: a.name, city: a.city, address: a.address, phone: a.phone, hours: a.hours, pickup_fee: a.pickup_fee, home_fee: a.home_fee ?? "", is_active: a.is_active }); }} className="text-ink-soft hover:text-ink"><Pencil size={15} /></button>
          </Box>
        ))}
      </div>
      <form onSubmit={submit} className="bg-surface border border-line rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-medium text-ink">{editing ? "Modifier l'agence" : "Nouvelle agence"}</h3>
        <select required className={inputCls} value={f.partner_application_id} onChange={set("partner_application_id")} disabled={!!editing}><option value="">Partenaire approuvé…</option>{partners.filter((p) => !p.already_agency || p.id === Number(f.partner_application_id)).map((p) => <option key={p.id} value={p.id}>{p.company}{p.category ? ` · ${p.category}` : ""}</option>)}</select>
        <input required minLength={2} className={inputCls} placeholder="Nom affiché" value={f.name} onChange={set("name")} />
        <div className="grid grid-cols-2 gap-3"><input className={inputCls} placeholder="Ville" value={f.city} onChange={set("city")} /><input className={inputCls} placeholder="Téléphone" value={f.phone} onChange={set("phone")} /></div>
        <input className={inputCls} placeholder="Adresse" value={f.address} onChange={set("address")} />
        <input className={inputCls} placeholder="Horaires (ex. Lun–Sam 8h–18h)" value={f.hours} onChange={set("hours")} />
        <div className="grid grid-cols-2 gap-3"><label className="text-xs text-ink-soft">Frais retrait<input type="number" min="0" step="0.01" className={`${inputCls} mt-1`} value={f.pickup_fee} onChange={set("pickup_fee")} /></label><label className="text-xs text-ink-soft">Frais domicile<input type="number" min="0" step="0.01" className={`${inputCls} mt-1`} value={f.home_fee} onChange={set("home_fee")} placeholder="vide = non" /></label></div>
        <label className="flex items-center gap-2 text-xs text-ink-soft"><input type="checkbox" checked={f.is_active} onChange={set("is_active")} /> Active</label>
        <div className="flex gap-2"><button disabled={!!busy} className={`${btn} bg-ink text-cream inline-flex items-center gap-1`}><Plus size={13} /> Enregistrer</button>{editing && <button type="button" onClick={() => { setEditing(null); setF(empty); }} className={`${btn} border border-line`}>Annuler</button>}</div>
      </form>
    </div>
  );
}

function Settings({ settings, busy, onSave }) {
  const [f, setF] = useState(settings);
  const rows = [["commission_rate", "Commission globale (%)", "Appliquée si ni la boutique ni la catégorie n'ont de taux propre."], ["free_shipping_threshold", "Livraison offerte dès (ZMW)", "0 = désactivé. Par boutique."], ["auto_release_days", "Libération automatique (jours)", "Délai après livraison avant versement automatique au vendeur."], ["dispute_window_days", "Fenêtre de litige (jours)", "Délai laissé à l'acheteur pour ouvrir un litige."], ["min_payout", "Retrait minimum (ZMW)", ""]];
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(Object.fromEntries(rows.map(([k]) => [k, Number(f[k])]))); }} className="bg-surface border border-line rounded-2xl p-6 max-w-xl space-y-4">
      {rows.map(([k, l, h]) => <label key={k} className="block text-sm text-ink">{l}<input type="number" min="0" step="0.5" className={`${inputCls} mt-1.5`} value={f[k] ?? ""} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />{h && <span className="block text-xs text-ink-faint mt-1">{h}</span>}</label>)}
      <button disabled={busy} className={`${btn} bg-ink text-cream inline-flex items-center gap-1`}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Enregistrer</button>
    </form>
  );
}
