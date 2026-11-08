import { useCallback, useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import ChatThread from "../support/ChatThread.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { api } from "../../lib/api.js";
import { deptLabel } from "../../lib/agents.js";

const T = {
  fr: { title: "Conversations", empty: "Aucune conversation", active: "En cours", closed: "Terminées", take: "Prendre en charge", close: "Terminer", pick: "Choisissez une conversation", unassigned: "Non assignée" },
  en: { title: "Conversations", empty: "No conversations", active: "Active", closed: "Closed", take: "Take over", close: "Close", pick: "Pick a conversation", unassigned: "Unassigned" },
};

export default function AgentInbox() {
  const { withAuth } = useUser();
  const { lang } = useLanguage();
  const t = T[lang] || T.fr;
  const [status, setStatus] = useState("active");
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(null);
  const refresh = useCallback(async () => { try { setList((await withAuth((tk) => api.agents.threads(tk, status))) || []); } catch { /* ignoré */ } }, [withAuth, status]);
  useEffect(() => { refresh(); const i = setInterval(refresh, 8000); return () => clearInterval(i); }, [refresh]);
  const cur = list.find((x) => x.code === sel);
  const load = useCallback((after) => withAuth((tk) => api.agents.thread(tk, sel, after)), [withAuth, sel]);
  const send = useCallback((b) => withAuth((tk) => api.agents.reply(tk, sel, b)), [withAuth, sel]);
  return (
    <div className="grid md:grid-cols-[300px_1fr] gap-4 min-h-[520px]">
      <div className="rounded-3xl border border-line bg-surface p-3 flex flex-col">
        <div className="flex gap-1 mb-3">{[["active", t.active], ["closed", t.closed]].map(([k, l]) => <button key={k} onClick={() => { setStatus(k); setSel(null); }} className={`px-3 py-1.5 rounded-full text-xs ${status === k ? "bg-ink text-cream" : "border border-line text-ink-soft"}`}>{l}</button>)}</div>
        {!list.length ? <p className="text-sm text-ink-soft p-3 flex items-center gap-2"><Inbox size={15} />{t.empty}</p> : (
          <ul className="space-y-1 overflow-y-auto">{list.map((x) => (
            <li key={x.code}><button onClick={() => setSel(x.code)} className={`w-full text-left rounded-2xl px-3 py-2.5 ${sel === x.code ? "bg-latte-soft" : "hover:bg-cream"}`}>
              <p className="text-sm text-ink truncate">{x.user_name} <span className="text-ink-faint text-xs">· {deptLabel(lang, x.module)}</span></p>
              <p className="text-xs text-ink-soft truncate">{x.last || x.subject}</p>
            </button></li>
          ))}</ul>
        )}
      </div>
      <div className="rounded-3xl border border-line bg-surface flex flex-col min-h-[420px]">
        {!cur ? <p className="m-auto text-sm text-ink-soft">{t.pick}</p> : (
          <>
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line">
              <p className="text-sm text-ink truncate">{cur.user_name} <span className="text-ink-faint">({cur.user_email})</span></p>
              <div className="flex gap-2">
                {cur.status !== "closed" && !cur.agent_name && <button onClick={async () => { await withAuth((tk) => api.agents.claim(tk, cur.code)); refresh(); }} className="rounded-full border border-line text-xs px-3 py-1.5">{t.take}</button>}
                {cur.status !== "closed" && <button onClick={async () => { await withAuth((tk) => api.agents.close(tk, cur.code)); refresh(); }} className="rounded-full border border-line text-xs px-3 py-1.5">{t.close}</button>}
              </div>
            </div>
            <div className="flex-1 min-h-0"><ChatThread key={cur.code} code={cur.code} me="agent" load={load} send={send} closed={cur.status === "closed"} /></div>
          </>
        )}
      </div>
    </div>
  );
}
