# H-Learning — Feuille de route d'implémentation

## État Git
Branche `hlearning-p0-audit` (depuis `main`). PR ouverte vers `main`, **jamais fusionnée par moi**. Pas de déploiement, pas de migration en production.

## P0 — Socle (fait dans cette PR)
1. Paiement simulé refusé en production (aucun accès payant sans confirmation réelle).
2. Progression : leçons non publiées → 404, exclusives sans bouquet → 403.
3. Anti-doublon : achat identique (30 s) et inscription présentiel ouverte.
4. Cours avec progression : archivé, pas supprimé.
5. Tests de régression : `tests/test_learning_p0.py` (8 tests).

## P0 — Reste à faire (avant P1)
- Index unique `lessonprogress(user_id, lesson_id)` avec migration additive/ré-exécutable (`alembic/_safe.py`), dédoublonnage non destructif, essai sur PG jetable.
- Remplacer les `NotImplementedError` des passerelles par une erreur 503 propre quand des clés sont posées sans intégration.
- Journal d'audit des changements de statut d'abonnement par l'admin.
- Front : supprimer la clé `learning` dupliquée de `api.js` ; message clair sur le 503 du checkout.

## P1 — Individual
1. Modèle `Enrollment` (apprenant, cours, source : gratuit/bouquet/admin, statut, unicité `(user_id, course_id)`), endpoint idempotent `POST /courses/{id}/enroll`.
2. Progression rattachée à l'inscription, pourcentage serveur.
3. Tableau de bord apprenant réel (cours en cours, terminés, prochaine leçon).
4. Webhook paiement signé + idempotent ; états pending/paid/failed/refunded.
5. Certificat minimal (cours terminé à 100 %), vérifiable par code.
6. Évaluations simples après P1.3.

## P2 Family · P3 Business · P4 Instructor/Admin · P5 Outreach
Dans l'ordre du blueprint ; chacun démarre seulement quand Enrollment et paiement fiable sont en place. Tests cross-Family / cross-Organization / Instructor ajoutés à la création de chaque concept.

## Risques
Passage simulé→réel du paiement (aucune intégration opérateur codée) ; double tête Alembic historique (toujours `upgrade heads`) ; données existantes `TrainingRegistration` à ne pas confondre avec des enrollments.

## Résultats de tests réels
(à compléter ci-dessous après exécution)

Backend, exécutés fichier par fichier (SQLite jetable) : tous verts — dont `test_learning.py` 10/10 et `test_learning_p0.py` 8/8 ; fichiers PG ignorés (« skipped ») faute de base PG dans cette passe.
Limite connue, antérieure à ce travail : lancer `pytest tests` dans UN seul processus produit des échecs/erreurs d'isolation (313 passés, 18 échecs, 9 erreurs : bases/variables d'environnement posées au chargement de chaque fichier ; `test_hfood_a2/e0` refusent de tourner sans variables PG). Non corrigé ici ; à traiter dans une PR d'infrastructure de tests.
Frontend (inchangé dans cette PR, état de `main` + PR HFood en cours) : `vitest` 25 fichiers / 126 tests verts ; `vite build` OK. Pages learning non vérifiées dans un navigateur.
Migrations : aucune réalisée dans cette PR.
