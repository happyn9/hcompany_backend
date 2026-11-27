#!/bin/bash
# Chaque fichier de test crée sa propre base jetable et fixe DATABASE_URL à l'import : on les lance séparément
# (un processus par fichier, cf. tests/conftest.py). Affiche un résumé exact et sort en erreur si un fichier échoue.
# PYTHON=/chemin/vers/python bash run_tests.sh [motif]   — tests PostgreSQL : voir tests/test_learning_p01_pg.py
cd "$(dirname "$0")" || exit 1
PY="${PYTHON:-python}"
fail=0; files=0; failed_files=()
for f in tests/test_${1:-}*.py; do
  files=$((files+1))
  out=$("$PY" -m pytest "$f" -q -p no:cacheprovider -W ignore 2>&1); code=$?
  echo "$f: $(echo "$out" | tail -1)"
  [ "$code" -eq 0 ] || { fail=1; failed_files+=("$f"); }
done
echo "== $files fichiers, ${#failed_files[@]} en échec ${failed_files[*]}"
exit $fail
