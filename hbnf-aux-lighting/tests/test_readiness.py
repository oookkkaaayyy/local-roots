from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
aux=(ROOT/"hbnf-aux-lighting/backend/aux_control.ts").read_text()
orch=(ROOT/"hbnf-aux-lighting/backend/cart_orchestrator.ts").read_text()
watch=(ROOT/"hbnf-wow-bundle/backend/watch_control.ts").read_text()
m1=(ROOT/"supabase/migrations/20260922061932_create_hbnf_aux_commissioning_state.sql").read_text()
m2=(ROOT/"supabase/migrations/20260922062015_harden_hbnf_aux_commissioning_gate.sql").read_text()

assert 'sp803e-v7-commissioning-gate' in aux
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

assert 'v4-r3-dynamic-gate' in orch
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
