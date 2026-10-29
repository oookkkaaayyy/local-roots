# Live release evidence gate

This repository uses a two-phase, fail-closed receipt gate. Run `npm run release:admit -- <receipt.json> <receipt-root>` before mutation. It verifies candidate and rollback bytes, current baseline identity/recovery, downloaded-back copies, planned mutation and restoration routes, and acceptance criteria declared as PENDING. The first run writes a one-time `<releaseId>.admission.json` and returns `PENDING`, not PASS. Upload that file to the approved Drive recovery location, download it back, and add its path, byte count, SHA-256, Drive ID/URL, and downloaded-back path/size/hash to `receipt.admission`. Rerun admission; it prints PASS only after verifying this durable copy. After mutation, update the same receipt with provider/device readback and criterion evidence, then run `npm run release:verify -- <receipt.json> <receipt-root>` to validate closeout against the exact admission snapshot and its downloaded-back copy.

### One-release Cloudflare native rollback exception

The owner-approved exception for Dye Studio PR #153 is encoded as a fixed scope in `scripts/validate-release-receipt.mjs`; see `AGENTS.md` for its canonical approval record and exact target. It accepts Cloudflare's authenticated, successful, immutable production deployment as a provider-native rollback target because the historical build archive is unavailable. The receipt must preserve an explicit unavailable state for historical archive bytes, provider evidence separately hashed and downloaded-back byte-equal, the exact candidate archive and its verified Drive recovery, and the provider restoration route. This exception does not relax any candidate, CI, preview, interaction, admission, or closeout requirement and cannot be selected for another release. All other targets continue to require an exact byte-identical artifact rollback.

## Run the gate

Keep the receipt and its evidence files in one private working directory. Use relative paths that stay inside that directory. Do not put secrets or production data in the receipt. Run:

```sh
npm run release:verify -- /absolute/path/to/release-receipt.json /absolute/path/to/receipt-root

# Before mutation, use admission instead:
npm run release:admit -- /absolute/path/to/release-receipt.json /absolute/path/to/receipt-root
```

Admission prints `PASS admission` only when the candidate, exact rollback, and the one-time admission manifest match independently stored, downloaded-back copies and all pre-mutation evidence is present. Closeout prints `PASS closeout` only when the receipt matches that snapshot and deployment/install readback binds provider, target, version, source commit, candidate hash, and prior baseline; each acceptance criterion must have evidence and pass. Missing fields, changed plans, path escapes, size mismatches, or hash mismatches fail the command. The snapshot hash detects accidental or uncoordinated changes; it is not a digital signature against an actor able to rewrite the whole capsule.

## Receipt contract

Use schema version `1` with these fields:

- `releaseId`
- `admission`: path, byte count, and SHA-256 for the admission snapshot emitted before mutation; closeout rejects any changed candidate, baseline, deployment plan, or acceptance plan
- `admission` also contains Drive file ID/URL, `downloadBackVerified: true`, and a local downloaded-back path/size/SHA-256 matching the manifest; admission itself cannot PASS until this evidence is present
- `source`: repository, ref, full commit SHA
- `build`: command, toolchain, lockfile SHA-256, and nonempty `inputs[]`, each with a name, exact version, and SHA-256
- `package`: relative `path`, exact `bytes`, and `sha256`
- `baseline.provider` and `baseline.target`: exact current provider and target identifiers; admission requires the deployment plan to match these
- Before mutation, `deployment` includes provider, target, `plannedRoute`, and `restoreProcedure`; the candidate cannot be admitted without these.
- At closeout, `deployment` includes provider, target, immutable `versionId`, `installedAt`, and a path/size/hash for the deploy or install receipt, plus its Drive file ID/URL and a downloaded-back copy verified byte-for-byte.
- At closeout, `deployment.readback` is a hashed JSON record containing provider, target, versionId, sourceCommit, packageSha256, and baselineIdentity; all fields must match the admitted release.
- `rollback`: exact artifact path/size/hash and a restore procedure; `recovery` includes Drive file ID/URL and a downloaded-back path/size/hash that byte-matches the rollback artifact
- Before mutation, `acceptance.scope` names the scope under test and each `acceptance.criteria[]` item lists a description, verification `method`, expected outcome, and `PENDING` status. The coordinator remains responsible for listing all applicable criteria for that release.
- At closeout, each criterion must be `PASS` with evidence references.
- `recovery`: Drive file ID and URL, `downloadBackVerified: true`, and downloaded-back candidate path/size/hash

