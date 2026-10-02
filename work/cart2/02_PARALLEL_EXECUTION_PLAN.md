# HBNF Cart 2.0 — Parallel Execution Plan

## Rule
Parallelize independent work; serialize only where a real dependency exists.

## Frozen interfaces to define before coding

### AudioFeatures
Producer: audio-analysis layer
Consumers: Vibe renderer, compositor, optional event animation
Must be independent of UI/network.

### VisualMoment
Producer: event/game/controller layers
Consumer: compositor
Examples: ACE, PLAYER_NAME, WINNER, DISTANCE, TIMER, TEAM_REVEAL, BAG_TAG_REVEAL.

### VibeSelection
Producer: iPad/guest UI or Auto selector
Consumer: renderer
Contains stable ID + parameter profile, not direct implementation details.

### GameState / GameDirective
Producer: game engine
Consumers: Matrix renderer, iPad/guest UI, sound cues.

### HealthState
Producer: platform/reliability
Consumer: Mission Control/service UI.

## Parallel lanes

### Lane A — Visual + Audio
Owns:
- derived AudioFeatures;
- Vibe profiles;
- visual donor-kernel selection;
- transitions;
- render performance.

May not change:
- network architecture;
- OTA contract;
- game state model;
- guest authorization.

### Lane B — Text / Moments
Owns:
- typography;
- glyph/font assets;
- reveal/hold/dissolve compositor;
- VisualMoment rendering.

May not change:
- base Vibe renderer semantics;
- audio capture/FFT;
- event databases.

### Lane C — Games
Owns:
- directive-game state machines;
- arcade runtime;
- controls abstraction;
- sound cues;
- game-specific rendering adapters.

May not change:
- OTA/network architecture;
- normal visual renderer behavior outside Game Mode.

### Lane D — iPad / Guest UX
Owns:
- Mission Control experience;
- Vibe selection;
- guest join/permission UI;
- game controllers/views;
- service-status presentation.

### Lane E — Reliability / Integration
Owns:
- OTA/rollback;
- source identity;
- boot/recovery;
- health/diagnostics;
- cross-lane integration gates.

## Worktree rule
After scope lock, each lane gets its own isolated worktree/branch from the same accepted integration commit.

No lane edits another lane's owned files without:
1. interface-change proposal;
2. regression review;
3. integration-lane approval.

## Integration order
1. accepted baseline + interfaces
2. lane-local host tests/simulations
3. integration candidate
4. deterministic build/package
5. no-flash regression review
6. one physical candidate install
7. health + functional + visual acceptance
8. accept/freeze or rollback

## Efficiency rule
Do not repeatedly flash hardware during normal lane development. Use host replay, frame capture, mocked APIs, and source tests until a physical characteristic genuinely needs the cart.
