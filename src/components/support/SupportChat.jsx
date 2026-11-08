import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ChatThread from "./ChatThread.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { DEPARTMENTS, deptLabel } from "../../lib/agents.js";
import { errMessage } from "../../data/shop.js";

const T = {
  fr: { pick: "De quel service avez-vous besoin ?", online: (n) => `${n} agent${n > 1 ? "s" : ""} en ligne`, offline: "Aucun agent en ligne", msg: "Votre question", start: "Démarrer la conversation", signin: "Connectez-vous pour parler à un agent.", login: "Se connecter", back: "← Retour à l'assistante", close: "Terminer la conversation", with: (n) => `Vous échangez avec ${n}`, wait: "Un agent va vous répondre ici.", resume: "Conversation en cours" },
  en: { pick: "Which service do you need?", online: (n) => `${n} agent${n > 1 ? "s" : ""} online`, offline: "No agent online", msg: "Your question", start: "Start the conversation", signin: "Sign in to talk to an agent.", login: "Sign in", back: "← Back to the assistant", close: "End conversation", with: (n) => `You're chatting with ${n}`, wait: "An agent will reply here.", resume: "Conversation in progress", },
};
const PUBLIC = DEPARTMENTS.filter((d) => d !== "partnerships" || true);

export default function SupportChat({ onBack, onNavigate }) {
  const { lang } = useLanguage();
  const t = T[lang] || T.fr;
  const { isAuthenticated, withAuth } = useUser();
  const [avail, setAvail] = useState({});
  const [module, setModule] = useState("");
  const [text, setText] = useState("");
  const [thread, setThread] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    PUBLIC.forEach((m) => api.support.availability(m).then((r) => alive && setAvail((a) => ({ ...a, [m]: r.online }))).catch(() => {}));
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!isAuthenticated) return;
    withAuth((tk) => api.support.mine(tk)).then((l) => { const o = (l || []).find((x) => x.status !== "closed"); if (o) setThread(o); }).catch(() => {});
  }, [isAuthenticated, withAuth]);

  const load = useCallback((after) => withAuth((tk) => api.support.thread(tk, thread.code, after)), [withAuth, thread?.code]);
  const send = useCallback((b) => withAuth((tk) => api.support.send(tk, thread.code, b)), [withAuth, thread?.code]);
  const onChange = useCallback((r) => setThread((cur) => (cur && (cur.status !== r.status || cur.agent_name !== r.agent_name) ? { ...cur, status: r.status, agent_name: r.agent_name } : cur)), []);

  async function start(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    try { setThread(await withAuth((tk) => api.support.open(tk, { module, subject: deptLabel(lang, module), message: text.trim() }))); }
    catch (x) { setErr(errMessage(x, "Erreur")); } finally { setBusy(false); }
  }

  const Head = (
    <div className="px-4 py-2 border-b border-line flex items-center justify-between gap-2">
      <button onClick={onBack} className="text-xs text-coffee-dark">{t.back}</button>
      {thread && thread.status !== "closed" && <button onClick={async () => { const r = await withAuth((tk) => api.support.close(tk, thread.code)); setThread({ ...thread, ...r }); }} className="text-xs text-ink-faint underline">{t.close}</button>}
    </div>
  );
  if (!isAuthenticated) return <div className="flex-1 flex flex-col">{Head}<div className="m-auto p-6 text-center"><p className="text-sm text-ink mb-4">{t.signin}</p><Link to="/connexion" onClick={onNavigate} className="rounded-full bg-coffee text-cream-fixed text-sm px-5 py-2.5">{t.login}</Link></div></div>;
  if (thread) return (
    <div className="flex-1 min-h-0 flex flex-col">{Head}
      <p className="px-4 py-2 text-xs text-ink-soft bg-latte-soft">{thread.agent_name ? t.with(thread.agent_name) : t.wait}</p>
      <div className="flex-1 min-h-0"><ChatThread code={thread.code} me="user" load={load} send={send} closed={thread.status === "closed"} onChange={onChange} /></div>
    </div>
  );
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">{Head}
      <form onSubmit={start} className="p-4 space-y-3">
        <p className="text-sm font-medium text-ink">{t.pick}</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t.pick}>
          {PUBLIC.map((m) => (
            <button type="button" key={m} role="radio" aria-checked={module === m} disabled={avail[m] === 0} onClick={() => setModule(m)} className={`rounded-2xl border p-3 text-left text-sm disabled:opacity-50 ${module === m ? "border-coffee bg-latte-soft" : "border-line"}`}>
              <span className="block text-ink">{deptLabel(lang, m)}</span>
              <span className="flex items-center gap-1.5 text-[11px] text-ink-soft mt-0.5"><span className={`w-2 h-2 rounded-full ${avail[m] ? "bg-green-500" : "bg-ink-faint"}`} />{avail[m] === undefined ? "…" : avail[m] ? t.online(avail[m]) : t.offline}</span>
            </button>
          ))}
        </div>
        <textarea required minLength={2} maxLength={2000} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={t.msg} className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink resize-none focus:outline-none focus:border-coffee" />
        {err && <p role="alert" className="text-xs text-red-600">{err}</p>}
        <button disabled={!module || busy || text.trim().length < 2} className="w-full rounded-full bg-coffee text-cream-fixed text-sm font-medium py-3 disabled:opacity-50">{t.start}</button>
      </form>
    </div>
  );
}
