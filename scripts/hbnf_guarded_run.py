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
    ap.add_argument("--capsule",help="Validated execution capsule required for mutation")
    ap.add_argument("--prelive-proof",help="Evidence-backed prelive proof required for mutation")
    ap.add_argument("--admission",help="Exact LIVE_APPROVED release admission required for mutation")
    ap.add_argument("command",nargs=argparse.REMAINDER)
    args=ap.parse_args()

    command=list(args.command)
    if command and command[0]=="--":
        command=command[1:]
    if not command:
        raise SystemExit("no command supplied")
    model=load(MODEL); state=load(STATE)
    states=model.get("states",[])
    if args.require_state not in states:
        raise SystemExit("unknown required state")
    if state.get("lifecycle_state")!=args.require_state:
        raise SystemExit(f"BLOCKED: current state is {state.get('lifecycle_state')}, requires {args.require_state}")
    if args.mutation and state.get("live_mutation_authorized") is not True:
        raise SystemExit("BLOCKED: live mutation is not authorized")
    if args.mutation:
        if not args.admission:
            raise SystemExit("BLOCKED: mutation requires --admission")
        control=ROOT/"scripts/hbnf_control.py"
        if not control.is_file():
            raise SystemExit("BLOCKED: release admission validator is missing")
        admission_check=subprocess.run(
            [sys.executable,str(control),"check-admission","--admission",args.admission,"--stage","LIVE_APPROVED"],
            cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT
        )
        if admission_check.returncode!=0:
            sys.stdout.write(admission_check.stdout)
            raise SystemExit("BLOCKED: exact LIVE_APPROVED release admission failed")
        if not args.capsule or not args.prelive_proof:
            raise SystemExit("BLOCKED: mutation requires --capsule and --prelive-proof")
        platform=ROOT/"scripts/platform.py"
        if not platform.is_file():
            raise SystemExit("BLOCKED: platform enforcement script is missing")
        checks=[
            [sys.executable,str(platform),"check-capsule","--capsule",args.capsule],
            [sys.executable,str(platform),"prelive-check","--capsule",args.capsule,"--proof",args.prelive_proof],
        ]
        for check in checks:
            p=subprocess.run(check,cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
            if p.returncode!=0:
                sys.stdout.write(p.stdout)
                raise SystemExit("BLOCKED: deterministic prelive gate failed")
    print(f"CONTROL_PLANE_PASS state={args.require_state} mutation={args.mutation}",flush=True)
    return subprocess.call(command)

if __name__=="__main__":
    raise SystemExit(main())
