#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")"
echo "HBNF Cart 2.0 Owner Control Local V1 — static package"
echo "Deploys Owner/Guest static assets only. No Matrix/AUX firmware changes."
/usr/bin/python3 ./install_ui_v6.py
echo
echo "Done. Press Return to close."
read -r
