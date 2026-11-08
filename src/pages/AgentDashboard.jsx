import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, LogOut, Loader2, Inbox, AlertCircle, FileText, Eye, Check, X,
  Clock, History, ExternalLink,
} from "lucide-react";
import { useUser } from "../context/Usercontext.jsx";
import { api } from "../lib/api.js";
import AgentWorkspace, { useHeartbeat } from "../components/agents/AgentWorkspace.jsx";

const GOLD = "var(--color-latte)";

const ID_TYPE_LABELS = {
  national_id: "Carte d'identité nationale",
  voter_card: "Carte d'électeur",
  passport: "Passeport",
};

const REVIEW_STYLE = {
  pending: { cls: "bg-latte-soft text-coffee-dark border-latte-light", label: "En attente" },
  forwarded: { cls: "bg-latte-soft text-coffee-dark border-coffee-light", label: "Transmise à l'admin" },
  rejected: { cls: "bg-line/60 text-ink-faint border-line", label: "Rejetée" },
};

function ReviewBadge({ status }) {
  const st = REVIEW_STYLE[status] || REVIEW_STYLE.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${st.cls}`}>
      {st.label}
    </span>
  );
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

/** Modale de revue — affiche le dossier complet (identité, coordonnées),
 * permet de visualiser la pièce jointe et de transmettre ou rejeter le
 * dossier avec une note. */
function ReviewModal({ application, token, onClose, onDecide }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null); // "forwarded" | "rejected" | null
  const [docState, setDocState] = useState({ status: "idle", url: null, contentType: null });

  async function viewDocument() {
    setDocState({ status: "loading", url: null, contentType: null });
    try {
      const { url, contentType } = await api.agent.documentBlobUrl(token, application.id);
      setDocState({ status: "ready", url, contentType });
    } catch {
      setDocState({ status: "error", url: null, contentType: null });
    }
  }

  async function decide(decision) {
    setBusy(decision);
    try {
      await onDecide(application.id, decision, note);
      onClose();
    } finally {
      setBusy(null);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-ink/50 backdrop-blur-sm z-[180]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[190] bg-surface rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-display text-lg text-ink">{application.company}</h3>
            <p className="text-xs text-ink-soft mt-0.5">{application.contact_name} · {application.email}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:bg-line/50 hover:text-ink transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div><p className="text-[11px] text-ink-faint uppercase tracking-wide">Téléphone</p><p className="text-ink">{application.phone || "—"}</p></div>
          <div><p className="text-[11px] text-ink-faint uppercase tracking-wide">Adresse</p><p className="text-ink">{application.address || "—"}</p></div>
          <div><p className="text-[11px] text-ink-faint uppercase tracking-wide">Type de pièce</p><p className="text-ink">{ID_TYPE_LABELS[application.id_document_type] || "—"}</p></div>
          <div><p className="text-[11px] text-ink-faint uppercase tracking-wide">Numéro</p><p className="text-ink">{application.id_document_number || "—"}</p></div>
          <div><p className="text-[11px] text-ink-faint uppercase tracking-wide">Domaine</p><p className="text-ink">{application.category}</p></div>
          <div><p className="text-[11px] text-ink-faint uppercase tracking-wide">Reçue le</p><p className="text-ink">{formatDate(application.created_at)}</p></div>
        </div>

        {application.message && (
          <div className="mb-4">
            <p className="text-[11px] text-ink-faint uppercase tracking-wide mb-1">Message</p>
            <p className="text-sm text-ink-soft bg-cream/50 rounded-lg p-3 leading-relaxed">{application.message}</p>
          </div>
        )}

        <div className="mb-4">
          <p className="text-[11px] text-ink-faint uppercase tracking-wide mb-1.5">Pièce d'identité</p>
          {application.id_document_available === false ? (
            <p className="text-sm text-ink-faint italic">Aucun document joint.</p>
          ) : docState.status === "idle" ? (
            <button
              onClick={viewDocument}
              className="flex items-center gap-2 text-sm font-medium rounded-lg border border-line px-3.5 py-2 hover:border-coffee-light hover:bg-cream/50 transition-colors"
            >
              <Eye size={14} /> Visualiser le document
            </button>
          ) : docState.status === "loading" ? (
            <p className="flex items-center gap-2 text-sm text-ink-soft"><Loader2 size={14} className="animate-spin" /> Chargement…</p>
          ) : docState.status === "error" ? (
            <p className="text-sm text-red-600">Impossible de charger le document.</p>
          ) : docState.contentType?.startsWith("image/") ? (
            <a href={docState.url} target="_blank" rel="noreferrer" className="block">
              <img src={docState.url} alt="Pièce d'identité" className="max-h-64 rounded-lg border border-line object-contain" />
            </a>
          ) : (
            <a
              href={docState.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-sm font-medium text-coffee-dark hover:underline"
            >
              <FileText size={14} /> Ouvrir le PDF <ExternalLink size={12} />
            </a>
          )}
        </div>

        {application.agent_review_status !== "pending" && (
          <div className="mb-4 text-xs text-ink-faint bg-cream/50 rounded-lg p-3">
            Déjà examinée — {REVIEW_STYLE[application.agent_review_status]?.label.toLowerCase()}
            {application.agent_review_note ? ` · « ${application.agent_review_note} »` : ""}
          </div>
        )}

        <label className="block text-sm text-stone mb-1.5">Note (visible par l'admin, et par le candidat en cas de rejet)</label>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full text-sm rounded-lg border border-line bg-cream/40 px-3 py-2 outline-none focus:border-coffee-light resize-none mb-4"
          placeholder="Ex : dossier cohérent, passeport valide, transmis pour confirmation."
        />

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => decide("rejected")}
            disabled={busy !== null}
            className="flex items-center justify-center gap-2 text-sm font-medium rounded-full border border-line text-ink-soft py-2.5 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition-colors"
          >
            {busy === "rejected" ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
            Rejeter
          </button>
          <button
            onClick={() => decide("forwarded")}
            disabled={busy !== null}
            className="flex items-center justify-center gap-2 text-sm font-medium rounded-full bg-ink text-cream py-2.5 hover:bg-coffee-dark disabled:opacity-60 transition-colors"
          >
            {busy === "forwarded" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Transmettre à l'admin
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function EmptyState({ text }) {
  return (
    <div className="bg-surface border border-dashed border-line rounded-2xl px-6 py-12 text-center">
      <span className="mx-auto w-12 h-12 rounded-2xl bg-cream flex items-center justify-center text-ink-faint mb-3">
        <Inbox size={20} strokeWidth={1.6} />
      </span>
      <p className="text-sm text-ink-soft">{text}</p>
    </div>
  );
}

function ApplicationCard({ application, onOpen }) {
  return (
    <button
      onClick={() => onOpen(application)}
      className="w-full text-left bg-surface border border-line rounded-2xl p-5 hover:border-coffee-light transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="font-display text-lg text-ink leading-snug truncate">{application.company}</p>
        <ReviewBadge status={application.agent_review_status} />
      </div>
      <p className="text-xs text-ink-faint mb-1">{application.contact_name} · {application.email}</p>
      <p className="text-xs text-ink-soft">{application.category} · reçue le {formatDate(application.created_at)}</p>
    </button>
  );
}

export default function AgentDashboard() {
  const { user, isAuthenticated, isLoading, withAuth, signOut, token } = useUser();
  // `token` sert uniquement à la visualisation du document (fetch blob hors
  // du helper `request()` générique) — pas de refresh automatique dessus,
  // ce qui est acceptable pour une action ponctuelle depuis une session déjà active.
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState("queue");
  const [pageStatus, setPageStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const [section, setSection] = useState("kyc");
  const isAgent = !isLoading && isAuthenticated && (user?.role === "agent" || user?.role === "admin");

  useHeartbeat(!isLoading && isAuthenticated && (user?.role === "agent" || user?.role === "admin"));

  const load = useCallback(async () => {
    try {
      const [q, h] = await Promise.all([
        withAuth((t) => api.agent.queue(t)),
        withAuth((t) => api.agent.history(t)),
      ]);
      setQueue(q || []);
      setHistory(h || []);
      setError(null);
      setPageStatus("ready");
    } catch (err) {
      setError(err?.data?.detail || "Impossible de charger les candidatures.");
      setPageStatus("error");
    }
  }, [withAuth]);

  useEffect(() => {
    if (isAgent) load();
  }, [isAgent, load]);

  async function handleDecide(id, decision, note) {
    await withAuth((t) => api.agent.review(t, id, decision, note));
    await load();
  }

  if (isLoading || (isAuthenticated && pageStatus === "loading")) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Loader2 size={22} className="animate-spin text-coffee-dark" />
      </div>
    );
  }

  if (!isAgent) {
    return (
      <div className="min-h-screen bg-ink-fixed flex items-center justify-center px-6">
        <div className="bg-surface rounded-3xl p-8 md:p-10 max-w-md w-full text-center">
          <h1 className="font-display text-3xl text-ink mb-3">Espace agent</h1>
          <p className="text-ink-soft text-sm mb-7">
            {isAuthenticated ? "Ce compte n'a pas accès à l'espace agent." : "Connectez-vous avec un compte agent pour continuer."}
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

  const list = tab === "queue" ? queue : history;

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-ink-fixed text-cream-fixed px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <Link to="/" className="flex items-center gap-2 font-display text-lg">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: GOLD }} />
          H-Company <span className="text-cream-fixed/50 font-sans text-sm font-normal ml-1">· Espace agent</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden sm:flex items-center gap-1.5 text-xs text-cream-fixed/60">
            <ShieldCheck size={14} /> {user?.full_name || user?.email}
          </span>
          <button onClick={signOut} className="w-9 h-9 rounded-lg flex items-center justify-center text-cream-fixed/70 hover:bg-white/10">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-12 py-10 max-w-[1100px] mx-auto">
        <nav className="flex flex-wrap gap-2 mb-8" aria-label="Sections">
          {[["kyc", "Candidatures"], ["stats", "Mes modules"], ["messages", "Messages"]].map(([k, l]) => (
            <button key={k} onClick={() => setSection(k)} aria-pressed={section === k} className={`text-sm font-medium rounded-full px-4 py-2 ${section === k ? "bg-coffee text-white" : "border border-line text-ink-soft"}`}>{l}</button>
          ))}
        </nav>
        {section !== "kyc" && <AgentWorkspace section={section} />}
        <div hidden={section !== "kyc"}>
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 md:gap-4 mb-8 max-w-md">
          <div className="bg-surface border border-line rounded-2xl p-5 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-latte-soft text-coffee-dark flex items-center justify-center shrink-0"><Clock size={17} /></span>
            <div><p className="font-display text-2xl text-ink leading-none">{queue.length}</p><p className="text-xs text-ink-soft mt-1">À examiner</p></div>
          </div>
          <div className="bg-surface border border-line rounded-2xl p-5 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-ink text-cream flex items-center justify-center shrink-0"><History size={17} /></span>
            <div><p className="font-display text-2xl text-ink leading-none">{history.length}</p><p className="text-xs text-ink-soft mt-1">Traitées</p></div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => setTab("queue")}
            className={`text-sm font-medium rounded-full px-4 py-2 transition-colors ${tab === "queue" ? "bg-ink text-cream" : "border border-line text-ink-soft hover:border-coffee-light"}`}
          >
            File d'attente ({queue.length})
          </button>
          <button
            onClick={() => setTab("history")}
            className={`text-sm font-medium rounded-full px-4 py-2 transition-colors ${tab === "history" ? "bg-ink text-cream" : "border border-line text-ink-soft hover:border-coffee-light"}`}
          >
            Historique ({history.length})
          </button>
        </div>

        {error ? (
          <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-2xl p-5 text-sm text-red-700">
            <AlertCircle size={16} /> {error}
          </div>
        ) : list.length === 0 ? (
          <EmptyState text={tab === "queue" ? "Aucune candidature en attente — belle journée !" : "Aucune candidature traitée pour l'instant."} />
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {list.map((a) => (
              <ApplicationCard key={a.id} application={a} onOpen={setSelected} />
            ))}
          </div>
        )}
        </div>
      </main>

      {selected && (
        <ReviewModal
          application={selected}
          token={token}
          onClose={() => setSelected(null)}
          onDecide={handleDecide}
        />
      )}
    </div>
  );
}
