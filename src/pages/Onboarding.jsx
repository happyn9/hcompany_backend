import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, FileText, Handshake, Loader2, Sparkles, User, Building2 } from "lucide-react";
import { api } from "../lib/api.js";
import { useUser } from "../context/Usercontext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { homeFor } from "../lib/home.js";
import { CITY_COORDS } from "../lib/cities.js";
import { AppLogo, H_APPS, MONEY_APP } from "../components/app/AppLogos.jsx";
import Logo from "../components/ui/Logo.jsx";

const INVOICE_APP = { key: "invoice", Icon: FileText, from: "#2F6B3F", to2: "#14391F" };
const SERVICES = [
  { key: "money", app: MONEY_APP, fr: "H-Money", en: "H-Money", dFr: "Envoyer, demander, changer, facturer", dEn: "Send, request, exchange, invoice" },
  { key: "invoice", app: INVOICE_APP, fr: "Facture", en: "Invoice", dFr: "Se faire payer en mobile money", dEn: "Get paid by mobile money" },
  ...["logement", "transport", "colis", "shopping", "restaurant", "tourisme", "learning", "translate"].map((k) => {
    const a = H_APPS.find((x) => x.key === k);
    return { key: k, app: a, fr: a.fr, en: a.en, dFr: a.dFr, dEn: a.dEn };
  }),
];
const COUNTRIES = [["ZM", "Zambie", "Zambia", "+260"], ["CD", "RD Congo", "DR Congo", "+243"], ["ZA", "Afrique du Sud", "South Africa", "+27"], ["ZW", "Zimbabwe", "Zimbabwe", "+263"], ["TZ", "Tanzanie", "Tanzania", "+255"], ["KE", "Kenya", "Kenya", "+254"], ["AO", "Angola", "Angola", "+244"], ["FR", "France", "France", "+33"], ["XX", "Autre", "Other", ""]];
const PURPOSES = [["send_money", "Envoyer ou recevoir de l'argent", "Send or receive money"], ["invoice", "Facturer mes clients", "Invoice my customers"], ["stay", "Trouver ou louer un logement", "Find or rent a stay"], ["travel", "Voyager (bus, colis)", "Travel (bus, parcels)"], ["shop", "Acheter en ligne", "Shop online"], ["learn", "Me former", "Learn"], ["sell", "Vendre / proposer mes services", "Sell / offer my services"]];
const REFERRALS = [["Recherche en ligne", "Online search"], ["Recommandation", "Recommendation"], ["Réseaux sociaux", "Social media"], ["Autre", "Other"]];
const input = "w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink focus:outline-none focus:border-coffee";

const Chip = ({ on, onClick, children }) => (
  <button type="button" onClick={onClick} aria-pressed={on} className={`rounded-2xl border px-4 py-3 text-sm text-left transition-colors ${on ? "border-ink bg-ink text-cream" : "border-line bg-surface text-ink hover:border-coffee-light"}`}>{children}</button>
);

