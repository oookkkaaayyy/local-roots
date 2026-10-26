# Live release evidence gate

This repository uses `scripts/validate-release-receipt.mjs` as a fail-closed pre-completion check for live releases. A release is not complete until one receipt records its exact current baseline identity and recovery, source commit, individually versioned and hashed build inputs, package bytes and SHA-256, deployment/install version and receipt, exact rollback artifact, separate passing acceptance criteria, and indexed Drive recovery copies for both candidate and rollback downloaded back and byte-compared with their source artifacts.

## Run the gate

Keep the receipt and its evidence files in one private working directory. Use relative paths that stay inside that directory. Do not put secrets or production data in the receipt. Run:

```sh
npm run release:verify -- /absolute/path/to/release-receipt.json /absolute/path/to/receipt-root
```

The command prints `PASS` with candidate and rollback hashes only when every required file and evidence field is present and the candidate matches the downloaded-back recovery copy. Missing fields, non-PASS acceptance criteria, path escapes, size mismatches, or hash mismatches fail the command.

## Receipt contract

Use schema version `1` with these fields:

- `releaseId`
- `source`: repository, ref, full commit SHA
- `build`: command, toolchain, lockfile SHA-256, and nonempty `inputs[]`, each with a name, exact version, and SHA-256
- `package`: relative `path`, exact `bytes`, and `sha256`
- `deployment`: provider, target, immutable `versionId`, `installedAt`, and a path/size/hash for the deploy or install receipt
- `rollback`: exact artifact path/size/hash and a restore procedure; `recovery` includes Drive file ID/URL and a downloaded-back path/size/hash that byte-matches the rollback artifact
- `acceptance.criteria[]`: one entry per required behavior, each `PASS` with evidence references
- `recovery`: Drive file ID and URL, `downloadBackVerified: true`, and downloaded-back candidate path/size/hash

The validator checks file identities and evidence presence. It does not itself prove that a provider deployment, field test, device acceptance, rollback drill, or Drive permission is valid; the linked receipt and acceptance evidence must support those claims. Keep source, build inputs, deployment state, backup artifacts, and acceptance scope tied to the same release ID and commit.

## Automation boundary

The existing GitHub Actions workflows are intentionally manual under the repository's quota lock. This validator is part of the normal local verification suite, so its fail-closed behavior is regression-checked without starting hosted jobs. A required protected-branch check was not verifiable through the connected GitHub surface; do not describe the validator as a mandatory GitHub branch check until repository rules require a passing run.

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

The repository validator mechanically requires a recovered baseline artifact, hashed identity evidence whose identity/source commit/artifact digest and size agree, a rollback bound to that exact baseline identity and bytes, downloaded-back byte equality, and the candidate/rollback receipt. Missing or mismatched baseline evidence fails closed. The identity evidence file must be grounded in the authoritative provider/device install record; its hash detects later tampering but cannot independently authenticate a fabricated provider record. GitHub Actions and protected branch enforcement remain paused; this is a mandatory project release process and local validator, not an automatic GitHub merge block.
