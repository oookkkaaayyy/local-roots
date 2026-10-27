# Matrix mid-band response candidate

Disposition: review-only; queued after UV. No package, merge, release, or device operation is included.

## Source and recovery identity

- Repository: `oookkkaaayyy/local-roots`
- Base commit: `00e6552ffe65a3dbd6768b0e017fd22226c5b86f`
- Candidate branch: `codex/matrix-midband-response-20261026`
- Current installed release: `hbnf-cart2-phase2-r6-skins-readable-20261014`
- Matching rollback artifact: `hbnf-cart2-phase2-r6-skins-readable-20261014.bin`
- Rollback SHA-256: `de38221f2f9d7e9a03076185777266dc5cfd3a088b449530531dfcc1f7ed072d`
- Rollback identity and download-back verification: Drive file `1SZaURqkBnyZog04RtHBXmFQOsYurYDKJ`; recovery manifest `1QnFrMxy_Vx3Sqg68YF3U9xWhUNf5JENJ`.

## Proposed behavior

Reduce only the mid-band envelope attack time constant from 115 ms to 90 ms. At a fixed 20 ms update interval, the envelope reaches 63% of a step input in about 100 ms instead of about 120 ms. The change leaves bass and treble attack times, all release behavior, FFT analysis, Vibe selection, and all 28 visual kernels untouched.

## Focused offline evidence

The host test replays a deterministic mid-band step and release through the production `AudioExpression` implementation. At 100 ms, the baseline output was 0.580866 and the candidate output was 0.670807; low and high outputs remained zero. After the input returns to baseline for 1,000 ms, the unchanged 620 ms release envelope is 0.133697. `response.svg` plots the attack curves and the 100 ms comparison point.

The same host check also verifies mid-band isolation from bass/treble, the existing 5–100 ms `dt` clamp at both boundaries, and silence handling. It uses synthetic `VibeMetrics`; these checks do not establish perceived sound quality.

Reproduce from the repository root:

```sh
g++ -std=c++11 -Wall -Wextra -Werror tests/hbnf_audio_expression_attack_host.cpp -o /tmp/hbnf-audio-attack-check
/tmp/hbnf-audio-attack-check
python3 scripts/hbnf_control.py check-change --change evidence/engineering-governance/CART2-MATRIX-MIDBAND-ATTACK-20261026.json
```

Expected host output (the remaining deterministic assertions are silent on success):

```text
mid_energy_at_100ms=0.670807 low=0.000000 high=0.000000
mid_energy_after_1000ms_release=0.133697
```

## Limits and disposition

These checks establish the parameter's scalar response, not how real music sounds or how the physical Matrix appears. The exact target firmware build, real-song trace replay, all-28-kernel qualification, Matrix/AUX visual coherence, Opal interaction, and owner physical review remain NOT CHECKED. Keep queued after UV; do not use this branch for the current Opal flash or any release path.

## Owner physical review guide (after UV)

This is a review checklist only; no package or flash is authorized by it. Once the UV release work is complete and the owner schedules Matrix review:

1. Confirm the review build is produced from the exact candidate commit and that the installed baseline and matching rollback image still match the identities above. Abort if target identity or rollback evidence differs.
2. With the Matrix in its normal supported configuration, compare baseline and candidate on the same short set of representative music at the same volume. Listen for clearer mid-band response without harshness, chatter, pumping, false transient triggers, or slower settling after a hit.
3. Observe every one of the 28 existing visual kernels with the same music and settings. Check that palette, motion, low/high response, transitions, and overall readability remain acceptable; verify supported Matrix/AUX coherence and ordinary audio behavior.
4. Record each item PASS, FAIL, or NOT CHECKED, with the song/segment, kernel, settings, and owner observation. Any new audible instability, unintended visual change, or missing rollback identity is FAIL for proceeding; otherwise unresolved observations remain NOT CHECKED and require follow-up.

This guide does not replace the target build, exact rollback admission, or the repository's release/install/readback gates. No field acceptance is inferred from the offline results.
