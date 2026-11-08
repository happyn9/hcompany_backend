import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LayoutDashboard, Lightbulb, Mail, MailCheck, MessageSquareText } from "lucide-react";
import Reveal from "../ui/Reveal.jsx";
import ContactModal from "./ContactModal.jsx";

const STEPS = [
  { Icon: MessageSquareText, t: "1. Parlez-nous de votre entreprise", d: "Un message suffit : qui vous êtes, ce que vous proposez, où." },
  { Icon: MailCheck, t: "2. Vous recevez un lien par e-mail", d: "Un lien personnel vers l'unique formulaire de partenariat (identité et activité)." },
  { Icon: LayoutDashboard, t: "3. Vous gérez tout depuis un dashboard", d: "Code partenaire + mot de passe (ou QR code) : apps, articles, promotions, inventaire et revenus au même endroit." },
];

/** Remplace l'ancien formulaire sur la page d'accueil : le partenariat s'ouvre par lien envoyé par e-mail ;
 * le formulaire de contact sert uniquement à entrer en relation (il ne débloque rien). */
export default function PartnerInfo() {
  const [open, setOpen] = useState(false);
  return (
    <section id="rejoindre" className="px-6 py-24 border-t border-line bg-surface">
      <div className="max-w-content mx-auto">
        <Reveal>
          <p className="text-sm font-medium text-coffee mb-4">Devenir partenaire</p>
          <h2 className="font-display text-3xl sm:text-4xl leading-tight text-ink max-w-xl">Parlez-nous de votre entreprise</h2>
          <p className="mt-5 text-stone leading-relaxed max-w-xl">Hébergement, transport, boutique, restaurant, tourisme, formation : un seul partenariat, un seul dashboard, jusqu'à 2 apps en plan Standard et davantage en Pro.</p>
        </Reveal>
        <div className="mt-10 grid md:grid-cols-3 gap-5">
          {STEPS.map(({ Icon, t, d }, i) => (
            <Reveal key={t} delay={i * 0.08}>
              <div className="h-full rounded-2xl border border-line bg-cream p-6">
                <span className="w-10 h-10 rounded-xl bg-latte-soft text-coffee-dark flex items-center justify-center mb-4"><Icon size={18} strokeWidth={1.7} /></span>
                <p className="font-medium text-ink mb-1">{t}</p>
                <p className="text-sm text-ink-soft leading-relaxed">{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-6 py-3.5 hover:bg-coffee-dark transition-colors"><Mail size={15} />Nous écrire<ArrowRight size={15} /></button>
          <Link to="/connexion" state={{ mode: "partner", redirectTo: "/dashboard" }} className="inline-flex items-center gap-2 rounded-full border border-line text-ink text-sm font-medium px-6 py-3.5 hover:border-coffee-light transition-colors"><LayoutDashboard size={15} />Déjà partenaire ? Mon dashboard</Link>
        </div>
        <Reveal delay={0.1}>
          <div className="mt-10 rounded-2xl bg-latte-soft p-6 flex gap-4 items-start max-w-2xl">
            <Lightbulb size={20} className="text-coffee-dark shrink-0 mt-0.5" />
            <p className="text-sm text-coffee-dark leading-relaxed"><strong>Un projet, pas encore d'entreprise ?</strong> Écrivez-nous aussi. Nous aidons les jeunes à réaliser leur projet : présentez votre idée, convainquez-nous, nous vous répondons.</p>
          </div>
        </Reveal>
      </div>
      {open && <ContactModal onClose={() => setOpen(false)} context="Partenariat / projet (page d'accueil)" />}
    </section>
  );
}
