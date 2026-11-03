#!/usr/bin/env python3
"""Prepare only exact Oct14 R6 source plus previously reviewed one-file Owner fix.
NO device access, network or secrets; executable under a checked-out repository.
"""
from pathlib import Path
import hashlib
import subprocess

ORIGINAL = "00e6552ffe65a3dbd6768b0e017fd22226c5b86f"
SOURCE = "firmware/phase2/integration-r6-f89-compact-font/usermod"
SOURCE_SHA = "87bdbd9a68425e97cd5b97641768c4e4a16a527c3dfadfca3d0cb4e3ea5c5559"
PATCH_SHA = "9ce39687374ab0895834df750571e2d7f171751d16a8cd02ec20c6654fd5709a"
NEW_SHA = "6d89f623982a9045f7cd7527bd293ab2ea68d3727461b2ad359aeb47dd7001aa"
REVIEW_PATCH = Path("staging/cart116-glow-v35-exact-review/firmware-owner-priority/hbnf-r6-owner-text-priority-v1-review.patch")
DEST = Path("/tmp/cart116-r6-input")
p = REVIEW_PATCH.read_bytes()
assert hashlib.sha256(p).hexdigest() == PATCH_SHA, "Track C patch identity mismatch"
lines = subprocess.check_output(["git","ls-tree","-r","--name-only",ORIGINAL,"--",SOURCE],text=True).splitlines()
assert len(lines)==14, f"Expected exactly original 14 usermod inputs; got {len(lines)}"
for path in lines:
    data = subprocess.check_output(["git","show",f"{ORIGINAL}:{path}"])
    target = DEST/path
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(data)
    assert target.read_bytes() == data
cpp = DEST/SOURCE/"usermod_hbnf_foundation_v1.cpp"
assert hashlib.sha256(cpp.read_bytes()).hexdigest() == SOURCE_SHA
subprocess.run(["patch","--batch","--forward","--fuzz=0","--dry-run","-d",str(DEST),"-p1","-i",str(REVIEW_PATCH.resolve())],check=True)
subprocess.run(["patch","--batch","--forward","--fuzz=0","-d",str(DEST),"-p1","-i",str(REVIEW_PATCH.resolve())],check=True)
assert hashlib.sha256(cpp.read_bytes()).hexdigest() == NEW_SHA, "Patched source differs from specialist review"
for path in lines:
    if not path.endswith("/usermod_hbnf_foundation_v1.cpp"):
        assert (DEST/path).read_bytes()==subprocess.check_output(["git","show",f"{ORIGINAL}:{path}"]),f"Non-target input drift: {path}"
print("PASS pinned original 14 R6 source inputs; exact Track C patch; only C++ candidate changed")
