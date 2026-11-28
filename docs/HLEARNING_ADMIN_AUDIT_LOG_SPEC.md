# H-Learning — Spécification du journal d'audit des actions admin

**Statut : reporté en P1 (décision du 27/11/2026). Rien n'est implémenté. Aucune migration n'a été créée.**
Ce document fixe le besoin pour qu'il puisse être implémenté plus tard sans nouvelle phase d'analyse.

## 1. Pourquoi
Les administrateurs H-Learning peuvent créer, modifier, supprimer et synchroniser des cours et des leçons, changer le statut des inscriptions (en présentiel et entreprises) et, plus tard, agir sur les abonnements. Aujourd'hui aucune trace durable ne dit **qui a fait quoi, quand, sur quoi, avec quel résultat**. Conséquences : impossible d'enquêter sur une suppression de cours, un changement de statut contesté ou un octroi d'accès manuel ; pas de preuve en cas de litige de paiement.

## 2. Actions à journaliser (routes existantes de `app/routers/learning.py`, rôle admin)
| Action (`action`) | Route | Cible (`target_type` / `target_id`) |
|---|---|---|
| `course.create` / `course.update` / `course.delete` / `course.sync` | `/learning/admin/courses…` | `course` / id |
| `lesson.add` / `lesson.delete` | `/learning/admin/courses/{id}/lessons`, `/admin/lessons/{id}` | `lesson` / id |
| `registration.status` | `/admin/registrations/{id}/status` | `training_registration` / id |
| `company_enrollment.status` | `/admin/company-enrollments/{id}/status` | `company_training_request` / id |
| Plus tard (P1) | actions admin sur abonnements, remboursements, octrois manuels | `subscription`, `payment` |

À journaliser aussi : refus d'accès admin (tentative d'un non-admin), car c'est un signal de sécurité (`outcome = denied`).

## 3. Modèle de données proposé (table `adminauditlog`)
| Colonne | Type | Règle |
|---|---|---|
| `id` | entier, PK | |
| `created_at` | datetime UTC, indexé | non modifiable |
| `actor_user_id` | FK `user.id`, indexé | l'admin authentifié |
| `actor_role` | texte | rôle au moment de l'action |
| `action` | texte, indexé | valeurs du §2 |
| `target_type`, `target_id` | texte, entier | indexés ensemble |
| `outcome` | texte | `success` / `denied` / `error` |
| `before` | JSON, nullable | état utile avant (champs métier uniquement) |
| `after` | JSON, nullable | état utile après |
| `reason` | texte, nullable | motif saisi (obligatoire pour suppression et octroi manuel) |
| `request_id` | texte, nullable | corrélation avec les logs |
| `ip` | texte, nullable | adresse source (voir confidentialité) |

## 4. Règles de conception
1. **Append-only** : aucune route de modification ni de suppression du journal ; pas de `DELETE` applicatif. Archivage seulement par une procédure documentée.
2. **Même transaction que l'action** : l'écriture du journal et le changement métier sont validés ensemble (ou annulés ensemble). Une action sans trace ne doit pas exister ; une trace sans action non plus, sauf `denied`/`error` qui sont écrits dans une transaction séparée.
3. **Aucun secret** : jamais de mot de passe, jeton, clé de passerelle, numéro de carte ou de mobile money complet dans `before`/`after` ; masquer les numéros (derniers chiffres seulement).
4. **Un seul point d'entrée** : une fonction `record_admin_action(session, actor, action, target, before, after, reason, outcome)` appelée par chaque route admin, pour ne pas disperser la logique.
5. **Lecture** : route `GET /learning/admin/audit-log` réservée admin, paginée (curseur), filtrable par acteur, action, cible et période ; export CSV réservé admin. La lecture du journal est elle-même journalisée (`audit.read`).
6. **Confidentialité** : durée de conservation à décider (proposition : 24 mois), IP traitée comme donnée personnelle.

## 5. Contraintes techniques connues (pourquoi c'est reporté)
- Nouvelle table = **nouvelle révision Alembic**.
- Alembic a **deux têtes** (`a1d5c8e2f4b7`, `c6e3d4f5a7b8`, branche HFood). `entrypoint.sh` utilise `upgrade heads`.
- Le test HFood `test_hfood_a1_migration` impose la topologie des têtes : toute nouvelle révision le casse (2 échecs constatés lors de la Mission 0.1).
- Décision en attente pour le P1 : (a) révision de fusion des deux têtes **avec** adaptation validée du test HFood, ou (b) révision rattachée à la tête H-Learning et ajustement du test. Aucune des deux n'est faite à ce jour.

## 6. Critères d'acceptation (pour le P1)
- Chaque route du §2 écrit exactement une ligne de journal en cas de succès, avec acteur, cible, avant/après.
- Un non-admin reçoit 403 **et** une ligne `denied`.
- Aucune route ne permet de modifier ou supprimer une ligne.
- Une erreur d'écriture du journal fait échouer l'action admin (pas d'action silencieuse).
- Tests sur SQLite **et** PostgreSQL ; migration testée sur une copie jetable, jamais sur la production.
- Aucun secret présent dans `before`/`after` (test dédié).
