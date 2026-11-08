import { BedDouble, Bus, GraduationCap, Languages, Mountain, Package, ShoppingBag, UtensilsCrossed, Wallet } from "lucide-react";

/** Les applications H-Company : une tuile de marque (dégradé + pictogramme) par service. */
export const H_APPS = [
  { key: "logement", to: "/app/logement", Icon: BedDouble, from: "#C89A3D", to2: "#8A5A1E", cat: "travel", fr: "H-Logement", en: "H-Stays", dFr: "Maisons et appartements sur la carte, visite 3D.", dEn: "Homes and apartments on the map, 3D tours." },
  { key: "transport", to: "/app/transport", Icon: Bus, from: "#3B82A0", to2: "#1D4E6B", cat: "travel", fr: "H-Transport", en: "H-Transport", dFr: "Réservez votre bus, choisissez votre siège.", dEn: "Book your bus, pick your seat." },
  { key: "colis", to: "/app/colis", Icon: Package, from: "#D9703B", to2: "#9A3F14", cat: "travel", fr: "H-Colis", en: "H-Parcels", dFr: "Envoyez un colis avec suivi en direct.", dEn: "Send a parcel with live tracking." },
  { key: "tourisme", to: "/tourisme", Icon: Mountain, from: "#4E9A6B", to2: "#256B45", cat: "travel", fr: "H-Tourisme", en: "H-Tourism", dFr: "Excursions et expériences locales.", dEn: "Tours and local experiences." },
  { key: "shopping", to: "/shopping", Icon: ShoppingBag, from: "#B84C7A", to2: "#7C2650", cat: "life", fr: "H-Shopping", en: "H-Shopping", dFr: "Boutiques et produits livrés chez vous.", dEn: "Shops and products delivered to you." },
  { key: "restaurant", to: "/restaurant", Icon: UtensilsCrossed, from: "#C24B3A", to2: "#8A2418", cat: "life", fr: "H-Restaurant", en: "H-Restaurant", dFr: "Réservez une table, commandez.", dEn: "Book a table, order food." },
  { key: "learning", to: "/formations", Icon: GraduationCap, from: "#6A5ACD", to2: "#3F2F94", cat: "learn", fr: "H-Learning", en: "H-Learning", dFr: "Formations vidéo et cours en présentiel.", dEn: "Video courses and in-person classes." },
  { key: "translate", to: "/interpretation", Icon: Languages, from: "#2F9E9A", to2: "#136A66", cat: "learn", fr: "H-Translate", en: "H-Translate", dFr: "Interprètes et traduction à la demande.", dEn: "Interpreters and translation on demand." },
];
export const MONEY_APP = { key: "money", to: "/app/money", Icon: Wallet, from: "#4A2C1A", to2: "#10140F", fr: "H-Money", en: "H-Money" };

/** Tuile logo d'une application. */
export function AppLogo({ app, size = 44, className = "" }) {
  const { Icon } = app;
  return (
    <span className={`inline-flex items-center justify-center rounded-[22%] text-white shrink-0 shadow-sm ${className}`}
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${app.from}, ${app.to2})` }} aria-hidden="true">
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.8} />
    </span>
  );
}
