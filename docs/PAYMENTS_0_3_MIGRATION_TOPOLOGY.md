# Mission 0.3 — Analyse de la topologie des migrations et stratégie de compatibilité

**Statut : analyse documentaire en lecture seule. Aucune migration créée, aucune fusion des têtes Alembic, aucun test H-Food modifié (décision du 28/11/2026).**
Les prédictions de résultat de test ci-dessous viennent de la **lecture** des assertions ; elles ne sont **pas exécutées** et devront être confirmées sur copie jetable (lot 1).

## 1. Constat sur le graphe actuel (relevé avec l'API Alembic en lecture seule, sans base)

| Élément | Valeur |
|---|---|
| Révisions | **48** |
| Base unique | `1c3da842f3bc` |
| Points de bifurcation | **1** : `f3b8c6d2e4a7` (deux enfants : `a1d5c8e2f4b7` et `a4c9e7b1d3f5`) |
| Révision de fusion (deux parents) | **aucune** |
| Tête A (branche « historique ») | `a1d5c8e2f4b7` — `uploadblob.created_at` — 1 révision après la bifurcation |
| Tête B (branche H-Food) | `c6e3d4f5a7b8` — « HFood E : avis liés à une sous-commande terminée » — **23** révisions après la bifurcation (`a4c9e7b1d3f5 … c6e3d4f5a7b8`) |
| Application des migrations | `entrypoint.sh` : `alembic upgrade heads` (pluriel : les deux têtes) |
| `alembic/env.py` | une seule `target_metadata = SQLModel.metadata`, `render_as_batch=True`, verrou consultatif PostgreSQL `727274001`, imports explicites de chaque module de modèles |
| Création du schéma en production | **uniquement Alembic** : aucun `create_all` au démarrage de l'application (recherche dans `app/`, `alembic/`, `scripts/`) |
| Aides | `alembic/_safe.py` (migrations ré-exécutables : `has_table`, `has_col`, `add_col`) |

## 2. Ce que les tests H-Food figent (assertions citées)

| Fichier | Ligne | Assertion (forme) |
|---|---|---|
| `tests/test_hfood_a1_migration.py` | 436 | `HEAD not in heads and A2_HEAD not in heads and len(heads - {"a1d5c8e2f4b7"}) == 1` |
| `tests/test_hfood_c2_migration.py` | 168 | `"c6e3d4f5a7b8" in heads and … and heads - {"c6e3d4f5a7b8"} <= {"a1d5c8e2f4b7"}` |
| `tests/test_hfood_d1_migration.py` | 154 | `E in heads and … and heads - {E} <= {"a1d5c8e2f4b7"}` (E = `c6e3d4f5a7b8`) |
| `tests/test_hfood_a2_migration.py` | 159 | `A1 not in heads and A2 not in heads` (non concerné par un nouvel ajout ailleurs) |
| `tests/test_hfood_d2_migration.py` 163 ; `…_e_migration.py` 49 | | `upgrade heads` (non concernés) |

**Règle résultante** : l'ensemble des têtes doit être exactement `{a1d5c8e2f4b7, c6e3d4f5a7b8}` (ou la seule tête H-Food accompagnée, au plus, de `a1d5c8e2f4b7`). Toute autre tête, ou la disparition de `c6e3d4f5a7b8` comme tête, est rejetée.

## 3. Options et compatibilité (prédiction par lecture ; à confirmer par exécution)

