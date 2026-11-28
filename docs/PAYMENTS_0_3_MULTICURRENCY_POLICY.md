# Mission 0.3 — Politique multidevise et tarification par marché

**Statut : proposition (28/11/2026). Aucun code, aucune migration.**
Décision du propriétaire : tarification **par marché** — **Zambie : ZMW ; RDC : USD**. Quatre notions de devise distinctes : **commerciale, encaissée, de règlement, comptable de référence**.
**H-Money est hors périmètre** : ni son architecture, ni ses réserves, ni ses règles de change, ni son grand livre ne sont utilisés, importés ou modifiés. La politique ci-dessous a ses **propres** tables de taux et de grand livre.

## 1. Constat (code relu)
| Fait | Preuve |
|---|---|
| Monnaie pivot interne : **ZMW** (`learning_pivot_currency`) ; les autres devises sont des **conversions d'affichage** via la table `CurrencyRate` (partagée Shopping / H-Learning) | `config.py` 99 ; `shopping/models.py` 5-8 ; `learning_plans.py` 119-123, 206 |
| Offres partenaires : `price` sans devise ni marché ; libellés affichés en `$` | `models.py` 152-166 ; `partners.py` (audit PA-*, lignes 752, 1070) |
| `PartnerApplication` : aucun pays / marché | `models.py` 109-145 |
| Le paiement mobile est **spécifique à la Zambie** : numéros normalisés `normalize_zm_phone`, préfixes `OPERATOR_PREFIXES` (Airtel, MTN, Zamtel) | `learning_plans.py` 209-216 ; `shopping/routers/seller.py` 418-419 |
| Aucun moyen de paiement ni format de numéro pour la RDC | idem |
| Les montants du grand livre à venir sont des `Numeric`, un `currency` par intent | Blueprint §2 |

## 2. Les quatre devises

| Notion | Définition | Qui la fixe | Règle |
|---|---|---|---|
| **Commerciale** | Devise du **tarif contractuel** affiché et accepté | Le marché de l'offre | ZMW pour la Zambie, USD pour la RDC. Fixée dans `partner_offer_terms` (et équivalents des autres services), **jamais déduite** d'un symbole d'affichage |
| **Encaissée** | Devise **réellement débitée** au payeur par le prestataire | La politique de paiement du couple (marché, moyen, prestataire) | **Par défaut = commerciale** (aucune conversion silencieuse). Une encaissée différente exige une règle explicite, un taux **figé à l'initialisation** et montré au payeur |
| **De règlement** | Devise dans laquelle le **bénéficiaire est versé** (agence, vendeur, hôte) | Le profil du bénéficiaire (marché) | ZMW pour un bénéficiaire zambien, USD pour un bénéficiaire congolais ; **aucune conversion** dans la Mission 0.3 : règlement = encaissée, sauf décision CU-5 |
| **Comptable de référence** | Devise de **consolidation** des rapports | La direction | Une seule pour tous les rapports (décision CU-3) ; stockée comme **montant de référence + taux utilisé** à chaque écriture, jamais recalculée après coup |

## 3. Matrice marché × devises (proposition)

| Marché | Commerciale | Encaissée | Règlement | Moyens de paiement | Observations |
|---|---|---|---|---|---|
| **Zambie** | ZMW | ZMW | ZMW | Mobile money zambien (Airtel, MTN, Zamtel), carte | Existant |
| **RDC** | USD | USD | USD | À définir : opérateurs et formats de numéros de la RDC (à valider avec le prestataire, DEP-1) ; carte | Aucun moyen codé aujourd'hui ; franc congolais (CDF) **hors périmètre** |

