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
    return {"on":True,"bri":255,"transition":7,"ps":-1,"pl":-1,"mainseg":0,
        "seg":[{"id":0,"start":0,"stop":32,"fx":142,"pal":52}],
        "HBNF":{"candidate":"r6","packet20Diagnostic":{"enabled":False},
        "foundationTelemetry":{"enabled":False},"matrixBrightness":66,"auxBrightness":68,
        "vibe":5,"motion":50,"audioResponse":50,"scene":0,"palette":{"mode":"legacy"},
        "overlayId":None}}

def test_combined_check_reads_back_features_and_restores_captured_state():
    calls=[];state=fixture_state();persisted={"um":{"hbnfFoundationV1":{"matrixBrightness":66,"auxBrightness":68,"vibe":5}}}
    lose_restore_response=[False];restore_calls=[0];fail_text_feature=[False]
    def get(url):
        calls.append(("GET",url))
        if url.endswith("/hbnf/build.json"):return {"release_id":"r6","candidate":"r6"}
        if url.endswith("/json/info") and "192.168.77.10" in url:return {"ip":"192.168.77.10","mac":"70:4b:ca:5b:34:5c"}
        if url.endswith("/json/info"):return {"ip":"192.168.77.11","mac":"8c:94:df:55:c3:4c","live":True,"lm":"DDP","lip":"192.168.77.10","leds":{"count":22}}
        if url.endswith("/json/state") and "192.168.77.11" in url:return {"lor":0}
        if url.endswith("/json/state"):
            return json.loads(json.dumps(state))
        if url.endswith("/json/pal"):return ["Ocean","RSVD","Party"]
        if "cfg.json" in url:return json.loads(json.dumps(persisted))
        raise AssertionError("unexpected GET "+url)
    def post(url,payload):
        calls.append(("POST",url,payload))
        if (url.endswith("/json/state") and payload.get("HBNF",{}).keys()=={"overlay"}
            and payload["HBNF"]["overlay"] is None):
            state["HBNF"]["overlayId"]=None
            return {"success":True}
        if (url.endswith("/json/state") and "HBNF" in payload and "overlay" in payload["HBNF"]
            and payload["HBNF"]["overlay"] is not None):
            overlay=payload["HBNF"]["overlay"]
            state["HBNF"]["overlayId"]=(overlay or {}).get("id")
            if (overlay or {}).get("id")=="r6-combined-check":
                state["HBNF"].update({"vibe":1,"motion":70,"audioResponse":75,"scene":1,"palette":{"mode":"wled","index":0}})
                state["HBNF"]["audio"]={"bass":0.1,"mid":0.2,"treble":0.3,"volume":0.1,"peak":0.2}
                state["seg"][0]["pal"]=0
                persisted["um"]["hbnfFoundationV1"]["vibe"]=1
            elif (overlay or {}).get("id")=="r6-mixed-case-check":
                if fail_text_feature[0]:raise TimeoutError("simulated feature request interruption")
            return {"success":True}
        state.update({k:v for k,v in payload.items() if k!="HBNF"})
        if "seg" in payload:state["seg"]=payload["seg"]
        state["HBNF"].update(payload.get("HBNF",{}))
        if "overlay" in payload.get("HBNF",{}) and payload["HBNF"]["overlay"] is None:
            state["HBNF"]["overlayId"]=None
        if payload.get("HBNF",{}).get("palette",{}).get("mode")=="legacy":
            state["HBNF"]["palette"]={"mode":"legacy"}
        for k in ("matrixBrightness","auxBrightness","vibe"):
            if k in payload.get("HBNF",{}):persisted["um"]["hbnfFoundationV1"][k]=payload["HBNF"][k]
        if payload.get("HBNF",{}).get("overlay")==None and "scene" in payload.get("HBNF",{}):
            restore_calls[0]+=1
            if lose_restore_response[0]:raise TimeoutError("simulated lost restore response")
        return {"success":True}
    result=checkmod.check("r6",{"get":get,"post":post},sleep=lambda _:None)
    assert result["status"]=="PASS",json.dumps(result,indent=2)
    assert all(result["checks"].values())
    assert result["named_palette"]=={"index":0,"name":"Ocean"}
    assert result["text_input"]=="HeLLo"
    updates=[c for c in calls if c[0]=="POST"]
    assert len(updates)==3
    payload=updates[0][2]["HBNF"]
    assert payload["vibe"]=="groove" and payload["audioResponse"]==75
    assert payload["palette"]=={"mode":"wled","index":0}
    assert payload["overlay"]["ttlMs"]==5000 and payload["overlay"]["label"]=="SCORES"
    assert payload["matrixBrightness"]==66 and payload["auxBrightness"]==68
    assert updates[1][2]["HBNF"]["overlay"]["text"]=="HeLLo"
    assert updates[2][2]["HBNF"]["overlay"] is None
    assert result["cleanup"]["verified"] is True
    assert result["owner_controls_scoring_status"].startswith("NOT_PROVEN")
    lose_restore_response[0]=True
    ambiguous=checkmod.check("r6",{"get":get,"post":post},sleep=lambda _:None)
    assert ambiguous["status"]=="PASS"
    assert ambiguous["cleanup"]["post_outcome"]=="READBACK_CONFIRMED_AFTER_AMBIGUOUS_RESPONSE"
    assert restore_calls[0]==2
    fail_text_feature[0]=True
    interrupted=checkmod.check("r6",{"get":get,"post":post},sleep=lambda _:None)
    assert interrupted["status"]=="FAIL"
    assert interrupted["cleanup"]["attempted"] is True and interrupted["cleanup"]["verified"] is True
    assert restore_calls[0]==3

