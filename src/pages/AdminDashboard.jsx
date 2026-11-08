import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import {
  LogOut, RefreshCw, Clock, CheckCircle2, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Gift, ArrowRight, Loader2, Download, Search, Users, ClipboardList, Filter, Copy, Mail,
  TrendingUp, TrendingDown, AlertCircle, Sparkles,
} from "lucide-react";
import { useUser } from "../context/Usercontext.jsx";
import { api } from "../lib/api.js";
import KnowledgePanel from "../components/admin/KnowledgePanel.jsx";
import BigChart from "../components/ui/BigChart.jsx";
import AdminSidebar from "../components/admin/AdminSidebar.jsx";
import ApplicationsTable, { timeAgo, exportApplicationsCsv, isTyping } from "../components/admin/ApplicationsTable.jsx";
import ApplicationDetail from "../components/admin/ApplicationDetail.jsx";
import AllRequestsPanel from "../components/admin/AllRequestsPanel.jsx";
import ServiceSubscriptionsPanel from "../components/admin/ServiceSubscriptionsPanel.jsx";
import ServiceCatalogPanel from "../components/admin/ServiceCatalogPanel.jsx";
import CompanyTrainingPanel from "../components/admin/CompanyTrainingPanel.jsx";
import LearningAdminPanel from "../components/admin/LearningAdminPanel.jsx";
import ShoppingAdminPanel from "../components/admin/ShoppingAdminPanel.jsx";
import LodgeAdminPanel from "../components/admin/LodgeAdminPanel.jsx";
import RestaurantAdminPanel from "../components/admin/RestaurantAdminPanel.jsx";
import MoneyAdminPanel from "../components/admin/MoneyAdminPanel.jsx";
import GeoAdminPanel from "../components/admin/GeoAdminPanel.jsx";
import PromoPanel from "../components/app/PromoPanel.jsx";
import PartnerHubAdminPanel from "../components/admin/PartnerHubAdminPanel.jsx";
import TourismAdminPanel from "../components/admin/TourismAdminPanel.jsx";
import TransportAdminPanel from "../components/admin/TransportAdminPanel.jsx";
import AgentsPanel from "../components/admin/AgentsPanel.jsx";
import CommandPalette from "../components/admin/CommandPalette.jsx";
import { SkeletonTable, SkeletonCard } from "../components/ui/Skeleton.jsx";

const GOLD = "var(--color-latte)"; // café au lait — suit le thème clair/sombre
const LATTE = GOLD;
const AUTO_REFRESH_MS = 60_000;
const DAY = 24 * 3600 * 1000;

/* ───────── Petits composants de mise en page ───────── */

function Title({ children, as: Tag = "h1", className = "" }) {
  return (
    <Tag className={`font-display text-ink ${className}`}>
      {children}
      <span style={{ color: GOLD }}>.</span>
    </Tag>
  );
}

function SideCard({ title, children, action }) {
  return (
    <div className="bg-surface border border-line rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <Title as="h2" className="text-lg">{title}</Title>
        {action}
      </div>
      {children}
    </div>
  );
}

