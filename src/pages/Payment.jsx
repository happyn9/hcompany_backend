import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard,
  Smartphone,
  ShieldCheck,
  ArrowLeft,
  Check,
  Loader2,
  Lock,
  Sparkles,
} from "lucide-react";
import { useUser } from "../context/Usercontext.jsx";
import { api } from "../lib/api.js";

const METHODS = [
  {
    key: "card",
    label: "Carte bancaire",
    sub: "Visa, Mastercard",
    Icon: CreditCard,
    gradient: "linear-gradient(135deg, #1E1A17, #4A3020)",
  },
  {
    key: "airtel_money",
    label: "Airtel Money",
    sub: "Paiement mobile",
    Icon: Smartphone,
    gradient: "linear-gradient(135deg, #E4002B, #A00019)",
  },
  {
    key: "mtn_momo",
    label: "MTN Mobile Money",
    sub: "Paiement mobile",
    Icon: Smartphone,
    gradient: "linear-gradient(135deg, #FFC800, #C99A00)",
  },
];

function StepDot({ active, done }) {
  return (
    <div className="flex items-center gap-1.5">
      <motion.div
        animate={{
          backgroundColor: done ? "#C89A3D" : active ? "#1E1A17" : "#E7E0D6",
          scale: active ? 1.15 : 1,
        }}
        className="w-2 h-2 rounded-full"
      />
    </div>
  );
}

function CardForm({ onSubmit, loading }) {
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [name, setName] = useState("");

  function formatCardNumber(v) {
    return v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-4"
    >
      {/* Aperçu de carte animé */}
      <motion.div
        className="relative h-40 rounded-2xl p-5 text-cream-fixed overflow-hidden mb-2"
        style={{ background: "linear-gradient(135deg, #1E1A17, #4A3020)" }}
        initial={{ rotateY: -8 }}
        animate={{ rotateY: 0 }}
      >
        <svg className="absolute inset-0 w-full h-full opacity-[0.08]" aria-hidden="true">
          <pattern id="pay-dots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.2" fill="#C89A3D" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#pay-dots)" />
        </svg>
        <div className="relative h-full flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="w-9 h-6 rounded bg-[#C89A3D]/30" />
            <CreditCard size={20} className="text-cream-fixed/50" />
          </div>
          <p className="font-mono text-lg tracking-widest">
            {number || "•••• •••• •••• ••••"}
          </p>
          <div className="flex items-center justify-between text-xs text-cream-fixed/60">
            <span>{name || "NOM SUR LA CARTE"}</span>
            <span>{expiry || "MM/AA"}</span>
          </div>
        </div>
      </motion.div>

      <div>
        <label className="block text-xs text-ink-faint uppercase tracking-wide mb-1.5">Numéro de carte</label>
        <input
          required
          value={number}
          onChange={(e) => setNumber(formatCardNumber(e.target.value))}
          placeholder="4242 4242 4242 4242"
          className="w-full border border-line rounded-xl px-3.5 py-3 text-sm outline-none focus:border-coffee-light font-mono transition-colors"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-ink-faint uppercase tracking-wide mb-1.5">Expiration</label>
          <input
            required
            value={expiry}
            onChange={(e) => setExpiry(e.target.value.replace(/\D/g, "").slice(0, 4).replace(/(\d{2})(\d)/, "$1/$2"))}
            placeholder="MM/AA"
            className="w-full border border-line rounded-xl px-3.5 py-3 text-sm outline-none focus:border-coffee-light font-mono transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-faint uppercase tracking-wide mb-1.5">CVC</label>
          <input
            required
            value={cvc}
            onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 3))}
            placeholder="123"
            className="w-full border border-line rounded-xl px-3.5 py-3 text-sm outline-none focus:border-coffee-light font-mono transition-colors"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-ink-faint uppercase tracking-wide mb-1.5">Nom sur la carte</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value.toUpperCase())}
          placeholder="J. MUKENDI"
          className="w-full border border-line rounded-xl px-3.5 py-3 text-sm outline-none focus:border-coffee-light transition-colors"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-ink text-cream text-sm font-medium py-3.5 hover:bg-coffee-dark transition-colors disabled:opacity-60"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={15} />}
        {loading ? "Traitement…" : "Payer en sécurité"}
      </button>
    </motion.form>
  );
}

