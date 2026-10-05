#!/usr/bin/env python3
import json, pathlib, shutil, subprocess, sys, tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
guard=ROOT/"scripts/hbnf_guarded_run.py"
guard_source=guard.read_text()
assert "--capsule" in guard_source
assert "--prelive-proof" in guard_source
assert '"prelive-check"' in guard_source

with tempfile.TemporaryDirectory() as td:
    tmp=pathlib.Path(td)
    (tmp/"scripts").mkdir()
    (tmp/"config").mkdir()
    copied_guard=tmp/"scripts/hbnf_guarded_run.py"
    shutil.copy2(guard,copied_guard)
    shutil.copy2(ROOT/"config/HBNF_CONTROL_MODEL.json",tmp/"config/HBNF_CONTROL_MODEL.json")
    state=json.loads((ROOT/"config/HBNF_CONTROL_STATE.json").read_text())
    state["lifecycle_state"]="DIAGNOSTIC_ACTIVE"
    state["live_mutation_authorized"]=False
    (tmp/"config/HBNF_CONTROL_STATE.json").write_text(json.dumps(state))

    def run(*args):
        return subprocess.run([sys.executable,str(copied_guard),*args],capture_output=True,text=True)

    p=run("--require-state","FOUNDATION_QUALIFIED","--",sys.executable,"-c","print('SHOULD_NOT_RUN')")
    assert p.returncode!=0
    assert "BLOCKED" in (p.stdout+p.stderr)
    assert "SHOULD_NOT_RUN" not in p.stdout

    p=run("--require-state","DIAGNOSTIC_ACTIVE","--",sys.executable,"-c","print('SAFE_READ_ONLY_RUN')")
    assert p.returncode==0,(p.stdout,p.stderr)
    assert "SAFE_READ_ONLY_RUN" in p.stdout

    p=run("--require-state","DIAGNOSTIC_ACTIVE","--mutation","--",sys.executable,"-c","print('MUTATION')")
    assert p.returncode!=0
    assert "live mutation" in (p.stdout+p.stderr)
    assert "MUTATION" not in p.stdout

print("PASS: guarded execution blocks wrong-state/unauthorized mutation and requires platform prelive enforcement")
