from pathlib import Path
import json, subprocess, sys

ROOT=Path(__file__).resolve().parents[2]
aux=(ROOT/"hbnf-aux-lighting/backend/aux_control.ts").read_text()
orch=(ROOT/"hbnf-aux-lighting/backend/cart_orchestrator.ts").read_text()
watch=(ROOT/"hbnf-wow-bundle/backend/watch_control.ts").read_text()
doctor=(ROOT/"hbnf-wow-bundle/backend/release_doctor.ts").read_text()
m1=(ROOT/"supabase/migrations/20260922061932_create_hbnf_aux_commissioning_state.sql").read_text()
m2=(ROOT/"supabase/migrations/20260922062015_harden_hbnf_aux_commissioning_gate.sql").read_text()

assert 'sp803e-v12-uv-follow-r4-gate' in aux
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
assert 'databaseGateAccepted' in aux
assert 'st.runtimeTrusted&&uvOutputsVerified' in aux
assert 'expectedUvOutputsVerified=R3.uvFollow.outputsVerified===true?1:0' in aux

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
assert 'wow-v3-doctor-11-commissioned-aux-semantics' in doctor
assert 'auxRuntimeWhenEnabled' in doctor
assert 'auxGateConsistency' in doctor

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
assert contract["aux"]["uv"]["status"]=="per-channel-hardware-pending"
assert contract["aux"]["uv"]["main_nominal_voltage"]==5
assert contract["aux"]["uv"]["short_nominal_voltage"]==5
assert contract["aux"]["uv"]["load_ratings_verified"] is False
assert contract["aux"]["uv"]["sp803e_pwm_direct_control"] is False
assert contract["aux"]["spare_pwm_gpios"]==[25,26,27]
assert contract["safety"]["uv_direct_from_controller_vcc_forbidden"] is True
assert contract["safety"]["uv_requires_verified_per_channel_pwm_path"] is True
assert contract["sync"]["group_bitfield"]==1
assert contract["sync"]["receive_segment_options"] is False
assert contract["sync"]["receive_segment_bounds"] is False
assert contract["sync"]["receive_brightness"] is False
assert contract["sync"]["brightness_independent"] is True

p=subprocess.run([sys.executable,str(ROOT/"hbnf-aux-lighting/commissioning/local_commission.py"),"--selftest"],capture_output=True,text=True,check=True)
assert "HBNF_AUX_LOCAL_COMMISSION_SELFTEST_PASS" in p.stdout
print("HBNF_AUX_LOCAL_HELPER_PASS")

op=ROOT/"hbnf-aux-lighting/commissioning/commission_operator.py"
p=subprocess.run([sys.executable,str(op),"--selftest"],capture_output=True,text=True,check=True)
assert "HBNF_AUX_COMMISSION_OPERATOR_SELFTEST_PASS" in p.stdout
launcher=(ROOT/"hbnf-aux-lighting/commissioning/COMMISSION_HBNF_AUX.command").read_text()
assert 'commission_guard.py --phase interactive' in launcher
assert '--prepare-sync' not in launcher
assert 'explicit YES' in launcher
print("HBNF_AUX_COMMISSION_OPERATOR_GATE_PASS")

plan=ROOT/"hbnf-aux-lighting/commissioning/generate_aux_hardware_plan.py"
p=subprocess.run([sys.executable,str(plan),"--selftest"],capture_output=True,text=True,check=True)
assert "HBNF_AUX_HARDWARE_PLAN_SELFTEST_PASS" in p.stdout
sample=subprocess.run([sys.executable,str(plan),"--pixels","37","--order","RGB"],capture_output=True,text=True,check=True)
sp=json.loads(sample.stdout)
assert sp["mutationIssued"] is False and sp["reviewRequired"] is True
assert len(sp["cfgPatch"]["hw"]["led"]["ins"])==1
assert sp["cfgPatch"]["hw"]["led"]["ins"][0]["pin"]==[16]
assert sp["cfgPatch"]["hw"]["led"]["total"]==37
assert len(sp["statePatch"]["seg"])==1 and sp["statePatch"]["seg"][0]["sel"] is True
assert sp["postApplyChecks"]["uv"]["sp803ePwmConfigured"] is False
print("HBNF_AUX_HARDWARE_PLAN_GATE_PASS")

guard=ROOT/"hbnf-aux-lighting/commissioning/commission_guard.py"
p=subprocess.run([sys.executable,str(guard),"--selftest"],capture_output=True,text=True)
if p.returncode:
    print(p.stdout)
    print(p.stderr,file=sys.stderr)
    p.check_returncode()
assert "HBNF_AUX_COMMISSION_GUARD_SELFTEST_PASS" in p.stdout
builder=ROOT/"hbnf-aux-lighting/commissioning/build_commissioning_distribution.py"
p=subprocess.run([sys.executable,str(builder),"--selftest"],capture_output=True,text=True,check=True)
assert "HBNF_AUX_DISTRIBUTION_SELFTEST_PASS" in p.stdout
launcher=(ROOT/"hbnf-aux-lighting/commissioning/COMMISSION_HBNF_AUX.command").read_text()
assert "commission_guard.py --phase interactive" in launcher
assert "set -e" not in launcher
assert "explicit YES" in launcher
guard_text=guard.read_text()
for marker in ("parse_ifconfig_networks","infer_color_order","HBNF_AUX_ACCEPTANCE_EVIDENCE.json","physicalGateReady","underglowPhysicalReady","uvArchitecturePending","final_cloud_verification","configure_aux_mqtt_from_matrix"):
    assert marker in guard_text, marker
sys.path.insert(0,str((ROOT/"hbnf-aux-lighting/commissioning").resolve()))
import local_commission as _lc
assert "mqtt" not in _lc.AUX_CFG_PATCH["if"]
print("HBNF_AUX_TURNKEY_COMMISSIONING_GATE_PASS")

assert 'auxRelease:"hbnf-wow-aux-r3-2026-10-25-uv-follow-v1"' in aux
assert 'auxEngine:"aux-r3-wow-1d"' in aux
assert 'auxBuildWitness:"registry28-tempo-lock-1d-v7-network-no-starve-uv-follow"' in aux
assert 'AudioReactive UDP Sound Sync' in aux
assert 'AUXWOW' in aux
assert 'runtimeTrusted' in aux
assert 'auxRuntimeReady' in orch
assert 'exact custom R3 runtime' in orch
assert 'receiveBrightness:false' in aux
assert 'brightnessIndependent:true' in aux
assert 'projection:"fold2-1d-v1"' in aux
assert 'runtime?.projection==="fold2-1d-v1"' in aux
