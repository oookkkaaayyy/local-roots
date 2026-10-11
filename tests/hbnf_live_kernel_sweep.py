#!/usr/bin/env python3
import importlib.util, json, pathlib, tempfile, types, unittest.mock, subprocess, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("runner",ROOT/"scripts/hbnf_live_kernel_sweep.py")
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

adapter={
 "schema":"hbnf-live-sweep-adapter-v1",
 "snapshot_argv":["python3","x.py","snapshot"],
 "select_argv":["python3","x.py","select","{effect_id}"],
 "telemetry_argv":["python3","x.py","telemetry"],
 "restore_argv":["python3","x.py","restore","{snapshot_file}"],
 "verify_restore_argv":["python3","x.py","verify-restore","{snapshot_file}"],
 "telemetry_mode_argv":["python3","x.py","telemetry-mode","{enabled}"],
 "settle_seconds":1,"sample_seconds":2,"sample_interval_seconds":1,
 "expected_release_id":"r7"
}
m.validate_adapter(adapter)
# Reusing a nonempty run directory must be rejected before preflight/device I/O;
# fresh empty directories remain valid. This protects old failure and soak logs.
with tempfile.TemporaryDirectory() as td:
    root=pathlib.Path(td); occupied=root/"prior-run"; occupied.mkdir()
    sentinel=occupied/"FOUNDATION_SOAK.jsonl"; sentinel.write_text("preserve-this-evidence\n")
    try:m.prepare_output_dir(occupied);raise AssertionError("nonempty evidence directory accepted")
    except RuntimeError as e:assert "refusing to overwrite evidence" in str(e)
    assert sentinel.read_text()=="preserve-this-evidence\n"
    fresh=m.prepare_output_dir(root/"fresh-run")
    assert fresh.is_dir() and not any(fresh.iterdir())
    try:
        m.run_foundation_soak(adapter,{"entries":[]},occupied,5,
                              "r7",0,0,5400,8,{})
        raise AssertionError("existing soak evidence accepted for replacement")
    except RuntimeError as e:assert "refusing to replace it" in str(e)
    assert sentinel.read_text()=="preserve-this-evidence\n"

