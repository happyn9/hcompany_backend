import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, FilePlus2, FileText, Loader2, MessageCircle, Plus, Trash2 } from "lucide-react";
import { api } from "../../lib/api.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";
import LoginGateModal from "../../components/ui/LoginGateModal.jsx";
import { COUNTRY, FLAG, input, msgOf, nf, useCorridors } from "../../components/money/parts.jsx";

const ST = { open: ["En attente", "Pending", "bg-amber-500/15 text-amber-700"], paid: ["Payée", "Paid", "bg-emerald-500/15 text-emerald-700"], cancelled: ["Annulée", "Cancelled", "bg-ink/10 text-ink-soft"], expired: ["Expirée", "Expired", "bg-ink/10 text-ink-soft"], declined: ["Refusée", "Declined", "bg-red-500/15 text-red-700"], refunded: ["Remboursée", "Refunded", "bg-ink/10 text-ink-soft"], rejected: ["Refusée", "Declined", "bg-red-500/15 text-red-700"] };
export function InvoicePill({ status, fr }) { const [a, b, c] = ST[status] || ST.open; return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${c}`}>{fr ? a : b}</span>; }

function CreateForm({ onCreated, fr }) {
  const { withAuth, user } = useUser();
  const cor = useCorridors();
  const [f, setF] = useState({ client_name: "", client_email: "", client_phone: "", client_country: "ZM", receive_country: "ZM", receive_phone: "", receive_operator: "", note: "", due_days: 14 });
  const [items, setItems] = useState([{ label: "", qty: 1, unit_price: "" }]);
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const [q, setQ] = useState(""), [found, setFound] = useState([]), [picked, setPicked] = useState(null);
  useEffect(() => {
    if (picked || q.trim().length < 3) { setFound([]); return undefined; }
    let on = true;
    const t = setTimeout(() => { withAuth((tk) => api.money.invoices.clients(tk, q.trim())).then((r) => on && setFound(r)).catch(() => on && setFound([])); }, 300);
    return () => { on = false; clearTimeout(t); };
  }, [q, picked, withAuth]);
  const ops = (cor?.operators?.[f.receive_country] || []).filter((o) => o.receive);
  const op = f.receive_operator && ops.some((o) => o.key === f.receive_operator) ? f.receive_operator : ops[0]?.key || "";
  const total = useMemo(() => items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unit_price) || 0), 0), [items]);
  const cur = cor?.currencies?.[f.receive_country] || "";
  const upd = (i, k, v) => setItems((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const out = await withAuth((t) => api.money.invoices.create(t, { ...f, ...(picked ? { client_user_id: picked.id, client_name: picked.name } : {}), receive_operator: op, due_days: Number(f.due_days) || 14, items: items.map((i) => ({ label: i.label, qty: Number(i.qty) || 1, unit_price: Number(i.unit_price) })) }));
      onCreated(out);
    } catch (x) { setErr(msgOf(x)); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="rounded-2xl border border-line p-4">
        <p className="text-sm font-medium text-ink">{fr ? "Cibler un client H-Company" : "Target an H-Company client"}</p>
        <p className="text-xs text-ink-faint mb-3">{fr ? "Il verra la dette dans son compte et pourra la régler en mobile money (Zambie ou RDC)." : "They'll see the debt in their account and can pay by mobile money (Zambia or DRC)."}</p>
        {picked ? (
          <div className="flex items-center justify-between rounded-lg bg-latte-soft/70 px-3 py-2.5 text-sm"><span><strong>{picked.name}</strong> <span className="text-ink-faint">{picked.email || picked.phone}</span></span><button type="button" onClick={() => { setPicked(null); setQ(""); }} className="text-coffee-dark text-xs font-semibold">{fr ? "Changer" : "Change"}</button></div>
        ) : (<>
          <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={fr ? "Nom, e-mail ou téléphone (3 caractères min.)" : "Name, email or phone (min. 3 characters)"} />
          {found.length > 0 && <ul className="mt-2 rounded-lg border border-line divide-y divide-line bg-surface">{found.map((u) => <li key={u.id}><button type="button" onClick={() => { setPicked(u); setFound([]); }} className="w-full text-left px-3 py-2.5 text-sm hover:bg-latte-soft/60"><strong>{u.name}</strong> <span className="text-ink-faint">{u.email} {u.phone}</span></button></li>)}</ul>}
          {q.trim().length >= 3 && found.length === 0 && <p className="text-xs text-ink-faint mt-2">{fr ? "Aucun résultat : saisissez ses informations ci-dessous, il recevra un lien." : "No match: enter their details below, they'll get a link."}</p>}
        </>)}
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {!picked && <label className="block"><span className="text-xs text-ink-soft">{fr ? "Nom du client" : "Client name"}</span><input required className={input} value={f.client_name} onChange={set("client_name")} /></label>}
        {!picked && <label className="block"><span className="text-xs text-ink-soft">{fr ? "E-mail du client (il verra la facture dans son compte)" : "Client email (they'll see the invoice in their account)"}</span><input type="email" className={input} value={f.client_email} onChange={set("client_email")} /></label>}
        <label className="block"><span className="text-xs text-ink-soft">{fr ? "Le client paie depuis" : "Client pays from"}</span><select className={input} value={f.client_country} onChange={set("client_country")}>{["ZM", "CD"].map((c) => <option key={c} value={c}>{FLAG[c]} {COUNTRY[c].fr}</option>)}</select></label>
        <label className="block"><span className="text-xs text-ink-soft">{fr ? "Je reçois en" : "I receive in"}</span><select className={input} value={f.receive_country} onChange={set("receive_country")}>{["ZM", "CD"].map((c) => <option key={c} value={c}>{FLAG[c]} {COUNTRY[c].fr}</option>)}</select></label>
        <label className="block"><span className="text-xs text-ink-soft">{fr ? "Mon numéro mobile money" : "My mobile money number"}</span><input required className={input} value={f.receive_phone} onChange={set("receive_phone")} inputMode="tel" /></label>
        <label className="block"><span className="text-xs text-ink-soft">{fr ? "Opérateur" : "Operator"}</span><select className={input} value={op} onChange={set("receive_operator")}>{ops.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></label>
      </div>
      <div>
        <p className="text-sm font-medium mb-2">{fr ? "Lignes de la facture" : "Invoice lines"} {cur && <span className="text-ink-faint">({cur})</span>}</p>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_64px_96px_32px] sm:grid-cols-[1fr_80px_130px_36px] gap-2 items-center">
              <input required placeholder={fr ? "Description" : "Description"} className={input} value={it.label} onChange={(e) => upd(i, "label", e.target.value)} />
              <input type="number" min="0.01" step="any" aria-label={fr ? "Quantité" : "Quantity"} className={input} value={it.qty} onChange={(e) => upd(i, "qty", e.target.value)} />
              <input required type="number" min="0.01" step="any" placeholder={fr ? "Prix unitaire" : "Unit price"} className={input} value={it.unit_price} onChange={(e) => upd(i, "unit_price", e.target.value)} />
              <button type="button" disabled={items.length === 1} onClick={() => setItems((l) => l.filter((_, j) => j !== i))} aria-label={fr ? "Supprimer la ligne" : "Remove line"} className="w-9 h-9 rounded-lg text-ink-soft hover:bg-latte-soft disabled:opacity-30 flex items-center justify-center"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setItems((l) => [...l, { label: "", qty: 1, unit_price: "" }])} className="mt-3 inline-flex items-center gap-1.5 text-sm text-coffee-dark"><Plus size={15} />{fr ? "Ajouter une ligne" : "Add a line"}</button>
      </div>
      <div className="grid sm:grid-cols-[1fr_160px] gap-4">
        <label className="block"><span className="text-xs text-ink-soft">{fr ? "Note (facultatif)" : "Note (optional)"}</span><input className={input} value={f.note} onChange={set("note")} maxLength={300} /></label>
        <label className="block"><span className="text-xs text-ink-soft">{fr ? "Échéance (jours)" : "Due in (days)"}</span><input type="number" min="1" max="90" className={input} value={f.due_days} onChange={set("due_days")} /></label>
      </div>
      <div className="rounded-2xl bg-ink-fixed text-cream-fixed p-5 flex items-baseline justify-between"><span className="text-sm text-cream-fixed/70">{fr ? "Total que vous recevrez" : "Total you'll receive"}</span><span className="font-display text-3xl tabular-nums" style={{ color: "#C89A3D" }}>{nf(total, cur)}</span></div>
      <p className="text-xs text-ink-faint">{fr ? "Les frais H-Money sont ajoutés au montant que paie votre client : vous recevez le total de la facture." : "H-Money fees are added to what your client pays: you receive the invoice total."}</p>
      {err && <p role="alert" className="rounded-xl bg-red-500/10 text-red-700 text-sm p-3">{err}</p>}
      <button disabled={busy || !total || !user} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-7 py-3.5 hover:bg-coffee-dark disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <FilePlus2 size={15} />}{fr ? "Générer la facture" : "Generate invoice"}</button>
    </form>
  );
}

export default function Invoices({ inline = false, initial = "mine" }) {
  usePageMeta({ title: "Factures" });
  const { isAuthenticated, isLoading, withAuth } = useUser();
  const { lang } = useLanguage();
  const fr = lang !== "en";
  const toast = useToast();
  const [tab, setTab] = useState(initial);
  const [list, setList] = useState(null);
  const [made, setMade] = useState(null);
  const [gate, setGate] = useState(false);
  const load = useCallback(() => withAuth((t) => api.money.invoices.list(t)).then(setList).catch(() => setList([])), [withAuth]);
  useEffect(() => { if (isAuthenticated) load(); }, [isAuthenticated, load]);
  const issued = (list || []).filter((i) => i.role === "issuer"), toPay = (list || []).filter((i) => i.role === "client");
  const shown = tab === "pay" ? toPay : issued;
  const linkOf = (i) => `${window.location.origin}${i.link}`;
  const guard = (fn) => () => (isAuthenticated ? fn() : setGate(true));
  return (
    <div className={inline ? "" : "max-w-3xl mx-auto px-4 sm:px-6 py-8"}>
      {!inline && <h1 className="font-display text-3xl sm:text-4xl">{fr ? "Factures" : "Invoices"}</h1>}
      <p className="text-sm text-ink-soft mt-2 mb-6">{fr ? "Générez une facture, envoyez le lien à votre client et recevez le paiement en mobile money. Réglez aussi les factures qu'on vous envoie." : "Generate an invoice, send the link to your client and get paid by mobile money. Pay the invoices you receive too."}</p>
      <div role="tablist" className="grid grid-cols-3 rounded-2xl bg-latte-soft p-1 mb-7">
        {[["mine", fr ? "Émises" : "Issued"], ["pay", fr ? "À payer" : "To pay"], ["new", fr ? "Nouvelle" : "New"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setMade(null); }} className={`rounded-xl py-2.5 text-sm font-medium ${tab === k ? "bg-ink text-cream shadow-sm" : "text-coffee-dark"}`}>{l}{k === "pay" && toPay.filter((i) => i.status === "open").length > 0 ? ` (${toPay.filter((i) => i.status === "open").length})` : ""}</button>
        ))}
      </div>
      {tab === "new" ? (
        made ? (
          <div className="rounded-3xl border border-line bg-surface p-8 text-center">
            <span className="mx-auto w-14 h-14 rounded-full bg-latte-soft text-coffee-dark flex items-center justify-center"><FileText size={24} /></span>
            <h2 className="font-display text-2xl mt-4">{fr ? "Facture créée" : "Invoice created"}</h2>
            <p className="text-sm text-ink-soft mt-2">{made.code} · {nf(made.total, made.currency)}</p>
            <p className="mt-4 rounded-xl bg-cream border border-line px-4 py-3 text-xs break-all text-ink-soft">{linkOf(made)}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button onClick={() => { navigator.clipboard?.writeText(linkOf(made)); toast?.success?.(fr ? "Lien copié" : "Link copied"); }} className="inline-flex items-center gap-2 rounded-full border border-line text-sm font-medium px-5 py-3"><Copy size={15} />{fr ? "Copier" : "Copy"}</button>
              <a href={`https://wa.me/?text=${encodeURIComponent(`${fr ? "Bonjour, voici votre facture" : "Hello, here is your invoice"} ${made.code} : ${linkOf(made)}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-5 py-3"><MessageCircle size={15} />WhatsApp</a>
            </div>
            <button onClick={() => { setMade(null); setTab("mine"); load(); }} className="mt-5 text-sm text-coffee-dark">{fr ? "Voir mes factures" : "See my invoices"}</button>
          </div>
        ) : isAuthenticated ? <CreateForm fr={fr} onCreated={(o) => { setMade(o); load(); }} /> : (
          <div className="rounded-3xl border border-line bg-surface p-8 text-center"><p className="text-sm text-ink-soft">{fr ? "Connectez-vous pour générer une facture." : "Sign in to generate an invoice."}</p><button onClick={() => setGate(true)} className="mt-4 rounded-full bg-ink text-cream text-sm font-medium px-6 py-3">{fr ? "Se connecter" : "Sign in"}</button></div>
        )
      ) : !isAuthenticated && !isLoading ? (
        <div className="rounded-3xl border border-line bg-surface p-8 text-center"><p className="text-sm text-ink-soft">{fr ? "Connectez-vous pour voir vos factures." : "Sign in to see your invoices."}</p><button onClick={guard(() => {})} className="mt-4 rounded-full bg-ink text-cream text-sm font-medium px-6 py-3">{fr ? "Se connecter" : "Sign in"}</button></div>
      ) : list === null ? <div className="h-24 rounded-2xl bg-latte-soft animate-pulse" /> : shown.length === 0 ? (
        <p className="text-center text-sm text-ink-soft py-12">{tab === "pay" ? (fr ? "Aucune facture à payer." : "No invoice to pay.") : (fr ? "Aucune facture émise pour l'instant." : "No invoice issued yet.")}</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((i) => (
            <li key={i.code} className="rounded-2xl border border-line bg-surface p-4 flex items-center gap-4">
              <div className="min-w-0 flex-1"><p className="font-medium truncate">{tab === "pay" ? i.issuer_name || (fr ? "Facture" : "Invoice") : i.client_name}</p><p className="text-xs text-ink-faint">{i.code} · {new Date(i.created_at).toLocaleDateString(fr ? "fr-FR" : "en-GB")}</p></div>
              <div className="text-right"><p className="font-display text-lg tabular-nums">{nf(i.total, i.currency)}</p><InvoicePill status={i.status} fr={fr} /></div>
              {tab === "pay" && i.status === "open" ? <Link to={i.link} className="rounded-full bg-ink text-cream text-xs font-medium px-4 py-2">{fr ? "Payer" : "Pay"}</Link> : <Link to={i.link} className="rounded-full border border-line text-xs font-medium px-4 py-2">{fr ? "Voir" : "View"}</Link>}
            </li>
          ))}
        </ul>
      )}
      {gate && <LoginGateModal onClose={() => setGate(false)} redirectTo="/app/factures" />}
    </div>
  );
}
