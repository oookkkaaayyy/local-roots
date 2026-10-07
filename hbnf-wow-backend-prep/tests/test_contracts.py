import json, pathlib, sys, unittest
ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'hbnf-wow-backend-prep' / 'backend'))
from guest_capabilities import GuestCapabilities, GuestCapabilityStore, ALLOWED_SCOPES
from aux_uv_policy import Mode, UVConfig, UVState, next_output, wled_state_patch

class Clock:
    def __init__(self): self.now = 1000
    def __call__(self): return self.now
    def advance(self, n): self.now += n

class GuestTests(unittest.TestCase):
    def setUp(self):
        self.clock=Clock(); self.store=GuestCapabilityStore()
        self.svc=GuestCapabilities(self.store, enabled=True, clock=self.clock, max_lifetime_s=600, max_uses=20, max_requests_per_window=2)
    def issue(self, scopes={'vibe.select'}):
        return self.svc.issue(owner_id='owner',cart_id='cart',scopes=scopes,requested_lifetime_s=500,owner_enabled=True)
    def test_disabled_by_default_and_owner_opt_in(self):
        svc=GuestCapabilities(GuestCapabilityStore(),clock=self.clock)
        with self.assertRaises(PermissionError): svc.issue(owner_id='o',cart_id='c',scopes={'vibe.select'},owner_enabled=True)
        with self.assertRaises(PermissionError): self.svc.issue(owner_id='o',cart_id='c',scopes={'vibe.select'},owner_enabled=False)
    def test_opaque_token_not_stored_and_scope_is_narrow(self):
        token=self.issue({'vibe.select','moment.submit'})
        self.assertNotIn(token, repr(self.store._sessions))
        self.svc.authorize(token,cart_id='cart',scope='vibe.select')
        with self.assertRaises(PermissionError): self.svc.authorize(token,cart_id='cart',scope='device.manage')
        with self.assertRaises(PermissionError): self.svc.authorize(token,cart_id='cart',scope='vibe.select',owner_override_active=True)
        with self.assertRaises(ValueError): self.issue({'admin'})
    def test_binding_ttl_reconnect_and_immediate_revocation(self):
        token=self.issue(); session=self.svc.reconnect(token,cart_id='cart')
        self.assertEqual(session.expires_at,1500)
        with self.assertRaises(PermissionError): self.svc.reconnect(token,cart_id='other')
        self.assertTrue(self.svc.revoke(token))
        with self.assertRaises(PermissionError): self.svc.authorize(token,cart_id='cart',scope='vibe.select')
    def test_expiry_and_rate_limit(self):
        token=self.issue(); self.svc.authorize(token,cart_id='cart',scope='vibe.select'); self.svc.authorize(token,cart_id='cart',scope='vibe.select')
        with self.assertRaises(PermissionError): self.svc.authorize(token,cart_id='cart',scope='vibe.select')
        self.clock.advance(501)
        with self.assertRaises(PermissionError): self.svc.reconnect(token,cart_id='cart')
    def test_unknown_or_empty_capabilities_rejected(self):
        for scopes in [set(), {'release.manage'}, {'vibe.select','network.manage'}]:
            with self.assertRaises(ValueError): self.issue(scopes)

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

if __name__=='__main__': unittest.main()
