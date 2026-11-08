import { useLanguage } from "../context/LanguageContext.jsx";

export const CARGO_UI = {
  fr: {
    title: "Colis & fret", lead: "Envoyez vos marchandises par canter, fuso ou camion, avec départs programmés et suivi jusqu'à la livraison.",
    from: "Départ", to: "Arrivée", kind: "Véhicule", allKinds: "Tous", minKg: "Poids (kg)", search: "Rechercher",
    results: (n) => `${n} départ${n > 1 ? "s" : ""} disponible${n > 1 ? "s" : ""}`, none: "Aucun départ pour ces critères", noneHint: "Essayez une autre date ou un autre véhicule.",
    perKg: "par kg", kgLeft: "kg libres", departs: "Départ", arrives: "Arrivée prévue", book: "Envoyer un colis", closed: "Réservations fermées",
    track: "Suivre un colis", trackHint: "Saisissez la référence reçue (HC-XXXXXX).", trackBtn: "Suivre", notFound: "Référence introuvable.",
    kinds: { van: "Fourgonnette", canter: "Canter", fuso: "Fuso", truck: "Camion", trailer: "Semi-remorque" },
    cats: { general: "Général", fragile: "Fragile", food: "Alimentaire", electronics: "Électronique", documents: "Documents", construction: "Construction" },
    cap: (kg, m3) => `${kg} kg · ${m3} m³`, cold: "Réfrigéré",
    form: { title: "Détails du colis", weight: "Poids (kg)", desc: "Contenu", category: "Catégorie", receiver: "Destinataire", receiverName: "Nom du destinataire", receiverPhone: "Téléphone du destinataire", total: "Total à payer", pay: "Payer et réserver", errW: (m) => `Minimum ${m} kg.`, errDesc: "Décrivez le contenu (3 caractères minimum).", errRecv: "Nom et téléphone du destinataire requis.", errNum: "Numéro de paiement incomplet.", full: "Pas assez de place sur ce départ.", escrow: "Paiement conservé en séquestre jusqu'à la livraison confirmée.", free: (h) => `Annulation gratuite jusqu'à ${h} h avant le départ.` },
    mine: { title: "Mes colis", empty: "Aucun colis", emptyHint: "Vos envois apparaîtront ici.", code: "Code de livraison", codeHint: "À donner au destinataire : il le communique au chauffeur à la remise.", cancel: "Annuler l'envoi", confirmCancel: "Annuler cet envoi ?", cancelled: "Envoi annulé", ref: "Référence", receiver: "Destinataire", weight: "Poids", where: "Position", timeline: "Suivi" },
    status: { pending_payment: "Paiement en cours", confirmed: "Confirmé", in_transit: "En route", delivered: "Livré", expired: "Expiré", cancelled_user: "Annulé", cancelled_operator: "Annulé par l'agence", scheduled: "Programmé", loading: "Chargement", cancelled: "Annulé" },
    op: {
      vehicles: "Véhicules", trips: "Départs colis", addVehicle: "Ajouter un véhicule", addTrip: "Programmer un départ", name: "Nom", plate: "Plaque", capKg: "Capacité (kg)", capM3: "Volume (m³)", refrigerated: "Réfrigéré", save: "Enregistrer", saved: "Enregistré",
      vehicle: "Véhicule", origin: "Origine", destination: "Destination", dep: "Départ", arr: "Arrivée", pricePerKg: "Prix par kg", minKg: "Minimum (kg)", notes: "Notes", booked: (a, b) => `${a} / ${b} kg réservés`, bookings: "Colis", noBookings: "Aucun colis pour ce départ.",
      toLoading: "Passer en chargement", toTransit: "Départ en route", toDelivered: "Terminer", cancelTrip: "Annuler le départ", location: "Position actuelle", note: "Note", update: "Mettre à jour",
      deliver: "Livraison", deliverHint: "Saisissez le code donné par le destinataire.", deliverBtn: "Confirmer la remise", delivered: "Remise confirmée", emptyV: "Aucun véhicule", emptyT: "Aucun départ", confirm: "Confirmer ?", revenue: "Revenus", upcoming: (n) => `${n} à venir`,
    },
  },
  en: {
    title: "Cargo & freight", lead: "Send goods by canter, fuso or truck, with scheduled departures and tracking until delivery.",
    from: "From", to: "To", kind: "Vehicle", allKinds: "All", minKg: "Weight (kg)", search: "Search",
    results: (n) => `${n} departure${n > 1 ? "s" : ""} available`, none: "No departure for these criteria", noneHint: "Try another vehicle or route.",
    perKg: "per kg", kgLeft: "kg free", departs: "Departs", arrives: "Estimated arrival", book: "Send a parcel", closed: "Bookings closed",
    track: "Track a parcel", trackHint: "Enter the reference you received (HC-XXXXXX).", trackBtn: "Track", notFound: "Reference not found.",
    kinds: { van: "Van", canter: "Canter", fuso: "Fuso", truck: "Truck", trailer: "Semi-trailer" },
    cats: { general: "General", fragile: "Fragile", food: "Food", electronics: "Electronics", documents: "Documents", construction: "Construction" },
    cap: (kg, m3) => `${kg} kg · ${m3} m³`, cold: "Refrigerated",
    form: { title: "Parcel details", weight: "Weight (kg)", desc: "Contents", category: "Category", receiver: "Receiver", receiverName: "Receiver's name", receiverPhone: "Receiver's phone", total: "Total to pay", pay: "Pay and book", errW: (m) => `Minimum ${m} kg.`, errDesc: "Describe the contents (3 characters minimum).", errRecv: "Receiver name and phone required.", errNum: "Payment number incomplete.", full: "Not enough room on this departure.", escrow: "Payment is held in escrow until delivery is confirmed.", free: (h) => `Free cancellation up to ${h} h before departure.` },
    mine: { title: "My parcels", empty: "No parcels", emptyHint: "Your shipments will appear here.", code: "Delivery code", codeHint: "Give it to the receiver: they hand it to the driver on delivery.", cancel: "Cancel shipment", confirmCancel: "Cancel this shipment?", cancelled: "Shipment cancelled", ref: "Reference", receiver: "Receiver", weight: "Weight", where: "Location", timeline: "Tracking" },
    status: { pending_payment: "Payment pending", confirmed: "Confirmed", in_transit: "In transit", delivered: "Delivered", expired: "Expired", cancelled_user: "Cancelled", cancelled_operator: "Cancelled by operator", scheduled: "Scheduled", loading: "Loading", cancelled: "Cancelled" },
    op: {
      vehicles: "Vehicles", trips: "Cargo departures", addVehicle: "Add a vehicle", addTrip: "Schedule a departure", name: "Name", plate: "Plate", capKg: "Capacity (kg)", capM3: "Volume (m³)", refrigerated: "Refrigerated", save: "Save", saved: "Saved",
      vehicle: "Vehicle", origin: "Origin", destination: "Destination", dep: "Departure", arr: "Arrival", pricePerKg: "Price per kg", minKg: "Minimum (kg)", notes: "Notes", booked: (a, b) => `${a} / ${b} kg booked`, bookings: "Parcels", noBookings: "No parcels on this departure.",
      toLoading: "Start loading", toTransit: "Depart (in transit)", toDelivered: "Complete", cancelTrip: "Cancel departure", location: "Current location", note: "Note", update: "Update",
      deliver: "Delivery", deliverHint: "Enter the code given by the receiver.", deliverBtn: "Confirm handover", delivered: "Handover confirmed", emptyV: "No vehicle", emptyT: "No departure", confirm: "Confirm?", revenue: "Revenue", upcoming: (n) => `${n} upcoming`,
    },
  },
};
export function useCargoUi() {
  const { lang } = useLanguage();
  return CARGO_UI[lang] || CARGO_UI.fr;
}
