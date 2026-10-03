# HBNF Cart 2.0 — IRL Interactive Modes Candidate Spec

STATUS: CANDIDATE FOR SCOPE LOCK. NOT YET APPROVED.

## Governing rule
Do not build an IRL mode merely because it can be digitized.

A mode qualifies only if the cart materially improves the live experience by doing something awkward to do manually:
- randomizing/directing the next action;
- enforcing cadence/countdown;
- presenting a changing sequence;
- managing timing;
- producing synchronized visual/audio cues;
- remembering nontrivial state WITHOUT forcing tedious result entry.

If the player must repeatedly enter MAKE/MISS or scores and the cart does not add a compelling interaction unavailable without it, reject the mode.

## Research-grounded observations
- dgputt's SHUFFLE assigns a random distance each throw specifically to prevent getting comfortable at one distance.
- dgputt and other putting tools include timed/speed-oriented practice, but score-entry-heavy drills are easier to run without the cart unless the display/cues materially add something.
- Community practice commonly uses random-number-generated distances to simulate changing on-course putts.
- Therefore random callout + timing/cueing are the strongest low-input mechanics for this cart.

## Candidate Mode 1 — SHUFFLE CALL

### Why the cart adds value
The cart continuously chooses the next distance/station and announces/displays it. A human otherwise has to use a phone/randomizer or decide the next spot.

### Setup
Owner defines a set once:
- DISTANCE SET: e.g. 10 / 15 / 20 / 25 / 30 / 35 ft
OR
- STATION SET: numbered physical markers already placed around basket

No per-putt result entry.

### Loop
1. Matrix displays next call prominently: e.g. 25 FT or STATION 4.
2. Optional short audio cue speaks/beeps.
3. Player putts.
4. After configurable dwell, cart calls next location automatically.
5. No score is tracked by default.

### Controls
- Start
- Pause
- Next now
- Repeat call
- End
- cadence selector: relaxed / normal / quick / custom seconds

### Anti-repetition
- avoid immediate repeat unless set only contains one option;
- optional "bag" randomization: each selected location appears once before reshuffle;
- optional weighted mode can emphasize longer/shorter distances, but first release should keep it simple unless user approves weighting.

### Display
- current call large
- subtle next-call transition
- active Vibe remains visible as background/compositor language
- no persistent scoreboard

### Input burden
Zero during normal run.

## Candidate Mode 2 — PRESSURE CLOCK

### Why the cart adds value
The cart creates an actual external shot clock with visible/audible pressure. Without the cart, someone must operate a timer.

### Setup
- fixed distance OR paired with Shuffle Call
- shot window: e.g. 10 / 15 / 20 / 30 sec
- optional pre-shot settle time

### Loop
1. Call appears.
2. Countdown begins.
3. Visual field progressively changes as time falls.
4. Audio cues at configurable thresholds (e.g. 5 sec / 3 sec / expiry).
5. Expiry produces clear but brief signal.
6. Next call begins automatically after recovery delay.

### Critical behavior
- countdown visualization must remain readable and not destroy the active Vibe;
- no MAKE/MISS input;
- no scorekeeping unless later explicitly approved.

### Input burden
Zero during normal run.

## Candidate Mode 3 — SEQUENCE RUN

### Why the cart adds value
The cart creates and presents a changing ordered sequence that is annoying to invent/remember manually.

### Setup
- owner selects available numbered stations/distances;
- sequence length: e.g. 4 / 6 / 8;
- presentation mode:
  - SHOW-ALL: whole sequence preview, then step through;
  - MEMORY: briefly show sequence, then reveal one step at a time;
  - LIVE: generate next location only after current dwell.

### Loop
1. Matrix reveals sequence in a visually clear way.
2. Cart steps through calls on timer or user taps NEXT only if desired.
3. End sequence produces completion moment.
4. No score/make tracking.

### Input burden
Zero in timed mode; one optional NEXT tap per station in manual-advance mode.

## Candidate Mode 4 — RAPID FIRE

### Why the cart adds value
The cart enforces rhythm and rest intervals, creating a structured cadence session without someone running a stopwatch.

### Setup
- one marked distance/station or Shuffle Call source
- work duration / rest duration
- rep cadence cue

### Loop
- READY cue
- repeated PUTT cue on cadence
- REST cue
- repeat blocks
- optional final countdown

### Important limitation
This is a cadence/training mode, not a score game. If testing shows the cueing is annoying or less useful than a normal timer, reject BEFORE scope lock.

## Rejected / not candidate scope
- Ladder scoring
- Around-the-World tracking
- Knockout/elimination tracking
- Perfect-Putt-style scoring
- CTP logging
- generic scorekeeping
- make/miss logging as the central mechanic
- stance callouts
- arbitrary trick-shot/challenge-generator fluff

These are easier without the cart or create unnecessary input burden.

## Scope-lock recommendation
The strongest first-release candidates are:
1. SHUFFLE CALL
2. PRESSURE CLOCK
3. SEQUENCE RUN

RAPID FIRE should remain challenger-only until the user decides whether cadence cueing is genuinely useful.

These can share one underlying Directive Engine:
- location source
- timer/cadence scheduler
- visual callout
- sound cue
- pause/resume
- session end

No separate plumbing per mode.
