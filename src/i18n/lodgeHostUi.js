// Textes de l'espace hôte H-Logement (FR/EN).
const fr = {
  start: {
    eyebrow: "Devenir hôte", title: "Mettez votre logement en ligne et accueillez des voyageurs.",
    lead: "Lodge, appartement, maison d'hôtes : créez votre annonce en quelques minutes, fixez vos prix et vos disponibilités, soyez payé en mobile money.",
    benefits: [
      { t: "Paiement garanti", d: "Le voyageur paie avant d'arriver. Les fonds sont sécurisés et versés après son arrivée." },
      { t: "Vous gardez le contrôle", d: "Prix, saisons, dates bloquées, règlement, politique d'annulation : tout est réglable." },
      { t: "Réservation instantanée ou sur demande", d: "Acceptez vous-même chaque demande ou laissez les voyageurs réserver directement." },
      { t: "Retrait mobile money", d: "Zamtel Money, MTN MoMo, Airtel Money : retirez vos gains quand vous voulez." },
    ],
    stepsTitle: "Comment ça marche",
    steps: [{ t: "Créez votre profil hôte", d: "Nom, téléphone, mobile money." }, { t: "Ajoutez votre logement", d: "Photos, description, prix, équipements." }, { t: "Recevez des réservations", d: "Confirmez, accueillez, soyez payé." }],
    formTitle: "Votre profil d'hôte", name: "Nom affiché", nameHint: "Votre nom ou celui de votre établissement.", bio: "Présentez-vous", bioHint: "Quelques lignes pour rassurer les voyageurs.",
    phone: "Téléphone", whatsapp: "WhatsApp", languages: "Langues parlées", operator: "Opérateur mobile money", mmPhone: "Numéro mobile money", mmHint: "Pour recevoir vos retraits. Modifiable plus tard.",
    avatar: "Photo de profil", avatarAdd: "Ajouter une photo", create: "Créer mon profil hôte", signIn: "Connectez-vous pour devenir hôte.", created: "Profil hôte créé !",
    noOperator: "Choisir plus tard",
  },
  tabs: { overview: "Vue d'ensemble", bookings: "Réservations", properties: "Logements", calendar: "Calendrier", earnings: "Revenus", reviews: "Avis", profile: "Profil" },
  title: "Espace hôte", hello: (n) => `Bonjour, ${n}`, newProperty: "Ajouter un logement", viewSite: "Voir ma page publique",
  overview: {
    revenue: "Revenus totaux", month: "Ce mois-ci", occupancy: "Occupation (30 j)", rating: "Note moyenne", pending: "Demandes à traiter", upcoming: "Séjours à venir", inHouse: "Voyageurs sur place", live: "Annonces en ligne",
    todo: "À faire", todoNone: "Rien d'urgent. Tout est à jour.", todoRequests: (n) => `${n} demande${n > 1 ? "s" : ""} de réservation en attente de votre réponse`, todoNoProperty: "Ajoutez votre premier logement pour recevoir des réservations.",
    todoDrafts: (n) => `${n} annonce${n > 1 ? "s" : ""} en brouillon à finaliser`, todoPhone: "Ajoutez votre téléphone dans votre profil : il est exigé pour publier.", seeRequests: "Voir les demandes", complete: "Compléter", recent: "Dernières réservations", noBookings: "Aucune réservation pour l'instant.",
  },
  bookings: {
    filters: { all: "Toutes", pending_host: "À traiter", confirmed: "Confirmées", checked_in: "En cours", completed: "Terminées", cancelled: "Annulées" },
    empty: "Aucune réservation dans cette catégorie.", guest: "Voyageur", stay: "Séjour", amount: "Montant", net: "Votre gain", commission: "Commission", accept: "Accepter", decline: "Refuser", cancel: "Annuler le séjour",
    accepted: "Réservation acceptée.", declined: "Réservation refusée.", cancelled: "Séjour annulé, voyageur remboursé.", respondBefore: (w) => `Répondre avant ${w}`, reason: "Motif (visible par le voyageur)", declineTitle: "Refuser cette demande ?", declineLead: "Le voyageur sera intégralement remboursé.",
    cancelTitle: "Annuler ce séjour ?", cancelLead: "Le voyageur sera intégralement remboursé. Les annulations répétées nuisent à votre visibilité.", confirm: "Confirmer", close: "Fermer", messages: "Messages", noMessages: "Aucun message.", write: "Écrire au voyageur…", send: "Envoyer", details: "Détails", dispute: "Litige ouvert par le voyageur", note: "Note du voyageur", arrival: "Arrivée prévue", escrow: { held: "Fonds sécurisés", released: "Fonds versés", refunded: "Remboursé" }, you: "Vous", guestLabel: "Voyageur",
  },
  properties: {
    empty: "Vous n'avez pas encore de logement", emptyHint: "Créez une annonce : photos, prix, équipements. Vous pouvez enregistrer un brouillon et finir plus tard.", edit: "Modifier", submit: "Publier", submitted: "Annonce envoyée.", pause: "Mettre en pause", resume: "Remettre en ligne", delete: "Supprimer", deleteConfirm: "Supprimer cette annonce définitivement ?", deleted: "Annonce supprimée.", paused: "Annonce mise à jour.", view: "Voir l'annonce",
    stats: (b, p) => `${b} séjour${b > 1 ? "s" : ""} · ${p} demande${p > 1 ? "s" : ""}`, reasonLabel: "Message de l'équipe H-Company",
  },
  editor: {
    newTitle: "Nouveau logement", editTitle: "Modifier le logement", back: "Mes logements", save: "Enregistrer", saveSubmit: "Enregistrer et publier", saved: "Annonce enregistrée.", submitted: "Annonce enregistrée et envoyée.",
    sections: { basics: "L'essentiel", place: "Localisation", capacity: "Capacité", photos: "Photos", amenities: "Équipements", pricing: "Prix et durée", rules: "Règles et annulation" },
    title: "Titre de l'annonce", titleHint: "Ex. Lodge au bord du fleuve avec vue sur les chutes", summary: "Accroche", summaryHint: "Une phrase qui donne envie (240 caractères max).", description: "Description", descriptionHint: "Décrivez le lieu, l'ambiance, le quartier (60 caractères minimum pour publier).", type: "Type de logement",
    country: "Pays", city: "Ville", area: "Quartier / zone", address: "Adresse exacte", addressHint: "Visible uniquement par le voyageur après confirmation.", latitude: "Latitude", longitude: "Longitude", coordsHint: "Facultatif. La carte publique est arrondie pour protéger votre adresse exacte.",
    maxGuests: "Voyageurs max.", bedrooms: "Chambres", beds: "Lits", bathrooms: "Salles de bain", units: "Nombre d'unités identiques", unitsHint: "Ex. 8 chambres identiques d'un hôtel = 8. Un logement unique = 1.",
    photosHint: "3 photos minimum pour publier. La première est la photo de couverture.", addPhotos: "Ajouter des photos", cover: "Couverture", makeCover: "Mettre en couverture", removePhoto: "Retirer", uploading: "Envoi…",
    price: "Prix par nuit", cleaning: "Frais de ménage", weekly: "Remise semaine (7 nuits+, %)", monthly: "Remise mois (28 nuits+, %)", minNights: "Séjour minimum (nuits)", maxNights: "Séjour maximum (nuits)", checkIn: "Arrivée à partir de", checkOut: "Départ avant",
    instant: "Réservation instantanée", instantHint: "Les voyageurs confirment immédiatement. Sinon, vous avez 24 h pour accepter chaque demande.", policy: "Politique d'annulation", rulesLabel: "Règlement intérieur", rulesHint: "Fumeurs, animaux, bruit, horaires…",
    saveFirst: "Enregistrez d'abord l'annonce pour gérer le calendrier et les prix saisonniers depuis l'onglet Calendrier.", checklist: "Avant de publier", ok: { photos: "3 photos minimum", description: "Description d'au moins 60 caractères", phone: "Téléphone ou WhatsApp dans votre profil", price: "Prix par nuit renseigné" },
    loadError: "Logement introuvable.", fixErrors: "Corrigez les champs signalés.",
  },
  calendar: {
    pick: "Logement", none: "Ajoutez d'abord un logement.", blocksTitle: "Dates bloquées", blocksLead: "Bloquez des nuits (travaux, usage personnel, réservation hors site). Le départ le dernier jour reste possible.", from: "Du", to: "Au (départ)", reason: "Motif (facultatif)", block: "Bloquer", blocked: "Dates bloquées.", unblock: "Débloquer", noBlocks: "Aucune date bloquée.",
    rulesTitle: "Prix saisonniers", rulesLead: "Appliquez un autre prix par nuit sur une période (haute saison, fêtes…). Dernier jour inclus.", label: "Nom (ex. Haute saison)", price: "Prix / nuit", add: "Ajouter", added: "Prix saisonnier ajouté.", remove: "Retirer", noRules: "Aucun prix saisonnier.", base: (p) => `Prix de base : ${p}`, range: (a, b) => `${a} → ${b}`,
    upcoming: "Séjours à venir",
  },
  earnings: {
    available: "Disponible", pending: "En séquestre", totalEarned: "Total gagné", paidOut: "Déjà retiré", availableHint: "Retirable maintenant", pendingHint: "Versé après l'arrivée du voyageur",
    withdraw: "Demander un retrait", amount: "Montant", minPayout: (m) => `Minimum ${m}`, send: "Demander", requested: "Demande de retrait envoyée.", history: "Historique des retraits", empty: "Aucun retrait pour l'instant.", needMm: "Ajoutez votre numéro mobile money dans l'onglet Profil pour retirer.", toProfile: "Aller au profil",
    status: { requested: "En attente", paid: "Payé", rejected: "Refusé" }, method: "Vers", note: "Note",
  },
  reviews: { empty: "Aucun avis pour le moment.", reply: "Répondre", replyTitle: "Votre réponse", replyPlaceholder: "Remerciez et répondez avec bienveillance…", send: "Publier la réponse", sent: "Réponse publiée.", yourReply: "Votre réponse", edit: "Modifier ma réponse" },
  profile: { title: "Profil hôte", saved: "Profil enregistré.", verified: "Hôte vérifié par H-Company", notVerified: "Votre profil sera vérifié par l'équipe. Un hôte vérifié publie ses annonces sans attente.", partner: (n) => `Partenaire : ${n}` },
  common: { saving: "Enregistrement…", loading: "Chargement…", error: "Une erreur est survenue.", cancel: "Annuler", nights: (n) => `${n} nuit${n > 1 ? "s" : ""}`, guests: (n) => `${n} voyageur${n > 1 ? "s" : ""}` },
};

