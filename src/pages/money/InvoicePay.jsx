import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import PayPanel from "../../components/money/r/PayPanel.jsx";
import { api } from "../../lib/api.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";
import { msgOf, nf, useCorridors } from "../../components/money/parts.jsx";
import { InvoicePill } from "./Invoices.jsx";

/** Lien reçu par le client : détail de la facture et paiement en mobile money. */
export default function InvoicePay() {
  usePageMeta({ title: "Facture H-Money" });
  const { code } = useParams();
  const { isAuthenticated, isLoading, withAuth } = useUser();
  const { lang } = useLanguage();
  const fr = lang !== "en";
  const navigate = useNavigate();
  const cor = useCorridors();
  const [inv, setInv] = useState(undefined);
  const [op, setOp] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");

  useEffect(() => { if (!isLoading && !isAuthenticated) navigate("/connexion", { state: { redirectTo: `/money/facture/${code}` } }); }, [isLoading, isAuthenticated, navigate, code]);
  useEffect(() => { if (isAuthenticated) withAuth((t) => api.money.invoices.view(t, code)).then(setInv).catch((e) => setInv({ error: msgOf(e) })); }, [isAuthenticated, withAuth, code]);
  useEffect(() => {
    if (!isAuthenticated || !op) return;
    withAuth((t) => api.money.invoices.view(t, code, op)).then((x) => setInv((p) => (p && !p.error ? { ...p, quote: x.quote } : p))).catch(() => {});
  }, [op, isAuthenticated, withAuth, code]);

  if (inv === undefined) return <div className="min-h-screen bg-cream flex items-center justify-center"><Loader2 className="animate-spin text-ink-faint" /></div>;
  if (inv.error) return <div className="min-h-screen bg-cream px-5 py-16 text-center text-ink-soft">{inv.error}<div className="mt-6"><Link to="/app/factures" className="text-coffee-dark">{fr ? "Mes factures" : "My invoices"}</Link></div></div>;
  const q = inv.quote;
  const payable = (cor?.operators?.[inv.client_country] || []).filter((o) => o.pay);
  const opKey = op && payable.some((o) => o.key === op) ? op : payable[0]?.key || "";
  async function pay(phone) {
    setBusy(true); setErr("");
    try { const out = await withAuth((t) => api.money.invoices.pay(t, code, { pay_phone: phone, pay_operator: opKey })); setInv({ ...inv, ...out, quote: undefined }); }
    catch (x) { setErr(msgOf(x)); } finally { setBusy(false); }
  }
  const canPay = inv.status === "open" && inv.role === "client" && q;
  return (
    <PayPanel head={<>{fr ? "Facture de" : "Invoice from"} {inv.issuer_name || "—"} · {inv.code}</>} amount={nf(inv.total, inv.currency)} sub={inv.note ? `« ${inv.note} »` : null}
      q={canPay ? q : null} payCountry={inv.client_country} ops={payable} opKey={opKey} setOp={setOp} onPay={pay} busy={busy} err={err} simulated={cor?.simulated}>
      <div className="mt-3"><InvoicePill status={inv.status} fr={fr} /></div>
      <ul className="mt-4 divide-y divide-line text-sm">
        {inv.items.map((i, k) => <li key={k} className="py-2.5 flex justify-between gap-3"><span>{i.label}{i.qty !== 1 && <span className="text-ink-faint"> × {i.qty}</span>}</span><span className="tabular-nums">{nf(i.qty * i.unit_price, inv.currency)}</span></li>)}
      </ul>
      {inv.status === "paid" && <p className="mt-5 rounded-xl bg-emerald-500/10 text-emerald-700 text-sm p-3">{fr ? "Cette facture est payée. Merci !" : "This invoice is paid. Thank you!"}</p>}
      {inv.role === "issuer" && inv.status === "open" && <p className="mt-5 text-sm text-ink-soft">{fr ? "En attente du paiement du client." : "Waiting for the client's payment."}</p>}
    </PayPanel>
  );
}
