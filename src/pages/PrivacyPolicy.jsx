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

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <div className="px-6 pt-32 pb-24 max-w-2xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink mb-8 transition-colors">
          <ArrowLeft size={14} />
          Retour à l'accueil
        </Link>

        <h1 className="font-display italic text-3xl text-ink mb-2">Politique de confidentialité</h1>
        <p className="text-sm text-ink-faint mb-12">Dernière mise à jour : {new Date().toLocaleDateString("fr-FR", { year: "numeric", month: "long" })}</p>

        <Section title="Ce que nous collectons">
          <p>
            Quand vous créez un compte, nous conservons votre e-mail, votre nom, et un mot de
            passe chiffré (jamais en clair). Si vous êtes partenaire, nous conservons aussi les
            informations de votre candidature (entreprise, catégorie, contact).
          </p>
          <p>
            Si vous vous connectez avec Google, nous recevons votre e-mail et votre nom depuis
            Google : jamais votre mot de passe Google, que nous ne voyons jamais.
          </p>
        </Section>

        <Section title="Comment nous le protégeons">
          <p>
            L'authentification passe par un service dédié, séparé du reste de la plateforme :
            mots de passe chiffrés avec bcrypt, verrouillage automatique après plusieurs
            tentatives de connexion échouées, jetons de connexion à durée de vie limitée.
          </p>
          <p>
            Nous ne vendons ni ne partageons vos données personnelles avec des tiers à des fins
            commerciales.
          </p>
        </Section>

        <Section title="Paiements">
          <p>
            Les informations de paiement (numéro de carte, numéro de téléphone mobile money) ne
            sont pas stockées sur nos serveurs au-delà du traitement de la transaction. Nous
            conservons uniquement la référence de la transaction, son montant, et son statut.
          </p>
        </Section>

        <Section title="Vos droits">
          <p>
            Vous pouvez demander l'accès, la correction, ou la suppression de vos données
            personnelles à tout moment en nous contactant à{" "}
            <a href="mailto:contact@h-company.com" className="text-coffee-dark underline underline-offset-2">
              contact@h-company.com
            </a>.
          </p>
        </Section>

        <Section title="Cookies et stockage local">
          <p>
            Nous utilisons le stockage local de votre navigateur pour retenir votre préférence de
            langue et de thème (clair/sombre), et un cookie technique pour maintenir votre
            session connectée. Aucun de ces éléments n'est utilisé à des fins publicitaires.
          </p>
        </Section>

        <Section title="Nous contacter">
          <p>
            Pour toute question sur cette politique ou sur vos données, écrivez-nous à{" "}
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
