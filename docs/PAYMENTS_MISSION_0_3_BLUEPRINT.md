# Mission 0.3 — Blueprint de sécurisation des paiements et des flux financiers

**Statut : PROPOSITION. Aucun développement, aucune migration, aucun déploiement, aucune fusion. En attente de validation du propriétaire.**
H-Food, H-Money et Flutter/Rafiki ne sont ni modifiés ni prévus d'être modifiés. Date : 28/11/2026.
Sources : `docs/PAYMENTS_SIMULATION_DEEP_AUDIT.md` (constats PA-*, CG-*, SH-*, BIL-*, LOG-*, X-*, ROOT-*), relecture en lecture seule du code existant (dont `app/money/provider.py` et `app/money/router.py` comme **référence de conception**, sans les modifier).

## 0. Décisions intégrées (validées le 28/11/2026)

| # | Règle définitive | Traduite en invariant |
|---|---|---|
| R1 | Aucun paiement simulé ne peut générer un solde retirable. | I-1 |
| R2 | Aucun paiement simulé ne peut confirmer une commande, un colis ou une réservation payante **en production**. | I-2 |
| R3 | Aucun abonnement partenaire payant n'est activé sans confirmation réelle du prestataire. | I-3 |
| R4 | Approbation admin et signature du contrat ne remplacent pas le paiement. | I-3 |
| R5 | Un paiement incertain reste **en attente de réconciliation** ; jamais traité comme un refus définitif. | I-4 |
| R6 | Aucun montant nul ou négatif n'est un paiement réussi. Les offres gratuites sont **explicitement** distinguées des payantes. | I-5 |

Invariants techniques ajoutés par ce blueprint (conséquences directes des règles) :
- **I-1** Un solde retirable ne se calcule qu'à partir d'écritures de grand livre issues d'un paiement `confirmed`, **non simulé**, avec preuve du prestataire.
- **I-2** En production, le fournisseur « simulé » n'existe pas (refus au démarrage et à l'exécution).
- **I-3** L'état « service payant actif » n'est écrit que par un gestionnaire déclenché par la confirmation d'un paiement (ou par un drapeau « gratuit » explicite).
- **I-4** Aucun code ne passe un paiement `uncertain` en `failed`, ne libère un stock/siège/créneau définitivement, ni ne rembourse, avant réconciliation.
- **I-5** `amount > 0` est vérifié à trois niveaux : schéma d'entrée, service de paiement, contrainte en base.
- **I-6** Un seul module (`app/payments/`) peut écrire : `status = paid/confirmed`, `escrow_status = held/released`, les écritures de grand livre, les soldes. Vérifié par un test d'architecture (§7).

## 1. Les six états, strictement séparés

| # | État demandé | Définition proposée | Qui le décide | Preuve exigée | Où c'est stocké |
|---|---|---|---|---|---|
| 1 | **Paiement initialisé** | Une demande de paiement existe (montant, devise, moyen, payeur, objet). Rien n'est encaissé. | Notre serveur | aucune | `payment_intent.state ∈ {initialized, pending_provider}` |
| 2 | **Paiement confirmé par le prestataire** | Le prestataire atteste l'encaissement du montant exact. | **Le prestataire uniquement** | Webhook à signature valide **et** revérification auprès du prestataire, ou interrogation serveur-à-serveur ; `provider_reference` non vide ; montant et devise concordants | `payment_intent.state = confirmed`, `proof_*` |
| 3 | **Service confirmé** | La commande / le billet / le colis / la réservation / l'abonnement devient actif. | Un gestionnaire déclenché par l'état 2 | Intent `confirmed`, non simulé en production | Statut métier existant (`paid`, `confirmed`, …), écrit seulement par `app/payments/handlers` |
| 4 | **Fonds disponibles** | L'argent est reçu et rapproché ; H-Company le détient en séquestre pour l'objet. Pas encore acquis au bénéficiaire. | Écriture automatique à la confirmation | Intent `confirmed` | Grand livre : `kind=hold`, bucket `held` |
| 5 | **Fonds libérés** | L'événement métier est survenu (livraison confirmée, arrivée, séjour commencé) et la fenêtre de litige est close : le net (hors commission) est acquis au bénéficiaire. | Règle métier du service (déclencheur existant) | `hold` existant et non simulé | Grand livre : `kind=release`, bucket `released` |
| 6 | **Fonds retirables** | `libérés − retraits demandés/payés − gels (litige, rétention)`, provenance confirmée et non simulée. | Calcul du service de portefeuille | Écritures 4 et 5 liées à un intent `confirmed` | **Calculé** (jamais saisi) à partir du grand livre |

> **À valider (D-1)** : j'ai interprété « disponibles » comme *fonds reçus et détenus en séquestre* et « libérés » comme *acquis au bénéficiaire*. Si vous entendiez autre chose, seul le libellé change, pas la structure.

Un état ne peut être déduit d'un autre : un service confirmé **sans** intent confirmé est impossible (I-3), des fonds libérés **sans** hold est impossible (contrainte en base), des fonds retirables **sans** libération est impossible (calcul).

## 2. Composants communs (« passerelle commune » et grand livre)

### 2.1 Paquet unique `app/payments/` (nouveau) — remplace l'appel direct `charge()`

