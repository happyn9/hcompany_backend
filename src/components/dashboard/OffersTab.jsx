import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, CreditCard } from "lucide-react";

const PAYMENT_LABELS = {
  monthly: "mensuel",
  quarterly: "trimestriel",
  annual: "annuel",
  one_time: "paiement unique",
};

export default function OffersTab({ offers, onAccept }) {
  const [acceptingId, setAcceptingId] = useState(null);
  const [error, setError] = useState(null);

  async function handleAccept(offerId) {
    setAcceptingId(offerId);
    setError(null);
    try {
      await onAccept(offerId);
    } catch (err) {
      setError(err?.data?.detail || "Impossible d'accepter cette offre pour le moment.");
    } finally {
      setAcceptingId(null);
    }
  }

  if (offers.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-6">
        <p className="text-sm text-ink-soft">
          Aucune offre pour l'instant : l'équipe H-Company vous en enverra une prochainement.
        </p>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {offers.map((offer) => {
        const isAccepted = offer.status === "accepted";
        const isDeclined = offer.status === "declined";
        return (
          <div
            key={offer.id}
            className={`rounded-2xl border p-6 flex flex-col ${
              isAccepted ? "border-coffee bg-coffee/5" : isDeclined ? "border-line opacity-50" : "border-line bg-surface"
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-display text-xl text-ink">{offer.title}</h3>
              {isAccepted && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-coffee-dark bg-coffee/10 px-2.5 py-1 rounded-full">
                  <Check size={12} /> Acceptée
                </span>
              )}
            </div>
            <p className="font-display text-3xl text-ink mb-1">
              {offer.price.toFixed(0)} $
            </p>
            <p className="text-xs text-ink-soft mb-4">
              {PAYMENT_LABELS[offer.payment_mode]} · {offer.duration_months} mois
            </p>
            {offer.description && (
              <p className="text-sm text-stone leading-relaxed mb-5 flex-1">{offer.description}</p>
            )}
            {offer.status === "proposed" && (
              <button
                onClick={() => handleAccept(offer.id)}
                disabled={acceptingId === offer.id}
                className="mt-auto rounded-full bg-ink text-cream text-sm font-medium px-5 py-2.5 hover:bg-coffee-dark transition-colors disabled:opacity-60"
              >
                {acceptingId === offer.id ? "Confirmation…" : "Accepter cette offre"}
              </button>
            )}
            {isAccepted && (
              <Link
                to={`/paiement/${offer.public_id}`}
                className="mt-auto flex items-center justify-center gap-1.5 rounded-full bg-ink text-cream text-sm font-medium px-5 py-2.5 hover:bg-coffee-dark transition-colors"
              >
                <CreditCard size={14} />
                Payer cette offre
              </Link>
            )}
            {isDeclined && <p className="mt-auto text-xs text-ink-faint">Non retenue</p>}
          </div>
        );
      })}
      {error && <p className="sm:col-span-2 lg:col-span-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
