import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import Landing from "../../components/money/r/Landing.jsx";
import { motion } from "framer-motion";
import { FileText, ArrowRight, BedDouble, Bus, GraduationCap, HandCoins, Languages, Mountain, Package, Send, ShoppingBag, TrendingUp, UtensilsCrossed, Wallet, Ticket } from "lucide-react";
import { api } from "../../lib/api.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";
import LoginGateModal from "../../components/ui/LoginGateModal.jsx";
import { StatusPill, nf } from "../../components/money/parts.jsx";

const ACCESS = [
  { to: "/app/money", Icon: Wallet, fr: "H-Money", en: "H-Money" },
  { to: "/app/factures", Icon: FileText, fr: "Facture", en: "Invoice" },
  { to: "/app/transport", Icon: Bus, fr: "Bus", en: "Bus" },
  { to: "/app/colis", Icon: Package, fr: "Colis", en: "Parcels" },
  { to: "/app/logement", Icon: BedDouble, fr: "Logement", en: "Stays" },
  { to: "/shopping", Icon: ShoppingBag, fr: "Shopping", en: "Shopping" },
  { to: "/restaurant", Icon: UtensilsCrossed, fr: "Restaurant", en: "Restaurant" },
  { to: "/tourisme", Icon: Mountain, fr: "Tourisme", en: "Tourism" },
  { to: "/formations", Icon: GraduationCap, fr: "Learning", en: "Learning" },
  { to: "/interpretation", Icon: Languages, fr: "Translate", en: "Translate" },
];
const ACTIONS = [
  { to: "/app/money", state: { tab: "send" }, Icon: Send, fr: "Envoyer de l'argent", en: "Send money", d: "ZM ⇄ RDC" },
  { to: "/app/factures", Icon: FileText, fr: "Créer une facture", en: "Create an invoice", d: "Se faire payer" },
  { to: "/app/money", state: { tab: "request" }, Icon: HandCoins, fr: "Demander de l'argent", en: "Request money", d: "Par lien ou code" },
  { to: "/app/transport", Icon: Ticket, fr: "Réserver un bus", en: "Book a bus", d: "Choisir sur la carte" },
  { to: "/app/colis", Icon: Package, fr: "Envoyer un colis", en: "Send a parcel", d: "Suivi en direct" },
];

const Card = ({ children, className = "" }) => <div className={`rounded-2xl border border-line bg-surface p-5 ${className}`}>{children}</div>;

