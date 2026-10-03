# HBNF Cart 2.0 — Mission Control Candidate Spec

STATUS: CANDIDATE FOR SCOPE LOCK. NOT YET APPROVED. SOURCE-INDEPENDENT UX/CONTROL CONTRACT ONLY.

## Purpose
Turn the mounted iPad into one clear owner control surface without mixing high-frequency course controls with firmware/network/admin operations.

The existing owner controller remains useful source evidence, but its current single-page layout is not the final information architecture.

## Product split

### OWNER MISSION CONTROL
One owner application with five primary areas:
1. LIVE
2. PLAY
3. GUESTS
4. HEALTH
5. ADMIN

### GUEST PLATFORM
A separate capability-scoped guest product surface. It must not expose owner firmware, recovery, router/network, pairing-admin, or advanced tuning controls.

This split preserves one coherent owner app while preventing the guest experience from inheriting privileged controls.

## 1. LIVE — default owner landing surface

Goal: everything routinely used during a round should be reachable without entering an admin/debug surface.

Always visible:
- Matrix + AUX truth/connection state;
- current Vibe;
- ON / OFF;
- brightness summary;
- current active moment/game/session state when applicable.

Primary controls:
- Vibe cards;
- Motion;
- Audio Response;
- Energy;
- NEXT / AUTO where retained by final scope;
- saved looks;
- quick Moment/Text launcher;
- brightness.

Design rule:
- high-frequency course actions stay on LIVE;
- firmware/recovery/network/debug controls do not.

Touch targets for primary cart actions should be at least 44×44 CSS px where practical, consistent with WCAG enhanced target-size guidance.

## 2. PLAY

Contains two distinct groups.

### ARCADE
Candidate entries:
- Maze Chase
- Snake
- Pong
- Breakout
- Falling Blocks
- Space Defense
- Crossing

### IRL DIRECTIVES
Candidate entries:
- Shuffle Call
- Pressure Clock
- Sequence Run

Rapid Fire remains challenger-only unless later approved.

PLAY owns:
- start/configure/pause/resume/end;
- controller roster;
- session state;
- exact return-to-previous-visual-state behavior.

No game should force the user through owner tuning/admin screens.

## 3. GUESTS

Default state: CLOSED.

Owner can:
- open guest session;
- choose capabilities;
- set expiry;
- set max concurrent guests;
- show/share QR;
- see connected guest controllers;
- revoke one guest or close session immediately.

Candidate capability switches:
- VIEW_STATUS
- SELECT_VIBE
- CONTROL_ARCADE
- JOIN_IRL_SESSION
- SEND_APPROVED_MOMENT
- SEND_SHORT_TEXT

Owner-only capabilities that are never grantable:
- firmware/update/install;
- recovery/rollback;
- router/network administration;
- owner pairing administration;
- raw diagnostics/secrets;
- advanced audio calibration/tuning;
- topology/device identity changes.

Guest authority must be explicit, short-lived, revocable, and fail closed.

## 4. HEALTH

Human-readable operational status, not a raw debug console.

Top-level:
- Matrix: OK / DEGRADED / OFFLINE
- AUX: OK / DEGRADED / OFFLINE
- Cart LAN: OK / DEGRADED
- Internet: OPTIONAL / AVAILABLE / UNAVAILABLE
- current release identity
- restart/reconnect warning if present
- actionable recovery hint when a known condition has a safe owner action

Detailed telemetry may be expandable, but should not crowd LIVE.

The separate HBNF-Cart SSID cold-start issue remains an open reliability loop; HEALTH must report it if detectable without implying that it caused renderer FPS defects.

## 5. ADMIN

Owner-only, intentionally separated from routine use:
- pairing another owner device;
- signed update check;
- rollout preflight;
- firmware install handoff;
- recovery/rollback controls;
- advanced audio configuration;
- diagnostics/release evidence;
- router/network diagnostics where retained.

Destructive or release-changing operations require explicit confirmation/gate behavior defined by the release system; Mission Control must not bypass it.

## Navigation contract

- LIVE is the default launch route.
- LIVE, PLAY, GUESTS, HEALTH are one tap from persistent navigation.
- ADMIN is visually separated from routine tabs.
- Returning from PLAY or a Moment must restore the prior normal visual state exactly when the feature contract requires restoration.
- Lock/wake, temporary LAN loss, and controller reconnect must preserve understandable state.
- No route may turn into a blank screen when Matrix/AUX/WAN/Supabase is unavailable.

## Controller input abstraction

Arcade input is normalized before game logic:
- UP
- DOWN
- LEFT
- RIGHT
- PRIMARY
- SECONDARY
- PAUSE
- EXIT

Every input message carries:
- controller/session identity;
- monotonically increasing sequence;
- age/timestamp sufficient to reject stale replay where the implementation supports it.

Primary supported controls:
- iPad on-screen controls;
- phone guest controls.

Optional physical gamepad support may use the browser Gamepad API, but must remain behind this same action abstraction. Do not assume every controller/platform maps buttons, axes, or haptics identically. Physical controller inclusion requires target-device mapping and latency/playability acceptance.

## Guest join flow

1. Owner opens a guest session in GUESTS.
2. Mission Control displays the guest QR/share link.
3. Guest opens the public guest shell.
4. Off-cart or unavailable cart state remains visible and useful; no mutation authority exists.
5. On the permitted cart path, the guest resolves the short-lived session.
6. UI shows only granted capabilities.
7. Expiry/revocation immediately disables mutation and returns the guest to a safe closed/public state.

No owner credential is embedded in the guest URL.

## Acceptance candidates

### Course-use efficiency
- routine Vibe/brightness/Motion/audio/Moment actions require no ADMIN navigation;
- primary course controls have large touch targets suitable for a moving/jostled cart context;
- common live actions are not hidden behind nested menus.

### Separation
- guest bundle contains no owner/admin mutation route;
- firmware/recovery/network controls are not exposed in guest UI;
- ADMIN does not become the default owner landing screen.

### Resilience
- iPad lock/wake returns to a coherent state;
- LAN interruption disables mutation but preserves the shell;
- reconnect does not duplicate stale game/control input;
- guest revocation takes effect without cache clearing;
- normal visual state can be restored after game/moment exit.

### Input
- touch controls remain the baseline;
- any physical gamepad path is accepted only after target-device mapping and measured playability testing;
- unsupported/special gamepad features must not be prerequisites for a game.

## Evidence basis

- W3C target-size guidance: https://www.w3.org/WAI/WCAG21/Understanding/target-size
- MDN Gamepad API: https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API
- MDN PWA installability: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- Current project guest-platform contract: work/cart2/17_GUEST_PLATFORM_PRODUCT_CONTRACT.md
- Current owner controller source: hbnf-final-controller/hbnf-cart.html

## Scope-lock questions still requiring user approval

- final primary navigation labels;
- whether short guest text is enabled at all, and if so under what owner permission;
- whether physical gamepad support is COMMITTED or OPTIONAL after device validation;
- whether owner persistent Matrix/AUX brightness belongs directly on LIVE or in a compact quick panel;
- final set of Arcade and IRL modes after source/capacity audit.

No decision above is silently locked by this document.
