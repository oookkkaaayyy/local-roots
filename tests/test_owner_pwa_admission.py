#!/usr/bin/env python3
"""Focused tests for one-use Owner PWA software admission in the existing control plane."""
import copy, importlib.util, json, pathlib, subprocess, sys, tempfile, unittest, time
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('control',ROOT/'scripts/hbnf_control.py')
control=importlib.util.module_from_spec(spec); spec.loader.exec_module(control)
NOW=int(time.time())
AUTH_TEST_FILE=control.DEFAULT_STATE.parent.parent/'evidence'/'owner-pwa-test-authorization.json'

def tearDownModule():
    AUTH_TEST_FILE.unlink(missing_ok=True)

def fixture():
    state=json.loads((ROOT/'config/HBNF_CONTROL_STATE.json').read_text())
    state['lifecycle_state']='PHASE2_INTEGRATING'
    state['phase2_implementation_authorized']=True
    state['live_mutation_authorized']=False
    state.setdefault('execution_cursor',{}).pop('owner_pwa_transaction',None)
    state['execution_cursor'].pop('owner_pwa_transaction_history',None)
    owner={'schema':'hbnf-owner-pwa-install-authorization-v1','transaction_id':'OWNER-PWA-20261018-TEST-01',
       'authorization_id':'OWNER-20261018-PWA-ONE-INSTALL','source_message_ref':'current explicit owner authorization',
       'scope':[control.OWNER_PWA_STEP,'rollback_if_required'],'nonce':'a'*64,'issued_unix':NOW,'expires_unix':NOW+600,
       'artifact_sha256_bindings':copy.deepcopy(control.OWNER_PWA_ARTIFACTS)}
    evidence_root=control.DEFAULT_STATE.parent.parent/'evidence'; evidence_root.mkdir(exist_ok=True)
    authorization_path=AUTH_TEST_FILE
    authorization_path.write_text(json.dumps({'schema':'hbnf-owner-pwa-explicit-authorization-receipt-v1','owner_authorization':owner},sort_keys=True))
    manifest={'drive_file_id':control.OWNER_PWA_DRIVE_ID,'target':{'model':'GL-SFT1200','ip':'192.168.77.1','base':'/www/mission-control-local','owner_dir':'/www/mission-control-local/owner-pwa'},
       'allowed_paths':list(control.OWNER_PWA_TARGETS),'candidate_sha256_by_path':copy.deepcopy(control.OWNER_PWA_CANDIDATE_HASHES),
       'owner_authorization_receipt':{'path':authorization_path.relative_to(control.DEFAULT_STATE.parent.parent).as_posix(),'sha256':control.sha256_file(authorization_path)},
       'live_preflight':{'schema':'hbnf-owner-pwa-live-preflight-v1','pass':True,'captured_unix':NOW,'target_ip':'192.168.77.1',
          'served_sha256_by_path':copy.deepcopy(control.OWNER_PWA_BASELINE_HASHES),
          'permissions':{'owner_files_regular_no_symlinks':True,'transport_regular_no_symlink':True,'root_install_available':True,'recovery_paths_clear':True}}}
    manifest=control.issue_owner_pwa_admission(state,manifest,owner,NOW)
    return state,manifest

def reject(fn):
    try: fn()
    except ValueError: return
    raise AssertionError('expected fail-closed rejection')