| Module | Rôle |
|---|---|
| `models.py` | `PaymentIntent`, `PaymentEvent`, `LedgerEntry`, `ReconciliationRun`, `PaymentDiscrepancy` |
| `state.py` | Machine à états, transitions par **compare-and-set** (`UPDATE … WHERE state IN (…)`, `rowcount == 1`) |
| `providers/` | Interface `PaymentProvider` : `initiate`, `check`, `refund`, `verify_signature`, `parse_callback` ; `SimulatedProvider` (hors production uniquement) ; adaptateurs réels (voir D-2) |
| `service.py` | `create_intent`, `confirm_from_callback`, `sync_intent`, `mark_uncertain`, `expire_intent` |
| `handlers.py` | Registre `register(service, on_confirmed, on_failed, on_expired)` : **seul** endroit qui active un service payant |
| `ledger.py` | `hold`, `release`, `refund`, `reserve_payout`, `settle_payout`, `balances(beneficiary)` |
| `reconcile.py` | Interrogation des intents en attente, rapprochement avec le relevé du prestataire |
| `router.py` | `GET /payments/{reference}` (+`?refresh=true`), `POST /payments/webhooks/provider` |

Conception inspirée de l'existant H-Money (`app/money/provider.py`, `router.py` 322-345) : signature HMAC vérifiée, rejeu ignoré, statut **revérifié auprès du fournisseur avant toute écriture**, statut « inconnu » qui interdit de rembourser ou reverser. **Décision D-2** : réutiliser ce module en import lecture seule, ou en extraire une copie dans `app/payments/providers/` (recommandé : copie, pour ne pas coupler H-Money).

### 2.2 Tables communes (nouvelles)

| Table | Colonnes essentielles | Contraintes |
|---|---|---|
| `payment_intent` | `id`, `reference` (unique, notre ref), `service` (`shopping`/`transport_ticket`/`transport_cargo`/`lodging`/`partner_plan`/`learning`), `subject_type`, `subject_id`, `payer_user_id`, `amount` (Numeric 14,2), `currency`, `method`, `phone`, `state`, `provider`, `provider_reference`, `is_simulated`, `proof_kind` (`webhook_verified`/`provider_query`), `proof_verified_at`, `proof_payload_hash`, `idempotency_key`, `expires_at`, `reconcile_deadline`, `created_at`, `confirmed_at` | `CHECK (amount > 0)` ; unique `(payer_user_id, service, idempotency_key)` ; `CHECK (state <> 'confirmed' OR (provider_reference IS NOT NULL AND proof_verified_at IS NOT NULL))` ; l'interdiction « simulé en production » est appliquée par le service (la base ne connaît pas l'environnement) |
| `payment_event` | `intent_id`, `provider`, `provider_event_id`, `kind`, `raw_hash`, `received_at`, `signature_valid` | unique `(provider, provider_event_id)` (rejeu ignoré) ; append-only |
| `ledger_entry` | `id`, `intent_id`, `service`, `subject_type/id`, `beneficiary_type/id`, `kind` (`hold`, `commission`, `release`, `refund`, `payout_reserve`, `payout_paid`, `payout_reversed`, `adjustment`), `amount` (signé), `bucket`, `provenance` (`provider_confirmed`/`simulated`/`legacy_unverified`), `created_at` | unique `(intent_id, kind, subject_id)` (idempotence) ; append-only ; `release` exige un `hold` du même intent ; aucune suppression |
| `payment_reconciliation_run` / `payment_discrepancy` | exécution, classe d'écart, intent, montant, statut de traitement | voir §2.7 |

### 2.3 Machine à états de l'intent

```
initialized ──initiate──▶ pending_provider ──callback/check ok──▶ confirmed ──▶ (handlers: service confirmé + hold)
     │                         │                                      
     │                         ├──refus définitif du prestataire──▶ failed ──▶ (handlers: libérer stock/sièges/dates)
     │                         ├──délai dépassé côté client────────▶ expired (seulement si le prestataire confirme « non payé »)
     │                         └──erreur, délai, statut inconnu────▶ uncertain ──reconcile──▶ confirmed | failed
     └──fournisseur absent (production sans clés)──▶ unavailable (aucun débit, aucune réservation confirmée)
uncertain depuis > reconcile_deadline ──▶ needs_review (file admin ; jamais d'échec automatique)
```
Règles : transitions uniquement par CAS ; `confirmed` et `failed` sont terminaux ; un callback tardif sur `failed` crée un **écart** (client payé, service refusé → `payment_discrepancy`, priorité maximale), jamais une activation silencieuse.

### 2.4 Preuve de paiement (R : jamais une réponse simulée ni une référence interne)
- `provider_reference` = identifiant **du prestataire**, jamais notre `ref` interne (cas actuel de Colis, CG-2).
- `confirmed` n'est écrit que si **(a)** le callback est signé et rejoué-sans-effet, **et** **(b)** le prestataire confirme par `check()` le statut, le montant et la devise.
- Réponse synchrone d'initiation = « accepté pour traitement », jamais « payé » (le mobile money est asynchrone par nature : le client valide sur son téléphone).
- Production : `SimulatedProvider` interdit ; sans clés → `unavailable` (503), pas de simulation silencieuse. Le démarrage échoue si `PAYMENTS_PROVIDER=simulated` en production (ajout à `_production_problems`, ROOT-2).

### 2.5 Idempotence (trois niveaux)
1. **Requête client** : en-tête `Idempotency-Key` (UUID) obligatoire sur chaque endpoint d'initiation ; unique `(payer, service, clé)` ; rejouer renvoie le même intent/résultat ; même clé avec corps différent → 422.
2. **Objet métier** : un seul intent non terminal par `(payer, service, objet)` → 409 avec la référence existante.
3. **Effets** : callback dédoublonné par `(provider, provider_event_id)` ; gestionnaires et grand livre protégés par `unique (intent_id, kind, subject_id)` ; une confirmation reçue deux fois (webhook + polling + clic) produit **un seul** service confirmé et **un seul** `hold`.

