# Audit approfondi des paiements simulés — Mission 0.2

Date : 28/11/2026 · Branche `hlearning-p0-closure` (lecture seule) · Site lu à titre de preuve : `happy9ph/Hcompany`.
**Aucun code, aucune migration, aucune configuration modifiés. Aucun test exécuté. H-Food non touché. Aucune correction commencée.**

**Légende.** **[C]** = confirmé par lecture du code (lignes citées). **[H]** = hypothèse : la lecture ne suffit pas, un test d'exécution est nécessaire.
Les numéros de ligne sont ceux du commit `87ac5b852d56`.

## 1. Réponses directes

**Partenaires — une notification d'activation peut-elle partir sans confirmation réelle du prestataire ?**
**Non, par le chemin du paiement : [C]** `create_payment` (`app/routers/partners.py` 1038-1088) n'envoie aucun e-mail ni notification, et n'active rien. Mais **le résultat est plus grave que la question** : l'activation du partenaire **ne dépend pas du paiement du tout** (PA-2). Les notifications d'approbation partent à l'approbation admin (349-360), à la revue d'agent (479, 489) et au changement de statut de compte (845), jamais sur un paiement. En revanche l'interface affiche « Paiement confirmé » même quand le paiement a échoué (PA-4).

**Colis — un colis peut-il être confirmé sans paiement réel ?**
**Oui : [C]** en l'absence de clés fournisseur, `charge()` renvoie un succès simulé (`gateway.py` 77-78) et `book` (`app/transport/cargo.py` 380-390) passe le colis en `confirmed` / `escrow held`, envoie le code de livraison et prévient l'agence, **sans lire `result.simulated` et sans le conserver** (CG-1, CG-2). Ce n'est pas bloqué en production.

## 2. Cause racine commune

| ID | Constat | Preuve | Criticité |
|---|---|---|---|
| **ROOT-1** [C] | `charge()` n'a aucune garde de production : sans clé, chaque méthode renvoie `_simulate()` = `success=True, simulated=True`. | `app/services/payments/gateway.py` : `charge` 37-61, `_simulate` 77-78, appels 83, 105, 119, 132 | Critique |
| **ROOT-2** [C] | Le démarrage en production ne vérifie pas les clés de paiement. | `app/config.py` `_production_problems` 151-164 : secret, cookies, CORS, pawaPay (H-Money) ; rien sur Stripe/Airtel/MTN/Zamtel | Haute |
| **ROOT-3** [C] | `charge()` ne valide pas le montant : 0 ou négatif part en succès simulé. | `gateway.py` 37-61 (aucun contrôle de `amount`) | Moyenne (voir LOG-2 [H]) |
| **ROOT-4** [C] | Aucun point d'entrée externe ne peut marquer « payé » : pas de webhook dans Shopping, Transport, Logement, Partenaires. Un seul appelant de `mark_paid` / `mark_group_paid` par service. | Recherche `webhook|callback` : seulement `app/money/*`, `auth*`, `gateway.py`, `config.py` | Information (point rassurant) |

**Correction recommandée (ROOT-1/2/3)** : une garde unique dans `gateway.charge()` (production + simulé → `unavailable`, jamais `success`), un contrôle de démarrage, un refus des montants ≤ 0.

## 3. Partenaires (`app/routers/partners.py`, `app/models.py`, site `src/pages/Payment.jsx`)

Flux relu : candidature → revue agent (≈396-489) → approbation admin `admin_update_status` (262-361) → offre proposée → `accept_offer` (710-783) → contrat `sign_contract` (563-592) → page de paiement → `create_payment` (1038-1088) → facturation `my_billing` (920-957) → apps `admin_update_app_status` (981-1006).

### PA-1 [C] — Un paiement simulé est enregistré « completed » en production
- **Fichier / fonction** : `partners.py` / `create_payment`, lignes **1081-1088** ; `models.py` `Payment` 194-208.
- **Comportement** : `payment.status = completed if result.success` (1082) ; `result.simulated` n'est ni lu ni stocké ; la table n'a **aucune colonne `simulated` ni `provider_reference`**.
- **Risque** : preuve comptable fausse, impossible à distinguer d'un vrai paiement ; `GET /admin/payments` (190-199) affiche « completed ».
- **Criticité** : Haute. **Correction** : stocker `simulated` et `provider_reference` (migration, mission dédiée) ; refuser le simulé en production (garde ROOT-1).

