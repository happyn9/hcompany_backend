import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";
import { UserProvider } from "./context/Usercontext.jsx";
import { ToastProvider } from "./context/ToastContext.jsx";
import { ProgressProvider } from "./context/ProgressContext.jsx";
import { LanguageProvider } from "./context/LanguageContext.jsx";
import { RegionProvider } from "./context/RegionContext.jsx";
import { CartProvider } from "./context/CartContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import ErrorBoundary from "./components/ui/ErrorBoundary.jsx";
import NetworkStatusBanner from "./components/ui/NetworkStatusBanner.jsx";

// Supervision des erreurs — importée dynamiquement, uniquement si
// VITE_SENTRY_DSN est renseigné. Un simple `import * as Sentry` statique
// exécutait le code du paquet à chaque chargement de page, même sans DSN
// configuré — et ce code entrait en conflit avec le regroupement Rollup en
// production, provoquant un plantage total du site ("React is not
// defined") pour tout le monde, DSN ou pas. En important dynamiquement,
// ce code n'est même pas chargé tant qu'aucune vraie clé n'est fournie.
if (import.meta.env.VITE_SENTRY_DSN) {
  import("@sentry/react").then((Sentry) => {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <LanguageProvider>
            <RegionProvider>
            <ToastProvider>
              <ProgressProvider>
                <UserProvider>
                  <CartProvider>
                    <NetworkStatusBanner />
                    <App />
                  </CartProvider>
                </UserProvider>
              </ProgressProvider>
            </ToastProvider>
            </RegionProvider>
          </LanguageProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
