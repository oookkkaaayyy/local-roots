#!/usr/bin/env python3
"""A stale R4 read during WLED's delayed reboot must not close a confirmed OTA."""
import importlib.util
import pathlib
import tempfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("r6txn",ROOT/"scripts/hbnf_r6_audio_cache_live_transaction.py")
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

def runtime(release):
    return {"matrix_info":{"ip":"192.168.77.10","mac":m.MATRIX_MAC,"ver":"16.0.1","uptime":200},
        "matrix_build":{"release_id":release,"candidate":release},
        "aux_info":{"mac":m.AUX_MAC,"live":True,"lm":"DDP","lip":"192.168.77.10"}}

def main():
    real_read=m.read_runtime; real_mono=m.time.monotonic; real_sleep=m.time.sleep
    try:
        now=[0.0]; sequence=[runtime(m.R4),runtime(m.R4),runtime(m.RELEASE)]
        def mono(): return now[0]
        def sleep(seconds): now[0]+=seconds
        def read(): return sequence.pop(0) if len(sequence)>1 else sequence[0]
        m.time.monotonic=mono; m.time.sleep=sleep; m.read_runtime=read
        with tempfile.TemporaryDirectory() as tmp:
            p=m.LivePort(pathlib.Path(tmp)/"a",pathlib.Path(tmp)/"b",pathlib.Path(tmp)/"c")
            result=p.resolve_runtime({"confirmed":True})
            assert result["installed"] is True and result["runtime"]["matrix_build"]["release_id"]==m.RELEASE
            assert now[0]>=6
        now[0]=0.0
        with tempfile.TemporaryDirectory() as tmp:
            p=m.LivePort(pathlib.Path(tmp)/"a",pathlib.Path(tmp)/"b",pathlib.Path(tmp)/"c")
            m.read_runtime=lambda:runtime(m.R4)
            result=p.resolve_runtime({"confirmed":True})
            assert result["installed"] is False and result["resolution_window_seconds"]==150 and now[0]>=150
    finally:
        m.read_runtime=real_read; m.time.monotonic=real_mono; m.time.sleep=real_sleep
    print("PASS: confirmed upload waits through stale pre-reboot R4 identities, detects delayed R6 readback, and classifies persistent exact R4 only after the bounded 150-second window")

if __name__=="__main__": main()