| Option | Ensemble des têtes après | a1 (436) | c2 (168) | d1 (154) | Autorisation nécessaire |
|---|---|---|---|---|---|
| **0. Environnement Alembic dédié aux paiements** (aucune révision dans le graphe actuel) | inchangé : `{a1d5…, c6e3…}` | ✅ | ✅ | ✅ | **Aucune** sur les tests ; modification de `entrypoint.sh` (déploiement, voir §4.6) |
| A. Nouvelle révision au-dessus de `a1d5c8e2f4b7` | `{nouvelle, c6e3…}` | ❌ (2 têtes hors `a1d5`) | ❌ | ❌ | Adapter 3 tests H-Food |
| B. Nouvelle révision au-dessus de `c6e3d4f5a7b8` | `{a1d5…, nouvelle}` | ✅ | ❌ (`c6e3` plus tête) | ❌ (`E` plus tête) | Adapter 2 tests H-Food |
| C. Révision de fusion des deux têtes | `{fusion}` | ✅ | ❌ | ❌ | Adapter 2 tests H-Food (**refusé pour l'instant**) |
| D. Nouvelle branche indépendante (base propre, étiquette de branche) | 3 têtes | ❌ | ❌ | ❌ | Adapter 3 tests H-Food |

Cohérence avec l'historique : en Mission 0.1, une révision ajoutée au-dessus d'une tête avait fait échouer **2** tests H-Food ; selon le point d'attache, le nombre prédit varie (2 ou 3). Les options A, B, C, D sont donc **exclues** tant que les tests H-Food ne peuvent pas être adaptés.

## 4. Stratégie recommandée — Option 0 : environnement Alembic séparé

### 4.1 Principe
Un second environnement Alembic, **propriétaire exclusif des tables de paiement**, avec son propre historique et sa propre table de version. Le graphe principal (48 révisions, 2 têtes) n'est pas modifié ; `alembic upgrade heads` se comporte comme aujourd'hui ; aucun test H-Food n'est touché.

| Élément | Proposition |
|---|---|
| Emplacement | `alembic_payments/` (scripts, `env.py`, `versions/`) + `alembic_payments.ini` |
| Table de version | `alembic_version_payments` (distincte de `alembic_version`) |
| Métadonnées | `MetaData` **séparée** pour les modèles de paiement (`app/payments/models.py`) : l'autogénération du graphe principal ne les voit pas (pas de proposition de création/suppression parasite) |
| Verrou PG | identifiant distinct du `727274001` principal |
| `render_as_batch` | oui (compatibilité SQLite) |
| Ordre d'exécution | 1) `alembic upgrade heads` (existant) 2) `alembic -c alembic_payments.ini upgrade head` (nouveau) |
| Retour arrière | `downgrade` du seul environnement paiements (supprime uniquement les tables de paiement) |

### 4.2 Règle « aucune colonne sur les tables existantes »
Le blueprint v1 prévoyait des colonnes sur des tables existantes (impossibles sans révision principale). Elles deviennent des **tables annexes** de l'environnement paiements :

| Besoin | Ancienne idée | Table annexe |
|---|---|---|
| Lien commande/billet/colis/réservation ↔ paiement | `payment_intent_id` sur la table du service | Aucun lien physique : `payment_intent(service, subject_type, subject_id)` + index ; le service retrouve son intent par clé |
| Expiration du colis en attente | `cargobooking.hold_until` | `payment_intent.expires_at` / `reconcile_deadline` |
| Offre gratuite/payante, marché, devise | `offer.kind` | `partner_offer_terms(offer_id, kind, market, currency, …)` |
| Retraits : preuve, administrateur, écriture | colonnes sur `shoppayout` / `transportpayout` / `lodgepayout` | `payout_settlement(service, payout_id, state, provider_reference, processed_by_user_id, ledger_txn_id, …)` |
| Accès partenaire | modification du contrat/compte | `partner_access_grant` (voir `PAYMENTS_0_3_PARTNER_TRANSITION.md`) |
| Marqueur « simulé » des colis et paiements partenaires | `simulated` | porté par `payment_intent.is_simulated` pour les **nouveaux** paiements ; les existants sont classés par la rétro-classification (§6) |

Clés étrangères : seules les références vers des tables **stables** (`user.id`) sont autorisées ; les objets métier sont référencés par `(service, subject_id)` **sans** clé étrangère (aucune dépendance de schéma entre les deux environnements).

### 4.3 Fail-closed
Si l'environnement paiements n'est pas à jour (par exemple `alembic upgrade heads` seul a été lancé), l'application doit le détecter (`payments_schema_ready()` compare `alembic_version_payments` à la tête attendue) et **refuser toute initiation de paiement** (503) ; en production, le démarrage échoue ou se met en mode « paiements indisponibles » (choix M-4). Aucune confirmation de service n'est jamais produite sans schéma prêt.

### 4.4 Types et contraintes compatibles SQLite et PostgreSQL
`Numeric(14,2)` pour les montants (jamais `float`) ; `JSON` générique (pas de `JSONB` obligatoire) ; contraintes `CHECK (amount > 0)` ; **index uniques partiels** (`sqlite_where` / `postgresql_where`) pour « un seul intent non terminal par objet » ; verrous `SELECT … FOR UPDATE` **uniquement** sur PostgreSQL, comparaison-et-échange (CAS) partout ailleurs.

### 4.5 Limites assumées de l'option 0
| Limite | Conséquence | Atténuation |
|---|---|---|
| Deux historiques à exploiter | Complexité d'exploitation | Un seul script d'entrée, documentation, test de cohérence |
| Impossible d'ajouter `NOT NULL` ou `CHECK` sur les tables existantes | Contraintes seulement côté service | Contrôles de réconciliation (écart si un service payé n'a pas d'intent confirmé) |
| Pas de clé étrangère vers les objets métier | Intégrité référentielle applicative | Test d'intégrité + requête d'audit périodique |
| Convergence future | Deux environnements à fusionner un jour | Plan §5 |

### 4.6 Ce que l'option 0 exige hors du code
Une ligne de plus dans `entrypoint.sh` (déploiement). C'est une décision du propriétaire (M-1) ; **je n'y touche pas** dans cette mission.

## 5. Plan de convergence (information, non engagé)
Si le propriétaire autorise plus tard l'adaptation des tests H-Food : (1) révision de fusion des deux têtes, (2) adaptation minimale des trois assertions de têtes (§2), (3) « adoption » des tables de paiement dans le graphe principal par une révision idempotente (`has_table`) puis `stamp` de l'environnement paiements, (4) suppression de l'environnement séparé. Rien de cela n'est préparé en code.

## 6. Rétro-classification des données (sans migration de schéma sur les tables existantes)
Script en lecture seule par défaut, `--apply` explicite, URL en argument, rejouable, copie d'archive des lignes touchées (modèle `scripts/lessonprogress_uniqueness.py`). Il ne **modifie aucune table existante** : il écrit uniquement dans les tables de l'environnement paiements des écritures `legacy_unverified` / `simulated`.

## 7. Critères d'acceptation de la stratégie de migration
| # | Critère | Vérification |
|---|---|---|
| MIG-1 | L'ensemble des têtes du graphe principal reste exactement `{a1d5c8e2f4b7, c6e3d4f5a7b8}` | Test dédié (hors H-Food) lisant `ScriptDirectory.get_heads()` |
| MIG-2 | Les tests H-Food existants passent **sans modification** | Exécution de `test_hfood_*_migration.py` avant/après |
| MIG-3 | `upgrade` → `downgrade` → `upgrade` de l'environnement paiements est idempotent et sans résidu | Test sur SQLite et PostgreSQL jetable |
| MIG-4 | Le graphe principal fonctionne sans l'environnement paiements (rien ne casse si absent) et l'application refuse les paiements (fail-closed) | Test |
| MIG-5 | Aucune table existante n'est modifiée (comparaison des schémas avant/après) | Comparaison d'inspecteur SQLAlchemy |
| MIG-6 | Nombre de lignes de toutes les tables existantes identique avant/après rétro-classification | Comptages |
| MIG-7 | Deux démarrages simultanés ne se corrompent pas (verrou) | Test de concurrence PostgreSQL |

## 8. Décisions attendues
| # | Décision | Recommandation |
|---|---|---|
| M-1 | Autoriser l'option 0, donc une ligne supplémentaire dans `entrypoint.sh` à l'étape de déploiement | Oui |
| M-2 | Emplacement et nom de l'environnement (`alembic_payments/`) | Valider |
| M-3 | Convergence ultérieure (§5) : à planifier ou jamais | À planifier, après la clôture du P0 |
| M-4 | Schéma de paiement absent en production : refus du démarrage ou paiements en « indisponible » | Mode « indisponible » (le reste de l'API continue) |