function MobileMoneyForm({ method, onSubmit, loading }) {
  const [phone, setPhone] = useState("");
  const isMtn = method.key === "mtn_momo";

  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(phone);
      }}
      className="space-y-4"
    >
      {/* Mockup téléphone animé */}
      <div className="relative h-40 rounded-2xl overflow-hidden mb-2" style={{ background: method.gradient }}>
        <svg className="absolute inset-0 w-full h-full opacity-[0.1]" aria-hidden="true">
          <pattern id={`pay-dots-${method.key}`} width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.2" fill="white" />
          </pattern>
          <rect width="100%" height="100%" fill={`url(#pay-dots-${method.key})`} />
        </svg>
        <div className="relative h-full flex flex-col items-center justify-center gap-2 text-white">
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center"
          >
            <Smartphone size={22} />
          </motion.div>
          <p className="text-sm font-medium">{method.label}</p>
          <p className="text-xs text-white/70">{phone || (isMtn ? "+243 8xx xxx xxx" : "+243 9xx xxx xxx")}</p>
        </div>
      </div>

      <div>
        <label className="block text-xs text-ink-faint uppercase tracking-wide mb-1.5">
          Numéro {method.label}
        </label>
        <input
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={isMtn ? "+243 8xx xxx xxx" : "+243 9xx xxx xxx"}
          className="w-full border border-line rounded-xl px-3.5 py-3 text-sm outline-none focus:border-coffee-light font-mono transition-colors"
        />
        <p className="text-xs text-ink-faint mt-2">
          Vous recevrez une invite de confirmation sur ce numéro pour valider le paiement.
        </p>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-ink text-cream text-sm font-medium py-3.5 hover:bg-coffee-dark transition-colors disabled:opacity-60"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={15} />}
        {loading ? "Confirmation en cours…" : "Confirmer le paiement"}
      </button>
    </motion.form>
  );
}

