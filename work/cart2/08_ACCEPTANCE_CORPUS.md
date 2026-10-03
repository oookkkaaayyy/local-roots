# HBNF Cart 2.0 — Acceptance Corpus Plan

STATUS: DRAFT / PRE-IMPLEMENTATION TEST DESIGN.

Machine-readable companion:
- `config/HBNF_CART2_ACCEPTANCE_CORPUS_V1.json`
- DRAFT_UNTIL_SCOPE_LOCK
- contains deterministic source-independent cases/invariants only; numerical performance thresholds remain foundation-dependent.

Purpose: prevent subjective, inconsistent "looks better" acceptance and reduce physical-cart iteration.

## A. Visual / audio reference corpus
Use the same short reference set for champion/challenger comparison.

Required categories:
- sparse sub-bass / kick-heavy;
- dense rock;
- vocal/mid-forward;
- electronic build/drop;
- quiet ambient;
- rapid hi-hat/high-frequency percussion;
- acoustic / high dynamic range;
- compressed loud master;
- silence -> onset -> sustained section.

Synthetic traces:
- kick impulse;
- sub/bass sweep;
- low-mid sweep;
- mid sweep;
- high sweep;
- transient burst;
- steady broadband noise;
- silence.

For each clip/trace capture:
- raw/derived AudioFeatures;
- frame timing;
- selected Vibe;
- framebuffer/video output where practical.

## A2. AudioFeatures replay
For the same reference clips/traces in section A, capture:
- existing raw WLED/HBNF audio observables available from the qualified source;
- candidate semantic AudioFeatures;
- normalization/AGC state;
- feature-extraction runtime cost;
- representative Vibe consequences.

Reject the candidate feature set if:
- features are materially redundant;
- bass/mid/high structure collapses under ordinary tracks;
- quiet/noise behavior creates false activity;
- ordinary level changes pin the feature set;
- every Vibe responds with effectively the same pulse/brightness behavior;
- extraction materially harms frame pacing.

Exact formulas, bins, smoothing and numeric thresholds remain qualified-source/replay dependent.

## B. Vibe differentiation corpus
For each committed Vibe:
- same three contrasting songs;
- same brightness ceiling;
- same Motion setting;
- same start duration;
- unlabeled A/B viewing;
- a palette-normalized/grayscale challenger pass where practical;
- cross-track identity: the same Vibe must remain recognizable across materially different tracks.

Pass condition:
A committed Vibe must be identifiable through motion/composition/audio-response grammar, not merely palette/name. Every committed pair is challenged, not only the most similar-looking pair.

## C. Text/moment corpus
Required semantic moments:
- ACE
- PLAYER NAME
- WINNER
- ACE POT / dollar amount
- DISTANCE
- TIMER
- READY / GO / REST / NEXT UP
- TEAM REVEAL
- BAG TAG
- short two-word announcement
- long-message fallback

Test:
- active Vibe underneath;
- quiet audio;
- bass-heavy audio;
- high-frequency audio;
- entry/readable hold/exit;
- readability at expected cart viewing distance.

## D. IRL directive-game corpus
For each recommended IRL mode:
- smallest valid station/distance set;
- typical group;
- interruption/pause/resume;
- iPad lock/wake;
- controller reconnect;
- timer expiry/restart where applicable;
- end/reset;
- a normal run requiring zero ongoing taps;
- Shuffle Call no-immediate-repeat behavior;
- Sequence Run sequence preservation across pause/resume.

Measure:
- manual taps/data entries required;
- whether cart reduces cognitive/bookkeeping load;
- recovery from accidental UI interruption;
- whether the cart materially improves the exercise versus a normal phone timer/randomizer.

Tie/elimination and repeated make/miss-entry cases are not required for the current recommended zero-score modes.

## E. Digital-game corpus
For each arcade game:
- cold start;
- restart;
- pause/background/return;
- phone control;
- iPad control;
- physical gamepad only if that path is included after target-device validation;
- duplicate/stale input rejection;
- disconnect/reconnect;
- two-player if supported;
- exact exit -> previous visual state restoration where contract requires it;
- deterministic replay of core collision/movement invariants;
- 20+ minute soak where appropriate.

## F. Guest UX corpus
First-time guest must be able to:
- open a branded shell on a clean device before cart/API success;
- understand whether the cart/session is available;
- join an owner-opened session;
- understand Vibe choices;
- perform only allowed actions;
- enter game participation flow;
- recover after lock/sleep and temporary LAN loss;
- lose mutation authority immediately on expiry/revocation without cache clearing;
- never reach admin/update/network/recovery controls.

Owner Mission Control must separately prove:
- LIVE course controls do not require ADMIN navigation;
- GUESTS can open/close/revoke capability-scoped sessions;
- HEALTH communicates Matrix/AUX/LAN state without turning routine use into a debug console;
- primary cart controls meet the chosen large-target interaction standard.

## G. Reliability corpus
- cold boot;
- offline boot;
- delayed Opal availability;
- delayed Matrix/AUX availability;
- temporary WAN loss;
- temporary AUX loss;
- iPad lock/wake;
- controller reconnect;
- failed update check;
- rollback dry path;
- corrupted/stale cached state;
- session diagnostics.

## Rule
Automated tests may reject regressions.
Only human acceptance may approve aesthetics.


## H. Input-controller corpus
For the normalized action layer:
- touch D-pad/action buttons on iPad;
- touch controls on a guest phone;
- held direction;
- rapid direction changes;
- duplicate sequence;
- stale input after reconnect;
- controller disconnect while moving;
- player/controller reassignment;
- Gamepad API mapping only for controller/browser combinations proposed for commitment.

Do not freeze a numerical latency gate before measuring the accepted local stack. Record end-to-end input-to-game-state behavior on the actual target devices, then freeze the playability envelope before release acceptance.

## Current evidence basis
- W3C target-size guidance: https://www.w3.org/WAI/WCAG21/Understanding/target-size
- MDN Gamepad API: https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API
- MDN PWA installability: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- WLED AudioReactive: https://kno.wled.ge/advanced/audio-reactive/
- dgputt randomized SHUFFLE drill: https://apps.apple.com/us/app/dgputt-disc-golf-putting/id1536711552
- tiny-matrix arcade feasibility example: https://github.com/zero7608/matrixgame