### PA-2 [C] — L'activation du partenaire est indépendante du paiement
- **Fichiers / fonctions / lignes** :
  - `admin_update_status` 283-317 : approbation → rôle partenaire, `account_status = active`, essai 7 jours (315-316), contrat créé (321-330). Seule condition : revue d'agent transmise (272-281).
  - `sign_contract` 577 : le contrat passe `signed` sans aucun contrôle de paiement.
  - `my_billing` **942** : `subscribed = bool(contract and contract.status == signed)` — **le paiement n'est jamais lu**.
  - `admin_update_app_status` 992-995 : activation d'une app par l'admin, sans lien avec un paiement.
  - Aucune autre lecture de `PaymentStatus.completed` dans `app/` (recherche exhaustive) hors l'écriture 1082 et la liste admin 199.
- **Comportement** : un partenaire est « abonné » dès qu'il signe, qu'il ait payé, échoué ou jamais payé.
- **Risque** : l'abonnement payant n'est **pas appliqué** (indépendamment de la simulation). Un vrai fournisseur branché ne changerait rien : le paiement resterait décoratif. C'est un problème de conception, plus large que la règle « pas de simulé en production ».
- **Criticité** : Haute. **Décision métier requise** : confirmer si l'accès doit dépendre du paiement (essai de 7 jours, paiement manuel par un agent, etc.). **Correction** : lier `subscribed` / l'activation à un `Payment` `completed` et non simulé, ou documenter explicitement le modèle d'accès.

### PA-3 [C] — Notifications : aucune ne dépend du paiement
- **Lignes** : `create_payment` 1038-1088 ne contient aucun `send_email` / `notify_*`. Notifications du module : 176, 351, 353, 479, 489, 845.
- **Particularité** : l'entrée d'activité « Paiement initié » est écrite **avant** l'appel au fournisseur (1065-1072) ; il n'existe pas d'entrée « paiement confirmé / échoué ».
- **Risque** : journal d'activité partiel (pas de trace du résultat). **Criticité** : Basse. **Correction** : journaliser le résultat (succès, échec, simulé, incertain).

### PA-4 [C] — Le site affiche « Paiement confirmé » même si le paiement a échoué
- **Fichiers / lignes** : back `create_payment` décorateur `status_code=201` (1038), retour 1088 sans exception en cas d'échec ; site `src/pages/Payment.jsx` **248-249** (`setSuccess(payment)` sans lire `payment.status`) et **357** (« Paiement confirmé », « payés avec succès »). Seule mention : « Paiement simulé » sous le formulaire (417).
- **Comportement** : un paiement `failed` (refus, fournisseur « indisponible » depuis la Mission 0.1) renvoie 201 ; l'interface affiche un succès.
- **Risque** : le partenaire croit avoir payé ; litiges ; contredit l'état réel. **Criticité** : Haute.
- **Correction** : l'API renvoie 402/503 en cas d'échec (comme les autres services) et l'interface teste le statut. À confirmer par un test navigateur sur base jetable **[H]** pour la partie affichage (le code le prouve, le rendu n'a pas été exécuté).

