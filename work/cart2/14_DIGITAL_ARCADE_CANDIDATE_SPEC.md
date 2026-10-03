# HBNF Cart 2.0 — Digital Arcade Candidate Spec

STATUS: CANDIDATE FOR SCOPE LOCK. NOT YET APPROVED.

## Governing requirements
- recognizable/nostalgic core mechanic;
- stable on a 32x16 matrix;
- phones/iPad are primary controls;
- shared runtime/input/lifecycle;
- game HUD can live on phone/iPad to preserve matrix pixels;
- exiting restores prior visual state exactly;
- original names/assets unless licensing explicitly permits otherwise;
- no game may require a separate hardware architecture.

## Evidence
Public ESP32 projects already demonstrate:
- Snake, Tetris, Pong, Breakout, Space Invaders, Frogger on 16x16 LED matrices;
- simplified Pac-Man/maze-chase on ESP32;
- web-controlled Snake/Pac-Man on a 16x16 ESP32 LED matrix.
This supports feasibility of the mechanics, not automatic compatibility with the HBNF runtime. Final inclusion still depends on accepted-source capacity audit.

## Shared Arcade Runtime

### Runtime states
ATTRACT -> MENU -> READY -> PLAY -> PAUSE -> GAME_OVER -> RESTART/EXIT

### Inputs
Phone/iPad web controller:
- directional pad
- primary action
- secondary action only where necessary
- pause
- exit

### Network behavior
- local HBNF-Cart LAN only;
- input protocol optimized for tiny state messages;
- input sequence/age checked so stale commands do not replay;
- temporary controller disconnect pauses or safely holds state rather than corrupting game state.

### Display
Matrix prioritizes game playfield.
Phone/iPad may show:
- score
- lives
- next piece
- pause/restart/exit
- player identity

### Lifecycle
Before entering game:
- snapshot current Vibe/brightness/Motion/audio/visual state.

On clean exit:
- restore snapshot exactly.

On crash/timeout:
- fail back to safe normal visual state.

## Game 1 — MAZE CHASE
Inspired by classic maze-chase mechanics; original assets/naming.

### Matrix layout
- landscape 32x16 playfield;
- one-pixel or compact sprites;
- maze designed specifically for 32x16 rather than downscaling arcade artwork;
- HUD offloaded to controller where possible.

### Core mechanics
- player navigates maze;
- pellets/objectives;
- small number of enemies with deterministic/simple AI;
- collision/lives;
- round clear.

### Controls
D-pad only.

### Challenger concerns
- enemy AI + maze readability must remain stable at 16 px height;
- do not attempt arcade-perfect Pac-Man;
- visual clarity matters more than feature completeness.

## Game 2 — SNAKE

### Matrix fit
Excellent.

### Controls
D-pad.

### Mechanics
- eat target;
- grow;
- wall/self collision;
- progressive speed;
- score/high score optional on controller.

Low implementation risk.

## Game 3 — PONG

### Matrix fit
Excellent.

### Modes
- solo vs simple AI;
- two-phone local multiplayer if latency tests pass.

### Controls
Up/down per paddle.

Low implementation risk.

## Game 4 — BREAKOUT

### Matrix fit
Excellent.

### Controls
Left/right.

### Mechanics
- paddle;
- ball;
- compact brick field;
- lives;
- level reset.

Low implementation risk.

## Game 5 — FALLING BLOCKS

### Matrix fit
Strong:
- 10x16 main board fits exactly in height;
- remaining width can remain decorative or hold minimal status if useful.

### Controls
left/right/down/rotate.

### Challenger concern
Do not waste Matrix width on text-heavy HUD. Use phone/iPad for score/next piece if needed.

## Game 6 — SPACE DEFENSE
Classic fixed-shooter mechanic with original assets/naming.

### Matrix fit
Strong.

### Controls
left/right/fire.

### Mechanics
- compact enemy formation;
- bullets;
- waves;
- lives.

## Game 7 — CROSSING
Classic lane-crossing mechanic with original assets/naming.

### Matrix fit
Feasible.

### Controls
D-pad.

### Mechanics
- moving hazards;
- target zones;
- escalating speed.

### Challenger concern
16-pixel height limits lane count; design native 32x16 board rather than shrinking arcade art.

## Candidate first-release scope
Recommended for capacity audit:
- Maze Chase
- Snake
- Pong
- Breakout
- Falling Blocks
- Space Defense
- Crossing

No reduction is implied. This is a candidate set before source-grounded capacity audit and user scope approval.

If all seven fit the accepted baseline without violating performance/reliability budgets, all seven should be committed together if the user approves them.

