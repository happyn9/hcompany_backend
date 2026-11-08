import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, RefreshCw, Smartphone, CheckCircle2, ScanLine } from "lucide-react";
import QrCode from "../../components/qr/QrCode.jsx";
import { api } from "../../lib/api.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const T = {
  fr: { title: "Connexion par QR code", lead: "Connectez-vous sur ordinateur en scannant ce code avec l'application H-Company (Rafiki) ou avec votre téléphone déjà connecté.", steps: ["Ouvrez H-Company sur votre téléphone, déjà connecté.", "Allez dans Compte › Scanner un code (ou ouvrez /scanner dans le navigateur du téléphone).", "Scannez ce code et confirmez : cette page se connecte toute seule."], expired: "Code expiré", refresh: "Actualiser le code", ok: "Connecté — redirection…", err: "Impossible de contacter le serveur.", other: "Se connecter avec e-mail", session: "Session de 8 heures, comme WhatsApp Web.", left: (s) => `Expire dans ${s} s` },
  en: { title: "QR code sign-in", lead: "Sign in on your computer by scanning this code with the H-Company app (Rafiki) or with your already signed-in phone.", steps: ["Open H-Company on your phone, already signed in.", "Go to Account › Scan a code (or open /scanner in the phone's browser).", "Scan this code and confirm: this page signs in by itself."], expired: "Code expired", refresh: "Refresh code", ok: "Signed in — redirecting…", err: "Can't reach the server.", other: "Sign in with e-mail", session: "8-hour session, like WhatsApp Web.", left: (s) => `Expires in ${s}s` },
};

function deviceLabel() {
  const ua = navigator.userAgent;
  const b = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navigateur";
  const o = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /Linux/.test(ua) ? "Linux" : "";
  return o ? `${b} · ${o}` : b;
}

export default function QrLogin() {
  const { lang } = useLanguage();
  const t = T[lang] || T.fr;
  const { adoptSession } = useUser();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | expired | done | error
  const [left, setLeft] = useState(0);
  const alive = useRef(true);
  usePageMeta({ title: t.title });

  const start = useCallback(async () => {
    setState("loading");
    try {
      const s = await api.qr.start(deviceLabel());
      if (!alive.current) return;
      setSession({ ...s, at: Date.now() });
      setLeft(s.ttl_seconds);
      setState("ready");
    } catch { if (alive.current) setState("error"); }
  }, []);

  useEffect(() => { alive.current = true; start(); return () => { alive.current = false; }; }, [start]);

  useEffect(() => {
    if (state !== "ready" || !session) return undefined;
    const tick = setInterval(() => setLeft(Math.max(0, Math.round(session.ttl_seconds - (Date.now() - session.at) / 1000))), 500);
    const poll = setInterval(async () => {
      try {
        const r = await api.qr.poll(session.code, session.secret);
        if (!alive.current) return;
        if (r.status === "expired") setState("expired");
        else if (r.status === "approved") { setState("done"); adoptSession(r); setTimeout(() => navigate("/dashboard", { replace: true }), 700); }
      } catch { /* on réessaie au prochain tour */ }
    }, 2000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [state, session, adoptSession, navigate]);

  const url = session ? `${window.location.origin}/qr/${session.code}` : "";
  return (
    <main className="min-h-screen bg-cream px-5 py-10 flex items-center justify-center">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8 md:gap-14 items-center rounded-3xl bg-surface border border-line p-6 sm:p-10">
        <div>
          <Link to="/" className="font-display text-lg text-ink">H-Company</Link>
          <h1 className="font-display text-3xl sm:text-4xl text-ink mt-6 mb-3 leading-tight">{t.title}</h1>
          <p className="text-ink-soft leading-relaxed mb-6">{t.lead}</p>
          <ol className="space-y-3 mb-8">
            {t.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm text-ink">
                <span className="w-6 h-6 shrink-0 rounded-full bg-ink text-cream text-xs flex items-center justify-center font-medium">{i + 1}</span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-ink-faint mb-5">{t.session}</p>
          <Link to="/connexion" className="text-sm text-coffee-dark underline underline-offset-4">{t.other}</Link>
        </div>
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className={state === "ready" ? "" : "opacity-20 blur-[2px] pointer-events-none"}>
              <QrCode value={url || "h-company"} size={260} label={t.title} />
            </div>
            {state !== "ready" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                {state === "loading" && <Loader2 className="animate-spin text-ink" />}
                {state === "done" && (<><CheckCircle2 className="text-emerald-600" size={36} /><p className="text-sm font-medium text-ink">{t.ok}</p></>)}
                {(state === "expired" || state === "error") && (
                  <>
                    <p className="text-sm font-medium text-ink">{state === "error" ? t.err : t.expired}</p>
                    <button onClick={start} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm px-5 py-2.5"><RefreshCw size={15} />{t.refresh}</button>
                  </>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-ink-faint flex items-center gap-2" aria-live="polite">
            <Smartphone size={14} />{state === "ready" ? t.left(left) : " "}
          </p>
        </div>
      </div>
    </main>
  );
}
