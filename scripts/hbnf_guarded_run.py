#!/usr/bin/env python3
"""Execute an HBNF command only when the deterministic control plane authorizes the required lifecycle state.

This is the enforcement bridge between policy and mutating build/deploy tooling.
"""
from __future__ import annotations

import argparse, json, pathlib, subprocess, sys

ROOT=pathlib.Path(__file__).resolve().parents[1]
MODEL=ROOT/"config/HBNF_CONTROL_MODEL.json"
STATE=ROOT/"config/HBNF_CONTROL_STATE.json"
BACKEND_OPAL_STEPS=("apply_migration","deploy_edge_function","install_writer_stopped","bootstrap_current_state",
    "activate_writer","one_owner_control_test","restore_and_verify","rollback")
OWNER_PWA_STEPS=("install_owner_pwa","rollback_if_required")
OWNER_PWA_RECOVERY_ACTIONS={
    "check":("check-owner-pwa-recovery-admission",False),
    "reserve-install":("reserve-owner-pwa-recovery-install",False),
    "complete-install":("complete-owner-pwa-recovery-install",True),
    "fail-install":("fail-owner-pwa-recovery-install",True),
    "reserve-restore":("reserve-owner-pwa-recovery-restore",False),
    "complete-restore":("complete-owner-pwa-recovery-restore",True),
}

