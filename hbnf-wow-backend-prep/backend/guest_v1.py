"""Thin, fail-closed adapter for trusted-friends Guest V1.

The host application supplies its existing session store, owner-mode state,
and cart action dispatcher. This module intentionally creates no auth system,
database, device transport, or persistence layer of its own.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Optional, Protocol


@dataclass(frozen=True)
class GuestSession:
    session_id: str
    cart_id: str
    expires_at: int


class ExistingSessionStore(Protocol):
    """Adapter over the Cart's existing server-side session mechanism."""
    def create_guest_session(self, cart_id: str, expires_at: int) -> GuestSession: ...
    def get_guest_session(self, session_id: str) -> Optional[GuestSession]: ...
    def expire_guest_sessions(self, cart_id: str) -> None: ...


class ExistingCartBackend(Protocol):
    """Owner state and action entrypoints remain owned by the current backend."""
    def guest_mode_enabled(self, cart_id: str) -> bool: ...
    def owner_override_active(self, cart_id: str) -> bool: ...
    def dispatch_cart_action(self, cart_id: str, action: str, payload: dict[str, Any], *, actor: str) -> Any: ...


GUEST_ACTIONS = frozenset({
    "vibe", "open_mode", "game_action", "submit_moment",
})
MAX_LIFETIME_S = 4 * 60 * 60
DEFAULT_LIFETIME_S = 2 * 60 * 60
WINDOW_S = 60
MAX_ACTIONS_PER_WINDOW = 20
DEBOUNCE_S = 0.4


class GuestV1:
    """Policy adapter only; instantiate from the existing Cart backend."""
    def __init__(self, sessions: ExistingSessionStore, cart: ExistingCartBackend,
                 *, enabled: bool = False, clock: Callable[[], float],
                 max_lifetime_s: int = DEFAULT_LIFETIME_S) -> None:
        if max_lifetime_s < 60 or max_lifetime_s > MAX_LIFETIME_S:
            raise ValueError("guest session lifetime must be 60 seconds to 4 hours")
        self.sessions, self.cart, self.enabled = sessions, cart, enabled
        self.clock, self.max_lifetime_s = clock, max_lifetime_s
        self._recent: dict[str, list[tuple[int, str]]] = {}

    def status(self, cart_id: str, session_id: Optional[str]) -> dict[str, Any]:
        if not self._available(cart_id):
            return {"enabled": False, "connected": False}
        session = self._session(cart_id, session_id)
        if session is None:
            return {"enabled": True, "connected": False}
        return {"enabled": True, "connected": True, "expiresAt": session.expires_at}

    def connect(self, cart_id: str, session_id: Optional[str] = None,
                requested_lifetime_s: int = DEFAULT_LIFETIME_S) -> GuestSession:
        self._require_available(cart_id)
        existing = self._session(cart_id, session_id)
        if existing:
            return existing  # reconnect does not extend the round's expiry
        now = int(self.clock())
        lifetime = min(max(60, int(requested_lifetime_s)), self.max_lifetime_s)
        return self.sessions.create_guest_session(cart_id, now + lifetime)

    def disable(self, cart_id: str) -> None:
        """Call only after the existing owner-authorized mode switch is OFF."""
        self.sessions.expire_guest_sessions(cart_id)

    def act(self, cart_id: str, session_id: str, action: str,
            payload: Optional[dict[str, Any]] = None) -> Any:
        self._require_available(cart_id)
        session = self._session(cart_id, session_id)
        if not session:
            raise PermissionError("guest session is unavailable or expired")
        if action not in GUEST_ACTIONS:
            raise PermissionError("action is not part of the guest UI")
        if self.cart.owner_override_active(cart_id):
            raise PermissionError("owner action takes precedence")
        now = int(self.clock())
        recent = [(t, a) for t, a in self._recent.get(session_id, []) if t > now - WINDOW_S]
        if len(recent) >= MAX_ACTIONS_PER_WINDOW:
            raise PermissionError("guest actions are temporarily throttled")
        if recent and recent[-1][1] == action and now - recent[-1][0] < DEBOUNCE_S:
            raise PermissionError("duplicate guest tap was debounced")
        recent.append((now, action))
        self._recent[session_id] = recent
        # The host dispatcher must serialize against owner writes and safety state.
        return self.cart.dispatch_cart_action(cart_id, action, payload or {}, actor="guest")

    def _available(self, cart_id: str) -> bool:
        return self.enabled and self.cart.guest_mode_enabled(cart_id)

    def _require_available(self, cart_id: str) -> None:
        if not self._available(cart_id):
            raise PermissionError("guest mode is off")

    def _session(self, cart_id: str, session_id: Optional[str]) -> Optional[GuestSession]:
        if not session_id:
            return None
        session = self.sessions.get_guest_session(session_id)
        if not session or session.cart_id != cart_id or session.expires_at <= int(self.clock()):
            return None
        return session

