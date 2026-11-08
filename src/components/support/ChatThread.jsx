import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext.jsx";

/** Fil de discussion partagé (utilisateur ou agent) : interroge toutes les 4 s
 * les messages plus récents que le dernier reçu. `load(after)` et `send(body)` viennent de l'appelant. */
export default function ChatThread({ code, me, load, send, closed, onChange }) {
  const { lang } = useLanguage();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const last = useRef(0);
  const box = useRef(null);
  const merge = useCallback((list) => {
    if (!list?.length) return;
    setMsgs((cur) => { const ids = new Set(cur.map((m) => m.id)); return [...cur, ...list.filter((m) => !ids.has(m.id))]; });
    last.current = Math.max(last.current, ...list.map((m) => m.id));
  }, []);
  useEffect(() => { setMsgs([]); last.current = 0; }, [code]);
  useEffect(() => {
    let alive = true, timer;
    const tick = async () => {
      try { const r = await load(last.current); if (alive) { merge(r.messages); onChange?.(r); } } catch { /* nouvelle tentative au prochain tour */ }
      if (alive && !closed) timer = setTimeout(tick, 4000);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [code, closed, load, merge, onChange]);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [msgs.length]);
  async function submit(e) {
    e.preventDefault();
    const body = text.trim(); if (!body || busy) return;
    setBusy(true);
    try { await send(body); setText(""); const r = await load(last.current); merge(r.messages); } catch { /* conserve le texte */ } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col h-full min-h-0">
      <div ref={box} className="flex-1 overflow-y-auto space-y-2 p-3" aria-live="polite">
        {msgs.map((m) => m.role === "system" ? (
          <p key={m.id} className="text-center text-[11px] text-ink-faint">{m.body}</p>
        ) : (
          <div key={m.id} className={`flex ${m.role === me ? "justify-end" : "justify-start"}`}>
            <p className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${m.role === me ? "bg-ink text-cream" : "bg-latte-soft text-ink"}`}>{m.body}</p>
          </div>
        ))}
      </div>
      {!closed && (
        <form onSubmit={submit} className="flex gap-2 p-3 border-t border-line">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder={lang === "en" ? "Write a message…" : "Écrire un message…"} className="flex-1 rounded-full border border-line bg-surface px-4 py-2.5 text-sm text-ink focus:outline-none focus:border-coffee" />
          <button disabled={busy || !text.trim()} aria-label={lang === "en" ? "Send" : "Envoyer"} className="w-10 h-10 rounded-full bg-ink text-cream flex items-center justify-center disabled:opacity-50"><Send size={16} /></button>
        </form>
      )}
    </div>
  );
}
