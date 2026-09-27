#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")"
echo "HBNF Cart UI V6"
echo "Controller-only update. No Matrix/AUX firmware changes."
/usr/bin/python3 ./install_ui_v6.py
echo
echo "Done. Press Return to close."
read -r
