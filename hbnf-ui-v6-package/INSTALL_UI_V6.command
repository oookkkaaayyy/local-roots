#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")"
echo "HBNF Cart UI V7.1 — Zero Pair + Hardware Status"
echo "Controller-only hotfix. Fixes visible newline artifacts and live hardware status. No Matrix/AUX firmware changes."
/usr/bin/python3 ./install_ui_v6.py
echo
echo "Done. Press Return to close."
read -r
