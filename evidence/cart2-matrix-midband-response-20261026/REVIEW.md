# Matrix mid-band response candidate

Disposition: review-only; queued after UV. No package, merge, release, or device operation is included.

## Source and recovery identity

- Repository: `oookkkaaayyy/local-roots`
- Base commit: `00e6552ffe65a3dbd6768b0e017fd22226c5b86f`
- Candidate branch: `codex/matrix-midband-response-20261026`
- Current baseline, per owner direction: `hbnf-cart2-phase2-r6-skins-readable-20261014`.
- Matching rollback image: `hbnf-cart2-phase2-r6-skins-readable-20261014.bin`, SHA-256 `de38221f2f9d7e9a03076185777266dc5cfd3a088b449530531dfcc1f7ed072d`; Drive file `1SZaURqkBnyZog04RtHBXmFQOsYurYDKJ`; recovery manifest `1QnFrMxy_Vx3Sqg68YF3U9xWhUNf5JENJ`.
- Candidate remains REVIEW_ONLY until its exact target build and source-bound admission are complete.

## Proposed behavior

Reduce only the mid-band envelope attack time constant from 115 ms to 90 ms. At a fixed 20 ms update interval, the envelope reaches 63% of a step input in about 100 ms instead of about 120 ms. The change leaves bass and treble attack times, all release behavior, FFT analysis, Vibe selection, and all 28 visual kernels untouched.

This is one bounded response improvement, not the ceiling of the Matrix light-show system. The existing bridge supports independent bass/mid/treble modulation, transient accents, slow-energy motion, six styles, and profile-controlled depth across the preserved kernel set. Those capabilities remain available and unchanged. Raising additional gains or changing more bands would need representative music and per-kernel review; the passive feature capture below is not enough to call a more aggressive setting safe.

## Focused offline evidence

The host test replays a deterministic mid-band step and release through the production `AudioExpression` implementation. At 100 ms, the baseline output was 0.580866 and the candidate output was 0.670807; low and high outputs remained zero. After the input returns to baseline for 1,000 ms, the unchanged 620 ms release envelope is 0.133697. `response.svg` plots the attack curves and the 100 ms comparison point.

The same host check also verifies mid-band isolation from bass/treble, the existing 5–100 ms `dt` clamp at both boundaries, and silence handling. It uses synthetic `VibeMetrics`; these checks do not establish perceived sound quality.

A second host replay drives the production `Vibe16` analyzer and candidate `AudioExpression` from the repository's passive Matrix UDP feature capture. The input is source-bound to firmware `338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743e947a2f3d8c` and capture SHA-256 `712dd275bd260ebec2c60c17ed9413bf8d6cd0c58b2121c913916b0944f7e951`. Using the capture's uniform 31.164 ms replay interval and a 115 ms baseline model, all 3,852 samples replayed; mean signed candidate-minus-baseline mid-energy was 0.004655, p95 absolute delta 0.041983, and maximum absolute delta 0.089658. Across the 26 mid-dominant samples, candidate mean was 0.878739 vs baseline 0.850851.

Reproduce the real-feature replay from the complete repository checkout:

```sh
python3 tests/hbnf_audio_expression_real_trace_replay.py
```

The capture is unlabelled ambient microphone feature data, not PCM; it contains only 26 mid-dominant samples and no controlled high-dominant music. The replay establishes implementation response on that captured input only, not a representative music set or perceptual acceptance.

Reproduce from the repository root:

```sh
g++ -std=c++11 -Wall -Wextra -Werror tests/hbnf_audio_expression_attack_host.cpp -o /tmp/hbnf-audio-attack-check
/tmp/hbnf-audio-attack-check
python3 scripts/hbnf_control.py check-change --change evidence/engineering-governance/CART2-MATRIX-MIDBAND-ATTACK-20261026.json
```

Before any future install, build and retain the complete candidate from the exact reviewed source commit, verify its binary hash and the currently installed baseline/rollback bytes, then produce the repository's hash-bound release-admission manifest and run:

```sh
python3 scripts/hbnf_control.py check-admission --stage OFFLINE_COMPILED --admission /path/to/exact-candidate-admission.json
```

This offline stage is only one release gate; it does not authorize hardware access. The existing validator has negative host tests for missing evidence, hash mismatches, and generic proof reuse.

Expected host output (the remaining deterministic assertions are silent on success):

```text
mid_energy_at_100ms=0.670807 low=0.000000 high=0.000000
mid_energy_after_1000ms_release=0.133697
```

## Limits and disposition

These checks establish scalar and captured-feature response, not how representative real music sounds or how the physical Matrix appears. The exact target firmware build, controlled song coverage, all-28-kernel qualification, Matrix/AUX visual coherence, Opal interaction, and owner physical review remain NOT CHECKED. Keep queued after UV; do not use this branch for the current Opal flash or any release path.

## Owner physical review guide (after UV)

This is a review checklist only; no package or flash is authorized by it. Once the UV release work is complete and the owner schedules Matrix review:

1. Confirm the current R6 baseline and registered rollback SHA above, then confirm a complete build from the exact candidate commit and a durable rollback image whose bytes match that baseline. Abort if any identity or hash differs.
2. With the Matrix in its normal supported configuration, compare baseline and candidate on the same short set of representative music at the same volume. Listen for clearer mid-band response without harshness, chatter, pumping, false transient triggers, or slower settling after a hit.
3. Observe every one of the 28 existing visual kernels with the same music and settings. Check that palette, motion, low/high response, transitions, and overall readability remain acceptable; verify supported Matrix/AUX coherence and ordinary audio behavior.
4. Record each item PASS, FAIL, or NOT CHECKED, with the song/segment, kernel, settings, and owner observation. Any new audible instability, unintended visual change, or missing rollback identity is FAIL for proceeding; otherwise unresolved observations remain NOT CHECKED and require follow-up.

This guide does not replace the target build, exact rollback admission, or the repository's release/install/readback gates. No field acceptance is inferred from the offline results.
