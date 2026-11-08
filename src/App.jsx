import { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { useUser } from "./context/Usercontext.jsx";
import { homeFor } from "./lib/home.js";
import Chatbot from "./components/chatbot/Chatbot.jsx";
import ScrollToTop from "./components/ui/ScrollToTop.jsx";
import { HeadManager } from "./components/ui/HeadManager.jsx";

// Découpage du code par page : chaque page n'est téléchargée que lorsque
// l'utilisateur y accède, au lieu de tout charger d'un bloc au premier
// chargement du site — réduit sensiblement le poids initial.
const Home = lazy(() => import("./pages/Home.jsx"));
const PartnerDashboard = lazy(() => import("./pages/PartnerDashboard.jsx"));
const CookieNotice = lazy(() => import("./components/ui/CookieNotice.jsx"));
const FloatingPromo = lazy(() => import("./components/app/FloatingPromo.jsx"));
const AppShell = lazy(() => import("./components/app/AppShell.jsx"));
const AppHome = lazy(() => import("./pages/app/AppHome.jsx"));
const TransportMap = lazy(() => import("./pages/app/TransportMap.jsx"));
const ColisMap = lazy(() => import("./pages/app/ColisMap.jsx"));
const LogementMap = lazy(() => import("./pages/app/LogementMap.jsx"));
const MoneyHome = lazy(() => import("./pages/money/MoneyHome.jsx"));
const MoneyRequestPay = lazy(() => import("./pages/money/MoneyRequestPay.jsx"));
const MoneyAgent = lazy(() => import("./pages/money/MoneyAgent.jsx"));
const PartnerApply = lazy(() => import("./pages/PartnerApply.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
const AdminConfirmGate = lazy(() => import("./components/admin/AdminConfirmGate.jsx"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard.jsx"));
const AgentDashboard = lazy(() => import("./pages/AgentDashboard.jsx"));
const Onboarding = lazy(() => import("./pages/Onboarding.jsx"));
const ServiceDetail = lazy(() => import("./pages/ServiceDetail.jsx"));
const HServicePage = lazy(() => import("./pages/HServicePage.jsx"));
const LearningHub = lazy(() => import("./pages/learning/LearningHub.jsx"));
const LearningCourse = lazy(() => import("./pages/learning/CourseDetail.jsx"));
const CoursePlayer = lazy(() => import("./pages/learning/CoursePlayer.jsx"));
const InPersonRegistration = lazy(() => import("./pages/learning/InPersonRegistration.jsx"));
const PlansPage = lazy(() => import("./pages/learning/PlansPage.jsx"));
const Checkout = lazy(() => import("./pages/learning/Checkout.jsx"));
const MySubscription = lazy(() => import("./pages/learning/MySubscription.jsx"));
const UstudyPage = lazy(() => import("./pages/learning/UstudyPage.jsx"));
const PartnerDetail = lazy(() => import("./pages/PartnerDetail.jsx"));
const Invoices = lazy(() => import("./pages/money/Invoices.jsx"));
const InvoicePay = lazy(() => import("./pages/money/InvoicePay.jsx"));
const SignIn = lazy(() => import("./pages/auth/SignIn.jsx"));
const Register = lazy(() => import("./pages/auth/Register.jsx"));
const VerifyOtp = lazy(() => import("./pages/auth/VerifyOtp.jsx"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword.jsx"));
const NewPassword = lazy(() => import("./pages/auth/NewPassword.jsx"));
const OAuthCallback = lazy(() => import("./pages/auth/OAuthCallback.jsx"));
const Payment = lazy(() => import("./pages/Payment.jsx"));
const InterpretationDetail = lazy(() => import("./pages/InterpretationDetail.jsx"));
const ShopHome = lazy(() => import("./pages/shop/ShopHome.jsx"));
const ShopCatalog = lazy(() => import("./pages/shop/ShopCatalog.jsx"));
const ProductPage = lazy(() => import("./pages/shop/ProductPage.jsx"));
const ShopStore = lazy(() => import("./pages/shop/ShopStore.jsx"));
const CartPage = lazy(() => import("./pages/shop/CartPage.jsx"));
const ShopCheckout = lazy(() => import("./pages/shop/ShopCheckout.jsx"));
const MyOrders = lazy(() => import("./pages/shop/MyOrders.jsx"));
const OrderDetail = lazy(() => import("./pages/shop/OrderDetail.jsx"));
const TrackPage = lazy(() => import("./pages/shop/TrackPage.jsx"));
const FavoritesPage = lazy(() => import("./pages/shop/FavoritesPage.jsx"));
const SellerStart = lazy(() => import("./pages/shop/SellerStart.jsx"));
const SellerDashboard = lazy(() => import("./pages/shop/SellerDashboard.jsx"));
const ProductEditor = lazy(() => import("./pages/shop/ProductEditor.jsx"));
const AgencyDesk = lazy(() => import("./pages/shop/AgencyDesk.jsx"));
const TransportHome = lazy(() => import("./pages/transport/TransportHome.jsx"));
const TransportSearch = lazy(() => import("./pages/transport/TransportSearch.jsx"));
const TripPage = lazy(() => import("./pages/transport/TripPage.jsx"));
const TransportBook = lazy(() => import("./pages/transport/TransportBook.jsx"));
const MyTickets = lazy(() => import("./pages/transport/MyTickets.jsx"));
const TicketDetail = lazy(() => import("./pages/transport/TicketDetail.jsx"));
const CargoHome = lazy(() => import("./pages/transport/CargoHome.jsx"));
const CargoBook = lazy(() => import("./pages/transport/CargoBook.jsx"));
const MyCargo = lazy(() => import("./pages/transport/MyCargo.jsx"));
const OperatorApp = lazy(() => import("./pages/transport/OperatorApp.jsx"));
const RestoHome = lazy(() => import("./pages/resto/RestoHome.jsx"));
const RestoSearch = lazy(() => import("./pages/resto/RestoSearch.jsx"));
const RestoPage = lazy(() => import("./pages/resto/RestoPage.jsx"));
const MyReservations = lazy(() => import("./pages/resto/MyReservations.jsx"));
const RestoPro = lazy(() => import("./pages/resto/RestoPro.jsx"));
const TourismHome = lazy(() => import("./pages/tour/TourismHome.jsx"));
const TourSearch = lazy(() => import("./pages/tour/TourSearch.jsx"));
const TourPage = lazy(() => import("./pages/tour/TourPage.jsx"));
const MyTourBookings = lazy(() => import("./pages/tour/MyTourBookings.jsx"));
const TourPro = lazy(() => import("./pages/tour/TourPro.jsx"));
const LodgeHome = lazy(() => import("./pages/lodge/LodgeHome.jsx"));
const LodgeWalk = lazy(() => import("./pages/lodge/LodgeWalk.jsx"));
const LodgeSearch = lazy(() => import("./pages/lodge/LodgeSearch.jsx"));
const PropertyPage = lazy(() => import("./pages/lodge/PropertyPage.jsx"));
const LodgeBook = lazy(() => import("./pages/lodge/LodgeBook.jsx"));
const MyTrips = lazy(() => import("./pages/lodge/MyTrips.jsx"));
const TripDetail = lazy(() => import("./pages/lodge/TripDetail.jsx"));
const LodgeFavorites = lazy(() => import("./pages/lodge/LodgeFavorites.jsx"));
const HostPublic = lazy(() => import("./pages/lodge/HostPublic.jsx"));
const HostApp = lazy(() => import("./pages/lodge/HostApp.jsx"));
const PropertyEditor = lazy(() => import("./pages/lodge/PropertyEditor.jsx"));
const QrLogin = lazy(() => import("./pages/qr/QrLogin.jsx"));
const QrScan = lazy(() => import("./pages/qr/QrScan.jsx"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy.jsx"));
const TermsOfService = lazy(() => import("./pages/TermsOfService.jsx"));
const NotFound = lazy(() => import("./pages/NotFound.jsx"));

// Pendant le chargement du code d'une page : une fine barre en haut (après 150 ms seulement, pour ne rien
// afficher quand la page est déjà en cache). Rien de bloquant, aucun écran plein écran.
function RouteFallback() {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 150); return () => clearTimeout(t); }, []);
  return (
    <div className="min-h-[60vh] bg-cream">
      {on && <div className="fixed top-0 left-0 right-0 h-0.5 z-[400] overflow-hidden bg-latte/20" role="progressbar" aria-label="Chargement"><div className="h-full w-1/3 bg-coffee route-bar" /></div>}
    </div>
  );
}

// Anciens liens /cours/:id (e-mails, favoris) → nouvelle fiche cours.
function OldCourseRedirect() {
  const { id } = useParams();
  return <Navigate to={`/formations/${id}`} replace />;
}

// « / » = la nouvelle app : chacun arrive dans son espace ; sans connexion, on va à la page de connexion.
// L'ancien site (présentation, devenir partenaire) vit sur /infos.
function RootGate() {
  const { user, isAuthenticated, isLoading } = useUser();
  if (isLoading) return <RouteFallback />;
  return <Navigate to={isAuthenticated ? homeFor(user) : "/app"} replace />;
}

// Ancien lien /partenaires → /infos (en gardant l'ancre #…).
function OldInfosRedirect() {
  const { hash } = useLocation();
  return <Navigate to={`/infos${hash}`} replace />;
}

export default function App() {
  return (
    <HeadManager>
      <ScrollToTop />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[500] focus:bg-ink focus:text-cream focus:px-4 focus:py-2 focus:rounded-full focus:text-sm"
      >
        Aller au contenu principal
      </a>
      <Suspense fallback={<RouteFallback />}>
        <div id="main-content">
        <Routes>
          <Route path="/" element={<RootGate />} />
          <Route path="/infos" element={<Home />} />
          <Route path="/partenaires" element={<OldInfosRedirect />} />
          <Route path="/dashboard" element={<PartnerDashboard />} />
          <Route path="/app" element={<AppShell />}>
            <Route index element={<AppHome />} />
            <Route path="money" element={<MoneyHome embedded />} />
            <Route path="factures" element={<Invoices />} />
            <Route path="transport" element={<TransportMap />} />
            <Route path="colis" element={<ColisMap />} />
            <Route path="logement" element={<LogementMap />} />
          </Route>
          <Route path="/money/facture/:code" element={<InvoicePay />} />
          <Route path="/money" element={<MoneyHome />} />
          <Route path="/money/demande/:code" element={<MoneyRequestPay />} />
          <Route path="/money/agent" element={<MoneyAgent />} />
          <Route path="/demande-partenariat" element={<PartnerApply />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<AdminConfirmGate><AdminDashboard /></AdminConfirmGate>} />
          <Route path="/agent" element={<AgentDashboard />} />
          <Route path="/services/:slug" element={<ServiceDetail />} />
          {/* Pages des services H- (Transport, Logement, Restaurant, Learning,
              Money, Translate, Shopping/Commerce...) */}
          <Route path="/h/:slug" element={<HServicePage />} />
          {/* H-Learning : vidéos YouTube gratuites + inscription au présentiel.
              Remplace les anciennes pages détail H-Learning et U-Study. */}
          <Route path="/formations" element={<LearningHub />} />
          <Route path="/formations/inscription" element={<InPersonRegistration />} />
          <Route path="/formations/bouquets" element={<PlansPage />} />
          <Route path="/formations/bouquets/:code/paiement" element={<Checkout />} />
          <Route path="/formations/mon-bouquet" element={<MySubscription />} />
          <Route path="/formations/:id" element={<LearningCourse />} />
          <Route path="/formations/:id/regarder/:lessonId" element={<CoursePlayer />} />
          <Route path="/cours/:id" element={<OldCourseRedirect />} />
          <Route path="/partenaires/h-learning" element={<LearningHub />} />
          <Route path="/partenaires/u-study" element={<UstudyPage />} />
          <Route path="/partenaires/:slug" element={<PartnerDetail />} />

          {/* Authentification : pages dédiées, plus de modals */}
          <Route path="/connexion" element={<SignIn />} />
          <Route path="/connexion-qr" element={<QrLogin />} />
          <Route path="/scanner" element={<QrScan />} />
          <Route path="/qr/:code" element={<QrScan />} />
          <Route path="/creer-un-compte" element={<Register />} />
          <Route path="/verifier" element={<VerifyOtp />} />
          <Route path="/mot-de-passe-oublie" element={<ForgotPassword />} />
          <Route path="/nouveau-mot-de-passe" element={<NewPassword />} />
          <Route path="/oauth-callback" element={<OAuthCallback />} />
          <Route path="/paiement/:offerId" element={<Payment />} />
          {/* La formation d'équipe est désormais le bouquet « Équipe » de H-Learning. */}
          <Route path="/formation-equipe" element={<Navigate to="/formations/bouquets?plan=equipe#equipe" replace />} />
          <Route path="/interpretation" element={<InterpretationDetail />} />
          <Route path="/shopping" element={<ShopCatalog />} />
          <Route path="/shopping/accueil" element={<ShopHome />} />
          <Route path="/shopping/produits" element={<ShopCatalog />} />
          <Route path="/shopping/produit/:id" element={<ProductPage />} />
          <Route path="/shopping/boutique/:slug" element={<ShopStore />} />
          <Route path="/shopping/panier" element={<CartPage />} />
          <Route path="/shopping/commande" element={<ShopCheckout />} />
          <Route path="/shopping/mes-commandes" element={<MyOrders />} />
          <Route path="/shopping/mes-commandes/:code" element={<OrderDetail />} />
          <Route path="/shopping/suivi" element={<TrackPage />} />
          <Route path="/shopping/favoris" element={<FavoritesPage />} />
          <Route path="/shopping/vendre" element={<SellerStart />} />
          <Route path="/shopping/vendeur" element={<SellerDashboard />} />
          <Route path="/shopping/vendeur/produit/:id" element={<ProductEditor />} />
          <Route path="/shopping/agence" element={<AgencyDesk />} />
          <Route path="/transport" element={<TransportHome />} />
          <Route path="/transport/recherche" element={<TransportSearch />} />
          <Route path="/transport/trajet/:id" element={<TripPage />} />
          <Route path="/transport/reserver/:id" element={<TransportBook />} />
          <Route path="/transport/mes-billets" element={<MyTickets />} />
          <Route path="/transport/mes-billets/:code" element={<TicketDetail />} />
          <Route path="/transport/agence" element={<OperatorApp />} />
          <Route path="/transport/colis" element={<CargoHome />} />
          <Route path="/transport/colis/:id" element={<CargoBook />} />
          <Route path="/transport/mes-colis" element={<MyCargo />} />
          <Route path="/restaurant" element={<RestoHome />} />
          <Route path="/restaurant/recherche" element={<RestoSearch />} />
          <Route path="/restaurant/r/:slug" element={<RestoPage />} />
          <Route path="/restaurant/mes-reservations" element={<MyReservations />} />
          <Route path="/restaurant/pro" element={<RestoPro />} />
          <Route path="/tourisme" element={<TourismHome />} />
          <Route path="/tourisme/recherche" element={<TourSearch />} />
          <Route path="/tourisme/t/:slug" element={<TourPage />} />
          <Route path="/tourisme/mes-reservations" element={<MyTourBookings />} />
          <Route path="/tourisme/pro" element={<TourPro />} />
          <Route path="/logement" element={<LodgeHome />} />
          <Route path="/logement/recherche" element={<LodgeSearch />} />
          <Route path="/logement/quartier" element={<Navigate to="/app/logement" replace />} />
          <Route path="/logement/s/:slug" element={<PropertyPage />} />
          <Route path="/logement/reserver/:slug" element={<LodgeBook />} />
          <Route path="/logement/mes-sejours" element={<MyTrips />} />
          <Route path="/logement/mes-sejours/:code" element={<TripDetail />} />
          <Route path="/logement/favoris" element={<LodgeFavorites />} />
          <Route path="/logement/hote-profil/:id" element={<HostPublic />} />
          <Route path="/logement/hote" element={<HostApp />} />
          <Route path="/logement/hote/logement/:id" element={<PropertyEditor />} />
          <Route path="/bienvenue" element={<Onboarding />} />

          {/* Pages légales */}
          <Route path="/confidentialite" element={<PrivacyPolicy />} />
          <Route path="/conditions" element={<TermsOfService />} />

          {/* Toute route non reconnue */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </div>
        <FloatingPromo />
      </Suspense>
      <Suspense fallback={null}><CookieNotice /></Suspense>
      <Chatbot />
    </HeadManager>
  );
}
