# H-Learning — Rapport final de clôture du P0 (Mission 0.1)

Branche `hlearning-p0-closure` (backend) et `hlearning-p0-api-dup` (site). Rien n'est fusionné dans `main`, rien n'est déployé,
aucune migration n'a été jouée sur une base de production, aucun `.env` n'a été lu ni commité, HFood / H-Money / Flutter-Rafiki / variables
de production non touchés (voir « Périmètre » en fin de document).

## 1. Verdict (décisions du 27/11/2026 intégrées)

| Sujet | Statut |
|---|---|
| **Mission 0.1** | **Terminée** (6 volets réalisés et vérifiés, validée par le propriétaire). |
| **P0 global** | **Non clôturé** : le journal d'audit admin reste à faire. |
| **Journal d'audit admin** | **Reporté en P1**. Aucune implémentation, aucune migration. Besoin documenté : `docs/HLEARNING_ADMIN_AUDIT_LOG_SPEC.md`. |
| **Paiements simulés des autres services** (Shopping, Transport y compris Colis, Logement, Partenaires) | **Blocage obligatoire avant leur lancement commercial respectif.** Services non modifiés. Matrice de risques et correctifs : `docs/PAYMENTS_SIMULATION_RISK_MATRIX.md`. Règle définitive : **aucun paiement simulé ne peut accorder un service payant en production.** |
| **Déploiement / fusion** | **Aucun déploiement, aucune fusion.** PR backend #12 et site #26 ouvertes. |
| **P1** | **Non commencé.** Aucun autre développement sans validation. |

## 2. Problèmes trouvés

