# H-Learning — Conformité au blueprint et mapping technique

Statuts : ✅ présent et fonctionnel · 🟡 incomplet · 🔴 défectueux · ⛔ absent · ❓ non vérifiable.

## A. Matrice de conformité

| Fonctionnalité du blueprint | Statut | Fichiers / endpoints / modèles | Tests |
|---|---|---|---|
| Authentification, sessions (cookie/Bearer, jeton partagé) | ✅ | `app/deps.py`, `services/shared_auth.py` | `test_auth_core.py` |
| Rôles backend (admin/agent/partner/client) | 🟡 | `UserRole` ; pas d'Instructor/Family/Business | `test_security_hardening.py` |
| Permissions vérifiées côté backend | ✅ (admin, propriétaire) | `get_current_admin`, filtres `user_id` | `test_learning_p0.py` |
| Catalogue / catégories | 🟡 | `Course.category`, `GET /courses` ; pas de table Category | `test_learning.py` |
| Cours / leçons | ✅ | `Course`, `Lesson` ; synchro YouTube | `test_learning.py` |
| Modules / sections | 🟡 | `Lesson.section` (texte), pas d'entité Module | — |
| Ressources de cours | ⛔ | — | — |
| Contenu réservé (abonnés) | ✅ | `members_only`, `has_exclusive_access` | `test_learning.py`, `test_learning_p0.py` |
| Inscription apprenant (Enrollment) | ⛔ | seul `TrainingRegistration` (demande présentiel) | doublons testés |
| Progression | 🟡 | `LessonProgress` ; unicité `(user_id, lesson_id)` en base (migration `a3c8e5d17b42`, modèle aligné Mission 0.1) ; upsert sûr ; contrôle d'accès corrigé | `test_learning_p0.py`, `test_learning_p01*.py` |
| Évaluations / quiz | ⛔ | — | — |
| Certificats | ⛔ | section marketing front uniquement | — |
| Dashboard apprenant | 🟡 | `MySubscription.jsx`, `/me/progress` ; pas de tableau de bord cours | — |
| Espace Family | ⛔ | — | — |
| Espace Business / Business Learning | 🟡 | `CompanyTrainingRequest` (formulaire), bouquet équipe par e-mail | `test_learning.py` |
| Instructor (création, soumission, revue) | ⛔ | admin seul édite les cours | — |
| Admin (cours, bouquets, abonnements, inscriptions) | ✅ | endpoints `/admin/*` | `test_learning.py` |
| Plans/quotas centralisés | ✅ | `LearningPlan` configurable (pas de `if plan ==`) | `test_learning.py` |
| Paiements : états, idempotence, webhooks | 🔴→🟡 | checkout synchrone ; simulation bloquée en prod ; anti-doublon 30 s ; **pas de webhook** | `test_learning_p0.py` |
| Remboursement / historique financier | 🟡 | historique conservé, bouquet jamais supprimé | `test_learning.py` |
| Notifications | 🟡 | e-mails d'activation / inscription ; pas de notifications in-app learning | — |
| Analytics (données réelles) | ⛔ | — | — |
| Migrations / modèles | ✅ | Alembic, 47 versions, double tête historique | — |

## B. Doublons et incohérences
- `api.js` : clé `learning` déclarée deux fois (la première est morte).
- Deux notions d'« inscription » : `TrainingRegistration` (présentiel) et abonnement ; aucune inscription à un cours.
- Progression visiteurs en mémoire (front) vs `LessonProgress` (compte) : pas de fusion à la connexion (non vérifié).

## C. Mapping domaines → architecture existante

| Domaine | Existant réutilisable | À ajouter (minimal, additif) |
|---|---|---|
| Identity | `User`, `UserRole`, auth partagée | rôle `instructor` (valeur d'enum, sans migration SQL en SQLite/PG si colonne texte — à vérifier) |
| Catalog | `Course.category`, `level`, `sort_order` | — (Category reste un champ texte en V1) |
| Content | `Lesson`, `section`, YouTube | `Course.instructor_id`, `status` (cycle de vie) |
| Learning | `LessonProgress` | `Enrollment(user_id, course_id, source, status)` + unicité |
| Achievement | — | `Certificate` quand évaluations prêtes (P1 tardif) |
| Individual | `LearningPlan` individuel, `MySubscription` | tableau de bord apprenant |
| Family | — | `Household`, `HouseholdMember` (P2) |
| Business | `LearningSubscription.org_name`, bouquet équipe | `Organization`, `OrganizationMember` (P3) |
| Business Learning | `CompanyTrainingRequest` | affectations de cours (P3) |
| Billing | `LearningSubscription`, `LearningPlan`, `CurrencyRate`, gateway | webhooks vérifiés + `provider_reference` unique (P1) |
| Outreach | `TrainingRegistration` | — (P5) |
| Communication | `send_email`, `Notification` (modèle global) | brancher les événements learning |
| Administration | `/admin/*` | file de revue des cours (P4) |
| Analytics | — | agrégats SQL sur données réelles (P4) |

Tables à NE PAS créer maintenant : Family, Organization, Certificate, Quiz, Category.
Migrations réellement nécessaires pour P1 : `enrollment` (nouvelle table, additive), `course.instructor_id`/`status` nullable (P4).

## D. Dépendances entre fonctionnalités
Enrollment ← Progress, Certificates, Dashboard. Webhooks paiement ← accès payant fiable ← Individual. Organization/Household ← Enrollment (le bénéficiaire reste l'apprenant, pas le payeur). Instructor ← `Course.instructor_id`.
