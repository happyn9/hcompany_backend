import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bus, BedDouble, UtensilsCrossed, Mountain, ShoppingBag, GraduationCap, Search, Check, ShieldCheck, Box, Bell, Star } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext.jsx";

/**
 * Démonstration animée de 15 s en boucle (pas un fichier vidéo) : le même
 * parcours en quatre étapes, déroulé tour à tour sur les six services du
 * réseau — Transport, Logement, Restaurant, Tourisme, Shopping, Learning.
 * Chaque service dispose de 2,5 s ; tout est piloté par une seule horloge,
 * donc l'image est toujours cohérente (pas de minuteurs concurrents).
 * Les montants et noms sont des exemples illustratifs.
 */
const DURATION = 15;
const SLOT = DURATION / 6;
const GOLD = "#C89A3D";

const SVC = [
  {
    key: "transport", Icon: Bus,
    fr: {
      label: "Transport", q: "Bus Lusaka → Lubumbashi", partner: "Lukondo", role: "Agence de transport",
      results: [["Lukondo · départ 06:00", "Bus climatisé · 28 places", "K 850"], ["Lukondo · départ 14:30", "Bus standard · 12 places", "K 720"], ["Colis Lusaka → Kolwezi", "Suivi par code", "K 95"]],
      ask: ["Départ", "Samedi 06:00"], lines: [["Trajet", "Lusaka → Lubumbashi"], ["Places", "2 adultes"], ["Billet", "QR à l'embarquement"]], total: "K 1 700",
      track: ["Réservation reçue", "Billet QR émis", "Embarquement validé", "Arrivé"],
    },
    en: {
      label: "Transport", q: "Bus Lusaka → Lubumbashi", partner: "Lukondo", role: "Transport agency",
      results: [["Lukondo · departs 06:00", "Air-con bus · 28 seats", "K 850"], ["Lukondo · departs 14:30", "Standard bus · 12 seats", "K 720"], ["Parcel Lusaka → Kolwezi", "Code tracking", "K 95"]],
      ask: ["Departure", "Saturday 06:00"], lines: [["Route", "Lusaka → Lubumbashi"], ["Seats", "2 adults"], ["Ticket", "QR at boarding"]], total: "K 1,700",
      track: ["Booking received", "QR ticket issued", "Boarding validated", "Arrived"],
    },
  },
  {
    key: "logement", Icon: BedDouble, threeD: true,
    fr: {
      label: "Logement", q: "Appartement à Lusaka", partner: "Hôte vérifié", role: "Logement H-Logement",
      results: [["Appartement 2 chambres · Kabulonga", "Visite 3D immersive", "K 640 / nuit"], ["Studio meublé · Woodlands", "Visite 3D immersive", "K 380 / nuit"], ["Maison avec jardin · Roma", "Visite 3D immersive", "K 910 / nuit"]],
      ask: ["Séjour", "3 nuits"], lines: [["Logement", "Appartement · Kabulonga"], ["Dates", "3 nuits"], ["Paiement", "Sous séquestre"]], total: "K 1 920",
      track: ["Demande envoyée", "Hôte confirme", "Séjour en cours", "Avis laissé"],
    },
    en: {
      label: "Lodging", q: "Apartment in Lusaka", partner: "Verified host", role: "H-Lodging host",
      results: [["2-bedroom apartment · Kabulonga", "Immersive 3D tour", "K 640 / night"], ["Furnished studio · Woodlands", "Immersive 3D tour", "K 380 / night"], ["House with garden · Roma", "Immersive 3D tour", "K 910 / night"]],
      ask: ["Stay", "3 nights"], lines: [["Place", "Apartment · Kabulonga"], ["Dates", "3 nights"], ["Payment", "Held in escrow"]], total: "K 1,920",
      track: ["Request sent", "Host confirms", "Stay in progress", "Review left"],
    },
  },
  {
    key: "restaurant", Icon: UtensilsCrossed, threeD: true,
    fr: {
      label: "Restaurant", q: "Table pour 4 ce soir", partner: "Confismila", role: "Restaurant partenaire",
      results: [["Salle principale · Table T3", "6 couverts · plan 3D", "Libre 19:00"], ["Terrasse · Table T5", "4 couverts · plan 3D", "Libre 19:30"], ["Salon privé · Table T8", "8 couverts · plan 3D", "Libre 20:00"]],
      ask: ["Table", "T3 · 19:00"], lines: [["Table", "T3 · salle principale"], ["Couverts", "4 personnes"], ["Pré-commande", "Menu du jour"]], total: "Table réservée",
      track: ["Demande reçue", "Table confirmée", "Client installé", "Merci !"],
    },
    en: {
      label: "Restaurant", q: "Table for 4 tonight", partner: "Confismila", role: "Partner restaurant",
      results: [["Main room · Table T3", "6 covers · 3D floor plan", "Free 19:00"], ["Terrace · Table T5", "4 covers · 3D floor plan", "Free 19:30"], ["Private lounge · Table T8", "8 covers · 3D floor plan", "Free 20:00"]],
      ask: ["Table", "T3 · 19:00"], lines: [["Table", "T3 · main room"], ["Guests", "4 people"], ["Pre-order", "Set menu"]], total: "Table booked",
      track: ["Request received", "Table confirmed", "Guests seated", "Thank you!"],
    },
  },
  {
    key: "tourisme", Icon: Mountain,
    fr: {
      label: "Tourisme", q: "Chutes Victoria", partner: "Opérateur local", role: "Excursion H-Tourisme",
      results: [["Chutes Victoria au lever du soleil", "4 h · guide francophone", "K 300"], ["Croisière au coucher du soleil", "2 h · repas inclus", "K 420"], ["Safari à la journée", "9 h · 6 places", "K 1 150"]],
      ask: ["Départ", "Dim. 08:00"], lines: [["Excursion", "Chutes Victoria"], ["Voyageurs", "2 adultes · 1 enfant"], ["Départ", "Dimanche 08:00"]], total: "K 750",
      track: ["Réservation envoyée", "Opérateur confirme", "Départ au point de RDV", "Avis publié"],
    },
    en: {
      label: "Tourism", q: "Victoria Falls", partner: "Local operator", role: "H-Tourism tour",
      results: [["Victoria Falls at sunrise", "4 h · French-speaking guide", "K 300"], ["Sunset river cruise", "2 h · meal included", "K 420"], ["Full-day safari", "9 h · 6 seats", "K 1,150"]],
      ask: ["Departure", "Sun. 08:00"], lines: [["Tour", "Victoria Falls"], ["Travellers", "2 adults · 1 child"], ["Departure", "Sunday 08:00"]], total: "K 750",
      track: ["Booking sent", "Operator confirms", "Meeting at the point", "Review posted"],
    },
  },
  {
    key: "shopping", Icon: ShoppingBag, threeD: true,
    fr: {
      label: "Shopping", q: "Sac en cuir", partner: "Boutique partenaire", role: "Vendeur H-Shopping",
      results: [["Sac en cuir artisanal", "Aperçu produit en 3D", "K 480"], ["Sac bandoulière noir", "Aperçu produit en 3D", "K 360"], ["Pochette en cuir", "Aperçu produit en 3D", "K 190"]],
      ask: ["Quantité", "1 article"], lines: [["Article", "Sac en cuir artisanal"], ["Livraison", "Retrait en boutique"], ["Paiement", "Portefeuille H"]], total: "K 480",
      track: ["Commande reçue", "Préparée par la boutique", "Prête / expédiée", "Livrée"],
    },
    en: {
      label: "Shopping", q: "Leather bag", partner: "Partner shop", role: "H-Shopping seller",
      results: [["Handmade leather bag", "3D product preview", "K 480"], ["Black shoulder bag", "3D product preview", "K 360"], ["Leather pouch", "3D product preview", "K 190"]],
      ask: ["Quantity", "1 item"], lines: [["Item", "Handmade leather bag"], ["Delivery", "Shop pickup"], ["Payment", "H wallet"]], total: "K 480",
      track: ["Order received", "Prepared by the shop", "Ready / shipped", "Delivered"],
    },
  },
  {
    key: "learning", Icon: GraduationCap,
    fr: {
      label: "Learning", q: "Développement mobile", partner: "H-Learning", role: "Formation en ligne",
      results: [["Développement mobile avec Flutter", "Intermédiaire · vidéos + quiz", "Inclus"], ["Introduction à la cybersécurité", "Débutant · certificat", "Inclus"], ["Bouquet équipe", "Plusieurs membres", "Sur devis"]],
      ask: ["Formule", "Bouquet individuel"], lines: [["Formation", "Flutter · niveau 2"], ["Accès", "Compte personnel"], ["Certificat", "À la réussite"]], total: "Accès ouvert",
      track: ["Inscription validée", "Cours en cours", "Quiz réussi", "Certificat délivré"],
    },
    en: {
      label: "Learning", q: "Mobile development", partner: "H-Learning", role: "Online training",
      results: [["Mobile development with Flutter", "Intermediate · videos + quizzes", "Included"], ["Introduction to cybersecurity", "Beginner · certificate", "Included"], ["Team plan", "Several members", "Quote"]],
      ask: ["Plan", "Individual plan"], lines: [["Course", "Flutter · level 2"], ["Access", "Personal account"], ["Certificate", "On completion"]], total: "Access open",
      track: ["Enrolment confirmed", "Course in progress", "Quiz passed", "Certificate issued"],
    },
  },
];

