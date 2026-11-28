# Mission 0.3 — Partenaires : types d'accès et régime transitoire

**Statut : proposition (28/11/2026). Aucun code, aucune migration.** Règles validées : les accès existants sont conservés pendant leur vérification ; abonnements payants, gratuits, périodes d'essai et autorisations administratives sont distingués ; aucun nouvel abonnement payant n'est activé sans confirmation réelle du paiement (R3, R4).

## 1. Constat (code relu)
| Fait | Preuve |
|---|---|
| « Abonné » = contrat signé ; le paiement n'est jamais lu | `app/routers/partners.py` `my_billing` 942 ; `sign_contract` 577 |
| Approbation admin : compte actif + essai de 7 jours | `admin_update_status` 283-317 (`trial_ends_at` et `account_status` dans `models.py` 87-89) |
| Offre : `price`, `duration_months`, `payment_mode` (`monthly`/`quarterly`/`annual`/`one_time`), statut `proposed`/`accepted`/`declined` ; **aucune devise, aucun marché** | `models.py` `Offer` 152-166 |
| `ServiceSubscription` = demande d'un utilisateur pour un service H-Company, approuvée par un admin (concept **différent** : autorisation d'accès à un service, pas abonnement payant) | `models.py` 461+ |
| Aucun champ pays/marché sur `PartnerApplication` | `models.py` 109-145 |
| Nombre de partenaires réels inconnu (production non consultée) | à mesurer par l'audit en lecture seule du lot 0 |

## 2. Quatre types d'accès, un cinquième transitoire
Table `partner_access_grant` (environnement paiements, voir `PAYMENTS_0_3_MIGRATION_TOPOLOGY.md`) ; **l'accès se calcule à partir des octrois**, jamais à partir du contrat seul.

| Type (`kind`) | Définition | Qui le crée | Preuve exigée | Fin | Effet comptable |
|---|---|---|---|---|---|
| `paid_subscription` | Offre **payante** acceptée, contrat signé, **paiement confirmé par le prestataire (non simulé)** | Gestionnaire déclenché par la confirmation du paiement | Intent `confirmed` avec référence prestataire | Fin de période payée ; renouvellement = nouveau paiement | Revenu (écritures de grand livre) |
| `free_offer` | Offre **explicitement gratuite** (`partner_offer_terms.kind = free`, prix 0) | Admin (journalisé) | Drapeau explicite ; jamais déduit de `price = 0` | Selon l'offre | Aucune |
| `trial` | Essai limité, sans paiement | Système, à l'approbation | Date de début/fin ; **un seul essai par partenaire** | Date de fin (reprise du `trial_ends_at` actuel de 7 jours) | Aucune |
| `admin_authorization` | Accès accordé par un administrateur hors offre (cas particulier, partenariat, correction) | Admin | **Motif obligatoire**, identifiant admin, date de revue, périmètre | Date d'expiration ou révocation | Aucune ; compté à part dans les rapports |
| `legacy_transitional` | Partenaire **déjà actif** avant la mise en place : accès conservé pendant vérification | **Uniquement** le script de bascule (source `migration`) | Instantané daté de l'existant | Date de revue décidée par le propriétaire | Aucune |

Règles : le contrat signé et l'approbation admin restent **nécessaires** pour `paid_subscription` et `free_offer` (cadre juridique) mais **ne suffisent jamais** (R4) ; `legacy_transitional` ne peut **pas** être créé par l'API ni pour un nouveau partenaire ; `subscribed` renvoyé par `my_billing` = existence d'un octroi actif de l'un des cinq types, avec le type exposé.

## 3. Régime transitoire (conserver les accès pendant la vérification)

