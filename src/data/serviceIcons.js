// Icônes des pages de service. hServicePages.js nomme chaque icône par une
// simple chaîne ("Route", "Ticket"...) pour rester pur contenu — cette table
// fait le lien avec les vrais composants lucide-react.
import {
  Award, BadgeCheck, BedDouble, BellRing, Building2, CalendarCheck, CalendarClock, ChefHat,
  FileText, Globe, HandCoins, Hash, Headset, Home, Hotel, Landmark, Laptop, ListChecks, Lock,
  MapPin, MapPinned, MessageCircle, Mic, PartyPopper, Route, Send, ShieldCheck, ShoppingBag,
  Sparkles, Store, Ticket, Truck, Users, Wallet, Bus, Package, UtensilsCrossed, GraduationCap,
  Banknote, Languages, PlayCircle, Mountain,
} from "lucide-react";

export const ICONS = {
  Award, BadgeCheck, BedDouble, BellRing, Building2, CalendarCheck, CalendarClock, ChefHat,
  FileText, Globe, HandCoins, Hash, Headset, Home, Hotel, Landmark, Laptop, ListChecks, Lock,
  MapPin, MapPinned, MessageCircle, Mic, PartyPopper, Route, Send, ShieldCheck, ShoppingBag,
  Sparkles, Store, Ticket, Truck, Users, Wallet, Bus, Package, UtensilsCrossed, GraduationCap,
  Banknote, Languages, PlayCircle, Mountain,
};

export function iconFor(name) {
  return ICONS[name] || Sparkles;
}