class OwnerPwaAdmission(unittest.TestCase):
    def test_exact_admission_reserves_once_and_keeps_firmware_authority_closed(self):
        state,m=fixture(); before=copy.deepcopy(state['completed_receipts']); self.assertEqual([],control.owner_pwa_admission_errors(state,m,NOW))
        self.assertEqual([],control.validate_state(control.load(ROOT/'config/HBNF_CONTROL_MODEL.json'),state))
        control.reserve_owner_pwa_install(state,m,NOW)
        self.assertEqual('IN_PROGRESS',state['execution_cursor']['owner_pwa_transaction']['status'])
        self.assertFalse(state['live_mutation_authorized'])
        self.assertEqual(before,state['completed_receipts'])
        self.assertEqual([],control.validate_state(control.load(ROOT/'config/HBNF_CONTROL_MODEL.json'),state))
        reject(lambda: control.reserve_owner_pwa_install(state,m,NOW))
    def test_rejects_wrong_hash_paths_and_permissions(self):
        for mutate in (lambda m:m['artifact_sha256_bindings'].__setitem__('release_zip','0'*64),
                       lambda m:m['allowed_paths'].append('owner-pwa/unrelated.js'),
                       lambda m:m['live_preflight']['permissions'].__setitem__('root_install_available',False)):
            state,m=fixture(); mutate(m); m['admission_sha256']=control.owner_pwa_admission_digest(m)
            state['execution_cursor']['owner_pwa_transaction']['admission_sha256']=m['admission_sha256']
            self.assertTrue(control.owner_pwa_admission_errors(state,m,NOW))
    def test_rejects_expired_stale_replayed_and_wrong_transaction(self):
        state,m=fixture(); self.assertTrue(control.owner_pwa_admission_errors(state,m,NOW+601))
        state,m=fixture(); m['live_preflight']['captured_unix']=NOW-301; m['admission_sha256']=control.owner_pwa_admission_digest(m)
        state['execution_cursor']['owner_pwa_transaction']['admission_sha256']=m['admission_sha256']
        self.assertTrue(control.owner_pwa_admission_errors(state,m,NOW))
        state,m=fixture(); control.reserve_owner_pwa_install(state,m,NOW)
        self.assertTrue(control.owner_pwa_admission_errors(state,m,NOW))
        state,m=fixture(); m['transaction_id']='OTHER'; m['admission_sha256']=control.owner_pwa_admission_digest(m)
        self.assertTrue(control.owner_pwa_admission_errors(state,m,NOW))
    def test_install_receipt_requires_exact_candidate_served_assets_and_rollback(self):
        state,m=fixture(); control.reserve_owner_pwa_install(state,m,NOW)
        evidence={'schema':'hbnf-owner-pwa-install-result-v1','transaction_id':m['transaction_id'],'step':control.OWNER_PWA_STEP,'status':'PASS',
           'installed_sha256_by_path':copy.deepcopy(control.OWNER_PWA_CANDIDATE_HASHES),'served_sha256_by_path':copy.deepcopy(control.OWNER_PWA_CANDIDATE_HASHES),
           'rollback_sha256':control.OWNER_PWA_ARTIFACTS['served_baseline_zip'],'rollback_retained':True,
           'health_checks':{'http_200_all_15':True,'content_hash_all_15':True,'owner_route_content':True,'guest_unchanged':True,'skins_unchanged':True,'firmware_unchanged':True,'aux_unchanged':True}}
        with tempfile.TemporaryDirectory(dir=ROOT) as d:
            p=pathlib.Path(d)/'evidence.json'; p.write_text(json.dumps(evidence));
            # The control plane only accepts release evidence below its existing evidence root.
            ep=ROOT/'evidence'/'owner-pwa-test-install.json'; ep.parent.mkdir(exist_ok=True); ep.write_text(json.dumps(evidence))
            try:
                control.complete_owner_pwa_install(state,m,ep,NOW+1200)
                self.assertEqual('COMPLETE',state['execution_cursor']['owner_pwa_transaction']['status'])
                self.assertEqual([control.OWNER_PWA_STEP],state['execution_cursor']['owner_pwa_transaction']['completed_steps'])
                self.assertEqual([],control.validate_state(control.load(ROOT/'config/HBNF_CONTROL_MODEL.json'),state))
            finally: ep.unlink(missing_ok=True)
    def test_interrupted_install_requires_truthful_failure_then_exact_rollback(self):
        state,m=fixture(); control.reserve_owner_pwa_install(state,m,NOW)
        with tempfile.TemporaryDirectory(dir=ROOT) as d:
            root=ROOT/'evidence'; root.mkdir(exist_ok=True)
            failure=root/'owner-pwa-test-failure.json'
            failure.write_text(json.dumps({'schema':'hbnf-owner-pwa-install-result-v1','transaction_id':m['transaction_id'],'step':control.OWNER_PWA_STEP,'status':'FAIL','failure_id':'SIGKILL_WITH_JOURNAL','interrupted':True,'journal_present':True}))
            try:
                control.record_owner_pwa_failure(state,m,failure,NOW+1200)
                control.reserve_owner_pwa_rollback(state,m,NOW+1200)
                rollback=root/'owner-pwa-test-rollback.json'
                rollback.write_text(json.dumps({'schema':'hbnf-owner-pwa-install-result-v1','transaction_id':m['transaction_id'],'step':'rollback_if_required','status':'PASS','rollback_sha256':control.OWNER_PWA_ARTIFACTS['served_baseline_zip'],'served_sha256_by_path':control.OWNER_PWA_BASELINE_HASHES}))
                try:
                    control.complete_owner_pwa_rollback(state,m,rollback,NOW+1200)
                    self.assertEqual('ROLLED_BACK',state['execution_cursor']['owner_pwa_transaction']['status'])
                    self.assertEqual([],control.validate_state(control.load(ROOT/'config/HBNF_CONTROL_MODEL.json'),state))
                    reject(lambda: control.reserve_owner_pwa_rollback(state,m,NOW+1200))
                finally: rollback.unlink(missing_ok=True)
            finally: failure.unlink(missing_ok=True)
    def test_guard_rejects_wrong_step_and_arbitrary_command(self):
        state,m=fixture()
        with tempfile.TemporaryDirectory(dir=ROOT) as d:
            sp=pathlib.Path(d)/'state.json'; mp=pathlib.Path(d)/'admission.json'; sp.write_text(json.dumps(state)); mp.write_text(json.dumps(m))
            runner=ROOT/'scripts/hbnf_guarded_run.py'; common=[sys.executable,str(runner),'--require-state','PHASE2_INTEGRATING','--model',str(ROOT/'config/HBNF_CONTROL_MODEL.json'),'--state',str(sp),'--owner-pwa-admission',str(mp)]
            wrong=subprocess.run(common+['--owner-pwa-action','reserve','--owner-pwa-step','rollback_if_required'],capture_output=True,text=True)
            self.assertNotEqual(0,wrong.returncode)
            arbitrary=subprocess.run(common+['--owner-pwa-action','check','--','sh','-c','true'],capture_output=True,text=True)
            self.assertNotEqual(0,arbitrary.returncode)
    def test_guard_check_and_reserve_use_the_software_only_path(self):
        state,m=fixture()
        with tempfile.TemporaryDirectory(dir=ROOT) as d:
            sp=pathlib.Path(d)/'state.json'; mp=pathlib.Path(d)/'admission.json'; sp.write_text(json.dumps(state)); mp.write_text(json.dumps(m))
            runner=ROOT/'scripts/hbnf_guarded_run.py'; common=[sys.executable,str(runner),'--require-state','PHASE2_INTEGRATING','--model',str(ROOT/'config/HBNF_CONTROL_MODEL.json'),'--state',str(sp),'--owner-pwa-admission',str(mp)]
            checked=subprocess.run(common+['--owner-pwa-action','check'],capture_output=True,text=True)
            self.assertEqual(0,checked.returncode,checked.stdout+checked.stderr)
            reserved=subprocess.run(common+['--owner-pwa-action','reserve','--owner-pwa-step','install_owner_pwa'],capture_output=True,text=True)
            self.assertEqual(0,reserved.returncode,reserved.stdout+reserved.stderr)
            current=json.loads(sp.read_text())
            self.assertEqual('IN_PROGRESS',current['execution_cursor']['owner_pwa_transaction']['status'])
            self.assertFalse(current['live_mutation_authorized'])

if __name__=='__main__': unittest.main(verbosity=2)
