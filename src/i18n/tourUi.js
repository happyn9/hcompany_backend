const catFr = { safari: "Safari", waterfall: "Chutes & rivières", culture: "Culture & histoire", adventure: "Aventure", city: "Visite de ville", nature: "Nature", boat: "Bateau & croisière", hiking: "Randonnée", food: "Gastronomie", wellness: "Bien-être" };
const catEn = { safari: "Safari", waterfall: "Falls & rivers", culture: "Culture & history", adventure: "Adventure", city: "City tour", nature: "Nature", boat: "Boat & cruise", hiking: "Hiking", food: "Food", wellness: "Wellness" };
const langFr = { fr: "Français", en: "Anglais", sw: "Swahili", ny: "Nyanja", bem: "Bemba", pt: "Portugais", de: "Allemand", zh: "Chinois" };
const langEn = { fr: "French", en: "English", sw: "Swahili", ny: "Nyanja", bem: "Bemba", pt: "Portuguese", de: "German", zh: "Chinese" };

export const TOUR_UI = {
  fr: {
    cats: catFr, langs: langFr,
    diff: { easy: "Facile", moderate: "Modéré", hard: "Sportif" },
    status: { pending: "En attente", confirmed: "Confirmée", completed: "Terminée", cancelled: "Annulée", declined: "Refusée", no_show: "Absent" },
    tstatus: { draft: "Brouillon", pending: "En validation", active: "En ligne", paused: "En pause", rejected: "Refusée", suspended: "Suspendue" },
    common: { loading: "Chargement…", error: "Une erreur est survenue. Réessayez.", signInRequired: "Connectez-vous pour continuer.", signIn: "Se connecter", createAccount: "Créer un compte", save: "Enregistrer", cancel: "Annuler", delete: "Supprimer", edit: "Modifier", add: "Ajouter", close: "Fermer", saved: "Enregistré", person: "personne", people: "personnes", adults: "Adultes", children: "Enfants", perAdult: "/ adulte", perChild: "/ enfant", from: "dès", hours: "h" },
    bar: { where: "Excursion, ville ou activité…", mine: "Mes réservations", pro: "Espace pro" },
    home: {
      eyebrow: "H-Tourisme", title: "Vivez la Zambie avec des guides locaux.", lead: "Chutes Victoria, safaris, croisières, culture et cuisine : réservez des excursions proposées par des opérateurs vérifiés, avec des places garanties.",
      where: "Où ?", allCities: "Toutes les villes", date: "Date", people: "Voyageurs", search: "Trouver une excursion", featured: "À la une", byCat: "Par type d'expérience", cities: "Par ville",
      empty: "Aucune excursion en ligne pour le moment.", emptyHint: "Revenez bientôt — les premiers opérateurs arrivent.",
      steps: [{ t: "Choisissez", d: "Type d'excursion, ville, date et nombre de voyageurs." }, { t: "Réservez", d: "Voyez les départs et les places restantes, réservez en quelques secondes." }, { t: "Profitez", d: "Votre guide vous attend au point de rendez-vous. Avis après l'excursion." }],
      proTitle: "Vous organisez des excursions ?", proLead: "Publiez vos circuits, ouvrez vos départs et gérez vos réservations — inclus avec votre partenariat H-Company.", proCta: "Ouvrir mon espace pro",
    },
    search: {
      title: "Excursions", results: (n) => `${n} excursion${n > 1 ? "s" : ""}`, category: "Type", all: "Tous", level: "Niveau", sort: "Trier par", maxPrice: "Budget max.",
      sorts: { recommended: "Recommandées", rating: "Mieux notées", price_asc: "Prix croissant", price_desc: "Prix décroissant", soon: "Prochain départ", duration: "Durée" },
      none: "Aucune excursion ne correspond.", noneHint: "Essayez une autre date, moins de voyageurs ou retirez un filtre.", reset: "Réinitialiser", next: "Prochain départ", instant: "Confirmation immédiate", noReview: "Nouveau", noDeparture: "Bientôt de nouvelles dates",
    },
    page: {
      about: "L'expérience", itinerary: "Programme", included: "Inclus", excluded: "Non inclus", meeting: "Point de rendez-vous", reviews: "Avis", reviewsEmpty: "Pas encore d'avis.", map: "Voir sur la carte",
      duration: "Durée", level: "Niveau", languages: "Langues", group: "Groupe", upTo: (n) => `jusqu'à ${n}`, minAge: (n) => `Dès ${n} ans`, cancel: (h) => `Annulation gratuite jusqu'à ${h} h avant`, instant: "Confirmation immédiate",
      book: "Réserver", pickDate: "Choisissez une date", pickTime: "Heure de départ", noDeparture: "Aucun départ à venir pour le moment.", seatsLeft: (n) => `${n} place${n > 1 ? "s" : ""}`, full: "Complet",
      adults: "Adultes", children: "Enfants (tarif enfant)", name: "Nom", phone: "Téléphone", note: "Une demande particulière ?", notePh: "Allergie, mobilité réduite, langue du guide…", total: "Total estimé", payOnSite: "Réglé auprès de l'organisateur.",
      reserve: "Réserver", booking: "Réservation…", loginToBook: "Connectez-vous pour réserver", done: "Réservation envoyée", doneConfirmed: "Votre place est confirmée.", donePending: "L'organisateur doit encore confirmer. Vous serez notifié.",
      code: "Code", seeMine: "Voir mes réservations", notFound: "Excursion introuvable.", summary: "Votre réservation", tooMany: (n) => `Il reste ${n} place${n > 1 ? "s" : ""}`, noChild: "Pas de tarif enfant",
    },
    mine: {
      title: "Mes réservations", upcoming: "À venir", past: "Passées", empty: "Aucune réservation pour le moment.", emptyHint: "Trouvez une excursion et réservez votre place.", find: "Trouver une excursion",
      cancel: "Annuler", cancelConfirm: "Annuler cette réservation ?", cancelled: "Réservation annulée.", cancelledLate: "Réservation annulée (annulation tardive : l'organisateur peut appliquer ses conditions).",
      review: "Donner mon avis", rate: "Votre note", comment: "Votre commentaire (facultatif)", send: "Publier", thanks: "Merci pour votre avis !", reviewed: "Avis publié", reason: "Motif",
    },
    pro: {
      eyebrow: "H-Tourisme · Espace pro", title: "Vos excursions, en ligne.", lead: "Publiez vos circuits, ouvrez des départs avec places limitées et gérez les réservations.",
      needModule: "Débloquez le module H-Tourisme dans votre espace partenaire pour créer une excursion.", openModules: "Ouvrir mes modules", newTitle: "Créer une excursion", name: "Titre de l'excursion", create: "Créer", mine: "Mes excursions",
      tabs: { overview: "Vue d'ensemble", departures: "Départs", bookings: "Réservations", info: "Fiche" },
      submit: "Envoyer pour validation", pause: "Mettre en pause", resume: "Remettre en ligne", submitted: "Envoyée pour validation.", checklistTitle: "Avant de publier",
      checklist: { photo: "Au moins une photo", dep: "Au moins un départ à venir", price: "Un prix adulte", info: "Résumé, ville et point de rendez-vous" },
      statusHint: { draft: "Complétez la fiche, ouvrez des départs puis envoyez-la pour validation.", pending: "L'équipe H-Company examine votre excursion.", active: "Votre excursion est visible et réservable.", paused: "Votre excursion n'apparaît plus dans la recherche.", rejected: "Corrigez la fiche puis renvoyez-la.", suspended: "Contactez le support H-Company." },
      stats: { upcoming: "Réservations à venir", travellers: "Voyageurs", bookings: "Réservations", revenue: "Chiffre d'affaires", fill: "Remplissage (30 prochains jours)", noShow: "Absents", rating: "Note", trend: "Voyageurs par jour", days: (n) => `${n} jours`, openDeps: "Départs ouverts" },
      dep: {
        add: "Ouvrir des départs", from: "Du", to: "Au", weekdays: "Jours", times: "Heures de départ", capacity: "Places par départ", price: "Prix adulte (facultatif)", priceChild: "Prix enfant (facultatif)", create: "Créer les départs", created: (n) => `${n} départ(s) créé(s).`,
        list: "Départs à venir", none: "Aucun départ.", booked: "réservées", open: "Ouvert", closed: "Fermé", pending: "en attente", deleteConfirm: "Supprimer ce départ ?", past: "Passé", dayShort: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"], editCap: "Places", addTime: "+ heure",
      },
      res: { day: "Jour", status: "Statut", all: "Tous", upcomingOnly: "À venir", none: "Aucune réservation.", confirm: "Confirmer", decline: "Refuser", complete: "Terminée", noShow: "Absent", cancel: "Annuler", reasonPrompt: "Motif (facultatif)", done: "Mis à jour." },
      info: {
        summary: "Accroche (160 car.)", description: "Description", category: "Type", city: "Ville", meeting: "Point de rendez-vous", phone: "Téléphone", whatsapp: "WhatsApp", duration: "Durée (heures)", level: "Niveau", langs: "Langues", minAge: "Âge minimum",
        priceAdult: "Prix adulte", priceChild: "Prix enfant (laisser vide si aucun)", maxGroup: "Places par défaut", includes: "Inclus (une ligne par élément)", excludes: "Non inclus (une ligne par élément)", itinerary: "Programme", step: "Étape", stepTitle: "Titre", stepText: "Détail", addStep: "Ajouter une étape",
        instant: "Confirmation immédiate", cancelHours: "Annulation gratuite jusqu'à (heures avant)", photos: "Photos", addPhotos: "Ajouter des photos", uploading: "Téléversement…", map: "Latitude / longitude (facultatif)",
      },
    },
    admin: { title: "H-Tourisme" },
  },
  en: {
    cats: catEn, langs: langEn,
    diff: { easy: "Easy", moderate: "Moderate", hard: "Challenging" },
    status: { pending: "Pending", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled", declined: "Declined", no_show: "No-show" },
    tstatus: { draft: "Draft", pending: "In review", active: "Live", paused: "Paused", rejected: "Rejected", suspended: "Suspended" },
    common: { loading: "Loading…", error: "Something went wrong. Try again.", signInRequired: "Sign in to continue.", signIn: "Sign in", createAccount: "Create account", save: "Save", cancel: "Cancel", delete: "Delete", edit: "Edit", add: "Add", close: "Close", saved: "Saved", person: "person", people: "people", adults: "Adults", children: "Children", perAdult: "/ adult", perChild: "/ child", from: "from", hours: "h" },
    bar: { where: "Tour, city or activity…", mine: "My bookings", pro: "Pro space" },
    home: {
      eyebrow: "H-Tourism", title: "Experience Zambia with local guides.", lead: "Victoria Falls, safaris, cruises, culture and food: book tours run by verified operators, with guaranteed seats.",
      where: "Where?", allCities: "All cities", date: "Date", people: "Travellers", search: "Find a tour", featured: "Featured", byCat: "By experience", cities: "By city",
      empty: "No tour is live yet.", emptyHint: "Check back soon — the first operators are on their way.",
      steps: [{ t: "Choose", d: "Tour type, city, date and number of travellers." }, { t: "Book", d: "See departures and seats left, book in seconds." }, { t: "Enjoy", d: "Your guide waits at the meeting point. Review it afterwards." }],
      proTitle: "Run tours?", proLead: "Publish your tours, open departures and manage bookings — included with your H-Company partnership.", proCta: "Open my pro space",
    },
    search: {
      title: "Tours", results: (n) => `${n} tour${n === 1 ? "" : "s"}`, category: "Type", all: "All", level: "Level", sort: "Sort by", maxPrice: "Max budget",
      sorts: { recommended: "Recommended", rating: "Top rated", price_asc: "Price: low to high", price_desc: "Price: high to low", soon: "Next departure", duration: "Duration" },
      none: "No tour matches.", noneHint: "Try another date, fewer travellers, or remove a filter.", reset: "Reset", next: "Next departure", instant: "Instant confirmation", noReview: "New", noDeparture: "New dates coming soon",
    },
    page: {
      about: "The experience", itinerary: "Itinerary", included: "Included", excluded: "Not included", meeting: "Meeting point", reviews: "Reviews", reviewsEmpty: "No reviews yet.", map: "View on map",
      duration: "Duration", level: "Level", languages: "Languages", group: "Group", upTo: (n) => `up to ${n}`, minAge: (n) => `Ages ${n}+`, cancel: (h) => `Free cancellation up to ${h} h before`, instant: "Instant confirmation",
      book: "Book", pickDate: "Pick a date", pickTime: "Departure time", noDeparture: "No upcoming departure for now.", seatsLeft: (n) => `${n} seat${n === 1 ? "" : "s"}`, full: "Full",
      adults: "Adults", children: "Children (child rate)", name: "Name", phone: "Phone", note: "Any special request?", notePh: "Allergy, reduced mobility, guide language…", total: "Estimated total", payOnSite: "Paid to the operator.",
      reserve: "Book", booking: "Booking…", loginToBook: "Sign in to book", done: "Booking sent", doneConfirmed: "Your seat is confirmed.", donePending: "The operator still has to confirm. You'll be notified.",
      code: "Code", seeMine: "See my bookings", notFound: "Tour not found.", summary: "Your booking", tooMany: (n) => `Only ${n} seat${n === 1 ? "" : "s"} left`, noChild: "No child rate",
    },
    mine: {
      title: "My bookings", upcoming: "Upcoming", past: "Past", empty: "No bookings yet.", emptyHint: "Find a tour and book your seat.", find: "Find a tour",
      cancel: "Cancel", cancelConfirm: "Cancel this booking?", cancelled: "Booking cancelled.", cancelledLate: "Booking cancelled (late cancellation: the operator may apply their terms).",
      review: "Leave a review", rate: "Your rating", comment: "Your comment (optional)", send: "Post", thanks: "Thanks for your review!", reviewed: "Review posted", reason: "Reason",
    },
    pro: {
      eyebrow: "H-Tourism · Pro space", title: "Your tours, online.", lead: "Publish your tours, open limited-seat departures and manage bookings.",
      needModule: "Unlock the H-Tourism module in your partner space to create a tour.", openModules: "Open my modules", newTitle: "Create a tour", name: "Tour title", create: "Create", mine: "My tours",
      tabs: { overview: "Overview", departures: "Departures", bookings: "Bookings", info: "Listing" },
      submit: "Submit for review", pause: "Pause", resume: "Go live again", submitted: "Submitted for review.", checklistTitle: "Before publishing",
      checklist: { photo: "At least one photo", dep: "At least one upcoming departure", price: "An adult price", info: "Summary, city and meeting point" },
      statusHint: { draft: "Complete your listing, open departures, then submit it for review.", pending: "The H-Company team is reviewing your tour.", active: "Your tour is visible and bookable.", paused: "Your tour no longer shows up in search.", rejected: "Fix the listing and submit again.", suspended: "Contact H-Company support." },
      stats: { upcoming: "Upcoming bookings", travellers: "Travellers", bookings: "Bookings", revenue: "Revenue", fill: "Fill rate (next 30 days)", noShow: "No-shows", rating: "Rating", trend: "Travellers per day", days: (n) => `${n} days`, openDeps: "Open departures" },
      dep: {
        add: "Open departures", from: "From", to: "To", weekdays: "Days", times: "Departure times", capacity: "Seats per departure", price: "Adult price (optional)", priceChild: "Child price (optional)", create: "Create departures", created: (n) => `${n} departure(s) created.`,
        list: "Upcoming departures", none: "No departures.", booked: "booked", open: "Open", closed: "Closed", pending: "pending", deleteConfirm: "Delete this departure?", past: "Past", dayShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], editCap: "Seats", addTime: "+ time",
      },
      res: { day: "Day", status: "Status", all: "All", upcomingOnly: "Upcoming", none: "No bookings.", confirm: "Confirm", decline: "Decline", complete: "Completed", noShow: "No-show", cancel: "Cancel", reasonPrompt: "Reason (optional)", done: "Updated." },
      info: {
        summary: "Tagline (160 chars)", description: "Description", category: "Type", city: "City", meeting: "Meeting point", phone: "Phone", whatsapp: "WhatsApp", duration: "Duration (hours)", level: "Level", langs: "Languages", minAge: "Minimum age",
        priceAdult: "Adult price", priceChild: "Child price (leave empty if none)", maxGroup: "Default seats", includes: "Included (one per line)", excludes: "Not included (one per line)", itinerary: "Itinerary", step: "Step", stepTitle: "Title", stepText: "Details", addStep: "Add a step",
        instant: "Instant confirmation", cancelHours: "Free cancellation up to (hours before)", photos: "Photos", addPhotos: "Add photos", uploading: "Uploading…", map: "Latitude / longitude (optional)",
      },
    },
    admin: { title: "H-Tourism" },
  },
};
