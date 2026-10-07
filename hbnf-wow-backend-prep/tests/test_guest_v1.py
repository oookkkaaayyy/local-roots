import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from guest_v1 import GuestSession, GuestV1, MAX_ACTIONS_PER_WINDOW


class Clock:
    now = 1000
    def __call__(self):
        return self.now


class SessionStore:
    def __init__(self): self.rows = {}; self.next_id = 1
    def create_guest_session(self, cart_id, expires_at):
        item = GuestSession(str(self.next_id), cart_id, expires_at)
        self.next_id += 1; self.rows[item.session_id] = item
        return item
    def get_guest_session(self, session_id): return self.rows.get(session_id)
    def expire_guest_sessions(self, cart_id):
        self.rows = {k:v for k,v in self.rows.items() if v.cart_id != cart_id}


class CartBackend:
    def __init__(self): self.enabled = False; self.override = False; self.actions = []
    def guest_mode_enabled(self, cart_id): return self.enabled
    def owner_override_active(self, cart_id): return self.override
    def dispatch_cart_action(self, cart_id, action, payload, *, actor):
        self.actions.append((cart_id, action, payload, actor)); return "accepted"


class GuestV1Tests(unittest.TestCase):
    def setUp(self):
        self.clock=Clock(); self.sessions=SessionStore(); self.cart=CartBackend()
        self.service=GuestV1(self.sessions,self.cart,clock=self.clock)

    def test_disabled_by_default_until_owner_mode_and_feature_gate_are_on(self):
        with self.assertRaises(PermissionError): self.service.connect("cart")
        self.service.enabled=True
        with self.assertRaises(PermissionError): self.service.connect("cart")
        self.cart.enabled=True
        session=self.service.connect("cart")
        self.assertEqual(self.service.status("cart",session.session_id)["connected"],True)

    def test_qr_cart_binding_and_expiry(self):
        self.service=GuestV1(self.sessions,self.cart,clock=self.clock,max_lifetime_s=4*60*60)
        self.service.enabled=True; self.cart.enabled=True
        session=self.service.connect("cart",requested_lifetime_s=999999)
        self.assertEqual(session.expires_at,self.clock.now+4*60*60)
        self.assertIsNone(self.service._session("other-cart",session.session_id))
        self.clock.now=session.expires_at
        with self.assertRaises(PermissionError): self.service.act("cart",session.session_id,"vibe",{"value":"chill"})

    def test_reconnect_keeps_existing_session_expiry(self):
        self.service.enabled=True; self.cart.enabled=True
        first=self.service.connect("cart",requested_lifetime_s=90)
        self.clock.now+=30
        again=self.service.connect("cart",first.session_id,requested_lifetime_s=3600)
        self.assertEqual(again.expires_at,first.expires_at)

    def test_guest_mode_off_expires_and_blocks_existing_session(self):
        self.service.enabled=True; self.cart.enabled=True
        session=self.service.connect("cart")
        self.cart.enabled=False
        with self.assertRaises(PermissionError): self.service.act("cart",session.session_id,"vibe")
        self.service.disable("cart")
        self.assertIsNone(self.sessions.get_guest_session(session.session_id))

    def test_owner_override_wins_and_guest_ui_actions_are_mediated(self):
        self.service.enabled=True; self.cart.enabled=True
        session=self.service.connect("cart")
        self.cart.override=True
        with self.assertRaises(PermissionError): self.service.act("cart",session.session_id,"vibe")
        self.cart.override=False
        self.assertEqual(self.service.act("cart",session.session_id,"vibe",{"value":"groove"}),"accepted")
        self.assertEqual(self.cart.actions[-1],("cart","vibe",{"value":"groove"},"guest"))

    def test_admin_or_unknown_actions_are_not_guest_ui_actions(self):
        self.service.enabled=True; self.cart.enabled=True
        session=self.service.connect("cart")
        for action in ("admin", "release", "device", "network", "raw_wled", ""):
            with self.subTest(action=action), self.assertRaises(PermissionError):
                self.service.act("cart",session.session_id,action,{})

    def test_repeated_taps_debounce_then_accept(self):
        self.service.enabled=True; self.cart.enabled=True
        session=self.service.connect("cart")
        self.service.act("cart",session.session_id,"vibe")
        with self.assertRaises(PermissionError): self.service.act("cart",session.session_id,"vibe")
        self.clock.now+=1
        self.service.act("cart",session.session_id,"vibe")
        self.assertEqual(len(self.cart.actions),2)

    def test_rate_limit_is_bounded(self):
        self.service.enabled=True; self.cart.enabled=True
        session=self.service.connect("cart")
        for i in range(MAX_ACTIONS_PER_WINDOW):
            self.clock.now+=1
            self.service.act("cart",session.session_id,"vibe",{"value":str(i)})
        with self.assertRaises(PermissionError): self.service.act("cart",session.session_id,"vibe",{"value":"overflow"})

    def test_wrong_or_expired_session_fails_closed(self):
        self.service.enabled=True; self.cart.enabled=True
        with self.assertRaises(PermissionError): self.service.act("cart","missing","vibe")


if __name__ == "__main__": unittest.main()