### 2.6 Paiement incertain
- Déclencheurs : exception, délai, réponse illisible, statut non reconnu, callback contradictoire.
- Effet : intent `uncertain` ; l'objet métier **reste** `pending_payment` ; stock, sièges, capacité, dates restent retenus jusqu'à `reconcile_deadline` (paramètre administrable, même mécanisme que `hold_minutes` existant) ; message client « ne payez pas une seconde fois, référence XXX » ; aucune notification de succès ni d'échec.
- Sortie : réconciliation → `confirmed` ou `failed` ; au-delà de l'échéance → `needs_review` (humain). **Jamais** de remboursement ni de libération automatique d'un incertain.

### 2.7 Réconciliation
- **En ligne** : `GET /payments/{ref}?refresh=true` interroge le prestataire (modèle H-Money).
- **Planifiée** : `scripts/reconcile_payments.py` (intents `pending_provider`/`uncertain` plus vieux que N minutes, backoff). Le `lifespan` actuel (`app/main.py` 171-174) ne lance aucune tâche : **dépendance D-3** — un ordonnanceur externe (cron/job runner) est nécessaire.
- **Quotidienne** : rapprochement du relevé prestataire et des intents. Classes d'écart : `paid_at_provider_not_confirmed` (critique : client débité sans service), `confirmed_not_found_at_provider` (critique : service accordé sans argent), `amount_mismatch`, `duplicate`, `callback_after_failed`. Résultat dans `payment_discrepancy`, file admin, aucune correction automatique des fonds.

### 2.8 Gratuité explicite et montants (R6)
- `amount > 0` pour tout intent (§0, I-5). Un total à 0 **ne passe jamais** par le paiement.
- Gratuit = **état déclaré** : Partenaires `Offer.kind ∈ {paid, free}` (free ⇒ `price = 0`, paid ⇒ `price > 0`, modifiable seulement par admin, journalisé) ; Logement « sur demande » (`price_per_night = 0`) = **pas de réservation payante directe** : flux « demande de devis » sans confirmation ni séquestre (D-6) ; Shopping, Billets, Colis : aucun gratuit (prix minimum déjà imposé).
- Devises : Shopping/Transport/Logement en ZMW ; offres partenaires libellées en `$` (`partners.py` 752, 1070). L'intent porte la devise ; **D-7** : devise réelle des abonnements partenaires et prise en charge par le prestataire.

### 2.9 API HTTP uniforme (toutes les initiations)
`POST …` → `202 Accepted` + `{reference, state, next_action, poll_url}` ; `state ∈ {pending_provider, uncertain}` ; **jamais 201 « payé »** ; échec définitif → 402 ; fournisseur absent → 503 ; incertain → 202 + message dédié. Le client interroge `GET /payments/{reference}`.

## 3. Grand livre, séquestres, soldes et retraits

### 3.1 Remplacement des trois `wallet()` (Shopping `services.py` 594-612, Transport `services.py` 346-358, Logement `services.py` 462-472) par un seul calcul
```
held        = Σ hold − Σ release − Σ refund            (par bénéficiaire, provenance confirmée)
released    = Σ release (net de commission)
withdrawable= released − Σ payout_reserve(open|paid) + Σ payout_reversed − gels
              ⟵ filtre obligatoire : provenance = provider_confirmed
```
Les entrées `simulated` et `legacy_unverified` sont affichées (transparence) mais **exclues** de `withdrawable` (R1).

### 3.2 Retraits
- **Demande** (Shopping `seller.py` 415-430, Billets `operator.py` 346-361, Logement `host.py` 452-466) : réservation atomique dans le grand livre (`payout_reserve`) avec verrou (`SELECT … FOR UPDATE` sur PostgreSQL) — corrige la course « lire le solde puis écrire » de l'existant.
- **Validation admin** (`admin.py` des trois services) : écran affichant l'origine des fonds (liste des intents, provenance), refus technique si la provenance n'est pas `provider_confirmed`, `provider_reference`/justificatif de versement obligatoire, identifiant admin enregistré. Versement automatique par le prestataire (payout) : hors Mission 0.3 (D-9).
- **Rejet** : `payout_reversed`.

### 3.3 Libérations existantes à rebrancher sur le grand livre
Shopping `services.py` 555 ; Billets `services.py` 266, 276 ; Colis `cargo.py` 594 ; Logement `services.py` 385, 430. Chaque libération écrit `release` seulement si un `hold` non simulé existe ; sinon no-op + alerte. **Colis** libère aujourd'hui à la livraison sans fenêtre de litige (594) : **D-5**.

### 3.4 Remboursements
Aujourd'hui `escrow_status = "refunded"` n'est qu'un drapeau (Shopping 568, Colis 301, Billets 261, Logement 380) : aucun remboursement réel. Cible : `refund` = demande au prestataire (opération rattachée à l'intent) ; états `refund_pending` / `refunded` ; jamais pour un intent `uncertain`/non confirmé. Livré en dernier lot (§8).

## 4. Matrice des changements par service

Légende fichiers : back = `hcompany_backend/app/…`, site = `hcompany/src/…`.

