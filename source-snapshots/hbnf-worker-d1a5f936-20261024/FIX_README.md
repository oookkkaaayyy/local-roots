# False-conflict fix candidate

This source-only change is based on observed snapshot commit `4289e37e8d0b2864cb17451c5267dfab87a63a1d`. It deep-copies fetched `league_state.state_json`, hashes the raw remote root/branch before normalization, and normalizes only a separate working copy for both initial load and realtime updates. This prevents in-place normalization defaults from changing the stored concurrency baseline and causing a false conflict.

`tests/verify-conflict-baseline.cjs` loads the immutable baseline page from the snapshot commit and the changed page from the working tree. It deterministically reproduces the baseline false conflict and verifies the candidate reaches exactly one mocked conditional update. It also dispatches a legacy-shaped mocked Postgres Realtime payload: the baseline mutates that provider payload during normalization, while the candidate preserves it, retains raw root/branch hashes, normalizes a detached working copy, saves locally, and renders the incoming update. The test uses no network and no real database.

This is a source/test candidate only. It has not been packaged, deployed, provider-write/readback verified, or tested on an iPhone or through Matrix. Full active deployment asset parity remains unproven.
