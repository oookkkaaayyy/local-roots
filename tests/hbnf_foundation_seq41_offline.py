#!/usr/bin/env python3
"""Offline authority check; the consumed seq41/42 live attempt must not be replayed."""
from hbnf_foundation_policy_authority import verify_consumed_seq41_policy

verify_consumed_seq41_policy()
print("PASS: seq41/42 historical freeze is preserved and cannot authorize a new transaction")
