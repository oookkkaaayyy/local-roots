"""Offline reference policy for short-lived QR guest capabilities.

This module deliberately has no HTTP, database, QR encoder, or device-control
wiring. The production adapter must bind these policies to the existing Cart
session/auth store and mutation handlers.
"""
from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import secrets
import time
from typing import Callable, FrozenSet, Mapping

ALLOWED_SCOPES = frozenset({"vibe.select", "moment.submit", "game.join"})
FORBIDDEN_SCOPES = frozenset({"admin", "release.manage", "device.manage", "network.manage"})


@dataclass(frozen=True)
class GuestSession:
    token_digest: str
    owner_id: str
    cart_id: str
    scopes: FrozenSet[str]
    created_at: int
    expires_at: int
    revoked_at: int | None = None
    nonce: str = ""


class GuestCapabilityStore:
    """Replaceable storage seam; reference implementation is process-local."""
    def __init__(self) -> None:
        self._sessions: dict[str, GuestSession] = {}

    def put(self, session: GuestSession) -> None:
        self._sessions[session.token_digest] = session

    def get(self, token_digest: str) -> GuestSession | None:
        return self._sessions.get(token_digest)

    def revoke(self, token_digest: str, at: int) -> bool:
        current = self._sessions.get(token_digest)
        if current is None:
            return False
        self._sessions[token_digest] = GuestSession(**{**current.__dict__, "revoked_at": at})
        return True


class GuestCapabilities:
    def __init__(self, store: GuestCapabilityStore, *, enabled: bool = False,
                 clock: Callable[[], float] = time.time, max_lifetime_s: int = 3600,
                 max_active_per_cart: int = 12, max_uses: int = 120,
                 max_requests_per_window: int = 12, rate_window_s: int = 60) -> None:
        if max_lifetime_s < 60 or max_lifetime_s > 86400:
            raise ValueError("max_lifetime_s must be between 60 and 86400")
        self.store, self.enabled, self.clock = store, enabled, clock
        self.max_lifetime_s, self.max_active_per_cart, self.max_uses = max_lifetime_s, max_active_per_cart, max_uses
        self.max_requests_per_window, self.rate_window_s = max_requests_per_window, rate_window_s
        self._uses: dict[str, int] = {}
        self._request_times: dict[str, list[int]] = {}

    def issue(self, *, owner_id: str, cart_id: str, scopes: set[str],
              requested_lifetime_s: int = 900, owner_enabled: bool = False) -> str:
        if not self.enabled or not owner_enabled:
            raise PermissionError("guest access is disabled")
        if not owner_id or not cart_id or not scopes or not scopes <= ALLOWED_SCOPES:
            raise ValueError("invalid identity or unsupported capability scope")
        now = int(self.clock())
        live = [s for s in self.store._sessions.values() if s.cart_id == cart_id and s.revoked_at is None and s.expires_at > now]
        if len(live) >= self.max_active_per_cart:
            raise PermissionError("guest session capacity reached")
        token = secrets.token_urlsafe(32)
        digest = sha256(token.encode("ascii")).hexdigest()
        ttl = min(max(60, int(requested_lifetime_s)), self.max_lifetime_s)
        self.store.put(GuestSession(digest, owner_id, cart_id, frozenset(scopes), now, now + ttl, nonce=secrets.token_urlsafe(12)))
        self._uses[digest] = 0
        return token

    def authorize(self, token: str, *, cart_id: str, scope: str, owner_override_active: bool = False) -> GuestSession:
        if not self.enabled:
            raise PermissionError("guest access is disabled")
        digest = sha256(token.encode("utf-8")).hexdigest()
        session = self.store.get(digest)
        now = int(self.clock())
        if not session or session.revoked_at is not None or session.expires_at <= now:
            raise PermissionError("guest capability is invalid or expired")
        if owner_override_active:
            raise PermissionError("owner override has priority")
        if session.cart_id != cart_id or scope not in session.scopes or scope in FORBIDDEN_SCOPES:
            raise PermissionError("guest capability does not grant this action")
        if self._uses.get(digest, 0) >= self.max_uses:
            raise PermissionError("guest request limit reached")
        recent = [t for t in self._request_times.get(digest, []) if t > now - self.rate_window_s]
        if len(recent) >= self.max_requests_per_window:
            raise PermissionError("guest rate limit reached")
        recent.append(now)
        self._request_times[digest] = recent
        self._uses[digest] = self._uses.get(digest, 0) + 1
        return session

    def revoke(self, token: str) -> bool:
        digest = sha256(token.encode("utf-8")).hexdigest()
        return self.store.revoke(digest, int(self.clock()))

    def reconnect(self, token: str, *, cart_id: str) -> GuestSession:
        """Reconnect revalidates the same capability; it never refreshes TTL."""
        return self._valid_session(token, cart_id)

    def _valid_session(self, token: str, cart_id: str) -> GuestSession:
        if not self.enabled:
            raise PermissionError("guest access is disabled")
        s = self.store.get(sha256(token.encode("utf-8")).hexdigest())
        if not s or s.cart_id != cart_id or s.revoked_at is not None or s.expires_at <= int(self.clock()):
            raise PermissionError("guest capability is invalid or expired")
        return s