Chaque **offre, boutique, agence, hôte, partenaire** porte un **marché** explicite (nouveau champ dans les tables annexes de l'environnement paiements, pas dans les tables existantes) ; un utilisateur d'un marché ne peut pas payer une offre d'un autre marché sans règle explicite.

## 4. Règles
1. **Une devise par intent** (ISO-4217 en liste blanche : `ZMW`, `USD` au départ).
2. **Aucune arithmétique entre devises** dans le grand livre : les soldes sont tenus **par bénéficiaire et par devise** ; un portefeuille affiche une ligne par devise.
3. **Remboursement dans la devise encaissée**, au montant encaissé (pas de gain/perte de change côté payeur).
4. **Commission** calculée dans la devise de la transaction ; **retrait minimum** défini par devise.
5. **Prix séparés par marché** (deux lignes de tarif), pas une conversion automatique d'un prix de base.
6. **Taux de change** : table propre `payment_fx_rate` (base, cotation, taux, date de validité, source, saisi par) **saisie manuellement par un administrateur** dans la Mission 0.3 ; sert uniquement au **montant comptable de référence** et à l'affichage ; **jamais** à facturer ni à régler. La table `CurrencyRate` existante (affichage) reste **inchangée** et ne sert pas à débiter.
7. **Arrondis** : 2 décimales pour ZMW et USD ; règle d'arrondi unique, testée.
8. **Contrôle d'adéquation** : devise de l'intent = devise commerciale de l'objet ; moyen de paiement compatible avec la devise ; sinon 422.
9. **Séparation H-Money** : aucun import de `app/money`, aucune lecture de ses réserves ni de ses règles de change.

## 5. Données existantes
Les offres partenaires existantes n'ont **ni devise ni marché** : le blueprint **ne suppose rien**. Rétro-classification : devise `unknown` + marché `unknown` ⇒ **aucun paiement possible** tant qu'un administrateur n'a pas confirmé la devise et le marché de l'offre. Les libellés `$` historiques ne valent pas preuve de devise (décision CU-6). Les services déjà en ZMW (Shopping, Transport, Logement) sont rattachés au marché Zambie par règle.

## 6. Impact par composant
| Composant | Changement |
|---|---|
| Passerelle commune | `currency` obligatoire à l'initialisation ; adaptateurs par moyen de paiement ; refus des incompatibilités |
| Grand livre | `currency` sur chaque écriture ; soldes par devise ; montant de référence + `fx_rate_id` (nullable tant que la source de taux n'est pas décidée) |
| Partenaires | `partner_offer_terms.market/currency` ; interface de choix du marché à la création de l'offre |
| Shopping, Billets, Colis, Logement | Marché Zambie par défaut ; champ explicite pour l'extension future à la RDC |
| Portefeuilles, retraits | Un solde et un minimum par devise |
| Site | Affichage de la devise commerciale et de la devise encaissée ; plus de « $ » en dur ; formats de numéros RDC si le marché est ouvert |

## 7. Critères d'acceptation
| # | Critère | Vérification |
|---|---|---|
| FX-1 | Un intent sans devise ou avec une devise hors liste blanche est refusé | Test |
| FX-2 | Une offre USD ne peut pas être payée avec un moyen ZMW (et inversement) | Test |
| FX-3 | Aucun solde ni somme n'additionne deux devises (test d'invariants sur le grand livre) | Test |
| FX-4 | Remboursement dans la devise et au montant encaissés | Test |
| FX-5 | Un taux de référence est enregistré avec chaque écriture une fois la source décidée ; jamais recalculé | Test |
| FX-6 | Offre sans devise ou marché confirmés ⇒ paiement refusé | Test |
| FX-7 | `CurrencyRate` n'est jamais lu pour débiter ; `app/money` n'est importé nulle part dans `app/payments/` | Test statique |
| FX-8 | Retraits : minimum et solde par devise | Test |

## 8. Dépendances et risques
Moyens de paiement RDC et couverture USD du prestataire (DEP-1) ; réglementation de change et de détention de fonds dans chaque pays (non évaluée ici, avis juridique DEP-6) ; source de taux ; pas de conversion = pas de gain de change mais bénéficiaires payés en USD à un marché où l'USD est la norme, à valider ; coût de la double tenue (ZMW/USD) dans l'interface.

## 9. Décisions attendues
CU-1 services ouverts dans chaque marché et calendrier ; CU-2 politique d'encaissement RDC (USD seul, ou autre) ; CU-3 devise comptable de référence (ZMW actuel ou USD) ; CU-4 source des taux et qui les saisit ; CU-5 règlement des bénéficiaires congolais en USD par quel canal ; CU-6 devise historique des offres partenaires existantes ; CU-7 traitement fiscal et réglementaire (hors périmètre de ce document).