const en = {
  start: {
    eyebrow: "Become a host", title: "List your place and welcome travellers.",
    lead: "Lodge, apartment, guesthouse: create your listing in minutes, set your prices and availability, and get paid by mobile money.",
    benefits: [
      { t: "Guaranteed payment", d: "Guests pay before arriving. Funds are secured and released after they arrive." },
      { t: "You stay in control", d: "Prices, seasons, blocked dates, house rules, cancellation policy: all adjustable." },
      { t: "Instant or on-request booking", d: "Approve each request yourself or let guests book directly." },
      { t: "Mobile money payouts", d: "Zamtel Money, MTN MoMo, Airtel Money: withdraw your earnings whenever you like." },
    ],
    stepsTitle: "How it works",
    steps: [{ t: "Create your host profile", d: "Name, phone, mobile money." }, { t: "Add your place", d: "Photos, description, price, amenities." }, { t: "Receive bookings", d: "Confirm, welcome guests, get paid." }],
    formTitle: "Your host profile", name: "Display name", nameHint: "Your name or your business name.", bio: "About you", bioHint: "A few lines to reassure guests.",
    phone: "Phone", whatsapp: "WhatsApp", languages: "Languages spoken", operator: "Mobile money operator", mmPhone: "Mobile money number", mmHint: "To receive your payouts. You can change it later.",
    avatar: "Profile photo", avatarAdd: "Add a photo", create: "Create my host profile", signIn: "Sign in to become a host.", created: "Host profile created!",
    noOperator: "Choose later",
  },
  tabs: { overview: "Overview", bookings: "Bookings", properties: "Properties", calendar: "Calendar", earnings: "Earnings", reviews: "Reviews", profile: "Profile" },
  title: "Host dashboard", hello: (n) => `Hello, ${n}`, newProperty: "Add a property", viewSite: "View my public page",
  overview: {
    revenue: "Total revenue", month: "This month", occupancy: "Occupancy (30 d)", rating: "Average rating", pending: "Requests to answer", upcoming: "Upcoming stays", inHouse: "Guests in house", live: "Live listings",
    todo: "To do", todoNone: "Nothing urgent. You're all caught up.", todoRequests: (n) => `${n} booking request${n > 1 ? "s" : ""} waiting for your answer`, todoNoProperty: "Add your first property to start receiving bookings.",
    todoDrafts: (n) => `${n} draft listing${n > 1 ? "s" : ""} to finish`, todoPhone: "Add your phone number in your profile: it's required to publish.", seeRequests: "See requests", complete: "Complete", recent: "Latest bookings", noBookings: "No bookings yet.",
  },
  bookings: {
    filters: { all: "All", pending_host: "To answer", confirmed: "Confirmed", checked_in: "In progress", completed: "Completed", cancelled: "Cancelled" },
    empty: "No bookings in this category.", guest: "Guest", stay: "Stay", amount: "Amount", net: "Your earnings", commission: "Commission", accept: "Accept", decline: "Decline", cancel: "Cancel stay",
    accepted: "Booking accepted.", declined: "Booking declined.", cancelled: "Stay cancelled, guest refunded.", respondBefore: (w) => `Reply before ${w}`, reason: "Reason (visible to the guest)", declineTitle: "Decline this request?", declineLead: "The guest will be fully refunded.",
    cancelTitle: "Cancel this stay?", cancelLead: "The guest will be fully refunded. Repeated cancellations hurt your visibility.", confirm: "Confirm", close: "Close", messages: "Messages", noMessages: "No messages.", write: "Write to the guest…", send: "Send", details: "Details", dispute: "Dispute opened by the guest", note: "Guest note", arrival: "Expected arrival", escrow: { held: "Funds secured", released: "Funds released", refunded: "Refunded" }, you: "You", guestLabel: "Guest",
  },
  properties: {
    empty: "You don't have a property yet", emptyHint: "Create a listing: photos, price, amenities. You can save a draft and finish later.", edit: "Edit", submit: "Publish", submitted: "Listing submitted.", pause: "Pause", resume: "Put back online", delete: "Delete", deleteConfirm: "Delete this listing permanently?", deleted: "Listing deleted.", paused: "Listing updated.", view: "View listing",
    stats: (b, p) => `${b} stay${b > 1 ? "s" : ""} · ${p} request${p > 1 ? "s" : ""}`, reasonLabel: "Message from the H-Company team",
  },
  editor: {
    newTitle: "New property", editTitle: "Edit property", back: "My properties", save: "Save", saveSubmit: "Save and publish", saved: "Listing saved.", submitted: "Listing saved and submitted.",
    sections: { basics: "The essentials", place: "Location", capacity: "Capacity", photos: "Photos", amenities: "Amenities", pricing: "Pricing and stay length", rules: "Rules and cancellation" },
    title: "Listing title", titleHint: "E.g. Riverside lodge overlooking the falls", summary: "Tagline", summaryHint: "One sentence that makes people want to book (240 characters max).", description: "Description", descriptionHint: "Describe the place, the atmosphere, the area (60 characters minimum to publish).", type: "Property type",
    country: "Country", city: "City", area: "Area / neighbourhood", address: "Exact address", addressHint: "Only visible to the guest after confirmation.", latitude: "Latitude", longitude: "Longitude", coordsHint: "Optional. The public map is rounded to protect your exact address.",
    maxGuests: "Max guests", bedrooms: "Bedrooms", beds: "Beds", bathrooms: "Bathrooms", units: "Number of identical units", unitsHint: "E.g. 8 identical hotel rooms = 8. A single property = 1.",
    photosHint: "3 photos minimum to publish. The first one is the cover photo.", addPhotos: "Add photos", cover: "Cover", makeCover: "Make cover", removePhoto: "Remove", uploading: "Uploading…",
    price: "Price per night", cleaning: "Cleaning fee", weekly: "Weekly discount (7+ nights, %)", monthly: "Monthly discount (28+ nights, %)", minNights: "Minimum stay (nights)", maxNights: "Maximum stay (nights)", checkIn: "Check-in from", checkOut: "Check-out before",
    instant: "Instant booking", instantHint: "Guests are confirmed immediately. Otherwise you have 24 h to accept each request.", policy: "Cancellation policy", rulesLabel: "House rules", rulesHint: "Smoking, pets, noise, quiet hours…",
    saveFirst: "Save the listing first to manage the calendar and seasonal prices from the Calendar tab.", checklist: "Before publishing", ok: { photos: "3 photos minimum", description: "Description of at least 60 characters", phone: "Phone or WhatsApp in your profile", price: "Price per night set" },
    loadError: "Property not found.", fixErrors: "Please fix the highlighted fields.",
  },
  calendar: {
    pick: "Property", none: "Add a property first.", blocksTitle: "Blocked dates", blocksLead: "Block nights (works, personal use, off-site booking). Checking out on the last day stays possible.", from: "From", to: "To (check-out)", reason: "Reason (optional)", block: "Block", blocked: "Dates blocked.", unblock: "Unblock", noBlocks: "No blocked dates.",
    rulesTitle: "Seasonal prices", rulesLead: "Apply a different nightly price over a period (high season, holidays…). Last day included.", label: "Name (e.g. High season)", price: "Price / night", add: "Add", added: "Seasonal price added.", remove: "Remove", noRules: "No seasonal prices.", base: (p) => `Base price: ${p}`, range: (a, b) => `${a} → ${b}`,
    upcoming: "Upcoming stays",
  },
  earnings: {
    available: "Available", pending: "In escrow", totalEarned: "Total earned", paidOut: "Already withdrawn", availableHint: "Withdrawable now", pendingHint: "Released after the guest arrives",
    withdraw: "Request a payout", amount: "Amount", minPayout: (m) => `Minimum ${m}`, send: "Request", requested: "Payout request sent.", history: "Payout history", empty: "No payouts yet.", needMm: "Add your mobile money number in the Profile tab to withdraw.", toProfile: "Go to profile",
    status: { requested: "Pending", paid: "Paid", rejected: "Rejected" }, method: "To", note: "Note",
  },
  reviews: { empty: "No reviews yet.", reply: "Reply", replyTitle: "Your reply", replyPlaceholder: "Thank the guest and reply kindly…", send: "Post reply", sent: "Reply posted.", yourReply: "Your reply", edit: "Edit my reply" },
  profile: { title: "Host profile", saved: "Profile saved.", verified: "Verified by H-Company", notVerified: "Your profile will be reviewed by the team. A verified host publishes listings without waiting.", partner: (n) => `Partner: ${n}` },
  common: { saving: "Saving…", loading: "Loading…", error: "Something went wrong.", cancel: "Cancel", nights: (n) => `${n} night${n > 1 ? "s" : ""}`, guests: (n) => `${n} guest${n > 1 ? "s" : ""}` },
};

export const HOST_UI = { fr, en };