export default function AppHome() {
  usePageMeta({ title: "Mon espace" });
  const { first } = useOutletContext() || {};
  const { isAuthenticated, withAuth } = useUser();
  const { lang } = useLanguage();
  const fr = lang !== "en";
  const [gate, setGate] = useState(false);
  const navigate = useNavigate();
  const [tx, setTx] = useState(null), [trips, setTrips] = useState(null), [cargo, setCargo] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    withAuth((t) => api.money.mine(t)).then(setTx).catch(() => setTx([]));
    withAuth((t) => api.transport.myBookings(t)).then(setTrips).catch(() => setTrips([]));
    withAuth((t) => api.transport.cargo.mine(t)).then(setCargo).catch(() => setCargo([]));
  }, [isAuthenticated, withAuth]);

  const month = new Date().toISOString().slice(0, 7);
  const stats = useMemo(() => {
    const sent = (tx || []).filter((t) => (t.created_at || "").startsWith(month) && t.status !== "failed" && t.status !== "cancelled" && t.status !== "declined" && t.status !== "rejected" && t.status !== "refunded");
    const byCur = sent.reduce((a, t) => ({ ...a, [t.send_currency]: (a[t.send_currency] || 0) + Number(t.send_amount || 0) }), {});
    const upcoming = (trips || []).filter((b) => ["confirmed", "pending"].includes(b.status)).length;
    const parcels = (cargo || []).filter((b) => !["delivered", "cancelled", "completed"].includes(b.status)).length;
    return { byCur, n: sent.length, upcoming, parcels };
  }, [tx, trips, cargo, month]);

  const hour = new Date().getHours();
  const hello = fr ? (hour < 18 ? "Bonjour" : "Bonsoir") : (hour < 18 ? "Hello" : "Good evening");
  const money = Object.entries(stats.byCur);
  const activity = useMemo(() => [
    ...(tx || []).map((t) => ({ k: `m${t.code}`, at: t.created_at, title: t.kind === "send" ? `→ ${t.counterpart_name}` : t.role === "requester" ? `← ${t.counterpart_name}` : (fr ? "Demande" : "Request"), sub: `H-Money · ${t.code}`, right: nf(t.receive_amount, t.receive_currency), status: t.status, to: "/app/money" })),
    ...(trips || []).map((b) => ({ k: `b${b.code}`, at: b.created_at || b.departure_at, title: `${b.origin || ""} → ${b.destination || ""}`, sub: `${fr ? "Bus" : "Bus"} · ${b.code}`, right: "", status: b.status, to: "/transport/mes-billets" })),
  ].filter((a) => a.at).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 6), [tx, trips, fr]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 space-y-8">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl">{hello}{first ? `, ${first}` : ""}</h1>
        <p className="text-sm text-ink-soft mt-1">{fr ? "Tous vos services H-Company, au même endroit." : "All your H-Company services, in one place."}</p>
      </div>

      {/* Accès rapide */}
      <section aria-label={fr ? "Accès rapide" : "Quick access"}>
        <h2 className="text-sm font-semibold text-ink mb-3">{fr ? "Accès rapide" : "Quick access"}</h2>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x [scrollbar-width:none]">
          {ACCESS.map(({ to, Icon, ...t }, i) => (
            <motion.div key={to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="snap-start">
              <Link to={to} className="group w-[88px] flex flex-col items-center gap-2 text-xs text-ink-soft hover:text-ink">
                <span className="w-16 h-16 rounded-full bg-surface border border-line flex items-center justify-center text-coffee-dark group-hover:bg-ink group-hover:text-[#C89A3D] group-hover:border-ink transition-colors"><Icon size={24} strokeWidth={1.6} /></span>
                {t[lang] || t.fr}
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* H-Money : même présentation que la page de transfert */}
      <section aria-label="H-Money" className="rounded-3xl border border-line bg-surface p-5 sm:p-8">
        <h2 className="font-bold text-xl text-ink mb-6">H-Money <span className="text-sm font-normal text-ink-soft">· {fr ? "Zambie ⇄ RD Congo" : "Zambia ⇄ DR Congo"}</span></h2>
        <Landing compact onStart={(k, sub) => navigate("/app/money", { state: { tab: k, sub } })} />
      </section>

      {/* Performances */}
      <section aria-label={fr ? "Aperçu" : "Overview"}>
        <h2 className="text-sm font-semibold text-ink mb-3">{fr ? "Votre activité" : "Your activity"}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <p className="text-xs text-ink-soft flex items-center gap-1.5"><TrendingUp size={14} />{fr ? "Envoyé ce mois-ci" : "Sent this month"}</p>
            {tx === null ? <div className="h-9 mt-2 rounded bg-latte-soft animate-pulse" /> : money.length ? money.map(([cur, v]) => <p key={cur} className="font-display text-3xl mt-1 tabular-nums">{nf(v, cur)}</p>) : <p className="font-display text-3xl mt-1 text-ink-faint">—</p>}
            <p className="text-xs text-ink-faint mt-2">{stats.n} {fr ? "transfert(s) H-Money" : "H-Money transfer(s)"}</p>
          </Card>
          <Card>
            <p className="text-xs text-ink-soft flex items-center gap-1.5"><Bus size={14} />{fr ? "Voyages à venir" : "Upcoming trips"}</p>
            <p className="font-display text-3xl mt-1 tabular-nums">{trips === null ? "…" : stats.upcoming}</p>
            <Link to="/app/transport" className="text-xs text-coffee-dark mt-2 inline-flex items-center gap-1">{fr ? "Réserver" : "Book"}<ArrowRight size={12} /></Link>
          </Card>
          <Card>
            <p className="text-xs text-ink-soft flex items-center gap-1.5"><Package size={14} />{fr ? "Colis en cours" : "Parcels in transit"}</p>
            <p className="font-display text-3xl mt-1 tabular-nums">{cargo === null ? "…" : stats.parcels}</p>
            <Link to="/app/colis" className="text-xs text-coffee-dark mt-2 inline-flex items-center gap-1">{fr ? "Envoyer un colis" : "Send a parcel"}<ArrowRight size={12} /></Link>
          </Card>
        </div>
      </section>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8">
        {/* Activité récente */}
        <section>
          <div className="flex items-end justify-between mb-3"><h2 className="text-sm font-semibold">{fr ? "Activité récente" : "Recent activity"}</h2><Link to="/app/money" className="text-xs text-coffee-dark inline-flex items-center gap-1">{fr ? "Tout voir" : "See all"}<ArrowRight size={12} /></Link></div>
          {tx === null ? <div className="h-24 rounded-2xl bg-latte-soft/60 animate-pulse" /> : activity.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line p-6 text-sm text-ink-soft text-center">{fr ? "Rien pour l'instant. Votre première opération apparaîtra ici." : "Nothing yet. Your first activity will show up here."}</p>
          ) : (
            <ul className="rounded-2xl border border-line bg-surface divide-y divide-line">
              {activity.map((a) => (
                <li key={a.k}><Link to={a.to} className="flex items-center justify-between gap-3 p-4 hover:bg-latte-soft/40">
                  <div className="min-w-0"><p className="font-medium truncate">{a.title}</p><p className="text-xs text-ink-faint">{new Date(a.at).toLocaleDateString(fr ? "fr-FR" : "en-GB")} · {a.sub}</p></div>
                  <div className="text-right shrink-0">{a.right && <p className="text-sm font-semibold tabular-nums">{a.right}</p>}<StatusPill status={a.status} /></div>
                </Link></li>
              ))}
            </ul>
          )}
        </section>

        {/* Actions rapides */}
        <section>
          <h2 className="text-sm font-semibold mb-3">{fr ? "Actions rapides" : "Quick actions"}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
            {ACTIONS.map(({ to, state, Icon, ...t }) => (
              <Link key={t.fr} to={to} state={state} onClick={(e) => { if (!isAuthenticated) { e.preventDefault(); setGate(true); } }} className="group rounded-2xl border border-line bg-surface p-4 flex items-center gap-3 hover:border-coffee/50 transition-colors">
                <span className="w-10 h-10 shrink-0 rounded-xl bg-latte-soft text-coffee-dark flex items-center justify-center group-hover:bg-ink group-hover:text-[#C89A3D] transition-colors"><Icon size={18} /></span>
                <span className="min-w-0"><span className="block text-sm font-medium truncate">{t[lang] || t.fr}</span><span className="block text-xs text-ink-faint truncate">{t.d}</span></span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl bg-latte-soft p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div><p className="font-display text-lg text-coffee-dark">{fr ? "Vous avez une entreprise ?" : "Do you run a business?"}</p><p className="text-sm text-coffee-dark/80">{fr ? "Proposez vos services à tout le réseau depuis un seul dashboard." : "Offer your services to the whole network from a single dashboard."}</p></div>
        <Link to="/infos#rejoindre" className="rounded-full bg-ink text-cream text-sm font-medium px-5 py-3">{fr ? "Devenir partenaire" : "Become a partner"}</Link>
      </section>
      {gate && <LoginGateModal onClose={() => setGate(false)} redirectTo="/app" />}
    </div>
  );
}
