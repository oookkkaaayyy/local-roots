#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")"
echo "HBNF Cart UI V7 — Zero Pair"
echo "Controller-only zero-pair update. No Matrix/AUX firmware changes."
/usr/bin/python3 ./install_ui_v6.py
echo
echo "Done. Press Return to close."
read -r
