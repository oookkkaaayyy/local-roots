#!/usr/bin/env python3
"""Create an incomplete AUX release receipt bound to exact build inputs."""
from __future__ import annotations
import argparse, hashlib, json, pathlib, re

def parse_metrics(path: pathlib.Path) -> dict[str,str]:
    out={}
    for line in path.read_text().splitlines():
        if "=" in line:
            k,v=line.split("=",1);out[k.strip()]=v.strip()
    return out

def generate(firmware: pathlib.Path, metrics_path: pathlib.Path, template_path: pathlib.Path, out: pathlib.Path) -> dict:
    m=parse_metrics(metrics_path); tpl=json.loads(template_path.read_text())
    source=m.get("github_sha",""); fwsha=hashlib.sha256(firmware.read_bytes()).hexdigest()
    if not re.fullmatch(r"[0-9a-f]{40}",source): raise ValueError("metrics do not identify an exact source commit")
    if m.get("firmware_sha256")!=fwsha or int(m.get("firmware_bytes","-1"))!=firmware.stat().st_size:
        raise ValueError("firmware bytes do not match final metrics")
    pinned={k[6:].lower():v for k,v in m.items() if k.startswith("input_") and v}
    toolchain={k[10:].lower():v for k,v in m.items() if k.startswith("toolchain_") and v}
    required_pins={"wled_commit","source_bundle_sha256","wled_requirements_sha256","aux_patch_sha256"}
    required_tools={"python","platformio","node","pip"}
    if not required_pins.issubset(pinned): raise ValueError("metrics omit pinned firmware inputs: "+", ".join(sorted(required_pins-set(pinned))))
    if not required_tools.issubset(toolchain): raise ValueError("metrics omit build toolchain versions: "+", ".join(sorted(required_tools-set(toolchain))))
    if not all(re.fullmatch(r"[0-9a-f]{64}",pinned[k]) for k in ("source_bundle_sha256","wled_requirements_sha256","aux_patch_sha256")):
        raise ValueError("pinned input hashes must be lowercase SHA-256")
    run_id=m.get("github_run_id","");run_url=m.get("github_run_url","")
    if not run_id or not run_url.startswith("https://") or not m.get("github_ref") or not m.get("workflow_path"):
        raise ValueError("metrics omit workflow run identity")
    if not re.fullmatch(r"[0-9a-f]{40}",pinned["wled_commit"]):
        raise ValueError("pinned WLED source commit is invalid")
    tpl["status"]="INCOMPLETE"
    tpl["source"]={"commit":source}
    tpl["build"]={"workflow_path":m.get("workflow_path", ""),"workflow_ref":m["github_ref"],"run_id":run_id,
        "run_url":run_url,"toolchain":toolchain,"pinned_inputs":pinned}
    tpl["candidate"]={"filename":firmware.name,"size":firmware.stat().st_size,"sha256":fwsha,"path":firmware.name}
    out.write_text(json.dumps(tpl,indent=2,sort_keys=True)+"\n")
    return tpl

def main():
    p=argparse.ArgumentParser();p.add_argument("--firmware",type=pathlib.Path);p.add_argument("--metrics",type=pathlib.Path);p.add_argument("--template",type=pathlib.Path);p.add_argument("--out",type=pathlib.Path);p.add_argument("--selftest",action="store_true");a=p.parse_args()
    if a.selftest:
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            d=pathlib.Path(td);fw=d/"candidate.bin";fw.write_bytes(b"candidate")
            sha=hashlib.sha256(fw.read_bytes()).hexdigest();mt=d/"metrics.txt"
            mt.write_text("github_sha="+"a"*40+"\ngithub_run_id=123\ngithub_run_url=https://github.com/org/repo/actions/runs/123\ngithub_ref=refs/heads/main\nworkflow_path=.github/workflows/build.yml\nfirmware_sha256="+sha+"\nfirmware_bytes="+str(fw.stat().st_size)+"\ntoolchain_python=3.12\ntoolchain_platformio=6.1.17\ntoolchain_node=20\ntoolchain_pip=pip-24\ninput_wled_commit="+"b"*40+"\ninput_source_bundle_sha256="+"c"*64+"\ninput_wled_requirements_sha256="+"d"*64+"\ninput_aux_patch_sha256="+"e"*64+"\n")
            out=d/"receipt.json";tpl=generate(fw,mt,pathlib.Path(__file__).with_name("RELEASE_RECEIPT.template.json"),out)
            assert tpl["status"]=="INCOMPLETE" and tpl["source"]["commit"]=="a"*40 and tpl["candidate"]["sha256"]==sha
            mt.write_text(mt.read_text().replace("github_sha="+"a"*40,"github_sha=not-a-commit"))
            try: generate(fw,mt,pathlib.Path(__file__).with_name("RELEASE_RECEIPT.template.json"),out);raise AssertionError("invalid source accepted")
            except ValueError: pass
        print("HBNF_AUX_RELEASE_RECEIPT_GENERATOR_SELFTEST_PASS");return
    if not a.firmware or not a.metrics or not a.template or not a.out:p.error("--firmware, --metrics, --template, and --out are required")
    result=generate(a.firmware,a.metrics,a.template,a.out)
    print(f"HBNF_AUX_RELEASE_RECEIPT_TEMPLATE_PASS source={result['source']['commit']} firmware={result['candidate']['sha256']} status=INCOMPLETE")
if __name__=="__main__":main()
