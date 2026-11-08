import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Filter, ArrowUpDown, ChevronDown, Eye, Clock, Check, X, MoreHorizontal, Inbox,
  Layers, Download, Loader2, Minus,
} from "lucide-react";

const STATUS_FILTERS = [
  { key: "all", label: "Tous les statuts" },
  { key: "pending", label: "En attente" },
  { key: "approved", label: "Approuvées" },
  { key: "rejected", label: "Rejetées" },
];

const SORTS = [
  { key: "pending_first", label: "En attente d'abord" },
  { key: "recent", label: "Plus récentes" },
  { key: "oldest", label: "Plus anciennes" },
  { key: "name", label: "Nom A → Z" },
];

export const STATUS = {
  pending: { label: "En attente", icon: Clock, halo: "bg-latte-soft", dot: "bg-latte", text: "text-coffee-dark", bar: "bg-latte", filled: 6, step: "Reçue" },
  approved: { label: "Approuvée", icon: Check, halo: "bg-latte-soft", dot: "bg-coffee", text: "text-coffee-dark", bar: "bg-coffee", filled: 12, step: "Contrat" },
  rejected: { label: "Rejetée", icon: X, halo: "bg-line", dot: "bg-ink-faint", text: "text-ink-soft", bar: "bg-ink-faint", filled: 18, step: "Rejetée" },
};

const BAR_COUNT = 18;

export function timeAgo(value) {
  const diff = Date.now() - new Date(value).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${Math.max(min, 1)} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} j`;
  return `${Math.floor(d / 30)} mois`;
}

/** Télécharge une liste de candidatures en CSV (séparateur « ; » + BOM pour Excel FR). */
export function exportApplicationsCsv(list, filename = "candidatures") {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const headers = ["Entreprise", "Contact", "Email", "Domaine", "Statut", "Reçue le"];
  const lines = [
    headers.map(esc).join(";"),
    ...list.map((a) =>
      [a.company, a.contact_name, a.email, a.category, STATUS[a.status]?.label || a.status, new Date(a.created_at).toLocaleDateString("fr-FR")]
        .map(esc)
        .join(";")
    ),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function isTyping(el) {
  const t = el?.tagName;
  return t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || el?.isContentEditable;
}

function Kbd({ children, dark = false }) {
  return (
    <kbd
      className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md text-[10px] font-sans font-medium border ${
        dark ? "border-white/20 bg-white/10 text-cream/80" : "border-line bg-cream text-ink-soft"
      }`}
    >
      {children}
    </kbd>
  );
}

function PillSelect({ icon: Icon, value, onChange, options, className = "" }) {
  return (
    <label className={`relative flex items-center ${className}`}>
      <Icon size={14} className="absolute left-3 text-ink-soft pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none w-full bg-surface border border-line rounded-xl pl-8 pr-8 py-2.5 text-sm text-ink outline-none cursor-pointer hover:border-coffee-light focus:border-coffee-light transition-colors"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-3 text-ink-soft pointer-events-none" />
    </label>
  );
}

