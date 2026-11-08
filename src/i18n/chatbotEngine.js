// Moteur de réponses d'Avila — 100 % local, aucune IA ni appel réseau.
//
// Comment ça marche :
//  1. on normalise la question (minuscules, sans accents, sans ponctuation) ;
//  2. on traite d'abord les cas "utilitaires" : calcul, date/heure, salutations ;
//  3. on note chaque fiche de la base de connaissances (mots-clés, expressions,
//     tolérance aux fautes de frappe) et on répond avec la meilleure ;
//  4. les pages de service (data/hServicePages.js) alimentent automatiquement
//     la base : le site et le chatbot disent donc la même chose ;
//  5. si rien ne correspond, on le dit honnêtement et on propose des pistes.
//
// Règle d'or : on n'invente jamais un prix, un horaire ou une promesse que
// l'équipe n'a pas validés. Ce qui dépend d'une agence partenaire est dit tel quel.

import { SERVICE_ORDER, SERVICE_PAGES, SLUG_BY_KEY } from "../data/hServicePages.js";

/* ───────────────────────── Normalisation ───────────────────────── */

export function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’'`´]/g, " ")
    .replace(/[^a-z0-9+\-*/().,%^=\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set(
  ("le la les un une des de du d l a au aux et ou en est sont ce cet cette ces je tu il elle on nous vous ils elles " +
    "mon ma mes ton ta tes son sa ses notre votre vos leur leurs que qui quoi dont pour par sur sous dans avec sans " +
    "ne pas plus se sa y me te moi toi lui si the is are of to and or in on for with at by an it its this that these " +
    "those my your our their do does did can could would should will i you he she we they be been am was were what " +
    "how why when where which who ai pouvez peut puis veux voudrais aimerais svp stp please merci").split(" ")
);

function tokens(text) {
  return norm(text)
    .split(" ")
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/** Meilleure correspondance d'un mot-clé simple parmi les mots de la question. */
function tokenScore(kw, toks) {
  let best = 0;
  for (const t of toks) {
    if (t === kw) return kw.length >= 4 ? 3 : 2;
    if (kw.length >= 4 && t.length >= 4 && (kw.startsWith(t) || t.startsWith(kw)) && Math.abs(kw.length - t.length) <= 3) best = Math.max(best, 2);
    else if (kw.length >= 5 && t.length >= 5) {
      const max = kw.length >= 9 ? 2 : 1;
      if (lev(kw, t, max) <= max) best = Math.max(best, 2);
    }
  }
  return best;
}

function scoreKeywords(kws, nText, toks) {
  let score = 0;
  for (const raw of kws) {
    const kw = norm(raw);
    if (!kw) continue;
    if (kw.includes(" ")) {
      if (nText.includes(kw)) score += 3 + kw.split(" ").length;
    } else {
      score += tokenScore(kw, toks);
    }
  }
  return score;
}

/* ───────────────────────── Base de connaissances ───────────────────────── */
// kw : mots-clés (FR et EN mélangés, sans accents) ; les expressions de
// plusieurs mots pèsent plus lourd. `to` : liens proposés sous la réponse.

const L = {
  home: { fr: "Accueil", en: "Home", to: "/" },
  services: { fr: "Voir nos métiers", en: "See our trades", to: "/infos#services" },
  explore: { fr: "Explorer les services", en: "Explore the services", to: "/infos#explorer" },
  join: { fr: "Rejoindre le réseau", en: "Join the network", to: "/infos#rejoindre" },
  signin: { fr: "Se connecter", en: "Sign in", to: "/connexion" },
  register: { fr: "Créer un compte", en: "Create an account", to: "/creer-un-compte" },
  forgot: { fr: "Mot de passe oublié", en: "Forgot password", to: "/mot-de-passe-oublie" },
  dashboard: { fr: "Mon espace", en: "My space", to: "/dashboard" },
  team: { fr: "Formation d'équipe", en: "Team training", to: "/formations/bouquets?plan=equipe#equipe" },
  interp: { fr: "Interprétation", en: "Interpretation", to: "/interpretation" },
  bus: { fr: "Réserver un bus", en: "Book a bus", to: "/transport" },
  tickets: { fr: "Mes billets", en: "My tickets", to: "/transport/mes-billets" },
  busOperator: { fr: "Espace agence de bus", en: "Bus operator space", to: "/transport/agence" },
  lodge: { fr: "Trouver un logement", en: "Find a stay", to: "/logement" },
  host: { fr: "Devenir hôte", en: "Become a host", to: "/logement/hote" },
  trips: { fr: "Mes séjours", en: "My trips", to: "/logement/mes-sejours" },
  shop: { fr: "Ouvrir H-Shopping", en: "Open H-Shopping", to: "/shopping" },
  trackShop: { fr: "Suivre un colis", en: "Track a parcel", to: "/shopping/suivi" },
  seller: { fr: "Devenir vendeur", en: "Become a seller", to: "/shopping/vendre" },
  privacy: { fr: "Confidentialité", en: "Privacy", to: "/confidentialite" },
  terms: { fr: "Conditions", en: "Terms", to: "/conditions" },
  lukondo: { fr: "Voir Lukondo", en: "See Lukondo", to: "/partenaires/lukondo" },
  confismila: { fr: "Voir Confismila", en: "See Confismila", to: "/partenaires/confismila" },
  hlearning: { fr: "Voir H-learning", en: "See H-learning", to: "/formations" },
  courses: { fr: "Voir les cours gratuits", en: "See the free courses", to: "/formations#catalogue" },
  inperson: { fr: "S'inscrire au présentiel", en: "Register for in-person", to: "/formations/inscription" },
  plans: { fr: "Voir les bouquets", en: "See the plans", to: "/formations/bouquets" },
  ustudy: { fr: "Voir U-Study", en: "See U-Study", to: "/partenaires/u-study" },
};

const KB = [
  /* ── Identité et présentation ── */
  {
    id: "about",
    kw: ["h-company", "hcompany", "qu est ce que h company", "c est quoi h company", "presentation", "presenter", "a propos", "about", "what is h company", "who are you company", "entreprise", "plateforme", "platform"],
    fr: "H-Company est une plateforme multi-services qui relie des agences partenaires et leurs clients, principalement entre la RDC et la Zambie (diaspora comprise). Un seul compte vous donne accès à nos services : transport, colis, logement, restaurant, formation, shopping, et bientôt l'argent et la traduction.",
    en: "H-Company is a multi-service platform connecting partner agencies and their customers, mainly between the DRC and Zambia (diaspora included). One account gives you access to our services: transport, parcels, lodging, restaurants, learning, shopping, and soon money transfer and translation.",
    to: ["explore", "services"], follow: ["services_list", "join"],
  },
  {
    id: "services_list",
    kw: ["services", "service", "que proposez", "proposez vous", "offrez", "what do you offer", "catalogue", "catalog", "liste des services", "tous vos services", "what services"],
    fr: "Nos huit services :\n- H-Transport (Bus) et H-Transport (Colis)\n- H-Logement\n- H-Restaurant\n- H-Learning\n- H-Shopping (H-Commerce)\n- Bientôt : H-Money, H-Translate\nCliquez sur « Explorer les services » pour ouvrir la page de chacun.",
    en: "Our eight services:\n- H-Transport (Bus) and H-Transport (Parcels)\n- H-Lodging\n- H-Restaurant\n- H-Learning\n- H-Shopping (H-Commerce)\n- Coming soon: H-Money, H-Translate\nTap “Explore the services” to open each page.",
    to: ["explore"], follow: ["trades", "pricing"],
  },
  {
    id: "trades",
    kw: ["metiers", "metier", "cybersecurite", "cyber", "developpement", "design", "infrastructure", "maintenance", "five trades", "cinq metiers", "trades", "securite informatique", "web", "mobile", "application", "site internet", "website", "logiciel"],
    fr: "Côté entreprises, nous couvrons cinq métiers : cybersécurité, développement web et mobile, design, infrastructure IT et maintenance. Chacun a sa page avec le détail de ce que nous faisons.",
    en: "For businesses we cover five trades: cybersecurity, web and mobile development, design, IT infrastructure and maintenance. Each has its own page with the details.",
    to: ["services"], follow: ["pricing", "contact"],
  },
  {
    id: "pricing",
    kw: ["prix", "tarif", "tarifs", "formule", "formules", "abonnement", "cout", "couts", "combien", "payer", "pricing", "price", "plan", "plans", "cost", "how much", "starter", "pro", "entreprise", "enterprise", "cher"],
    fr: "Trois formules mensuelles, sans engagement de durée :\n- Starter : 150 $ / mois\n- Pro : 450 $ / mois (la plus choisie)\n- Entreprise : 1200 $ / mois\nPour le prix d'un trajet, d'un colis, d'un logement ou d'un repas, c'est l'agence partenaire qui le confirme au moment de votre demande.",
    en: "Three monthly plans, no long-term commitment:\n- Starter: $150 / month\n- Pro: $450 / month (most popular)\n- Enterprise: $1200 / month\nFor the price of a trip, a parcel, a stay or a meal, the partner agency confirms it when you send your request.",
    to: ["services"], follow: ["contact", "join"],
  },
  {
    id: "partners",
    kw: ["partenaire", "partenaires", "reseau", "partner", "partners", "network", "agences", "agency", "agencies", "avec qui travaillez"],
    fr: "Notre réseau compte aujourd'hui Lukondo (bus, colis, lodge, transfert d'argent), Confismila (restaurant), H-learning (formation) et U-Study (application mobile). Chacun a son propre espace sur la plateforme.",
    en: "Our network currently includes Lukondo (bus, parcels, lodge, money transfer), Confismila (restaurant), H-learning (training) and U-Study (mobile app). Each has its own space on the platform.",
    to: ["lukondo", "confismila"], follow: ["join"],
  },
  { id: "lukondo", kw: ["lukondo"], fr: "Lukondo est notre partenaire pour le transport en bus, l'envoi de colis, le lodge et le transfert d'argent entre la RDC et la Zambie.", en: "Lukondo is our partner for bus transport, parcels, lodging and money transfer between the DRC and Zambia.", to: ["lukondo"], follow: ["bus", "colis"] },
  { id: "confismila", kw: ["confismila", "galette"], fr: "Confismila est notre partenaire restaurant : vous pouvez commander ou réserver une table via H-Restaurant.", en: "Confismila is our restaurant partner: you can order or book a table through H-Restaurant.", to: ["confismila"], follow: ["restaurant"] },
  { id: "ustudy", kw: ["u-study", "ustudy", "u study", "application mobile", "mobile app"], fr: "U-Study est une application mobile du réseau H-Company. Sa page présente ce qu'elle apporte aux étudiants.", en: "U-Study is a mobile app of the H-Company network. Its page shows what it offers students.", to: ["ustudy"] },

  /* ── Devenir partenaire ── */
  {
    id: "join",
    kw: ["devenir partenaire", "rejoindre", "candidater", "candidature", "adherer", "inscrire mon agence", "commission", "become a partner", "join the network", "apply", "agence", "ouvrir une boutique", "vendre", "vendeur", "seller", "sell"],
    fr: "Pour une agence, l'outil est gratuit : H-Company prend seulement une commission sur les nouveaux clients qu'elle vous apporte, sans coût ni engagement. Vous devez être connecté, puis remplir le formulaire « Rejoindre le réseau » (société, contact, pièce d'identité). Un agent vérifie le dossier, l'administrateur décide, puis vous recevez un contrat et des offres dans votre espace partenaire.",
    en: "For agencies the tool is free: H-Company only takes a commission on the new customers it brings you, with no cost or commitment. You need to be signed in, then fill in the “Join the network” form (company, contact, ID document). An agent checks the file, the administrator decides, then you receive a contract and offers in your partner space.",
    to: ["join", "seller"], cta: true, follow: ["partner_flow", "trial"],
  },
  {
    id: "partner_flow",
    kw: ["etapes partenaire", "apres ma candidature", "delai", "validation", "contrat", "offre", "kyc", "piece d identite", "verification", "approved", "approuve", "contract", "id document"],
    fr: "Après votre candidature : 1) un agent examine votre dossier (identité, cohérence des informations) ; 2) l'administrateur prend la décision finale ; 3) si c'est accepté, vous recevez un code partenaire, un contrat à signer et des offres visibles dans votre espace ; 4) vous choisissez une offre, signez, puis payez. Je ne peux pas vous donner de délai précis : l'équipe vous répond dès que le dossier est traité.",
    en: "After you apply: 1) an agent reviews your file (identity, consistency); 2) the administrator makes the final decision; 3) if accepted, you get a partner code, a contract to sign and offers in your space; 4) you pick an offer, sign, then pay. I can't give you an exact timeframe: the team replies as soon as your file is processed.",
    to: ["dashboard"], follow: ["trial", "payment"],
  },
  {
    id: "trial",
    kw: ["essai", "gratuit", "free trial", "trial", "periode d essai", "test gratuit", "7 jours", "free"],
    fr: "Lorsque votre compte partenaire est approuvé, il démarre avec un essai gratuit de 7 jours.",
    en: "When your partner account is approved, it starts with a 7-day free trial.",
    follow: ["partner_flow", "pricing"],
  },
  {
    id: "payment",
    kw: ["paiement", "payer", "carte", "visa", "mastercard", "airtel", "mtn", "momo", "mobile money", "payment", "card", "pay"],
    fr: "Les partenaires peuvent régler une offre par carte, Airtel Money ou MTN MoMo depuis le lien de paiement de leur offre. Le branchement des paiements réels est en cours de finalisation : l'équipe vous confirme ce qui est actif au moment de votre paiement. Pour un trajet, un colis ou un repas, les modalités sont confirmées par l'agence.",
    en: "Partners can pay an offer by card, Airtel Money or MTN MoMo from their offer's payment link. Live payment connections are being finalised: the team confirms what is active when you pay. For a trip, parcel or meal, the agency confirms the payment terms.",
    follow: ["contact"],
  },

  /* ── Compte, connexion ── */
  {
    id: "account_create",
    kw: ["creer un compte", "inscription", "inscrire", "s inscrire", "nouveau compte", "register", "sign up", "create account", "create an account", "ouvrir un compte"],
    fr: "Pour créer un compte : cliquez sur « Créer un compte », renseignez votre nom, votre e-mail et un mot de passe, puis saisissez le code à 6 chiffres reçu par e-mail. Vous pouvez aussi vous connecter avec Google.",
    en: "To create an account: tap “Create an account”, enter your name, email and a password, then type the 6-digit code you receive by email. You can also sign in with Google.",
    to: ["register", "signin"], follow: ["code_email"],
  },
  {
    id: "code_email",
    kw: ["code", "otp", "code e-mail", "code email", "pas recu", "je ne recois pas", "recois pas", "renvoyer", "resend", "didn t receive", "not receiving", "verification code", "code de verification", "spam", "courrier indesirable", "expire", "expired"],
    fr: "Le code à 6 chiffres arrive par e-mail en quelques secondes et reste valable 10 minutes (5 essais). Si rien n'arrive : 1) attendez 30 secondes, le serveur peut se réveiller ; 2) regardez dans vos courriers indésirables ; 3) vérifiez l'adresse saisie ; 4) utilisez « Renvoyer le code ». Toujours rien ? Écrivez-nous depuis le formulaire de contact.",
    en: "The 6-digit code arrives by email within seconds and stays valid for 10 minutes (5 attempts). If nothing arrives: 1) wait 30 seconds, the server may be waking up; 2) check your spam folder; 3) check the address you typed; 4) use “Resend code”. Still nothing? Write to us through the contact form.",
    to: ["signin"], follow: ["password_forgot", "contact"],
  },
  {
    id: "password_forgot",
    kw: ["mot de passe", "mdp", "oublie", "oublié", "reinitialiser", "reset", "password", "forgot", "changer mon mot de passe", "change password", "perdu"],
    fr: "Mot de passe oublié ? Utilisez « Mot de passe oublié » sur la page de connexion : vous recevez un code par e-mail pour en choisir un nouveau. Vous pouvez aussi vous connecter directement avec un code e-mail.",
    en: "Forgot your password? Use “Forgot password” on the sign-in page: you'll get an email code to choose a new one. You can also sign in directly with an email code.",
    to: ["forgot", "signin"],
  },
  {
    id: "signin",
    kw: ["connexion", "se connecter", "connecter", "login", "log in", "sign in", "connexion google", "google", "impossible de me connecter", "cannot log in", "can t login"],
    fr: "Pour vous connecter : « Se connecter », puis choisissez mot de passe, code reçu par e-mail ou Google. Si ça bloque, vérifiez votre e-mail, attendez quelques secondes (le service peut se réveiller) et réessayez.",
    en: "To sign in: tap “Sign in”, then choose password, an emailed code or Google. If it gets stuck, check your email, wait a few seconds (the service may be waking up) and try again.",
    to: ["signin"], follow: ["code_email", "password_forgot"],
  },
  {
    id: "dashboard",
    kw: ["espace client", "mon espace", "tableau de bord", "dashboard", "mes demandes", "suivre ma demande", "my requests", "my space", "track my request", "statut de ma demande"],
    fr: "Votre espace (« Mon espace ») rassemble vos demandes de services et leur statut (demandée, active, suspendue ou rejetée), ainsi que vos notifications via la cloche en haut de page.",
    en: "Your space (“My space”) gathers your service requests and their status (requested, active, suspended or rejected), plus your notifications through the bell at the top of the page.",
    to: ["dashboard"],
  },
  {
    id: "request_service",
    kw: ["demander un service", "demande de service", "souscrire", "subscribe", "request a service", "comment demander", "activer un service", "how to request"],
    fr: "Ouvrez la page du service qui vous intéresse (Explorer nos services), cliquez sur le bouton principal : un panneau s'ouvre. Connecté, vous ajoutez un message et envoyez la demande ; sinon il vous propose de vous connecter ou de créer un compte. Le partenaire confirme, et vous suivez tout dans « Mon espace ».",
    en: "Open the page of the service you want (Explore our services) and tap the main button: a panel opens. When signed in, add a message and send; otherwise it offers to sign in or create an account. The partner confirms and you follow everything in “My space”.",
    to: ["explore", "dashboard"], follow: ["services_list"],
  },
  {
    id: "notifications",
    kw: ["notification", "notifications", "cloche", "alerte", "bell", "alerts"],
    fr: "La cloche en haut de page affiche vos notifications (réponses de l'équipe, changement de statut d'une demande). Cliquez dessus pour les lire ou tout marquer comme lu.",
    en: "The bell at the top of the page shows your notifications (team replies, request status changes). Tap it to read them or mark all as read.",
  },
  { id: "language", kw: ["langue", "francais", "anglais", "english", "french", "language", "traduire le site", "changer la langue"], fr: "Le site est disponible en français et en anglais : utilisez le sélecteur de langue FR/EN dans la barre du haut. Le thème clair ou sombre se change au même endroit.", en: "The site is available in French and English: use the FR/EN switch in the top bar. The light or dark theme is changed in the same place." },
  { id: "theme", kw: ["mode sombre", "mode clair", "dark mode", "light mode", "theme", "sombre", "dark"], fr: "Le bouton de thème dans la barre du haut bascule entre mode clair et mode sombre.", en: "The theme button in the top bar switches between light and dark mode." },

  /* ── Sécurité, légal ── */
  {
    id: "security",
    kw: ["securite", "securise", "donnees", "vie privee", "confidentialite", "privacy", "data", "securely", "safe", "sur", "rgpd", "gdpr", "pieces d identite", "protege"],
    fr: "Vos mots de passe sont gérés par un service d'authentification dédié, vos codes ne sont jamais stockés en clair, et les pièces d'identité des partenaires sont conservées dans un espace privé, consultable seulement par l'équipe habilitée. Le détail est dans notre politique de confidentialité.",
    en: "Your passwords are handled by a dedicated authentication service, your codes are never stored in clear text, and partners' ID documents are kept in a private space only authorised staff can open. The details are in our privacy policy.",
    to: ["privacy", "terms"],
  },
  { id: "terms", kw: ["conditions", "cgu", "cgv", "mentions legales", "terms", "legal", "conditions d utilisation"], fr: "Nos conditions d'utilisation et notre politique de confidentialité sont accessibles en bas de chaque page.", en: "Our terms of use and privacy policy are available at the bottom of every page.", to: ["terms", "privacy"] },

  /* ── Contact ── */
  {
    id: "contact",
    kw: ["contact", "contacter", "parler", "joindre", "appeler", "telephone", "email", "mail", "ecrire", "humain", "quelqu un", "support", "aide", "help", "talk to", "speak", "human", "reach you", "whatsapp", "adresse", "address", "where are you", "ou etes vous"],
    fr: "Le plus rapide : le formulaire « Rejoindre le réseau » en bas de la page d'accueil, ou le bouton de contact du site. Un membre de l'équipe vous répond en français ou en anglais. Vous nous trouvez aussi sur nos réseaux (liens en bas de page).",
    en: "Fastest: the “Join the network” form at the bottom of the home page, or the site's contact button. A team member replies in French or English. You can also find us on social media (links in the footer).",
    to: ["join"], cta: true,
  },
  { id: "hours", kw: ["horaires", "heures d ouverture", "ouvert", "opening hours", "open", "disponible quand", "quand etes vous"], fr: "Je n'ai pas d'horaires d'ouverture validés à vous donner : écrivez-nous via le formulaire de contact, l'équipe vous répond dès qu'elle est disponible.", en: "I don't have confirmed opening hours to give you: write to us through the contact form and the team will reply as soon as they can.", to: ["join"], cta: true },
  { id: "countries", kw: ["pays", "zone", "ou opere", "ou travaillez", "country", "countries", "where do you operate", "congo", "rdc", "zambie", "zambia", "lubumbashi", "lusaka", "diaspora", "drc"], fr: "H-Company opère principalement entre la RDC et la Zambie, et sert aussi la diaspora. Les villes desservies dépendent des agences partenaires de chaque service.", en: "H-Company mainly operates between the DRC and Zambia, and also serves the diaspora. The cities served depend on each service's partner agencies.", to: ["explore"] },

  /* ── Formation, interprétation, marketplace ── */
  {
    id: "learning_free",
    kw: ["gratuit", "gratuitement", "youtube", "video", "videos", "playlist", "free course", "free courses", "free videos", "watch", "regarder", "suivre les cours"],
    fr: "Toutes les vidéos H-Learning viennent de notre chaîne YouTube et se suivent gratuitement, sans compte obligatoire. Votre progression est gardée sur votre appareil (et sur votre compte H-Company si vous êtes connecté).",
    en: "Every H-Learning video comes from our YouTube channel and is free to watch, no account required. Your progress is kept on your device (and on your H-Company account if you are signed in).",
    to: ["courses"], follow: ["learning_inperson"],
  },
  {
    id: "learning_inperson",
    kw: ["presentiel", "en presentiel", "in person", "in-person", "formateur", "trainer", "s inscrire a une formation", "inscription formation", "se former", "session", "certificat", "certificate"],
    fr: "Pour vous former avec un formateur, inscrivez-vous à la formation en présentiel : vous laissez vos coordonnées et le cours souhaité, puis notre équipe vous contacte pour fixer le lieu, les dates et les modalités. Vous pouvez aussi prendre un bouquet H-Learning pour un accompagnement complet.",
    en: "To train with a trainer, register for the in-person training: leave your details and the course you want, then our team contacts you to set the place, dates and terms. You can also take an H-Learning plan for full support.",
    to: ["inperson", "plans", "team"],
  },
  {
    id: "learning_team",
    kw: ["formation d equipe", "former mes employes", "former mon equipe", "team training", "train my team", "employes", "entreprise formation", "plusieurs employes", "company training", "bouquet equipe", "team plan"],
    fr: "La formation d'équipe est le bouquet « Équipe » de H-Learning : un prix par personne (à partir de 5 personnes), la formation en présentiel et les cours exclusifs pour chaque membre. Vous payez par mobile money et vous ajoutez vos collaborateurs par e-mail.",
    en: "Team training is the H-Learning “Team” plan: one price per person (from 5 people), in-person training and exclusive courses for every member. You pay by mobile money and add your colleagues by e-mail.",
    to: ["team", "plans"],
  },
  {
    id: "learning_plans",
    kw: ["bouquet", "bouquets", "abonnement", "tarif", "tarifs", "prix formation", "combien coute la formation", "plan", "plans", "pricing", "price", "subscription", "payer la formation", "mobile money", "zamtel", "mtn", "airtel"],
    fr: "H-Learning propose trois bouquets : Individuel, Pro et Équipe. Ils ajoutent la formation en présentiel et les cours exclusifs aux vidéos gratuites. Les prix sont fixés en kwacha (ZMW), affichables en USD ou en CDF, et se paient par Zamtel, MTN ou Airtel Money, sans prélèvement automatique.",
    en: "H-Learning offers three plans: Individual, Pro and Team. They add in-person training and exclusive courses to the free videos. Prices are set in kwacha (ZMW), viewable in USD or CDF, and paid by Zamtel, MTN or Airtel Money, with no automatic charge.",
    to: ["plans"],
  },
  {
    id: "interpretation",
    kw: ["interprete", "interpretation", "traduction", "traducteur", "traduire", "interpreter", "translation", "translator", "conference"],
    fr: "H-Translate (bientôt) et notre service d'interprétation couvrent l'interprétation et la traduction. Dans l'idéal, réservez un interprète 48 h à l'avance ; des demandes urgentes peuvent parfois être satisfaites selon les disponibilités.",
    en: "H-Translate (coming soon) and our interpretation service cover interpretation and translation. Ideally book an interpreter 48 hours ahead; urgent requests can sometimes be met depending on availability.",
    to: ["interp"],
  },
  {
    id: "marketplace_sell",
    kw: ["marketplace", "boutique", "vendre mes produits", "ouvrir une vitrine", "vitrine", "commerce", "h-commerce", "shopping", "acheter", "shop", "store", "produits", "products", "sell my products", "artisanat", "vetements", "meubles"],
    fr: "H-Shopping (H-Commerce) est ouvert : une marketplace où acheter auprès de boutiques vérifiées, payer par mobile money (Zamtel, MTN, Airtel) et récupérer son colis en agence ou à domicile. Votre argent est sécurisé jusqu'à la confirmation de réception. Côté vendeurs : créez votre boutique depuis la page « Vendre », elle est validée par notre équipe, puis ajoutez vos produits. Commission uniquement sur les ventes, sans frais fixes. Pour suivre un colis, utilisez « Suivre un colis » avec votre numéro de commande.",
    en: "H-Shopping (H-Commerce) is open: a marketplace to buy from verified shops, pay with mobile money (Zamtel, MTN, Airtel) and collect your parcel at an agency or at home. Your money is held securely until you confirm receipt. For sellers: create your shop from the “Sell” page, our team approves it, then add your products. Commission only on sales, no fixed fees. To track a parcel, use “Track a parcel” with your order number.",
    to: ["shop", "seller", "trackShop"],
  },
  {
    id: "bus_book",
    kw: ["bus", "billet de bus", "billet", "ticket", "voyage en bus", "reserver un bus", "reserver un billet", "book a bus", "bus ticket", "coach", "agence de bus", "bus operator", "siege", "seat", "h-transport"],
    fr: "H-Transport (Bus) est ouvert : cherchez un départ par trajet et date, choisissez votre siège et payez en mobile money. Votre paiement est gardé en sécurité jusqu'au départ ; chaque passager reçoit un billet avec QR code, à présenter à l'embarquement. Annulation gratuite jusqu'à 48 h avant le départ. Vous dirigez une agence de bus ? Créez votre espace agence : après validation par H-Company, vous publiez vos départs.",
    en: "H-Transport (Bus) is open: search a departure by route and date, pick your seat and pay with mobile money. Your payment is held securely until departure; each passenger gets a QR-code ticket to show when boarding. Free cancellation up to 48 hours before departure. Run a bus company? Create your operator space: once H-Company approves it, you publish your departures.",
    to: ["bus", "tickets", "busOperator"],
  },
  {
    id: "lodging_book",
    kw: ["logement", "hebergement", "lodge", "appartement", "chambre", "reserver un logement", "louer", "airbnb", "maison d hotes", "accommodation", "lodging", "apartment", "guesthouse", "book a stay", "host my place", "devenir hote", "become a host"],
    fr: "H-Logement est ouvert : parcourez les lodges, appartements et maisons d'hôtes, filtrez par ville, dates, prix et équipements, puis réservez. Le paiement mobile money est protégé jusqu'à votre arrivée ; l'adresse exacte et le contact de l'hôte apparaissent après confirmation. Chaque logement affiche sa politique d'annulation (flexible, modérée, stricte). Vous avez un logement ? Ouvrez l'espace hôte : annonce, calendrier, prix saisonniers et retraits mobile money, avec une commission uniquement sur les réservations.",
    en: "H-Lodging is open: browse lodges, apartments and guesthouses, filter by city, dates, price and amenities, then book. Your mobile money payment is protected until you arrive; the exact address and host contact appear once confirmed. Each listing shows its cancellation policy (flexible, moderate, strict). Have a place? Open the host area: listing, calendar, seasonal prices and mobile money payouts, with commission only on bookings.",
    to: ["lodge", "host", "trips"],
  },
  {
    id: "mobile_apps",
    kw: ["telecharger", "download", "play store", "app store", "android", "ios", "iphone", "application", "app"],
    fr: "H-Company fonctionne dans votre navigateur, sur mobile comme sur ordinateur. U-Study est l'application mobile du réseau ; je n'ai pas d'autre application à vous annoncer pour l'instant.",
    en: "H-Company works in your browser, on mobile and desktop. U-Study is the network's mobile app; I have no other app to announce for now.",
    to: ["ustudy"],
  },
  { id: "jobs", kw: ["emploi", "recrutement", "travailler chez", "job", "jobs", "career", "careers", "hiring", "stage", "internship"], fr: "Je n'ai pas d'offres d'emploi à vous présenter. Écrivez-nous via le formulaire de contact en précisant votre profil, l'équipe vous répondra.", en: "I have no job openings to show you. Write to us through the contact form with your profile and the team will reply.", to: ["join"], cta: true },
  { id: "refund", kw: ["rembours", "annuler", "annulation", "refund", "cancel", "cancellation", "litige", "reclamation", "plainte", "complaint", "dispute", "probleme avec"], fr: "Pour une annulation, un remboursement ou un litige, les règles dépendent de l'agence partenaire concernée. Contactez-nous avec votre référence : l'équipe fait le lien avec l'agence.", en: "For a cancellation, refund or dispute, the rules depend on the partner agency involved. Contact us with your reference: the team will liaise with the agency.", to: ["join"], cta: true },
  { id: "free_use", kw: ["gratuit pour les clients", "est ce gratuit", "frais", "is it free", "fees", "frais d inscription"], fr: "Créer un compte est gratuit. Le prix d'un trajet, d'un colis, d'un logement ou d'un repas est fixé et confirmé par l'agence partenaire.", en: "Creating an account is free. The price of a trip, parcel, stay or meal is set and confirmed by the partner agency." },
  { id: "team_who", kw: ["fondateur", "equipe", "qui a cree", "founder", "team", "who created", "who built", "ceo"], fr: "H-Company est portée par une équipe basée entre la RDC et la Zambie. Pour en savoir plus, consultez la section « À propos » de la page d'accueil.", en: "H-Company is run by a team based between the DRC and Zambia. To learn more, see the “About” section on the home page.", to: ["home"] },
];

/* ── Fiches de service : générées depuis hServicePages.js ── */
const SERVICE_ALIASES = {
  h_transport_bus: ["bus", "book a bus", "reserver un bus", "reserver un trajet", "book a trip", "reserver une place", "autocar", "trajet", "voyage", "billet", "ticket", "itineraire", "route", "trip", "travel", "lubumbashi", "ndola"],
  h_transport_colis: ["colis", "colis", "parcel", "package", "envoyer un colis", "suivi", "tracking", "expedier", "ship"],
  h_logement: ["logement", "book a room", "reserver une chambre", "book accommodation", "hebergement", "hotel", "chambre", "lodge", "sejour", "lodging", "accommodation", "room", "stay", "dormir"],
  h_restaurant: ["restaurant", "manger", "repas", "table", "commander", "food", "meal", "dine", "order food", "reserver une table"],
  h_tourisme: ["h-tourisme", "tourisme", "tourism", "excursion", "excursions", "safari", "victoria", "chutes", "tour", "tours", "visite", "croisiere"],
  h_learning: ["h-learning", "learning", "formation", "formations", "cours", "apprendre", "course", "courses", "training", "learn", "etudier"],
  h_money: ["h-money", "argent", "transfert d argent", "envoyer de l argent", "money", "transfer money", "send money", "mobile money", "remittance"],
  h_translate: ["h-translate", "translate", "traduction", "interpretation", "interprete", "langues", "languages"],
  h_shopping: ["h-shopping", "h-commerce", "shopping", "commerce", "marketplace", "boutiques", "shops"],
};

function serviceEntries() {
  const out = [];
  for (const key of SERVICE_ORDER) {
    const page = SERVICE_PAGES[key];
    if (!page) continue;
    const slug = SLUG_BY_KEY[key];
    const toLink = { fr: page.fr.name, en: page.en.name, to: `/h/${slug}` };
    const mk = (lang) => {
      const p = page[lang];
      const steps = (p.steps || []).map((s, i) => `${i + 1}. ${s.title}`).join("\n");
      return `${p.name} — ${p.tagline}\n${p.lead}${steps ? `\n\n${lang === "fr" ? "Comment ça marche" : "How it works"} :\n${steps}` : ""}`;
    };
    out.push({
      id: key,
      service: key,
      kw: SERVICE_ALIASES[key] || [],
      fr: mk("fr"),
      en: mk("en"),
      links: [toLink],
      follow: [`${key}:faq0`],
      w: 1,
    });
    (page.fr.faq || []).forEach((f, i) => {
      out.push({
        id: `${key}:faq${i}`,
        service: key,
        faq: { fr: f.q, en: page.en.faq?.[i]?.q || f.q },
        fr: f.a,
        en: page.en.faq?.[i]?.a || f.a,
        links: [toLink],
        follow: [key],
      });
    });
  }
  return out;
}

const ALL = [...KB, ...serviceEntries()];
const BY_ID = new Map(ALL.map((e) => [e.id, e]));

/* ── Petites conversations ── */
const SMALL = [
  { id: "hello", re: /^(bonjour|bonsoir|salut|coucou|hello|hi|hey|bonne journee|good morning|good evening|good afternoon|yo)\b/, fr: "Bonjour ! Je suis Avila. Demandez-moi un prix, comment réserver un trajet, envoyer un colis, créer un compte… ou choisissez un sujet dans le menu.", en: "Hello! I'm Avila. Ask me about prices, how to book a trip, send a parcel, create an account… or pick a topic from the menu." },
  { id: "thanks", re: /\b(merci|thanks|thank you|thx|super merci|je vous remercie)\b/, fr: "Avec plaisir ! Autre chose que je puisse faire pour vous ?", en: "You're welcome! Anything else I can help with?" },
  { id: "bye", re: /^(au revoir|a bientot|bye|goodbye|a plus|see you|bonne soiree|ciao)\b/, fr: "À bientôt ! Si vous avez besoin de nous, je suis là.", en: "See you soon! If you need us, I'm here." },
  { id: "how", re: /\b(comment vas tu|comment allez vous|ca va|how are you|how r u|tu vas bien)\b/, fr: "Très bien, merci ! Et vous, comment puis-je vous aider ?", en: "Doing great, thanks! How can I help you?" },
  { id: "who", re: /\b(qui es tu|qui etes vous|tu es qui|comment t appelles|ton nom|who are you|your name|what are you)\b/, fr: "Je m'appelle Avila, l'assistante de H-Company. Je suis un programme codé par l'équipe : je ne suis pas relié à une IA externe, donc je réponds à partir de ce que H-Company m'a appris, et je vous le dis quand je ne sais pas.", en: "I'm Avila, H-Company's assistant. I'm a program coded by the team: I'm not connected to any external AI, so I answer from what H-Company taught me, and I tell you when I don't know." },
  { id: "human", re: /\b(es tu un robot|tu es un robot|are you a bot|are you human|vraie personne|real person|une ia|an ai)\b/, fr: "Je suis un assistant automatique, sans IA externe. Pour parler à une vraie personne, utilisez le formulaire de contact : l'équipe vous répond.", en: "I'm an automated assistant with no external AI. To talk to a real person, use the contact form: the team will reply.", cta: true, to: ["join"] },
  { id: "joke", re: /\b(blague|raconte moi une blague|joke|fais moi rire|make me laugh)\b/, fr: "Pourquoi le bus a-t-il de bonnes notes ? Parce qu'il ne rate jamais un arrêt. 😄 Revenons à vos projets : je peux vous aider sur quoi ?", en: "Why does the bus get good grades? It never misses a stop. 😄 Back to your plans: what can I help with?" },
  { id: "compliment", re: /\b(bravo|bien joue|tu es genial|genial|super|excellent|great job|well done|awesome|nice)\b/, fr: "Merci, ça fait plaisir ! Je continue à m'améliorer avec l'équipe.", en: "Thank you, that's kind! I keep improving with the team." },
  { id: "rude", re: /\b(nul|idiot|stupide|bete|con|merde|stupid|dumb|useless|shut up)\b/, fr: "Désolée que je n'aie pas pu vous aider. Dites-moi ce que vous cherchez ou écrivez à l'équipe via le formulaire : une vraie personne vous répondra.", en: "Sorry I couldn't help. Tell me what you're looking for or write to the team through the form: a real person will reply.", cta: true, to: ["join"] },
  { id: "yes", re: /^(oui|ok|okay|d accord|yes|yep|ouais|bien sur|sure|go|vas y|continue|plus|details|plus de details|more|tell me more|et ensuite|and then)\b/, follow: true },
  { id: "no", re: /^(non|no|nope|pas du tout|non merci|no thanks)\b/, fr: "D'accord ! N'hésitez pas si une question vous vient plus tard.", en: "Alright! Feel free to ask if another question comes up later." },
];

/* ── Utilitaires : date / heure / calcul ── */
function tryMath(raw) {
  let s = norm(raw)
    .replace(/combien font|combien fait|combien |calcule|calculer|calcul|what is|what s|how much is|=|\?|egale|equals/g, " ")
    .replace(/\bplus\b/g, "+")
    .replace(/\bmoins\b/g, "-")
    .replace(/\bfois\b|\btimes\b|x(?=\s*\d)|(?<=\d)\s*x/g, "*")
    .replace(/\bdivise par\b|\bdivided by\b/g, "/")
    .replace(/,/g, ".")
    .replace(/\s+/g, "");
  if (!/^[\d+\-*/().%^]+$/.test(s) || !/\d/.test(s) || !/[+\-*/%^]/.test(s.replace(/^-/, ""))) return null;
  // petit analyseur récursif : pas d'eval
  let i = 0;
  const peek = () => s[i];
  function num() {
    if (peek() === "(") { i++; const v = add(); if (peek() === ")") i++; return v; }
    if (peek() === "-") { i++; return -num(); }
    const m = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (!m) throw new Error("x");
    i += m[0].length;
    let v = parseFloat(m[0]);
    if (peek() === "%") { i++; v /= 100; }
    return v;
  }
  function pow() { let v = num(); while (peek() === "^") { i++; v = Math.pow(v, num()); } return v; }
  function mul() { let v = pow(); while (peek() === "*" || peek() === "/") { const o = s[i++]; const r = pow(); v = o === "*" ? v * r : v / r; } return v; }
  function add() { let v = mul(); while (peek() === "+" || peek() === "-") { const o = s[i++]; const r = mul(); v = o === "+" ? v + r : v - r; } return v; }
  try {
    const v = add();
    if (i !== s.length || !Number.isFinite(v)) return null;
    return Math.round(v * 1e8) / 1e8;
  } catch {
    return null;
  }
}

function dateTimeAnswer(nText, lang) {
  const now = new Date();
  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  const asksTime = /\b(quelle heure|heure est il|what time|current time|l heure)\b/.test(nText);
  const asksDate = /\b(quel jour|quelle date|date d aujourd|what day|today s date|what date|on est quel|nous sommes le|date aujourd)\b/.test(nText);
  if (!asksTime && !asksDate) return null;
  const d = now.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const t = now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  if (asksTime && asksDate) return lang === "fr" ? `Nous sommes le ${d}, il est ${t} (heure de votre appareil).` : `It's ${d}, ${t} (your device's time).`;
  if (asksTime) return lang === "fr" ? `Il est ${t} (heure de votre appareil).` : `It's ${t} (your device's time).`;
  return lang === "fr" ? `Nous sommes le ${d}.` : `Today is ${d}.`;
}

/* ───────────────────────── Réponse ───────────────────────── */

function linksFor(entry, lang) {
  const out = [];
  for (const id of entry.to || []) if (L[id]) out.push({ label: L[id][lang], to: L[id].to });
  for (const l of entry.links || []) out.push({ label: l[lang], to: l.to });
  return out;
}

function faqScore(entry, toks, nText) {
  const qToks = tokens(entry.faq.fr + " " + entry.faq.en).filter((w) => w.length >= 4);
  if (!qToks.length) return 0;
  let matched = 0;
  for (const q of new Set(qToks)) if (tokenScore(q, toks) >= 2) matched++;
  const uniq = new Set(qToks).size;
  if (matched < 2 || matched / uniq < 0.4) return 0;
  let s = matched * 2 + (matched / uniq) * 2;
  const alias = SERVICE_ALIASES[entry.service] || [];
  if (scoreKeywords(alias, nText, toks) >= 2) s += 3;
  return s;
}

function rank(text) {
  const nText = norm(text);
  const toks = tokens(text);
  const scored = [];
  for (const e of ALL) {
    let s = 0;
    if (e.faq) s = faqScore(e, toks, nText);
    else s = scoreKeywords(e.kw || [], nText, toks) * (e.w || 1);
    if (s > 0) scored.push({ e, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored;
}

const MENU_TOPICS = {
  fr: ["Vos services", "Vos tarifs", "Réserver un bus", "Envoyer un colis", "Créer un compte", "Devenir partenaire"],
  en: ["Your services", "Your pricing", "Book a bus", "Send a parcel", "Create an account", "Become a partner"],
};

/**
 * @param {string} text   message de la personne
 * @param {"fr"|"en"} lang
 * @param {{topic?: string}} ctx  dernier sujet traité (pour "et ensuite ?")
 * @returns {{text:string, links:{label:string,to:string}[], suggestions:string[], cta:boolean, topic:string|null}}
 */
export function answer(text, lang = "fr", ctx = {}) {
  const l = lang === "en" ? "en" : "fr";
  const nText = norm(text);
  const reply = (t, extra = {}) => ({ text: t, links: [], suggestions: [], cta: false, topic: ctx.topic || null, ...extra });

  if (!nText) return reply(l === "fr" ? "Je vous écoute — posez votre question." : "I'm listening — go ahead and ask.", { suggestions: MENU_TOPICS[l].slice(0, 3) });

  const math = tryMath(text);
  if (math !== null) return reply(`${text.trim().replace(/\?+$/, "")} = ${math}`.replace(/\s*=\s*/, " = "), { topic: ctx.topic });

  const dt = dateTimeAnswer(nText, l);
  if (dt) return reply(dt);

  // Questions très courtes : salutations, remerciements, "oui"…
  for (const s of SMALL) {
    if (!s.re.test(nText)) continue;
    // une salutation suivie d'une vraie question ("bonjour, quels sont vos tarifs") → on traite la question
    if (["hello", "thanks", "compliment"].includes(s.id) && nText.split(" ").length > 3 && rank(text).length) break;
    if (s.follow) {
      const cur = BY_ID.get(ctx.topic);
      const nextId = (cur?.follow || []).find((id) => BY_ID.has(id));
      if (nextId) return build(BY_ID.get(nextId), l, reply);
      return reply(l === "fr" ? "Dites-moi sur quel sujet vous voulez en savoir plus." : "Tell me which topic you'd like to know more about.", { suggestions: MENU_TOPICS[l].slice(0, 4) });
    }
    return reply(s[l], { links: linksFor(s, l), cta: !!s.cta, suggestions: s.id === "hello" ? MENU_TOPICS[l].slice(0, 4) : [] });
  }

  const ranked = rank(text);
  const best = ranked[0];
  if (best && best.s >= 3) {
    // Si deux fiches sont au coude à coude, la plus spécifique (FAQ) l'emporte ; sinon la mieux notée.
    return build(best.e, l, reply);
  }

  // Rien de net : on le dit et on propose les pistes les plus proches.
  const near = ranked.slice(0, 3).map((r) => r.e).filter((e) => !e.faq);
  const hint = near.length ? near.map((e) => labelOf(e, l)) : MENU_TOPICS[l].slice(0, 4);
  return reply(
    l === "fr"
      ? "Je n'ai pas de réponse précise à cette question, et je préfère ne rien inventer. Je peux vous parler de nos services, des tarifs, de la réservation, des colis, du compte ou du réseau de partenaires. Pour tout le reste, l'équipe vous répond via le formulaire de contact."
      : "I don't have a precise answer to that, and I'd rather not make anything up. I can tell you about our services, pricing, booking, parcels, accounts or the partner network. For anything else, the team will reply through the contact form.",
    { suggestions: hint, cta: true, links: [{ label: L.join[l], to: L.join.to }] }
  );
}

function labelOf(e, l) {
  if (e.service && !e.faq) return SERVICE_PAGES[e.service]?.[l]?.name || e.id;
  const map = {
    about: { fr: "Qu'est-ce que H-Company ?", en: "What is H-Company?" },
    services_list: { fr: "Vos services", en: "Your services" },
    trades: { fr: "Vos métiers", en: "Your trades" },
    pricing: { fr: "Vos tarifs", en: "Your pricing" },
    partners: { fr: "Vos partenaires", en: "Your partners" },
    join: { fr: "Devenir partenaire", en: "Become a partner" },
    account_create: { fr: "Créer un compte", en: "Create an account" },
    code_email: { fr: "Je ne reçois pas mon code", en: "I'm not getting my code" },
    password_forgot: { fr: "Mot de passe oublié", en: "Forgot password" },
    signin: { fr: "Me connecter", en: "Sign in" },
    request_service: { fr: "Demander un service", en: "Request a service" },
    contact: { fr: "Contacter l'équipe", en: "Contact the team" },
    payment: { fr: "Moyens de paiement", en: "Payment methods" },
    trial: { fr: "Essai gratuit", en: "Free trial" },
    partner_flow: { fr: "Étapes après ma candidature", en: "Steps after I apply" },
    marketplace_sell: { fr: "Marketplace et vendeurs", en: "Marketplace and sellers" },
    security: { fr: "Sécurité des données", en: "Data security" },
  };
  return map[e.id]?.[l] || e.id;
}

function build(entry, l, reply) {
  const followLabels = (entry.follow || [])
    .map((id) => BY_ID.get(id))
    .filter((e) => e && !e.faq)
    .map((e) => labelOf(e, l));
  // une question de FAQ suivante, formulée comme suggestion
  const nextFaq = (entry.follow || []).map((id) => BY_ID.get(id)).find((e) => e?.faq);
  const suggestions = [...followLabels];
  if (nextFaq) suggestions.push(nextFaq.faq[l]);
  return reply(entry[l], {
    links: linksFor(entry, l),
    cta: !!entry.cta,
    suggestions: suggestions.slice(0, 3),
    topic: entry.id,
  });
}

/** Les suggestions sont des libellés : on les renvoie à `answer` comme une question. */
export const QUICK_MENU = MENU_TOPICS;

/** Pour les tests : nombre de fiches. */
export const KB_SIZE = ALL.length;
