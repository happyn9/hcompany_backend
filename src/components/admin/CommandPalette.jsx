import { useEffect, useMemo, useRef, useState } from "react";
import { Search, CornerDownLeft, ArrowUp, ArrowDown } from "lucide-react";

const STATUS_DOT = { pending: "bg-latte", approved: "bg-coffee", rejected: "bg-ink-faint" };
const STATUS_LABEL = { pending: "En attente", approved: "Approuvée", rejected: "Rejetée" };

/**
 * Palette de commandes (Ctrl/⌘ + K).
 * actions : [{ id, label, icon, hint, run }]
 */
export default function CommandPalette({ open, onClose, applications = [], actions = [], onSelectApplication }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [open]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const apps = applications
      .filter((a) => !q || [a.company, a.contact_name, a.email, a.category].some((v) => v?.toLowerCase().includes(q)))
      .slice(0, q ? 8 : 5)
      .map((a) => ({ type: "app", key: `app-${a.id}`, app: a }));
    const acts = actions
      .filter((a) => !q || a.label.toLowerCase().includes(q))
      .map((a) => ({ type: "action", key: `act-${a.id}`, action: a }));
    return [
      { title: q ? "Candidatures" : "Candidatures récentes", items: apps },
      { title: "Actions", items: acts },
    ].filter((s) => s.items.length > 0);
  }, [query, applications, actions]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function run(item) {
    onClose();
    if (!item) return;
    if (item.type === "app") onSelectApplication?.(item.app.id);
    else item.action.run();
  }

  function onKey(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(flat[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  if (!open) return null;

  let index = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Palette de commandes">
      <div className="absolute inset-0 bg-ink-fixed/50 backdrop-blur-[3px]" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-surface rounded-2xl shadow-2xl border border-line overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-line">
          <Search size={17} className="text-ink-faint shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Rechercher une candidature ou une action…"
            className="flex-1 bg-transparent py-4 text-[15px] text-ink outline-none placeholder:text-ink-faint"
          />
          <kbd className="text-[10px] font-sans text-ink-faint border border-line rounded-md px-1.5 py-0.5">Échap</kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {flat.length === 0 && (
            <p className="text-sm text-ink-soft text-center py-10">Aucun résultat pour « {query} ».</p>
          )}
          {sections.map((section) => (
            <div key={section.title} className="mb-1">
              <p className="px-3 pt-2 pb-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-faint font-semibold">{section.title}</p>
              {section.items.map((item) => {
                index += 1;
                const i = index;
                const isActive = i === active;
                if (item.type === "app") {
                  const a = item.app;
                  return (
                    <button
                      key={item.key}
                      data-index={i}
                      onMouseMove={() => setActive(i)}
                      onClick={() => run(item)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${isActive ? "bg-cream" : ""}`}
                    >
                      <span className="w-8 h-8 rounded-lg bg-ink text-cream flex items-center justify-center font-display text-sm shrink-0">
                        {a.company?.[0]?.toUpperCase() || "?"}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-ink truncate">{a.company}</span>
                        <span className="block text-xs text-ink-soft truncate">{a.contact_name} · {a.category}</span>
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] text-ink-soft shrink-0">
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[a.status] || "bg-line"}`} />
                        {STATUS_LABEL[a.status]}
                      </span>
                    </button>
                  );
                }
                const { action } = item;
                const Icon = action.icon;
                return (
                  <button
                    key={item.key}
                    data-index={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => run(item)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${isActive ? "bg-cream" : ""}`}
                  >
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? "bg-coffee text-white" : "bg-cream text-coffee-dark"}`}>
                      {Icon && <Icon size={15} />}
                    </span>
                    <span className="flex-1 text-sm text-ink">{action.label}</span>
                    {action.hint && <span className="text-[11px] text-ink-faint">{action.hint}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-line bg-cream/40 text-[11px] text-ink-faint">
          <span className="flex items-center gap-1"><ArrowUp size={11} /><ArrowDown size={11} /> naviguer</span>
          <span className="flex items-center gap-1"><CornerDownLeft size={11} /> valider</span>
          <span className="ml-auto">H-Company<span className="text-latte">.</span></span>
        </div>
      </div>
    </div>
  );
}