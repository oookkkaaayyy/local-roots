# HBNF Cart 2.0 — Decision-Ready Scope-Lock Packet Draft

STATUS: PREPARED / NOT APPROVED / NO IMPLEMENTATION AUTHORITY.

Purpose: collapse the current source-independent product work into the smallest future user decision set without asking the user to decide technical facts that must be measured first.

This packet does NOT lock scope. Silence is not approval.

## A. Product choices that are mature enough to present later

### 1. Vibes

Current candidate manual Vibes:
- CHILL — smooth / spacious / low-key
- GROOVE — rhythmic / flowing / beat-driven
- HEAVY — dark / powerful / bass-forward
- PSYCHEDELIC — kaleidoscopic / saturated / warped
- COSMIC — deep / atmospheric / spatial

AUTO remains a separate candidate behavior:
- local-only;
- long dwell/hysteresis;
- no genre-recognition claim;
- manual selection overrides it.

Before user approval, the five manual Vibes must survive the prepared pairwise challenger protocol:
- unlabeled same-track comparisons;
- palette-normalized/grayscale challenge where practical;
- cross-track identity;
- synthetic audio-causality replay.

If a pair is redundant before scope lock, redesign or present that redundancy to the user. Do not silently collapse the set.

Future user choice:
- commit the five manual Vibes;
- decide whether AUTO is first-release scope after its behavior is demonstrated.

### 2. IRL interactive modes

Mature candidate set:
- SHUFFLE CALL
- PRESSURE CLOCK
- SEQUENCE RUN

All three share one Directive Engine and target zero ongoing input during normal timed operation.

RAPID FIRE remains challenger-only. Commit it only if physical testing shows synchronized Matrix/audio cadence materially improves the experience over an ordinary timer/metronome.

Current non-candidates:
- scorekeeping-heavy ladders;
- Around-the-World tracking;
- knockout/elimination tracking;
- repeated make/miss logging;
- generic trick-shot generator;
- generic CTP/result logging.

Future user choice:
- approve/reject the three mature candidates;
- decide Rapid Fire only after physical usefulness evidence exists.

### 3. Digital Arcade

Candidate set:
- Maze Chase
- Snake
- Pong
- Breakout
- Falling Blocks
- Space Defense
- Crossing

Shared requirements:
- one arcade runtime;
- normalized semantic input;
- phone/iPad touch controls baseline;
- exact normal-visual-state restoration on exit where required;
- no separate hardware architecture per game.

Public ESP32 matrix projects establish that these mechanics can exist on small displays, but do NOT establish that all seven fit HBNF's final firmware/resource budget alongside audio, DDP, text, networking and recovery.

Future user choice:
- desired first-release game set.
Technical commitment remains conditional on the accepted-foundation capacity audit. A failed capacity condition must return to the user with evidence/options; it is not permission to silently remove an approved game.

### 4. Physical gamepad support

Candidate status: OPTIONAL UNTIL TARGET-DEVICE VALIDATION.

Architecture is already prepared so browser/gamepad-specific mappings stay outside game logic.

Required before commitment:
- actual target controller + browser mapping;
- disconnect/reconnect behavior;
- end-to-end playability/latency measurement;
- no game depends on controller-specific haptics or nonstandard buttons.

MDN notes that Gamepad features vary by controller/platform and exposes a standard-mapping indicator, supporting this validation-first approach.

Future user choice:
- COMMITTED physical-controller support;
- OPTIONAL enhancement after validation;
- touch-only first release.

### 5. Premium text / moments

Candidate classes:
- HERO WORD
- NAME
- NUMBER / VALUE
- DIRECTIVE
- SHORT ANNOUNCEMENT
- LONG FREE TEXT

Binding candidate behavior if approved:
- stable glyph geometry while reading;
- Vibe-aware compositing;
- phrase paging before scrolling;
- marquee only as last-resort long-text fallback;
- return-to-base-state verification;
- human readability/aesthetic acceptance.