### 4.1 Passerelle commune
| Domaine | Changements |
|---|---|
| Backend | Nouveau `app/payments/` (§2.1) ; `services/payments/gateway.py` devient un adaptateur de compatibilité à retirer (aucun appel direct ensuite) ; garde de production dans `config._production_problems` (ROOT-2) ; refus des montants ≤ 0 (ROOT-3) ; webhook `POST /payments/webhooks/provider` public mais signé ; limites de débit (`slowapi`) |
| Frontend | Composant commun `PaymentStatus` (états : en attente de validation sur le téléphone, incertain, confirmé, échoué) + hook de polling `usePaymentStatus(reference)` avec backoff ; en-tête `Idempotency-Key` ajouté dans `lib/api.js` (`request`) ; **aucun texte « confirmé » sans état `confirmed`** |
| BDD | §2.2 (5 tables nouvelles) |
| Migration | Révision additive « M1 » (tables nouvelles seulement, aucune colonne existante modifiée) |
| Tests | Machine à états, CAS, idempotence, callback (signature valide/invalide/rejeu/hors-ordre/doublon), incertain → réconciliation, production sans clés → 503, montants ≤ 0, SQLite + PostgreSQL |

### 4.2 Shopping (`app/shopping`, site `pages/shop/ShopCheckout.jsx`, `SellerDashboard.jsx`, `components/admin/ShoppingAdminPanel.jsx`)
| Domaine | Changements |
|---|---|
| Backend | `buyer.py` `checkout` 29-69 : créer groupe + intent, répondre 202, **ne plus appeler `mark_group_paid` ici** ; `mark_group_paid` (`services.py` 437-459) déplacé dans le gestionnaire `on_confirmed` : commandes `paid`, `hold`, `sold_count`, **notification/e-mail vendeur et acheteur seulement après confirmation** ; gestionnaire `on_failed`/`on_expired` : libération du stock ; `wallet()` → grand livre ; `request_payout` 415-430 → `payout_reserve` ; `update_payout` (`admin.py` 266-282) → contrôle de provenance |
| Frontend | `ShopCheckout.jsx` : écran d'attente (« validez sur votre téléphone »), polling, états incertain/échec ; commandes affichent `payment_state` ; `SellerDashboard.jsx` 259-274 : trois compartiments (séquestre / libérés / retirables) ; `ShoppingAdminPanel.jsx` 60-132 : origine des fonds et provenance par retrait |
| BDD | `checkoutgroup.payment_intent_id` (nullable puis NOT NULL après rétro-remplissage) ; `shoporder.payment_intent_id` ; `ShopPayout.provider_reference`, `ledger_entry_id`, `processed_by_user_id` ; champs `simulated`/`provider_reference` du groupe conservés (obsolètes, lecture seule) |
| Migration | M2 additive (colonnes nullables) ; rétro-remplissage M3 (§6) ; resserrage M4 |
| Tests | Production sans clés → 503, 0 commande payée, stock restitué, 0 notification vendeur ; callback → commande payée une seule fois ; double clic ; incertain conserve le stock ; solde retirable = 0 pour fonds simulés ; retraits concurrents (PG) |

### 4.3 Transport — Billets (`app/transport`, site `pages/transport/TransportBook.jsx`, `components/transport/OperatorTabs.jsx` 350-359, `TransportAdminPanel.jsx`)
| Domaine | Changements |
|---|---|
| Backend | `routers/public.py` `book` 104-133 : intent + 202 ; `mark_paid` (`services.py` 221-232) → gestionnaire `on_confirmed` (billet `confirmed`, QR émis, notification agence/client **après** confirmation) ; `fail_booking` (235-240) → `on_failed` ; retenue de sièges prolongée jusqu'à `expires_at`/`reconcile_deadline` (`taken_seats` 100-117, `expire_overdue` 313) sans libérer un incertain ; `wallet` 346-358 → grand livre ; `request_payout`/`update_payout` comme 3.2 |
| Frontend | `TransportBook.jsx` : attente/polling/incertain ; billet affiché « en attente de paiement » tant que non confirmé ; `OperatorTabs.jsx` : trois compartiments ; `TransportAdminPanel.jsx` 117-197 : provenance des retraits |
| BDD | `transportcheckout.payment_intent_id`, `transportbooking.payment_intent_id`, `transportpayout.provider_reference/ledger_entry_id/processed_by_user_id` ; `hold_until` si besoin |
| Migration | M2/M3/M4 comme Shopping |
| Tests | Production simulée → billet jamais `confirmed`, sièges libérés après échec ; incertain garde les sièges ; QR/notification seulement après confirmation ; wallet exclut simulé ; régression des tests transport existants |

### 4.4 Transport — Colis (`app/transport/cargo.py`, site `pages/transport/CargoBook.jsx`)
| Domaine | Changements |
|---|---|
| Backend | `book` 345-402 : intent + 202 ; passage à `confirmed`/`held`, code de livraison, notifications (387-393) → `on_confirmed` ; **expiration des colis `pending_payment`** (CG-3, `HOLD` 32, `kg_booked` 246) ; incertain garde la capacité jusqu'à l'échéance ; `payment_reference` (interne) remplacé par `provider_reference` via l'intent ; libération 594 → grand livre ; `cargo_wallet` 305-308 supprimé au profit du grand livre ; code mort 365-366 retiré |
| Frontend | `CargoBook.jsx` 47 : attente/polling ; le code de livraison n'est affiché qu'après confirmation ; suivi (`track`, 407) |
| BDD | `cargobooking.payment_intent_id`, `hold_until` ; l'existant `paid_at`, `payment_reference` conservés (compat) |
| Migration | M2/M3/M4 ; **rétro-remplissage obligatoire** : les colis existants n'ont aucune trace `simulated` (CG-2) → tous classés `legacy_unverified` |
| Tests | Production simulée → colis jamais `confirmed`, aucun code de livraison émis, capacité libérée ; incertain ; expiration `pending_payment` ; fonds Colis exclus du solde transport tant que non confirmés ; hypothèse CG-3 (orphelin) reproduite puis couverte |

