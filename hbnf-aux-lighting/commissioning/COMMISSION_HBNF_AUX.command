#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
clear
printf '%s\n' 'HB NIGHT FLYERS — AUX / SP803E COMMISSIONING PREFLIGHT'
printf '%s\n' 'READ-ONLY: no firmware flash, no LED config changes, no Matrix changes.'
printf '\n'
python3 commission_operator.py --backup --report "$HOME/Desktop/HBNF_AUX_PREFLIGHT_LATEST.json"
rc=$?
printf '\nReport: %s\n' "$HOME/Desktop/HBNF_AUX_PREFLIGHT_LATEST.json"
printf '%s\n' 'If the report says POWER_OR_IDENTIFY_AUX, the remaining blocker is physical: wire/power the SP803E and run this same file again.'
printf '%s\n' 'If it says INSTALL_EXACT_AUX_FIRMWARE or RUN_GUARDED_PREPARE_SYNC, stop there; the guarded mutation phase is intentionally separate.'
exit "$rc"