Current directive replay corpus:
- 25 FT
- STATION 4
- READY
- GO
- REST
- NEXT UP
- ACE
- WINNER
- $187
- player/team names
- BACK 9
- ACE POT

Future user choice:
- whether guest-entered SHORT TEXT is permitted at all and under what owner permission.
Owner-entered text remains a separate owner capability.

### 6. Owner Mission Control

Candidate information architecture:
- LIVE
- PLAY
- GUESTS
- HEALTH
- ADMIN

Intent:
- LIVE = routine course controls;
- PLAY = Arcade + IRL sessions;
- GUESTS = open/close/revoke capability-scoped guest sessions;
- HEALTH = understandable operational status;
- ADMIN = pairing, firmware/recovery/network/advanced diagnostics.

ADMIN is deliberately separated from normal course use.

Future user choice:
- approve/refine the primary navigation labels/grouping;
- decide whether persistent Matrix/AUX brightness belongs directly on LIVE or a compact quick panel.

### 7. Guest Platform

Product direction is already clear:
- separate guest surface from owner Mission Control;
- public branded shell;
- never blank;
- default closed;
- short-lived capability-scoped sessions;
- owner can revoke;
- no firmware/recovery/router/admin authority.

Candidate grantable capabilities:
- VIEW_STATUS
- SELECT_VIBE
- CONTROL_ARCADE
- JOIN_IRL_SHUFFLE
- JOIN_IRL_PRESSURE
- JOIN_IRL_SEQUENCE
- SEND_APPROVED_MOMENT
- SEND_SHORT_TEXT

Current staging source is NOT ready for backend connection or production deployment.
Known blockers are preserved in:
`evidence/hbnf-phase2-migration-20261003/GUEST_STAGING_AUDIT_20261003.json`

They include:
- capability UI fail-open behavior;
- unresolved mutation proof/session exchange;
- overly broad guest service-worker/PWA scope;
- generic GET caching/fallback that is inappropriate for fresh session authority.

Future user choice:
- whether SEND_APPROVED_MOMENT is allowed;
- whether SEND_SHORT_TEXT is allowed;
- desired max guest-controller concurrency if product preference matters after capacity/UX testing.

## B. Technical facts that MUST be measured before final commitment

Do not ask the user to guess these:
- exact release07 failure classes/shared primitives;
- exact corrected-foundation performance headroom;
- memory/resource budget for simultaneous Cart 2.0 systems;
- exact final AudioFeatures implementation;
- per-feature frame-time/resource budgets;
- all-seven Arcade simultaneous feasibility;
- exact controller latency threshold;
- exact local API bindings;
- renderer ownership/file boundaries;
- whether any dependency/toolchain upgrade is actually needed;
- exact service-worker deployment path/origin mechanics.

## C. Foundation gate before feature implementation

No firmware-dependent Phase 2 feature implementation begins until:
1. packet 20 completes the release07 source identity + 28-kernel diagnostic sweep;
2. packet 21 creates one measured class-level forward fix;
3. one corrected candidate is built/installed/basic-health passed;
4. packet 22 passes complete foundation qualification;
5. exact artifact becomes PHASE 2 FOUNDATION — QUALIFIED.

## D. Scope-lock output format

When the remaining technical facts are known, present the user one short approval packet with only:

### COMMIT
Exact first-release product features.

### EXCLUDE
Items the user explicitly does not want in first release.

### CONDITIONAL COMMIT
User-approved product requirements whose implementation depends on a stated measured technical condition.
A failed condition triggers an evidence-backed change request, not silent deletion.

### ACCEPTANCE
Exact human + automated acceptance criteria.

### USER-ONLY CHOICES
Only decisions that genuinely reflect preference/value rather than missing engineering evidence.

## E. Current source-independent conclusion

The project no longer needs broad ideation before scope lock.

The remaining path is:
- finish foundation diagnosis/qualification;
- close the known guest security/isolation blockers before backend/deployment;
- perform source/capacity audits;
- present only the narrowed product choices above for explicit approval;
- freeze interfaces;
- begin parallel implementation.

No additional governance framework is required.
