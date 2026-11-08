import { useCallback, useEffect, useState } from "react";
import PlansAdminPanel from "./PlansAdminPanel.jsx";
import {
  Loader2, RefreshCw, Plus, Trash2, Video, Mail, Phone, MapPin, Inbox, AlertCircle, PlayCircle, Save, X, Eye, EyeOff, Lock, Unlock,
} from "lucide-react";

const inputCls =
  "w-full rounded-xl border border-line bg-cream px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-coffee";

const STATUS = {
  new: { label: "Nouvelle", cls: "bg-latte-soft text-coffee-dark border-latte-light" },
  contacted: { label: "Contactée", cls: "bg-latte-soft text-coffee-dark border-coffee-light" },
  enrolled: { label: "Inscrite", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  closed: { label: "Clôturée", cls: "bg-line/60 text-ink-faint border-line" },
};

const EMPTY = { title: "", level: "Tous niveaux", category: "Numérique", description: "", youtube_playlist: "", outcomes: "", requirements: "", image_url: "", sort_order: 0, is_published: true, members_only: false };

function fmtDate(v) {
  return new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function CourseForm({ initial, onCancel, onSave, saving, error }) {
  const [f, setF] = useState({ ...EMPTY, ...initial, youtube_playlist: initial?.youtube_playlist ?? initial?.youtube_playlist_id ?? "" });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave({ ...f, sort_order: Number(f.sort_order) || 0 }); }}
      className="bg-surface border border-line rounded-2xl p-5 md:p-6 space-y-4"
    >
      <div className="grid md:grid-cols-2 gap-4">
        <label className="block text-xs text-ink-soft">Titre
          <input required minLength={2} className={`${inputCls} mt-1.5`} value={f.title} onChange={set("title")} />
        </label>
        <label className="block text-xs text-ink-soft">Playlist YouTube (lien ou identifiant)
          <input className={`${inputCls} mt-1.5`} value={f.youtube_playlist} onChange={set("youtube_playlist")} placeholder="https://www.youtube.com/playlist?list=PL…" />
        </label>
        <label className="block text-xs text-ink-soft">Niveau
          <select className={`${inputCls} mt-1.5`} value={f.level} onChange={set("level")}>
            <option>Initiation</option><option>Intermédiaire</option><option>Tous niveaux</option>
          </select>
        </label>
        <label className="block text-xs text-ink-soft">Catégorie
          <input className={`${inputCls} mt-1.5`} value={f.category} onChange={set("category")} />
        </label>
      </div>
      <label className="block text-xs text-ink-soft">Description
        <textarea className={`${inputCls} mt-1.5 min-h-20`} value={f.description} onChange={set("description")} />
      </label>
      <div className="grid md:grid-cols-2 gap-4">
        <label className="block text-xs text-ink-soft">Ce qu'on apprend (une ligne par point)
          <textarea className={`${inputCls} mt-1.5 min-h-24`} value={f.outcomes} onChange={set("outcomes")} />
        </label>
        <label className="block text-xs text-ink-soft">Prérequis (une ligne par point)
          <textarea className={`${inputCls} mt-1.5 min-h-24`} value={f.requirements} onChange={set("requirements")} />
        </label>
        <label className="block text-xs text-ink-soft">Image de couverture (URL, optionnel)
          <input className={`${inputCls} mt-1.5`} value={f.image_url || ""} onChange={set("image_url")} />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-xs text-ink-soft">Ordre
            <input type="number" className={`${inputCls} mt-1.5`} value={f.sort_order} onChange={set("sort_order")} />
          </label>
          <label className="flex items-end gap-2 text-sm text-ink pb-2.5">
            <input type="checkbox" checked={f.is_published} onChange={set("is_published")} />
            Publié sur le site
          </label>
          <label className="flex items-center gap-2 text-sm text-ink md:col-span-2" title="Les vidéos de ce cours ne se regardent qu'avec un bouquet actif">
            <input type="checkbox" checked={!!f.members_only} onChange={set("members_only")} />
            Cours exclusif (réservé aux abonnés d'un bouquet)
          </label>
        </div>
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-5 py-2.5 disabled:opacity-60">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Enregistrer
        </button>
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-2 rounded-full border border-line text-sm px-5 py-2.5 text-ink-soft"><X size={14} />Annuler</button>
      </div>
    </form>
  );
}

