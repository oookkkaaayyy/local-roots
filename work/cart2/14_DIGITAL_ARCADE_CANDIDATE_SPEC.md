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
