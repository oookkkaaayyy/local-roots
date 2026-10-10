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
