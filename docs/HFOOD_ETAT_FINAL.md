# HFood — état final (clôture technique)

Date : 2026-11-25. Dépôts : backend `happyn9/hcompany_backend`, site `happy9ph/Hcompany`.
Aucun déploiement, aucune migration sur une vraie base, aucune variable de production touchée.

## 1. Fonctionnalités
| Domaine | Contenu | Statut |
|---|---|---|
| A1/A2 | Vendeurs (restaurant / individuel), catalogue, livraison, contact direct, réservations (restaurants seulement), sécurité, admin | Fusionné |
| Découverte | Recherche, filtres, page `/restaurant/plats` (carte, « Près de moi », fiche plat), `GET /restaurant/dishes` | Fusionné |
| C2 | Panier (mémoire + cookie `hc_cart`), checkout idempotent, commandes multi-vendeurs | Fusionné |
| D1 | Cycle de vie des sous-commandes, paiement manuel, notifications | Fusionné |
| D2 | Proposition de modification (vendeur) → décision du client | PR backend #8 + site #11 |
| E | Avis sur commande terminée, « Mes avis » vendeur, modération et résumé commandes admin | PR backend #9 + site #12 (basées sur D2) |

## 2. Règles de commande
- Une commande parent = une sous-commande par vendeur. Le serveur recalcule tout (prix, disponibilité, totaux) ; le client n'envoie jamais de montant.
- Statuts de sous-commande : pending → accepted → preparing → ready → completed ; refus/annulation possibles selon `SELLER_TRANSITIONS` ; transitions atomiques (`UPDATE … WHERE status=…`, 409 sinon).
- Paiement manuel uniquement : `payment_status` unpaid → declared (client) → confirmed (vendeur), indépendant du statut de commande. Frais de livraison « à convenir » = hors totaux.

## 3. D2 — propositions de modification
Règles retenues (périmètre volontairement étroit, **à valider** par le propriétaire du produit) :
- le vendeur peut seulement **réduire une quantité ou retirer une ligne** (article indisponible). Pas de hausse, de changement de prix, de remplacement d'article ni de frais ;
- possible tant que la sous-commande est pending/accepted/preparing **et** le paiement `unpaid` ;
- une seule proposition en attente par sous-commande (index unique partiel, PG et SQLite) ; expiration 48 h (`HFOOD_PROPOSAL_TTL_HOURS`) ;
- rien n'est modifié avant l'acceptation ; l'acceptation applique les lignes et recalcule sous-commande + commande parent avec les prix figés ; refus/expiration/retrait = commande inchangée ;
- pendant l'attente : le vendeur ne peut pas passer à prête/terminée ni confirmer un paiement, le client ne peut pas déclarer de paiement ; annulation/refus de la commande clôt la proposition ;
- historique conservé (propositions et lignes, sans FK sur la ligne de commande car elle peut être supprimée).
Routes : `POST /seller/orders/{code}/proposals`, `…/proposals/cancel`, `POST /me/suborders/{code}/proposals/{id}/decision`.

## 4. E — avis
- Un avis par sous-commande **completed**, uniquement par le client propriétaire (404 sinon, 409 si non terminée ou déjà noté), note 1–5, commentaire ≤ 600 caractères, non modifiable.
- Note affichée = moyenne des avis de réservation existants + avis de commande non masqués. Page publique : prénom seulement, badge « Commande vérifiée ».
- Vendeur : `GET /seller/reviews`. Admin (confirmation requise) : `GET /admin/reviews`, `POST /admin/reviews/{id}/hide|unhide` (motif obligatoire pour masquer), `GET /admin/orders/summary` (statuts, paiements, alertes > 48 h).
- Pas de réponse du vendeur, pas de commentaires sociaux (hors périmètre).

## 5. Dashboards
- Client : `/restaurant/commandes` (liste avec badge « À valider », détail, décision D2, avis).
- Vendeur : `/restaurant/pro/commandes` (traitement, proposition D2), `/restaurant/pro/avis`, espace pro (catalogue, disponibilités).
- Admin : panneau restaurants + commandes/avis (onglet existant).

