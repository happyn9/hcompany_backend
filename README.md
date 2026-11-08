# Site H-Company

Site React + Vite + Tailwind v4, backend FastAPI séparé (voir
`../backend/`) — ce dossier ne contient que le frontend.

## Démarrer en développement

```bash
npm install
cp .env.example .env
npm run dev
```

Site sur http://localhost:5173. Nécessite le backend (`../backend/`) et le
service d'authentification (`../../auth/`) démarrés en parallèle — voir le
README à la racine de `hcompany/` pour l'ordre de démarrage.

## Structure

```
src/
  pages/            Une page par route (Home, Payment, ServiceDetail,
                    CourseDetail, PartnerDetail, pages d'authentification...)
  components/
    sections/       Sections de la page d'accueil (Hero, Services,
                    Partners, Marketplace, Learning, FAQ...)
    layout/         NavBar, Footer
    admin/          Composants du tableau de bord admin
    dashboard/      Composants du tableau de bord partenaire
    auth/           Composants réutilisés par les pages d'authentification
    ui/             Primitives génériques (Skeleton, SectionReveal,
                    ErrorBoundary, NetworkStatusBanner...)
  context/          UserContext, LanguageContext, ThemeContext, ToastContext
  data/             Données structurelles (services.js, partners.js,
                    courses.js) — le texte reste dans i18n/translations.js
  lib/api.js        Client HTTP vers le backend
  i18n/             Traductions FR/EN
  test/             Tests automatisés (voir plus bas)
```

## Tests automatisés

```bash
npm test          # lance une fois, pour la CI
npm run test:watch  # relance à chaque modification, en développement
```

Ce qui est couvert pour l'instant (volontairement ciblé, pas exhaustif) :
- **Parité des traductions FR/EN** — vérifie que les deux langues ont
  exactement les mêmes clés, dans les deux sens. C'est exactement le genre
  de désynchronisation qui a causé plusieurs bugs pendant le
  développement de ce site.
- **Classes d'erreur de l'API** (`ApiError`, `NetworkError`) — vérifie
  qu'elles distinguent bien une erreur applicative (le serveur a répondu
  avec un statut d'erreur) d'une panne réseau (le serveur n'a pas répondu
  du tout).
- **Rendu de base d'une page** — la page 404 s'affiche sans planter.

Ce n'est **pas une suite exhaustive** — les parcours critiques (connexion,
paiement, candidature partenaire) ne sont testés que manuellement pour
l'instant. Étendre cette suite est une prochaine étape naturelle, pas un
prérequis pour utiliser le site tel quel.

## Personnalisation à prévoir

- Les descriptions des partenaires (`src/data/partners.js`, textes dans
  `i18n/translations.js` sous `companies.*`) sont écrites pour Lukondo,
  Cofismila, H-learning et U-Study — à ajuster si l'activité réelle de ces
  partenaires diffère.
- Les cours affichés par défaut (`src/data/courses.js`,
  `STATIC_FALLBACK_COURSES`) ne servent que de repli si le backend est
  injoignable — le vrai catalogue vient de l'API.

## Build de production

```bash
npm run build
```

Le code est découpé par page (chaque route se charge à la demande) — le
bundle initial ne contient que ce qui est nécessaire à l'affichage de la
page d'accueil, pas l'ensemble du site.
