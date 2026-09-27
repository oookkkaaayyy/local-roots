#!/bin/bash
set -uo pipefail
cd "$(dirname "$0")"
clear
printf '\nHBNF CART — FINAL PRE-PHASE-2 INSTALL\n=====================================\n'
/usr/bin/python3 ./install_final_prephase2.py
status=$?
printf '\n'
if [ "$status" -eq 0 ]; then
  printf 'Install script finished successfully. Physical acceptance remains required.\n'
else
  printf 'Install script stopped before declaring success. See the message above.\n'
fi
printf 'Press Return to close this window.\n'
read -r _ || true
exit "$status"
