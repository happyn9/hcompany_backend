# Notes sécurité et migrations HFood

> Mis à jour à la clôture HFood (2026-11-25) : A1/A2/C2/D1 sont fusionnés ; D2 et E sont en PR (voir `HFOOD_ETAT_FINAL.md`). Les sections ci-dessous gardent leur contexte historique ; la section 3 donne l'état actuel des heads.

## 1. `.env` suivi dans Git
- `.env` était suivi depuis le commit `1fb3093` (15/09/2026), le seul commit GitHub qui le touche ; `.env.example` aussi.
- Constat (valeurs non recopiées ici) : `.env` est **identique** à `.env.example` : base SQLite locale, `SECRET_KEY` et
  `AUTH_SERVICE_API_KEY` = placeholders, SMTP/Twilio/Sentry/Redis vides. Aucun secret réel détecté dans le dépôt.
- Garde-fous existants : `app/config.py` refuse en production une `SECRET_KEY` par défaut/trop courte ; `.dockerignore` exclut `.env`.
- Fait (et déjà présent sur `main` : aucune action restante) : `.env` n'est plus suivi ; `.gitignore` ignore `.env` et `.env.*` sauf `.env.example`.
- Le dépôt est **public** : si un jour une vraie valeur y avait figuré, la procédure serait :
  1. révoquer/régénérer AVANT toute réécriture : mot de passe de la base (Supabase), `SECRET_KEY` (identique au service auth),
     `AUTH_SERVICE_API_KEY`, SMTP, Twilio, Sentry ; mettre les nouvelles valeurs dans Render ;
  2. purger l'historique (`git filter-repo --path .env --invert-paths`) puis force-push, après accord explicite ;
  3. demander à GitHub de purger les caches/forks si nécessaire et vérifier avec un scan de secrets (gitleaks/trufflehog).
  Ici l'étape 2 n'est PAS nécessaire (aucun secret réel) ; l'historique n'a pas été réécrit.

## 2. Migration A1.1 `d1a2b3c4e5f6`
- sha256 (préfixe 12) du fichier livré dans ce dépôt : `10a017a04fcb`. Il est identique octet pour octet au fichier contenu
  dans `HFOOD_A1_FINALISATION.diff`. Le préfixe `b3b5b3481e92` cité dans les notes n'est reproduit par aucune variante
  (fins de ligne, saut de ligne final) ; il provient probablement d'une version antérieure du fichier. Alembic ne vérifie pas
  de hash : seule compte l'identité de révision, inchangée. Pour trancher, comparer avec l'original : `sha256sum <fichier>`.

## 3. Double head Alembic
- Heads : `a1d5c8e2f4b7` (uploadblob.created_at, issue de `f3b8c6d2e4a7`) et `e2a2b3c4d5f6` (HFood A2).
- Cause : `b0e1f2a3c4d5` (merge) ne référence qu'un parent dans ce dépôt, alors que la base de l'utilisateur l'a appliquée avec
  `('a1d5c8e2f4b7', 'a4c9e7b1d3f5')` (cf. commentaire du fichier). La branche `a1d5c8e2f4b7` n'est donc jamais fusionnée ici.
- Sans risque : `a1d5c8e2f4b7` est idempotente et `entrypoint.sh` exécute `alembic upgrade heads`. Vérifié sur base vide, base
  à `c9d0e1f2a3b4` avec colonne déjà présente, et relance (idempotence). `alembic upgrade head` (singulier) échoue : toujours `heads`.
- Aucune migration merge ajoutée (non nécessaire, évite de changer la stratégie de production). Option ultérieure : une migration
  `merge(a1d5c8e2f4b7, e2a2b3c4d5f6)`, additive, à décider séparément.

### État actuel de la chaîne (clôture HFood)
- Chaîne HFood : `d1a2b3c4e5f6` (A1.1) → `e2a2b3c4d5f6` (A2) → `f1c2a0b1d2e3` (C2) → `a4d1c2b3e5f6` (D1) → `b5d2c3e4f6a7` (D2, PR #8) → `c6e3d4f5a7b8` (E, PR #9).
- Le double head historique `a1d5c8e2f4b7` subsiste (inchangé, idempotent). Toujours `alembic upgrade heads`.
- Les migrations D2 et E sont additives (nouvelles tables uniquement), ré-exécutables, avec downgrade qui ne supprime que leurs propres tables.