### 3.1 Bascule
1. **Instantané en lecture seule** (lot 0) : liste de tous les partenaires dont `subscribed` est vrai aujourd'hui (contrat signé), avec offre, paiements enregistrés (`Payment`), date de signature, état du compte.
2. **Création des octrois `legacy_transitional`** pour **chacun** (script rejouable, `--apply` explicite, archive) : au déploiement, **aucun partenaire ne perd son accès** (critère d'acceptation PT-1 : comptage identique avant/après).
3. Les essais en cours sont convertis en octrois `trial` (même date de fin).

### 3.2 Vérification (par partenaire)
Chaque octroi `legacy_transitional` est examiné et converti, avec validation du propriétaire :
| Issue | Conversion | Condition |
|---|---|---|
| Le partenaire doit payer | `paid_subscription` après offre acceptée et **vrai paiement** | Intent `confirmed`, non simulé |
| Gratuité décidée | `free_offer` | Offre marquée gratuite par un admin |
| Période d'essai | `trial` | Un seul essai, date de fin |
| Cas particulier justifié | `admin_authorization` | Motif et expiration |
| Fin de relation | Fin d'accès | **Préavis notifié** ; jamais de coupure silencieuse |

### 3.3 Échéance et garde-fous
- Le propriétaire fixe la date de revue (P-1) ; **aucune durée n'est imposée par ce document**.
- À l'échéance, **par défaut aucun retrait automatique** : l'octroi passe en file « à décider » (admin), l'accès reste jusqu'à décision (P-2 : alternative « coupure après préavis » si vous la préférez).
- Rapport hebdomadaire des octrois transitoires restants ; compteur visible dans l'écran admin.
- Aucun paiement simulé ne convertit un octroi (R2/R3) ; une conversion exige la preuve prestataire.

## 4. Correspondance de l'existant
| État actuel | Octroi à la bascule |
|---|---|
| Contrat signé, compte actif, hors essai | `legacy_transitional` |
| Compte en essai (`trial_ends_at` futur) | `trial` (+ `legacy_transitional` si contrat déjà signé) |
| Contrat non signé | Aucun octroi (comme aujourd'hui : non abonné) |
| Paiement `completed` enregistré (simulé ou non, indiscernable) | Aucune conversion automatique : traité comme `legacy_transitional` jusqu'à vérification (PA-1) |
| `ServiceSubscription` active | Inchangé (autorisation d'accès à un service, autre périmètre) |

## 5. Interface
Tableau de bord partenaire : type d'accès, date de fin, action « payer » si nécessaire, état du paiement (en attente / incertain / confirmé / échoué). Admin : écran « Accès partenaires » filtré par type et statut de revue ; création d'`admin_authorization` avec motif ; liste des octrois transitoires.

## 6. Critères d'acceptation
| # | Critère | Vérification |
|---|---|---|
| PT-1 | Après la bascule, tout partenaire `subscribed` avant reste `subscribed` (comptage identique, liste identique) | Test + requête avant/après |
| PT-2 | Contrat signé + approbation admin **sans paiement confirmé** pour un nouveau partenaire ⇒ non abonné | Test `my_billing` |
| PT-3 | Offre payante + paiement simulé (hors production) ⇒ aucun octroi `paid_subscription` valide pour le grand livre/retraits ; en production ⇒ refus | Tests |
| PT-4 | `free_offer` exige le drapeau explicite ; une offre à prix 0 non marquée est refusée | Test |
| PT-5 | Un seul `trial` par partenaire | Test d'unicité |
| PT-6 | `admin_authorization` sans motif ou sans admin identifié ⇒ refus | Test |
| PT-7 | `legacy_transitional` introuvable parmi les types créables par l'API ; création réservée à la source `migration` | Test d'API |
| PT-8 | Fin de revue : aucun retrait d'accès automatique sans décision (comportement par défaut) | Test de tâche planifiée |
| PT-9 | Chaque conversion écrit son origine (admin, intent) | Test |

## 7. Risques
Coupure d'accès à de vrais partenaires (atténué par la bascule et l'absence de retrait automatique) ; offres existantes sans devise (voir `PAYMENTS_0_3_MULTICURRENCY_POLICY.md`) ; paiements historiques indiscernables ; confusion entre `ServiceSubscription` et abonnement partenaire (documentée §1).

## 8. Décisions attendues
P-1 date et durée de la revue transitoire ; P-2 comportement à l'échéance (file « à décider » recommandée, ou coupure après préavis) ; P-3 qui valide la liste des partenaires et chaque conversion ; P-4 durée et périmètre de l'essai (aujourd'hui 7 jours) ; P-5 qui peut accorder une autorisation administrative ; P-6 renouvellements périodiques : rappels manuels ou prélèvement si le prestataire le permet.