const L = {
  fr: { requestSent: "Demande transmise avec tous les détails", matched: "Mis en relation", verified: "Partenaire vérifié", summary: "Récapitulatif", confirm: "Confirmer", confirmed: "Confirmé", secure: "Paiement et données protégés", notif: "Notification envoyée au client", example: "Exemple illustratif", sent: "Demande" },
  en: { requestSent: "Request sent with all details", matched: "Matched", verified: "Verified partner", summary: "Summary", confirm: "Confirm", confirmed: "Confirmed", secure: "Payment and data protected", notif: "Notification sent to the customer", example: "Illustrative example", sent: "Request" },
};

function Chrome({ children }) {
  const { lang } = useLanguage();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setElapsed(((Date.now() - start) / 1000) % DURATION), 80);
    return () => clearInterval(timer);
  }, []);
  const idx = Math.min(5, Math.floor(elapsed / SLOT));
  const local = (elapsed - idx * SLOT) / SLOT; // 0 → 1 dans le service courant
  const ss = String(Math.floor(elapsed)).padStart(2, "0");
  return (
    <div className="relative w-full h-full">
      {children({ idx, local })}
      <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: "inset 0 0 90px 20px rgba(0,0,0,0.3)" }} />
      <div className="absolute top-4 inset-x-0 flex items-center justify-center gap-1.5 pointer-events-none">
        <motion.span className="w-1.5 h-1.5 rounded-full" style={{ background: GOLD }} animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.6, repeat: Infinity }} />
        <span className="text-[0.6rem] font-medium tracking-wider text-white/55 uppercase">H-Company</span>
      </div>
      <div className="absolute bottom-0 inset-x-0 px-4 pb-3 pt-8 bg-gradient-to-t from-black/60 to-transparent">
        <div className="flex gap-1 mb-2" aria-hidden="true">
          {SVC.map((s, i) => (
            <div key={s.key} className="h-1 flex-1 rounded-full bg-white/20 overflow-hidden">
              <div className="h-full" style={{ background: GOLD, width: i < idx ? "100%" : i === idx ? `${local * 100}%` : "0%" }} />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-[0.65rem] text-white/70 font-mono">
          <span>0:{ss}</span>
          <span className="text-white/45">{L[lang === "en" ? "en" : "fr"].example}</span>
          <span>0:{DURATION}</span>
        </div>
      </div>
    </div>
  );
}

function Pill({ svc, text }) {
  const { Icon } = svc;
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[0.68rem] text-white/85">
      <Icon size={12} style={{ color: GOLD }} />{text}
    </div>
  );
}

