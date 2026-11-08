import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import NavBar from "../components/layout/NavBar.jsx";
import Footer from "../components/layout/Footer.jsx";

function Section({ title, children }) {
  return (
    <div className="mb-10">
      <h2 className="font-display text-xl text-ink mb-3">{title}</h2>
      <div className="text-stone leading-relaxed space-y-3">{children}</div>
    </div>
  );
}

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <div className="px-6 pt-32 pb-24 max-w-2xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink mb-8 transition-colors">
          <ArrowLeft size={14} />
          Retour à l'accueil
        </Link>

        <h1 className="font-display italic text-3xl text-ink mb-2">Conditions d'utilisation</h1>
        <p className="text-sm text-ink-faint mb-12">Dernière mise à jour : {new Date().toLocaleDateString("fr-FR", { year: "numeric", month: "long" })}</p>

        <Section title="Le réseau H-Company">
          <p>
            H-Company met en relation des entreprises, des partenaires (transport, restauration,
            formation...) et des clients à travers une marketplace commune. En utilisant ce site,
            vous acceptez les conditions décrites ici.
          </p>
        </Section>

        <Section title="Comptes et partenaires">
          <p>
            Un compte partenaire est activé après examen de la candidature par notre équipe. Un
            essai gratuit de 30 jours est offert à l'approbation, sans engagement de durée ensuite.
            H-Company se réserve le droit de suspendre un compte en cas d'usage abusif.
          </p>
        </Section>

        <Section title="Paiements">
          <p>
            Les paiements effectués sur la plateforme (carte, Airtel Money, MTN Mobile Money)
            couvrent l'accès aux formules souscrites. Les modalités de remboursement, s'il y a
            lieu, sont précisées au moment de la souscription.
          </p>
        </Section>

        <Section title="Contenu et responsabilité">
          <p>
            Chaque partenaire reste responsable de l'exactitude des informations qu'il publie sur
            la marketplace (services, prix, disponibilité). H-Company facilite la mise en
            relation, mais n'est pas partie aux transactions conclues entre un client et un
            partenaire.
          </p>
        </Section>

        <Section title="Modification de ces conditions">
          <p>
            Ces conditions peuvent évoluer. Les changements significatifs seront communiqués aux
            utilisateurs enregistrés par e-mail ou notification dans l'application.
          </p>
        </Section>

        <Section title="Nous contacter">
          <p>
            Pour toute question sur ces conditions, écrivez-nous à{" "}
            <a href="mailto:contact@h-company.com" className="text-coffee-dark underline underline-offset-2">
              contact@h-company.com
            </a>.
          </p>
        </Section>
      </div>
      <Footer />
    </div>
  );
}
