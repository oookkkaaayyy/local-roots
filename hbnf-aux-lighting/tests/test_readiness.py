from pathlib import Path
import json, subprocess, sys

ROOT=Path(__file__).resolve().parents[2]
aux=(ROOT/"hbnf-aux-lighting/backend/aux_control.ts").read_text()
orch=(ROOT/"hbnf-aux-lighting/backend/cart_orchestrator.ts").read_text()
watch=(ROOT/"hbnf-wow-bundle/backend/watch_control.ts").read_text()
m1=(ROOT/"supabase/migrations/20260922061932_create_hbnf_aux_commissioning_state.sql").read_text()
m2=(ROOT/"supabase/migrations/20260922062015_harden_hbnf_aux_commissioning_gate.sql").read_text()

assert 'sp803e-v11-fold2-r3-gate' in aux
assert 'safeDefaultClosed' in aux
assert 'passive_probe' in aux
assert 'dry_run' in aux
assert 'matrixRelease:"hbnf-wow-r3-max-2026-09-21-v3"' in aux
assert 'effectIdRange:[220,247]' in aux
assert 'sceneCount:28' in aux
assert 'underglowMaxMilliamps:900' in aux
assert 'receiveSegmentOptions:false' in aux
assert 'receiveSegmentBounds:false' in aux
assert 'visualMaster:"matrix"' in aux
assert 'if(action==="blackout"||action==="off")' in aux
assert 'if(!enabled)return json' in aux
assert 'mixed_load_verified' in aux

assert 'v5-r3-runtime-gate' in orch
assert 'TARGET_RELEASE="hbnf-wow-r3-max-2026-09-21-v3"' in orch
assert 'preserveCurrentBrightness:true' in orch
assert 'brightness:8' not in orch
assert 'matrixRollbackOnAuxFailure:false' in orch
assert 'action==="dry_run"' in orch

assert 'wow-max-v3-audio-aux-ready-v15' in watch
assert '[1,8,16,24,40]' in watch
assert 'auxVersion' in watch
assert 'release:r?.control?.library_revision' in watch

assert 'hbnf_aux_commissioning_state' in m1
assert 'enable row level security' in m1.lower()
assert 'aux_enabled boolean not null default false' in m1
assert 'mixed_load_verified boolean not null default false' in m1
assert 'hbnf_aux_enable_requires_acceptance' in m2
assert 'hbnf_aux_mixed_requires_base_acceptance' in m2
print("HBNF_AUX_SOFTWARE_READINESS_PASS")

contract=json.loads((ROOT/"hbnf-aux-lighting/commissioning/contract.json").read_text())
assert contract["matrix"]["release"]=="hbnf-wow-r3-max-2026-09-21-v3"
assert contract["matrix"]["effect_ids"]==[220,247]
assert contract["aux"]["underglow"]["gpio"]==16
assert contract["aux"]["uv_main"]["gpio"]==25
assert contract["aux"]["uv_short"]["gpio"]==26
assert contract["sync"]["group_bitfield"]==1
assert contract["sync"]["receive_segment_options"] is False
assert contract["sync"]["receive_segment_bounds"] is False
assert contract["sync"]["receive_brightness"] is False
assert contract["sync"]["brightness_independent"] is True

p=subprocess.run([sys.executable,str(ROOT/"hbnf-aux-lighting/commissioning/local_commission.py"),"--selftest"],capture_output=True,text=True,check=True)
assert "HBNF_AUX_LOCAL_COMMISSION_SELFTEST_PASS" in p.stdout
print("HBNF_AUX_LOCAL_HELPER_PASS")

assert 'auxRelease:"hbnf-wow-aux-r3-2026-09-22-v1"' in aux
assert 'auxEngine:"aux-r3-wow-1d"' in aux
assert 'auxBuildWitness:"registry28-fixed-1d-v1"' in aux
assert 'AudioReactive UDP Sound Sync' in aux
assert 'AUXWOW' in aux
assert 'runtimeTrusted' in aux
assert 'auxRuntimeReady' in orch
assert 'exact custom R3 runtime' in orch

assert 'receiveBrightness:false' in aux
assert 'brightnessIndependent:true' in aux

assert 'projection:"fold2-1d-v1"' in aux
assert 'runtime?.projection==="fold2-1d-v1"' in aux