const Frame = ({ children, k }) => (
  <motion.div key={k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="w-full max-w-[330px]">
    {children}
  </motion.div>
);

function SearchStep({ idx, local, lang }) {
  const s = SVC[idx], d = s[lang];
  const chars = Math.min(d.q.length, Math.floor((local / 0.34) * d.q.length));
  const showResults = local > 0.4;
  return (
    <Frame k={idx}>
      <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3.5 py-2.5 mb-3 ring-1 ring-white/10">
        <Search size={14} style={{ color: GOLD }} />
        <span className="text-sm text-white font-mono truncate">{d.q.slice(0, chars)}<span className="opacity-70">|</span></span>
      </div>
      <div className="flex gap-1.5 mb-3 overflow-hidden">
        {SVC.map((x, i) => (
          <span key={x.key} className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg ${i === idx ? "text-black" : "bg-white/[0.07] text-white/55"}`} style={i === idx ? { background: GOLD } : undefined} title={x[lang].label}>
            <x.Icon size={14} />
          </span>
        ))}
      </div>
      <div className="space-y-2 min-h-[150px]">
        {showResults && d.results.map(([title, meta, price], i) => (
          <motion.div key={title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }} className="flex items-center gap-3 rounded-xl bg-white/[0.07] px-3 py-2.5">
            <span className="shrink-0 w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center"><s.Icon size={15} style={{ color: GOLD }} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.78rem] text-white/90 truncate leading-tight">{title}</p>
              <p className="text-[0.65rem] text-white/50 truncate flex items-center gap-1">{s.threeD && <Box size={10} style={{ color: GOLD }} />}{meta}</p>
            </div>
            <span className="text-[0.72rem] text-white/85 font-medium whitespace-nowrap">{price}</span>
          </motion.div>
        ))}
      </div>
    </Frame>
  );
}

function MatchStep({ idx, local, lang }) {
  const s = SVC[idx], d = s[lang], t = L[lang];
  const arrived = local > 0.45;
  return (
    <Frame k={idx}>
      <div className="flex justify-center mb-4"><Pill svc={s} text={d.label} /></div>
      <div className="flex items-center justify-between gap-2 mb-5">
        <div className="flex flex-col items-center gap-1.5 w-16">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-white font-display">C</div>
          <span className="text-[0.62rem] text-white/55">{lang === "fr" ? "Client" : "Customer"}</span>
        </div>
        <div className="relative flex-1 h-px bg-white/20">
          <div className="absolute -top-1.5 w-3 h-3 rounded-full" style={{ background: GOLD, left: `${Math.min(local / 0.45, 1) * 100}%`, transform: "translateX(-50%)", boxShadow: `0 0 14px ${GOLD}` }} />
        </div>
        <div className="flex flex-col items-center gap-1.5 w-16">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-display" style={{ background: `${GOLD}33`, color: GOLD }}>H</div>
          <span className="text-[0.62rem] text-white/55">H-Company</span>
        </div>
        <div className="relative flex-1 h-px bg-white/20">
          <div className="absolute -top-1.5 w-3 h-3 rounded-full" style={{ background: GOLD, left: `${arrived ? Math.min((local - 0.45) / 0.35, 1) * 100 : 0}%`, transform: "translateX(-50%)", opacity: arrived ? 1 : 0, boxShadow: `0 0 14px ${GOLD}` }} />
        </div>
        <div className="flex flex-col items-center gap-1.5 w-16">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center"><s.Icon size={20} style={{ color: GOLD }} /></div>
          <span className="text-[0.62rem] text-white/55 truncate max-w-full">{d.partner}</span>
        </div>
      </div>
      <div className="rounded-xl bg-white/[0.07] px-3.5 py-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm text-white/90">{d.partner}</p>
          <span className="inline-flex items-center gap-1 text-[0.62rem] text-emerald-300"><ShieldCheck size={12} />{t.verified}</span>
        </div>
        <p className="text-[0.68rem] text-white/50 mb-2">{d.role}</p>
        <p className="text-[0.68rem] text-white/70 flex items-center gap-1.5">
          <Check size={12} style={{ color: GOLD, opacity: local > 0.7 ? 1 : 0.2 }} />{local > 0.7 ? t.matched : t.requestSent}
        </p>
      </div>
    </Frame>
  );
}

function ContractStep({ idx, local, lang }) {
  const s = SVC[idx], d = s[lang], t = L[lang];
  const done = local > 0.72;
  return (
    <Frame k={idx}>
      <div className="flex items-center justify-between mb-3">
        <Pill svc={s} text={d.label} />
        <span className="text-[0.62rem] text-white/45">{t.summary}</span>
      </div>
      <div className="rounded-2xl bg-white/[0.08] p-4 ring-1 ring-white/10">
        {d.lines.map(([k, v], i) => (
          <motion.div key={k} initial={{ opacity: 0, x: -6 }} animate={{ opacity: local > 0.08 + i * 0.1 ? 1 : 0, x: local > 0.08 + i * 0.1 ? 0 : -6 }} className="flex items-center justify-between py-1.5 text-[0.74rem] border-b border-white/[0.07] last:border-0">
            <span className="text-white/50">{k}</span><span className="text-white/90 font-medium text-right">{v}</span>
          </motion.div>
        ))}
        <div className="flex items-center justify-between pt-3 mt-1">
          <span className="text-[0.68rem] text-white/50">Total</span>
          <span className="font-display text-lg text-white">{d.total}</span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="flex-1 inline-flex items-center gap-1.5 text-[0.62rem] text-white/50"><ShieldCheck size={12} />{t.secure}</span>
        <motion.span animate={{ scale: done ? [1, 0.94, 1] : 1 }} className="rounded-full px-4 py-2 text-[0.72rem] font-medium inline-flex items-center gap-1.5" style={done ? { background: "#34D399", color: "#06281D" } : { background: GOLD, color: "#231A0B" }}>
          {done && <Check size={13} />}{done ? t.confirmed : t.confirm}
        </motion.span>
      </div>
    </Frame>
  );
}

function TrackStep({ idx, local, lang }) {
  const s = SVC[idx], d = s[lang], t = L[lang];
  const reached = Math.min(d.track.length, Math.floor(local / 0.22) + 1);
  return (
    <Frame k={idx}>
      <div className="flex items-center justify-between mb-3">
        <Pill svc={s} text={d.partner} />
        <span className="text-[0.62rem] text-white/45">{t.sent}</span>
      </div>
      <div className="rounded-2xl bg-white/[0.07] p-4">
        <div className="relative space-y-3.5">
          <div className="absolute left-[9px] top-2 bottom-2 w-px bg-white/15" />
          {d.track.map((label, i) => {
            const on = i < reached;
            return (
              <div key={label} className="relative flex items-center gap-3">
                <span className="relative z-10 w-[19px] h-[19px] rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: GOLD, background: on ? GOLD : "#1E1A17" }}>
                  {on && <Check size={11} color="#231A0B" strokeWidth={3} />}
                </span>
                <span className={`text-[0.78rem] ${on ? "text-white/90" : "text-white/35"}`}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>
      <AnimatePresence>
        {local > 0.5 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 flex items-center gap-2 rounded-xl bg-white/[0.07] px-3 py-2 text-[0.68rem] text-white/70">
            <Bell size={12} style={{ color: GOLD }} />{t.notif}
            <Star size={11} className="ml-auto" style={{ color: GOLD }} />
          </motion.div>
        )}
      </AnimatePresence>
    </Frame>
  );
}

const VARIANTS = [SearchStep, MatchStep, ContractStep, TrackStep];

export default function StepVideo({ step }) {
  const { lang } = useLanguage();
  const Content = VARIANTS[step] || SearchStep;
  return (
    <Chrome>
      {({ idx, local }) => (
        <div className="w-full h-full flex items-center justify-center px-5 pt-12 pb-16">
          <Content idx={idx} local={local} lang={lang === "en" ? "en" : "fr"} />
        </div>
      )}
    </Chrome>
  );
}
