#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")"
echo "HBNF Cart UI V7.3 — Owner Skins PWA R1"
echo "Controller-only update. Stable READY/APPLYING status; noisy live telemetry removed. No Matrix/AUX firmware changes."
/usr/bin/python3 ./install_ui_v6.py
echo
echo "Done. Press Return to close."
read -r
