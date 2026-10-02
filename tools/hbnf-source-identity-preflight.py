#!/usr/bin/env python3
"""Read-only local evidence collector for accepted HBNF Audio V1.1 source identity."""
from __future__ import annotations
import argparse,hashlib,json,os,pathlib,re,subprocess,sys

EXPECTED_SHA="0aeb668e58cad3bae5b636fdc79573a263c3d0e911903ed48af0bbc2e5681f61"
CANDIDATE="HBNF_AUDIO_EXPRESSION_V1_1_candidate.bin"
OUTPUT_DIR="HBNF_AUDIO_EXPRESSION_V1_1"
PRUNE={".git","node_modules","Library",".Trash",".cache","Caches","DerivedData"}

def sha256(path:pathlib.Path)->str:
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""): h.update(chunk)
    return h.hexdigest()

def run(cmd,cwd=None):
    try:
        p=subprocess.run(cmd,cwd=cwd,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=8)
        return p.returncode,p.stdout.strip(),p.stderr.strip()
    except Exception as e:
        return 99,"",str(e)

def bounded_find(roots):
    found=[]
    for root in roots:
        root=root.expanduser()
        if not root.exists(): continue
        for cur,dirs,files in os.walk(root):
            rel=pathlib.Path(cur).relative_to(root)
            if len(rel.parts)>8:
                dirs[:]=[]; continue
            dirs[:]=[d for d in dirs if d not in PRUNE and not d.startswith(".")]
            if CANDIDATE in files:
                found.append(pathlib.Path(cur)/CANDIDATE)
                if len(found)>=8: return found
    return found

def nearby_sources(output_dir):
    candidates=[]
    seen=set()
    anchors=[output_dir,output_dir.parent,output_dir.parent.parent]
    for anchor in anchors:
        if not anchor.exists(): continue
        for p in [anchor]+[x for x in anchor.iterdir() if x.is_dir()][:100]:
            rp=p.resolve()
            if rp in seen: continue
            seen.add(rp)
            flags=[]
            if (p/".git").exists(): flags.append("git")
            if (p/"platformio.ini").exists(): flags.append("platformio")
            if (p/"wled00").exists(): flags.append("wled00")
            if (p/"usermods").exists(): flags.append("usermods")
            if flags: candidates.append((p,flags))
    return candidates

def git_info(path):
    code,top,_=run(["git","rev-parse","--show-toplevel"],cwd=path)
    if code: return None
    top=pathlib.Path(top)
    _,branch,_=run(["git","branch","--show-current"],cwd=top)
    _,sha,_=run(["git","rev-parse","HEAD"],cwd=top)
    _,status,_=run(["git","status","--porcelain"],cwd=top)
    _,remote,_=run(["git","remote","get-url","origin"],cwd=top)
    return {"root":str(top),"branch":branch,"commit":sha,"dirty":bool(status),"remote":remote or None}

def report_clues(path):
    if not path.exists(): return []
    clues=[]
    pat=re.compile(r"(source|platformio|environment|env:|commit|branch|repo|usermod|build|path)",re.I)
    for line in path.read_text(errors="replace").splitlines():
        if pat.search(line):
            line=line.strip()
            if line and line not in clues: clues.append(line[:500])
        if len(clues)>=80: break
    return clues

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("roots",nargs="*",type=pathlib.Path)
    args=ap.parse_args()
    roots=args.roots or [
        pathlib.Path.home()/"Documents/Codex",
        pathlib.Path.home()/"Desktop/01 ACTIVE PROJECTS",
        pathlib.Path.home()/"Desktop",
        pathlib.Path.home()/"Downloads",
    ]
    artifacts=bounded_find(roots)
    out={"expected_sha256":EXPECTED_SHA,"roots":[str(x.expanduser()) for x in roots],"artifacts":[]}
    for artifact in artifacts:
        od=artifact.parent
        actual=sha256(artifact)
        entry={
            "candidate":str(artifact),
            "sha256":actual,
            "accepted_hash_match":actual==EXPECTED_SHA,
            "report":str(od/"REPORT.md") if (od/"REPORT.md").exists() else None,
            "sha_manifest":str(od/"SHA256SUMS") if (od/"SHA256SUMS").exists() else None,
            "report_clues":report_clues(od/"REPORT.md"),
            "nearby_sources":[]
        }
        for p,flags in nearby_sources(od):
            entry["nearby_sources"].append({"path":str(p),"markers":flags,"git":git_info(p)})
        out["artifacts"].append(entry)
    out["accepted_artifact_found"]=any(x["accepted_hash_match"] for x in out["artifacts"])
    print(json.dumps(out,indent=2))
    return 0 if out["accepted_artifact_found"] else 2

if __name__=="__main__":
    sys.exit(main())
