#!/usr/bin/env python3
"""Create a deterministic content-addressed identity for an HBNF source tree.

This is a fallback/alternative to Git commit identity when the exact build source
is not reliably Git-backed (for example Files-On-Demand worktree metadata failure).

The manifest intentionally excludes VCS metadata and generated build/cache outputs.
Dependency closure/build environment remain separate golden-capsule evidence.
"""
from __future__ import annotations

import argparse, hashlib, json, os, pathlib, stat, sys

DEFAULT_EXCLUDE_DIRS={
    ".git",".pio",".pioenvs",".piolibdeps","build","dist","node_modules",
    "__pycache__",".pytest_cache",".mypy_cache",".cache",".DS_Store"
}
DEFAULT_EXCLUDE_SUFFIXES={".pyc",".pyo",".o",".a",".elf",".bin",".map"}

def sha256_file(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):
            h.update(chunk)
    return h.hexdigest()

def should_skip(rel,is_dir,extra):
    parts=set(rel.parts)
    if any(p in DEFAULT_EXCLUDE_DIRS or p in extra for p in parts):
        return True
    if not is_dir and rel.suffix.lower() in DEFAULT_EXCLUDE_SUFFIXES:
        return True
    return False

def inventory(root,extra_excludes):
    rows=[]
    root=root.resolve()
    for cur,dirs,files in os.walk(root):
        c=pathlib.Path(cur)
        relc=c.relative_to(root)
        dirs[:]=sorted(d for d in dirs if not should_skip(relc/d,True,extra_excludes))
        for name in sorted(files):
            p=c/name
            rel=p.relative_to(root)
            if should_skip(rel,False,extra_excludes):
                continue
            if p.is_symlink():
                target=os.readlink(p)
                rows.append({"path":rel.as_posix(),"type":"symlink","target":target})
                continue
            if not p.is_file():
                continue
            rows.append({
                "path":rel.as_posix(),
                "type":"file",
                "size":p.stat().st_size,
                "sha256":sha256_file(p),
            })
    return rows

def canonical_tree_hash(rows):
    h=hashlib.sha256()
    for row in rows:
        encoded=json.dumps(row,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode("utf-8")
        h.update(encoded); h.update(b"\n")
    return h.hexdigest()

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("source_root")
    ap.add_argument("--output",required=True)
    ap.add_argument("--exclude",action="append",default=[])
    ap.add_argument("--label")
    args=ap.parse_args()
    root=pathlib.Path(args.source_root).expanduser()
    if not root.is_dir():
        raise SystemExit("source root is not a directory")
    rows=inventory(root,set(args.exclude))
    if not rows:
        raise SystemExit("no source files found after exclusions")
    out={
        "schema":"hbnf-source-tree-manifest-v1",
        "label":args.label,
        "root_name":root.name,
        "file_count":sum(1 for x in rows if x["type"]=="file"),
        "symlink_count":sum(1 for x in rows if x["type"]=="symlink"),
        "source_tree_sha256":canonical_tree_hash(rows),
        "excluded_dirs":sorted(DEFAULT_EXCLUDE_DIRS|set(args.exclude)),
        "excluded_suffixes":sorted(DEFAULT_EXCLUDE_SUFFIXES),
        "files":rows
    }
    pathlib.Path(args.output).write_text(json.dumps(out,indent=2,sort_keys=True)+"\n")
    print(json.dumps({
      "status":"PASS",
      "source_tree_sha256":out["source_tree_sha256"],
      "file_count":out["file_count"],
      "symlink_count":out["symlink_count"],
      "output":str(pathlib.Path(args.output).resolve())
    },indent=2))
    return 0

if __name__=="__main__":
    raise SystemExit(main())
