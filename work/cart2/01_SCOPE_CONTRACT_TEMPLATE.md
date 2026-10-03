# HBNF Cart 2.0 — Scope Contract Template

STATUS: NOT LOCKED. No implementation authority.

## Contract rule
Every item moved into COMMITTED is part of the release. It may not be silently removed, simplified, substituted, or deferred. Any change requires explicit user approval.

## Candidate release bundles

### A. Experience / Vibe Engine
Candidate target:
- guest-facing, intuitively named Vibes rather than opaque scene names;
- candidate initial set: Chill, Groove, Psychedelic, Heavy, Cosmic, Auto;
- each Vibe must have a visibly distinct visual grammar, palette behavior, density/negative-space behavior, transition behavior, and audio-response style;
- existing good animation kernels may be reused as donor primitives;
- two Vibes that are not reliably distinguishable in unlabeled viewing do not satisfy the scope;
- Auto may classify musical characteristics (energy, bass dominance, transient density, spectral brightness/dynamics) but must not depend on genre recognition or internet metadata.

Scope-lock questions:
- exact Vibe count/names;
- whether Auto ships in first release;
- whether time-of-day modulation ships in first release.

### B. Audio Expression Engine
Candidate target:
- reuse existing WLED AudioReactive data; no redundant FFT unless profiling proves a need;
- shared derived feature layer such as bass pressure, bass transient, mid body, high detail, spectral brightness/change, short/medium/slow energy;
- scene/Vibe-specific mappings;
- multi-timescale response;
- strong audio causality without generic flash/rainbow behavior;
- quiet passages remain visually alive;
- loud passages preserve composition and negative space;
- Matrix and AUX remain coherent;
- no new cloud/network dependency in realtime audio/render loop.

### C. Moment / Text Compositor
Candidate target:
- text must be visually integrated into the active Vibe, not replace it with a generic marquee;
- short cinematic text moments for names, ACE, winner, amounts, distances, timers, team/bag-tag reveals;
- stable readable glyph geometry while underlying scene remains reactive;
- Vibe-aware reveal/hold/dissolve styles;
- phrase paging preferred over ugly continuous marquee for longer content;
- scrolling remains fallback only when unavoidable;
- custom bitmap font(s) permitted if needed for 32x16 quality.

Hard acceptance rule:
Text does not ship if it looks visibly cheaper/jankier than the surrounding animation system.

### D. Directive Disc-Golf Game Engine
Candidate target:
Only modes where the cart materially improves the real-world experience by:
- randomizing/directing the next location/action;
- enforcing cadence/countdown;
- presenting and preserving changing sequences;
- producing synchronized visual/audio cues;
- reducing, not increasing, manual bookkeeping.

Mature candidate first modes:
- Shuffle Call
- Pressure Clock
- Sequence Run

Challenger-only:
- Rapid Fire, only if physical testing proves the cart adds meaningful value beyond a normal timer/metronome.

Current non-candidates unless later explicitly revived:
- scorekeeping-heavy ladders;
- Around-the-World tracking;
- Knockout/elimination tracking;
- repeated make/miss logging;
- generic CTP/result logging;
- generic trick-shot/challenge-generator filler.

### E. Digital Arcade Runtime
Candidate target:
- recognizable/nostalgic;
- stable;
- appropriate to 32x16;
- iPad/phones primary controls;
- shared runtime/menu/input/high-score/lifecycle infrastructure.

Candidate first pack:
- maze-chase game inspired by classic Pac-Man mechanics, with original assets/naming unless licensing is cleared;
- Snake
- Pong
- Breakout
- falling-block puzzle
- Space-Invaders-style shooter
- Frogger-style crossing game

Exact first-release pack requires scope lock after feasibility audit.

### F. iPad / Guest Experience
Candidate target:
- iPad-first owner Mission Control with LIVE / PLAY / GUESTS / HEALTH and separated ADMIN;
- separate phone-friendly Guest Platform;
- intuitive Vibe cards with plain-language description;
- short-lived capability-scoped guest authority that fails closed while stale/unknown/revoked;
- normalized ControllerInput for games rather than browser/gamepad-specific codes in game logic;
- event/game participation without admin/network/firmware/recovery privileges;
- guest PWA/service-worker isolation from owner/admin routes;
- local-first operation.

### G. Reliability / Platform
Candidate target:
- accepted OTA/rollback path preserved;
- self-healing/reconnect where bounded and testable;
- human-readable service/preflight screen;
- session diagnostics sufficient to avoid routine Terminal/LuCI troubleshooting;
- no realtime cloud dependency;
- no regression to boot, Matrix/AUX coherence, control latency, or accepted audio behavior.

### H. Physical Convenience
Candidate target:
- reduce repetitive box-opening/power-bank reconnection if feasible without destabilizing electrical reliability;
- this is not permitted to block software Experience Engine work;
- no new power architecture is assumed until hardware/power audit proves it safe and worthwhile.

## Explicit exclusions
To be filled before lock. Nothing omitted here may be inferred as approved.

## COMMITTED SCOPE
EMPTY UNTIL USER APPROVAL.