### 4.5 H-Lodging (`app/lodging`, site `pages/lodge/LodgeBook.jsx`, `HostTabs.jsx` 218-230, `LodgeAdminPanel.jsx`)
| Domaine | Changements |
|---|---|
| Backend | `routers/guest.py` `book` 27-68 : intent + 202 ; `mark_paid` (`services.py` 312-330) → `on_confirmed` (séquestre, `_confirm` si réservation instantanée, **notification hôte seulement après confirmation**) ; dates retenues pendant l'attente, libérées à l'échec confirmé ; **refus de `total ≤ 0`** dans `quote_stay` (216-221) et flux « sur demande » séparé pour `price_per_night = 0` (LOG-2, D-6) ; `wallet` 462-472 → grand livre ; retraits comme 3.2 |
| Frontend | `LodgeBook.jsx` 89 : attente/polling ; annonce à 0 → bouton « Demander un prix » (le tableau « Sur demande » de la carte reste inchangé) ; `HostTabs.jsx` : trois compartiments ; `LodgeAdminPanel.jsx` 118-201 : provenance |
| BDD | `lodgecheckout.payment_intent_id`, `booking.payment_intent_id`, `lodgepayout.provider_reference/ledger_entry_id/processed_by_user_id` ; éventuel `property.price_on_request` explicite |
| Migration | M2/M3/M4 |
| Tests | Production simulée → réservation jamais payée, dates libres, hôte non notifié ; test d'exécution LOG-2 (annonce à 0) ; instantanée vs sur demande ; incertain ; wallet |

### 4.6 Partenaires (`app/routers/partners.py`, `models.py`, site `pages/Payment.jsx`, `components/admin/AllRequestsPanel.jsx`)
| Domaine | Changements |
|---|---|
| Backend | `create_payment` 1038-1088 : exiger `offer.status == accepted` (PA-5), un seul intent non terminal par offre, `Idempotency-Key`, 202 / 402 / 503 au lieu du 201 inconditionnel (PA-4) ; **activation** : `my_billing` 942 remplacé par `subscribed = contract.signed AND (offer.kind = free OR intent confirmé non simulé couvrant la période)` ; `sign_contract` 577 et `admin_update_status` 283-317 inchangés mais **plus suffisants** (R4) ; `Payment` conserve l'historique avec `simulated`, `provider_reference`, `intent_id` ; journal d'activité « paiement confirmé/échoué/incertain » (PA-3) ; notification d'activation d'abonnement émise **par le gestionnaire** `on_confirmed` seulement |
| Frontend | `Payment.jsx` 248-249, 357 : lire l'état, afficher « Paiement confirmé » uniquement si `confirmed`, polling, incertain, échec ; retirer la mention « simulé » en production ; `AllRequestsPanel.jsx` 60 : colonnes `provenance`, `provider_reference` |
| BDD | `offer.kind` (`paid`/`free`, défaut `paid`) ; `payment.simulated`, `provider_reference`, `intent_id` ; table `partner_subscription` (partenaire, offre, période, statut, intent) si renouvellements périodiques (D-8) |
| Migration | M2 additive ; rétro-remplissage : partenaires « abonnés » par signature → **régime transitoire explicite** (D-4) |
| Tests | Signature + approbation sans paiement ⇒ non abonné ; offre gratuite explicite ⇒ abonné ; offre à prix 0 non marquée gratuite ⇒ refus ; paiement échoué ⇒ API 402/503 et interface sans « confirmé » ; simulé en production ⇒ refus ; offre non acceptée ⇒ 409 ; paiement double ⇒ 409 |

### 4.7 Séquestres, soldes et retraits (transversal)
| Domaine | Changements |
|---|---|
| Backend | `app/payments/ledger.py` (§3) ; les trois `wallet()` et `cargo_wallet()` deviennent des lectures du grand livre ; libérations rebranchées (§3.3) ; réservation atomique des retraits ; contrôle de provenance à la validation admin ; remboursements via prestataire (lot final) |
| Frontend | Trois compartiments identiques dans `SellerDashboard.jsx`, `OperatorTabs.jsx`, `HostTabs.jsx` ; panneaux admin (`ShoppingAdminPanel`, `TransportAdminPanel`, `LodgeAdminPanel`) : origine, preuve, provenance ; nouvelle vue admin « écarts de réconciliation » |
| BDD | `ledger_entry`, champs de retraits (§4.2 à 4.5), tables de réconciliation |
| Migration | Rétro-remplissage des écritures `legacy_unverified` à partir de l'état actuel (§6) |
| Tests | Invariants du grand livre (sommes, jamais négatif, `withdrawable ≤ released`), retraits concurrents (PG), fonds simulés = 0 retirable dans **tous** les environnements (R1), libération sans hold = no-op |

### 4.8 Alignement et exclusions
- **H-Learning** (déjà durci en Mission 0.1, `learning_plans.py` 247) : migrera vers l'intent commun dans un lot ultérieur ; non modifié par 0.3 sauf accord.
- **Tourisme** (`api.tour.book`) : n'appelle pas la passerelle de paiement ; hors périmètre.
- **H-Food** (`api.resto.checkout`, `app/restaurant`) et **H-Money** (`app/money`) : exclus, non modifiés, non importés dans leur logique de production.

## 5. Dépendances (bloquantes en premier)

