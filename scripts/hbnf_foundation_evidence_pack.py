#!/usr/bin/env python3
"""Build a deterministic, explicit-file offline Foundation evidence ZIP."""
from __future__ import annotations
import argparse,hashlib,json,os,pathlib,tempfile,zipfile

def package(root,files,archive):
    root=pathlib.Path(root).resolve();archive=pathlib.Path(archive).resolve()
    if not files:raise ValueError("at least one explicit evidence file is required")
    entries=[];seen=set()
    for raw in files:
        rel=pathlib.PurePosixPath(raw)
        if rel.is_absolute() or ".." in rel.parts or not rel.parts:raise ValueError(f"unsafe evidence path: {raw}")
        candidate=root/pathlib.Path(*rel.parts)
        chain=[candidate,*candidate.parents]
        if any(item.is_symlink() for item in chain if item!=root):raise ValueError(f"symlink evidence path: {raw}")
        path=candidate.resolve()
        if root not in path.parents or not path.is_file():raise ValueError(f"missing/unsafe evidence file: {raw}")
        name=rel.as_posix()
        if name in seen:raise ValueError(f"duplicate evidence path: {name}")
        seen.add(name);data=path.read_bytes()
        entries.append((name,data,hashlib.sha256(data).hexdigest()))
    manifest={"schema":"hbnf-foundation-evidence-package-v1","files":[{"path":n,"bytes":len(d),"sha256":h} for n,d,h in sorted(entries)]}
    archive.parent.mkdir(parents=True,exist_ok=True)
    fd,tmp=tempfile.mkstemp(prefix=archive.name+".",suffix=".partial",dir=str(archive.parent));os.close(fd)
    try:
        with zipfile.ZipFile(tmp,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
            payload=[(n,d) for n,d,_ in entries]+[("EVIDENCE_MANIFEST.json",(json.dumps(manifest,indent=2,sort_keys=True)+"\n").encode())]
            for name,data in sorted(payload):
                info=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
                z.writestr(info,data)
        os.replace(tmp,archive)
    except Exception:
        try:os.unlink(tmp)
        except OSError:pass
        raise
    return manifest

def main():
    p=argparse.ArgumentParser();p.add_argument("--root",required=True);p.add_argument("--archive",required=True);p.add_argument("--file",action="append",required=True)
    a=p.parse_args();print(json.dumps(package(a.root,a.file,a.archive),indent=2));return 0
if __name__=="__main__":
    try:raise SystemExit(main())
    except (OSError,ValueError) as e:print(str(e));raise SystemExit(2)