function LessonsManager({ course, withAuth, api, onChanged }) {
  const [lessons, setLessons] = useState(null);
  const [f, setF] = useState({ title: "", youtube_url: "", section: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = useCallback(() => withAuth((t) => api.admin.listLessons(t, course.id)).then(setLessons).catch(() => setLessons([])), [withAuth, api, course.id]);
  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await withAuth((t) => api.admin.addLesson(t, course.id, f));
      setF({ title: "", youtube_url: "", section: "" });
      await load(); onChanged();
    } catch (x) { setErr(x.message || "Erreur."); } finally { setBusy(false); }
  }
  async function toggleExclusive(l) {
    await withAuth((t) => api.admin.updateLesson(t, l.id, { members_only: !l.members_only })).catch(() => {});
    await load();
  }
  async function del(id) {
    if (!window.confirm("Supprimer cette leçon ?")) return;
    await withAuth((t) => api.admin.deleteLesson(t, id)).catch(() => {});
    await load(); onChanged();
  }
  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="text-xs font-medium text-ink-soft mb-2">Leçons ({lessons?.length ?? "…"}) — celles de la playlist se mettent à jour à la synchronisation ; vous pouvez en ajouter à la main.</p>
      <ul className="max-h-56 overflow-y-auto divide-y divide-line rounded-xl border border-line bg-cream mb-3">
        {(lessons || []).map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <PlayCircle size={14} className={l.is_published ? "text-coffee" : "text-ink-faint"} />
            <span className={`flex-1 truncate ${l.is_published ? "text-ink" : "text-ink-faint line-through"}`}>{l.title}</span>
            <button onClick={() => toggleExclusive(l)} title={l.members_only ? "Exclusive : cliquer pour la rendre gratuite" : "Gratuite : cliquer pour la réserver aux abonnés"} className={`inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-1 border ${l.members_only ? "bg-latte-soft text-coffee-dark border-latte-light" : "border-line text-ink-faint"}`}>
              {l.members_only ? <Lock size={11} /> : <Unlock size={11} />}{l.members_only ? "Exclusive" : "Gratuite"}
            </button>
            <a href={`https://www.youtube.com/watch?v=${l.youtube_id}`} target="_blank" rel="noreferrer" className="text-xs text-coffee underline">YouTube</a>
            <button onClick={() => del(l.id)} aria-label="Supprimer" className="text-ink-faint hover:text-red-600"><Trash2 size={14} /></button>
          </li>
        ))}
        {lessons?.length === 0 && <li className="px-3 py-3 text-xs text-ink-faint">Aucune leçon pour l'instant.</li>}
      </ul>
      <form onSubmit={add} className="grid md:grid-cols-[1.2fr_1.2fr_0.8fr_auto] gap-2">
        <input required className={inputCls} placeholder="Titre de la leçon" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <input required className={inputCls} placeholder="Lien YouTube de la vidéo" value={f.youtube_url} onChange={(e) => setF({ ...f, youtube_url: e.target.value })} />
        <input className={inputCls} placeholder="Chapitre (optionnel)" value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })} />
        <button disabled={busy} className="rounded-xl bg-ink text-cream text-sm px-4 disabled:opacity-60">{busy ? "…" : "Ajouter"}</button>
      </form>
      {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
    </div>
  );
}

