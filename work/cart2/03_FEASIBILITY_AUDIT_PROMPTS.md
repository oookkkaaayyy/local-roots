# HBNF Cart 2.0 — Codex Audit Prompts

These are READ-ONLY audit prompts. Run them after the current coordinated-release lane reaches a clean checkpoint. No source edits, deploys, flashes, merges, network changes, or GitHub Actions.

## Audit 1 — Platform capacity and source map
Goal:
Produce a source-grounded implementation-capacity report from the exact accepted source lineage.

Must determine:
- ESP32 target/chip/core/toolchain;
- flash/RAM/heap margins from real build evidence;
- renderer hot paths and frame budget;
- audio-data interfaces already available;
- current FastLED/ANIMartRIX/WLED versions and reusable primitives;
- DDP/AUX path;
- existing text/font/compositor code;
- current controller/PWA/guest primitives;
- OTA/rollback integration points;
- which values can be data/profile-driven vs require firmware rebuild;
- hard blockers/unknowns;
- whether all accepted source/dependency inputs can be materialized into a local immutable snapshot before build;
- exact dependency closure/LDF resolution, duplicate candidates, and any global-library dependency;
- all generated UI/source inputs and whether each is deterministic-generated or canonical-frozen;
- clean-room rebuild requirements that prevent FileProvider/on-demand hydration and hidden ~/.platformio state.

Output:
work/cart2/audits/PLATFORM_CAPACITY_AUDIT.md
No implementation.

## Audit 2 — Visual / Audio challenger
Goal:
Maximize feasible visual differentiation and nuanced music response without new architecture.

Must:
- inventory every current donor animation/effect actually available;
- identify why current named modes are perceptually similar;
- map established DSP/lighting/generative-art techniques onto existing signals;
- propose distinct Vibe grammars using existing/donor kernels where possible;
- quantify performance costs;
- define champion/challenger replay methodology;
- identify anything that would require a new FFT, controller, or major dependency and challenge whether it is justified;
- cite current external expert/official sources.

Output:
work/cart2/audits/VISUAL_AUDIO_AUDIT.md
No implementation.

## Audit 3 — Text / moment compositor
Goal:
Determine the highest-quality text/event integration realistically achievable on 32x16.

Must:
- inventory existing font/text/render code and prior failed approaches;
- test feasible font sizes/character counts;
- evaluate mask/layer/alpha compositing using existing toolchain;
- define short-text, name, amount, timer, directive, and long-message behaviors;
- define objective readability constraints plus subjective visual acceptance;
- identify exact reusable FastLED/ANIMartRIX capabilities;
- avoid generic marquee as default.

Output:
work/cart2/audits/TEXT_COMPOSITOR_AUDIT.md
No implementation.

## Audit 4 — Game / interaction feasibility
Goal:
Determine which IRL directive games and nostalgic digital games materially improve the cart experience and fit current hardware.

Must:
- evaluate CPU/RAM/render/input needs;
- separate game logic from display/runtime;
- assess phone/iPad control latency and old-iOS constraints;
- identify reusable open-source mechanics but flag licensing/assets;
- shortlist only games that are stable and worthwhile;
- reject IRL modes that create more bookkeeping than value.

Output:
work/cart2/audits/GAME_INTERACTION_AUDIT.md
No implementation.

## Audit 5 — Integration adversary
Run only after Audits 1–4.

Goal:
Challenge the combined proposed scope for hidden coupling, duplicated plumbing, performance regressions, user-work increase, fragile dependencies, licensing issues, and integration-order problems.

Output:
work/cart2/audits/INTEGRATION_CHALLENGER.md

Must end with:
- GO / BLOCKED for scope-lock readiness;
- exact unresolved evidence needed;
- no feature reductions without explicit user approval.
