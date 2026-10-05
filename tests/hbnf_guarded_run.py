#!/usr/bin/env python3
import json, pathlib, subprocess, sys, tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
guard=ROOT/"scripts/hbnf_guarded_run.py"
guard_source=guard.read_text()
assert "--capsule" in guard_source
assert "--prelive-proof" in guard_source
assert '"prelive-check"' in guard_source

p=subprocess.run([sys.executable,str(guard),"--require-state","FOUNDATION_QUALIFIED","--",sys.executable,"-c","print('SHOULD_NOT_RUN')"],capture_output=True,text=True)
assert p.returncode!=0
assert "BLOCKED" in (p.stdout+p.stderr)
assert "SHOULD_NOT_RUN" not in p.stdout

p=subprocess.run([sys.executable,str(guard),"--require-state","DIAGNOSTIC_ACTIVE","--",sys.executable,"-c","print('SAFE_READ_ONLY_RUN')"],capture_output=True,text=True)
assert p.returncode==0,(p.stdout,p.stderr)
assert "SAFE_READ_ONLY_RUN" in p.stdout

p=subprocess.run([sys.executable,str(guard),"--require-state","DIAGNOSTIC_ACTIVE","--mutation","--",sys.executable,"-c","print('MUTATION')"],capture_output=True,text=True)
assert p.returncode!=0
assert "live mutation" in (p.stdout+p.stderr)
assert "MUTATION" not in p.stdout

print("PASS: guarded execution blocks wrong-state/unauthorized mutation and requires platform prelive enforcement")
