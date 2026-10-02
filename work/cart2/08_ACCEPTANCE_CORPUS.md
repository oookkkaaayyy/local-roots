# HBNF Cart 2.0 — Acceptance Corpus Plan

STATUS: DRAFT / PRE-IMPLEMENTATION TEST DESIGN.

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

## B. Vibe differentiation corpus
For each committed Vibe:
- same three contrasting songs;
- same brightness ceiling;
- same Motion setting;
- same start duration;
- unlabeled A/B viewing.

Pass condition:
A committed Vibe must be identifiable through motion/composition/audio-response grammar, not merely palette/name.

## C. Text/moment corpus
Required semantic moments:
- ACE
- PLAYER NAME
- WINNER
- ACE POT / dollar amount
- DISTANCE
- TIMER
- STANCE / CHALLENGE
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
For each game:
- 1 player;
- typical group;
- max supported players;
- interruption/resume;
- wrong/duplicate input;
- timer expiry;
- tie/elimination edge case;
- end/reset.

Measure:
- manual taps/data entries required;
- whether cart reduces cognitive/bookkeeping load;
- recovery from accidental UI interruption.

## E. Digital-game corpus
For each arcade game:
- cold start;
- restart;
- pause/background/return;
- phone control;
- iPad control;
- two-player if supported;
- exit -> restore previous visual state;
- 20+ minute soak where appropriate.

## F. Guest UX corpus
First-time guest must be able to:
- join;
- understand Vibe choices;
- perform allowed actions;
- enter game participation flow;
- recover after lock/sleep;
- never reach admin/update/network controls.

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
