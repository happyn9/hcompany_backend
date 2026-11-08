import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BookOpen, ChevronRight, Home, MessageCircle, MessagesSquare, Send, Sparkles, ThumbsDown, ThumbsUp, UserRound, X } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useUser } from "../../context/Usercontext.jsx";
import { displayName } from "../app/AccountMenu.jsx";
import { CHATBOT } from "../../i18n/chatbot.js";
import { answer } from "../../i18n/chatbotEngine.js";
import { api } from "../../lib/api.js";
import Logo from "../ui/Logo.jsx";
import SupportChat from "../support/SupportChat.jsx";

let msgId = 0;
const nextId = () => ++msgId;
const TABS = [["home", Home, "Accueil", "Home"], ["chat", MessagesSquare, "Messages", "Messages"], ["help", BookOpen, "Aide", "Help"]];

/**
 * Assistante H-Company (Avila) — panneau façon Intercom.
 * Elle répond d'abord avec ce qu'elle a APPRIS (réponses des agents, corrections de l'admin, contenu de la base : services, cours, logements…),
 * sinon avec son moteur local de questions fréquentes, sinon elle propose un agent. C'est de l'apprentissage par mémoire + recherche, pas une IA externe.
 */
export default function Chatbot() {
  const { lang } = useLanguage();
  const { user, isAuthenticated } = useUser();
  const fr = lang !== "en";
  const dict = CHATBOT[lang] || CHATBOT.fr;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("home");
  const [agentMode, setAgentMode] = useState(false);
  const [messages, setMessages] = useState(() => [{ id: nextId(), from: "bot", text: dict.greeting }]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [voted, setVoted] = useState({});
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const topicRef = useRef(null);
  const alive = useRef(true);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { topicRef.current = null; setTyping(false); setMessages([{ id: nextId(), from: "bot", text: dict.greeting }]); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [lang]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, typing, tab]);
  useEffect(() => { if (open && tab === "chat" && !agentMode) setTimeout(() => inputRef.current?.focus(), 200); }, [open, tab, agentMode]);
  useEffect(() => { if (!open) return undefined; const k = (e) => e.key === "Escape" && setOpen(false); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open]);

  async function ask(text) {
    const clean = text.trim();
    if (!clean || typing) return;
    setTab("chat"); setAgentMode(false);
    setMessages((m) => [...m, { id: nextId(), from: "user", text: clean }]);
    setInput(""); setTyping(true);
    let reply = null, escalate = false;
    try {
      const r = await api.assistant.ask(clean, lang);
      if (r.answer) reply = { text: r.answer, entryId: r.entry_id, source: r.source, links: r.link ? [{ to: r.link, label: fr ? "Ouvrir" : "Open" }] : [], suggestions: (r.related || []).map((x) => x.title).slice(0, 3) };
      else escalate = true;
    } catch { /* l'assistante locale prend le relais */ }
    if (!reply) {
      const r = answer(clean, lang, { topic: topicRef.current });
      topicRef.current = r.topic;
      reply = { text: r.text, links: r.links, suggestions: r.suggestions, cta: r.cta };
    }
    await new Promise((res) => setTimeout(res, Math.min(700, 250 + reply.text.length)));
    if (!alive.current) return;
    setTyping(false);
    setMessages((m) => [...m, { id: nextId(), from: "bot", escalate, ...reply }]);
  }

  function vote(m, helpful) {
    if (!m.entryId || voted[m.id] != null) return;
    setVoted((v) => ({ ...v, [m.id]: helpful }));
    api.assistant.feedback(m.entryId, helpful).catch(() => {});
    if (!helpful) setMessages((x) => [...x, { id: nextId(), from: "bot", text: fr ? "Merci pour le retour, je note. Voulez-vous parler à un agent ?" : "Thanks for the feedback. Would you like to talk to an agent?", agentOffer: true }]);
  }

  const first = displayName(user).split(" ")[0];
  const menu = dict.menu;
  const last = messages[messages.length - 1];

  return (
    <>
      <motion.button onClick={() => setOpen((v) => !v)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
        className="fixed bottom-5 right-5 z-[190] w-14 h-14 rounded-full bg-ink-fixed text-cream-fixed shadow-xl flex items-center justify-center"
        aria-label={open ? (fr ? "Fermer l'assistante" : "Close assistant") : (fr ? "Ouvrir l'assistante" : "Open assistant")} aria-expanded={open}>
        <AnimatePresence mode="wait" initial={false}>
          {open ? <motion.span key="x" initial={{ rotate: -80, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 80, opacity: 0 }} transition={{ duration: 0.15 }}><X size={22} /></motion.span>
            : <motion.span key="c" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} transition={{ duration: 0.15 }}><MessageCircle size={22} /></motion.span>}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.section role="dialog" aria-label={fr ? "Assistante H-Company" : "H-Company assistant"}
            initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 14, scale: 0.97 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed z-[190] inset-0 sm:inset-auto sm:bottom-24 sm:right-5 sm:w-[390px] sm:h-[600px] sm:max-h-[calc(100vh-7rem)] bg-surface sm:rounded-3xl shadow-2xl sm:border border-line overflow-hidden flex flex-col">
            <header className="relative shrink-0 text-cream-fixed px-5 pt-5 pb-4 flex items-center gap-3" style={{ background: "linear-gradient(135deg,#3B2417,#10140F)" }}>
              <span className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"><Logo size={26} /></span>
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-tight">{agentMode ? (fr ? "Équipe H-Company" : "H-Company team") : "Avila"}</p>
                <p className="text-xs text-cream-fixed/65 truncate">{typing ? dict.typing : agentMode ? (fr ? "Conversation avec un agent" : "Chatting with an agent") : (fr ? "Assistante · elle apprend de nos équipes" : "Assistant · learns from our team")}</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label={fr ? "Fermer" : "Close"} className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center"><X size={18} /></button>
            </header>

            {tab === "chat" && agentMode && <SupportChat onBack={() => setAgentMode(false)} onNavigate={() => setOpen(false)} />}

            {tab === "home" && (
              <div className="flex-1 overflow-y-auto bg-cream/60 p-4 space-y-4">
                <div className="px-1 pt-1"><h2 className="font-display text-2xl text-ink">{fr ? "Bonjour" : "Hello"}{first ? ` ${first}` : ""} 👋</h2><p className="text-sm text-ink-soft mt-0.5">{fr ? "Comment pouvons-nous vous aider ?" : "How can we help?"}</p></div>
                <button onClick={() => { setTab("chat"); setTimeout(() => inputRef.current?.focus(), 150); }} className="w-full flex items-center justify-between rounded-2xl bg-surface border border-line p-4 text-left hover:border-coffee/50 transition-colors">
                  <span><span className="block font-medium text-ink">{fr ? "Envoyer un message" : "Send us a message"}</span><span className="text-xs text-ink-soft">{fr ? "Réponse immédiate de l'assistante" : "Instant answer from the assistant"}</span></span>
                  <span className="w-9 h-9 rounded-full bg-ink text-cream flex items-center justify-center"><Send size={15} /></span>
                </button>
                <button onClick={() => { setTab("chat"); setAgentMode(true); }} className="w-full flex items-center justify-between rounded-2xl bg-surface border border-line p-4 text-left hover:border-coffee/50 transition-colors">
                  <span><span className="block font-medium text-ink">{fr ? "Parler à un agent" : "Talk to an agent"}</span><span className="text-xs text-ink-soft">{fr ? "Une personne de l'équipe vous répond" : "A team member replies"}</span></span>
                  <span className="w-9 h-9 rounded-full bg-latte-soft text-coffee-dark flex items-center justify-center"><UserRound size={16} /></span>
                </button>
                <div className="rounded-2xl bg-surface border border-line overflow-hidden">
                  <p className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-[0.16em] text-ink-faint">{fr ? "Questions fréquentes" : "Popular questions"}</p>
                  {menu.slice(0, 5).map((it) => <button key={it.key} onClick={() => ask(it.q || it.label)} className="w-full flex items-center justify-between px-4 py-3 text-sm text-ink hover:bg-latte-soft/50 border-t border-line first:border-t-0 text-left">{it.label}<ChevronRight size={15} className="text-ink-faint" /></button>)}
                </div>
              </div>
            )}

            {tab === "help" && (
              <div className="flex-1 overflow-y-auto bg-cream/60 p-4">
                <h2 className="font-display text-xl text-ink px-1">{fr ? "Centre d'aide" : "Help center"}</h2>
                <div className="mt-3 rounded-2xl bg-surface border border-line overflow-hidden">
                  {menu.map((it) => <button key={it.key} onClick={() => ask(it.q || it.label)} className="w-full flex items-center justify-between px-4 py-3.5 text-sm text-ink hover:bg-latte-soft/50 border-t border-line first:border-t-0 text-left">{it.label}<ChevronRight size={15} className="text-ink-faint" /></button>)}
                </div>
              </div>
            )}

            {tab === "chat" && !agentMode && (
              <>
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-cream/60" aria-live="polite">
                  {messages.map((m) => (
                    <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className={`flex items-end gap-2 max-w-[90%] ${m.from === "user" ? "ml-auto flex-row-reverse" : ""}`}>
                      {m.from === "bot" && <span className="w-7 h-7 rounded-full bg-ink-fixed flex items-center justify-center shrink-0"><Logo size={18} /></span>}
                      <div className="min-w-0">
                        <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line break-words ${m.from === "user" ? "bg-coffee text-cream-fixed rounded-br-md" : "bg-surface border border-line text-ink rounded-bl-md"}`}>{m.text}</div>
                        {m.links?.length > 0 && <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">{m.links.map((l) => <Link key={l.to + l.label} to={l.to} onClick={() => setOpen(false)} className="inline-flex items-center gap-1 text-xs font-medium text-coffee-dark hover:underline">{l.label} <ArrowRight size={12} /></Link>)}</div>}
                        {m.entryId && (
                          <div className="mt-1.5 flex items-center gap-1 text-ink-faint">
                            <span className="text-[11px] mr-1">{fr ? "Utile ?" : "Helpful?"}</span>
                            {[[true, ThumbsUp, fr ? "Utile" : "Helpful"], [false, ThumbsDown, fr ? "Pas utile" : "Not helpful"]].map(([v, Ic, l]) => (
                              <button key={String(v)} onClick={() => vote(m, v)} disabled={voted[m.id] != null} aria-label={l} aria-pressed={voted[m.id] === v} className={`w-7 h-7 rounded-full flex items-center justify-center hover:bg-latte-soft disabled:cursor-default ${voted[m.id] === v ? "bg-latte-soft text-coffee-dark" : ""}`}><Ic size={13} /></button>
                            ))}
                          </div>
                        )}
                        {(m.escalate || m.agentOffer) && <button onClick={() => setAgentMode(true)} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-coffee-dark hover:bg-latte-soft"><UserRound size={12} />{fr ? "Parler à un agent" : "Talk to an agent"}</button>}
                        {m.suggestions?.length > 0 && m.id === last.id && !typing && <div className="mt-2 flex flex-wrap gap-1.5">{m.suggestions.map((sg) => <button key={sg} onClick={() => ask(sg)} className="text-xs text-coffee-dark bg-surface border border-line hover:bg-latte-soft rounded-full px-3 py-1.5 text-left">{sg}</button>)}</div>}
                      </div>
                    </motion.div>
                  ))}
                  {typing && <div className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-surface border border-line w-fit ml-9">{[0, 1, 2].map((i) => <motion.span key={i} className="w-1.5 h-1.5 rounded-full bg-coffee-light" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />)}</div>}
                </div>
                <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="border-t border-line p-3 flex items-center gap-2 shrink-0 bg-surface">
                  <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder={dict.inputPlaceholder} maxLength={500} aria-label={dict.inputPlaceholder} className="flex-1 text-sm px-4 py-2.5 rounded-full border border-line outline-none focus:border-coffee-light bg-cream text-ink placeholder:text-ink-faint" />
                  <button type="submit" disabled={!input.trim() || typing} aria-label={fr ? "Envoyer" : "Send"} className="w-10 h-10 rounded-full bg-ink text-cream flex items-center justify-center shrink-0 hover:bg-coffee-dark disabled:opacity-40"><Send size={15} /></button>
                </form>
              </>
            )}

            <nav aria-label="Assistant" className="shrink-0 grid grid-cols-3 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
              {TABS.map(([k, Ic, f, e]) => (
                <button key={k} onClick={() => { setTab(k); if (k !== "chat") setAgentMode(false); }} aria-current={tab === k ? "page" : undefined} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${tab === k ? "text-ink font-semibold" : "text-ink-soft hover:text-ink"}`}><Ic size={18} strokeWidth={tab === k ? 2.2 : 1.7} />{fr ? f : e}</button>
              ))}
            </nav>
            <p className="sr-only"><Sparkles size={10} />{fr ? "Assistante automatique H-Company, sans IA externe." : "Automated H-Company assistant, no external AI."}</p>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