| # | Constat | Gravité | Origine exacte |
|---|---|---|---|
| T1 | La suite complète en un seul processus donne **18 échecs et 10 erreurs** (316 passés, 63 ignorés). Reproduit tel quel (vous en aviez compté 9 erreurs ; j'en trouve 10). | Outillage | Chaque fichier de test fixe `DATABASE_URL` vers **sa propre base jetable à l'import**, mais `app.database.engine` n'est créé qu'une fois par processus : tous les fichiers suivants partagent la base du premier (`UNIQUE constraint failed: user.email`, montants décalés). Les 6 fichiers HFood refusent en plus l'import (garde volontaire). Détail des 18 échecs : money 5, money_quotes 4, shopping 3, money_flow 2, transport 1, onboarding_pro 1, money_invoices 1, knowledge 1. Détail des 10 erreurs : 6 refus d'import HFood, tourism 2, restaurant 2. **Aucun n'est un bug du produit** : lancés chacun dans leur processus, tous passent (§4). |
| T2 | 4 tests ignorés par fichier HFood migration + tests PostgreSQL non exécutés en Mission 0. | Couverture | Pas de PostgreSQL local. Corrigé : un PostgreSQL 16 jetable a été lancé dans le bac à sable (§4). |
| P1 | **Mon audit de la Mission 0 était inexact** : j'avais écrit que la contrainte unique `(user_id, lesson_id)` de `LessonProgress` manquait. Elle **existe déjà** en base : `UniqueConstraint(..., name='uq_lessonprogress_user_lesson')` dans la migration d'origine `a3c8e5d17b42`. | Information | Ce qui manquait réellement : le **modèle** ne la déclarait pas (bases créées par `create_all`, dont les tests, sans unicité ; risque de dérive Alembic) et `save_progress` ne gérait pas la course (`IntegrityError` → 500). Les trois documents de la Mission 0 sont corrigés. |
| P2 | `save_progress` : lecture puis écriture sans gestion de la concurrence. | Moyenne | Sur PostgreSQL, 12 requêtes simultanées sur l'ancien code ont fait échouer l'un des deux tests de concurrence (non déterministe, la fenêtre de course est étroite). |
| G1 | **Clés de passerelle renseignées → `NotImplementedError` → HTTP 500** et abonnement laissé `pending`. | Haute | `gateway.py` levait l'exception pour carte / Airtel / MTN / Zamtel dès que les clés existaient. |
| G2 | Une exception du fournisseur (réseau, délai) n'était pas rattrapée. | Haute | Aucun `try/except` autour de l'appel. |
| G3 | Clé faite uniquement d'espaces comptée comme « renseignée ». | Basse | Test `if not settings.x` sur une chaîne non vide. |

## 3. Corrections réalisées

- **Progression** (`app/models.py`, `app/routers/learning.py`)
  - Contrainte `uq_lessonprogress_user_lesson` déclarée dans le modèle (même nom que la migration d'origine : pas de dérive).
  - `save_progress` : lecture déterministe (`ORDER BY id`) puis upsert ; si l'index unique refuse un doublon simultané, rollback, relecture de la ligne gagnante et mise à jour (jamais de doublon, jamais de 500, une leçon terminée le reste).
  - **Pas de nouvelle révision Alembic** (voir §5) : à la place, `scripts/lessonprogress_uniqueness.py`, **lecture seule par défaut** (`--apply` explicite, URL passée en argument, rien lu dans l'environnement). Avec `--apply`, dans une transaction : fusion des doublons (ligne de plus petit id conservée avec la meilleure progression), **copie de chaque ligne retirée dans `lessonprogress_dup_archive`**, puis création de l'index. Rejouable sans effet. Sur toute base issue des migrations il ne fait rien.
- **Paiements** (`app/services/payments/gateway.py`, `app/routers/learning_plans.py`)
  - `PaymentResult` gagne `unavailable` (fournisseur non contacté, échec définitif) et `uncertain` (issue inconnue).
  - Clés renseignées mais intégration non branchée → `unavailable`, jamais de succès, jamais d'exception. Clés vides ou d'espaces = absentes.
  - Toute exception du fournisseur → `uncertain` (ni succès ni refus), journalisée.
  - Checkout : `uncertain` → abonnement **reste `pending`** (aucun accès), HTTP 503 avec la référence, et une répétition identique dans les 30 s n'est **pas rejouée** (pas de second débit) ; `unavailable` → `failed` + 503 ; refus → `failed` + 402 ; simulation en production → `failed` + 503 (déjà en Mission 0).
- **Outillage de test** : `tests/conftest.py` refuse d'emblée le lancement de plusieurs fichiers à base propre dans un même processus, avec un message clair, au lieu de produire de faux échecs (`HC_ALLOW_SHARED_PROCESS=1` pour forcer). `run_tests.sh` utilise `$PYTHON`, affiche un résumé exact et sort en erreur si un fichier échoue. Aucun test n'a été retiré, ignoré ou assoupli.
- **Site** (PR distincte) : retrait du doublon mort de la clé `learning` dans `src/lib/api.js` (la seconde déclaration, complète, écrasait la première).

## 4. Tests exécutés et résultats exacts

Environnement : Python 3.13, PostgreSQL 16 jetable local (`127.0.0.1:54331`, base `hfood_test_p0`, schémas temporaires créés puis supprimés par les garde-fous de `tests/pg_safety.py`), SQLite jetable par fichier.

- **Suite complète, un processus par fichier, PostgreSQL activé** (`PYTHON=… HFOOD_TEST_PG_URL=… bash run_tests.sh`) : **47 fichiers, 0 en échec, 520 passés, 0 échec, 4 ignorés.** Les 4 ignorés (`test_hfood_a1_migration.py`) sont les pendants dialecte-spécifiques de cas exécutés sur l'autre dialecte (« SQLite : colonne NOT NULL… », « PostgreSQL uniquement » ×3), pas des tests désactivés.
- **Tests PostgreSQL ignorés en Mission 0, maintenant exécutés** : `test_hfood_a1_pg` 10, `test_hfood_c2_pg` 5, migrations HFood (a1 95 + 4 ignorés, a2 10, c2 10, d1 6, d2 6, e 6), `test_hfood_pg_safety` 44 : tous passés.
- **Nouveaux tests** : `test_learning_p01.py` **34** (unicité, 8 requêtes de progression simultanées, passerelles × 4 méthodes × clés absentes / espaces / présentes / erreur fournisseur, checkout en développement et production, réponse incertaine non rejouée, refus 402) ; `test_learning_p01_migration.py` **10** (5 SQLite + 5 PostgreSQL : diagnostic sans effet, fusion + archive sans perte, comptage conservées + archivées = avant, rejeu sans effet, base normale inchangée) ; `test_learning_p01_pg.py` **3** (PostgreSQL réel, 10 requêtes simultanées → exactement 1 ligne, leçons différentes sans interférence).
- **Les nouveaux tests détectent bien les défauts** : sur l'ancien code, 26 des 34 tests de `test_learning_p01.py` échouent ; sur PostgreSQL, l'ancien `save_progress` fait échouer un test de concurrence (non déterministe).
- **Isolation** : chacun des 47 fichiers passe seul dans son propre processus ; en mode partagé, la suite échoue comme décrit en T1 (cause établie, gardée par `conftest.py`).
- **Permissions, doublons, archivage, régression** : `test_learning_p0.py` (8) et `test_learning.py` (10) passent ; accès cours / leçons privés ou brouillons (403 / 404), routes admin (401 / 403), inscription sans doublon, achat sans double débit, cours avec progression archivé et non supprimé : tous passés. Aucun test existant modifié.
- **Site** : `vitest` 139/139, `vite build` OK.
- **Navigateur** (Chromium via Playwright, site en dev + vrai backend local sur base SQLite jetable avec 2 cours dont un réservé aux membres) : pages Learning — hub, bouquets, fiche cours, lecteur, paiement, inscription présentiel — à **1366×768, 768×1024, 390×844, 360×800** (états succès) et 1366 / 390 (états vide, erreur 500, chargement simulé) : **aucun débordement horizontal, aucune erreur JavaScript ni console** avec l'origine locale autorisée. Constats : un cours inconnu (404) renvoie au hub ; un cours réservé affiche « Exclusif », « Voir les bouquets » et leçons « Réservé aux abonnés » ; l'erreur serveur affiche « Impossible de charger ce cours pour le moment » avec lien de retour. Observations non bloquantes : pendant le chargement, les pages cours et lecteur sont vides (pas de squelette) ; une réponse « tableau vide » à la place d'un cours affiche un titre vide et « 0 leçon » (cas que l'API réelle ne produit pas, elle renvoie 404).

## 5. Migrations

**Aucune révision Alembic créée.** Une révision filet avait été écrite et testée, puis retirée : l'état actuel d'Alembic a **deux têtes** (`a1d5c8e2f4b7` et `c6e3d4f5a7b8`, branche HFood) et le test HFood `test_hfood_a1_migration` impose que la seule tête ajoutée soit celle de HFood ; toute nouvelle révision le fait échouer (2 échecs constatés). Modifier ce test toucherait HFood, ce qui est exclu. La contrainte étant déjà en base via `a3c8e5d17b42`, la correction passe par le modèle, le code et le script de contrôle. **Aucune migration jouée sur une base de production.**

## 6. Risques résiduels et décisions attendues

1. **Journal d'audit admin — DÉCIDÉ : reporté en P1** (nouvelle table donc nouvelle révision Alembic). Pas de fusion des deux têtes pour l'instant, ni de modification des migrations ou des tests HFood. Spécification : `docs/HLEARNING_ADMIN_AUDIT_LOG_SPEC.md`. Tant qu'il n'est pas livré, le P0 global n'est pas clôturé.
2. **Deux têtes Alembic.** `entrypoint.sh` joue `upgrade heads`, donc le déploiement fonctionne, mais `alembic upgrade head` (au singulier) échouerait.
3. **Paiement simulé en production hors H-Learning — DÉCIDÉ : blocage obligatoire avant lancement commercial** de Shopping, Transport (Billets et Colis), Logement et Partenaires. Ils marquent encore « payé » quand aucune clé n'existe, même en production (la garde n'existe que pour H-Learning) ; Colis et Partenaires ne conservent même pas l'indicateur `simulated`. Non modifié dans cette mission ; correctifs listés dans `docs/PAYMENTS_SIMULATION_RISK_MATRIX.md` (mission dédiée). Effet de bord de G1 : avec des clés renseignées, ces modules reçoivent désormais un échec propre au lieu d'un 500.
4. **Aucun fournisseur réel branché** : carte, Airtel, MTN, Zamtel renvoient « indisponible » dès que les clés existent. Webhooks signés et idempotents, rapprochement des paiements `pending` incertains : P1.
5. **Course sur `register_in_person` et le checkout** : protégés par la fenêtre anti-doublon de 30 s et un contrôle applicatif, pas par une contrainte en base (comme la progression).
6. **Tests de concurrence SQLite** : la sérialisation d'écriture de SQLite réduit leur portée ; la preuve de référence est celle de PostgreSQL.
7. Le script `lessonprogress_uniqueness.py --apply` ne doit jamais être lancé en production sans sauvegarde et validation humaine.

## 7. Tests non exécutés

- Fournisseurs de paiement réels (aucune clé, aucun compte marchand, aucun appel réseau sortant autorisé).
- Lecture vidéo YouTube dans le lecteur (réseau sortant bloqué dans le bac à sable : l'iframe reste noire en test).
- Pages nécessitant une connexion (« Mon bouquet », paiement connecté) en navigateur : couvertes par les tests d'API, non parcourues visuellement.
- Aucun test sur base de production, par règle.

## 8. Périmètre respecté

Aucune modification de HFood, H-Money, Flutter / Rafiki, `ToastContext` ni des variables de production ; pas de lecture ni commit de `.env` (le dépôt n'en contient pas) ; branches dédiées, PR non fusionnées.