export default function Onboarding() {
  const { lang } = useLanguage();
  const fr = lang !== "en";
  const { withAuth, user } = useUser();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [a, setA] = useState({ account_type: "", company_name: "", country: "ZM", city: "", dial: "+260", phone: "", language: fr ? "fr" : "en", interests: [], purposes: [], referral_source: "", wants_partner: false });
  const [res, setRes] = useState(null), [saving, setSaving] = useState(false), [err, setErr] = useState("");
  const set = (k, v) => setA((p) => ({ ...p, [k]: v }));
  const toggle = (k, v) => setA((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] }));
  const TOTAL = 5; // 0 vitrine · 1 profil · 2 lieu & contact · 3 services · 4 objectifs
  const finish = () => navigate(homeFor(user), { state: { justOnboarded: true } });
  useEffect(() => { document.title = fr ? "Bienvenue — H-Company" : "Welcome — H-Company"; }, [fr]);

  const valid = useMemo(() => {
    if (step === 1) return a.account_type && (a.account_type !== "business" || a.company_name.trim().length >= 2);
    if (step === 2) return a.country && a.city.trim().length >= 2;
    return true;
  }, [step, a]);

  async function submit() {
    setSaving(true); setErr("");
    const digits = a.phone.replace(/\D/g, "");
    const body = {
      account_type: a.account_type || undefined, company_name: a.account_type === "business" ? a.company_name : undefined, country: a.country === "XX" ? undefined : a.country, city: a.city,
      phone: digits ? `${a.dial}${digits.replace(/^0+/, "")}` : undefined, language: a.language, interests: a.interests, purposes: a.purposes, referral_source: a.referral_source || undefined,
      wants_partner: a.wants_partner || a.purposes.includes("sell"),
    };
    try { setRes(await withAuth((t) => api.onboarding.submit(t, body))); setStep(TOTAL); }
    catch (e) { setErr(e?.message || (fr ? "Enregistrement impossible, réessayez." : "Couldn't save, please retry.")); }
    finally { setSaving(false); }
  }
  const next = () => (step === TOTAL - 1 ? submit() : setStep((s) => s + 1));
  const pickCountry = (code) => { const c = COUNTRIES.find((x) => x[0] === code); setA((p) => ({ ...p, country: code, dial: c?.[3] || p.dial })); };

  const title = [fr ? "Tout H-Company, dans une seule app" : "All of H-Company in one app", fr ? "Qui êtes-vous ?" : "Who are you?", fr ? "Où êtes-vous ?" : "Where are you?", fr ? "Qu'est-ce qui vous intéresse ?" : "What are you interested in?", fr ? "Pourquoi venez-vous ?" : "What brings you here?"][step];

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center px-5 py-10 sm:py-14">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-7"><Logo /><button onClick={finish} className="text-xs text-ink-soft hover:text-ink">{fr ? "Passer" : "Skip"}</button></div>
        {step < TOTAL && <div className="flex gap-1.5 mb-8">{Array.from({ length: TOTAL }, (_, i) => <div key={i} className="h-1 flex-1 rounded-full bg-line overflow-hidden"><motion.div className="h-full bg-coffee" initial={false} animate={{ width: i <= step ? "100%" : "0%" }} transition={{ duration: 0.35 }} /></div>)}</div>}
        <AnimatePresence mode="wait">
          {step < TOTAL ? (
            <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.3 }}>
              <h1 className="font-display text-2xl sm:text-3xl text-ink leading-snug mb-2">{title}</h1>
              {step === 0 && <>
                <p className="text-sm text-ink-soft mb-6">{fr ? "Envoyez de l'argent, facturez, logez-vous, voyagez, achetez, apprenez. Un seul compte, un seul portefeuille. Quelques questions pour personnaliser votre espace (1 minute)." : "Send money, invoice, find a stay, travel, shop, learn. One account, one wallet. A few questions to personalise your space (1 minute)."}</p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">{SERVICES.map((s) => <div key={s.key} className="rounded-2xl border border-line bg-surface p-3 text-center"><AppLogo app={s.app} size={48} className="mx-auto" /><p className="text-xs font-medium text-ink mt-2">{fr ? s.fr : s.en}</p></div>)}</div>
              </>}
              {step === 1 && <div className="mt-6 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <Chip on={a.account_type === "individual"} onClick={() => set("account_type", "individual")}><User size={18} className="mb-2" />{fr ? "Particulier" : "Individual"}</Chip>
                  <Chip on={a.account_type === "business"} onClick={() => set("account_type", "business")}><Building2 size={18} className="mb-2" />{fr ? "Entreprise / commerce" : "Business / shop"}</Chip>
                </div>
                {a.account_type === "business" && <label className="block"><span className="text-xs text-ink-soft">{fr ? "Nom de l'entreprise" : "Company name"}</span><input className={input} value={a.company_name} maxLength={120} onChange={(e) => set("company_name", e.target.value)} autoFocus /></label>}
              </div>}
              {step === 2 && <div className="mt-6 space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <label className="block"><span className="text-xs text-ink-soft">{fr ? "Pays" : "Country"}</span><select className={input} value={a.country} onChange={(e) => pickCountry(e.target.value)}>{COUNTRIES.map((c) => <option key={c[0]} value={c[0]}>{fr ? c[1] : c[2]}</option>)}</select></label>
                  <label className="block"><span className="text-xs text-ink-soft">{fr ? "Ville" : "City"}</span><input list="ob-cities" className={input} value={a.city} onChange={(e) => set("city", e.target.value)} maxLength={80} /><datalist id="ob-cities">{Object.keys(CITY_COORDS).map((c) => <option key={c} value={c} />)}</datalist></label>
                </div>
                <label className="block"><span className="text-xs text-ink-soft">{fr ? "Téléphone (facultatif)" : "Phone (optional)"}</span>
                  <span className="flex gap-2"><input aria-label={fr ? "Indicatif" : "Dial code"} className={`${input} !w-24`} value={a.dial} onChange={(e) => set("dial", e.target.value.replace(/[^+\d]/g, "").slice(0, 5))} /><input type="tel" inputMode="tel" className={input} value={a.phone} onChange={(e) => set("phone", e.target.value)} maxLength={16} /></span></label>
                <div><span className="text-xs text-ink-soft">{fr ? "Langue" : "Language"}</span><div className="grid grid-cols-2 gap-3 mt-1"><Chip on={a.language === "fr"} onClick={() => set("language", "fr")}>Français</Chip><Chip on={a.language === "en"} onClick={() => set("language", "en")}>English</Chip></div></div>
              </div>}
              {step === 3 && <div className="mt-6"><p className="text-sm text-ink-soft mb-4">{fr ? "Choisissez autant de services que vous voulez." : "Pick as many services as you like."}</p><div className="grid sm:grid-cols-2 gap-3">{SERVICES.map((s) => <button type="button" key={s.key} onClick={() => toggle("interests", s.key)} aria-pressed={a.interests.includes(s.key)} className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${a.interests.includes(s.key) ? "border-ink bg-latte-soft" : "border-line bg-surface hover:border-coffee-light"}`}><AppLogo app={s.app} size={40} /><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-ink">{fr ? s.fr : s.en}</span><span className="block text-xs text-ink-soft truncate">{fr ? s.dFr : s.dEn}</span></span>{a.interests.includes(s.key) && <Check size={16} className="text-coffee-dark shrink-0" />}</button>)}</div></div>}
              {step === 4 && <div className="mt-6 space-y-6">
                <div className="grid sm:grid-cols-2 gap-3">{PURPOSES.map(([k, f, e]) => <Chip key={k} on={a.purposes.includes(k)} onClick={() => toggle("purposes", k)}>{fr ? f : e}</Chip>)}</div>
                <label className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 cursor-pointer"><input type="checkbox" className="w-4 h-4" checked={a.wants_partner} onChange={(e) => set("wants_partner", e.target.checked)} /><span className="text-sm"><Handshake size={15} className="inline mr-1.5 text-coffee-dark" />{fr ? "Je veux devenir partenaire (proposer mes services sur H-Company)" : "I want to become a partner (offer my services on H-Company)"}</span></label>
                <div><span className="text-xs text-ink-soft">{fr ? "Comment nous avez-vous connus ?" : "How did you hear about us?"}</span><div className="grid grid-cols-2 gap-3 mt-1">{REFERRALS.map(([v, e]) => <Chip key={v} on={a.referral_source === v} onClick={() => set("referral_source", a.referral_source === v ? "" : v)}>{fr ? v : e}</Chip>)}</div></div>
              </div>}
              {err && <p role="alert" className="mt-5 rounded-xl bg-red-500/10 text-red-700 text-sm p-3">{err}</p>}
              <div className="mt-8 flex items-center justify-between">
                <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="inline-flex items-center gap-1.5 text-sm text-ink-soft disabled:opacity-0"><ArrowLeft size={15} />{fr ? "Retour" : "Back"}</button>
                <button type="button" onClick={next} disabled={!valid || saving} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-7 py-3.5 hover:bg-coffee-dark disabled:opacity-40">{saving ? <Loader2 size={15} className="animate-spin" /> : null}{step === 0 ? (fr ? "Commencer" : "Start") : step === TOTAL - 1 ? (fr ? "Terminer" : "Finish") : (fr ? "Continuer" : "Continue")}<ArrowRight size={15} /></button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="py-4">
              <div className="text-center"><span className="w-16 h-16 rounded-2xl bg-[#C89A3D]/15 flex items-center justify-center text-coffee-dark mx-auto mb-5"><Sparkles size={26} /></span>
                <h1 className="font-display text-2xl text-ink mb-2">{fr ? "Votre espace est prêt" : "Your space is ready"}</h1>
                <p className="text-sm text-ink-soft max-w-sm mx-auto mb-7">{fr ? "Voici par où commencer, selon ce que vous nous avez dit." : "Here's where to start, based on what you told us."}</p></div>
              <div className="space-y-3">{(res?.suggestions || []).map((s) => <Link key={s.cta_href} to={s.cta_href} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 hover:border-coffee-light"><span className="min-w-0 flex-1"><span className="block font-medium text-ink">{s.title}</span><span className="block text-sm text-ink-soft">{s.description}</span></span><span className="text-xs font-medium text-coffee-dark whitespace-nowrap">{s.cta_label} →</span></Link>)}</div>
              <div className="text-center mt-8"><button onClick={finish} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-7 py-3.5 hover:bg-coffee-dark">{fr ? "Aller à mon espace" : "Go to my space"}<ArrowRight size={15} /></button></div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
