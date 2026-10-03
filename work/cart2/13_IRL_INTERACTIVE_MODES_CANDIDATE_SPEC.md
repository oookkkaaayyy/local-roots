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

## 2026-10-03 challenger refinement

### Strongest mechanics remain low-input
Current external evidence reinforces Shuffle Call rather than expanding score-entry modes: dgputt's current SHUFFLE drill assigns a random distance on every throw specifically to train resetting between putts. That is evidence for randomized callouts as a useful training mechanic, not evidence that the cart should reproduce dgputt's scoring/logging.

Evidence:
- https://apps.apple.com/us/app/dgputt-disc-golf-putting/id1536711552
- https://play.google.com/store/apps/details?id=com.erlendjohnsen.dgputt

### SHUFFLE CALL refinement
Default randomization candidate:
- use a shuffle-bag over the selected stations/distances;
- every location appears once before reshuffle;
- prevent the final item of one bag from immediately repeating as the first item of the next where the set permits;
- REPEAT is an explicit owner/player action and does not alter the bag unless specified.

Reason: preserve unpredictability without accidental clusters that feel like a broken randomizer.

### PRESSURE CLOCK refinement
Candidate flow:
READY / settle -> active countdown -> expiry cue -> short recovery -> next cycle.

Required controls:
- pause/resume;
- restart current clock;
- skip/next;
- end.

A group interruption must not force a score/result entry. The timer pauses or restarts cleanly.

### SEQUENCE RUN refinement
A generated sequence is immutable for that run unless the user explicitly regenerates it.
- SHOW-ALL: preview entire sequence, then step through;
- MEMORY: preview then conceal;
- LIVE: reveal one step at a time.

Completion is a visual/audio moment only by default; no make/miss scoring is implied.

### Manual-input ceiling
Normal timed operation target: zero touches after START.
Manual-advance variant: at most one NEXT action per station/throw, and only if the user explicitly selected manual advance.

Any mode that requires repeated result entry must prove that the cart creates enough extra value to justify that burden before scope lock.

### Rapid Fire challenger test
Keep RAPID FIRE outside the recommended committed set unless physical testing shows the cart's synchronized Matrix/audio cadence is materially better than a normal timer/metronome. If not, reject it rather than shipping redundant functionality.

### Updated acceptance cases
For each recommended IRL mode:
- start with smallest valid station set;
- typical station set;
- pause/resume after an interruption;
- iPad lock/wake;
- controller reconnect;
- end/restart;
- no-input normal run;
- ensure no unintended immediate repeat in Shuffle Call;
- timer expiry and manual restart in Pressure Clock;
- exact sequence preservation across pause/resume in Sequence Run.

Tie/elimination and repeated make/miss-entry tests do not apply to these current recommended modes.



## Evidence boundary — do not overclaim training efficacy

Current motor-learning evidence does NOT justify marketing or designing Shuffle Call around a claim that randomized-distance practice is categorically superior.

Evidence is mixed:
- a 2024 systematic review/meta-analysis found high contextual interference/random practice benefited retention overall, but the benefit in applied settings was almost negligible;
- a companion 2024 transfer meta-analysis favored random practice overall, while the applied-setting effect was small and statistically non-significant;
- golf-putting studies are inconsistent: some report retention benefits from random/variable practice, while others found no random-over-blocked advantage for varying putting distances/parameters.

Therefore:
- treat randomized callouts as a legitimate practice format, not a proven best method;
- do not present the cart as improving putting skill because of contextual-interference science;
- the product case for Shuffle Call is concrete UX value: automatic unpredictable location calls, optional no-repeat bag randomization, timing/cues, and zero ongoing bookkeeping;
- allow the owner to choose cadence/locations rather than forcing a scientifically branded "optimal" schedule.

Evidence:
- https://pubmed.ncbi.nlm.nih.gov/38987617/
- https://pubmed.ncbi.nlm.nih.gov/39205981/
- https://pubmed.ncbi.nlm.nih.gov/28449601/
- https://pubmed.ncbi.nlm.nih.gov/8961310/
- https://pubmed.ncbi.nlm.nih.gov/34078209/