The validator checks file identities and evidence presence. It does not itself prove that a provider deployment, field test, device acceptance, rollback drill, or Drive permission is valid; the linked receipt and acceptance evidence must support those claims. Keep source, build inputs, deployment state, backup artifacts, and acceptance scope tied to the same release ID and commit.

## Automation boundary

GitHub Actions runs the non-mutating release evidence regression tests and repository test/build checks automatically on pull requests to `main` and pushes to `main`. The check name for the focused release validator is `Release evidence validator`. The connected GitHub API does not expose repository ruleset configuration, and this private repository's currently effective rules could not be read in the signed-out browser. Therefore, automatic runs are active, but merge blocking is **not verified or claimed**. Configure a required check for `Release evidence validator` only after confirming that private-repository branch protection is available in the current account plan. Never purchase or upgrade a plan without the owner's explicit authorization.

Generic CI cannot validate a candidate-specific install receipt: the candidate package, exact rollback, target identity, and downloaded-back Drive copies are created for the individual release. Before any install, deployment, publication, or device mutation, run candidate-bound `npm run release:admit` locally against the exact receipt and package capsule. After mutation, run `npm run release:verify` for closeout. Treat CI as a regression gate on the gate implementation, not as proof that a particular candidate passed its recovery gate.

The automatic CI also runs `npm test` and builds the web app. On the first automatic PR run after re-enabling Actions, the focused release validator passed, but the existing domain test job failed on five known public UI assertions (122/127 passed); the web build was skipped because the test command failed. Keep that failing job visible so it cannot be mistaken for a fully passing suite. Repair those unrelated UI assertions in a separate bounded task before making the entire workflow a merge requirement.

## Required current-build preflight

Before creating or installing a candidate, resolve the current build from the AKS Artifact & Source Registry and linked Live Build Backup index. Record the literal provider/device identity, immutable deployed version or install transaction, source commit when known, exact candidate/current package pointer, and exact rollback pointer. Apply the owner rule: the most recent build known built and installed remains current until a newer build is built and installed. A missing archive/hash is a recovery gap; it does not make a known installed version cease being current. Do not infer active identity from branch head, latest upload, stable channel, or a human release label alone.

The release receipt must add a `baseline` object containing:

- `authorityUrl`: direct link to the current-first register/index entry
- `identity`: literal current deployed/installed identity and immutable version/transaction ID
- `sourceCommit`: full commit SHA or `unknown` with the evidence pointer explaining why
- `identityEvidence`: a hashed JSON evidence file that repeats the baseline identity and source commit and binds them to the recovered baseline artifact SHA-256 and byte count
- `artifact`: exact current package path, bytes, SHA-256, and Drive file ID, or an explicit `unrecovered` disposition with the last-known install receipt pointer
- `rollback`: exact pre-change rollback package path, bytes, SHA-256, Drive file ID, downloaded-back path/hash/size, and restore procedure
- `acceptance`: current baseline state and evidence links

For any mutation, the baseline rollback package and the candidate package must both be present in the approved durable location and downloaded back with byte equality before mutation. If an installed artifact is unrecovered, do not mutate that product until an exact rollback is recovered or the owner explicitly changes the release decision. Record a bounded retrieval ledger: exact source/location/query, scope, result, and one next path. A scoped `NOT_FOUND` must stay scoped; do not repeat the same lookup without a new pointer or capability.

After mutation, append provider/device readback identity and acceptance evidence to the same release receipt. Update the current pointer only after the result is known; retain the former current entry and rollback permanently. Update the AKS index/Delta Inbox and Drive index with the receipt and direct artifact links. These steps are part of release completion, not optional cleanup.

The repository validator mechanically requires a recovered baseline artifact, hashed identity evidence whose identity/source commit/artifact digest and size agree, a rollback bound to that exact baseline identity and bytes, downloaded-back byte equality, and the candidate/rollback receipt. Missing or mismatched baseline evidence fails closed. The identity evidence file must be grounded in the authoritative provider/device install record; its hash detects later tampering but cannot independently authenticate a fabricated provider record.
