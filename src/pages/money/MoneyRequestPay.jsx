import PayPanel from "../../components/money/r/PayPanel.jsx";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api } from "../../lib/api.js";
import { useUser } from "../../context/Usercontext.jsx";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";
import { FLAG, StatusPill, msgOf, nf, useCorridors } from "../../components/money/parts.jsx";

/** Page ouverte par le lien reçu : « Jean vous demande 250 ZMW » → on paie depuis chez soi. */
export default function MoneyRequestPay() {
  usePageMeta({ title: "Demande H-Money" });
  const { code } = useParams();
  const { isAuthenticated, isLoading, withAuth } = useUser();
  const navigate = useNavigate();
  const cor = useCorridors();
  const [r, setR] = useState(undefined);
  const [op, setOp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { if (!isLoading && !isAuthenticated) navigate("/connexion", { state: { redirectTo: `/money/demande/${code}` } }); }, [isLoading, isAuthenticated, navigate, code]);
  useEffect(() => { if (isAuthenticated) withAuth((t) => api.money.viewRequest(t, code)).then(setR).catch((e) => setR({ error: msgOf(e) })); }, [isAuthenticated, withAuth, code]);

  useEffect(() => {
    if (!isAuthenticated || !op) return;
    withAuth((t) => api.money.viewRequest(t, code, op)).then((x) => setR((prev) => (prev && !prev.error ? { ...prev, quote: x.quote } : prev))).catch(() => {});
  }, [op, isAuthenticated, withAuth, code]);

  if (r === undefined) return <div className="min-h-screen bg-cream flex items-center justify-center"><Loader2 className="animate-spin text-ink-faint" /></div>;
  if (r.error) return <div className="min-h-screen bg-cream px-5 py-16 text-center text-ink-soft">{r.error}</div>;
  const q = r.quote;
  const payable = (cor?.operators?.[r.from_country] || []).filter((o) => o.pay);
  const opKey = op && payable.some((o) => o.key === op) ? op : payable[0]?.key || "";
  async function pay(phone) {
    setBusy(true); setErr("");
    try { setR({ ...(await withAuth((t) => api.money.payRequest(t, code, { pay_phone: phone, pay_operator: opKey }))), quote: q, asker_name: r.asker_name }); } catch (x) { setErr(msgOf(x)); } finally { setBusy(false); }
  }
  async function decline() {
    try { setR({ ...(await withAuth((t) => api.money.declineRequest(t, code))), quote: q, asker_name: r.asker_name }); } catch (x) { setErr(msgOf(x)); }
  }
  const open = r.status === "awaiting_payer";
  return (
    <PayPanel head={<>{FLAG[r.to_country]} {r.asker_name} vous demande</>} amount={nf(r.receive_amount, r.receive_currency)} sub={r.note ? `« ${r.note} »` : null}
      q={open ? q : null} payCountry={r.from_country} ops={payable} opKey={opKey} setOp={setOp} onPay={pay} onDecline={decline} busy={busy} err={err} simulated={cor?.simulated}>
      <div className="mt-3"><StatusPill status={r.status} /></div>
      {!open && <p className="mt-5 text-sm text-ink-soft">{r.status === "completed" ? "Merci, le paiement est effectué." : r.failure_reason || "Cette demande n'est plus en attente."}</p>}
    </PayPanel>
  );
}
