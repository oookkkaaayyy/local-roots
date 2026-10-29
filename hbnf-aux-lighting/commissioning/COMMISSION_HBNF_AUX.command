#!/bin/bash
set -uo pipefail
cd "$(dirname "$0")"
clear
printf '%s\n' 'HB NIGHT FLYERS — AUX / SP803E COMMISSIONING'
printf '%s\n' 'Guarded workflow: verify -> discover -> configuration snapshot -> admitted next step.'
printf '%s\n' 'No mutation occurs without an explicit YES prompt.'
printf '\n'
REPORT="$HOME/Desktop/HBNF_AUX_COMMISSION_LATEST.json"
python3 commission_guard.py --phase interactive --report "$REPORT"
rc=$?
printf '\n'
if [[ $rc -eq 0 ]]; then
  printf '%s\n' 'Commissioning workflow finished its currently-available phases.'
else
  printf 'Commissioning stopped safely with exit code %s.\n' "$rc"
  printf '%s\n' 'No later phase was attempted after the failure.'
fi
printf 'Report: %s\n' "$REPORT"
printf '%s\n' 'Keep this Terminal window open or send the report to ChatGPT if a blocker remains.'
read -r -p 'Press Return to close… ' _
exit "$rc"
