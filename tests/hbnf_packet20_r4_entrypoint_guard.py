#!/usr/bin/env python3
"""Historical R4 OTA entrypoint is inert before any device request."""
from __future__ import annotations
import importlib.util
import pathlib
import sys
import tempfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
script=ROOT/"scripts/hbnf_packet20_r4_live_transaction.py"
spec=importlib.util.spec_from_file_location("historical_r4_transaction",script)
module=importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)

with tempfile.TemporaryDirectory(prefix="hbnf_retired_r4_entrypoint_") as td:
    tmp=pathlib.Path(td)
    calls=[]
    module.capture=lambda *a,**k:calls.append("capture")
    module.upload_once=lambda *a,**k:calls.append("upload")
    out=tmp/"must-not-be-created"
    original=sys.argv
    sys.argv=[str(script),"--candidate-bin",str(tmp/"candidate.bin"),
              "--candidate-provenance",str(tmp/"provenance.json"),
              "--recovery-manifest",str(tmp/"recovery.json"),
              "--recovery-signature",str(tmp/"signature"),
              "--release-public-key",str(tmp/"key"),
              "--recovery-bin",str(tmp/"recovery.bin"),
              "--adapter",str(tmp/"adapter.json"),
              "--inventory",str(tmp/"inventory.json"),"--outdir",str(out)]
    try:
        result=module.main()
        assert result==2
    finally:
        sys.argv=original
    assert calls==[],f"device functions were reached: {calls}"
    assert not out.exists(),"transaction output was created before the inert-entrypoint guard"

print("PASS: superseded R4 transaction rejects before device reads, upload, or output creation")
