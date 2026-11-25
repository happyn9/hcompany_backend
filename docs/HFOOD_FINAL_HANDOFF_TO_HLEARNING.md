# HFood — handoff vers H-Learning

Date : 2026-11-25. À lire par une nouvelle session : **HFood est techniquement clôturé pour son périmètre convenu ; le prochain chantier est H-Learning.** Ne pas refaire les analyses HFood ; le détail est dans `docs/HFOOD_ETAT_FINAL.md`.

## Résumé
HFood (H-Restaurant) est la marketplace de plats de HCompany : restaurants et vendeurs individuels, catalogue, panier, commandes multi-vendeurs, paiement manuel, propositions de modification (D2), avis sur commandes terminées (E), dashboards client/vendeur/admin.

## Dépôts et PR
- Backend `happyn9/hcompany_backend` : A1/A2/C2/D1/dishes #6/SMTP #7 **fusionnés** ; **#8 (D2)** puis **#9 (E, base = branche D2)** en attente.
- Site `happy9ph/Hcompany` : tout fusionné jusqu'à #10 ; **#11 (D2 front)** puis **#12 (E front, base = branche D2 front)** en attente.
- Ordre : backend #8 → #9, site #11 → #12 ; retarget #9 et #12 sur `main` après le merge de leur base. Les front dépendent des routes backend correspondantes.
- Personne n'a mergé sur `main` ni déployé depuis ces sessions ; seul le propriétaire fusionne.

## Architecture (à connaître)
- Backend `app/restaurant/` : `models.py`, `orders.py` (vues/totaux/propositions), `services.py` (notify, refresh_rating), `limits.py` (quotas/env), `routers/{public,owner,orders,admin}.py`. Front `src/pages/resto/`, `src/components/restaurant/`, `src/i18n/restoUi.js` (FR/EN, parité de clés testée), `src/lib/{api,foodCart,locate}.js`.
- Chaîne Alembic : … → `d1a2b3c4e5f6` → `e2a2b3c4d5f6` → `f1c2a0b1d2e3` → `a4d1c2b3e5f6` → `b5d2c3e4f6a7` (D2) → `c6e3d4f5a7b8` (E). Double head historique `a1d5c8e2f4b7` : toujours `alembic upgrade heads`.

## Points à ne pas modifier sans raison
Recalcul serveur de tous les montants ; `Idempotency-Key` du checkout ; transitions atomiques de statut ; index uniques (proposition en attente, avis par sous-commande) ; panier sans localStorage (mémoire + cookie `hc_cart`) ; `ToastContext` ; helpers `alembic/_safe.py`.

## Tests
Voir `docs/HFOOD_ETAT_FINAL.md` §10 : backend SQLite + PG16 jetable tous verts ; vitest 127/127 ; build OK. Lancer les tests backend un fichier par processus, dans une copie, jamais sur une vraie base.

## Risques résiduels / reportés
Règles D2 étroites à valider (réduction/retrait seulement) ; e-mails réellement délivrés non vérifiés, ports SMTP possiblement bloqués sur Render gratuit ; panier serveur reporté ; parcours navigateur de bout en bout contre un vrai backend non exécuté ; bandeau promo global recouvrant certains écrans mobiles.

## Isolation de H-Learning
Les changements HFood (D2/E) ne touchent que `app/restaurant/`, ses migrations/tests/docs et les pages `resto` du site ; aucun fichier H-Learning, H-Money, Flutter Rafiki n'a été modifié (les tests `test_learning.py` : 10/10 verts après les changements). Prochaine étape : blueprint et développement de H-Learning, sur de nouvelles branches.
