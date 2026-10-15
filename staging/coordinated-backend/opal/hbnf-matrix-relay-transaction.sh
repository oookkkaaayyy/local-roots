#!/bin/ash
# Small transactional guard for the existing Opal writer. No distributed
# atomicity is claimed: a partial WLED apply triggers bounded compensation.
hbnf_restore_pair() {
  _hbnf_lockout="$1"
  _hbnf_lockout_ok=1
  (umask 077; : > "$_hbnf_lockout") 2>/dev/null || _hbnf_lockout_ok=0
  chmod 600 "$_hbnf_lockout" 2>/dev/null || _hbnf_lockout_ok=0

  _hbnf_restore_matrix=0
  _hbnf_restore_aux=0
  _hbnf_verify_matrix=0
  _hbnf_verify_aux=0
  restore_matrix && _hbnf_restore_matrix=1 || :
  restore_aux && _hbnf_restore_aux=1 || :
  verify_matrix_restore && _hbnf_verify_matrix=1 || :
  verify_aux_restore && _hbnf_verify_aux=1 || :

  [ "$_hbnf_lockout_ok" -eq 1 ] && [ "$_hbnf_restore_matrix" -eq 1 ] &&
    [ "$_hbnf_restore_aux" -eq 1 ] && [ "$_hbnf_verify_matrix" -eq 1 ] &&
    [ "$_hbnf_verify_aux" -eq 1 ]
}

hbnf_apply_pair_or_compensate() {
  _hbnf_lockout="$1"
  if matrix_apply && aux_apply; then
    return 0
  fi
  hbnf_restore_pair "$_hbnf_lockout" && return 1
  return 2
}
