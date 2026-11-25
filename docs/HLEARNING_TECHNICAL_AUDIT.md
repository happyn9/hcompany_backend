# H-Learning — Audit technique (Mission 0)

Date : 2026-11-25 · Branche : `hlearning-p0-audit` · Dépôts : backend `happyn9/hcompany_backend`, site `happy9ph/Hcompany`.
Référence : `H-Learning_Development_Blueprint_V1.md`. Rien n'a été déployé, aucune base de production touchée, `.env` jamais lu.

## 1. Architecture réellement découverte

**Backend** (FastAPI / SQLModel / Alembic / slowapi, Postgres Supabase, Render)
- `app/routers/learning.py` : catalogue, détail de cours, progression, inscription au présentiel, demande d'équipe, CRUD admin cours/leçons, synchro YouTube.
- `app/routers/learning_plans.py` : bouquets (`LearningPlan`), checkout, abonnement, membres d'un bouquet équipe, admin bouquets/devises/abonnements.
- `app/services/learning_access.py` : droit d'accès exclusif = bouquet actif (titulaire ou membre par e-mail). `app/services/youtube.py` : synchro playlist.
- Modèles (`app/models.py`) : `Course`, `Lesson`, `LessonProgress`, `TrainingRegistration`, `CompanyTrainingRequest`, `LearningPlan`, `CurrencyRate`, `LearningSubscription`, `LearningSubscriptionMember`.
- Auth : jeton partagé (`decode_shared_token`) lu en en-tête Bearer ou cookie `access_token` ; `get_current_user`, `get_optional_user`, `get_current_admin`, `get_current_agent` dans `app/deps.py`. Rôles : `admin`, `agent`, `partner`, `client`. Le rôle vient de la base, jamais du client.
- Paiement : `app/services/payments/gateway.py`. Sans clés fournisseur, `charge()` renvoie un succès **simulé**.

**Frontend** (React/Vite) : `src/pages/learning/*` (LearningHub, CourseDetail, CoursePlayer, InPersonRegistration, PlansPage, Checkout, MySubscription, UstudyPage), `src/components/learning/*`, `src/lib/learningProgress.js` (progression des visiteurs sans compte, en mémoire), `src/data/courses.js`, `api.learning.*` dans `src/lib/api.js`, onglets admin dans `AdminDashboard.jsx`.

## 2. Ce qui existe et fonctionne (vérifié par test)
- Catalogue public publié uniquement ; cours/leçons CRUD admin ; synchro YouTube simulée en test.
- Leçons exclusives : `youtube_id`, miniature et description masqués sans bouquet actif (test existant).
- Progression par utilisateur ; inscription au présentiel ; demande entreprise avec total recalculé côté serveur.
- Bouquets : montant calculé côté serveur, places équipe, ajout/retrait de membres par le titulaire, activation manuelle admin (espèces), bouquet acheté jamais supprimé (désactivé).
- Endpoints admin protégés par `get_current_admin`.

## 3. Problèmes détectés

| # | Gravité | Problème | État |
|---|---|---|---|
| P1 | **Critique** | Sans clés opérateur/Stripe, `charge()` simule un succès : en production, n'importe quel compte obtenait un bouquet payant gratuitement. | **Corrigé** (503 + abonnement `failed` en production ; activation manuelle admin conservée) |
| P2 | Haute | `PUT /lessons/{id}/progress` acceptait une leçon non publiée ou exclusive sans bouquet. | **Corrigé** (404 / 403) |
| P3 | Haute | Achats répétés (double clic/réessai) = plusieurs débits et plusieurs abonnements. | **Corrigé** (fenêtre anti-doublon 30 s, sans migration) |
| P4 | Moyenne | Inscriptions présentiel répétées = doublons + e-mails multiples. | **Corrigé** (demande ouverte identique renvoyée) |
| P5 | Moyenne | `DELETE /admin/courses/{id}` effaçait la progression des élèves (historique). | **Corrigé** (archivage si progression existante) |
| P6 | Moyenne | Pas de contrainte unique `(user_id, lesson_id)` sur `LessonProgress` : course possible → doublons. | Ouvert — migration proposée (roadmap) |
| P7 | Moyenne | Pas de modèle d'inscription (enrollment) apprenant↔cours : « inscription » = formulaire présentiel. Le blueprint exige Enrollment lié à l'apprenant. | Ouvert (P1) |
| P8 | Moyenne | Aucun rôle Instructor, Family, Business/Organization ; pas de propriété de cours (`Course` sans `instructor_id`/`owner`). | Ouvert (P2–P4) |
| P9 | Moyenne | Cycle de vie du cours = booléen `is_published` ; pas de Draft/Review/Approved. | Ouvert (P4) |
| P10 | Moyenne | Paiement synchrone sans webhook ; pas d'état `pending` réel ni de vérification de signature. Les intégrations opérateurs lèvent `NotImplementedError` dès que les clés sont posées (→ 500). | Ouvert |
| P11 | Basse | Réactivation admin d'un abonnement `failed` → `active` sans trace d'audit dédiée. | Ouvert |
| P12 | Basse | Membres d'un bouquet équipe : contrôle des places non atomique (course théorique). | Ouvert |
| P13 | Basse | Front : clé `learning` déclarée deux fois dans `api.js` (la première, morte, est écrasée). | Ouvert (nettoyage) |
| P14 | Info | Certificats : seulement une section marketing (`CertificateSection.jsx`), aucun modèle ni endpoint. Évaluations : absentes. Notifications in-app/analytics learning : absentes. | Ouvert |

## 4. Sécurité — scénarios demandés

| Scénario | Résultat | Test |
|---|---|---|
| Accès cours privé/brouillon | Brouillon = 404 ; exclusif = leçons verrouillées sans fuite d'ID | `test_private_and_draft_course_access` |
| Données d'un autre utilisateur | Progression isolée par `user_id` | `test_progress_is_per_user` |
| Endpoints Admin sans droit | 401/403 | `test_admin_endpoints_refused_to_non_admin` |
| Paiement échoué/non confirmé → accès | Échec = `failed`, pas d'accès ; simulation refusée en prod | `test_simulated_payment_never_grants_access_in_production` |
| Requêtes répétées → doublons | Une seule inscription / un seul achat | `test_registration_repeat…`, `test_checkout_repeat…` |
| Progression sur contenu verrouillé | 403 / 404 | `test_progress_blocked_on_locked_and_unpublished_lessons` |
| Historique préservé | Cours archivé, progression gardée | `test_course_with_progress_is_archived_not_deleted` |
| Inter-Family / inter-Organization / Instructor | **Non applicable : ces concepts n'existent pas encore** (non vérifiable, à tester quand créés) | — |

## 5. Fichiers modifiés (backend)
`app/routers/learning.py`, `app/routers/learning_plans.py`, `tests/test_learning_p0.py` (nouveau), `docs/HLEARNING_*.md` (nouveaux). Aucune migration réalisée.

## 6. Tests exécutés
Voir `HLEARNING_IMPLEMENTATION_ROADMAP.md` §Résultats (chiffres réels reportés après exécution).

## 7. Non vérifié
Rendu navigateur des pages learning, flux réel avec un fournisseur de paiement, envoi d'e-mails réel, comportement sur la base Postgres de production.
