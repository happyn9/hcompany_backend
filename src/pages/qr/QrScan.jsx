import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Loader2, Monitor, ScanLine, ShieldCheck, XCircle } from "lucide-react";
import { api } from "../../lib/api.js";
import { useUser } from "../../context/Usercontext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { usePageMeta } from "../../components/ui/HeadManager.jsx";

const T = {
  fr: { title: "Scanner un code", signIn: "Connectez-vous d'abord sur ce téléphone pour autoriser une connexion.", signInCta: "Se connecter", lead: "Pointez la caméra vers le QR code affiché sur l'ordinateur.", noCam: "Caméra indisponible : collez le code ci-dessous.", manual: "Code ou lien", go: "Continuer", confirm: "Autoriser cette connexion ?", device: "Appareil", as: "Vous serez connecté en tant que", approve: "Autoriser", cancel: "Annuler", done: "C'est fait : l'ordinateur est connecté.", rejected: "Connexion annulée.", warn: "N'autorisez que si vous venez d'afficher ce code vous-même.", again: "Scanner un autre code", invalid: "Code non reconnu.", start: "Activer la caméra" },
  en: { title: "Scan a code", signIn: "Sign in on this phone first to authorise a sign-in.", signInCta: "Sign in", lead: "Point the camera at the QR code shown on the computer.", noCam: "Camera unavailable: paste the code below.", manual: "Code or link", go: "Continue", confirm: "Authorise this sign-in?", device: "Device", as: "You'll be signed in as", approve: "Authorise", cancel: "Cancel", done: "Done: the computer is signed in.", rejected: "Sign-in cancelled.", warn: "Only authorise if you just displayed this code yourself.", again: "Scan another code", invalid: "Unrecognised code.", start: "Turn on camera" },
};