def test_combined_check_fails_closed_on_identity_or_aux_failure():
    def get(url):
        if url.endswith("/hbnf/build.json"):return {"release_id":"other","candidate":"other"}
        if url.endswith("/json/info"):return {"ip":"192.168.77.10","mac":"70:4b:ca:5b:34:5c"}
        if url.endswith("/json/state"):return fixture_state()
        raise AssertionError(url)
    try:checkmod.check("r6",{"get":get,"post":lambda *a:None},sleep=lambda _:None)
    except RuntimeError as exc:assert "identity" in str(exc)
    else:raise AssertionError("mismatched firmware identity accepted")

def test_short_smoke_refuses_diagnostics_before_any_feature_mutation():
    calls=[]
    def get(url):
        if url.endswith("/hbnf/build.json"):return {"release_id":"r6","candidate":"r6"}
        if url.endswith("/json/info"):return {"ip":"192.168.77.10","mac":"70:4b:ca:5b:34:5c"}
        if url.endswith("/json/state") and "192.168.77.10" in url:
            state=fixture_state();state["HBNF"]["packet20Diagnostic"]["enabled"]=True;return state
        if url.endswith("/json/info") and "192.168.77.11" in url:
            return {"ip":"192.168.77.11","mac":"8c:94:df:55:c3:4c","live":True,"lm":"DDP","lip":"192.168.77.10","leds":{"count":22}}
        if url.endswith("/json/state") and "192.168.77.11" in url:return {"lor":0}
        raise AssertionError(url)
    def post(url,payload):calls.append((url,payload))
    try:checkmod.check("r6",{"get":get,"post":post},sleep=lambda _:None,require_normal_mode=True)
    except RuntimeError as exc:assert "active-packet20" in str(exc)
    else:raise AssertionError("diagnostic-mode health smoke proceeded")
    assert calls==[]

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

if __name__=="__main__":
    for name,value in sorted(globals().copy().items()):
        if name.startswith("test_") and callable(value):value()
    print("PASS: combined feature check restores exact runtime/persisted owner state, resolves ambiguous restore by readback, and refuses diagnostics before writes")