## 6. Notifications
Via `svc.notify` (interne) ; e-mails HFood envoyés dans un thread d'arrière-plan avec retry PLAIN/LOGIN (PR #7). **Non vérifié** : délivrance réelle d'un e-mail (aucun SMTP réel utilisé dans les tests). Render gratuit peut bloquer les ports SMTP sortants (25/465/587).

## 7. Panier synchronisé côté serveur — décision : REPORTÉ
- Aujourd'hui : panier en mémoire + cookie fonctionnel `hc_cart` (ids + quantités, 7 jours, SameSite=Lax), déclaré dans l'avis cookies.
- Limites : pas de partage entre appareils ; panier perdu si cookies effacés ; pas de lien avec le compte.
- Sécurité : la manipulation du cookie est sans effet (le serveur revalide tout : prix, disponibilité, vendeur, quantités ; caps de lignes/vendeurs).
- Coût d'une synchro : table panier + endpoints + règles de fusion à la connexion (conflit appareil/compte = décision métier), nettoyage, RGPD. Pas indispensable avant lancement ; à reprendre si les statistiques montrent des paniers abandonnés multi-appareils.

## 8. Permissions (vérifiées par tests)
Client A ≠ commande de B (404) ; vendeur A ≠ commandes/propositions/avis de B ; simple client sans accès `seller/*` ; admin routes : 403 hors admin confirmé ; vendeur individuel : pas de réservation.

## 9. Migrations
Chaîne : A1.1 → A2 → C2 → D1 → D2 `b5d2c3e4f6a7` → E `c6e3d4f5a7b8`. Additives, idempotentes, downgrade limité à leurs tables. Testées SQLite et PostgreSQL 16 jetable. `alembic upgrade heads` (double head historique inchangé).

## 10. Tests (exécutés le 2026-11-25 sur copie du backend, un fichier par processus)
Backend SQLite : a1 52, a2 22, c2 16, d1 5, **d2 10**, **e 6**, dishes 4, smtp 5, migrations a1 58 (+41 PG), a2 5, c2 5, d1 3, **d2 3**, **e 3** ; autres modules (money, shopping, lodging, learning, transport, tourism, partnerhub, promos, restaurant, security_hardening, upload_store, auth, geo, agents, knowledge, fleet…) tous verts.
Backend PostgreSQL 16 jetable : migrations a1/c2/d1/d2/e (SQLite+PG) verts, c2_pg 5, a1_pg 10, pg_safety 44.
Frontend : `npx vitest run` 127/127, `npx vite build` OK (branche E). Vérification navigateur 1366/768/390/360 : pas de débordement horizontal.
Limite : le bandeau promo global recouvre en partie certains écrans mobiles tant qu'il n'est pas fermé (comportement existant).

## 11. Parcours de bout en bout
| Parcours | Couverture |
|---|---|
| Restaurant (découverte → commande → traitement → fin) | tests c2/d1 + e (checkout → accepted → completed → avis) |
| Vendeur individuel | tests a2 (pas de réservation) + commande individuelle |
| Multi-vendeurs | c2, d2 (propositions isolées), e (avis séparés) |
| D2 acceptation / refus | d2_proposals |
| E éligible / non éligible | e_reviews |
| Permissions | d2, e, c2, d1 |
| Paiement manuel | d1, d2 (blocage pendant proposition) |
Aucun test navigateur « bout en bout » contre un vrai backend n'a été exécuté : les écrans ont été vérifiés avec des réponses API simulées.

## 12. Limites connues / reportés
Hausse de quantité, changement de prix, remplacement d'article, frais dans D2 (décision métier) ; réponse du vendeur aux avis ; panier serveur ; vérification d'e-mails réels ; validation en préproduction.

## 13. Procédure de validation en préproduction
1. Merger dans l'ordre : backend #8 → #9 (retarget main), site #11 → #12 (retarget main). Backend #6/#7 et site #9/#10 sont déjà fusionnés.
2. Sur une base de préproduction (copie), `alembic upgrade heads`, vérifier `foodorderproposal` et `foodorderreview`.
3. Parcours manuel : commande → proposition → acceptation → paiement déclaré/confirmé → terminée → avis → masquage admin.
4. Tester l'envoi SMTP avec la configuration réelle (non vérifié à ce jour).