def load(p): return json.loads(pathlib.Path(p).read_text())

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--require-state",required=True)
    ap.add_argument("--mutation",action="store_true",help="Require live_mutation_authorized=true")
    ap.add_argument("--capsule",help="Validated execution capsule required for mutation")
    ap.add_argument("--prelive-proof",help="Evidence-backed prelive proof required for mutation")
    ap.add_argument("--admission",help="Exact release admission required for mutation")
    ap.add_argument("--admission-stage",choices=["LIVE_APPROVED","LIVE_QUALIFICATION"],default="LIVE_APPROVED")
    ap.add_argument("--model",default=str(MODEL))
    ap.add_argument("--state",default=str(STATE))
    ap.add_argument("--backend-opal-admission",help="Exact scoped backend/Opal transaction admission")
    ap.add_argument("--backend-opal-action",choices=["reserve","complete","fail","refresh"],help="Run one named transaction-control action; no arbitrary child command is accepted")
    ap.add_argument("--backend-opal-step",choices=BACKEND_OPAL_STEPS,help="Exact allowlisted backend/Opal transaction step")
    ap.add_argument("--backend-opal-evidence",help="PASS/FAIL step evidence required for completion/failure")
    ap.add_argument("--owner-pwa-admission",help="Exact one-use software-only Owner PWA admission")
    ap.add_argument("--owner-pwa-action",choices=["check","reserve","complete","fail","reserve-rollback","complete-rollback"],help="Fixed Owner PWA transaction action; no arbitrary command is accepted")
    ap.add_argument("--owner-pwa-step",choices=OWNER_PWA_STEPS,help="Exact Owner PWA install or rollback step")
    ap.add_argument("--owner-pwa-evidence",help="Transaction-bound install/failure/rollback receipt")
    ap.add_argument("--owner-pwa-recovery-admission",help="Exact one-use empty-runtime Owner PWA recovery admission")
    ap.add_argument("--owner-pwa-recovery-action",choices=tuple(OWNER_PWA_RECOVERY_ACTIONS),help="Fixed Owner PWA recovery action; no arbitrary command is accepted")
    ap.add_argument("--owner-pwa-recovery-evidence",help="Transaction-bound recovery install/restore result receipt")
    ap.add_argument("command",nargs=argparse.REMAINDER)
    args=ap.parse_args()

    command=list(args.command)
    if command and command[0]=="--":
        command=command[1:]
    backend_mode=any((args.backend_opal_admission,args.backend_opal_action,args.backend_opal_step,args.backend_opal_evidence))
    owner_pwa_mode=any((args.owner_pwa_admission,args.owner_pwa_action,args.owner_pwa_step,args.owner_pwa_evidence))
    owner_pwa_recovery_mode=any((args.owner_pwa_recovery_admission,args.owner_pwa_recovery_action,args.owner_pwa_recovery_evidence))
    if owner_pwa_recovery_mode:
        if backend_mode or owner_pwa_mode or args.mutation or args.capsule or args.prelive_proof or args.admission:
            raise SystemExit("BLOCKED: Owner PWA recovery software-only mode cannot be mixed with another mutation authority")
        if args.require_state!="PHASE2_INTEGRATING": raise SystemExit("BLOCKED: Owner PWA recovery requires PHASE2_INTEGRATING")
        if command: raise SystemExit("BLOCKED: Owner PWA recovery mode accepts only fixed transaction-action IDs, never an arbitrary command")
        if not args.owner_pwa_recovery_admission or not args.owner_pwa_recovery_action:
            raise SystemExit("BLOCKED: Owner PWA recovery action and exact admission are required")
        subcommand,evidence_required=OWNER_PWA_RECOVERY_ACTIONS[args.owner_pwa_recovery_action]
        if evidence_required and not args.owner_pwa_recovery_evidence:
            raise SystemExit("BLOCKED: Owner PWA recovery completion/failure requires a result receipt")
        if not evidence_required and args.owner_pwa_recovery_evidence:
            raise SystemExit("BLOCKED: this Owner PWA recovery action does not accept evidence")
        model=load(args.model); state=load(args.state)
        if state.get("lifecycle_state")!=args.require_state:
            raise SystemExit("BLOCKED: current lifecycle state does not match required state")
        control=ROOT/"scripts/hbnf_control.py"
        if not control.is_file(): raise SystemExit("BLOCKED: recovery admission validator is missing")
        check=[sys.executable,str(control),"--model",args.model,"--state",args.state,subcommand,"--admission",args.owner_pwa_recovery_admission]
        if args.owner_pwa_recovery_evidence: check.extend(["--evidence",args.owner_pwa_recovery_evidence])
        p=subprocess.run(check,cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
        sys.stdout.write(p.stdout)
        if p.returncode: raise SystemExit("BLOCKED: exact Owner PWA recovery admission rejected the action")
        print(f"CONTROL_PLANE_PASS state={args.require_state} owner_pwa_recovery_action={args.owner_pwa_recovery_action}",flush=True)
        return 0
    if owner_pwa_mode:
        if backend_mode or args.mutation or args.capsule or args.prelive_proof or args.admission:
            raise SystemExit("BLOCKED: Owner PWA software-only mode cannot be mixed with backend or firmware authority")
        if args.require_state!="PHASE2_INTEGRATING": raise SystemExit("BLOCKED: Owner PWA install requires PHASE2_INTEGRATING")
        if command: raise SystemExit("BLOCKED: Owner PWA mode accepts only fixed transaction-action IDs, never an arbitrary command")
        if not args.owner_pwa_admission or not args.owner_pwa_action: raise SystemExit("BLOCKED: Owner PWA action and exact admission are required")
        action=args.owner_pwa_action; step=args.owner_pwa_step; evidence=args.owner_pwa_evidence
        fixed={"check":(None,None),"reserve":("install_owner_pwa","reserve-owner-pwa-install"),"complete":("install_owner_pwa","complete-owner-pwa-install"),
            "fail":("install_owner_pwa","fail-owner-pwa-install"),"reserve-rollback":("rollback_if_required","reserve-owner-pwa-rollback"),
            "complete-rollback":("rollback_if_required","complete-owner-pwa-rollback")}
        expected,subcommand=fixed[action]
        if step!=expected: raise SystemExit("BLOCKED: Owner PWA step does not match the fixed action")
        if action in ("complete","fail","complete-rollback") and not evidence: raise SystemExit("BLOCKED: Owner PWA completion/recovery requires a result receipt")
        if action not in ("complete","fail","complete-rollback") and evidence: raise SystemExit("BLOCKED: this Owner PWA action does not accept evidence")
        model=load(args.model); state=load(args.state)
        if state.get("lifecycle_state")!=args.require_state: raise SystemExit("BLOCKED: current lifecycle state does not match required state")
        control=ROOT/"scripts/hbnf_control.py"
        if not control.is_file(): raise SystemExit("BLOCKED: release admission validator is missing")
        if action=="check": check=[sys.executable,str(control),"--model",args.model,"--state",args.state,"check-owner-pwa-admission","--admission",args.owner_pwa_admission]
        else:
            check=[sys.executable,str(control),"--model",args.model,"--state",args.state,subcommand,"--admission",args.owner_pwa_admission]
            if evidence: check.extend(["--evidence",evidence])
        p=subprocess.run(check,cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
        sys.stdout.write(p.stdout)
        if p.returncode: raise SystemExit("BLOCKED: exact Owner PWA software admission rejected the action")
        print(f"CONTROL_PLANE_PASS state={args.require_state} owner_pwa_action={action} step={step or 'admission'}",flush=True)
        return 0
    if backend_mode:
        if args.mutation or args.capsule or args.prelive_proof or args.admission:
            raise SystemExit("BLOCKED: scoped backend/Opal mode cannot be mixed with firmware mutation authority")
        if args.require_state!="PHASE2_INTEGRATING":
            raise SystemExit("BLOCKED: backend/Opal transaction is permitted only within PHASE2_INTEGRATING")
        if command:
            raise SystemExit("BLOCKED: backend/Opal admission accepts only fixed transaction-action IDs, never an arbitrary command")
        if not args.backend_opal_admission or not args.backend_opal_action or not args.backend_opal_step:
            raise SystemExit("BLOCKED: backend/Opal action, exact step, and admission are all required")
        if args.backend_opal_action in ("complete","fail","refresh") and not args.backend_opal_evidence:
            raise SystemExit("BLOCKED: completion/failure/preflight refresh requires evidence")
        if args.backend_opal_action=="reserve" and args.backend_opal_evidence:
            raise SystemExit("BLOCKED: reserve action cannot carry evidence")
        model=load(args.model); state=load(args.state)
        if state.get("lifecycle_state")!=args.require_state:
            raise SystemExit(f"BLOCKED: current state is {state.get('lifecycle_state')}, requires {args.require_state}")
        control=ROOT/"scripts/hbnf_control.py"
        if not control.is_file(): raise SystemExit("BLOCKED: release admission validator is missing")
        if args.backend_opal_action=="refresh":
            check=[sys.executable,str(control),"--model",args.model,"--state",args.state,"refresh-backend-opal-preflight",
                "--admission",args.backend_opal_admission,"--evidence",args.backend_opal_evidence,"--next-step",args.backend_opal_step]
        else:
            action_map={"reserve":"reserve-backend-opal-step","complete":"complete-backend-opal-step","fail":"fail-backend-opal-step"}
            check=[sys.executable,str(control),"--model",args.model,"--state",args.state,action_map[args.backend_opal_action],
                "--admission",args.backend_opal_admission,"--step",args.backend_opal_step]
            if args.backend_opal_evidence: check.extend(["--evidence",args.backend_opal_evidence])
        p=subprocess.run(check,cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
        sys.stdout.write(p.stdout)
        if p.returncode: raise SystemExit("BLOCKED: scoped backend/Opal transaction gate rejected the action")
        print(f"CONTROL_PLANE_PASS state={args.require_state} backend_opal_action={args.backend_opal_action} step={args.backend_opal_step}",flush=True)
        return 0
    if not command:
        raise SystemExit("no command supplied")
    model=load(args.model); state=load(args.state)
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
        command_is_python=bool(command and (pathlib.Path(command[0]).name in ("python","python3") or pathlib.Path(command[0]).resolve()==pathlib.Path(sys.executable).resolve()))
        target=command[1] if command_is_python and len(command)>1 else (command[0] if command else "")
        if args.admission_stage=="LIVE_QUALIFICATION":
            recovery_only=("--recover-r4-only" in command and "--recovery-proof" in command and "--outdir" in command)
            qualification_only=("--resume-qualification" in command and not recovery_only)
            if not command or pathlib.Path(target).resolve()!=(ROOT/"scripts/hbnf_r6_audio_cache_live_transaction.py").resolve() or not (qualification_only or recovery_only):
                raise SystemExit("BLOCKED: LIVE_QUALIFICATION may launch only the exact R6 continuation or one proof-bound R4 recovery")
        if ("--provisional-smoke-only" in command
            and (not command or pathlib.Path(target).resolve()!=(ROOT/"scripts/hbnf_r6_audio_cache_live_transaction.py").resolve()
                or command.count("--provisional-smoke-only")!=1
                or any(flag in command for flag in ("--resume-qualification","--recover-r4-only","--restore-provisional-settings-only","--dry-run","--readonly-preflight-only","--readonly-recovery-preflight-only"))
                or not all(flag in command for flag in ("--admission","--capsule","--prelive-proof","--outdir")))):
            raise SystemExit("BLOCKED: provisional smoke mutation must use the exact smoke-only transaction mode and all evidence bindings")
        control=ROOT/"scripts/hbnf_control.py"
        if not control.is_file():
            raise SystemExit("BLOCKED: release admission validator is missing")
        admission_check=subprocess.run(
            [sys.executable,str(control),"--model",args.model,"--state",args.state,"check-admission","--admission",args.admission,"--stage",args.admission_stage],
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
