#!/bin/bash
# Chaque fichier de test crée sa propre base SQLite : on les lance séparément.
cd "$(dirname "$0")" || exit 1
fail=0
for f in tests/test_*.py; do python -m pytest "$f" -q -p no:cacheprovider 2>&1 | tail -1 | sed "s|^|$f: |"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail=1; done
exit $fail
