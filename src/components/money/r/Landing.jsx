import { useEffect, useState } from "react";
import { ChevronRight, FileText, HandCoins, History, Repeat2, Send, X } from "lucide-react";
import { api } from "../../../lib/api.js";
import { FLAG } from "../parts.jsx";
import { IlloGift, IlloRates, IlloSafe, IlloTrack, NAVY, SoonChips, btnOutline } from "./ui.jsx";

function Feature({ Illo, title, text }) {
  return <div className="text-center"><div className="flex justify-center"><Illo /></div><h3 className="font-bold text-lg text-ink mt-3">{title}</h3><p className="text-sm text-ink-soft mt-1 max-w-[280px] mx-auto">{text}</p></div>;
}

/** Page d'accueil H-Money : trois promesses à gauche, offre + taux à droite, puis raccourcis et contacts récents. */
export default function Landing({ onStart, recent = [], onContact, dueCount = 0, compact = false }) {
  const [rate, setRate] = useState(null);
  const [promo, setPromo] = useState(true);
  useEffect(() => { api.money.change(1, "USD", "ZMW").then((r) => setRate(r.rate)).catch(() => setRate(null)); }, []);
  const tiles = [["send", "Envoyer", Send], ["request", "Demander", HandCoins], ["invoice", "Facture", FileText], ["change", "Échanger", Repeat2], ...(compact ? [] : [["history", "Historique", History]])];
  return (
    <div>
      {dueCount > 0 && <button onClick={() => onStart("invoice", "pay")} className="w-full mb-6 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 px-4 py-3 text-sm text-left font-medium">Vous avez {dueCount} facture{dueCount > 1 ? "s" : ""} à régler — voir et payer →</button>}
      <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
        <div className="space-y-9 order-2 lg:order-1">
          <Feature Illo={IlloRates} title="Taux affichés d'avance" text="Le montant exact reçu et les frais sont visibles avant de payer. Aucune surprise." />
          <Feature Illo={IlloTrack} title="Suivez votre transfert" text="Des mises à jour du début à la fin, par mobile money, entre la Zambie et la RD Congo." />
          <Feature Illo={IlloSafe} title="Sûr et sécurisé" text="Vos informations restent confidentielles et vos fonds sont protégés jusqu'au contrôle." />
          <div className="text-center"><button onClick={() => onStart("send")} className={btnOutline} style={{ borderColor: NAVY, color: NAVY }}>Commencer</button></div>
        </div>
        <div className="space-y-8 order-1 lg:order-2">
          {promo && (
            <div className="relative rounded-xl border border-line bg-surface overflow-hidden flex">
              <div className="w-[110px] sm:w-[150px] shrink-0"><IlloGift /></div>
              <div className="p-4 pr-10 flex-1 min-w-0">
                <p className="font-bold text-ink leading-snug">Votre premier envoi H-Money</p>
                <p className="text-xs text-ink-soft mt-1">Taux et frais affichés avant de payer.</p>
                <button onClick={() => onStart("send")} className="mt-3 rounded-full border-2 font-bold text-sm px-4 h-10" style={{ borderColor: NAVY, color: NAVY }}>Envoyer maintenant</button>
              </div>
              <button onClick={() => setPromo(false)} aria-label="Fermer" className="absolute top-3 right-3 text-ink-soft hover:text-ink"><X size={18} /></button>
            </div>
          )}
          <div>
            <h2 className="font-bold text-2xl text-ink mb-3">Taux de change</h2>
            <div className="rounded-xl border border-line bg-surface p-5">
              <p className="font-bold text-ink flex items-center gap-3"><span className="text-2xl">🇺🇸</span>{rate ? `1 USD = ${rate.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ZMW` : "1 USD = …"}<span className="text-2xl">{FLAG.ZM}</span></p>
              <button onClick={() => onStart("send")} className="mt-5 w-full rounded-full text-white font-bold h-12" style={{ background: NAVY }}>Envoyer de l'argent</button>
              <div className="mt-4"><SoonChips /></div>
            </div>
          </div>
        </div>
      </div>
      <div className={`mt-10 grid gap-3 ${compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-5"}`}>
        {tiles.map(([k, l, Ic]) => (
          <button key={k} onClick={() => onStart(k)} className="rounded-xl border border-line bg-surface p-4 text-left hover:border-[#32465E] transition-colors"><span className="w-10 h-10 rounded-full flex items-center justify-center text-white" style={{ background: NAVY }}><Ic size={18} /></span><p className="font-bold text-ink mt-3">{l}{k === "change" && <span className="ml-2 text-[10px] font-semibold rounded-full bg-latte-soft text-coffee-dark px-2 py-0.5 align-middle">Bientôt</span>}</p></button>
        ))}
      </div>
      {!compact && recent.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center justify-between mb-2"><h2 className="font-bold text-xl text-ink">Contacts récents</h2><button onClick={() => onStart("history")} className="font-bold text-sm" style={{ color: NAVY }}>Tout voir</button></div>
          <ul>{recent.map((c) => (
            <li key={c.key}><button onClick={() => onContact(c)} className="w-full flex items-center gap-4 py-3 text-left">
              <span className="relative w-14 h-14 rounded-full bg-latte-soft flex items-center justify-center font-bold text-ink">{c.initials}<span className="absolute -bottom-0.5 -right-0.5 text-sm">{FLAG[c.to]}</span></span>
              <span className="flex-1 text-ink">{c.name}</span><ChevronRight size={18} className="text-ink-soft" />
            </button></li>))}
          </ul>
        </div>
      )}
    </div>
  );
}
