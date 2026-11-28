# Mission 0.3 — Transport Colis : cycle de vie financier, preuves de livraison et litiges

**Statut : proposition (28/11/2026). Aucun code, aucune migration.**
Décision du propriétaire : **la libération automatique des fonds immédiatement après livraison, sans mécanisme de contestation, est refusée.** Ce document propose une fenêtre de contestation, les preuves acceptées, une procédure de litige et les conditions de libération. **Aucune durée n'est fixée arbitrairement** : elle se déduit de contraintes opérationnelles à mesurer (§3, §4).

## 1. Constat (code relu, `app/transport/cargo.py`)
| Fait | Ligne |
|---|---|
| Statuts : `pending_payment` → `confirmed` → `in_transit` → `delivered` (+ `cancelled_user`, `expired`) | 73, 556-577, 594 |
| Un **code de livraison à 6 chiffres** est généré à la réservation et montré à l'**expéditeur** (pas au destinataire) tant que le colis est `confirmed`/`in_transit` | 374, 293 |
| L'agence valide la livraison **colis par colis** en saisissant ce code ; **la même instruction libère les fonds** (`escrow_status = "released"`) | 585-596 |
| Aucune étape de contestation, aucun litige, aucune preuve autre que le code | recherche : aucun `dispute` dans `cargo.py` |
| Aucun limiteur de débit sur `deliver` (le limiteur ne couvre que `book`, 20/heure) | 346 ; **hypothèse** à confirmer à l'exécution : tentatives illimitées sur un code à 10⁶ valeurs |
| Annulation gratuite par l'expéditeur jusqu'à `USER_FREE_CANCEL_HOURS` avant le départ → remboursement intégral | 416-430 |
| Champs disponibles : `receiver_name`, `receiver_phone`, `description`, `category`, `weight_kg`, `total`, événements `CargoEvent` | 60-100 |
| Modèle de référence existant côté **Billets** : fenêtre de litige (de l'heure de départ à `release_hours` = 12 h par défaut), libération automatique à l'issue, ouverture par le voyageur, arbitrage admin (`refund` total ou partiel, ou `release`) | `transport/services.py` 28, 302-305, 326 ; `routers/public.py` 175-182 ; `routers/admin.py` 124-140 |

## 2. Principes
- **C-1** Aucun fonds de colis n'est libéré à la simple saisie du code : la livraison **démarre** une fenêtre.
- **C-2** La preuve de livraison **n'est pas** la preuve de conformité : la contestation reste possible pendant la fenêtre.
- **C-3** Le paramétrage de la fenêtre n'a **aucune valeur par défaut** : tant que le propriétaire ne l'a pas fixé, **rien n'est libéré** (échec sûr : les fonds restent en séquestre).
- **C-4** Les fonds libérés restent soumis aux règles de retrait (grand livre, provenance non simulée).
- **C-5** Les durées, seuils et preuves requises sont des **paramètres administrables** (mécanisme de réglages existant, `get_float`), pas des constantes.

## 3. Contraintes opérationnelles à analyser avant de fixer une durée

| Contrainte | Effet sur la fenêtre | Donnée à mesurer (audit en lecture seule, lot 0) |
|---|---|---|
| Durée du trajet et délai entre `in_transit` et `delivered` | Trajets longs ⇒ le destinataire peut ne constater qu'après la remise | Distribution `delivered_at − created_at`, par route |
| Disponibilité du destinataire (peut ne pas être le payeur, n'a pas de compte) | Fenêtre trop courte ⇒ pas le temps d'inspecter | Part des colis avec `receiver_phone` renseigné et joignable |
| Nature du colis (denrées périssables, fragiles, valeur élevée) | Périssable ⇒ fenêtre courte ; valeur élevée ⇒ fenêtre longue + preuves renforcées | Répartition `category`, `total`, `weight_kg` |
| Liquidité des agences (petites agences) | Fenêtre longue ⇒ trésorerie bloquée | Fréquence et montants des retraits, solde moyen |
| Capacité de l'équipe admin à arbitrer | Plus de litiges si fenêtre longue ⇒ délai de traitement | Volume actuel de litiges Billets, durée de résolution |
| Fraude : fuite du code, collusion, essais du code | Preuves complémentaires nécessaires | Tentatives de saisie, annulations, écarts |
| Délai de remboursement par mobile money | La fenêtre doit laisser le temps d'un remboursement réel | À obtenir du prestataire (DEP-1) |
| Transfrontalier / douane (module `crossborder` existant) | Délais allongés possibles | À déterminer avec ce module (lecture seule) |

## 4. Méthode de détermination des durées (sans les fixer ici)
Trois politiques candidates, à comparer sur les données du §3 :
| Politique | Description | Avantages | Inconvénients |
|---|---|---|---|
| **A. Fenêtre uniforme** | Une durée unique après la livraison | Simple | Inadaptée aux périssables et aux fortes valeurs |
| **B. Par catégorie** | Durée selon `category` (denrées / général / fragile) | Mieux adaptée | Plus de paramètres |
| **C. Par palier de valeur + libération anticipée** | Durée et preuves selon la valeur déclarée ; **libération anticipée** si le destinataire (ou l'expéditeur) confirme la conformité | Protège les gros colis, rapide pour les petits | Plus complexe |

Recommandation : **C**, avec valeurs initiales proposées **après** l'audit des données, validées par le propriétaire. Le blueprint ne contient volontairement aucun nombre d'heures.

## 5. Preuves de livraison acceptées

| # | Preuve | Force | Remarques |
|---|---|---|---|
| E-1 | Code de livraison saisi par l'agence (**existant**) | De base, **insuffisante seule** pour les valeurs élevées | Le code est vu par l'expéditeur : il peut être transmis à l'agence sans que le destinataire ait reçu le colis. Ajouter limite de tentatives (hypothèse de force brute, §1) |
| E-2 | **Confirmation du destinataire** : lien ou code envoyé sur `receiver_phone`, confirmation « reçu conforme / réserves » | Forte | Coût SMS à valider (décision C-5) ; ne suppose pas de compte |
| E-3 | **Photo horodatée** du colis remis, prise par l'agence, stockée en espace privé (`upload_store`) | Moyenne à forte | Conservation limitée, aucune pièce d'identité conservée |
| E-4 | Nom et signature (tactile) du récepteur | Moyenne | Facultative |
| E-5 | Position de l'appareil de l'agent à la remise | Moyenne | **Consentement** de l'agent requis ; donnée personnelle |
| E-6 | Journal de trajet (`CargoEvent` : chargement, en route, livré, position) | Contexte | Existe déjà |

Règle proposée (paliers à fixer par le propriétaire) : valeur faible ⇒ E-1 **et** (E-2 **ou** E-3) recommandé ; valeur moyenne ⇒ E-1 + E-2 ou E-3 **obligatoire** ; valeur élevée ⇒ E-1 + E-2 + E-3. Une preuve incomplète **n'empêche pas** la livraison mais **empêche la libération automatique** (file de revue).

## 6. Cycle de vie financier — quatre machines indépendantes
Colonnes : état du **colis** (service), du **paiement** (intent), de la **comptabilité** (grand livre, source de vérité), du **versement** (retrait), et du **litige**.

| Étape | Colis | Paiement | Grand livre | Retrait | Litige |
|---|---|---|---|---|---|
| 1. Création | `pending_payment`, capacité retenue jusqu'à l'expiration de l'intent | `initialized` → `pending_provider` | — | — | — |
| 2. Paiement incertain | reste `pending_payment`, capacité conservée | `uncertain` | — | — | — |
| 3. Paiement confirmé par le prestataire | `confirmed` ; **code de livraison émis ici seulement** ; notification agence | `confirmed` (preuve) | `hold` (fonds **détenus en séquestre**, espace réel) | — | — |
| 4. En route | `in_transit` | `confirmed` | inchangé | — | — |
| 5. Livraison validée (preuves suffisantes selon le palier) | `delivered`, `delivered_at` posé, **fenêtre ouverte** | `confirmed` | **inchangé** : toujours détenus (plus de libération ici) | — | possible |
| 6a. Fenêtre écoulée sans litige, conditions §8 remplies | `delivered` (inchangé) | `confirmed` | `release` : net agence **dû au bénéficiaire**, commission constatée | — | — |
| 6a'. Libération anticipée (confirmation conforme du destinataire/expéditeur) | idem | idem | `release` (idem) | — | — |
| 6b. Litige ouvert dans la fenêtre | `delivered` + drapeau litige | `confirmed` | **gel** (le `release` est bloqué) | — | `opened` |
| 7. Litige tranché | selon décision | selon décision | `release` total, remboursement partiel ou total, ou partage | — | `decided` → `executed` |
| 8. Versement | — | — | **retirable** = dû − retraits − gels ; `payout_reserve` à la demande | `requested` → `approved` → `sent` → `confirmed` (ou `rejected`/`failed`) | — |
| Annulation expéditeur (avant départ) | `cancelled_user` | remboursement via prestataire : `refund_pending` → `refunded` | `refund` (hold soldé) | — | — |
| Départ annulé par l'agence | `cancelled_operator` | idem remboursement intégral | `refund` | — | — |
| Absence de preuve de livraison à l'échéance du trajet (T_max, paramètre) | `delivery_overdue` | `confirmed` | gel | — | **litige ouvert d'office** |

## 7. Procédure de litige (calquée sur Billets, adaptée aux colis)
| Élément | Proposition |
|---|---|
| Qui peut ouvrir | L'expéditeur ; le destinataire via le lien E-2 ; le système (absence de preuve) ; l'agence (destinataire injoignable/refus) |
| Quand | Pendant la fenêtre ; après la fenêtre seulement par décision admin (fraude avérée) |
| Motifs | Non reçu, avarié, incomplet, colis différent, retard excessif, livré à un tiers |
| Preuves jointes | Photos, messages, justificatifs (stockage privé) |
| Réponse de l'agence | Délai paramétrable (SLA), prolongation possible |
| Décision admin | Libérer à l'agence ; rembourser intégralement ; **remboursement partiel** ; partager ; retour à l'expéditeur (frais à définir) |
| Exécution | Écritures de grand livre (libération / remboursement) ; remboursement réel via prestataire ; notifications aux parties |
| Journal | Chaque étape horodatée avec l'acteur ; le journal d'audit admin complet reste P1 |
| Effets | Statistiques de litiges par agence ; seuils de suspension à décider |

## 8. Conditions de libération (toutes requises)
1. Paiement confirmé par le prestataire, **non simulé**.
2. Colis `delivered` avec le niveau de preuve exigé pour son palier.
3. Fenêtre écoulée **ou** confirmation conforme explicite (libération anticipée).
4. Aucun litige ouvert, aucun gel administratif.
5. Paramètres de fenêtre **configurés** (principe C-3).
6. Libération idempotente : au plus une écriture `release` par colis (unicité en base).

## 9. Critères d'acceptation
| # | Critère | Vérification |
|---|---|---|
| CG-AC-1 | La saisie du code **ne libère aucun fonds** ; la fenêtre démarre | Test : `deliver` ⇒ pas de `release` |
| CG-AC-2 | Paramètre de fenêtre non configuré ⇒ aucune libération automatique | Test |
| CG-AC-3 | Le code de livraison n'est émis qu'après paiement **confirmé** | Test (production simulée ⇒ aucun code) |
| CG-AC-4 | Litige ouvert dans la fenêtre ⇒ gel ; aucune libération tant que non tranché | Test |
| CG-AC-5 | Décisions de litige (libération, remboursement total, partiel) produisent les écritures exactes et conservent la somme | Test d'invariants |
| CG-AC-6 | Preuve insuffisante pour le palier ⇒ pas de libération automatique, file de revue | Test |
| CG-AC-7 | Colis `pending_payment` expiré ou résolu selon l'état de l'intent ; capacité restituée seulement après échec confirmé | Test (ferme CG-3) |
| CG-AC-8 | Limite de tentatives sur la saisie du code (à confirmer l'absence actuelle par exécution) | Test |
| CG-AC-9 | Libération unique par colis (concurrence : job + clic) | Test PostgreSQL |
| CG-AC-10 | Absence de preuve à T_max ⇒ litige d'office | Test |

## 10. Décisions attendues
C-1 durées par catégorie / palier (après données du §3) ; C-2 seuils de valeur et preuves exigées par palier ; C-3 SLA de réponse de l'agence et délai de décision admin ; C-4 politique de retour à l'expéditeur et frais ; C-5 envoi SMS au destinataire (coût, prestataire) ; C-6 géolocalisation de l'agent (consentement) ; C-7 durée de conservation des photos ; C-8 libération anticipée : qui peut confirmer (destinataire, expéditeur, les deux) ; C-9 T_max d'absence de preuve.
