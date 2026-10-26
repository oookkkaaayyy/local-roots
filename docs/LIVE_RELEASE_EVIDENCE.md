# Live release evidence gate

This repository uses `scripts/validate-release-receipt.mjs` as a fail-closed pre-completion check for live releases. A release is not complete until one receipt records its exact source commit, individually versioned and hashed build inputs, package bytes and SHA-256, deployment/install version and receipt, exact rollback artifact, separate passing acceptance criteria, and indexed Drive recovery copies for both candidate and rollback downloaded back and byte-compared with their source artifacts.

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
