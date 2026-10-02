# HBNF Cart 2.0 — Acceptance Matrix Draft

STATUS: DRAFT FOR SCOPE LOCK. Thresholds that require measurement are baseline-relative until the accepted current build is profiled.

## Global non-regression
Every shipped feature must preserve:
- local-first control and rendering;
- Matrix/AUX coherence;
- accepted boot/reconnect behavior;
- accepted OTA/rollback behavior;
- iPad compatibility;
- no new cloud dependency in the realtime path;
- no material frame-pacing regression vs accepted baseline;
- no material control-latency regression vs accepted baseline;
- no unexplained heap/flash regression;
- no increase in routine user troubleshooting.

## Visual / Vibe acceptance
Each committed Vibe must:
- be recognizable from its motion/composition/audio behavior, not merely its name or palette;
- be distinguishable from every other committed Vibe in unlabeled A/B clips;
- preserve negative space and avoid full-screen random/static visual soup unless intentionally scoped;
- maintain long/non-obvious novelty;
- produce clearly different musical performances from different reference tracks;
- show meaningful bass/mid/high separation without generic frequency-to-color mapping;
- stay visually compelling during silence/quiet passages;
- avoid saturation/brightness flattening during loud passages.

Human visual acceptance is mandatory; automated metrics may reject regressions but may not declare aesthetic acceptance.

## Audio-expression acceptance
Reference corpus must include:
- sparse sub/bass-heavy material;
- dense rock;
- vocal/mid-forward material;
- electronic build/drop;
- ambient/quiet material;
- rapid percussion/high-frequency material;
- acoustic/dynamic material;
- synthetic kick, bass sweep, mid sweep, high sweep, transient burst, silence.

For each Vibe:
- bass, mids, and highs must affect meaningfully different visual dimensions;
- short, medium, and slow response times must coexist where artistically appropriate;
- no sensitivity babysitting should be required across ordinary playback material;
- Motion remains authoritative as scoped;
- audio may modulate the art but may not replace it with generic overlays.

## Text / Moment acceptance
- short text must be readable at cart viewing distance;
- glyph geometry remains stable during the readable hold;
- reveal/dissolve must visually inherit the active Vibe;
- underlying scene may remain reactive while text is displayed;
- long text uses paging/phrasing where feasible;
- generic marquee is fallback only;
- if the text treatment looks visibly cheaper/jankier than the surrounding visuals, it fails.

## IRL game acceptance
A mode ships only if the cart:
- issues useful directives/timers/sounds/progression;
- remembers genuinely cumbersome state;
- reduces or does not materially increase manual bookkeeping;
- can recover/resume from accidental UI interruption;
- has a clear end condition and score/progression state.

## Digital game acceptance
- recognizable core mechanic;
- stable frame pacing;
- deterministic restart;
- phone/iPad controls are usable at expected LAN latency;
- game mode does not corrupt normal visual/controller state;
- exiting game restores the prior visual state cleanly;
- commercial names/assets are not copied unless licensing permits.

## Guest UX acceptance
A first-time card mate must be able to:
- understand what each Vibe means without prior explanation;
- join through the intended local flow;
- make only explicitly permitted selections/actions;
- never reach firmware/network/admin controls.

## Reliability acceptance
- cold boot;
- Matrix autonomous startup;
- AUX/DDP restoration;
- offline normal operation;
- iPad reconnect/lock-wake;
- bounded recovery after temporary component/network loss;
- session diagnostics identify which major component/path failed;
- OTA failure preserves or restores known-good state.

## Build/update efficiency acceptance
- lane-local work can be host-tested before flashing;
- tuning-only changes should be data/profile-driven where technically sound;
- firmware rebuilds are reserved for renderer/audio/platform code changes;
- one integrated physical candidate is preferred over serial intermediate flashes;
- every new failure mode discovered becomes a regression test, package correction, or runbook step.