function Metric({ value, label, tone = "text-ink" }) {
  return (
    <div>
      <p className={`text-xl font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="text-xs text-ink-soft mt-0.5">{label}</p>
    </div>
  );
}

/** Anneau de progression SVG (part des candidatures traitées). */
function Ring({ pct, children, color = GOLD }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative w-[88px] h-[88px]">
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="6" className="stroke-line" />
        <circle
          cx="40" cy="40" r={r} fill="none" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100}
          style={{ stroke: color, transition: "stroke-dashoffset .6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

function formatSince(date) {
  if (!date) return "—";
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 20) return "à l'instant";
  if (s < 60) return `il y a ${s} s`;
  return `il y a ${Math.floor(s / 60)} min`;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");

export default function AdminDashboard() {
  const { user, isAuthenticated, isLoading, withAuth, signOut } = useUser();
  const [applications, setApplications] = useState([]);
  const [view, setView] = useState("applications");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [contract, setContract] = useState(null);
  const [offers, setOffers] = useState([]);
  const [pageStatus, setPageStatus] = useState("loading");
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [pendingAppsCount, setPendingAppsCount] = useState(0);
  const [pendingServiceSubsCount, setPendingServiceSubsCount] = useState(0);
  const [pendingTrainingCount, setPendingTrainingCount] = useState(0);
  const [pendingRegistrationsCount, setPendingRegistrationsCount] = useState(0);
  const [shoppingCount, setShoppingCount] = useState(0);
  const [lodgingCount, setLodgingCount] = useState(0);
  const [restaurantCount, setRestaurantCount] = useState(0);
  const [tourismCount, setTourismCount] = useState(0);
  const [transportCount, setTransportCount] = useState(0);
  const [todoOpen, setTodoOpen] = useState(true);
  const [todoHidden, setTodoHidden] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [, setTick] = useState(0);

  const knownIdsRef = useRef(null);
  const visibleIdsRef = useRef([]);
  const searchRef = useRef(null);

  /* ───────── Notifications ───────── */
  const pushToast = useCallback((text, type = "success") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((t) => [...t.slice(-3), { id, text, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  /* ───────── Chargements ───────── */
  const loadApplications = useCallback(
    async ({ silent = false, detectNew = false } = {}) => {
      if (!silent) setPageStatus("loading");
      setLoadError(null);
      try {
        const apps = await withAuth((token) => api.admin.listApplications(token));
        if (detectNew && knownIdsRef.current) {
          const fresh = apps.filter((a) => !knownIdsRef.current.has(a.id));
          if (fresh.length) {
            pushToast(
              fresh.length === 1
                ? `Nouvelle candidature : ${fresh[0].company}`
                : `${fresh.length} nouvelles candidatures`,
              "info"
            );
          }
        }
        knownIdsRef.current = new Set(apps.map((a) => a.id));
        setApplications(apps);
        setLastUpdated(new Date());
        setPageStatus("ready");
      } catch (err) {
        if (silent) {
          pushToast("Actualisation impossible, nouvel essai dans une minute.", "error");
        } else {
          setLoadError(err?.data?.detail || "Impossible de charger les candidatures.");
          setPageStatus("error");
        }
      }
      // Compteur des demandes d'apps pour la pastille de la sidebar
      withAuth((token) => api.admin.pendingApps(token))
        .then((list) => setPendingAppsCount(Array.isArray(list) ? list.length : 0))
        .catch(() => {});
      // Compteur des demandes d'abonnement aux services H-Company
      withAuth((token) => api.admin.pendingSubscriptions(token))
        .then((list) => setPendingServiceSubsCount(Array.isArray(list) ? list.length : 0))
        .catch(() => {});
      // Compteur des demandes de formation d'équipe H-Learning non traitées
      withAuth((token) => api.admin.listCompanyEnrollments(token))
        .then((list) => setPendingTrainingCount(Array.isArray(list) ? list.filter((r) => r.status === "new").length : 0))
        .catch(() => {});
      // Inscriptions au présentiel (H-Learning) non traitées
      withAuth((token) => api.admin.listRegistrations(token))
        .then((list) => setPendingRegistrationsCount(Array.isArray(list) ? list.filter((r) => r.status === "new").length : 0))
        .catch(() => {});
    },
    [withAuth, pushToast]
  );

  const isAdmin = !isLoading && isAuthenticated && user?.role === "admin";

  useEffect(() => {
    if (isAdmin) loadApplications();
  }, [isAdmin, loadApplications]);

  // Rafraîchissement automatique (onglet visible uniquement)
  useEffect(() => {
    if (!isAdmin) return;
    withAuth((t) => api.shop.admin.overview(t)).then((o) => setShoppingCount(o.shops_pending + o.disputes_open + o.payouts_pending)).catch(() => {});
    withAuth((t) => api.resto.admin.overview(t)).then((o) => setRestaurantCount(o.restaurants?.pending || 0)).catch(() => {});
    withAuth((t) => api.tour.admin.overview(t)).then((o) => setTourismCount(o.tours?.pending || 0)).catch(() => {});
    withAuth((t) => api.lodge.admin.overview(t)).then((o) => setLodgingCount(o.properties_pending + o.disputes_open + o.payouts_pending)).catch(() => {});
    withAuth((t) => api.transport.admin.overview(t)).then((o) => setTransportCount(o.operators_pending + o.disputes_open + o.payouts_pending)).catch(() => {});
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAdmin || pageStatus !== "ready") return undefined;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") loadApplications({ silent: true, detectNew: true });
    }, AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [isAdmin, pageStatus, loadApplications]);

  // Fait vivre le libellé « mis à jour il y a… »
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const loadContract = useCallback(
    async (id) => {
      try {
        const c = await withAuth((token) => api.admin.getContract(token, id));
        setContract(c);
      } catch {
        setContract(null);
      }
    },
    [withAuth]
  );

  const loadOffers = useCallback(
    async (id) => {
      try {
        const list = await withAuth((token) => api.admin.listOffers(token, id));
        setOffers(list || []);
      } catch {
        setOffers([]);
      }
    },
    [withAuth]
  );

  /* ───────── Actions ───────── */
  function handleSelect(id) {
    setSelectedId(id);
    const app = applications.find((a) => a.id === id);
    if (app?.status === "approved") loadContract(id);
    else setContract(null);
    setOffers([]);
    loadOffers(id);
  }

  const closeDetail = () => setSelectedId(null);

  async function handleRefresh() {
    setRefreshing(true);
    await loadApplications({ silent: true, detectNew: true });
    setRefreshing(false);
  }

  function handleExport() {
    const ids = visibleIdsRef.current;
    const list = ids.length ? ids.map((id) => applications.find((a) => a.id === id)).filter(Boolean) : applications;
    exportApplicationsCsv(list);
    pushToast(`${list.length} candidature${list.length > 1 ? "s" : ""} exportée${list.length > 1 ? "s" : ""} en CSV.`);
  }

  async function handleCreateOffer(payload) {
    await withAuth((token) => api.admin.createOffer(token, selectedId, payload));
    await loadOffers(selectedId);
    pushToast("Offre envoyée au partenaire.");
  }

  async function handleApprove() {
    await withAuth((token) => api.admin.updateStatus(token, selectedId, "approved"));
    await loadApplications({ silent: true });
    await loadContract(selectedId);
  }

  async function handleReject() {
    await withAuth((token) => api.admin.updateStatus(token, selectedId, "rejected"));
    await loadApplications({ silent: true });
  }

  async function handleSaveContract(content) {
    const updated = await withAuth((token) => api.admin.updateContract(token, selectedId, content));
    setContract(updated);
  }

  async function handleBulkStatus(ids, status) {
    const results = await Promise.allSettled(ids.map((id) => withAuth((token) => api.admin.updateStatus(token, id, status))));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const ko = ids.length - ok;
    await loadApplications({ silent: true });
    const verb = status === "approved" ? "approuvée" : "rejetée";
    pushToast(
      `${ok} candidature${ok > 1 ? "s" : ""} ${verb}${ok > 1 ? "s" : ""}${ko ? ` · ${ko} échec${ko > 1 ? "s" : ""}` : ""}.`,
      ko ? "error" : "success"
    );
  }

  const handleVisibleChange = useCallback((ids) => {
    visibleIdsRef.current = ids;
  }, []);

  async function copyEmail(email) {
    try {
      await navigator.clipboard.writeText(email);
      pushToast("Email copié dans le presse-papiers.");
    } catch {
      pushToast("Impossible de copier l'email.", "error");
    }
  }

  /* ───────── Navigation dans le panneau (précédent / suivant) ───────── */
  const navRef = useRef(() => {});
  navRef.current = (dir) => {
    const ids = visibleIdsRef.current;
    const idx = ids.indexOf(selectedId);
    const next = ids[idx + dir];
    if (idx !== -1 && next != null) handleSelect(next);
  };

  useEffect(() => {
    if (!selectedId) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !paletteOpen) return closeDetail();
      if (isTyping(document.activeElement) || e.metaKey || e.ctrlKey) return;
      if (e.key === "ArrowLeft" || e.key === "k") navRef.current(-1);
      if (e.key === "ArrowRight" || e.key === "j") navRef.current(1);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [selectedId, paletteOpen]);

  /* ───────── Palette : Ctrl/⌘ + K ───────── */
  useEffect(() => {
    if (!isAdmin) return undefined;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isAdmin]);

  const paletteActions = [
    { id: "go-apps", label: "Aller aux candidatures", icon: Users, run: () => { setView("applications"); closeDetail(); } },
    { id: "go-requests", label: "Aller à toutes les demandes", icon: ClipboardList, run: () => { setView("requests"); closeDetail(); } },
    { id: "go-shopping", label: "Aller à H-Shopping", icon: Users, run: () => { setView("shopping"); closeDetail(); } },
    { id: "go-transport", label: "Aller à H-Transport", icon: Users, run: () => { setView("transport"); closeDetail(); } },
    { id: "go-lodging", label: "Aller à H-Logement", icon: Users, run: () => { setView("lodging"); closeDetail(); } },
    { id: "go-agents", label: "Gérer les agents", icon: Users, run: () => { setView("agents"); closeDetail(); } },
    { id: "f-pending", label: "Filtrer : en attente", icon: Filter, run: () => { setView("applications"); setFilter("pending"); } },
    { id: "f-all", label: "Afficher toutes les candidatures", icon: Filter, run: () => { setView("applications"); setFilter("all"); } },
    { id: "refresh", label: "Actualiser les données", icon: RefreshCw, hint: "auto toutes les 60 s", run: handleRefresh },
    { id: "export", label: "Exporter la liste en CSV", icon: Download, run: handleExport },
    { id: "search", label: "Rechercher dans la liste", icon: Search, hint: "/", run: () => { setView("applications"); setTimeout(() => searchRef.current?.focus(), 50); } },
    { id: "logout", label: "Se déconnecter", icon: LogOut, run: signOut },
  ];

  /* ───────── Statistiques ───────── */
  const stats = useMemo(() => {
    const now = Date.now();
    const pending = applications.filter((a) => a.status === "pending");
    const approved = applications.filter((a) => a.status === "approved").length;
    const rejected = applications.filter((a) => a.status === "rejected").length;
    const decided = approved + rejected;
    const ts = (a) => new Date(a.created_at).getTime();

    // 14 derniers jours
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 14 }, (_, i) => {
      const start = startToday.getTime() - (13 - i) * DAY;
      return { start, count: 0, date: new Date(start) };
    });
    applications.forEach((a) => {
      const t = ts(a);
      const idx = Math.floor((t - days[0].start) / DAY);
      if (idx >= 0 && idx < 14) days[idx].count += 1;
    });
    const last7 = applications.filter((a) => ts(a) >= now - 7 * DAY).length;
    const prev7 = applications.filter((a) => ts(a) >= now - 14 * DAY && ts(a) < now - 7 * DAY).length;
    const trend = prev7 === 0 ? (last7 > 0 ? 100 : 0) : Math.round(((last7 - prev7) / prev7) * 100);

    // Par domaine
    const catMap = new Map();
    applications.forEach((a) => {
      const k = a.category || "Autre";
      catMap.set(k, (catMap.get(k) || 0) + 1);
    });
    const categories = [...catMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    return {
      total: applications.length,
      pending: pending.length,
      approved,
      rejected,
      decided,
      decidedPct: applications.length ? Math.round((decided / applications.length) * 100) : 0,
      approvalRate: decided ? Math.round((approved / decided) * 100) : null,
      last7,
      prev7,
      trend,
      days,
      maxDay: Math.max(1, ...days.map((d) => d.count)),
      categories,
      oldestPending: [...pending].sort((a, b) => ts(a) - ts(b)),
    };
  }, [applications]);

  const selectedApplication = applications.find((a) => a.id === selectedId) || null;
  const navIds = visibleIdsRef.current;
  const navIndex = selectedId != null ? navIds.indexOf(selectedId) : -1;

  /* ───────── États d'accès ───────── */
  if (isLoading) {
    return (
      <div className="min-h-screen bg-ink-fixed flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-cream-fixed">
          <p className="font-display text-2xl">H-Company<span style={{ color: GOLD }}>.</span></p>
          <Loader2 className="animate-spin text-cream-fixed/50" size={18} />
        </div>
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-ink-fixed flex items-center justify-center px-6">
        <div className="bg-surface rounded-3xl p-8 md:p-10 max-w-md w-full text-center">
          <Title className="text-3xl mb-3">Espace admin</Title>
          <p className="text-ink-soft text-sm mb-7">
            {isAuthenticated
              ? "Ce compte n'a pas accès à l'espace admin."
              : "Connectez-vous avec un compte administrateur pour continuer."}
          </p>
          {!isAuthenticated && (
            <Link to="/connexion" className="block rounded-xl bg-coffee hover:bg-coffee-dark text-white text-sm font-medium py-3 mb-3 transition-colors">
              Se connecter
            </Link>
          )}
          <Link to="/" className="text-sm text-ink-soft hover:text-ink">← Retour à l'accueil</Link>
        </div>
      </div>
    );
  }

  const statusTone =
    stats.pending > 0
      ? { core: "bg-latte", Icon: Clock, ring: LATTE }
      : { core: "bg-coffee", Icon: CheckCircle2, ring: GOLD };

  return (
    <div className="min-h-screen bg-cream md:flex md:items-start">
      <AdminSidebar
        user={user}
        onSignOut={signOut}
        view={view}
        onViewChange={(v) => { setView(v); closeDetail(); }}
        counts={{ applications: stats.pending, requests: pendingAppsCount, serviceRequests: pendingServiceSubsCount, trainingRequests: pendingTrainingCount, learning: pendingRegistrationsCount, shopping: shoppingCount, lodging: lodgingCount, restaurant: restaurantCount, tourism: tourismCount, transport: transportCount }}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <div className="flex-1 min-w-0">
        {/* Header mobile */}
        <header className="md:hidden sticky top-0 z-20 bg-ink-fixed text-cream-fixed px-4 py-3.5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-display text-lg">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: GOLD }} />
            H-Company
          </Link>
          <div className="flex items-center gap-1">
            <button onClick={() => setPaletteOpen(true)} aria-label="Rechercher" className="w-9 h-9 rounded-lg flex items-center justify-center text-cream-fixed/70 hover:bg-white/10">
              <Search size={17} />
            </button>
            <button onClick={signOut} aria-label="Se déconnecter" className="w-9 h-9 rounded-lg flex items-center justify-center text-cream-fixed/70 hover:bg-white/10">
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <main className="px-4 sm:px-6 lg:px-12 py-8 lg:py-12 pb-28 md:pb-12 max-w-[1360px]">
          {view === "requests" ? (
            <>
              <div className="mb-8">
                <p className="text-xs text-ink-faint mb-2">Espace admin <span className="mx-1">/</span> Demandes</p>
                <Title className="text-3xl">Toutes les demandes</Title>
                <p className="text-sm text-ink-soft mt-1">Apps et paiements, tous partenaires confondus.</p>
              </div>
              <AllRequestsPanel withAuth={withAuth} api={api} />
            </>
          ) : view === "serviceRequests" ? (
            <>
              <div className="mb-8">
                <p className="text-xs text-ink-faint mb-2">Espace admin <span className="mx-1">/</span> Abonnements clients</p>
                <Title className="text-3xl">Abonnements clients</Title>
                <p className="text-sm text-ink-soft mt-1">
                  Demandes d'abonnement à H-Restaurant, H-Transport, H-Learning, H-Money, H-Translate et autres services, tous clients confondus.
                </p>
              </div>
              <ServiceSubscriptionsPanel withAuth={withAuth} api={api} />
            </>
          ) : view === "serviceCatalog" ? (
            <>
              <div className="mb-8">
                <p className="text-xs text-ink-faint mb-2">Espace admin <span className="mx-1">/</span> Catalogue services</p>
                <Title className="text-3xl">Catalogue services</Title>
                <p className="text-sm text-ink-soft mt-1">
                  Ajoute, modifie ou retire un service H-Company — libellés, description, logo et disponibilité.
                </p>
              </div>
              <ServiceCatalogPanel withAuth={withAuth} api={api} />
            </>
          ) : view === "learning" ? (
            <>
              <div className="mb-8">
                <p className="text-xs text-ink-faint mb-2">Espace admin <span className="mx-1">/</span> H-Learning</p>
                <Title className="text-3xl">H-Learning</Title>
                <p className="text-sm text-ink-soft mt-1">
                  Cours alimentés par vos playlists YouTube (gratuits) et inscriptions aux formations en présentiel.
                </p>
              </div>
              <LearningAdminPanel withAuth={withAuth} api={api} onCount={setPendingRegistrationsCount} />
            </>
          ) : view === "shopping" ? (
            <>
              <div className="mb-8">
                <p className="text-xs text-ink-faint mb-2">Espace admin <span className="mx-1">/</span> H-Shopping</p>
                <Title className="text-3xl">H-Shopping</Title>
                <p className="text-sm text-ink-soft mt-1">
                  Boutiques à valider, commandes sous séquestre, litiges, retraits vendeurs, catégories, agences de livraison et commissions.
                </p>
              </div>
              <ShoppingAdminPanel withAuth={withAuth} api={api} onCount={setShoppingCount} />
            </>
          ) : view === "lodging" ? (
            <>
              <div className="mb-8">
                <p className="text-xs text-ink-faint mb-2">Espace admin <span className="mx-1">/</span> H-Logement</p>
                <Title className="text-3xl">H-Logement</Title>
                <p className="text-sm text-ink-soft mt-1">
                  Annonces à valider, réservations sous séquestre, litiges, hôtes vérifiés, retraits, avis et commissions.
                </p>
              </div>
              <LodgeAdminPanel withAuth={withAuth} api={api} onCount={setLodgingCount} />
            </>
          ) : view === "restaurant" ? (
            <>
              <div className="mb-8">
                <p className="text-xs text-ink-faint mb-2">Espace admin <span className="mx-1">/</span> H-Restaurant</p>
                <Title className="text-3xl">H-Restaurant</Title>
                <p className="text-sm text-ink-soft mt-1">Restaurants à valider, mise à la une, suspension et activité des réservations.</p>
              </div>
              <RestaurantAdminPanel withAuth={withAuth} api={api} onCount={setRestaurantCount} />
            </>
          ) : view === "money" ? (
            <>
              <div className="mb-8">
                <p className="text-xs text-ink-faint mb-2">Espace admin <span className="mx-1">/</span> H-Money</p>
                <Title className="text-3xl">H-Money</Title>
                <p className="text-sm text-ink-soft mt-1">Volumes, transactions, agents par pays et journal des actions.</p>
              </div>
              <MoneyAdminPanel withAuth={withAuth} api={api} />
            </>
          ) : view === "geo" ? (
            <>
              <div className="mb-8">
                <p className="text-xs text-ink-faint mb-2">Espace admin <span className="mx-1">/</span> Pays & taux</p>
                <Title className="text-3xl">Pays & taux de change</Title>
                <p className="text-sm text-ink-soft mt-1">Devises, taux et marges utilisés par H-Money et l'affichage des prix.</p>
              </div>
              <GeoAdminPanel withAuth={withAuth} api={api} />
            </>
          ) : view === "assistant" ? (
            <>
              <div className="mb-8">
                <p className="text-xs text-ink-faint mb-2">Espace admin <span className="mx-1">/</span> Assistante</p>
                <Title className="text-3xl">Assistante apprenante</Title>
                <p className="text-sm text-ink-soft mt-1">Ce qu'elle a appris des agents et de vous.</p>
              </div>
              <KnowledgePanel withAuth={withAuth} api={api} />
            </>
          ) : view === "promos" ? (
            <>
              <div className="mb-8">
                <p className="text-xs text-ink-faint mb-2">Espace admin <span className="mx-1">/</span> Publicités</p>
                <Title className="text-3xl">Publicités</Title>
                <p className="text-sm text-ink-soft mt-1">Annonces H-Company et promotions des partenaires à valider avant diffusion dans l'espace utilisateur.</p>
              </div>
              <PromoPanel admin withAuth={withAuth} api={api} />
            </>
          ) : view === "partnerHub" ? (
            <>
              <div className="mb-8">
                <p className="text-xs text-ink-faint mb-2">Espace admin <span className="mx-1">/</span> Invitations & plans</p>
                <Title className="text-3xl">Invitations & plans partenaires</Title>
                <p className="text-sm text-ink-soft mt-1">Envoyez le lien de demande de partenariat, activez les plans Pro et les fonctions payantes après paiement.</p>
              </div>
              <PartnerHubAdminPanel withAuth={withAuth} api={api} />
            </>
          ) : view === "tourism" ? (
            <>
              <div className="mb-8">
                <p className="text-xs text-ink-faint mb-2">Espace admin <span className="mx-1">/</span> H-Tourisme</p>
                <Title className="text-3xl">H-Tourisme</Title>
                <p className="text-sm text-ink-soft mt-1">Excursions à valider, mise à la une, suspension et activité des réservations.</p>
              </div>
              <TourismAdminPanel withAuth={withAuth} api={api} onCount={setTourismCount} />
            </>
          ) : view === "transport" ? (
            <>
              <div className="mb-8">
                <p className="text-xs text-ink-faint mb-2">Espace admin <span className="mx-1">/</span> H-Transport</p>
                <Title className="text-3xl">H-Transport</Title>
                <p className="text-sm text-ink-soft mt-1">
                  Agences à valider, départs, réservations sous séquestre, litiges, retraits, avis et commissions.
                </p>
              </div>
              <TransportAdminPanel withAuth={withAuth} api={api} onCount={setTransportCount} />
            </>
          ) : view === "trainingRequests" ? (
            <>
              <div className="mb-8">
                <p className="text-xs text-ink-faint mb-2">Espace admin <span className="mx-1">/</span> Formations d'équipe</p>
                <Title className="text-3xl">Formations d'équipe</Title>
                <p className="text-sm text-ink-soft mt-1">
                  Demandes d'entreprises souhaitant inscrire plusieurs employés à une formation H-Learning.
                </p>
              </div>
              <CompanyTrainingPanel withAuth={withAuth} api={api} />
            </>
          ) : view === "agents" ? (
            <>
              <div className="mb-8">
                <p className="text-xs text-ink-faint mb-2">Espace admin <span className="mx-1">/</span> Agents</p>
                <Title className="text-3xl">Gérer les agents</Title>
                <p className="text-sm text-ink-soft mt-1">
                  Promouvoir un compte au rôle agent (revue des candidatures partenaires) ou le retirer.
                </p>
              </div>
              <AgentsPanel withAuth={withAuth} api={api} />
            </>
          ) : (
            <div className="grid xl:grid-cols-[minmax(0,1fr)_310px] gap-6 lg:gap-8 items-start">
              {/* ───────── Colonne principale ───────── */}
              <div className="min-w-0">
                <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
                  <div>
                    <p className="text-xs text-ink-faint mb-2">Espace admin <span className="mx-1">/</span> Candidatures</p>
                    <Title className="text-3xl">Candidatures</Title>
                    <p className="flex items-center gap-2 text-xs text-ink-soft mt-2">
                      <span className="relative flex w-2 h-2">
                        <span className="absolute inline-flex w-full h-full rounded-full bg-coffee-light opacity-60 animate-ping" />
                        <span className="relative inline-flex w-2 h-2 rounded-full bg-coffee" />
                      </span>
                      En direct · mis à jour {formatSince(lastUpdated)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleExport}
                      disabled={pageStatus !== "ready" || applications.length === 0}
                      className="flex items-center gap-2 rounded-xl border border-line bg-surface hover:border-coffee-light text-ink text-sm font-medium px-4 py-2.5 disabled:opacity-50 transition-colors"
                    >
                      <Download size={15} /> <span className="hidden sm:inline">Exporter</span>
                    </button>
                    <div className="flex rounded-xl bg-coffee text-white shadow-sm overflow-hidden">
                      <button
                        onClick={handleRefresh}
                        disabled={refreshing || pageStatus === "loading"}
                        className="flex items-center gap-2 text-sm font-medium pl-4 pr-3.5 py-2.5 hover:bg-coffee-dark disabled:opacity-60 transition-colors"
                      >
                        <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
                        Actualiser
                      </button>
                      <span className="w-px bg-white/25 my-2" />
                      <button
                        onClick={() => setPaletteOpen(true)}
                        aria-label="Plus d'actions"
                        className="px-2.5 hover:bg-coffee-dark transition-colors"
                      >
                        <ChevronDown size={15} />
                      </button>
                    </div>
                  </div>
                </div>

                {pageStatus === "loading" && <SkeletonTable rows={5} />}

                {pageStatus === "error" && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center justify-between gap-4">
                    <p className="flex items-center gap-2 text-sm text-red-700"><AlertCircle size={16} /> {loadError}</p>
                    <button onClick={() => loadApplications()} className="text-sm font-medium text-red-700 bg-surface border border-red-200 rounded-xl px-4 py-2 hover:bg-red-100">
                      Réessayer
                    </button>
                  </div>
                )}

                {pageStatus === "ready" && stats.days && (
                  <BigChart className="mb-6" title="Candidatures" subtitle="14 derniers jours" unit="reçues"
                    data={stats.days.map((d) => ({ label: d.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }), value: d.count }))} />
                )}

                {pageStatus === "ready" && (
                  <ApplicationsTable
                    applications={applications}
                    filter={filter}
                    onFilterChange={setFilter}
                    selectedId={selectedId}
                    onSelect={handleSelect}
                    onBulkStatus={handleBulkStatus}
                    onVisibleChange={handleVisibleChange}
                    keyboardEnabled={!selectedApplication && !paletteOpen}
                    searchRef={searchRef}
                  />
                )}

                {/* Carte « À traiter » */}
                {pageStatus === "ready" && stats.pending > 0 && !todoHidden && (
                  <div className="mt-8 bg-surface border border-line rounded-2xl p-6 md:p-8">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-lg md:text-xl font-semibold text-ink">
                          {stats.pending} candidature{stats.pending > 1 ? "s attendent" : " attend"} votre décision
                        </h2>
                        <div className="flex flex-wrap items-center gap-3 mt-3">
                          <span className="flex items-center gap-1.5 text-xs font-medium text-coffee-dark bg-latte-soft rounded-lg px-2.5 py-1.5">
                            <Sparkles size={13} /> {stats.decided}/{stats.total} traitées
                          </span>
                          <span className="text-sm text-ink-soft">Les plus anciennes en premier.</span>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => setTodoOpen((o) => !o)}
                          aria-label={todoOpen ? "Replier" : "Déplier"}
                          className="w-9 h-9 rounded-lg border border-line flex items-center justify-center text-ink-soft hover:bg-cream"
                        >
                          {todoOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                        </button>
                        <button
                          onClick={() => setTodoHidden(true)}
                          aria-label="Masquer"
                          className="w-9 h-9 rounded-lg border border-line flex items-center justify-center text-ink-soft hover:bg-cream"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="h-2 rounded-full bg-line/70 mt-6 overflow-hidden">
                      <div className="h-full rounded-full bg-coffee transition-all duration-700" style={{ width: `${stats.decidedPct}%` }} />
                    </div>

                    {todoOpen && (
                      <ol className="mt-6 space-y-3">
                        {stats.oldestPending.slice(0, 3).map((app, i) => {
                          const days = Math.floor((Date.now() - new Date(app.created_at).getTime()) / DAY);
                          const urgent = days >= 7;
                          return (
                            <li key={app.id}>
                              <button
                                onClick={() => handleSelect(app.id)}
                                className="w-full flex items-center gap-4 text-left rounded-2xl border border-line hover:border-coffee-light hover:bg-cream/40 px-4 md:px-5 py-4 transition-colors group"
                              >
                                <span className="w-10 h-10 rounded-full bg-cream flex items-center justify-center text-sm font-semibold text-ink shrink-0">
                                  {i + 1}
                                </span>
                                <span className="flex-1 min-w-0">
                                  <span className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-ink truncate">{app.company}</span>
                                    {urgent && (
                                      <span className="text-[10px] font-semibold uppercase tracking-wide text-cream-fixed bg-chocolate rounded px-1.5 py-px shrink-0">
                                        Urgent
                                      </span>
                                    )}
                                  </span>
                                  <span className="block text-xs text-ink-soft mt-0.5 truncate">
                                    {app.category} · reçue il y a {timeAgo(app.created_at)}
                                  </span>
                                </span>
                                <span className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-coffee-dark">
                                  Traiter <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                )}
              </div>

              {/* ───────── Colonne de droite ───────── */}
              <aside className="space-y-5 xl:sticky xl:top-12">
                {pageStatus === "loading" ? (
                  <>
                    <SkeletonCard />
                    <SkeletonCard />
                  </>
                ) : (
                  <>
                    {/* Statut actuel */}
                    <SideCard title="Statut actuel">
                      <div className="flex justify-center mb-5">
                        <Ring pct={stats.decidedPct} color={statusTone.ring}>
                          <span className={`w-11 h-11 rounded-full flex items-center justify-center text-white ${statusTone.core}`}>
                            <statusTone.Icon size={19} strokeWidth={2.4} />
                          </span>
                        </Ring>
                      </div>
                      <div className="grid grid-cols-3 text-center">
                        {[
                          { key: "pending", label: "En attente", value: stats.pending, cls: "text-coffee" },
                          { key: "approved", label: "Approuvées", value: stats.approved, cls: "text-coffee-dark" },
                          { key: "rejected", label: "Rejetées", value: stats.rejected, cls: "text-ink-soft" },
                        ].map((s) => (
                          <button
                            key={s.key}
                            onClick={() => setFilter(filter === s.key ? "all" : s.key)}
                            className={`rounded-xl py-2 transition-colors ${filter === s.key ? "bg-cream" : "hover:bg-cream/60"}`}
                          >
                            <p className={`text-xl font-semibold tabular-nums ${s.value > 0 ? s.cls : "text-ink"}`}>{s.value}</p>
                            <p className="text-xs text-ink-soft mt-0.5">{s.label}</p>
                          </button>
                        ))}
                      </div>
                      <p className="text-sm text-ink-soft text-center mt-4">
                        {stats.decidedPct}% traitées sur {stats.total} candidature{stats.total > 1 ? "s" : ""}.
                      </p>
                      <div className="flex justify-center mt-3">
                        <button
                          onClick={() => setView("requests")}
                          className="flex items-center gap-1.5 text-xs font-medium text-cream bg-ink hover:bg-coffee-dark rounded-lg px-3 py-1.5 transition-colors"
                        >
                          <Gift size={12} style={{ color: GOLD }} />
                          Demandes d'apps{pendingAppsCount > 0 ? ` (${pendingAppsCount})` : ""}
                        </button>
                      </div>
                    </SideCard>

                    {/* Tendance 14 jours */}
                    <SideCard
                      title="14 derniers jours"
                      action={
                        <span
                          className={`flex items-center gap-1 text-xs font-semibold rounded-md px-2 py-1 ${
                            stats.trend >= 0 ? "text-coffee-dark bg-latte-soft" : "text-ink-soft bg-line/60"
                          }`}
                          title="7 derniers jours vs 7 jours précédents"
                        >
                          {stats.trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {stats.trend > 0 ? "+" : ""}{stats.trend}%
                        </span>
                      }
                    >
                      <div className="flex items-end gap-[5px] h-24">
                        {stats.days.map((d, i) => {
                          const h = d.count === 0 ? 6 : Math.max(12, (d.count / stats.maxDay) * 100);
                          const isToday = i === stats.days.length - 1;
                          return (
                            <div key={d.start} className="group relative flex-1 h-full flex items-end">
                              <div
                                className={`w-full rounded-[4px] transition-all ${
                                  d.count === 0 ? "bg-line" : isToday ? "" : "bg-coffee/80 group-hover:bg-coffee"
                                }`}
                                style={{ height: `${h}%`, ...(isToday && d.count > 0 ? { backgroundColor: GOLD } : {}) }}
                              />
                              <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-fixed text-cream-fixed text-[10px] px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                {d.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} · {d.count}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-[10px] text-ink-faint mt-2">
                        <span>{stats.days[0].date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                        <span>Aujourd'hui</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-5 mt-5 pt-5 border-t border-line">
                        <Metric
                          value={stats.approvalRate === null ? "—" : `${stats.approvalRate}%`}
                          label="Taux d'approbation"
                          tone={stats.approvalRate === null ? "text-ink" : stats.approvalRate >= 50 ? "text-coffee-dark" : "text-ink-soft"}
                        />
                        <Metric value={stats.last7} label="Reçues en 7 jours" />
                        <Metric
                          value={stats.oldestPending[0] ? timeAgo(stats.oldestPending[0].created_at) : "—"}
                          label="Plus ancienne en attente"
                          tone={stats.oldestPending[0] && Date.now() - new Date(stats.oldestPending[0].created_at).getTime() > 7 * DAY ? "text-coffee" : "text-ink"}
                        />
                        <Metric value={stats.decided} label="Décisions prises" />
                      </div>
                    </SideCard>

                    {/* Par domaine */}
                    {stats.categories.length > 0 && (
                      <SideCard title="Par domaine">
                        <ul className="space-y-3.5">
                          {stats.categories.map(([name, count]) => (
                            <li key={name}>
                              <div className="flex items-center justify-between text-sm mb-1.5">
                                <span className="text-ink truncate pr-3">{name}</span>
                                <span className="text-ink-soft tabular-nums text-xs">
                                  {count} · {Math.round((count / stats.total) * 100)}%
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-line/70 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-coffee transition-all duration-700"
                                  style={{ width: `${(count / stats.categories[0][1]) * 100}%` }}
                                />
                              </div>
                            </li>
                          ))}
                        </ul>
                      </SideCard>
                    )}

                    <p className="hidden xl:flex items-center justify-center gap-1.5 text-[11px] text-ink-faint">
                      Astuce : <kbd className="font-sans border border-line bg-surface rounded px-1.5 py-px">{isMac ? "⌘" : "Ctrl"} K</kbd> pour tout piloter au clavier
                    </p>
                  </>
                )}
              </aside>
            </div>
          )}
        </main>
      </div>

      {/* ───────── Panneau latéral de détail ───────── */}
      {selectedApplication && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={selectedApplication.company}>
          <style>{`
            @keyframes hc-slide { from { transform: translateX(100%); } to { transform: translateX(0); } }
            @keyframes hc-fade { from { opacity: 0; } to { opacity: 1; } }
            @keyframes hc-pop { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
          `}</style>
          <div className="absolute inset-0 bg-ink-fixed/50 backdrop-blur-[2px]" style={{ animation: "hc-fade .2s ease-out" }} onClick={closeDetail} />
          <div
            className="absolute right-0 top-0 h-full w-full max-w-xl bg-cream shadow-2xl flex flex-col"
            style={{ animation: "hc-slide .28s cubic-bezier(.2,.8,.2,1)" }}
          >
            <div className="flex items-center gap-2 px-4 py-3 bg-ink-fixed text-cream-fixed shrink-0">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => navRef.current(-1)}
                  disabled={navIndex <= 0}
                  aria-label="Candidature précédente"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-cream-fixed/70 hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  onClick={() => navRef.current(1)}
                  disabled={navIndex === -1 || navIndex >= navIds.length - 1}
                  aria-label="Candidature suivante"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-cream-fixed/70 hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
              <p className="text-sm font-medium flex-1 min-w-0 truncate">
                Candidature<span style={{ color: GOLD }}>.</span>
                {navIndex >= 0 && <span className="text-cream-fixed/50 font-normal ml-2 tabular-nums">{navIndex + 1} / {navIds.length}</span>}
              </p>
              <button
                onClick={() => copyEmail(selectedApplication.email)}
                title="Copier l'email"
                aria-label="Copier l'email"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-cream-fixed/70 hover:bg-white/10 hover:text-cream-fixed"
              >
                <Copy size={15} />
              </button>
              <a
                href={`mailto:${selectedApplication.email}`}
                title="Écrire au partenaire"
                aria-label="Écrire au partenaire"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-cream-fixed/70 hover:bg-white/10 hover:text-cream-fixed"
              >
                <Mail size={15} />
              </a>
              <span className="w-px h-5 bg-white/15 mx-1" />
              <button
                onClick={closeDetail}
                aria-label="Fermer"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-cream-fixed/70 hover:bg-white/10 hover:text-cream-fixed"
              >
                <X size={17} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              <ApplicationDetail
                application={selectedApplication}
                contract={contract}
                offers={offers}
                onCreateOffer={handleCreateOffer}
                onApprove={handleApprove}
                onReject={handleReject}
                onSaveContract={handleSaveContract}
                withAuth={withAuth}
                api={api}
              />
              <p className="hidden md:flex items-center justify-center gap-3 text-[11px] text-ink-faint mt-4">
                <span>← → naviguer</span><span>Échap fermer</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ───────── Palette de commandes ───────── */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        applications={applications}
        actions={paletteActions}
        onSelectApplication={(id) => { setView("applications"); handleSelect(id); }}
      />

      {/* ───────── Notifications ───────── */}
      <div className="fixed z-[60] bottom-20 md:bottom-6 right-4 left-4 md:left-auto flex flex-col items-end gap-2 pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto w-full md:w-auto md:max-w-sm flex items-center gap-3 bg-ink-fixed text-cream-fixed rounded-xl pl-3.5 pr-2 py-2.5 shadow-2xl text-sm"
            style={{ animation: "hc-toast .25s ease-out" }}
          >
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                t.type === "error" ? "bg-red-500/20 text-red-300" : t.type === "info" ? "text-ink-fixed" : "bg-latte/25 text-latte"
              }`}
              style={t.type === "info" ? { backgroundColor: GOLD } : undefined}
            >
              {t.type === "error" ? <AlertCircle size={14} /> : t.type === "info" ? <Sparkles size={13} /> : <CheckCircle2 size={14} />}
            </span>
            <span className="flex-1">{t.text}</span>
            <button
              onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
              aria-label="Fermer"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-cream-fixed/50 hover:bg-white/10 hover:text-cream-fixed"
            >
              <X size={13} />
            </button>
          </div>
        ))}
        <style>{`@keyframes hc-toast { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }`}</style>
      </div>
    </div>
  );
}