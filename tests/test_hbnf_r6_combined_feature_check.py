import importlib.util
import json
import pathlib
import tempfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

checkmod=load("combined",ROOT/"scripts/hbnf_r6_combined_feature_check.py")
sweep=load("sweep",ROOT/"scripts/hbnf_live_kernel_sweep.py")
transaction=load("txn",ROOT/"scripts/hbnf_r6_audio_cache_live_transaction.py")

def fixture_state():
    return {"on":True,"HBNF":{"candidate":"r6","packet20Diagnostic":{"enabled":True},
        "foundationTelemetry":{"enabled":True},"matrixBrightness":44,"auxBrightness":44}}

def test_combined_check_uses_one_coherent_native_state_update_and_readback():
    calls=[];responses=[
      {"release_id":"r6","candidate":"r6"},
      {"ip":"192.168.77.10","mac":"70:4b:ca:5b:34:5c"},fixture_state(),
      {"ip":"192.168.77.11","mac":"8c:94:df:55:c3:4c","live":True,"lm":"DDP","lip":"192.168.77.10","leds":{"count":22}},
      {"lor":0},
      ["Ocean","RSVD","Party"],
      {"on":True,"HBNF":{"candidate":"r6","vibe":1,"motion":70,"audioResponse":75,
        "scene":1,"palette":{"mode":"wled","index":0},"overlayId":"r6-combined-check",
        "audio":{"bass":0.1,"mid":0.2,"treble":0.3,"volume":0.1,"peak":0.2}}},
      {"ip":"192.168.77.11","mac":"8c:94:df:55:c3:4c","live":True,"lm":"DDP","lip":"192.168.77.10","leds":{"count":22}},
      {"lor":0},
      {"HBNF":{"overlayId":"r6-mixed-case-check"}},
    ]
    def get(url):calls.append(("GET",url));return responses.pop(0)
    def post(url,payload):calls.append(("POST",url,payload));return {"success":True}
    result=checkmod.check("r6",{"get":get,"post":post},sleep=lambda _:None)
    assert result["status"]=="PASS"
    assert all(result["checks"].values())
    assert result["named_palette"]=={"index":0,"name":"Ocean"}
    assert result["text_input"]=="HeLLo"
    updates=[c for c in calls if c[0]=="POST"]
    assert len(updates)==2
    payload=updates[0][2]["HBNF"]
    assert payload["vibe"]=="groove" and payload["audioResponse"]==75
    assert payload["palette"]=={"mode":"wled","index":0}
    assert payload["overlay"]["ttlMs"]==12000 and payload["overlay"]["label"]=="SCORES"
    assert payload["matrixBrightness"]==44 and payload["auxBrightness"]==44
    assert updates[1][2]["HBNF"]["overlay"]["text"]=="HeLLo"
    assert result["owner_controls_scoring_status"].startswith("NOT_PROVEN")

def test_combined_check_fails_closed_on_identity_or_aux_failure():
    responses=[{"release_id":"other","candidate":"other"},
      {"ip":"192.168.77.10","mac":"70:4b:ca:5b:34:5c"},fixture_state()]
    def get(_):return responses.pop(0)
    try:checkmod.check("r6",{"get":get,"post":lambda *a:None},sleep=lambda _:None)
    except RuntimeError as exc:assert "identity" in str(exc)
    else:raise AssertionError("mismatched firmware identity accepted")

def test_sweep_requires_combined_gate_and_records_failure_before_baseline():
    with tempfile.TemporaryDirectory() as td:
        out=pathlib.Path(td)
        original=sweep.run_json
        try:
            sweep.run_json=lambda argv,timeout: {"status":"FAIL","error":"simulated gate failure"}
            try:sweep.run_combined_feature_check("fake.py",out,"r6",5)
            except RuntimeError as exc:assert "combined-feature-check-failed" in str(exc)
            else:raise AssertionError("failed combined gate accepted")
            receipt=json.loads((out/"COMBINED_FEATURE_CHECK.json").read_text())
            assert receipt["status"]=="FAIL"
        finally:sweep.run_json=original
    source=(ROOT/"scripts/hbnf_live_kernel_sweep.py").read_text()
    call=source.index("combined_result=run_combined_feature_check")
    baseline=source.index("pre_soak_manifest={",call)
    soak=source.index("soak_result=run_foundation_soak(",baseline)
    assert call<baseline<soak
    assert 'if not args.combined_check_script:' in source
    assert "integrated Foundation soak requires the frozen combined-feature check" in source

def test_qualification_command_binds_combined_check_to_candidate():
    cmd=transaction.qualification_command(pathlib.Path("/tmp/out"))
    assert "--combined-check-script" in cmd
    idx=cmd.index("--combined-check-script")
    assert cmd[idx+1].endswith("hbnf_r6_combined_feature_check.py")
    assert "--soak-seconds" in cmd and cmd[cmd.index("--soak-seconds")+1]=="5400"
