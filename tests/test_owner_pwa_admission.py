#!/usr/bin/env python3
"""Focused tests for one-use Owner PWA software admission in the existing control plane."""
import copy, importlib.util, json, pathlib, subprocess, sys, tempfile, unittest, time
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('control',ROOT/'scripts/hbnf_control.py')
control=importlib.util.module_from_spec(spec); spec.loader.exec_module(control)
NOW=int(time.time())
AUTH_TEST_FILE=control.DEFAULT_STATE.parent.parent/'evidence'/'owner-pwa-test-authorization.json'
NEXT_AUTH_TEST_FILE=control.DEFAULT_STATE.parent.parent/'evidence'/'owner-pwa-test-authorization-successor.json'

def tearDownModule():
    AUTH_TEST_FILE.unlink(missing_ok=True)
    NEXT_AUTH_TEST_FILE.unlink(missing_ok=True)

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
    def test_issue_accepts_only_short_cli_clock_skew(self):
        state=json.loads((ROOT/'config/HBNF_CONTROL_STATE.json').read_text())
        state['lifecycle_state']='PHASE2_INTEGRATING'; state['phase2_implementation_authorized']=True
        state['live_mutation_authorized']=False; state.setdefault('execution_cursor',{}).pop('owner_pwa_transaction',None)
        state['execution_cursor'].pop('owner_pwa_transaction_history',None)
        owner={'schema':'hbnf-owner-pwa-install-authorization-v1','transaction_id':'OWNER-PWA-20261018-CLOCK-01',
           'authorization_id':'OWNER-20261018-PWA-CLOCK-TEST','source_message_ref':'focused clock-skew test',
           'scope':[control.OWNER_PWA_STEP,'rollback_if_required'],'nonce':'b'*64,'issued_unix':NOW,'expires_unix':NOW+600,
           'artifact_sha256_bindings':copy.deepcopy(control.OWNER_PWA_ARTIFACTS)}
        evidence_root=control.DEFAULT_STATE.parent.parent/'evidence'; evidence_root.mkdir(exist_ok=True)
        AUTH_TEST_FILE.write_text(json.dumps({'schema':'hbnf-owner-pwa-explicit-authorization-receipt-v1','owner_authorization':owner},sort_keys=True))
        manifest={'drive_file_id':control.OWNER_PWA_DRIVE_ID,'target':{'model':'GL-SFT1200','ip':'192.168.77.1','base':'/www/mission-control-local','owner_dir':'/www/mission-control-local/owner-pwa'},
           'allowed_paths':list(control.OWNER_PWA_TARGETS),'candidate_sha256_by_path':copy.deepcopy(control.OWNER_PWA_CANDIDATE_HASHES),
           'owner_authorization_receipt':{'path':AUTH_TEST_FILE.relative_to(control.DEFAULT_STATE.parent.parent).as_posix(),'sha256':control.sha256_file(AUTH_TEST_FILE)},
           'live_preflight':{'schema':'hbnf-owner-pwa-live-preflight-v1','pass':True,'captured_unix':NOW,'target_ip':'192.168.77.1',
              'served_sha256_by_path':copy.deepcopy(control.OWNER_PWA_BASELINE_HASHES),
              'permissions':{'owner_files_regular_no_symlinks':True,'transport_regular_no_symlink':True,'root_install_available':True,'recovery_paths_clear':True}}}
        admitted=control.issue_owner_pwa_admission(state,manifest,owner,NOW+2)
        self.assertEqual([],control.owner_pwa_admission_errors(state,admitted,NOW+2))
        state['execution_cursor'].pop('owner_pwa_transaction',None)
        with self.assertRaises(ValueError): control.issue_owner_pwa_admission(state,manifest,owner,NOW+301)

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
    def _completed_transaction(self):
        state,previous_manifest=fixture()
        receipt={'schema':'hbnf-owner-pwa-install-result-v1','transaction_id':previous_manifest['transaction_id'],
            'step':control.OWNER_PWA_STEP,'status':'PASS',
            'installed_sha256_by_path':copy.deepcopy(control.OWNER_PWA_CANDIDATE_HASHES),
            'served_sha256_by_path':copy.deepcopy(control.OWNER_PWA_CANDIDATE_HASHES),
            'rollback_sha256':control.OWNER_PWA_ARTIFACTS['served_baseline_zip'],'rollback_retained':True,
            'health_checks':{'http_200_all_15':True,'content_hash_all_15':True,'owner_route_content':True,
                'guest_unchanged':True,'skins_unchanged':True,'firmware_unchanged':True,'aux_unchanged':True}}
        path=control.DEFAULT_STATE.parent.parent/'evidence'/'owner-pwa-prior-test-install.json'
        path.parent.mkdir(exist_ok=True); path.write_text(json.dumps(receipt,sort_keys=True))
        tx=state['execution_cursor']['owner_pwa_transaction']
        tx.update({'status':'COMPLETE','attempts_used':1,'active_step':None,
            'completed_steps':[control.OWNER_PWA_STEP],'rollback_attempts_used':0,
            'install_receipt':copy.deepcopy(receipt),
            'install_receipt_path':path.relative_to(control.DEFAULT_STATE.parent.parent).as_posix(),
            'install_receipt_sha256':control.sha256_file(path)})
        return state,previous_manifest,tx,path

    def _fresh_owner_and_manifest(self,previous_manifest,transaction_id='OWNER-PWA-20261019-TEST-NEXT',
                                  authorization_id='OWNER-20261019-PWA-NEXT',nonce='c'*64):
        owner={'schema':'hbnf-owner-pwa-install-authorization-v1','transaction_id':transaction_id,
            'authorization_id':authorization_id,'source_message_ref':'current explicit owner authorization',
            'scope':[control.OWNER_PWA_STEP,'rollback_if_required'],'nonce':nonce,
            'issued_unix':NOW,'expires_unix':NOW+600,
            'artifact_sha256_bindings':copy.deepcopy(control.OWNER_PWA_ARTIFACTS)}
        NEXT_AUTH_TEST_FILE.write_text(json.dumps({'schema':'hbnf-owner-pwa-explicit-authorization-receipt-v1',
            'owner_authorization':owner},sort_keys=True))
        manifest=copy.deepcopy(previous_manifest)
        manifest['owner_authorization_receipt']={
            'path':NEXT_AUTH_TEST_FILE.relative_to(control.DEFAULT_STATE.parent.parent).as_posix(),
            'sha256':control.sha256_file(NEXT_AUTH_TEST_FILE)}
        return owner,manifest

    def test_reissue_accepts_the_verified_recorded_completion_without_rewriting_it(self):
        state=json.loads(control.DEFAULT_STATE.read_text())
        prior=copy.deepcopy(state['execution_cursor']['owner_pwa_transaction'])
        self.assertEqual('COMPLETE',prior['status'])
        self.assertEqual([],control._owner_pwa_verified_terminal_transaction(prior))
        _template_state,template=fixture()
        owner,manifest=self._fresh_owner_and_manifest(template,
            transaction_id='OWNER-PWA-20261019-TEST-AFTER-RECORDED',
            authorization_id='OWNER-20261019-PWA-AFTER-RECORDED',nonce='8'*64)
        admitted=control.issue_owner_pwa_admission(state,manifest,owner,NOW)
        archived=state['execution_cursor']['owner_pwa_transaction_history'][0]
        self.assertEqual(prior,archived['prior_transaction'])
        self.assertEqual(admitted['transaction_id'],archived['superseded_by'])
        self.assertEqual([],control.owner_pwa_admission_errors(state,admitted,NOW))
        self.assertFalse(state['live_mutation_authorized'])

    def test_new_install_archives_only_a_receipted_terminal_transaction(self):
        state,old_manifest,prior,path=self._completed_transaction()
        before=copy.deepcopy(prior)
        owner,manifest=self._fresh_owner_and_manifest(old_manifest)
        admitted=control.issue_owner_pwa_admission(state,manifest,owner,NOW)
        cursor=state['execution_cursor']
        history=cursor['owner_pwa_transaction_history']
        self.assertEqual(1,len(history))
        self.assertEqual(before,history[0]['prior_transaction'])
        self.assertEqual(admitted['transaction_id'],history[0]['superseded_by'])
        self.assertEqual(before,prior)
        self.assertEqual([],control.owner_pwa_admission_errors(state,admitted,NOW))
        self.assertFalse(state['live_mutation_authorized'])
        control.reserve_owner_pwa_install(state,admitted,NOW)
        reject(lambda:control.reserve_owner_pwa_install(state,admitted,NOW))
        path.unlink(missing_ok=True)

    def test_new_install_rejects_unresolved_or_corrupt_prior_transactions(self):
        for status,active in (('IN_PROGRESS',control.OWNER_PWA_STEP),('ROLLBACK_REQUIRED',None)):
            state,old_manifest,_prior,path=self._completed_transaction()
            tx=state['execution_cursor']['owner_pwa_transaction']
            tx['status']=status; tx['active_step']=active
            owner,manifest=self._fresh_owner_and_manifest(old_manifest,
                transaction_id='OWNER-PWA-20261019-TEST-'+status,
                authorization_id='OWNER-20261019-PWA-'+status,nonce=('d' if status=='IN_PROGRESS' else 'e')*64)
            with self.assertRaises(ValueError):
                control.issue_owner_pwa_admission(state,manifest,owner,NOW)
            path.unlink(missing_ok=True)

        state,old_manifest,_prior,path=self._completed_transaction()
        tx=state['execution_cursor']['owner_pwa_transaction']
        tx['install_receipt']['status']='FAIL'
        owner,manifest=self._fresh_owner_and_manifest(old_manifest,
            transaction_id='OWNER-PWA-20261019-TEST-CORRUPT',
            authorization_id='OWNER-20261019-PWA-CORRUPT',nonce='f'*64)
        with self.assertRaises(ValueError):
            control.issue_owner_pwa_admission(state,manifest,owner,NOW)
        path.unlink(missing_ok=True)

    def test_new_install_rejects_reused_transaction_authorization_or_nonce(self):
        for field,value in (('transaction_id','OWNER-PWA-20261018-TEST-01'),
                            ('authorization_id','OWNER-20261018-PWA-ONE-INSTALL'),
                            ('nonce','a'*64)):
            state,old_manifest,_prior,path=self._completed_transaction()
            kwargs={'transaction_id':'OWNER-PWA-20261019-TEST-REPLAY',
                    'authorization_id':'OWNER-20261019-PWA-REPLAY','nonce':'9'*64}
            kwargs[field]=value
            owner,manifest=self._fresh_owner_and_manifest(old_manifest,**kwargs)
            with self.assertRaises(ValueError):
                control.issue_owner_pwa_admission(state,manifest,owner,NOW)
            path.unlink(missing_ok=True)

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