with tempfile.TemporaryDirectory() as td:
    occupied=pathlib.Path(td)/"occupied";occupied.mkdir();sentinel=occupied/"keep.txt";sentinel.write_text("keep\n")
    original_argv=sys.argv
    original_run_json=m.run_json
    try:
        sys.argv=["hbnf_live_kernel_sweep.py","--adapter",str(ROOT/"config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_20261005.json"),
          "--inventory",str(ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json"),"--outdir",str(occupied),"--contract","foundation","--dry-run"]
        m.run_json=lambda *a,**k:(_ for _ in ()).throw(AssertionError("device/preflight call occurred"))
        assert m.main()==2
    finally:
        sys.argv=original_argv;m.run_json=original_run_json
    assert sentinel.read_text()=="keep\n"

# A network failure after the renderer snapshot remains fail-closed. The runner
# must attempt state restoration, persist both errors, and never emit a sweep
# manifest or turn the failed window into a pass.
with tempfile.TemporaryDirectory() as td:
    out=pathlib.Path(td)/"interrupted-run"
    original_argv=sys.argv; original_json=m.run_json; original_ok=m.run_ok; original_sleep=m.time.sleep
    inv_for_test=json.loads((ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json").read_text())
    expected_kernel=inv_for_test["entries"][0]
    fake_sample={"release_id":"hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1","uptime_seconds":10,"fps":40,"frame_ms_p50":20,"frame_ms_p95":25,
      "frame_ms_p99":30,"frame_ms_max":35,"kernel_id":0,"kernel_name":expected_kernel["kernel_name"],
      "variant_id":1,"free_heap_bytes":90000,"minimum_free_heap_bytes":80000,"largest_free_block_bytes":70000,
      "websocket_clients":0,"aux_projection_active":True,"aux_projection_age_ms":5,"aux_render_fps":40,
      "wifi_rssi_dbm":-45,"restart_count":0,"kernel_ms_avg":8,"kernel_ms_p95":10,
      "palette_ms_avg":1,"palette_ms_p95":2,"audio_ms_avg":2,"audio_ms_p95":3,
      "scheduler_ms_avg":1,"scheduler_ms_p95":2,"overlay_ms_avg":0.1,"overlay_ms_p95":0.2,
      "aux_prepare_send_ms_avg":1,"aux_prepare_send_ms_p95":2,"unaccounted_ms_avg":3,"unaccounted_ms_p95":4}
    telemetry_reads={"count":0}; run_calls=[]
    def fake_json(argv,timeout=10):
        if "snapshot" in argv:return {"snapshotId":9,"snapshotHash":123,"foundationTelemetryEnabledBefore":False}
        if "telemetry-mode" in argv:
            enabled=argv[-1]=="true"
            return {"HBNF":{"foundationTelemetry":{"enabled":enabled}}}
        telemetry_reads["count"]+=1
        if telemetry_reads["count"]==1:return fake_sample  # read-only preflight
        raise RuntimeError("synthetic network interruption during first kernel sample")
    def fake_ok(argv,timeout=15):
        run_calls.append(list(argv))
        if "restore" in argv:raise RuntimeError("synthetic network interruption during restore")
        return "selected"
    try:
        sys.argv=["hbnf_live_kernel_sweep.py","--adapter",str(ROOT/"config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_20261005.json"),
          "--inventory",str(ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json"),"--outdir",str(out),"--contract","foundation"]
        m.run_json=fake_json;m.run_ok=fake_ok;m.time.sleep=lambda *_:None
        assert m.main()==2
    finally:
        sys.argv=original_argv;m.run_json=original_json;m.run_ok=original_ok;m.time.sleep=original_sleep
    aborted=json.loads((out/"SWEEP_ABORT.json").read_text())
    assert "synthetic network interruption during first kernel sample" in aborted["run_error"]
    assert "synthetic network interruption during restore" in aborted["restore_error"]
    assert aborted["profiles_completed"]==0 and not (out/"SWEEP_MANIFEST.json").exists()
    assert any("restore" in call for call in run_calls)

# An interrupt during qualification is recorded as failure only after the
# snapshot's finally path restores telemetry and renderer state.
with tempfile.TemporaryDirectory() as td:
    out=pathlib.Path(td)/"cancelled-run"
    original_argv=sys.argv; original_json=m.run_json; original_ok=m.run_ok; original_sleep=m.time.sleep
    inv_for_test=json.loads((ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json").read_text())
    first_kernel=inv_for_test["entries"][0]
    expected_release=json.loads((ROOT/"config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_20261005.json").read_text())["expected_release_id"]
    sample={"release_id":expected_release,"uptime_seconds":100,"fps":40,"frame_ms_p50":20,
      "frame_ms_p95":25,"frame_ms_p99":30,"frame_ms_max":35,"kernel_id":0,
      "kernel_name":first_kernel["kernel_name"],"variant_id":1,"free_heap_bytes":90000,
      "minimum_free_heap_bytes":80000,"largest_free_block_bytes":70000,"websocket_clients":0,
      "aux_projection_active":True,"aux_projection_age_ms":5,"aux_render_fps":40,"wifi_rssi_dbm":-45,
      "restart_count":0,"kernel_ms_avg":8,"kernel_ms_p95":10,"palette_ms_avg":1,"palette_ms_p95":2,
      "audio_ms_avg":2,"audio_ms_p95":3,"scheduler_ms_avg":1,"scheduler_ms_p95":2,
      "overlay_ms_avg":0.1,"overlay_ms_p95":0.2,"aux_prepare_send_ms_avg":1,"aux_prepare_send_ms_p95":2,
      "unaccounted_ms_avg":3,"unaccounted_ms_p95":4}
    snapshot={"snapshotId":91,"snapshotHash":456,"foundationTelemetryEnabledBefore":False}
    restored={"snapshotId":91,"snapshotHash":456,"foundationTelemetryEnabled":False,
      "restoreVerified":True,"packet20Same":True}
    calls=[]; kernel_reads=[0]
    def cancel_json(argv,timeout=10):
        calls.append(("json",list(argv)))
        if "preflight" in argv:return sample
        if "snapshot" in argv:return snapshot
        if "telemetry-mode" in argv:
            return {"HBNF":{"foundationTelemetry":{"enabled":argv[-1]=="true"}}}
        if "verify-restore" in argv:return restored
        if "telemetry" in argv:
            kernel_reads[0]+=1
            if kernel_reads[0]==1:return sample  # bounded read-only preflight
            raise KeyboardInterrupt()
        raise AssertionError(f"unexpected JSON adapter command: {argv}")
    def cancel_ok(argv,timeout=15):
        calls.append(("ok",list(argv)))
        return "restore-complete" if "restore" in argv else "selected"
    try:
        sys.argv=["hbnf_live_kernel_sweep.py","--adapter",str(ROOT/"config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_20261005.json"),
          "--inventory",str(ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json"),"--outdir",str(out),"--contract","foundation"]
        m.run_json=cancel_json;m.run_ok=cancel_ok;m.time.sleep=lambda *_:None
        assert m.main()==2
    finally:
        sys.argv=original_argv;m.run_json=original_json;m.run_ok=original_ok;m.time.sleep=original_sleep
    aborted=json.loads((out/"SWEEP_ABORT.json").read_text())
    assert aborted["run_error"]=="qualification-cancelled-by-interrupt"
    assert aborted["restore_error"] is None
    restored_state=json.loads((out/"POST_RESTORE_STATE.json").read_text())
    assert restored_state["restoreVerified"] is True and restored_state["packet20Same"] is True
    assert kernel_reads[0]==2 and aborted["profiles_completed"]==0
    assert any(kind=="ok" and "restore" in argv for kind,argv in calls)

mode_calls=[]
mode_adapter=dict(adapter,telemetry_mode_argv=["mode","{enabled}"])
original_run_json=m.run_json
try:
    m.run_json=lambda argv,timeout=10:(mode_calls.append(argv[-1]) or {"HBNF":{"foundationTelemetry":{"enabled":argv[-1]=="true"}}})
    assert m.set_foundation_telemetry(mode_adapter,True,12) is True
    assert m.set_foundation_telemetry(mode_adapter,False,12) is False
    assert mode_calls==["true","false"]
    m.run_json=lambda *a,**k:{"HBNF":{"foundationTelemetry":{"enabled":False}}}
    try:m.set_foundation_telemetry(mode_adapter,True,12);raise AssertionError("mode mismatch accepted")
    except RuntimeError as e:assert "readback mismatch" in str(e)
finally:m.run_json=original_run_json
runner_source=(ROOT/"scripts/hbnf_live_kernel_sweep.py").read_text()
assert runner_source.index("set_foundation_telemetry(adapter,True,timeout)") < runner_source.index("for entry in entries:")
assert runner_source.index("set_foundation_telemetry(adapter,telemetry_mode_before,timeout)") < runner_source.index('subst(adapter["restore_argv"]')
try:m.validate_soak_options("foundation",5399,8);raise AssertionError("sub-90-minute soak accepted")
except ValueError as e:assert "at least 5400" in str(e)
try:m.validate_soak_options("diagnostic",5400,8);raise AssertionError("diagnostic soak accepted")
except ValueError as e:assert "requires --contract foundation" in str(e)
m.validate_soak_options("foundation",5400,8)
try:m.validate_soak_options("foundation",5400,15);raise AssertionError("unsafe soak interval accepted")
except ValueError as e:assert "below 15" in str(e)

missing_release=dict(adapter); missing_release["expected_release_id"]=""
try: m.validate_adapter(missing_release); raise AssertionError("empty expected release accepted")
except ValueError: pass

bad=dict(adapter); bad["select_argv"]=["python3","x.py","select"]
try: m.validate_adapter(bad); raise AssertionError("missing effect placeholder accepted")
except ValueError: pass

runtime_index_adapter=dict(adapter)
runtime_index_adapter["select_argv"]=["python3","x.py","select","--kernel","{runtime_kernel_index}"]
m.validate_adapter(runtime_index_adapter)
bad_timeout=dict(adapter);bad_timeout["timeout_seconds"]=0
try:m.validate_adapter(bad_timeout);raise AssertionError("nonpositive timeout accepted")
except ValueError:pass

inv=json.loads((ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json").read_text())
m.validate_inventory(inv)
assert inv["entries"][2]["kernel_name"]=="Parametric_Water"
assert inv["entries"][3]["kernel_name"]=="RGB_Blobs5"

sample={
 "release_id":"r7","uptime_seconds":10,"fps":11.5,"frame_ms_avg":85.3,
 "kernel_id":2,"kernel_name":"Parametric_Water","variant_id":1,
 "kernel_ms_avg":68.9,"palette_ms_avg":0.47,"audio_ms_avg":6.7,
 "overlay_ms_avg":0.04,"aux_prepare_send_ms_avg":4.8,"unaccounted_ms_avg":3.0,
 "free_heap_bytes":98700,"websocket_clients":0,"aux_projection_active":True,
 "aux_render_fps":11.5,"wifi_rssi_dbm":-45,"restart_count":0
}
m.validate_sample(sample,"diagnostic")
m.verify_selected(sample,inv["entries"][2])
release_id,restarts,uptime=m.validate_continuity(sample)
assert release_id=="r7" and restarts==0 and uptime==10
m.validate_continuity(sample,"r7",0,9)
changed_release=dict(sample); changed_release["release_id"]="r8"
try: m.validate_continuity(changed_release,"r7",0,10); raise AssertionError("release change accepted")
except RuntimeError: pass
changed_restart=dict(sample); changed_restart["restart_count"]=1
try: m.validate_continuity(changed_restart,"r7",0,10); raise AssertionError("restart accepted")
except RuntimeError: pass
lower_uptime=dict(sample); lower_uptime["uptime_seconds"]=9
try: m.validate_continuity(lower_uptime,"r7",0,10); raise AssertionError("uptime regression accepted")
except RuntimeError: pass
m.assert_same_snapshot({"snapshotId":42,"snapshotHash":987,"foundationTelemetryEnabledBefore":True},
  {"snapshotId":42,"snapshotHash":987,"foundationTelemetryEnabled":True,"restoreVerified":True,
   "packet20Same":True,"receipt":"post-restore-only-field"})
for before,after in (
  ({"snapshotId":42,"snapshotHash":987,"foundationTelemetryEnabledBefore":True},
   {"snapshotId":43,"snapshotHash":987,"foundationTelemetryEnabled":True,"restoreVerified":True,"packet20Same":True}),
  ({"snapshotId":42,"snapshotHash":987,"foundationTelemetryEnabledBefore":True},
   {"snapshotId":42,"snapshotHash":988,"foundationTelemetryEnabled":True,"restoreVerified":True,"packet20Same":True}),
  ({"snapshotId":42,"snapshotHash":987,"foundationTelemetryEnabledBefore":True},
   {"snapshotId":42,"snapshotHash":987,"foundationTelemetryEnabled":True,"restoreVerified":False,"packet20Same":True}),
  ({"snapshotId":42,"snapshotHash":987,"foundationTelemetryEnabledBefore":True},
   {"snapshotId":42,"snapshotHash":987,"foundationTelemetryEnabled":False,"restoreVerified":True,"packet20Same":True}),
):
    try:m.assert_same_snapshot(before,after);raise AssertionError("invalid restore receipt accepted")
    except RuntimeError: pass

# A host-timeout continuation may reuse only the exact still-open firmware
# snapshot. Ordinary preflight remains closed to active diagnostics.
preflight={"schema":"hbnf-live-qualification-preflight-v1","release_id":"r7","candidate":"r7",
 "wled":"16.0.1","matrix_ip":"192.168.77.10","matrix_mac":"704bca5b345c",
 "matrix_uptime_seconds":100,"uptime_seconds":100,"restart_count":0,"matrix_on":True,
 "matrix_brightness":44,"packet20_enabled":False,"packet20_snapshot_valid":False,
 "packet20_snapshot_id":0,"packet20_snapshot_hash":0,"packet20_restore_verified":False,
 "foundation_telemetry_enabled":False,"aux_ip":"192.168.77.11","aux_mac":"8c94df55c34c",
 "aux_on":True,"aux_live":True,"aux_live_mode":"DDP","aux_live_ip":"192.168.77.10","aux_led_count":22}
m.validate_readonly_preflight(preflight,"r7")
# A changed field baseline (the current Matrix baseline is 52) is a setup
# mismatch, not permission to weaken the frozen 44 comparison condition.
try:m.validate_readonly_preflight(dict(preflight,matrix_brightness=52),"r7");raise AssertionError("non-matched brightness accepted")
except RuntimeError as e:assert "brightness-mismatch" in str(e)
try:m.validate_readonly_preflight(dict(preflight,aux_live=False),"r7");raise AssertionError("offline AUX accepted")
except RuntimeError as e:assert "aux-native-ddp-source-mismatch" in str(e)
resume={"snapshotId":1,"snapshotHash":4051728214,"foundationTelemetryEnabledBefore":False}
active_preflight=dict(preflight,packet20_enabled=True,packet20_snapshot_valid=True,
 packet20_snapshot_id=1,packet20_snapshot_hash=4051728214)
try:m.validate_readonly_preflight(active_preflight,"r7");raise AssertionError("active diagnostic accepted without explicit resume")
except RuntimeError as e:assert "preflight-diagnostics-already-active" in str(e)
m.validate_readonly_preflight(active_preflight,"r7",resume)
for altered in (
 dict(resume,snapshotId=2),dict(resume,snapshotHash=7),
 dict(resume,foundationTelemetryEnabledBefore=True),
):
    try:m.validate_readonly_preflight(active_preflight,"r7",altered);raise AssertionError("mismatched resume snapshot accepted")
    except RuntimeError:pass
for altered_preflight in (
 dict(active_preflight,packet20_snapshot_valid=False),
 dict(active_preflight,packet20_restore_verified=True),
 dict(active_preflight,foundation_telemetry_enabled=True),
 dict(active_preflight,release_id="r8"),
):
    try:m.validate_readonly_preflight(altered_preflight,"r7",resume);raise AssertionError("invalid active snapshot resume accepted")
    except RuntimeError:pass

# The exact frozen relative ratios can be applied to all comparable R4 kernel
# profiles before a long soak begins. Subjective frame-max remains diagnostic
# per the unchanged policy.
with tempfile.TemporaryDirectory() as td:
    base=pathlib.Path(td)/"09_RGB_Blobs4.profile.json"
    candidate=pathlib.Path(td)/"candidate.profile.json"
    r4_release="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1"
    base_doc={"status":"PASS","profile":{"release_id":r4_release,"qualification_eligible":True,
      "kernel":{"name":"RGB_Blobs4","variant_id":9},"fps":{"median":40},
      "frame_ms":{"p95_median":20,"p99_median":30},
      "heap":{"minimum_free_min":60000,"largest_block_start":70000,"largest_block_end":69000}}}
    cand_doc={"status":"PASS","profile":{"release_id":"r7","qualification_eligible":True,
      "kernel":{"name":"RGB_Blobs4","variant_id":9},"fps":{"median":37},
      "frame_ms":{"p95_median":24.9,"p99_median":37.3,"max":1000},
      "heap":{"minimum_free_min":52000,"largest_block_start":57000,"largest_block_end":56000}}}
    base.write_text(json.dumps(base_doc));candidate.write_text(json.dumps(cand_doc))
    frozen={"comparison":{"candidate_vs_baseline":{"fps_median_min_ratio":0.9,
      "frame_p95_max_ratio":1.25,"frame_p99_max_ratio":1.25,
      "minimum_free_heap_min_ratio":0.85,"largest_free_block_min_ratio":0.8}}}
    import hashlib
    baseline_manifest=pathlib.Path(td)/"r4-baseline.json"
    baseline_manifest.write_text(json.dumps({"schema":"hbnf-foundation-28-kernel-baseline-v1",
      "contract":"foundation","release_id":r4_release,"kernel_count":28,
      "kernels":{"9":{"kernel_name":"RGB_Blobs4","profile_sha256":hashlib.sha256(base.read_bytes()).hexdigest()}}}))
    result=m.compare_profile_to_r4(candidate,pathlib.Path(td),inv["entries"][9],frozen,r4_release,baseline_manifest)
    assert result["status"]=="PASS" and all(result["checks"].values())
    assert "frame_max" not in result["checks"]  # unchanged frozen policy treats it as diagnostic
    base.write_text(base.read_text()+" ")
    try:
        m.compare_profile_to_r4(candidate,pathlib.Path(td),inv["entries"][9],frozen,r4_release,baseline_manifest)
        raise AssertionError("modified R4 profile accepted despite source-bound hash")
    except RuntimeError as e:assert "profile-hash-mismatch" in str(e)
    base.write_text(json.dumps(base_doc))
    cand_doc["profile"]["fps"]["median"]=35.9;candidate.write_text(json.dumps(cand_doc))
    failed=m.compare_profile_to_r4(candidate,pathlib.Path(td),inv["entries"][9],frozen,r4_release,baseline_manifest)
    assert failed["status"]=="FAIL" and failed["checks"]["fps_median"] is False

# Preserve the full sweep while checking the historically failing kernel first.
assert "early_indices=(0,13)" in runner_source
assert "(kernel_index in (0,13) or args.compare_all_r4)" in runner_source
ordered=m.order_entries_for_early_baseline(inv["entries"])
assert [e["runtime_kernel_index_expected"] for e in ordered[:2]]==[0,13]
assert sorted(e["runtime_kernel_index_expected"] for e in ordered)==list(range(28))
try:m.order_entries_for_early_baseline(inv["entries"][:-1]);raise AssertionError("missing sweep entry was accepted")
except ValueError:pass

# The committed 28-kernel R4 profile set is integrity-checked before any live
# sweep; a single altered profile must fail closed.
r4_baseline=ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/live/PRE_SOAK_BASELINE.json"
r4_profiles=ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/live/foundation-sweep"
r4_release="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1"
m.validate_r4_profile_set(r4_profiles,r4_baseline,inv,r4_release)
with tempfile.TemporaryDirectory() as td:
    import shutil
    copied=pathlib.Path(td)
    for profile in r4_profiles.glob("*.profile.json"):
        shutil.copy2(profile,copied/profile.name)
    damaged=copied/"00_Complex_Kaleido_3.profile.json"
    damaged.write_text(damaged.read_text()+" ")
    try:m.validate_r4_profile_set(copied,r4_baseline,inv,r4_release);raise AssertionError("tampered R4 baseline profile accepted")
    except RuntimeError as e:assert "profile-hash-mismatch" in str(e)

foundation=dict(sample)
foundation.update({
 "frame_ms_p50":80,"frame_ms_p95":90,"frame_ms_p99":100,"frame_ms_max":120,
 "minimum_free_heap_bytes":97000,"largest_free_block_bytes":70000,
 "aux_projection_age_ms":10,
 "kernel_ms_p95":75,"palette_ms_p95":1,"audio_ms_p95":8,"scheduler_ms_avg":1,"scheduler_ms_p95":2,
 "overlay_ms_p95":0.1,"aux_prepare_send_ms_p95":6,"unaccounted_ms_p95":4
})
m.validate_sample(foundation,"foundation")
for frame_max, should_stop in ((999.999,False),(1000.0,True),(12559.93,True)):
    bounded=dict(foundation);bounded["frame_ms_max"]=frame_max
    try:
        m.enforce_foundation_frame_interval(bounded)
        assert not should_stop, f"{frame_max}ms hard-stop threshold was missed"
    except RuntimeError as e:
        assert should_stop and "foundation-steady-state-frame-interval-stop" in str(e)
foundation["sample_time"]=100.0
uptime,stamp=m.validate_soak_sample(foundation,inv["entries"][2],"r7",0,10,None)
assert uptime==10 and stamp==100.0
next_soak=dict(foundation);next_soak.update(sample_time=110.0,uptime_seconds=11)
assert m.validate_soak_sample(next_soak,inv["entries"][2],"r7",0,10,100.0)==(11.0,110.0)
for bad_gap in (100.0,116.0):
    bad_soak=dict(foundation);bad_soak["sample_time"]=bad_gap
    try:m.validate_soak_sample(bad_soak,inv["entries"][2],"r7",0,10,100.0);raise AssertionError("invalid soak gap accepted")
    except RuntimeError as e:assert "sample gap invalid" in str(e)
wrong_soak=dict(foundation);wrong_soak["kernel_id"]=3;wrong_soak["kernel_name"]="RGB_Blobs5"
try:m.validate_soak_sample(wrong_soak,inv["entries"][2],"r7",0,10,None);raise AssertionError("wrong soak kernel accepted")
except RuntimeError:pass
with tempfile.TemporaryDirectory() as td:
    p=pathlib.Path(td)/"soak.jsonl"
    m.append_jsonl_durable(p,foundation);m.append_jsonl_durable(p,next_soak)
    assert len(p.read_text().splitlines())==2
    assert json.loads(p.read_text().splitlines()[0])["sample_time"]==100.0

# The audited soak window is measured between persisted sample timestamps, not
# from the pre-sample transaction start. The first sample arrives after one
# cadence interval, so the runner must keep collecting through duration+one
# interval. Use a virtual clock and fake adapter; this performs no device I/O.
class VirtualClock:
    def __init__(self):self.now=0.0
    def monotonic(self):return self.now
    def sleep(self,seconds):self.now+=seconds

with tempfile.TemporaryDirectory(prefix="hbnf-soak-window-coverage-") as td:
    clock=VirtualClock();selected={"kernel":0};uptime={"value":100}
    original=(m.run_ok,m.run_json,m.time)
    def fake_select(argv,timeout=15):
        selected["kernel"]=int(argv[-1]);return "selected\n"
    def fake_telemetry(argv,timeout=10):
        entry=inv["entries"][selected["kernel"]]
        uptime["value"]+=1
        row=dict(foundation)
        row.update(release_id="r7",kernel_id=selected["kernel"],
            kernel_name=entry["kernel_name"],variant_id=selected["kernel"]+1000,
            uptime_seconds=uptime["value"],restart_count=0)
        return row
    try:
        m.run_ok=fake_select;m.run_json=fake_telemetry;m.time=clock
        out=pathlib.Path(td)
        result=m.run_foundation_soak(
            {"select_argv":["fake","select","{runtime_kernel_index}"],
             "telemetry_argv":["fake","telemetry"]},
            inv,out,10,"r7",0,100,5400,8,
            {"catastrophic_early_stop":{"fps_floor_absolute":1,
             "frame_ms_p99_ceiling_absolute":1000,
             "aux_projection_active_required":True,"consecutive_samples":3}})
        rows=[json.loads(line) for line in (out/"FOUNDATION_SOAK.jsonl").read_text().splitlines()]
        sample_span=rows[-1]["sample_time"]-rows[0]["sample_time"]
        assert result["duration_seconds"]>=5400
        assert sample_span>=5400,(len(rows),sample_span)
        assert len({row["kernel_id"] for row in rows})==28
    finally:m.run_ok,m.run_json,m.time=original

foundation_adapter=json.loads((ROOT/"config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_20261005.json").read_text())
m.validate_adapter(foundation_adapter)
assert foundation_adapter["expected_release_id"]=="hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1"
assert "{runtime_kernel_index}" in " ".join(foundation_adapter["select_argv"])
assert pathlib.Path(foundation_adapter["telemetry_argv"][foundation_adapter["telemetry_argv"].index("--inventory")+1]).is_absolute()
assert foundation_adapter["timeout_seconds"]==240
assert "--inventory" in foundation_adapter["snapshot_argv"]
snapshot_worst_case=(
    2*25                         # /json/state POSTs for begin + snapshot
    + 2*(30+10)                  # ack windows, including one bounded GET overrun each
    + 4*10                       # identity x2, initial state, state after begin
    + 45+10                      # snapshot-ready window plus bounded GET overrun
    + 1                          # begin settle
)
restore_worst_case=(
    10                           # initial packet20 state read
    + 25+30+10                  # restore POST, ack, bounded GET overrun
    + 90+10                     # restore verification window + bounded GET overrun
)
assert snapshot_worst_case==226 and foundation_adapter["timeout_seconds"]>=snapshot_worst_case+14
assert restore_worst_case==175 and foundation_adapter["timeout_seconds"]>=restore_worst_case

# The compositor-hoist candidate uses the same maintained Foundation adapter,
# bound command-by-command to its exact release ID and binary SHA. Its runner
# configuration is exercised only in dry-run mode: no adapter/device command.
successor_id="hbnf-cart2-phase2-offline-wow-r6-compositor-hoist-20261011"
successor_sha="bbf9d12f703e37ed47e1705802436b835bb54c966d540291375001d4a93dc5c2"
successor_adapter_path=ROOT/"config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_COMPOSITOR_HOIST_20261011.json"
successor_adapter=json.loads(successor_adapter_path.read_text())
m.validate_adapter(successor_adapter,"foundation")
assert successor_adapter["expected_release_id"]==successor_id
for command in ("snapshot_argv","select_argv","telemetry_argv","restore_argv",
                "verify_restore_argv","telemetry_mode_argv","preflight_argv"):
    argv=successor_adapter[command]
    assert "HBNF_EXPECTED_RELEASE_ID="+successor_id in argv, command
    assert "HBNF_EXPECTED_FIRMWARE_SHA256="+successor_sha in argv, command
assert successor_adapter["timeout_seconds"]==foundation_adapter["timeout_seconds"]
with tempfile.TemporaryDirectory(prefix="cart2-successor-sweep-config-") as td:
    dry=subprocess.run([sys.executable,str(ROOT/"scripts/hbnf_live_kernel_sweep.py"),
        "--adapter",str(successor_adapter_path),"--inventory",
        str(ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json"),
        "--outdir",str(pathlib.Path(td)/"dry-run"),"--contract","foundation",
        "--qualify","--soak-seconds","5400","--dry-run"],
        text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    assert dry.returncode==0,dry.stdout+dry.stderr
    dry_result=json.loads(dry.stdout)
    assert dry_result["status"]=="DRY_RUN_PASS"
    assert dry_result["expected_release_id"]==successor_id
    assert dry_result["kernel_count"]==28

r7_adapter=json.loads((ROOT/"config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_R7_20261009.json").read_text())
m.validate_adapter(r7_adapter,"foundation")
assert r7_adapter["expected_release_id"]=="hbnf-cart2-phase2-offline-wow-r7-20261009"
assert all("HBNF_EXPECTED_RELEASE_ID=hbnf-cart2-phase2-offline-wow-r7-20261009" in " ".join(r7_adapter[k])
           for k in ("snapshot_argv","select_argv","telemetry_argv","restore_argv","verify_restore_argv","telemetry_mode_argv","preflight_argv"))
missing_mode=dict(r7_adapter);missing_mode.pop("telemetry_mode_argv")
try:m.validate_adapter(missing_mode,"foundation");raise AssertionError("Foundation adapter without telemetry-mode control accepted")
except ValueError as e:assert "telemetry_mode_argv" in str(e)
with tempfile.TemporaryDirectory() as td:
    dry=subprocess.run([sys.executable,str(ROOT/"scripts/hbnf_live_kernel_sweep.py"),
       "--adapter",str(ROOT/"config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_R7_20261009.json"),
       "--inventory",str(ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json"),
       "--outdir",str(pathlib.Path(td)/"r7-dry"),"--contract","foundation","--dry-run"],
       text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=20)
    assert dry.returncode==0 and json.loads(dry.stdout)["status"]=="DRY_RUN_PASS",(dry.stdout,dry.stderr)

# Resume arguments are validated offline and bind both the snapshot and
# observer proof to the exact expected R7 release before any adapter/device call.
with tempfile.TemporaryDirectory() as td:
    td=pathlib.Path(td)
    snap=td/"snapshot.json"; observer=td/"observer.json"
    snap.write_text(json.dumps({"snapshotId":1,"snapshotHash":4051728214,
      "foundationTelemetryEnabledBefore":False}))
    proof={"status":"PASS","candidate_release":"hbnf-cart2-phase2-offline-wow-r7-20261009",
      "observer_effect":{"candidate_release":"hbnf-cart2-phase2-offline-wow-r7-20261009",
        "status":"MEASURED_ON_CURRENT_ARTIFACT"}}
    observer.write_text(json.dumps(proof))
    cmd=[sys.executable,str(ROOT/"scripts/hbnf_live_kernel_sweep.py"),
      "--adapter",str(ROOT/"config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_R7_20261009.json"),
      "--inventory",str(ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json"),
      "--outdir",str(td/"r7-resume"),"--contract","foundation","--dry-run",
      "--resume-snapshot-file",str(snap),"--resume-observer-proof",str(observer)]
    resumed=subprocess.run(cmd,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=20)
    assert resumed.returncode==0 and json.loads(resumed.stdout)["status"]=="DRY_RUN_PASS",(resumed.stdout,resumed.stderr)
    proof["candidate_release"]="r8";observer.write_text(json.dumps(proof))
    rejected=subprocess.run(cmd,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=20)
    assert rejected.returncode!=0 and "not a PASS for the exact expected release" in rejected.stderr

# A live run requesting soak but omitting a frozen policy must stop before any
# adapter/device preflight. This invocation only exercises the host-side guard.
with tempfile.TemporaryDirectory() as td:
    blocked=subprocess.run([sys.executable,str(ROOT/"scripts/hbnf_live_kernel_sweep.py"),
      "--adapter",str(ROOT/"config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_20261005.json"),
      "--inventory",str(ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json"),
      "--outdir",str(pathlib.Path(td)/"run"),"--contract","foundation","--soak-seconds","5400"],
      text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    assert blocked.returncode!=0 and "refuses before device preflight" in blocked.stderr

# With the explicit complete-diagnostics option, a saturated kernel and a
# frozen performance-comparison failure do not consume the remaining 28-kernel
# evidence opportunity. The exact snapshot is restored, but no soak or
# qualification manifest is emitted.
with tempfile.TemporaryDirectory() as td:
    out=pathlib.Path(td)/"complete-diagnostics"
    original_argv=sys.argv
    original=(m.run_json,m.run_ok,m.collect_kernel,m.compare_profile_to_r4,m.run_combined_feature_check,
              m.require_disk_headroom,m.set_foundation_telemetry,m.validate_readonly_preflight,
              m.validate_sample,m.validate_continuity,m.persist_restore_evidence)
    calls=[];uptime=[100]
    snapshot={"snapshotId":77,"snapshotHash":888,"foundationTelemetryEnabledBefore":False}
    restored={"snapshotId":77,"snapshotHash":888,"foundationTelemetryEnabled":False,
              "restoreVerified":True,"packet20Same":True}
    def fake_runner_json(argv,timeout=10,env_overrides=None):
        words=" ".join(map(str,argv))
        if "validate-policy-only" in words:return {"status":"PASS"}
        if "preflight" in words:return {"schema":"hbnf-live-qualification-preflight-v1"}
        if "telemetry" in words:return {"release_id":"r7","uptime_seconds":100,"restart_count":0}
        if "snapshot" in words:return snapshot
        if "verify-restore" in words:return restored
        if "telemetry-mode" in words:return {"HBNF":{"foundationTelemetry":{"enabled":argv[-1]=="true"}}}
        raise AssertionError("unexpected subprocess in isolated sweep test: "+words)
    def fake_collect(_adapter,entry,_outdir,_timeout,_contract,*_args,**_kwargs):
        index=int(entry["runtime_kernel_index_expected"]);calls.append(index);uptime[0]+=1
        if index==0:
            sidecar=pathlib.Path(_outdir)/f"{index:02d}_{entry['kernel_name']}.diagnostic-only.json"
            sidecar.write_text(json.dumps({"status":"SATURATED_TELEMETRY_DIAGNOSTIC_ONLY","qualification_eligible":False}))
            return None,"r7",1,0,uptime[0]
        profile=pathlib.Path(_outdir)/f"{index:02d}_{entry['kernel_name']}.profile.json"
        profile.write_text("{}")
        return profile,"r7",1,0,uptime[0]
    def fake_compare(profile,*args,**kwargs):
        index=int(pathlib.Path(profile).name[:2])
        return {"status":"FAIL" if index==13 else "PASS","checks":{"fps_median":index!=13}}
    try:
        sys.argv=["hbnf_live_kernel_sweep.py","--adapter",str(ROOT/"config/HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER_20261005.json"),
          "--inventory",str(ROOT/"config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json"),"--outdir",str(out),
          "--contract","foundation","--soak-seconds","5400","--threshold-policy",
          str(ROOT/"config/HBNF_FOUNDATION_QUALIFICATION_POLICY_20261006_SUSTAINED_R1.json"),
          "--combined-check-script",str(ROOT/"scripts/hbnf_r6_combined_feature_check.py"),
          "--early-r4-profile-dir",str(ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/live/foundation-sweep"),
          "--early-r4-baseline-manifest",str(ROOT/"evidence/hbnf-foundation-qualification-20261005/seq39/live/PRE_SOAK_BASELINE.json"),
          "--early-r4-release","hbnf-matrix-packet20-fastled-fp-backport-v1-20261005-r4-foundation-metrics-r1-tail250-r1",
          "--compare-all-r4","--complete-diagnostics-on-performance-gate-failure"]
        m.run_json=fake_runner_json;m.run_ok=lambda *a,**k:"restored"
        m.collect_kernel=fake_collect;m.compare_profile_to_r4=fake_compare
        m.run_combined_feature_check=lambda *a,**k:{"status":"PASS"}
        m.require_disk_headroom=lambda *_a,**_k:10**9;m.set_foundation_telemetry=lambda *_a,**_k:True
        m.validate_readonly_preflight=lambda *_a,**_k:None;m.validate_sample=lambda *_a,**_k:None
        m.validate_continuity=lambda *_a,**_k:("r7",0,100.0)
        m.persist_restore_evidence=lambda *_a,**_k:None
        assert m.main()==2
    finally:
        sys.argv=original_argv
        (m.run_json,m.run_ok,m.collect_kernel,m.compare_profile_to_r4,m.run_combined_feature_check,
         m.require_disk_headroom,m.set_foundation_telemetry,m.validate_readonly_preflight,
         m.validate_sample,m.validate_continuity,m.persist_restore_evidence)=original
    result=json.loads((out/"DIAGNOSTIC_COMPLETE_RESULT.json").read_text())
    assert calls==[int(x["runtime_kernel_index_expected"]) for x in m.order_entries_for_early_baseline(inv["entries"])]
    assert len(calls)==28 and set(calls)==set(range(28)) and result["kernels_completed"]==28
    assert result["soak_started"] is False and len(result["gate_failures"])==2
    assert (out/"RESTORE_RECEIPT.json").is_file()
    assert not (out/"SWEEP_MANIFEST.json").exists() and not (out/"FOUNDATION_SOAK.jsonl").exists()
wrong=dict(sample); wrong["kernel_name"]="RGB_Blobs5"
try: m.verify_selected(wrong,inv["entries"][2]); raise AssertionError("wrong kernel accepted")
except RuntimeError: pass

# Cross-kernel continuity must carry forward the previous kernel's last uptime.
next_kernel=dict(sample); next_kernel["kernel_id"]=3; next_kernel["kernel_name"]="RGB_Blobs5"; next_kernel["uptime_seconds"]=11
m.validate_continuity(next_kernel,"r7",0,10)
regressed_next=dict(next_kernel); regressed_next["uptime_seconds"]=9
try: m.validate_continuity(regressed_next,"r7",0,10); raise AssertionError("cross-kernel uptime regression accepted")
except RuntimeError: pass

# A continuity/identity failure sample must survive as decisive evidence.
with tempfile.TemporaryDirectory() as td:
    out=pathlib.Path(td)
    p=m.persist_failure_sample(out,inv["entries"][2],"sample",sample,RuntimeError("synthetic failure"))
    payload=json.loads(p.read_text())
    assert payload["status"]=="FAIL"
    assert payload["phase"]=="sample"
    assert payload["sample"]["kernel_name"]=="Parametric_Water"
    assert payload["requested"]["effect_id"]==222

# A post-warm-up >=1000ms sample is persisted before the fail-closed runner
# returns control to the transaction's restore/recovery path.
with tempfile.TemporaryDirectory() as td:
    original=(m.run_ok,m.run_json,m.time.sleep)
    try:
        m.run_ok=lambda *args,**kwargs:None
        tripped=dict(foundation);tripped.update(frame_ms_max=1000.0,sample_time=None)
        m.run_json=lambda *args,**kwargs:tripped
        m.time.sleep=lambda *args,**kwargs:None
        try:
            m.collect_kernel(adapter,inv["entries"][2],pathlib.Path(td),10,"foundation")
            raise AssertionError(">=1000ms steady-state interval did not stop collection")
        except RuntimeError as e:
            assert "foundation-steady-state-frame-interval-stop" in str(e)
        failure=json.loads((pathlib.Path(td)/"02_Parametric_Water.first_sample.failure.json").read_text())
        assert failure["sample"]["frame_ms_max"]==1000.0
    finally:
        m.run_ok,m.run_json,m.time.sleep=original

# Saturated percentiles may be retained for diagnosis only. Such samples are
# never converted into a qualification profile, while an exact maximum below
# the independent 1000ms hard stop permits collection to move to later kernels.
with tempfile.TemporaryDirectory() as td:
    original=(m.run_ok,m.run_json,m.time.sleep)
    calls=[0]
    saturated=dict(foundation);saturated.update(
      kernel_id=2,kernel_name="Parametric_Water",release_id="r7",uptime_seconds=100,
      frame_ms_max=120,frame_ms_p99=127.875,telemetry_quality="SATURATED_DIAGNOSTIC_ONLY")
    try:
        m.run_ok=lambda *args,**kwargs:None
        def saturated_read(argv,timeout=10,env_overrides=None):
            assert env_overrides=={"HBNF_ALLOW_SATURATED_DIAGNOSTIC":"1"}
            calls[0]+=1
            value=dict(saturated,uptime_seconds=100+calls[0])
            return value
        m.run_json=saturated_read;m.time.sleep=lambda *args,**kwargs:None
        profile,*_=m.collect_kernel(adapter,inv["entries"][2],pathlib.Path(td),10,"foundation",
                                    expected_release_id="r7",expected_restart_count=0,
                                    previous_uptime=99,allow_saturated_diagnostic=True)
        assert profile is None
        result=json.loads((pathlib.Path(td)/"02_Parametric_Water.diagnostic-only.json").read_text())
        assert result["qualification_eligible"] is False and result["saturated_sample_count"]>=1
        assert (pathlib.Path(td)/"02_Parametric_Water.jsonl").is_file()
        assert not (pathlib.Path(td)/"02_Parametric_Water.profile.json").exists()
    finally:m.run_ok,m.run_json,m.time.sleep=original

# A restore mismatch must leave both raw observations on disk before raising.
with tempfile.TemporaryDirectory() as td:
    out=pathlib.Path(td)
    try:
        m.persist_restore_evidence(out,'{"restoreVerified":true}\n',{"effect":221},{"effect":220})
        raise AssertionError("restore mismatch accepted")
    except RuntimeError:pass
    assert (out/"POST_RESTORE_RAW_STATE.json").read_text()=='{"restoreVerified":true}\n'
    assert json.loads((out/"POST_RESTORE_STATE.json").read_text())=={"effect":221}

# ENOSPC protection fails closed before telemetry/device commands.
with tempfile.TemporaryDirectory() as td:
    real_disk_usage=m.shutil.disk_usage
    m.shutil.disk_usage=lambda _:types.SimpleNamespace(free=m.MIN_FREE_BYTES-1)
    try:m.require_disk_headroom(td);raise AssertionError("low evidence disk space accepted")
    except RuntimeError as e:assert "insufficient evidence disk headroom" in str(e)
    finally:m.shutil.disk_usage=real_disk_usage

# Preallocated emergency evidence space is real and can be released for recovery.
with tempfile.TemporaryDirectory() as td:
    reserve=m.create_recovery_reserve(td,size=1024*1024)
    assert reserve.stat().st_size==1024*1024
    reserve.unlink()
    assert not reserve.exists()

# Adapter-process timeout errors retain budgets and partial output for diagnosis.
with unittest.mock.patch.object(
    m.subprocess,"run",
    side_effect=subprocess.TimeoutExpired(["x"],7,output="partial-out",stderr="partial-err")
):
    try:m.run_ok(["x"],timeout=7);raise AssertionError("subprocess timeout was not surfaced")
    except RuntimeError as e:
        assert "timed out after 7s" in str(e)
        assert "partial-out" in str(e) and "partial-err" in str(e)

print("PASS: live sweep runner validates adapter/inventory/telemetry, cross-kernel continuity, failure evidence, kernel identity, and exact restore snapshots")
