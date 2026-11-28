# Paiements simulés hors H-Learning — matrice des risques et correctifs

**Statut : BLOCAGE OBLIGATOIRE avant le lancement commercial de Shopping, Transport (Billets et Colis), Logement et Partenaires** (décision du 27/11/2026).
**Aucun de ces services n'a été modifié dans la Mission 0.1.** Ce document prépare une mission dédiée.

## Règle définitive
> **Aucun paiement simulé ne peut accorder un service payant en production.**
> En production, un résultat `simulated=True` n'est jamais un succès : la commande, le billet, la réservation ou l'offre n'est ni confirmé, ni livré, ni activé, et le client voit un message clair.

## 1. Cause commune
`app/services/payments/gateway.py::charge()` renvoie un succès **simulé** (`success=True`, `simulated=True`) tant qu'aucune clé fournisseur n'est renseignée. H-Learning refuse ce cas en production (`settings.is_production`). Les autres services reçoivent le succès simulé et l'acceptent. Par ailleurs `app/config.py::_production_problems` ne vérifie pas la présence des clés de paiement au démarrage.

## 2. Matrice par service
| Service | Fichier / point d'appel | Comportement actuel | Conséquence en production sans clé | Gravité | Correctif nécessaire |
|---|---|---|---|---|---|
| **Shopping** | `app/shopping/routers/buyer.py` → `charge_payment`, puis `mark_group_paid(simulated=…)` | `simulated` enregistré, mais le groupe passe `paid`, les commandes sont confirmées, e-mail « Commande confirmée » envoyé | Marchandises commandées sans paiement ; vendeurs notifiés ; séquestre fictif | **Critique** | Refuser `simulated` si `is_production` (groupe `failed`, 503) ; ne jamais envoyer l'e-mail ni notifier les vendeurs ; gérer `unavailable` / `uncertain` comme H-Learning |
| **Transport — Billets** | `app/transport/routers/public.py::book` → `mark_paid(simulated=…)` | Billet `paid` avec QR code, notification « Billet confirmé » | Billets valides sans paiement, sièges consommés | **Critique** | Idem ; libérer les sièges gardés pendant le paiement en cas de refus ; pas de QR émis |
| **Transport — Colis** | `app/transport/cargo.py` (~l.380) → `charge_payment`, puis `status="confirmed"`, `escrow_status="held"` | **Le résultat `simulated` n'est pas lu ni enregistré** ; colis confirmé, fonds « en séquestre » fictifs, code de livraison et notification opérateur envoyés | Fret accepté et opérateur mobilisé sans paiement ; **aucune trace** permettant de distinguer les colis simulés | **Critique** (traçabilité nulle) | Idem + enregistrer `simulated` et la référence fournisseur sur le colis (champ à ajouter : migration à planifier dans la mission dédiée) ; refuser en production |
| **Logement** | `app/lodging/routers/guest.py` → `mark_paid(simulated=…)` | Réservation `confirmed`/en attente d'hôte, e-mail « Paiement reçu » | Dates bloquées et hôte engagé sans paiement | **Critique** | Idem ; libérer les dates si refus ; ne pas notifier l'hôte |
| **Partenaires** | `app/routers/partners.py` `create_payment` 1038-1088 | Paiement enregistré `completed` (simulé non lu ni stocké). **Correction Mission 0.2 : l'activation du partenaire ne dépend pas du paiement** (`my_billing` 942, `sign_contract` 577) ; aucune notification n'est liée au paiement ; le site affiche « Paiement confirmé » même si le paiement échoue (`Payment.jsx` 248-357) | Preuve comptable fausse, abonnement non appliqué, fausse confirmation à l'utilisateur | **Haute** (décision métier sur le lien paiement ↔ activation) | Voir PA-1 à PA-6 du rapport d'audit ; refuser le simulé en production ; API 402/503 en échec ; stocker `simulated` |
| **Toutes les passerelles** | `gateway.py` | Avec clés renseignées : `unavailable` (corrigé en Mission 0.1) | Les services ci-dessus traitent déjà l'échec comme un refus (402) : pas de 500 | Faible | Distinguer `unavailable` (503) de `refused` (402) et `uncertain` (503 + référence, paiement `pending`) partout |

