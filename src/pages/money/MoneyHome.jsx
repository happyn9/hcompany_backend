import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Loader2, ScanLine, Send, HandCoins } from "lucide-react";
import { api } from "../../lib/api.js";
import { useUser } from "../../context/Usercontext.jsx";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";
import ChangeForm from "../../components/money/ChangeForm.jsx";
import Invoices from "./Invoices.jsx";
import LoginGateModal from "../../components/ui/LoginGateModal.jsx";
import Landing from "../../components/money/r/Landing.jsx";
import { RequestFlow, SendDone, SendFlow } from "../../components/money/r/flows.jsx";
import { Frame, H } from "../../components/money/r/ui.jsx";
import { FLAG, StatusPill, nf, useCorridors } from "../../components/money/parts.jsx";

function HistoryList({ items }) {
  if (items === null) return <Loader2 className="animate-spin text-ink-faint mx-auto" />;
  if (!items.length) return <p className="text-center text-sm text-ink-soft py-10">Aucune opération pour l'instant.</p>;
  return (
    <ul className="space-y-3">
      {items.map((t) => (
        <li key={t.code} className="rounded-xl border border-line bg-surface p-4 flex items-center gap-4">
          <span className="w-10 h-10 rounded-full bg-latte-soft text-coffee-dark flex items-center justify-center shrink-0">{t.kind === "send" ? <Send size={17} /> : <HandCoins size={17} />}</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink truncate">{t.kind === "send" ? `Envoi à ${t.counterpart_name}` : t.role === "requester" ? `Demande à ${t.counterpart_name}` : "Demande payée"}</p>
            <p className="text-xs text-ink-faint">{FLAG[t.from_country]}→{FLAG[t.to_country]} · {new Date(t.created_at).toLocaleDateString("fr-FR")} · {t.code}</p>
          </div>
          <div className="text-right"><p className="text-sm font-semibold tabular-nums text-ink">{nf(t.receive_amount, t.receive_currency)}</p><StatusPill status={t.status} /></div>
        </li>
      ))}
    </ul>
  );
}

export default function MoneyHome({ embedded = false }) {
  usePageMeta({ title: "H-Money" });
  const { isAuthenticated, isLoading, withAuth } = useUser();
  const cor = useCorridors();
  const location = useLocation();
  const [view, setView] = useState(location.state?.tab && location.state.tab !== "home" ? location.state.tab : "home");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [preset, setPreset] = useState(null);
  const [invTab, setInvTab] = useState(location.state?.sub || "mine");
  const [gate, setGate] = useState(false);
  const load = useCallback(() => {
    withAuth((t) => api.money.mine(t)).then(setHistory).catch(() => setHistory([]));
    withAuth((t) => api.money.invoices.list(t)).then(setInvoices).catch(() => setInvoices([]));
  }, [withAuth]);
  useEffect(() => { if (isAuthenticated) load(); }, [isAuthenticated, load, result]);
  // La connexion n'est exigée qu'au moment de transactionner (confirmer un envoi, créer un lien).
  const requireAuth = () => { if (isAuthenticated || isLoading) return true; setGate(true); return false; };
  const home = () => { setView("home"); setResult(null); setPreset(null); };
  const dueCount = invoices.filter((i) => i.role === "client" && i.status === "open").length;

  const recent = useMemo(() => {
    const seen = new Map();
    (history || []).filter((t) => t.kind === "send").forEach((t) => {
      const key = `${t.counterpart_phone}|${t.to_country}`;
      if (!seen.has(key)) { const [first = "", ...rest] = (t.counterpart_name || "").split(" "); seen.set(key, { key, name: t.counterpart_name, first, last: rest.join(" "), phone: t.counterpart_phone ? `+${t.counterpart_phone}` : "", operator: t.counterpart_operator, to: t.to_country, initials: (t.counterpart_name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() }); }
    });
    return [...seen.values()].slice(0, 4);
  }, [history]);

  const start = (k, sub) => { setResult(null); setPreset(null); setInvTab(sub || "mine"); setView(k); };
  let body;
  if (result) body = <SendDone t={result} onAgain={home} />;
  else if (view === "send") body = <SendFlow key={preset?.key || "new"} cor={cor} preset={preset} onExit={home} onDone={setResult} requireAuth={requireAuth} />;
  else if (view === "request") body = <RequestFlow cor={cor} onExit={home} requireAuth={requireAuth} />;
  else if (view === "invoice") body = <Frame onBack={home} progress={0} wide><Invoices inline initial={invTab} /></Frame>;
  else if (view === "change") body = (
    <Frame onBack={home} progress={0} wide>
      <H>Échanger USD ⇄ ZMW</H>
      <div className="mb-6 rounded-xl border border-line bg-latte-soft/60 p-4 flex gap-3 items-start"><ScanLine className="shrink-0 mt-0.5 text-coffee-dark" size={22} /><p className="text-sm text-ink"><strong>Échange avec scan — bientôt disponible.</strong> En attendant, le simulateur ci-dessous montre le taux H-Money (aucune opération n'est exécutée).</p></div>
      <ChangeForm cor={cor} />
    </Frame>
  );
  else if (view === "history") body = <Frame onBack={home} progress={0} wide><H>Historique</H><HistoryList items={isAuthenticated ? history : []} /></Frame>;
  else body = <Landing onStart={start} recent={recent} dueCount={dueCount} onContact={(c) => { setPreset({ ...c, key: c.key }); setView("send"); }} />;

  return (
    <div className={embedded ? "pb-6" : "min-h-screen bg-cream pb-16"}>
      {!embedded && <header className="border-b border-line bg-surface/80 backdrop-blur sticky top-0 z-20"><div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between"><Link to="/app" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"><ArrowLeft size={15} />Accueil</Link><p className="font-display text-lg text-ink">H-Money</p><span className="w-16" /></div></header>}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-8">{body}</main>
      {gate && <LoginGateModal onClose={() => setGate(false)} redirectTo={embedded ? "/app/money" : "/money"} />}
    </div>
  );
}