export function extractCode(text) {
  const s = String(text || "").trim();
  const m = s.match(/\/qr\/([A-Za-z0-9_-]{8,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{16,}$/.test(s) ? s : "";
}

function Scanner({ onCode, t }) {
  const video = useRef(null);
  const [err, setErr] = useState("");
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return undefined;
    let stream; let stop = false; let timer;
    (async () => {
      if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) { setErr(t.noCam); return; }
      try {
        const det = new window.BarcodeDetector({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (video.current) { video.current.srcObject = stream; await video.current.play(); }
        const loop = async () => {
          if (stop) return;
          try {
            const found = await det.detect(video.current);
            const code = found.length ? extractCode(found[0].rawValue) : "";
            if (code) { onCode(code); return; }
          } catch { /* image pas prête */ }
          timer = setTimeout(loop, 250);
        };
        loop();
      } catch { setErr(t.noCam); }
    })();
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach((x) => x.stop()); };
  }, [on, onCode, t]);
  return (
    <div className="w-full">
      {on && !err ? (
        <div className="relative aspect-square w-full max-w-sm mx-auto rounded-3xl overflow-hidden bg-ink-fixed">
          <video ref={video} muted playsInline className="w-full h-full object-cover" />
          <div className="absolute inset-8 border-2 border-cream-fixed/80 rounded-2xl pointer-events-none" />
        </div>
      ) : (
        <button onClick={() => { setErr(""); setOn(true); }} className="w-full max-w-sm mx-auto flex flex-col items-center gap-3 rounded-3xl border border-dashed border-line py-12 text-ink-soft hover:border-coffee-light">
          <ScanLine size={32} /><span className="text-sm font-medium text-ink">{t.start}</span>
        </button>
      )}
      {err && <p className="text-xs text-ink-faint text-center mt-3">{err}</p>}
    </div>
  );
}

export default function QrScan() {
  const { lang } = useLanguage();
  const t = T[lang] || T.fr;
  const { code: routeCode } = useParams();
  const { token, withAuth, isAuthenticated, isLoading, user } = useUser();
  const navigate = useNavigate();
  const [code, setCode] = useState(routeCode || "");
  const [manual, setManual] = useState("");
  const [info, setInfo] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | loading | confirm | done | cancelled
  const [error, setError] = useState("");
  usePageMeta({ title: t.title });

  const load = useCallback(async (c) => {
    setError(""); setPhase("loading"); setCode(c);
    try { setInfo(await withAuth((tk) => api.qr.info(tk, c))); setPhase("confirm"); }
    catch (e) { setError(e?.message || t.invalid); setPhase("idle"); }
  }, [withAuth, t]);

  useEffect(() => { if (routeCode && isAuthenticated && phase === "idle" && !error) load(routeCode); }, [routeCode, isAuthenticated]); // eslint-disable-line

  async function approve() {
    setPhase("loading");
    try { await withAuth((tk) => api.qr.approve(tk, code)); setPhase("done"); }
    catch (e) { setError(e?.message || ""); setPhase("idle"); }
  }

  if (isLoading) return <main className="min-h-screen bg-cream flex items-center justify-center"><Loader2 className="animate-spin" /></main>;
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-cream px-5 flex items-center justify-center">
        <div className="max-w-sm text-center space-y-5">
          <ShieldCheck className="mx-auto text-coffee" size={36} />
          <p className="text-ink">{t.signIn}</p>
          <Link to="/connexion" state={{ redirectTo: routeCode ? `/qr/${routeCode}` : "/scanner" }} className="inline-block rounded-full bg-ink text-cream text-sm font-medium px-7 py-3">{t.signInCta}</Link>
        </div>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-cream px-5 py-10">
      <div className="max-w-md mx-auto">
        <Link to="/dashboard" className="font-display text-lg text-ink">H-Company</Link>
        <h1 className="font-display text-3xl text-ink mt-6 mb-2">{t.title}</h1>
        {phase === "confirm" && info && (
          <div className="mt-6 rounded-3xl bg-surface border border-line p-6 space-y-5">
            <p className="font-display text-xl text-ink">{t.confirm}</p>
            <div className="flex items-center gap-3 rounded-2xl bg-latte-soft p-4 text-sm">
              <Monitor className="text-coffee shrink-0" />
              <div className="min-w-0"><p className="text-ink-faint text-xs">{t.device}</p><p className="text-ink font-medium truncate">{info.device_label}</p></div>
            </div>
            <p className="text-sm text-ink-soft">{t.as} <b className="text-ink">{info.user?.email || user?.email}</b></p>
            <p className="text-xs text-ink-faint">{t.warn}</p>
            <div className="flex gap-3">
              <button onClick={approve} className="flex-1 rounded-full bg-ink text-cream text-sm font-medium py-3">{t.approve}</button>
              <button onClick={() => { setPhase("cancelled"); }} className="flex-1 rounded-full border border-line text-ink text-sm py-3">{t.cancel}</button>
            </div>
          </div>
        )}
        {phase === "done" && (
          <div className="mt-8 text-center space-y-5"><CheckCircle2 className="mx-auto text-emerald-600" size={44} /><p className="text-ink">{t.done}</p><button onClick={() => navigate("/dashboard")} className="rounded-full bg-ink text-cream text-sm px-7 py-3">OK</button></div>
        )}
        {phase === "cancelled" && (
          <div className="mt-8 text-center space-y-5"><XCircle className="mx-auto text-ink-faint" size={44} /><p className="text-ink">{t.rejected}</p><button onClick={() => { setPhase("idle"); setError(""); }} className="rounded-full border border-line text-sm px-7 py-3">{t.again}</button></div>
        )}
        {(phase === "idle" || phase === "loading") && (
          <div className="mt-4 space-y-6">
            <p className="text-ink-soft text-sm">{t.lead}</p>
            <Scanner onCode={load} t={t} />
            <form onSubmit={(e) => { e.preventDefault(); const c = extractCode(manual); c ? load(c) : setError(t.invalid); }} className="space-y-2">
              <label htmlFor="qrm" className="text-xs text-ink-faint">{t.manual}</label>
              <div className="flex gap-2">
                <input id="qrm" value={manual} onChange={(e) => setManual(e.target.value)} className="flex-1 min-w-0 rounded-xl border border-line bg-surface px-4 py-3 text-sm" />
                <button disabled={phase === "loading"} className="rounded-xl bg-ink text-cream text-sm px-5 disabled:opacity-50">{phase === "loading" ? <Loader2 size={16} className="animate-spin" /> : t.go}</button>
              </div>
            </form>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          </div>
        )}
      </div>
    </main>
  );
}
