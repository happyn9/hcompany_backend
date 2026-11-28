# Mission 0.3 — Blueprint de sécurisation des paiements et des flux financiers (version 2)

**Statut : PROPOSITION, version 2 du 28/11/2026. Aucun développement, aucune migration, aucun déploiement, aucune fusion. En attente de validation écrite avant le premier lot.**
Exclus et non modifiés : **H-Food** (totalement), **H-Money** (architecture, réserves, règles de change, grand livre), Flutter/Rafiki, variables de production.

**Documents liés (annexes de ce blueprint)**
| Annexe | Contenu |
|---|---|
| `docs/PAYMENTS_0_3_MIGRATION_TOPOLOGY.md` | Analyse complète du graphe Alembic et stratégie de compatibilité |
| `docs/PAYMENTS_0_3_PARTNER_TRANSITION.md` | Types d'accès partenaires et régime transitoire |
| `docs/PAYMENTS_0_3_CARGO_FINANCIAL_LIFECYCLE.md` | Colis : cycle financier, preuves, litiges, conditions de libération |
| `docs/PAYMENTS_0_3_MULTICURRENCY_POLICY.md` | Marchés Zambie/RDC et quatre notions de devise |
| `docs/PAYMENTS_SIMULATION_DEEP_AUDIT.md` | Preuves (constats PA-*, CG-*, SH-*, BIL-*, LOG-*, X-*, ROOT-*) |