## 3. Correctifs transverses (à faire une seule fois)
1. **Garde centrale** : dans `gateway.charge()` (ou un wrapper `charge_checked`), si `settings.is_production` et résultat simulé → renvoyer `unavailable` (jamais `success`). Un seul endroit, testé une fois, héritée par tous les services.
2. **Contrôle au démarrage** : ajouter à `_production_problems` l'exigence d'un fournisseur réellement intégré (ou un drapeau explicite « paiements désactivés ») ; refuser de démarrer sinon.
3. **Garde d'écriture** : les fonctions `mark_paid` / `mark_group_paid` / activation partenaire lèvent une erreur si `simulated and is_production`.
4. **Traçabilité** : colonne `simulated` + `provider_reference` sur Colis et sur les paiements Partenaires.
5. **États incertains** : adopter `pending` + 503 + référence pour `uncertain`, et prévoir le rapprochement (P1 paiements).
6. **Nettoyage** : requête d'audit listant les lignes `simulated=True` déjà présentes en base de production (lecture seule, validation humaine avant toute correction).

## 4. Tests exigés pour la mission dédiée
Pour chaque service, en mode production simulé : paiement simulé → refus, **aucune** commande/billet/réservation/offre confirmé, stock/sièges/dates libérés, aucune notification de succès ; en mode développement : le comportement actuel reste disponible ; échec fournisseur (`unavailable`, `uncertain`) → état cohérent, pas de 500. Exécution sur SQLite et PostgreSQL.

## 5. Conditions de levée du blocage
Le lancement commercial d'un service n'est autorisé que si : (a) son correctif est livré et testé, (b) un vrai fournisseur est intégré et validé pour ce service, (c) l'audit des lignes simulées existantes est fait, (d) le propriétaire a validé explicitement.

## 6. Hors périmètre ici
H-Learning est déjà protégé (Mission 0.1). HFood et H-Money ne sont pas concernés par cette matrice et ne sont pas modifiés.

## 7. Mise à jour Mission 0.2 (28/11/2026) — preuves issues du code

Le détail (fichier, fonction, lignes, comportement, risque, criticité, correction) est dans **`docs/PAYMENTS_SIMULATION_DEEP_AUDIT.md`**. Changements par rapport aux sections ci-dessus :

| Point | Avant | Après lecture approfondie |
|---|---|---|
| Partenaires — activation | « offre/abonnement activé gratuitement » | **Corrigé** : l'activation est indépendante du paiement (PA-2) ; le paiement n'active rien et n'envoie aucune notification (PA-3) |
| Partenaires — interface | non vérifié | Le site affiche « Paiement confirmé » même pour un paiement `failed` (PA-4) |
| Colis | confirmé sans trace | Confirmé [C] ; `payment_reference` contient notre référence interne, pas celle d'un fournisseur (CG-2) ; capacité retenue sans expiration (CG-3) |
| Fonds simulés | non étudié | **Nouveau, critique** : ils deviennent un solde retirable dans Shopping, Transport (Billets + Colis) et Logement ; aucun maillon ne lit `simulated` (X-1) |
| Montant nul | non étudié | La passerelle ne valide pas le montant (ROOT-3) ; réservation à 0 en Logement : **hypothèse à tester** (LOG-2) |
| Paiements incertains | corrigé pour H-Learning | Traités comme un refus dans tous les autres flux (X-3) |
| Webhooks | non étudié | Aucun webhook hors H-Money / auth : pas de chemin externe pour marquer « payé » (ROOT-4) |

Hypothèses encore **non exécutées** : LOG-2, CG-3 (orphelin), PA-4 (rendu navigateur), X-1 (parcours complet), ROOT-1 (preuve d'exécution). Aucune correction n'est commencée.
