import { Component } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Filet de sécurité : si un composant plante pendant le rendu (erreur
 * JavaScript non gérée), affiche un écran de secours plutôt qu'une page
 * blanche silencieuse. Les composants React fonctionnels ne peuvent pas
 * définir de frontière d'erreur — ça doit être une classe.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Erreur non interceptée :", error, info);
    if (import.meta.env.VITE_SENTRY_DSN) {
      import("@sentry/react").then((Sentry) => {
        Sentry.captureException(error, { extra: { componentStack: info?.componentStack } });
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle size={26} className="text-red-600" />
          </div>
          <h1 className="font-display italic text-2xl text-ink mb-3">
            Une erreur inattendue est survenue
          </h1>
          <p className="text-stone max-w-sm mx-auto mb-8">
            Rechargez la page pour continuer. Si le problème persiste, contactez-nous.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-6 py-3 hover:bg-coffee-dark transition-colors"
          >
            Recharger la page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