function CoursesTab({ withAuth, api }) {
  const [courses, setCourses] = useState(null);
  const [editing, setEditing] = useState(null); // null | "new" | course
  const [open, setOpen] = useState(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(null);
  const [msg, setMsg] = useState(null);
  const [formError, setFormError] = useState("");

  const load = useCallback(() => withAuth((t) => api.admin.listCourses(t)).then(setCourses).catch(() => setMsg({ ok: false, text: "Impossible de charger les cours." })), [withAuth, api]);
  useEffect(() => { load(); }, [load]);

  async function save(body) {
    setSaving(true); setFormError("");
    try {
      if (editing === "new") await withAuth((t) => api.admin.createCourse(t, body));
      else await withAuth((t) => api.admin.updateCourse(t, editing.id, body));
      setEditing(null); await load();
    } catch (e) { setFormError(e.message || "Erreur."); } finally { setSaving(false); }
  }
  async function sync(c) {
    setSyncing(c.id); setMsg(null);
    try {
      await withAuth((t) => api.admin.syncCourse(t, c.id));
      setMsg({ ok: true, text: `« ${c.title} » synchronisé avec YouTube.` });
      await load();
    } catch (e) { setMsg({ ok: false, text: e.message || "Synchronisation impossible." }); } finally { setSyncing(null); }
  }
  async function del(c) {
    if (!window.confirm(`Supprimer le cours « ${c.title} » et ses leçons ?`)) return;
    await withAuth((t) => api.admin.deleteCourse(t, c.id)).catch(() => {});
    load();
  }
  async function togglePublish(c) {
    await withAuth((t) => api.admin.updateCourse(t, c.id, {
      title: c.title, level: c.level, description: c.description, category: c.category, image_url: c.image_url,
      youtube_playlist: c.youtube_playlist_id || "", outcomes: c.outcomes, requirements: c.requirements,
      sort_order: c.sort_order, is_published: !c.is_published, members_only: !!c.members_only,
    })).catch(() => {});
    load();
  }

  if (!courses) return <div className="h-40 rounded-2xl bg-surface border border-line animate-pulse" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft max-w-xl">
          Un cours = une playlist de votre chaîne YouTube. Collez le lien de la playlist, enregistrez : les vidéos sont importées.
          Les nouvelles vidéos ajoutées à la playlist sont reprises automatiquement (ou via « Synchroniser »).
        </p>
        <button onClick={() => setEditing("new")} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-5 py-2.5">
          <Plus size={15} />Nouveau cours
        </button>
      </div>
      {msg && (
        <p role="status" className={`text-sm rounded-xl px-4 py-3 border ${msg.ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>{msg.text}</p>
      )}
      {editing && (
        <CourseForm initial={editing === "new" ? null : editing} onCancel={() => setEditing(null)} onSave={save} saving={saving} error={formError} />
      )}
      <ul className="space-y-3">
        {courses.map((c) => (
          <li key={c.id} className="bg-surface border border-line rounded-2xl p-5">
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg text-ink flex items-center gap-2">
                  {c.title}
                  {!c.is_published && <span className="text-[0.65rem] font-sans rounded-full bg-line/70 text-ink-faint px-2 py-0.5">Brouillon</span>}
                  {c.members_only && <span className="text-[0.65rem] font-sans rounded-full bg-latte-soft text-coffee-dark px-2 py-0.5">Exclusif</span>}
                </p>
                <p className="text-xs text-ink-soft mt-1">
                  {c.category} · {c.level} · {c.lesson_count} leçon(s)
                  {c.youtube_playlist_id ? ` · playlist ${c.youtube_playlist_id.slice(0, 12)}…` : " · sans playlist"}
                  {c.synced_at ? ` · synchronisé le ${fmtDate(c.synced_at)}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {c.youtube_playlist_id && (
                  <button onClick={() => sync(c)} disabled={syncing === c.id} className="inline-flex items-center gap-1.5 rounded-full border border-line text-xs px-3.5 py-2 text-ink hover:border-coffee-light disabled:opacity-60">
                    {syncing === c.id ? <Loader2 size={13} className="animate-spin" /> : <Video size={13} />}
                    Synchroniser
                  </button>
                )}
                <button onClick={() => setOpen(open === c.id ? null : c.id)} className="rounded-full border border-line text-xs px-3.5 py-2 text-ink-soft">Leçons</button>
                <button onClick={() => togglePublish(c)} title={c.is_published ? "Dépublier" : "Publier"} className="rounded-full border border-line p-2 text-ink-soft">{c.is_published ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                <button onClick={() => setEditing(c)} className="rounded-full border border-line text-xs px-3.5 py-2 text-ink-soft">Modifier</button>
                <button onClick={() => del(c)} aria-label="Supprimer le cours" className="rounded-full border border-line p-2 text-ink-faint hover:text-red-600"><Trash2 size={14} /></button>
              </div>
            </div>
            {open === c.id && <LessonsManager course={c} withAuth={withAuth} api={api} onChanged={load} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RegistrationsTab({ withAuth, api, onCount }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = useCallback(() =>
    withAuth((t) => api.admin.listRegistrations(t))
      .then((l) => { setRows(l || []); onCount?.((l || []).filter((r) => r.status === "new").length); })
      .catch(() => setError("Impossible de charger les inscriptions.")), [withAuth, api, onCount]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(id, status) {
    setBusy(id);
    try { await withAuth((t) => api.admin.updateRegistrationStatus(t, id, status)); await load(); } finally { setBusy(null); }
  }

  if (error) return <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-2xl p-5 text-sm text-red-700"><AlertCircle size={16} />{error}</div>;
  if (!rows) return <div className="h-40 rounded-2xl bg-surface border border-line animate-pulse" />;
  if (rows.length === 0) {
    return (
      <div className="bg-surface border border-dashed border-line rounded-2xl px-6 py-12 text-center">
        <Inbox size={20} className="mx-auto text-ink-faint mb-3" />
        <p className="text-sm text-ink-soft">Aucune inscription au présentiel pour le moment.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const st = STATUS[r.status] || STATUS.new;
        return (
          <li key={r.id} className="bg-surface border border-line rounded-2xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink flex items-center gap-2">
                  {r.full_name}
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                </p>
                <p className="text-sm text-coffee mt-0.5">{r.course_title || "Formation à définir avec l'équipe"}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft mt-2">
                  <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1.5 hover:text-ink"><Mail size={12} />{r.email}</a>
                  {r.phone && <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1.5 hover:text-ink"><Phone size={12} />{r.phone}</a>}
                  {r.city && <span className="inline-flex items-center gap-1.5"><MapPin size={12} />{r.city}</span>}
                  <span>{fmtDate(r.created_at)}</span>
                </div>
                {r.availability && <p className="text-xs text-ink-soft mt-2">Disponibilités : {r.availability}</p>}
                {r.message && <p className="text-sm text-stone mt-2 whitespace-pre-line">{r.message}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(STATUS).filter(([k]) => k !== r.status).map(([k, v]) => (
                  <button key={k} disabled={busy === r.id} onClick={() => setStatus(r.id, k)} className="rounded-full border border-line text-xs px-3 py-1.5 text-ink-soft hover:border-coffee-light disabled:opacity-50">
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Admin H-Learning : cours liés aux playlists YouTube + inscriptions au présentiel. */
export default function LearningAdminPanel({ withAuth, api, onCount }) {
  const [tab, setTab] = useState("courses");
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6" role="tablist">
        {[["courses", "Cours & YouTube"], ["plans", "Bouquets"], ["subscriptions", "Abonnements"], ["currencies", "Devises"], ["registrations", "Inscriptions présentiel"]].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-full text-sm px-4 py-2 border ${tab === k ? "bg-ink text-cream border-ink" : "border-line text-ink-soft"}`}>{label}</button>
        ))}
      </div>
      {tab === "courses" ? <CoursesTab withAuth={withAuth} api={api} />
        : tab === "registrations" ? <RegistrationsTab withAuth={withAuth} api={api} onCount={onCount} />
        : <PlansAdminPanel withAuth={withAuth} api={api} tab={tab} />}
    </div>
  );
}
