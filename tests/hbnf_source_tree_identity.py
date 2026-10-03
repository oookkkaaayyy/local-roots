#!/usr/bin/env python3
import importlib.util, pathlib, tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("srcid",ROOT/"scripts/hbnf_source_tree_identity.py")
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

with tempfile.TemporaryDirectory() as td:
    r=pathlib.Path(td)
    (r/"wled00").mkdir()
    (r/"wled00/a.cpp").write_text("alpha\n")
    (r/"platformio.ini").write_text("[env:test]\n")
    (r/".pio").mkdir()
    (r/".pio/generated.bin").write_bytes(b"ignored")
    rows1=m.inventory(r,set())
    h1=m.canonical_tree_hash(rows1)
    assert {x["path"] for x in rows1}=={"platformio.ini","wled00/a.cpp"}

    # Generated output must not affect identity.
    (r/".pio/generated.bin").write_bytes(b"changed")
    rows2=m.inventory(r,set())
    assert m.canonical_tree_hash(rows2)==h1

    # Source change must affect identity.
    (r/"wled00/a.cpp").write_text("beta\n")
    rows3=m.inventory(r,set())
    assert m.canonical_tree_hash(rows3)!=h1

print("PASS: deterministic source-tree identity ignores build outputs and changes on source edits")