## 2026-10-03 challenger refinement

### Feasibility evidence — bounded conclusion
Public ESP32 projects demonstrate that tiny-matrix implementations of Snake, Tetris/Falling Blocks, Breakout, Pong, fixed shooters, Frogger-style crossing and related games are technically feasible on constrained displays. One current example runs ten games on a 16×16 LED grid with an ESP32 and a Stadia controller.

Evidence:
- https://github.com/zero7608/matrixgame

This is evidence for mechanic feasibility only. It does NOT prove that all seven candidates fit the HBNF firmware's final memory/frame-time budget alongside audio-reactive visuals, DDP, text, networking and recovery. Final commitment still waits for the accepted-foundation capacity audit.

### Normalized input contract
Every game consumes actions, not browser/controller-specific button numbers:
- UP
- DOWN
- LEFT
- RIGHT
- PRIMARY
- SECONDARY
- PAUSE
- EXIT

Touch controls are the baseline. Browser Gamepad support is optional behind the same adapter.

MDN documents the Gamepad API as broadly available but explicitly notes that feature support varies across platform/controller combinations. Therefore no candidate game may depend on a special controller mapping, haptics, or nonstandard button until the actual target devices pass mapping and playability tests.

Evidence:
- https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API
- https://developer.mozilla.org/en-US/docs/Web/API/Gamepad

### Input safety
Transport should carry:
- session/controller identity;
- monotonically increasing input sequence;
- input age/timestamp or equivalent stale-input guard.

Acceptance must reject:
- duplicate sequence replay;
- stale movement after reconnect;
- a disconnected controller continuing to influence state;
- one controller taking another player's role without an explicit reassignment path.

Do not freeze a numerical latency threshold before measuring the accepted local stack. Measure end-to-end input-to-game-state latency on the actual iPad/phone/gamepad paths, then freeze a threshold that preserves responsive play.

### Deterministic game invariants
Minimum replay assertions where applicable:
- Snake: one movement decision per game tick; illegal immediate reversal cannot self-kill through input ordering.
- Pong: ball/paddle collision outcome deterministic for the same state/input trace.
- Breakout: one collision cannot delete multiple unrelated bricks due to a single-tick bug.
- Falling Blocks: piece movement/rotation is deterministic; board bounds and lock state are invariant.
- Maze Chase: maze/objective layout is native 32×16 and remains readable; enemy state cannot occupy invalid wall cells.
- Space Defense: projectile/enemy ownership and collision resolution are deterministic.
- Crossing: hazards advance deterministically and player cannot occupy out-of-bounds lanes.

### Snapshot/restore contract
Entering PLAY snapshots every normal-state field required to reproduce what the user was seeing, including at minimum the final accepted representation of:
- Vibe/scene;
- brightness;
- Motion/audio controls;
- active look/palette state;
- normal overlay/moment return state.

Clean EXIT must restore that snapshot exactly.
Crash/disconnect timeout must fall back to a safe normal visual state, with evidence indicating whether exact restoration was possible.

### Candidate soak
Each committed digital game must survive a repeated start/pause/reconnect/restart/exit cycle plus a 20+ minute play soak where appropriate before release acceptance.

## Existing physical-controller evidence

AKS current HBNF handoff records two Stadia Bluetooth controllers already on hand for future games. Do not buy another controller merely to satisfy the Arcade candidate.

Google's Stadia support documentation states that Bluetooth-mode Stadia controllers can operate as standard wireless Bluetooth controllers, but also states compatibility with other platforms/services was not extensively tested; Google's tested platform list did not include iPadOS. No further Stadia Controller firmware updates are expected.

Browser evidence:
- Gamepad API is supported by Safari on iOS versions covering the iPad mini 2 era, but controller/platform feature support can still vary.
- `Gamepad.mapping` must be inspected rather than assuming a standard layout.

Therefore the physical-controller gate is:
1. pair each existing Stadia Bluetooth controller to the actual target iPad/device;
2. verify the browser exposes it through `navigator.getGamepads()`;
3. record `id`, `mapping`, axes and buttons;
4. establish the semantic action map;
5. test disconnect/reconnect and index reuse;
6. measure actual playability/latency on HBNF-Cart;
7. keep touch controls fully usable regardless.

No haptics, Stadia Assistant/Capture buttons, or controller firmware update may be a first-release dependency.

Evidence:
- https://support.google.com/stadia/answer/13067284
- https://developer.mozilla.org/en-US/docs/Web/API/Gamepad
- https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/mapping
- https://caniuse.com/gamepad