| # | Dépendance | Effet si absente |
|---|---|---|
| DEP-1 | **Prestataire réel et compte marchand** (carte, Airtel, MTN, Zamtel) : clés sandbox puis production, devise, API de statut/remboursement/relevé | Impossible de produire une vraie preuve : le blueprint se livre avec un fournisseur simulé **hors production uniquement**, et la production reste en `unavailable` |
| DEP-2 | **URL publique de webhook** et secret partagé (variables de production : jamais lues ni modifiées par moi) | Pas de confirmation asynchrone ; seulement l'interrogation |
| DEP-3 | **Ordonnanceur externe** pour la réconciliation (le `lifespan` n'en lance aucun) | Les paiements incertains ne se résolvent qu'à la main |
| DEP-4 | **Décision Alembic** : deux têtes (`a1d5c8e2f4b7`, `c6e3d4f5a7b8`) et test `test_hfood_a1_migration` qui fige la topologie | Aucune migration n'est possible sans lever la contrainte (voir §6.1) |
| DEP-5 | Accès réseau sortant pour tester le prestataire | Mon bac à sable ne contacte aucun site externe : les contrats prestataire restent **non exécutés** par moi (fixtures enregistrées + test en bac à sable du prestataire par vos soins) |
| DEP-6 | Avis juridique/réglementaire sur la détention de fonds clients en séquestre et le versement aux vendeurs (Zambie) | Risque réglementaire non évalué par ce document (je ne le tranche pas) |

## 6. Stratégie de migration

### 6.1 Prérequis : les deux têtes Alembic (D-10)
Toute nouvelle révision casse `test_hfood_a1_migration` (constaté en Mission 0.1). Options à trancher avant la première migration :
- **A (recommandée)** : révision de fusion unique des deux têtes, puis adaptation **explicitement autorisée** du test de topologie HFood (assertion « tête H-Food présente » au lieu de « seule tête ajoutée »), sans toucher au code ni aux migrations HFood.
- **B** : ne pas fusionner, ajouter une branche séparée ; l'entrypoint (`upgrade heads`) fonctionne, mais le test doit quand même être adapté.
Sans autorisation, **aucune migration n'est écrite**.

### 6.2 Expand / backfill / contract (aucune perte de donnée)
| Phase | Contenu | Réversibilité |
|---|---|---|
| **M1 — Expand** | Tables nouvelles (`payment_intent`, `payment_event`, `ledger_entry`, réconciliation) | `downgrade` supprime les tables vides |
| **M2 — Expand (colonnes)** | Colonnes nullables : `payment_intent_id`, `provider_reference`, `simulated` (Colis, Partenaires), `offer.kind`, champs de retraits | `downgrade` retire les colonnes |
| **M3 — Backfill** | Script `scripts/payments_backfill.py` **lecture seule par défaut**, `--apply` explicite, URL passée en argument, copie des lignes touchées dans une table d'archive, rejouable (modèle `lessonprogress_uniqueness.py`) | Archive + rejouable ; aucune suppression |
| **M4 — Contract** | `NOT NULL`, `CHECK (amount > 0)`, unicités | Après validation des écarts uniquement |

### 6.3 Classification des données existantes (règle de précaution)
- Tout `escrow_status = held/released` existant est converti en écriture `legacy_unverified` : **affiché, jamais retirable**.
- Un objet existant avec `simulated = true` (Shopping, Billets, Logement) → provenance `simulated`.
- Colis et Partenaires (aucun marqueur) → `legacy_unverified`.
- Retraits déjà `paid` : historique intact. Retraits `requested` : marqués « à revoir » dans l'écran admin.
- Aucune ligne n'est supprimée, aucun statut métier existant n'est modifié silencieusement ; les services déjà confirmés restent visibles.
- Une **requête d'audit en lecture seule** (livrée dans le lot 0) chiffre : nombre et montants de fonds `simulated`/`legacy_unverified`, retraits déjà payés issus de fonds non vérifiés. **Hypothèse** (à confirmer par vous, D-4) : Shopping, Transport, Logement et Partenaires ne sont pas encore lancés commercialement, donc le volume réel est faible.

### 6.4 Règles d'exécution
Migrations jouées **uniquement sur bases jetables** (PostgreSQL 16 jetable avec les gardes `tests/pg_safety.py`) ; jamais sur la production ; la décision de les appliquer en production reste la vôtre, séparée de la livraison du code.

## 7. Stratégie de tests

| Famille | Contenu | Environnement |
|---|---|---|
| Unitaires | Machine à états, CAS, calcul des soldes, validations de montant | SQLite |
| Invariants du grand livre | Propriétés : somme des buckets, `withdrawable ≤ released`, jamais négatif, unicité d'idempotence | SQLite + PG |
| Callback prestataire | Signature valide / invalide, rejeu, hors-ordre, doublon, montant ou devise divergents, callback après `failed` | SQLite + PG |
| Matrice « production » paramétrée | Pour **chacun des 5 flux** (+ non-régression H-Learning) : sans clés → 503, aucun service confirmé, aucune notification de succès, stock/sièges/capacité/dates libérés, aucun solde ; avec fournisseur simulé forcé → refus au démarrage | SQLite |
| Incertain | Exception/timeout → `uncertain`, ressources conservées, pas de remboursement, réconciliation vers `confirmed` ou `failed`, `needs_review` à l'échéance | SQLite + PG |
| Concurrence | Double clic, webhook + polling simultanés, deux retraits simultanés, webhook vs réconciliation (`tests/threads_util.run_parallel`) | **PostgreSQL** (preuve de référence) |
| Gratuité et montants | 0, négatif, NaN, arrondi à 0,00 → refus ; offre gratuite explicite acceptée ; offre à 0 non marquée refusée | SQLite |
| Migration | M1→M4 et `downgrade` sur base jetable ; rétro-remplissage sur données `legacy` semées ; rejouabilité ; aucune perte (comptages avant/après) | PG jetable |
| Architecture | Test statique : aucune écriture de `status="paid"`, `escrow_status="held"/"released"`, `LedgerEntry(...)` hors `app/payments/` | SQLite |
| Frontend | vitest : états `PaymentStatus`, polling, `Idempotency-Key`, aucun « confirmé » hors `confirmed` ; vérification navigateur aux 4 tailles (1366×768, 768×1024, 390×844, 360×800) des pages de paiement et des portefeuilles | vitest + Playwright |
| Régression | Suite complète fichier par fichier (`run_tests.sh`) avec le décompte exact avant/après ; HFood/H-Money **non modifiés**, leurs tests rejoués tels quels | SQLite |
| Contrat prestataire | Fixtures enregistrées du sandbox du prestataire ; **non exécutables par moi sans réseau** (DEP-5) | à valider par vous |

Règle de compte rendu : aucun test déclaré réussi sans exécution ; les tests non exécutés sont listés comme tels.

## 8. Plan de livraison proposé (lots, une PR et une branche par lot, rien sur `main`)

| Lot | Contenu | Prérequis | Modifie le comportement ? |
|---|---|---|---|
| **0** | Lecture seule : requête d'audit des données existantes ; liste des paramètres ; décisions D-1 à D-10 | validation du blueprint | Non |
| **1** | `app/payments/` : modèles, machine à états, grand livre, fournisseurs (simulé hors production), webhook, réconciliation, tests ; **non branché** aux services | D-2, D-10, M1 | Non (code dormant) |
| **2** | Garde de production et refus des montants ≤ 0 dans la passerelle actuelle (filet immédiat, sans changer les contrats d'API) | lot 1 | Oui, minimal (503 au lieu du faux succès) |
| **3** | Services un par un, derrière gestionnaires : Colis, Billets, Shopping, Logement | lots 1-2, M2 | Oui |
| **4** | Partenaires (activation liée au paiement, offres gratuites explicites) | D-4, D-8 | Oui |
| **5** | Grand livre actif : portefeuilles, retraits, provenance admin ; rétro-remplissage M3 | lots 3-4 | Oui |
| **6** | Remboursements réels, réconciliation quotidienne, alignement H-Learning | prestataire réel (DEP-1) | Oui |
| **7** | Resserrement M4 (contraintes) | écarts résolus | Oui |

Ordre justifié : le lot 2 ferme immédiatement la faille « simulé en production » ; les lots 3 et 5 sont séparés pour ne jamais exposer un solde calculé deux façons.

## 9. Risques

| # | Risque | Gravité | Atténuation |
|---|---|---|---|
| RK-1 | Cinq corrections indépendantes créant des incohérences | Haute | Architecture unique `app/payments/`, test d'architecture (I-6), lots séquencés |
| RK-2 | Migration bloquée par les deux têtes Alembic / test HFood | Haute | Décision D-10 avant tout ; sans accord, aucune migration |
| RK-3 | Blocage du verrouillage d'activation partenaire : des partenaires aujourd'hui « abonnés » par signature perdent l'accès | Haute | Régime transitoire explicite et borné (D-4), liste préalable, jamais de coupure silencieuse |
| RK-4 | Faux succès, client payé mais refusé (callback tardif, incertain mal géré) | Haute | États `uncertain`/`needs_review`, écarts de réconciliation, jamais d'échec automatique |
| RK-5 | Fonds simulés ou non vérifiés déjà retirés | Moyenne (à chiffrer) | Audit lot 0, marquage `legacy_unverified`, retraits `requested` à revoir |
| RK-6 | Aucun prestataire réel disponible : fonctionnalités non prouvables en conditions réelles | Haute | Livraison avec fournisseur simulé hors production ; production en `unavailable` ; recette du prestataire par vos soins |
| RK-7 | Course sur retraits et confirmations | Haute | CAS, verrous PG, tests de concurrence PG |
| RK-8 | Écart de devise (USD partenaires / ZMW autres) | Moyenne | Devise portée par l'intent ; D-7 |
| RK-9 | Mobile money asynchrone : UX plus longue (attente de validation sur le téléphone) | Moyenne | Écran d'attente, polling, état incertain clair |
| RK-10 | Réglementation sur la détention de fonds | À évaluer | DEP-6 : avis juridique, hors de mon périmètre |
| RK-11 | Régression sur les modules existants | Moyenne | Matrice de tests, régression complète, HFood/H-Money non touchés |
| RK-12 | Journal d'audit admin (reporté en P1) : les validations de retraits ne seraient pas journalisées au sens complet | Moyenne | Mission 0.3 enregistre `processed_by_user_id` et la provenance dans la table de retrait ; le journal complet reste P1 |

## 10. Critères d'acceptation vérifiables

Chaque critère indique **comment** le vérifier. Tous exécutés sur base jetable.

| # | Critère | Vérification |
|---|---|---|
| AC-01 | **R2** : en production sans clés, chacun des 5 flux (Shopping, Billets, Colis, Logement, Partenaires) ; H-Learning ne régresse pas répond 503 ; 0 commande/billet/colis/réservation/abonnement confirmé | Test paramétré « matrice production » ; requête SQL : `count(*) where status in (paid, confirmed)` = 0 |
| AC-02 | **R2** : 0 notification de succès (vendeur, hôte, agence, client) créée dans ces cas | Test : table des notifications vide ; 0 e-mail envoyé (transport e-mail simulé) |
| AC-03 | Stock, sièges, capacité camion et dates sont restitués après échec ; **conservés** après incertain | Tests de disponibilité avant/après |
| AC-04 | **R1** : un solde alimenté uniquement par des fonds `simulated` ou `legacy_unverified` donne `withdrawable = 0` dans **tous** les environnements et une demande de retrait → 422 | Tests wallet + payout pour Shopping, Transport, Logement |
| AC-05 | **R1** : la validation admin d'un retrait dont la provenance n'est pas `provider_confirmed` est refusée techniquement | Test API admin |
| AC-06 | **R3/R4** : un partenaire avec offre payante, contrat signé et approbation admin mais sans intent confirmé a `subscribed = false` | Test `my_billing` |
| AC-07 | **R3** : une offre `kind = free` explicite active l'abonnement sans paiement ; une offre à prix 0 non marquée gratuite est refusée | Tests Partenaires |
| AC-08 | **R5** : un paiement `uncertain` n'est jamais passé en `failed` ni remboursé par le code applicatif ; sortie uniquement par `confirmed`/`failed` du prestataire ou `needs_review` | Tests d'état + recherche statique des transitions interdites |
| AC-09 | **R6** : montants 0, négatif, NaN et arrondis à 0,00 refusés à l'entrée, dans le service et par `CHECK` en base | Tests unitaires + test de contrainte PG |
| AC-10 | Idempotence : deux requêtes avec la même clé produisent **un** intent, **un** service confirmé, **un** `hold` ; mêmes résultats avec webhook doublé et polling concurrent | Tests de concurrence PG |
| AC-11 | Preuve : aucun intent `confirmed` sans `provider_reference` du prestataire et `proof_verified_at` ; `provider_reference` ≠ référence interne | `CHECK` en base + test |
| AC-12 | Le fournisseur simulé est impossible en production (démarrage refusé, exécution refusée) | Tests de configuration |
| AC-13 | Séparation des six états : service confirmé impossible sans intent confirmé ; `release` impossible sans `hold` ; `withdrawable` toujours calculé | Tests + contraintes |
| AC-14 | Test d'architecture : aucune écriture de statuts payés ni d'écritures de grand livre hors `app/payments/` | Test statique en CI |
| AC-15 | Callback : signature invalide → rejeté ; rejeu → sans effet ; callback après `failed` → écart créé, aucune activation | Tests de callback |
| AC-16 | Réconciliation : un incertain confirmé par le prestataire active le service **une seule fois** ; un écart `paid_at_provider_not_confirmed` apparaît dans la file admin | Tests de réconciliation avec fournisseur simulé de test |
| AC-17 | Frontend : « Paiement confirmé » n'apparaît **que** si l'état est `confirmed` ; les états attente/incertain/échec sont affichés ; en-tête `Idempotency-Key` envoyé | vitest + vérification navigateur aux 4 tailles |
| AC-18 | Colis : un colis `pending_payment` expire ; aucun code de livraison avant confirmation | Tests Colis |
| AC-19 | Logement : annonce à prix 0 → aucune réservation payante directe ; flux « sur demande » | Test d'exécution (ferme l'hypothèse LOG-2) |
| AC-20 | Migration : M1→M4 et `downgrade` sur PG jetable sans perte (comptages avant/après identiques) ; script de rétro-remplissage en lecture seule par défaut et rejouable | Tests de migration |
| AC-21 | Données existantes : aucune ligne supprimée ; tous les fonds existants classés `legacy_unverified` ou `simulated` ; rapport chiffré fourni | Requête d'audit + rapport |
| AC-22 | Régression : suite complète fichier par fichier ; HFood et H-Money passent **sans modification de leur code ni de leurs migrations** | `run_tests.sh`, décompte exact |
| AC-23 | Aucun `.env` lu ou commité, aucune variable de production touchée, aucune base de production touchée, aucun déploiement, aucune fusion | Revue de diff + déclaration |

## 11. Décisions attendues du propriétaire

| # | Décision | Recommandation |
|---|---|---|
| D-1 | Vocabulaire des états 4-6 (§1) | Valider les définitions proposées |
| D-2 | Réutiliser `app/money/provider.py` en import ou en copier le modèle | Copier le modèle dans `app/payments/providers/` |
| D-3 | Ordonnanceur pour la réconciliation (cron/job externe) | Cron externe toutes les 5 min + quotidien |
| D-4 | Partenaires déjà « abonnés » par signature : régime transitoire (durée, liste, qui valide) | Liste figée, validation par vous, délai borné |
| D-5 | Colis : fenêtre de litige avant libération (aujourd'hui libération immédiate à la livraison) | Aligner sur Billets/Logement |
| D-6 | Logement « sur demande » (prix 0) : flux de devis sans paiement immédiat | Oui, flux « demander un prix » |
| D-7 | Devise des abonnements partenaires (USD affiché, ZMW ailleurs) | Fixer la devise avant le lot 4 |
| D-8 | Abonnements partenaires périodiques : renouvellement manuel avec rappels, ou prélèvement si le prestataire le permet | Manuel avec rappels |
| D-9 | Versement automatique des retraits par le prestataire | Hors Mission 0.3 ; versement manuel avec preuve |
| D-10 | Alembic : fusion des deux têtes **et** autorisation d'adapter `test_hfood_a1_migration` | Option A, autorisation explicite de ce seul test |
| D-11 | Prestataire(s) de paiement à intégrer et ordre | À fournir (DEP-1) |
| D-12 | Environnement de recette : qui exécute les tests prestataire réels | Vous, avec mes fixtures |

## 12. Contraintes respectées dans ce document
Aucun code modifié, aucune migration, aucune configuration, aucun test exécuté, aucun déploiement, aucune fusion. H-Food, H-Money, Flutter/Rafiki et variables de production non touchés. P1 non commencé. Ce document est une proposition : **aucun développement ne démarre avant votre validation écrite**, lot par lot.
