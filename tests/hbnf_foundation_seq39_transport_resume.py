#!/usr/bin/env python3
"""Pure host test for the evidence-triggered, single Opal-origin seq39 fallback."""
import hashlib, importlib.util, pathlib, subprocess, tempfile
import sys
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
spec=importlib.util.spec_from_file_location("seq39_transaction",ROOT/"scripts/hbnf_foundation_seq39_transaction.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

with tempfile.TemporaryDirectory() as td:
    root=pathlib.Path(td);binary=root/"candidate.bin";binary.write_bytes(b"exact candidate fixture")
    old_sha,old_size=m.CANDIDATE_SHA,m.CANDIDATE_SIZE
    m.CANDIDATE_SHA=hashlib.sha256(binary.read_bytes()).hexdigest();m.CANDIDATE_SIZE=binary.stat().st_size
    calls=[subprocess.CompletedProcess([],0,b"OPAL_ARTIFACT_VERIFIED",b""),
           subprocess.CompletedProcess([],0,"HTTP_200 UPDATE_OK\nUpdate successful","")]
    with patch.object(m.subprocess,"run",side_effect=calls) as run:
        receipt=m.candidate_opal_ota_once(binary,root)
    assert receipt["http_200_update_successful"] is True and receipt["attempts"]==1
    assert len(run.call_args_list)==2
    remote_copy=run.call_args_list[0].args[0]
    remote_ota=run.call_args_list[1].args[0]
    assert "sha256sum" in remote_copy[-1] and m.CANDIDATE_SHA in remote_copy[-1]
    assert "192.168.77.10/update" in remote_ota[-1] and "Update successful" in remote_ota[-1]
    assert pathlib.Path(root/"seq39-opal-ota-response.json").is_file()
    m.CANDIDATE_SHA,m.CANDIDATE_SIZE=old_sha,old_size

print("PASS: Opal fallback verifies exact local artifact before one Opal-origin /update and records its receipt; calls are mocked and no network occurs")
