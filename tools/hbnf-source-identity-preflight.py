#!/usr/bin/env python3
"""Read-only local evidence collector for accepted HBNF Audio V1.1 source identity."""
from __future__ import annotations
import argparse,hashlib,json,os,pathlib,re,subprocess,sys

EXPECTED_SHA="0aeb668e58cad3bae5b636fdc79573a263c3d0e911903ed48af0bbc2e5681f61"
CANDIDATE="HBNF_AUDIO_EXPRESSION_V1_1_candidate.bin"
OUTPUT_DIR="HBNF_AUDIO_EXPRESSION_V1_1"
KNOWN_V11_ROOT=pathlib.Path.home()/"Documents/Codex/2026-09-30/files-pasted-by-the-user-hbnf"
KNOWN_V11_OUTPUT=KNOWN_V11_ROOT/"outputs/HBNF_AUDIO_EXPRESSION_V1_1"
KNOWN_V1_OUTPUT=KNOWN_V11_ROOT/"outputs/HBNF_AUDIO_EXPRESSION_V1"
KNOWN_ROLLBACK_BIN=pathlib.Path.home()/"Documents/Codex/2026-09-30/this-is-the-highest-priority-next/outputs/HBNF_IPAD_MINI_INTEGRATION/HBNF_iPad_Mini2_iOS12_Candidate.bin"
KNOWN_ROLLBACK_TREE=pathlib.Path.home()/"Documents/Codex/2026-09-30/this-is-the-highest-priority-next/work/hbnf-visual-audio-repair/integration-copy"
KNOWN_ROLLBACK_SOURCE=KNOWN_ROLLBACK_TREE/"usermods/hbnf_foundation_v1"
KNOWN_ROLLBACK_SHA="32802f354cf2edcc1636698e5f15b6bc61311b0bffc7ecf72960221f3478fb55"
KNOWN_BASE_SHA="3a9d02aa6bf7529a589d150834d4b9b916bef6bdc1634b13b4202eee5576dedb"
KNOWN_PIO_ENV="hbnf_matrix_wled16_max"
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

def patch_paths(path):
    if not path.exists(): return []
    out=[]
    for line in path.read_text(errors="replace").splitlines():
        if line.startswith("+++ ") or line.startswith("--- "):
            value=line[4:].strip().split("\t",1)[0]
            if value=="/dev/null": continue
            if value.startswith("a/") or value.startswith("b/"): value=value[2:]
            if value not in out: out.append(value)
    return out

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
    out={
        "expected_sha256":EXPECTED_SHA,
        "roots":[str(x.expanduser()) for x in roots],
        "known_paths":{
            "v11_output":str(KNOWN_V11_OUTPUT),
            "v1_output":str(KNOWN_V1_OUTPUT),
            "rollback_bin":str(KNOWN_ROLLBACK_BIN),
            "rollback_tree":str(KNOWN_ROLLBACK_TREE),
            "rollback_source":str(KNOWN_ROLLBACK_SOURCE),
            "rollback_sha256":KNOWN_ROLLBACK_SHA,
            "foundation_base_sha256":KNOWN_BASE_SHA,
            "platformio_environment":KNOWN_PIO_ENV,
        },
        "artifacts":[]
    }
    exact_candidate=KNOWN_V11_OUTPUT/CANDIDATE
    if exact_candidate.exists():
        artifacts=[exact_candidate]+[x for x in artifacts if x.resolve()!=exact_candidate.resolve()]
    if KNOWN_ROLLBACK_BIN.exists():
        out["known_paths"]["rollback_actual_sha256"]=sha256(KNOWN_ROLLBACK_BIN)
        out["known_paths"]["rollback_hash_match"]=out["known_paths"]["rollback_actual_sha256"]==KNOWN_ROLLBACK_SHA
    if KNOWN_ROLLBACK_SOURCE.exists():
        out["known_paths"]["rollback_source_present"]=True
        out["known_paths"]["rollback_source_git"]=git_info(KNOWN_ROLLBACK_SOURCE)
        out["known_paths"]["hbnf_local_ui_present"]=(KNOWN_ROLLBACK_SOURCE/"hbnf_local_ui.h").exists()
    if (KNOWN_V1_OUTPUT/"source.patch").exists():
        out["known_paths"]["v1_source_patch"]=str(KNOWN_V1_OUTPUT/"source.patch")
        out["known_paths"]["v1_changed_files"]=patch_paths(KNOWN_V1_OUTPUT/"source.patch")
        out["known_paths"]["v1_touched_local_ui"]=any(x.endswith("hbnf_local_ui.h") for x in out["known_paths"]["v1_changed_files"])
    v11_patches=[]
    if KNOWN_V11_OUTPUT.exists():
        for candidate in sorted(KNOWN_V11_OUTPUT.glob("*.patch"))+sorted(KNOWN_V11_OUTPUT.glob("*.diff")):
            v11_patches.append({
                "path":str(candidate),
                "changed_files":patch_paths(candidate),
            })
    out["known_paths"]["v11_patch_candidates"]=v11_patches
    out["known_paths"]["v11_touched_local_ui"]=any(
        any(x.endswith("hbnf_local_ui.h") for x in item["changed_files"]) for item in v11_patches
    )
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
