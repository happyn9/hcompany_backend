"""Garde-fou d'isolation de la suite.

Chaque fichier de test qui touche à la base fixe `DATABASE_URL` vers SA base jetable À L'IMPORT, alors que le moteur
(`app.database.engine`) n'est créé qu'une fois par processus : lancer plusieurs de ces fichiers dans un seul processus
fait partager la base du premier à tous les autres (erreurs « UNIQUE constraint failed: user.email », montants
décalés…) ou fait refuser l'import par les gardes HFood. Ce ne sont pas des bugs du produit mais un mode de lancement
non supporté ; chaque fichier passe seul (voir run_tests.sh).

Plutôt que d'afficher des dizaines de faux échecs, on refuse ce mode d'emblée avec un message clair.
Contournement volontaire (à vos risques) : HC_ALLOW_SHARED_PROCESS=1."""
import glob
import os
import re

import pytest

_SETS_DB = re.compile(r"""os\.environ(?:\[|\.setdefault\()\s*["']DATABASE_URL["']""")


def _requested_files(config):
    root = str(config.rootpath)
    files = []
    for arg in config.args or ["tests"]:
        path = arg.split("::")[0]
        path = path if os.path.isabs(path) else os.path.join(root, path)
        if os.path.isdir(path):
            files += glob.glob(os.path.join(path, "**", "test_*.py"), recursive=True)
        elif os.path.isfile(path):
            files.append(path)
    return files


def pytest_configure(config):
    if os.environ.get("HC_ALLOW_SHARED_PROCESS") == "1":
        return
    bound = []
    for f in _requested_files(config):
        try:
            if _SETS_DB.search(open(f, encoding="utf-8").read()):
                bound.append(os.path.basename(f))
        except OSError:
            pass
    if len(bound) > 1:
        pytest.exit(
            f"{len(bound)} fichiers de test fixent chacun leur propre DATABASE_URL : ils doivent tourner dans des "
            "processus séparés. Lancez `bash run_tests.sh` (un processus par fichier) ou un seul fichier à la fois. "
            "(HC_ALLOW_SHARED_PROCESS=1 force le mode partagé, avec de faux échecs attendus.)",
            returncode=4,
        )