export default function Payment() {
  const { offerId } = useParams();
  const { withAuth, isAuthenticated, isLoading } = useUser();
  const navigate = useNavigate();

  const [method, setMethod] = useState(null);
  const [offer, setOffer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      navigate("/connexion");
      return;
    }
    withAuth((token) => api.partners.myOffers(token))
      .then((offers) => {
        const found = offers.find((o) => String(o.public_id) === String(offerId));
        setOffer(found || null);
      })
      .catch(() => setOffer(null));
  }, [isLoading, isAuthenticated, offerId, navigate, withAuth]);

  async function handlePay(phoneNumber) {
    setError(null);
    setLoading(true);
    try {
      const payment = await withAuth((token) => api.partners.createPayment(token, offerId, method.key, phoneNumber));
      setSuccess(payment);
    } catch (err) {
      setError(err?.data?.detail || "Le paiement n'a pas pu être traité, réessayez.");
    } finally {
      setLoading(false);
    }
  }

  if (isLoading || (isAuthenticated && offer === null && !error)) {
    return <div className="min-h-screen bg-cream" />;
  }

  if (!offer) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-ink font-medium mb-3">Offre introuvable.</p>
          <Link to="/dashboard" className="text-sm text-coffee-dark underline underline-offset-4">
            Retour au tableau de bord
          </Link>
        </div>
      </div>
    );
  }

  const step = success ? 3 : method ? 2 : 1;

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-cream">
      {/* --- Panneau gauche : récapitulatif de commande --- */}
      <div className="relative bg-ink-fixed overflow-hidden px-6 sm:px-12 lg:px-16 py-16 flex flex-col">
        <div
          className="absolute inset-0 opacity-90"
          style={{ background: "radial-gradient(circle at 20% 10%, #4A3020 0%, #1E1A17 65%)" }}
        />
        <svg className="absolute inset-0 w-full h-full opacity-[0.06]" aria-hidden="true">
          <pattern id="pay-bg-dots" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.4" fill="#C89A3D" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#pay-bg-dots)" />
        </svg>

        <div className="relative z-10 flex flex-col h-full">
          <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-cream-fixed/60 hover:text-cream-fixed transition-colors mb-16 w-fit">
            <ArrowLeft size={14} />
            Retour au tableau de bord
          </Link>

          <div className="flex-1 flex flex-col justify-center max-w-sm">
            <p className="text-xs text-[#C89A3D] uppercase tracking-wide mb-3">Récapitulatif</p>
            <h1 className="font-display italic text-3xl text-cream-fixed mb-6">{offer.title}</h1>

            <div className="flex items-baseline gap-2 mb-8">
              <span className="font-display text-5xl text-cream-fixed">{offer.price.toFixed(0)}</span>
              <span className="text-lg text-cream-fixed/60">$ / {offer.duration_months} mois</span>
            </div>

            <div className="space-y-3 pt-6 border-t border-white/10">
              <div className="flex items-center justify-between text-sm">
                <span className="text-cream-fixed/50">Formule</span>
                <span className="text-cream-fixed">{offer.title}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-cream-fixed/50">Durée</span>
                <span className="text-cream-fixed">{offer.duration_months} mois</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-cream-fixed/50">Facturation</span>
                <span className="text-cream-fixed capitalize">{offer.payment_mode}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-cream-fixed/40 pt-8">
            <ShieldCheck size={14} />
            Paiement chiffré et sécurisé
          </div>
        </div>
      </div>

      {/* --- Panneau droit : sélection méthode + formulaire --- */}
      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-16">
        <div className="w-full max-w-sm mx-auto lg:mx-0">
          {/* Indicateur d'étapes */}
          <div className="flex items-center gap-2 mb-10">
            <StepDot active={step === 1} done={step > 1} />
            <div className="w-6 h-px bg-line" />
            <StepDot active={step === 2} done={step > 2} />
            <div className="w-6 h-px bg-line" />
            <StepDot active={step === 3} done={false} />
          </div>

          <AnimatePresence mode="wait">
            {success ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-4"
              >
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
                  className="w-16 h-16 rounded-2xl bg-[#C89A3D]/15 flex items-center justify-center mx-auto mb-6"
                >
                  <Check size={28} className="text-coffee-dark" />
                </motion.div>
                <h1 className="font-display text-2xl text-ink mb-2">Paiement confirmé</h1>
                <p className="text-sm text-stone mb-1">{success.amount.toFixed(0)} $ payés avec succès</p>
                <p className="text-xs font-mono text-ink-faint mb-8">{success.reference}</p>
                <button
                  onClick={() => navigate("/dashboard")}
                  className="inline-flex items-center gap-2 rounded-full bg-ink text-cream text-sm font-medium px-7 py-3.5 hover:bg-coffee-dark transition-colors"
                >
                  <Sparkles size={15} />
                  Retour au tableau de bord
                </button>
              </motion.div>
            ) : !method ? (
              <motion.div key="pick" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                <h1 className="font-display text-2xl text-ink mb-2">Mode de paiement</h1>
                <p className="text-sm text-stone mb-8">Choisissez comment vous souhaitez régler cette offre.</p>

                <div className="space-y-3">
                  {METHODS.map((m) => (
                    <motion.button
                      key={m.key}
                      onClick={() => setMethod(m)}
                      whileHover={{ x: 4 }}
                      className="w-full flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 hover:border-coffee-light transition-colors text-left"
                    >
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0"
                        style={{ background: m.gradient }}
                      >
                        <m.Icon size={18} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-ink">{m.label}</p>
                        <p className="text-xs text-ink-faint">{m.sub}</p>
                      </div>
                      <ArrowLeft size={15} className="text-ink-faint rotate-180" />
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                <button
                  onClick={() => setMethod(null)}
                  className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink mb-4 transition-colors"
                >
                  <ArrowLeft size={12} />
                  Changer de méthode
                </button>
                <h1 className="font-display text-2xl text-ink mb-6">{method.label}</h1>

                {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

                {method.key === "card" ? (
                  <CardForm onSubmit={() => handlePay(null)} loading={loading} />
                ) : (
                  <MobileMoneyForm method={method} onSubmit={(phone) => handlePay(phone)} loading={loading} />
                )}

                <p className="flex items-center justify-center gap-1.5 text-[0.7rem] text-ink-faint mt-6">
                  <ShieldCheck size={12} />
                  Paiement simulé : aucune donnée bancaire réelle n'est traitée ici.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
