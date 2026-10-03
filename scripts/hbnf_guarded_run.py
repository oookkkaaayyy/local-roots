#!/usr/bin/env python3
"""Execute an HBNF command only when the deterministic control plane authorizes the required lifecycle state.

This is the enforcement bridge between policy and mutating build/deploy tooling.
"""
from __future__ import annotations

import argparse, json, pathlib, subprocess, sys

ROOT=pathlib.Path(__file__).resolve().parents[1]
MODEL=ROOT/"config/HBNF_CONTROL_MODEL.json"
STATE=ROOT/"config/HBNF_CONTROL_STATE.json"

def load(p): return json.loads(pathlib.Path(p).read_text())

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--require-state",required=True)
    ap.add_argument("--mutation",action="store_true",help="Require live_mutation_authorized=true")
    ap.add_argument("command",nargs=argparse.REMAINDER)
    args=ap.parse_args()

    if not args.command:
        raise SystemExit("no command supplied")
    model=load(MODEL); state=load(STATE)
    states=model.get("states",[])
    if args.require_state not in states:
        raise SystemExit("unknown required state")
    if state.get("lifecycle_state")!=args.require_state:
        raise SystemExit(f"BLOCKED: current state is {state.get('lifecycle_state')}, requires {args.require_state}")
    if args.mutation and state.get("live_mutation_authorized") is not True:
        raise SystemExit("BLOCKED: live mutation is not authorized")
    print(f"CONTROL_PLANE_PASS state={args.require_state} mutation={args.mutation}",flush=True)
    return subprocess.call(args.command)

if __name__=="__main__":
    raise SystemExit(main())
