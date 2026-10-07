import json, pathlib, sys, unittest
ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'hbnf-wow-backend-prep' / 'backend'))
from aux_uv_policy import Mode, UVConfig, UVState, next_output, wled_state_patch

class TextTreatmentTests(unittest.TestCase):
    def test_styles_are_owner_review_only_and_preserve_readable_hold(self):
        contract=json.loads((ROOT / 'hbnf-wow-backend-prep' / 'contracts' / 'text_presentation.json').read_text())
        self.assertFalse(contract['visual_freeze'])
        self.assertEqual(contract['status'],'OWNER_REVIEW_REQUIRED_OFFLINE_PREPARATION')
        self.assertIn('no_glyph_geometry_modification_during_hold',contract['invariants'])
        self.assertEqual(len(contract['treatment_options_for_review']),3)

class UVTests(unittest.TestCase):
    def setUp(self): self.cfg=UVConfig(segment_ids=(1,2),max_brightness=50,ramp_per_tick=5,enabled=True,hardware_available=True)
    def test_off_and_unavailable_fail_safe(self):
        self.assertEqual(next_output(UVState(Mode.MANUAL,40,current_output=20),UVConfig((1,),enabled=False,hardware_available=True)),0)
        self.assertEqual(next_output(UVState(Mode.MANUAL,40,current_output=20),UVConfig((1,),enabled=True,hardware_available=False)),0)
    def test_owner_override_wins_and_is_capped_with_ramp(self):
        s=UVState(Mode.VIBE_REACTIVE,manual_brightness=2,owner_override=80,current_output=10)
        self.assertEqual(next_output(s,self.cfg,vibe_envelope=0),15)
    def test_follow_matrix_and_vibe_modes_ramp(self):
        self.assertEqual(next_output(UVState(Mode.FOLLOW_MATRIX,current_output=0),self.cfg,matrix_brightness=255),5)
        self.assertEqual(next_output(UVState(Mode.VIBE_REACTIVE,current_output=0),self.cfg,vibe_envelope=255),5)
    def test_native_segment_json_and_zero_off(self):
        self.assertEqual(wled_state_patch(self.cfg,80),{'on':True,'seg':[{'id':1,'on':True,'bri':50},{'id':2,'on':True,'bri':50}]})
        self.assertEqual(wled_state_patch(UVConfig((1,2),enabled=False,hardware_available=True),50)['seg'][0]['on'],False)

class CandidateContractTests(unittest.TestCase):
    def test_uv_candidate_stays_off_and_preserves_underlights(self):
        candidate=json.loads((ROOT / 'hbnf-wow-backend-prep' / 'contracts' / 'aux-uv-candidate.json').read_text())
        self.assertFalse(candidate['software_feature_enabled'])
        self.assertFalse(candidate['hardware_available'])
        self.assertEqual(candidate['max_brightness'],0)
        self.assertEqual(candidate['preserve_existing_output']['gpio'],16)
        self.assertFalse(candidate['candidate_uv_output']['enabled'])

    def test_guest_qr_is_static_route_without_auth_ticket_contract(self):
        contract=(ROOT / 'hbnf-wow-backend-prep' / 'contracts' / 'backend-apis.md').read_text()
        self.assertIn('{cart_origin}/guest/{cartId}',contract)
        self.assertIn('no email, account creation, visible login',contract.lower())
        self.assertNotIn('one-use QR',contract)

if __name__=='__main__': unittest.main()