function Checkbox({ state, onClick, label }) {
  // state : "on" | "off" | "some"
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "on" ? true : state === "some" ? "mixed" : false}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center shrink-0 transition-colors ${
        state === "off" ? "border-line bg-surface hover:border-coffee-light" : "border-coffee bg-coffee text-white"
      }`}
    >
      {state === "on" && <Check size={12} strokeWidth={3} />}
      {state === "some" && <Minus size={12} strokeWidth={3} />}
    </button>
  );
}

/**
 * Liste des candidatures façon « monitors ».
 * Props additionnelles (toutes optionnelles) :
 *  - onBulkStatus(ids, status)  → actions groupées
 *  - onVisibleChange(ids)        → ordre affiché (pour la navigation précédent/suivant)
 *  - keyboardEnabled             → active j/k/Entrée/x//
 *  - searchRef                   → ref du champ de recherche
 */
export default function ApplicationsTable({
  applications, filter, onFilterChange, selectedId, onSelect,
  onBulkStatus, onVisibleChange, keyboardEnabled = true, searchRef: externalSearchRef,
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("pending_first");
  const [grouped, setGrouped] = useState(false);
  const [checked, setChecked] = useState(() => new Set());
  const [cursor, setCursor] = useState(-1);
  const [bulkBusy, setBulkBusy] = useState(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const localSearchRef = useRef(null);
  const searchRef = externalSearchRef || localSearchRef;
  const rowRefs = useRef({});

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = applications
      .filter((a) => filter === "all" || a.status === filter)
      .filter((a) => !q || [a.company, a.contact_name, a.category, a.email].some((v) => v?.toLowerCase().includes(q)));
    const byDate = (a, b) => new Date(b.created_at) - new Date(a.created_at);
    return [...list].sort((a, b) => {
      if (sort === "recent") return byDate(a, b);
      if (sort === "oldest") return -byDate(a, b);
      if (sort === "name") return (a.company || "").localeCompare(b.company || "", "fr");
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (b.status === "pending" && a.status !== "pending") return 1;
      return byDate(a, b);
    });
  }, [applications, filter, query, sort]);

  const groups = useMemo(() => {
    if (!grouped) return [{ key: null, items: rows }];
    const map = new Map();
    rows.forEach((r) => {
      const k = r.category || "Autre";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    });
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length).map(([key, items]) => ({ key, items }));
  }, [rows, grouped]);

  const ordered = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    onVisibleChange?.(ordered.map((a) => a.id));
  }, [ordered, onVisibleChange]);

  // Nettoie la sélection si des candidatures disparaissent
  useEffect(() => {
    setChecked((prev) => {
      const ids = new Set(applications.map((a) => a.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [applications]);

  useEffect(() => {
    setCursor((c) => (c >= ordered.length ? ordered.length - 1 : c));
  }, [ordered.length]);

  useEffect(() => {
    const id = ordered[cursor]?.id;
    if (id != null) rowRefs.current[id]?.scrollIntoView({ block: "nearest" });
  }, [cursor, ordered]);

  function toggle(id) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setConfirmReject(false);
  }

  const allChecked = ordered.length > 0 && ordered.every((a) => checked.has(a.id));
  const someChecked = !allChecked && ordered.some((a) => checked.has(a.id));

  function toggleAll() {
    setChecked((prev) => {
      const next = new Set(prev);
      if (allChecked) ordered.forEach((a) => next.delete(a.id));
      else ordered.forEach((a) => next.add(a.id));
      return next;
    });
    setConfirmReject(false);
  }

  const checkedApps = applications.filter((a) => checked.has(a.id));
  const pendingChecked = checkedApps.filter((a) => a.status === "pending");

  async function runBulk(status) {
    if (!onBulkStatus || pendingChecked.length === 0) return;
    if (status === "rejected" && !confirmReject) {
      setConfirmReject(true);
      return;
    }
    setBulkBusy(status);
    try {
      await onBulkStatus(pendingChecked.map((a) => a.id), status);
      setChecked(new Set());
    } finally {
      setBulkBusy(null);
      setConfirmReject(false);
    }
  }

  // Raccourcis clavier
  useEffect(() => {
    if (!keyboardEnabled) return undefined;
    function onKey(e) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(document.activeElement)) {
        if (e.key === "Escape") document.activeElement.blur();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (!ordered.length) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, ordered.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === "Enter" && cursor >= 0) {
        e.preventDefault();
        onSelect(ordered[cursor].id);
      } else if (e.key === "x" && cursor >= 0) {
        e.preventDefault();
        toggle(ordered[cursor].id);
      } else if (e.key === "Escape") {
        setChecked(new Set());
        setCursor(-1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyboardEnabled, ordered, cursor, onSelect]);

  function handleRowKey(e, id) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(id);
    }
  }

  return (
    <div>
      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2.5 bg-surface border border-line rounded-xl px-3.5 py-2.5 text-sm text-ink">
          <Checkbox state={allChecked ? "on" : someChecked ? "some" : "off"} onClick={toggleAll} label="Tout sélectionner" />
          <span className="tabular-nums">
            {checked.size}<span className="text-ink-faint"> / {ordered.length}</span>
          </span>
        </div>

        <button
          onClick={() => setGrouped((g) => !g)}
          aria-pressed={grouped}
          className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm transition-colors ${
            grouped ? "bg-ink text-cream border-ink" : "bg-surface border-line text-ink-soft hover:text-ink hover:border-coffee-light"
          }`}
        >
          <Layers size={14} className={grouped ? "text-latte" : ""} />
          {grouped ? "Groupé par domaine" : "Grouper par domaine"}
        </button>

        <PillSelect icon={Filter} value={filter} onChange={onFilterChange} options={STATUS_FILTERS} />

        <div className="flex-1 min-w-[12px]" />

        <label className="relative flex items-center w-full sm:w-64 order-last sm:order-none">
          <Search size={14} className="absolute left-3 text-ink-faint pointer-events-none" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un partenaire…"
            className="w-full bg-surface border border-line rounded-xl pl-9 pr-10 py-2.5 text-sm outline-none placeholder:text-ink-faint focus:border-coffee-light transition-colors [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button onClick={() => setQuery("")} aria-label="Effacer" className="absolute right-2.5 text-ink-faint hover:text-ink">
              <X size={14} />
            </button>
          ) : (
            <span className="absolute right-2.5 hidden md:block"><Kbd>/</Kbd></span>
          )}
        </label>
        <PillSelect icon={ArrowUpDown} value={sort} onChange={setSort} options={SORTS} className="sm:w-52" />
      </div>

      {/* Barre d'actions groupées */}
      {checked.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 bg-ink-fixed text-cream-fixed rounded-2xl pl-4 pr-2 py-2 shadow-lg">
          <p className="text-sm mr-auto">
            <span className="font-semibold">{checked.size}</span> sélectionnée{checked.size > 1 ? "s" : ""}
            {pendingChecked.length !== checked.size && (
              <span className="text-cream/60"> · {pendingChecked.length} en attente</span>
            )}
          </p>
          {onBulkStatus && (
            <>
              <button
                onClick={() => runBulk("approved")}
                disabled={!!bulkBusy || pendingChecked.length === 0}
                className="flex items-center gap-1.5 text-xs font-medium rounded-lg bg-coffee hover:bg-coffee-dark px-3 py-2 disabled:opacity-40 transition-colors"
              >
                {bulkBusy === "approved" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Approuver{pendingChecked.length ? ` (${pendingChecked.length})` : ""}
              </button>
              <button
                onClick={() => runBulk("rejected")}
                disabled={!!bulkBusy || pendingChecked.length === 0}
                className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-2 disabled:opacity-40 transition-colors ${
                  confirmReject ? "bg-cream-fixed text-ink-fixed hover:bg-white" : "bg-white/10 hover:bg-white/15"
                }`}
              >
                {bulkBusy === "rejected" ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                {confirmReject ? "Confirmer le rejet ?" : "Rejeter"}
              </button>
            </>
          )}
          <button
            onClick={() => exportApplicationsCsv(checkedApps, "candidatures-selection")}
            className="flex items-center gap-1.5 text-xs font-medium rounded-lg bg-white/10 hover:bg-white/15 px-3 py-2 transition-colors"
          >
            <Download size={13} /> Exporter
          </button>
          <button
            onClick={() => { setChecked(new Set()); setConfirmReject(false); }}
            aria-label="Annuler la sélection"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-cream/60 hover:bg-white/10 hover:text-cream"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Liste */}
      {ordered.length === 0 ? (
        <div className="bg-surface border border-line rounded-2xl px-6 py-14 text-center">
          <Inbox size={22} className="mx-auto text-ink-faint mb-3" strokeWidth={1.6} />
          <p className="text-sm font-medium text-ink">{query ? "Aucun résultat" : "Aucune candidature ici"}</p>
          <p className="text-xs text-ink-soft mt-1">
            {query ? `Rien ne correspond à « ${query} ».` : "Les nouvelles candidatures apparaîtront ici."}
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          {groups.map((group) => (
            <div key={group.key ?? "all"}>
              {group.key && (
                <div className="flex items-center justify-between px-4 py-2 bg-cream/60 border-b border-line">
                  <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-ink-soft truncate">{group.key}</p>
                  <p className="text-[11px] text-ink-faint shrink-0">
                    {group.items.length}
                    {group.items.some((a) => a.status === "pending") && (
                      <span className="text-coffee-dark"> · {group.items.filter((a) => a.status === "pending").length} en attente</span>
                    )}
                  </p>
                </div>
              )}
              <ul className="divide-y divide-line border-b border-line last:border-b-0">
                {group.items.map((app) => {
                  const st = STATUS[app.status] || STATUS.pending;
                  const Icon = st.icon;
                  const selected = selectedId === app.id;
                  const isCursor = ordered[cursor]?.id === app.id;
                  const isChecked = checked.has(app.id);
                  return (
                    <li
                      key={app.id}
                      ref={(el) => { rowRefs.current[app.id] = el; }}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selected}
                      onClick={() => { setCursor(ordered.findIndex((a) => a.id === app.id)); onSelect(app.id); }}
                      onKeyDown={(e) => handleRowKey(e, app.id)}
                      className={`group relative flex items-center gap-3 sm:gap-4 px-4 py-3.5 cursor-pointer outline-none transition-colors focus-visible:bg-cream ${
                        isChecked ? "bg-latte-soft/60" : selected ? "bg-cream" : "hover:bg-cream/50"
                      }`}
                    >
                      {isCursor && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-latte" />}

                      <Checkbox state={isChecked ? "on" : "off"} onClick={() => toggle(app.id)} label={`Sélectionner ${app.company}`} />

                      <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${st.halo}`}>
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white ${st.dot}`}>
                          <Icon size={11} strokeWidth={3} />
                        </span>
                      </span>

                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] text-ink font-medium truncate">{app.company}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-ink-soft min-w-0">
                          {!grouped && (
                            <span className="shrink-0 uppercase tracking-wide text-[10px] font-medium border border-line rounded px-1.5 py-px bg-cream/60 max-w-[120px] truncate">
                              {app.category}
                            </span>
                          )}
                          <span className="truncate">
                            <span className={st.text}>{st.label}</span> · {app.contact_name}
                          </span>
                        </div>
                      </div>

                      {app.status === "pending" && app.agent_review_status === "forwarded" && (
                        <span className="hidden md:flex items-center gap-1.5 text-xs font-medium text-cream bg-ink rounded-full px-3 py-1.5 shrink-0">
                          <Eye size={13} /> À traiter
                        </span>
                      )}
                      {app.status === "pending" && app.agent_review_status === "pending" && (
                        <span className="hidden md:flex items-center gap-1.5 text-xs font-medium text-coffee-dark bg-latte-soft border border-latte-light rounded-full px-3 py-1.5 shrink-0">
                          En attente d'un agent
                        </span>
                      )}

                      <span
                        className="hidden lg:flex items-center gap-1.5 text-xs text-ink-faint w-16 shrink-0"
                        title={new Date(app.created_at).toLocaleString("fr-FR")}
                      >
                        <Clock size={12} />
                        {timeAgo(app.created_at)}
                      </span>

                      <div className="hidden sm:block shrink-0 text-right">
                        <div className="flex gap-[2px]">
                          {Array.from({ length: BAR_COUNT }).map((_, i) => (
                            <span key={i} className={`w-[4px] h-4 rounded-[1px] ${i < st.filled ? st.bar : "bg-line"}`} />
                          ))}
                        </div>
                        <p className="text-[11px] text-ink-soft mt-1">{st.step}</p>
                      </div>

                      <span className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint group-hover:text-ink group-hover:bg-surface shrink-0">
                        <MoreHorizontal size={16} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Aide clavier */}
      {keyboardEnabled && ordered.length > 0 && (
        <div className="hidden md:flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 px-1 text-[11px] text-ink-faint">
          <span className="flex items-center gap-1.5"><Kbd>J</Kbd><Kbd>K</Kbd> naviguer</span>
          <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> ouvrir</span>
          <span className="flex items-center gap-1.5"><Kbd>X</Kbd> sélectionner</span>
          <span className="flex items-center gap-1.5"><Kbd>/</Kbd> rechercher</span>
          <span className="flex items-center gap-1.5"><Kbd>Ctrl</Kbd><Kbd>K</Kbd> commandes</span>
        </div>
      )}
    </div>
  );
}