## Historique des versions
| Version | Changements |
|---|---|
| v1 (28/11) | Six états, paquet `app/payments/`, grand livre, matrice par service |
| **v2 (28/11)** | **Quatre machines indépendantes** (paiement, service, comptabilité, versement) + litige ; grand livre source de vérité ; matrice des états financiers ; régime transitoire des partenaires ; cycle de vie des colis (libération immédiate refusée) ; politique multidevise par marché ; analyse des migrations (aucune fusion, aucun test H-Food modifié) ; **lot 2 prioritaire et autonome** ; dépendances réelles entre les huit lots ; H-Money exclu (plus d'import) |

## 0. Règles et décisions intégrées

| # | Règle définitive | Invariant |
|---|---|---|
| R1 | Aucun paiement simulé ne peut générer un solde retirable | I-1 |
| R2 | Aucun paiement simulé ne peut confirmer une commande, un colis ou une réservation payante en production | I-2 |
| R3 | Aucun abonnement partenaire payant sans confirmation réelle du prestataire | I-3 |
| R4 | Approbation admin et signature du contrat ne remplacent pas le paiement | I-3 |
| R5 | Un paiement incertain reste en attente de réconciliation, jamais refus définitif | I-4 |
| R6 | Aucun montant nul ou négatif n'est un paiement réussi ; gratuit = explicite | I-5 |
| R7 | **(28/11 14h)** Paiement, service, comptabilité et versement ont des **états indépendants** ; **le grand livre est la source de vérité** | I-6, I-7 |
| R8 | **(28/11 14h)** Pas de libération automatique des fonds de colis immédiatement après livraison sans contestation | annexe Colis |
| R9 | **(28/11 14h)** Aucune fusion des têtes Alembic, aucun test H-Food modifié | annexe migrations |
| R10 | **(28/11 14h)** Tarification par marché : Zambie ZMW, RDC USD | annexe devises |

Invariants techniques :
- **I-1** Un solde retirable ne se calcule qu'à partir d'écritures de l'espace comptable `REAL`, issues d'un paiement confirmé par le prestataire.
- **I-2** En production, le fournisseur simulé n'existe pas ; sans fournisseur réel, toute initiation répond « indisponible ».
- **I-3** « Service payant actif » n'est écrit que par un gestionnaire déclenché par une confirmation de paiement (ou un octroi explicite non payant).
- **I-4** Aucun code ne transforme un paiement `uncertain` en échec, ne libère définitivement une ressource ni ne rembourse avant réconciliation.
- **I-5** `amount > 0` à trois niveaux : schéma d'entrée, service de paiement, contrainte sur les tables de paiement.
- **I-6** Les quatre machines **ne s'écrivent pas entre elles** : elles communiquent par **événements** traités par des gestionnaires idempotents ; seul le module de paiement écrit dans le grand livre.
- **I-7** Les colonnes d'état historiques (`escrow_status`, soldes, `paid_at`) sont des **caches dérivés** du grand livre ; en cas d'écart, **le grand livre prévaut** et un écart de réconciliation est créé.

## 1. Architecture : quatre machines indépendantes et un grand livre

```
        événements                     événements                      événements
 [PAIEMENT]  ───────▶  [SERVICE]   [PAIEMENT] ───────▶ [COMPTABILITÉ]   [COMPTABILITÉ] ───────▶ [VERSEMENT]
 (prestataire)        (commande,    confirmé/échoué     (GRAND LIVRE,    dû/retirable            (retrait,
                       billet, …)                       source de        réservé                 preuve de
                                                        vérité)                                  versement)
                          ▲                                  ▲
                          └────── [LITIGE] (domaine) ────────┘  gel / décision → écritures
```

| Machine | Propriétaire | Question à laquelle elle répond | États | Qui peut la faire avancer |
|---|---|---|---|---|
| **Paiement** (`payment_intent`) | `app/payments` | Le prestataire a-t-il encaissé ? | `initialized` → `pending_provider` → `confirmed` / `failed` / `uncertain` → `needs_review` ; `unavailable` ; remboursement : `refund_pending` → `refunded` / `refund_failed` | **Prestataire seul** (callback signé, interrogation) |
| **Service** | chaque service | Le service est-il rendu, actif, livré ? | statuts métier existants (`confirmed`, `in_transit`, `delivered`…) | Règles métier ; passe à « payé/confirmé » **uniquement** via le gestionnaire de l'événement `payment.confirmed` |
| **Comptabilité** (grand livre) | `app/payments/ledger` | À qui appartient quel argent, dans quel état ? | **Pas d'états : des écritures** immuables ; les compartiments se **calculent** | Événements validés ; jamais saisie libre |
| **Versement** (`payout`) | `app/payments` + écrans de retrait | L'argent est-il réellement parti vers le bénéficiaire ? | `requested` → `approved` → `sent` → `confirmed` ; `rejected` / `failed` / `reversed` | Admin (preuve de versement obligatoire) ; plus tard le prestataire |
| **Litige** (domaine) | chaque service | Un désaccord bloque-t-il la libération ? | `opened` → `evidence` → `decided` → `executed` / `closed` | Parties, système, admin |

### 1.1 Matrice des états financiers (les cinq notions demandées)

| Notion | Machine propriétaire | Nature | Source de vérité | Condition d'entrée | Preuve exigée | Réversible ? | Écriture type |
|---|---|---|---|---|---|---|---|
| **Paiement confirmé** | Paiement | **Fait** attesté par le prestataire | `payment_intent.state = confirmed` + preuve | Callback signé **et** vérification auprès du prestataire (statut, montant, devise) | `provider_reference` du prestataire, horodatage de vérification | Non (un remboursement est une opération distincte) | Événement `payment.confirmed` |
| **Fonds détenus en séquestre** | Comptabilité | **Solde** calculé | Grand livre, compartiment `ESCROW` (espace `REAL`) | Paiement confirmé | Lien `intent_id` | Oui : par `release` ou `refund` | `T1` : Dr `PROVIDER_CLEARING` / Cr `ESCROW` |
| **Fonds libérés et dus au bénéficiaire** | Comptabilité | **Solde** calculé | Compartiment `PAYABLE:{bénéficiaire}` | Événement métier + conditions de libération du service (ex. colis : fenêtre écoulée, §annexe Colis) | `hold` existant, aucun gel | Non, sauf contre-passation d'administration (`adjustment`) | `T2` : Dr `ESCROW` / Cr `PAYABLE` + Cr `COMMISSION` |
| **Fonds retirables** | Comptabilité (calcul) | **Dérivé**, jamais saisi | `PAYABLE:{b}` − `PAYOUT_PENDING:{b}` − gels, **espace `REAL` uniquement** | Libérés, non simulés, non gelés, devise unique | Provenance `REAL` | Oui (un gel retire de ce solde) | Aucune écriture : lecture |
| **Fonds effectivement versés** | Versement | **Fait** attesté | `payout.state = confirmed` + écriture `DISBURSED` | Retrait approuvé **et** preuve de versement | `provider_reference` du versement ou justificatif admin daté et signé | Non (annulation = nouvelle écriture `payout_reversed`) | `T4` : Dr `PAYOUT_PENDING` / Cr `PROVIDER_CLEARING` |

Autres notions : **service confirmé** = machine Service (jamais déduit d'un solde) ; **fonds gelés** = marqueur de litige sur le séquestre (blocage de `T2`), pas un déplacement d'argent.

### 1.2 Grand livre : source de vérité
- **Double entrée** : chaque transaction comporte au moins deux lignes de somme nulle ; **append-only** (aucune modification, aucune suppression) ; contrainte d'unicité `(intent_id, type, objet)` pour l'idempotence.
- **Comptes** : `PROVIDER_CLEARING` (argent chez le prestataire), `ESCROW`, `PAYABLE:{bénéficiaire}`, `COMMISSION`, `PAYOUT_PENDING:{bénéficiaire}`, `REFUND_DUE`, par **devise** (jamais de somme entre devises).
- **Trois espaces** étanches : **`REAL`** (preuve du prestataire), **`SIMULATED`** (paiement simulé hors production), **`LEGACY_UNVERIFIED`** (existant non prouvé). **Seul `REAL` alimente les fonds retirables** (R1). Le passage de `LEGACY_UNVERIFIED` vers `REAL` n'est possible que par une écriture d'ajustement **approuvée par un admin avec preuve du prestataire**.
- **Transactions** : `T1` confirmation ; `T2` libération (net + commission) ; `T3` réservation de retrait (`PAYABLE` → `PAYOUT_PENDING`) ; `T4` versement confirmé ; `T5` remboursement ; `T6` contre-passation de retrait refusé ; `T7` ajustement approuvé.
- **Caches** (I-7) : `escrow_status`, soldes de portefeuille et `paid_at` sont des projections ; un travail de réconciliation compare projections et grand livre ; l'écart ouvre un `payment_discrepancy`.

### 1.3 Matrice événements × machines (qui change quoi)

| Événement | Paiement | Service | Grand livre | Versement | Litige |
|---|---|---|---|---|---|
| Paiement initialisé | `initialized` → `pending_provider` | reste en attente, ressources retenues jusqu'à `expires_at` | — | — | — |
| Prestataire indisponible (production sans clés) | `unavailable` | **non** confirmé, ressources libérées | — | — | — |
| Paiement incertain | `uncertain` | en attente, **ressources conservées** | — | — | — |
| Paiement confirmé | `confirmed` | gestionnaire : confirmé/actif, notifications | `T1` | — | — |
| Paiement refusé | `failed` | gestionnaire : ressources libérées | — | — | — |
| Callback tardif après `failed` | `failed` (inchangé) | **inchangé** | — | — | **écart** de réconciliation (client débité) |
| Service rendu (livraison, arrivée…) | inchangé | statut métier | — (jamais de libération à cet instant pour les colis) | — | fenêtre ouverte |
| Conditions de libération remplies | inchangé | inchangé | `T2` | — | — |
| Litige ouvert | inchangé | drapeau litige | gel (blocage de `T2`) | — | `opened` |
| Litige tranché | inchangé | statut selon décision | `T2` / `T5` / partage | — | `decided` → `executed` |
| Retrait demandé | — | — | `T3` (réservation atomique) | `requested` | — |
| Retrait approuvé | — | — | — | `approved` | — |
| Versement envoyé / confirmé | — | — | `T4` à la confirmation | `sent` → `confirmed` | — |
| Retrait rejeté | — | — | `T6` | `rejected` | — |
| Remboursement | `refund_pending` → `refunded` | statut annulé | `T5` à la confirmation du prestataire | — | — |

## 2. Composants communs

### 2.1 Paquet `app/payments/` (nouveau, **sans aucune dépendance vers `app/money`**)
| Module | Rôle |
|---|---|
| `models.py` | `PaymentIntent`, `PaymentEvent`, `LedgerTransaction`/`LedgerEntry`, `Payout` (suivi de versement), `PaymentDiscrepancy`, `ReconciliationRun`, `PartnerAccessGrant`, `PartnerOfferTerms`, `PaymentFxRate` (métadonnées propres, environnement Alembic dédié) |
| `state.py` | Transitions par comparaison-et-échange ; matrice des transitions autorisées |
| `providers/` | Interface (`initiate`, `check`, `refund`, `verify_signature`, `parse_callback`), `SimulatedProvider` **hors production uniquement**, adaptateurs réels. **Conception inspirée** du module de paiement de H-Money (lecture) mais **copie indépendante** : H-Money n'est pas importé |
| `service.py` | `create_intent`, `confirm_from_callback`, `sync_intent`, `mark_uncertain`, `expire_intent` |
| `handlers.py` | Registre des gestionnaires par service : seul endroit qui active un service payant (I-3) |
| `ledger.py` | `post(transaction)`, `balances()`, `reserve_payout()`, `settle_payout()` |
| `reconcile.py` | Interrogation des intents en attente, rapprochement avec le relevé du prestataire, projection ↔ grand livre |
| `router.py` | `GET /payments/{reference}` (+`?refresh=true`), `POST /payments/webhooks/provider` (signé) |

### 2.2 Preuve de paiement
`confirmed` n'est écrit que si **(a)** le callback est signé, dédoublonné par `(provider, provider_event_id)`, **et (b)** le prestataire confirme par interrogation statut, montant et devise. `provider_reference` = identifiant du prestataire, **jamais** notre référence interne (cas Colis, CG-2). Une réponse synchrone d'initiation signifie « accepté pour traitement », jamais « payé » (le mobile money est asynchrone).

### 2.3 Idempotence (trois niveaux)
1. En-tête `Idempotency-Key` obligatoire sur les initiations ; unique `(payeur, service, clé)` ; corps différent avec la même clé ⇒ 422.
2. Un seul intent non terminal par `(payeur, service, objet)` (index unique partiel) ⇒ 409 avec la référence existante.
3. Effets : callbacks dédoublonnés ; gestionnaires et grand livre protégés par unicité : une confirmation reçue deux fois produit **un** service confirmé et **une** transaction `T1`.

### 2.4 Paiement incertain
Déclencheurs : exception, délai, réponse illisible, statut inconnu. Effet : `uncertain`, ressources (stock, sièges, capacité, dates) **conservées** jusqu'à `reconcile_deadline` (paramètre), message « ne payez pas une seconde fois ». Sortie : réconciliation ⇒ `confirmed` ou `failed` ; au-delà de l'échéance ⇒ `needs_review` (humain). Jamais de remboursement ni de libération automatique d'un incertain.

### 2.5 Réconciliation
En ligne (`?refresh=true`) ; planifiée (`scripts/reconcile_payments.py`, toutes les N minutes) ; quotidienne (relevé prestataire ↔ intents, projections ↔ grand livre). Classes d'écart : `paid_at_provider_not_confirmed` (critique : client débité sans service), `confirmed_not_found_at_provider` (critique : service sans argent), `amount_mismatch`, `duplicate`, `callback_after_failed`, `projection_mismatch`. Aucun correctif automatique des fonds. **Dépendance** : l'application n'a aucun ordonnanceur (`lifespan`, `main.py` 171-174) : cron externe nécessaire (D-3).

### 2.6 Gratuité, montants, devises
Total ≤ 0 : jamais de paiement. Gratuit = **état explicite** (offre `free`, logement « sur demande » sans réservation payante directe) ; détail : annexe Partenaires et §4.7. Devises, marchés : annexe multidevise.

### 2.7 API uniforme des initiations
`202 Accepted` + `{reference, state, next_action, poll_url}` ; jamais « payé » en réponse ; échec définitif 402 ; indisponible 503 ; incertain 202 + message dédié.

## 3. Matrice des changements par service

Les tables existantes **ne reçoivent aucune nouvelle colonne** (stratégie de migration : voir §5 et l'annexe) ; les liens se font par `(service, objet)` côté paiements.

### 3.1 Passerelle commune
| Domaine | Changements |
|---|---|
| Backend | `app/payments/` (§2.1) ; l'actuelle `services/payments/gateway.py` reste un adaptateur de compatibilité (durcie au **lot 2**) puis est retirée (lot 7) ; refus des montants ≤ 0 |
| Frontend | Composant `PaymentStatus` + hook de polling `usePaymentStatus(reference)` ; `Idempotency-Key` dans `lib/api.js` ; aucune mention « confirmé » hors état `confirmed` |
| BDD | Environnement Alembic dédié (annexe migrations) : `payment_intent`, `payment_event`, `ledger_*`, `payout_settlement`, `payment_discrepancy`, `payment_reconciliation_run`, `payment_fx_rate` |
| Migration | Option 0 : environnement séparé, graphe principal inchangé |
| Tests | État, callbacks, idempotence, incertain, production sans clés, montants, SQLite + PostgreSQL |

### 3.2 Shopping (`app/shopping`, `pages/shop/ShopCheckout.jsx`, `SellerDashboard.jsx`, `ShoppingAdminPanel.jsx`)
| Domaine | Changements |
|---|---|
| Backend | `buyer.py` 29-69 : intent + 202 ; `mark_group_paid` (`services.py` 437-459) devient le gestionnaire `payment.confirmed` (stock, notifications vendeur/acheteur **après** confirmation) ; `payment.failed` libère le stock ; `wallet()` (594-612), `request_payout` (`seller.py` 415-430), `update_payout` (`admin.py` 266-282) sur le grand livre |
| Frontend | Écran d'attente/incertain/échec ; trois compartiments dans `SellerDashboard.jsx` 259-274 (séquestre / dus / retirables) + versés ; provenance et preuve dans `ShoppingAdminPanel.jsx` 60-132 |
| BDD | Tables annexes uniquement (`payout_settlement`) |
| Tests | Production sans clés ⇒ 503, 0 commande payée, stock restitué, 0 notification ; callback ⇒ commande payée une fois ; double clic ; incertain garde le stock ; retraits concurrents (PG) |

### 3.3 Transport — Billets (`app/transport`, `TransportBook.jsx`, `OperatorTabs.jsx` 350-359, `TransportAdminPanel.jsx`)
| Domaine | Changements |
|---|---|
| Backend | `public.py` `book` 104-133 : intent + 202 ; `mark_paid` (`services.py` 221-232) → gestionnaire (billet confirmé, QR, notifications **après** confirmation) ; `fail_booking` → `payment.failed` ; sièges conservés pendant l'attente/incertain (`expire_overdue` 313 ne libère pas un incertain) ; `wallet` 346-358, retraits (`operator.py` 346-361, `admin.py` 155-165) sur le grand livre ; litiges existants (`public.py` 175-182, `admin.py` 124-140) inchangés dans leur principe, branchés sur gel/libération |
| Frontend | `TransportBook.jsx` : attente, polling, incertain ; billet « en attente de paiement » tant que non confirmé ; compartiments et provenance côté agence/admin |
| BDD | Tables annexes |
| Tests | Production simulée ⇒ jamais `confirmed`, sièges restitués ; incertain garde les sièges ; QR/notification seulement après confirmation ; wallet exclut simulé ; régression transport |

### 3.4 Transport — Colis (`app/transport/cargo.py`, `CargoBook.jsx`) — voir annexe Colis
| Domaine | Changements |
|---|---|
| Backend | `book` 345-402 : intent + 202 ; confirmation, **émission du code de livraison**, notifications 387-393 → gestionnaire ; expiration des colis `pending_payment` (CG-3) ; **`deliver` (585-596) ne libère plus les fonds** : démarre la fenêtre ; libération par règle (annexe, lot 5) ; mécanisme de litige et preuves ; `cargo_wallet` 305-308 supprimé au profit du grand livre ; limite de tentatives sur le code (hypothèse à confirmer) |
| Frontend | `CargoBook.jsx` : attente/polling ; code affiché seulement après confirmation ; suivi de la fenêtre et du litige ; confirmation destinataire (lien) |
| BDD | Tables annexes : litiges, preuves, paramètres de fenêtre |
| Tests | Annexe Colis (CG-AC-1 à 10) |

### 3.5 H-Lodging (`app/lodging`, `LodgeBook.jsx`, `HostTabs.jsx` 218-230, `LodgeAdminPanel.jsx`)
| Domaine | Changements |
|---|---|
| Backend | `guest.py` `book` 27-68 : intent + 202 ; `mark_paid` (`services.py` 312-330) → gestionnaire (séquestre, `_confirm` si instantanée, **notification hôte après confirmation**) ; dates retenues jusqu'à échec confirmé ; `quote_stay` (216-221) refuse `total ≤ 0` ; flux « sur demande » pour `price_per_night = 0` (ferme LOG-2 par un test d'exécution) ; `wallet` 462-472, retraits (`host.py` 452-466) sur le grand livre |
| Frontend | `LodgeBook.jsx` : attente/polling ; bouton « Demander un prix » pour les annonces à 0 ; compartiments ; provenance admin |
| Tests | Production simulée ⇒ réservation jamais payée, dates libres, hôte non notifié ; annonce à 0 ; instantanée vs demande ; incertain |

### 3.6 Partenaires (`app/routers/partners.py`, `Payment.jsx`, `AllRequestsPanel.jsx`) — voir annexe Partenaires
| Domaine | Changements |
|---|---|
| Backend | `create_payment` 1038-1088 : offre `accepted` exigée (PA-5), un seul intent non terminal par offre, 202/402/503 (plus de 201 inconditionnel, PA-4) ; **accès calculé à partir des octrois** (`my_billing` 942) : `paid_subscription`, `free_offer`, `trial`, `admin_authorization`, `legacy_transitional` ; bascule transitoire sans perte d'accès ; devise et marché par offre ; journal d'activité du résultat du paiement |
| Frontend | `Payment.jsx` 248-249, 357 : lecture de l'état, « Paiement confirmé » seulement si `confirmed` ; affichage du type d'accès ; écran admin « Accès partenaires » |
| BDD | `partner_access_grant`, `partner_offer_terms` (tables annexes) |
| Tests | PT-1 à PT-9 (annexe) |

### 3.7 Séquestres, soldes et retraits (transversal)
| Domaine | Changements |
|---|---|
| Backend | Les trois `wallet()` et `cargo_wallet()` deviennent des lectures du grand livre (par bénéficiaire et par devise) ; libérations rebranchées : Shopping `services.py` 555, Billets 266/276, Colis 594 (remplacé par la règle de fenêtre), Logement 385/430 ; `T3` atomique pour les retraits (verrou PG, CAS ailleurs) ; validation admin avec contrôle de provenance et preuve de versement obligatoire ; remboursements via le prestataire |
| Frontend | Quatre compartiments (séquestre, dus, retirables, versés) dans `SellerDashboard`, `OperatorTabs`, `HostTabs` ; vue admin des écarts de réconciliation ; provenance par retrait |
| Tests | Invariants du grand livre, retraits concurrents (PG), simulé = 0 retirable en tout environnement, libération sans `hold` = no-op |

### 3.8 Exclusions
H-Learning : durci en Mission 0.1, migrera plus tard vers l'intent commun. Tourisme : n'appelle pas la passerelle. **H-Food** (`app/restaurant`, `api.resto.checkout`) et **H-Money** (`app/money`) : hors périmètre, non modifiés, non importés.

## 4. Stratégie de tests
| Famille | Contenu | Environnement |
|---|---|---|
| Unitaires | Transitions d'état, CAS, validations de montant et de devise | SQLite |
| Invariants du grand livre | Somme nulle par transaction, aucun solde négatif, `retirables ≤ dus`, espaces étanches, aucune somme entre devises | SQLite + PG |
| Callback prestataire | Signature valide/invalide, rejeu, hors-ordre, doublon, montant/devise divergents, callback après `failed` | SQLite + PG |
| Matrice « production » | Pour chacun des 5 flux (+ non-régression H-Learning) : sans clés ⇒ 503, aucun service confirmé, aucune notification de succès, ressources libérées, aucun solde | SQLite |
| Incertain | Exception/timeout ⇒ `uncertain`, ressources conservées, pas de remboursement, réconciliation ⇒ `confirmed`/`failed`, `needs_review` | SQLite + PG |
| Concurrence | Double clic, webhook + polling, deux retraits, webhook vs réconciliation, job de libération + clic (`tests/threads_util.run_parallel`) | **PostgreSQL** jetable |
| Migration | Environnement paiements : up/down/up, aucune table existante modifiée, graphe principal inchangé (MIG-1 à 7) | SQLite + PG jetable |
| Architecture | Test statique : aucune écriture de statuts « payé »/`escrow` ou de lignes de grand livre hors `app/payments/` ; **aucun import de `app/money`** | SQLite |
| Frontend | vitest (états, polling, `Idempotency-Key`, aucun « confirmé » hors `confirmed`) + navigateur aux 4 tailles (1366×768, 768×1024, 390×844, 360×800) | vitest + Playwright |
| Régression | Suite complète fichier par fichier (`run_tests.sh`), décompte exact avant/après ; **tests H-Food/H-Money rejoués sans modification** | SQLite |
| Contrat prestataire | Fixtures enregistrées ; **non exécutable par moi sans réseau sortant** : recette par le propriétaire | à valider par vous |

Règle de compte rendu : aucun test déclaré réussi sans exécution ; les tests non exécutés sont listés comme tels.

## 5. Stratégie de migration (résumé ; détail : annexe)
- **Aucune fusion des têtes, aucun test H-Food modifié.** Les tests H-Food n'acceptent que `{a1d5c8e2f4b7, c6e3d4f5a7b8}` comme têtes ; toute nouvelle révision du graphe actuel les fait échouer (analyse statique, à confirmer par exécution).
- **Option 0 recommandée** : environnement Alembic dédié aux paiements (table de version propre, métadonnées propres), tables **annexes** seulement, aucune colonne sur les tables existantes ; fail-closed si le schéma de paiement est absent ; coût : une ligne dans `entrypoint.sh` (décision M-1 du propriétaire).
- Le **lot 2 n'a besoin d'aucune migration**.
- Rétro-classification des données existantes par script en lecture seule par défaut, archive, rejouable, **sans modifier les tables existantes**.
- Migrations jouées uniquement sur bases jetables ; la production n'est jamais touchée par cette mission.

## 6. Les huit lots (ordre conservé ; lot 2 = priorité immédiate)

### 6.1 Graphe des dépendances réelles
```
L0 ─────────────────────────────────────────────────────────────┐ (données pour L3, L4, L5)
L2 ── autonome (aucune dépendance) ── à faire EN PREMIER ───────┤
L1 ──(décision M-1)── L3 ──┐                                    │
 │                         ├──▶ L5 ──(prestataire réel DEP-1)──▶ L6 ──▶ L7
 └─────────────── L4 ──────┘      (L4 : décisions partenaires P-*, devises CU-*)
```
| Lot | Dépend durement de | Dépend mollement de | Peut avancer en parallèle de |
|---|---|---|---|
| **L0** Audit et décisions | — | — | tous |
| **L2** Blocage du simulé en production | **rien** (aucune migration, aucune table) ; une décision : où tournent les démonstrations (§6.3) | L0 (chiffrer l'existant) | L0, L1 |
| **L1** Socle `app/payments/` dormant | décision **M-1** (environnement Alembic séparé) | L2 (même zone de code) | L0, L2 |
| **L3** Services sur l'intent | **L1** | L2 (filet qui reste jusqu'au lot 7) ; L0 (paramètres colis) | L4 |
| **L4** Partenaires | **L1** ; décisions P-1 à P-6 et CU-1, CU-6 | L0 (liste des partenaires) | L3 |
| **L5** Grand livre actif, retraits, libérations | **L1**, **L3** (les services émettent les `hold`) ; décisions colis C-1 à C-9 | L4 ; L0 (rétro-classification) | — |
| **L6** Remboursements réels, réconciliation quotidienne, RDC | **L5** et **prestataire réel (DEP-1)** ; décisions CU-2 à CU-5 | L4 | — |
| **L7** Clôture (retrait de l'ancien chemin) | **L3, L4, L5, L6** terminés, écarts résolus | — | — |

Corrections par rapport à la v1 : le lot 2 **ne dépend plus** du lot 1 ; le lot 4 **ne dépend plus** du lot 3 ; le lot 5 dépend du lot 3 (il faut des `hold` avant de calculer des soldes).

### 6.2 Principe commun à chaque lot
Chaque lot : branche dédiée, PR **non fusionnée**, aucun déploiement, rapport avec comptes de tests exacts (exécutés / non exécutés), `git diff --stat`, vérification navigateur aux 4 tailles pour toute interface, puis **point de validation écrit du propriétaire** avant le lot suivant. Retour arrière : annulation de la PR (aucune donnée de production n'est touchée par un lot).

### 6.3 Lot 2 — PRIORITÉ IMMÉDIATE : bloquer les paiements simulés en production

**Objectif** : fermer la faille « un paiement simulé confirme un service en production » avec le **plus petit changement possible**, sans nouvelle table ni migration, sans dépendre du socle.

**Contenu proposé (rien n'est fait)**
| # | Changement | Fichier(s) |
|---|---|---|
| a | En production, `charge()` ne renvoie **jamais** un succès simulé : résultat `success=False, unavailable=True` avec message clair | `services/payments/gateway.py` (37-61, 77-78) |
| b | Montant ≤ 0 ou non numérique ⇒ jamais un succès | idem |
| c | Les cinq appels traduisent « indisponible » en **503** avec libération des ressources (déjà prévue par leur branche d'échec) | `shopping/routers/buyer.py` 54-58 ; `transport/routers/public.py` 123-127 ; `transport/cargo.py` 380-386 ; `lodging/routers/guest.py` 51-55 ; `routers/partners.py` 1081-1088 |
| d | **Partenaires : honnêteté de l'état** — un paiement `failed`/indisponible ne renvoie plus 201 et la page n'affiche plus « Paiement confirmé » (sans cela, le lot 2 ferait croire à tous les partenaires qu'ils ont payé : PA-4) | `partners.py` 1038-1088 ; site `pages/Payment.jsx` 248-249, 357 |
| e | Pas d'échec de démarrage en production sans clés (cela arrêterait toute l'API) : mode « paiements indisponibles » seulement | `config.py` : aucun changement bloquant |
| f | Script d'audit **lecture seule** des fonds simulés déjà créés (X-1) | `scripts/` (nouveau, lecture seule) |

**Hors lot 2** : grand livre, retraits (X-1 reste ouvert jusqu'au lot 5), intents, nouvelles tables, partenaires/accès, colis (libération), multidevise.
**Mesure opérationnelle associée (décision, pas du code)** : tant que le lot 5 n'est pas livré, **geler les validations de retraits** pour les fonds d'origine non prouvée.

**Critères d'acceptation du lot 2**
| # | Critère | Vérification |
|---|---|---|
| L2-1 | En production sans clés, chacun des 5 flux répond 503 ; 0 commande/billet/colis/réservation payés ; ressources restituées ; 0 notification de succès | Test paramétré par flux (SQLite) |
| L2-2 | `charge()` ne renvoie jamais `success=True` avec `simulated=True` quand `is_production` est vrai (toutes les méthodes) | Test unitaire |
| L2-3 | Montants 0, négatifs, NaN ⇒ pas de succès | Test unitaire |
| L2-4 | Hors production, comportement actuel inchangé (la démonstration fonctionne) | Tests existants + test dédié |
| L2-5 | Partenaires : paiement non réussi ⇒ erreur d'API (jamais 201) et aucune mention « Paiement confirmé » à l'écran | Test API + vitest + navigateur aux 4 tailles |
| L2-6 | L'API démarre en production sans clés | Test de configuration |
| L2-7 | Aucune migration, aucune table, aucune modification de H-Food/H-Money ; `git diff --stat` limité aux fichiers listés | Revue du diff |
| L2-8 | H-Learning inchangé (tests existants verts, décompte exact) | Suite complète |

**Tests** : unitaires passerelle ; matrice « production » des 5 flux ; vitest `Payment.jsx` ; régression complète fichier par fichier.
**Effet de bord à décider (D-13)** : après le lot 2, **toute démonstration qui tourne sur un environnement « production » cessera de simuler les paiements** (la prise de vue de la démo 15 s montre des paiements en mode démonstration). Les démonstrations doivent tourner sur un environnement non production. **À confirmer par vous avant le lot.**
**Point de validation** : rapport + PR + vérification que la production refuse bien le simulé sur une base jetable ; votre validation écrite avant le lot 1 ou 3.

### 6.4 Les autres lots (contenu, critères, tests, validation)

| Lot | Contenu | Critères d'acceptation (IDs) | Tests clés | Point de validation |
|---|---|---|---|---|
| **L0** Audit et décisions (lecture seule) | Requêtes d'audit des données existantes (fonds simulés/non vérifiés, retraits déjà payés, partenaires abonnés, durées et valeurs des colis, offres sans devise) ; fixation des paramètres ; réponses aux décisions §9 | AC-21 | Aucun (lecture) | Rapport chiffré validé par vous |
| **L1** Socle dormant | `app/payments/` + environnement Alembic séparé + fournisseur simulé hors production ; **non branché** aux services | AC-09, 10, 11, 12, 13, 14, 15, 16, 30 ; MIG-1 à 7 ; FX-1, 3, 7 | Machine d'états, callbacks, idempotence, grand livre, migration up/down, tests H-Food inchangés | Code dormant revu ; confirmation que les tests H-Food passent sans modification |
| **L3** Services sur l'intent | Colis, Billets, Shopping, Logement : intents, gestionnaires, 202, attente/polling côté site ; **Colis : `deliver` ne libère plus** (fonds conservés en attendant L5, échec sûr) | AC-01 à 03, 17, 18, 19, 24 | Matrice production, concurrence PG, incertain, expiration colis, annonce à 0 | Parcours de bout en bout en recette simulée hors production |
| **L4** Partenaires | Octrois d'accès, bascule transitoire, activation payante liée au paiement confirmé, offres gratuites explicites, marché/devise des offres | AC-06, 07, 27 ; PT-1 à 9 ; FX-2, 6 | Bascule sans perte (comptage), paiement simulé, essai unique, autorisation admin | Liste des partenaires et conversions validée par vous |
| **L5** Grand livre actif | Écritures `T1` à `T7`, soldes en lecture du grand livre, retraits atomiques avec provenance, **libération des colis par fenêtre + preuves + litiges**, rétro-classification `LEGACY_UNVERIFIED` | AC-04, 05, 13, 25, 26, 28 ; CG-AC-1 à 10 ; FX-3, 8 | Invariants, retraits concurrents PG, libération unique, litiges | Revue des soldes existants reclassés ; paramètres de fenêtre fixés par vous |
| **L6** Remboursements et réconciliation | Remboursements réels via prestataire, réconciliation quotidienne, file d'écarts, ouverture du marché RDC/USD, alignement H-Learning | AC-08, 16 ; FX-4, 5 | Réconciliation, remboursements, écarts, USD | Recette prestataire réelle par vos soins (DEP-1) |
| **L7** Clôture | Retrait de l'ancien chemin `gateway.charge`, mode strict, revue finale, clôture du chantier paiements | AC-22, 23 (+ tous) | Régression complète, test d'architecture | Bilan final et votre clôture |

## 7. Dépendances (réelles) et risques

### 7.1 Dépendances externes
| # | Dépendance | Effet si absente |
|---|---|---|
| DEP-1 | Prestataire(s) réel(s) et compte marchand (Zambie ; RDC/USD), API statut/remboursement/relevé/versement | Aucune preuve réelle : la production reste « indisponible » ; L6 bloqué |
| DEP-2 | URL publique de webhook et secret (variables de production : jamais lues ni modifiées par moi) | Pas de confirmation asynchrone |
| DEP-3 | Ordonnanceur externe pour la réconciliation | Incertains résolus à la main |
| DEP-4 | Décision M-1 (environnement Alembic séparé, ligne dans `entrypoint.sh`) | L1 et tout ce qui suit bloqués |
| DEP-5 | Accès réseau sortant pour tester un prestataire | Contrats prestataire non exécutés par moi |
| DEP-6 | Avis juridique : détention de fonds clients, séquestre, change, versement (Zambie, RDC) | Risque réglementaire non évalué ici |
| DEP-7 | Prestataire SMS (confirmation destinataire des colis) | Preuve E-2 indisponible |

### 7.2 Risques
| # | Risque | Gravité | Atténuation |
|---|---|---|---|
| RK-1 | Cinq corrections incohérentes | Haute | Architecture unique, test d'architecture, lots séquencés |
| RK-2 | Le lot 2 arrête les démonstrations en « production » | Moyenne | Décision D-13 avant le lot ; environnement de démonstration non production |
| RK-3 | Coupure d'accès à de vrais partenaires | Haute | Bascule `legacy_transitional`, aucun retrait automatique |
| RK-4 | Client payé mais service refusé (callback tardif, incertain) | Haute | `uncertain`/`needs_review`, écarts, aucun échec automatique |
| RK-5 | Fonds simulés ou non vérifiés déjà retirés ou retirables | Moyenne (à chiffrer en L0) | Audit, `LEGACY_UNVERIFIED`, gel opérationnel des retraits jusqu'à L5 |
| RK-6 | Aucun prestataire réel : rien de prouvable en conditions réelles | Haute | Livraison avec simulé hors production ; recette par vous |
| RK-7 | Courses (retraits, confirmations, libérations) | Haute | CAS, verrous PG, tests de concurrence PG |
| RK-8 | Devises : offres existantes sans devise, RDC sans moyen de paiement codé | Moyenne | `unknown` ⇒ paiement refusé jusqu'à confirmation ; annexe devises |
| RK-9 | Deux environnements Alembic à exploiter | Moyenne | Un script d'entrée, tests MIG, plan de convergence |
| RK-10 | Colis : fenêtre trop courte ou trop longue (litiges vs trésorerie des agences) | Moyenne | Durées issues de données (L0), paramètres administrables, échec sûr |
| RK-11 | UX asynchrone du mobile money (attente de validation sur le téléphone) | Moyenne | Écran d'attente, polling, message d'incertitude |
| RK-12 | Journal d'audit admin reporté en P1 : validations de retraits non journalisées complètement | Moyenne | `processed_by_user_id`, provenance et preuve conservés dans `payout_settlement` |
| RK-13 | Régression sur les modules existants | Moyenne | Régression complète, H-Food/H-Money non touchés |

## 8. Critères d'acceptation globaux (vérifiables)
| # | Critère | Vérification | Lot |
|---|---|---|---|
| AC-01 | R2 : en production sans clés, les 5 flux répondent 503 ; 0 service confirmé | Test paramétré ; SQL `count(*) where status in (paid, confirmed)` = 0 | L2, L3 |
| AC-02 | 0 notification de succès dans ces cas | Table des notifications vide ; 0 e-mail | L2, L3 |
| AC-03 | Ressources restituées après échec, **conservées** après incertain | Tests de disponibilité | L2 (échec), L3 (incertain) |
| AC-04 | R1 : solde alimenté uniquement par `SIMULATED`/`LEGACY_UNVERIFIED` ⇒ `retirables = 0` en tout environnement ; retrait ⇒ 422 | Tests wallet + retrait | L5 |
| AC-05 | Validation admin d'un retrait de provenance non `REAL` refusée techniquement | Test API admin | L5 |
| AC-06 | R3/R4 : partenaire avec offre payante, contrat signé, approbation, **sans paiement confirmé** ⇒ non abonné (hors octroi transitoire) | Test `my_billing` | L4 |
| AC-07 | Offre `free` explicite ⇒ accès ; offre à prix 0 non marquée ⇒ refus | Tests | L4 |
| AC-08 | R5 : un `uncertain` n'est jamais passé en `failed` ni remboursé par le code ; sortie seulement par prestataire ou `needs_review` | Tests d'état + recherche statique | L1, L6 |
| AC-09 | R6 : montants 0, négatif, NaN, arrondi à 0,00 refusés (entrée, service, contrainte) | Tests unitaires + contrainte | L1, L2 |
| AC-10 | Idempotence : même clé ⇒ un intent, un service, une transaction `T1`, y compris webhook doublé + polling concurrent | Tests PG | L1, L3 |
| AC-11 | Aucun intent `confirmed` sans `provider_reference` du prestataire et `proof_verified_at` ; ≠ référence interne | Contrainte + test | L1 |
| AC-12 | Le fournisseur simulé est impossible en production (construction et exécution) | Tests de configuration | L1, L2 |
| AC-13 | Séparation : service confirmé impossible sans intent confirmé ; `T2` impossible sans `T1` ; `retirables` jamais saisi | Tests + contraintes | L1, L5 |
| AC-14 | Test d'architecture : aucune écriture d'état « payé »/`escrow`/grand livre hors `app/payments/` ; aucun import de `app/money` | Test statique | L1, L7 |
| AC-15 | Callback : signature invalide rejetée ; rejeu sans effet ; callback après `failed` ⇒ écart, aucune activation | Tests | L1 |
| AC-16 | Réconciliation : un incertain confirmé active le service **une seule fois** ; un écart `paid_at_provider_not_confirmed` apparaît en file admin | Tests avec fournisseur de test | L1, L6 |
| AC-17 | Frontend : « Paiement confirmé » seulement si `confirmed` ; états attente/incertain/échec ; `Idempotency-Key` envoyé | vitest + navigateur 4 tailles | L2 (partenaires), L3 |
| AC-18 | Colis `pending_payment` expire selon l'état de l'intent ; aucun code de livraison avant confirmation | Tests Colis | L3 |
| AC-19 | Logement à prix 0 : aucune réservation payante directe ; flux « sur demande » | Test d'exécution (ferme LOG-2) | L3 |
| AC-20 | Migration sans perte : up/down/up de l'environnement paiements sur PG jetable ; comptages identiques | Tests de migration | L1 |
| AC-21 | Données existantes : aucune ligne supprimée ; rapport chiffré ; fonds existants classés `SIMULATED`/`LEGACY_UNVERIFIED` | Audit + comptages | L0, L5 |
| AC-22 | Régression : suite complète fichier par fichier, décompte exact ; **tests H-Food/H-Money sans modification de code ni de migration** | `run_tests.sh` | tous |
| AC-23 | Aucun `.env` lu ou commité, aucune variable ni base de production touchée, aucun déploiement, aucune fusion | Revue de diff + déclaration | tous |
| AC-24 | Indépendance des machines : le service ne peut pas écrire le grand livre ; le paiement ne peut pas écrire le statut métier hors gestionnaire | Test statique + tests d'événements | L1, L3 |
| AC-25 | Grand livre source de vérité : toute projection (`escrow_status`, solde, `paid_at`) écartée du grand livre ouvre un écart et **le grand livre prévaut** | Test de réconciliation | L5 |
| AC-26 | Espaces `REAL`/`SIMULATED`/`LEGACY_UNVERIFIED` étanches ; seule `REAL` alimente les retirables ; reclassement seulement par ajustement approuvé avec preuve | Tests d'invariants | L5 |
| AC-27 | Régime partenaires : PT-1 à PT-9 (annexe) | Tests de l'annexe | L4 |
| AC-28 | Colis : CG-AC-1 à 10 (annexe) | Tests de l'annexe | L3, L5 |
| AC-29 | Devises : FX-1 à FX-8 (annexe) | Tests de l'annexe | L1, L4, L6 |
| AC-30 | Migrations : MIG-1 à 7 (annexe) ; têtes principales inchangées | Tests de l'annexe | L1 |

## 9. Décisions
### 9.1 Décisions de la v1 : état
| Ancienne | État |
|---|---|
| D-1 vocabulaire des états | **Remplacée** par §1 (machines indépendantes, cinq notions clarifiées) ; à confirmer par lecture |
| D-2 réutiliser H-Money | **Tranchée** : non, H-Money est hors périmètre ; copie indépendante du modèle |
| D-3 ordonnanceur | **Ouverte** |
| D-4 partenaires existants | **Traitée** dans l'annexe (valider P-1 à P-6) |
| D-5 libération des colis | **Tranchée** : libération immédiate refusée ; annexe Colis |
| D-6 logement « sur demande » | **Ouverte** (recommandée : flux « demander un prix ») |
| D-7 devise partenaires | **Traitée** dans l'annexe devises (valider CU-*) |
| D-8 renouvellements | Intégrée à P-6 |
| D-9 versement automatique | **Ouverte** (hors mission : versement manuel avec preuve) |
| D-10 Alembic | **Tranchée** : aucune fusion, aucun test H-Food modifié ; annexe migrations (valider M-1 à M-4) |
| D-11 prestataire | **Ouverte** (DEP-1) |
| D-12 recette | **Ouverte** |

### 9.2 Décisions attendues maintenant
| # | Décision | Pour quel lot |
|---|---|---|
| D-13 | Où tournent les démonstrations après le lot 2 (environnement non production) | **L2** |
| D-14 | Gel opérationnel des validations de retraits issus de fonds d'origine non prouvée jusqu'au lot 5 | L2 |
| M-1 à M-4 | Environnement Alembic séparé, emplacement, convergence future, comportement si schéma absent | L1 |
| P-1 à P-6 | Régime transitoire partenaires | L4 |
| C-1 à C-9 | Fenêtre, preuves, litiges des colis | L5 (données en L0) |
| CU-1 à CU-7 | Marchés, devises, taux | L1, L4, L6 |
| D-3, D-6, D-9, D-11, D-12 | Ordonnanceur, logement sur demande, versement automatique, prestataire, recette | L1 à L6 |

## 10. Contraintes respectées dans ce document
Aucun code, aucune migration, aucune configuration, aucun test modifiant des données (l'analyse du graphe Alembic a utilisé l'API de lecture sans base), aucun déploiement, aucune fusion. H-Food et H-Money non touchés. Le P1 n'est pas commencé. **Aucun lot ne démarre sans votre validation écrite.**