### PA-5 [C] — Aucune vérification de l'état de l'offre ni anti-doublon
- **Lignes** : 1044-1046 (seulement l'appartenance à la candidature) ; aucun test de `offer.status == accepted` ; aucun contrôle d'un paiement `completed` existant.
- **Risque** : paiement d'une offre non acceptée / déclinée ; paiements multiples pour une même offre. **Criticité** : Moyenne. **Correction** : exiger `accepted`, refuser si un paiement `completed` existe, clé d'idempotence.

### PA-6 [C] — Un résultat « incertain » est traité comme un refus
- **Ligne** : 1082 (`completed if success else failed`). `PaymentResult.uncertain` (gateway 24-35) est ignoré.
- **Risque** (dès qu'un vrai fournisseur existe) : client débité, paiement marqué `failed`, retentative = double débit. **Criticité** : Moyenne (future). **Correction** : état `pending` + 503 + référence, rapprochement.

## 4. Transport Colis (`app/transport/cargo.py`)

Parcours relu : `book` 345-402 — contrôles 348-368 ; **prix** 369 (`money(weight_kg × price_per_kg)`, serveur, jamais le client) ; commission 370-371 ; **création** `CargoBooking` 372-378 (statut initial `pending_payment`, ligne 73) ; **référence interne** 379 (`"CG"+token`) ; **paiement** 380 ; échec 381-386 ; **confirmation** 387-390 ; notifications 391-393 ; relecture `mine` / `track` filtrées sur `paid_at != None` (400, 407, 540).

### CG-1 [C] — Colis confirmé après un paiement simulé, en production
- **Lignes** : 380-390. Aucun contrôle de `result.simulated`.
- **Comportement** : `status=confirmed`, `escrow_status=held`, `paid_at` posé (387), événement « Paiement reçu — fonds en séquestre » (389), notification client avec **code de livraison** (391) et notification à l'agence (392-393). Le code de livraison est exposé au client (293).
- **Risque** : fret accepté et agence mobilisée sans paiement. **Criticité** : Critique. **Correction** : garde ROOT-1 + refus explicite du simulé en production dans `book`.

### CG-2 [C] — Aucune trace permettant de distinguer un colis simulé d'un colis payé
- **Lignes** : champs `escrow_status` 88, `payment_reference` 89, `paid_at` 92 ; pas de `simulated` ni de référence fournisseur. `payment_reference` reçoit **notre propre** `ref` (379, 387), pas une référence du fournisseur.
- **Risque** : impossible d'auditer a posteriori quels colis ont été « payés » sans fournisseur ; une même `payment_reference` ne prouve rien. **Criticité** : Critique (traçabilité). **Correction** : colonnes `simulated`, `provider_reference` (migration, mission dédiée) + requête d'audit des colis existants.

### CG-3 [C] / [H] — Capacité retenue sans expiration pour un colis `pending_payment`
- **Lignes** : `HOLD` 32 (inclut `pending_payment`), `kg_booked` 246-247 ; aucune fonction d'expiration pour Colis (contrairement aux billets, `services.py` 113 et 313). **[C]** pour l'absence d'expiration (recherche : `pending_payment` n'apparaît que lignes 32 et 73 de `cargo.py`).
- **[H]** : une ligne reste orpheline si le processus s'arrête, ou si une exception survient entre la validation (377) et le traitement du résultat (381) — **test d'exécution requis** (simuler une exception après la ligne 377 sur base jetable).
- **Risque** : capacité du camion bloquée indéfiniment. **Criticité** : Moyenne. **Correction** : expiration temporelle comme pour les billets.

### CG-4 [C] — « Incertain » traité comme refus : colis expiré alors que le client a peut-être payé
- **Lignes** : 381-386 (`not success` → `expired`, « capacité libérée »). **Risque** : client débité sans colis (avec un vrai fournisseur). **Criticité** : Moyenne (future). **Correction** : état `pending`, pas d'expiration tant que l'issue est inconnue.

### CG-5 [C] — Les fonds « en séquestre » fictifs alimentent le solde retirable
- **Lignes** : livraison `deliver` 594 (`escrow_status = released`), `cargo_wallet` 305-308, intégré au solde transport `services.py` 354-358 (`available = released − out`).
- **Voir X-1** (chaîne de retrait). **Criticité** : Critique.

## 5. Shopping (`app/shopping`)

- **SH-1 [C]** — `buyer.py` `checkout` 29-69 : charge 54 ; échec 55-58 ; `mark_group_paid(simulated=…)` 59 ; e-mail « Commande confirmée » 64. `services.py` `mark_group_paid` 437-459 : groupe `paid`, commandes `paid` / `escrow held`, `sold_count` incrémenté (449-453), **notification et e-mail au vendeur** (454-459). `simulated` est stocké (439) mais **jamais lu** : aucune garde. **Criticité** : Critique. **Correction** : garde ROOT-1, pas de notification/stock vendu avant succès réel.
- Prix : recalculés côté serveur (`build_quote`), produit ≥ 0,5 (`schemas.py` 351), coupon ≤ 90 % (445) → **total nul non atteignable par la lecture [C]**.
- Chemin alternatif : aucun autre appelant de `mark_group_paid` **[C]**. Le vendeur ne peut pas marquer une commande payée (seller.py 328-358 exige déjà `paid`).

## 6. Transport Billets (`app/transport`)

- **BIL-1 [C]** — `routers/public.py` `book` 104-133 : charge 123 ; échec 124-127 (`fail_booking`, sièges libérés) ; `mark_paid(simulated=…)` 128 ; notification « Billet confirmé » 130 (QR code à présenter). `services.py` `mark_paid` 221-232 : `confirmed` / `held`, notification agence. `simulated` stocké (223), jamais lu. **Criticité** : Critique. **Correction** : garde ROOT-1.
- Prix de départ `gt=0` (`schemas.py` 268) ; sièges retenus pendant `hold_minutes` puis libérés (`services.py` 113, 313) : **expiration correcte [C]**, contrairement à Colis.

## 7. Logement (`app/lodging`)

- **LOG-1 [C]** — `routers/guest.py` `book` 27-68 : charge 51 ; échec 52-55 ; `mark_paid(simulated=…)` 56 ; e-mail « Paiement reçu » 62. `services.py` `mark_paid` 312-330 : `escrow held` ; si `instant_book` → `_confirm` immédiat (320-321) ; sinon **notification à l'hôte** (325-330). `simulated` stocké (314), jamais lu. **Criticité** : Critique. **Correction** : garde ROOT-1 ; notifier l'hôte uniquement après paiement réel.
- **LOG-2 [H]** — Réservation à montant 0. `schemas.py` 366 autorise `price_per_night` ≥ 0 (annonce « Sur demande ») ; `quote_stay` 216-221 n'impose pas `total > 0` ; ROOT-3 laisse passer 0 en succès simulé. **Hypothèse** : un logement à 0 et sans frais de ménage donne une réservation payée/confirmée gratuitement. **Test requis** : devis et réservation sur une annonce à prix 0, base jetable. **Criticité** : Moyenne. **Correction** : refuser `total ≤ 0` à la réservation (ou flux « sur demande » dédié).

## 8. Chemins alternatifs transverses

### X-1 [C] — Les fonds issus d'un paiement simulé deviennent retirables
Chaîne identique dans Shopping, Transport (Billets + Colis) et Logement :
`paiement simulé` → `escrow held` → libération (livraison / arrivée / séjour) → solde `available = released − out` (`shopping/services.py` 594-612, `transport/services.py` 346-358, `lodging/services.py` 462-472) → demande de retrait (`seller.py` 415-430, `operator.py` 346-361, `host.py` 452-466) → l'admin marque « payé » (`shopping/admin.py` 266-282, `transport/admin.py` 155-165, `lodging/admin.py` 171-).
**Aucun maillon ne lit `simulated`** (recherche : ce champ n'apparaît que dans les modèles, schémas et `mark_*`). Le seul filet est l'humain qui envoie réellement l'argent : s'il ne voit pas qu'un solde vient de fonds simulés, **H-Company paie de l'argent réel pour des paiements fictifs**. Les écrans admin n'exposent pas le drapeau [C pour l'absence dans le code serveur ; l'affichage admin du site n'a pas été vérifié en navigateur].
- **Criticité** : Critique. **Correction** : (1) garde ROOT-1 ; (2) le solde retirable exclut toute libération issue d'un paiement `simulated` ; (3) l'écran admin de retrait affiche l'origine ; (4) audit des soldes existants avant lancement.

### X-2 [C] — Le client ne voit jamais qu'un paiement est simulé
Le champ `simulated` est renvoyé par `CheckoutResponse` (Shopping `schemas.py` 254, Transport 221, Logement 266) mais **n'est affiché dans aucune page Shopping / Transport / Logement du site** (recherche `simulated` dans `src/` : uniquement Money et un panneau admin des plans). **Criticité** : Haute. **Correction** : après la garde serveur, plus de simulé en production ; en développement, bandeau « mode démonstration ».

### X-3 [C] — « Incertain » = refus dans les quatre flux
`if not result.success` (Shopping 55, Billets 124, Logement 52, Colis 381, Partenaires 1082) traite `uncertain` et `unavailable` comme un refus ordinaire. Avec un vrai fournisseur : risque de double débit. **Criticité** : Moyenne (future). **Correction** : traitement unifié (`pending` + 503 + référence + rapprochement).

## 9. Hypothèses à vérifier par exécution (non exécutées, après validation)
Tous sur base **jetable**, jamais sur une base réelle, sans fournisseur :
1. **LOG-2** : réservation sur annonce à prix 0 → statut obtenu.
2. **CG-3** : exception après la création d'un colis → ligne `pending_payment` orpheline, capacité retenue.
3. **PA-4** : parcours navigateur de la page de paiement partenaire avec un paiement `failed` → affichage « Paiement confirmé ».
4. **X-1** : parcours complet simulé → solde retirable → demande de retrait, pour confirmer qu'aucun garde-fou n'existe à l'exécution.
5. **ROOT-1** : en mode production simulé, un paiement dans chaque service reste confirmé (preuve d'exécution du comportement lu).

## 10. Ordre de correction recommandé (non commencé)
1. ROOT-1 (garde centrale) + ROOT-3 (montant) + ROOT-2 (démarrage).
2. X-1 (exclusion des fonds simulés des soldes) et audit des données existantes.
3. CG-1/CG-2, SH-1, BIL-1, LOG-1 : refus du simulé, états `unavailable` / `uncertain`, pas de notification avant succès réel.
4. PA-1 à PA-6 : décision métier sur le lien paiement ↔ activation (PA-2), puis API et interface.
5. CG-3 : expiration des colis en attente.
6. Migrations (`simulated`, `provider_reference` pour Colis et Partenaires) : seulement après décision sur les deux têtes Alembic.

## 11. Limites
Lecture du code et de la page de paiement partenaire uniquement. Non lus : le détail des vues admin du site pour les retraits, les 8 autres pages de paiement du site, `_confirm` du logement, la libération d'escrow de Shopping/Logement/Billets (le schéma est le même que Colis, confirmé par `wallet`). Aucun test n'a été exécuté dans cette mission.
