# Repository topology correction

## Finding

GitHub compare currently reports:

- HBNF staging vs `main`: **diverged**
- HBNF staging: **809 commits ahead**
- HBNF staging: **53 commits behind**

This is not functioning like a normal feature/release branch. It is effectively a separate product repository embedded inside a long-lived branch.

That creates:

- duplicated/different workflow sets;
- cost/quota coupling;
- merge and source-identity ambiguity;
- confusing default-branch code search;
- stale-main/stale-HBNF documentation problems;
- workers accidentally reading the wrong branch;
- cross-project commits that do not naturally propagate.

## Target topology

After the active Packet20/Foundation lane reaches a safe baseline:

### Local Roots repository

Keep on `main`:

- Local Roots Events/web;
- D&U web/backend integrations that actually share this application/runtime;
- shared brand/domain code that genuinely belongs to this product.

Use short-lived branches for changes.

### HBNF repository

Extract the current accepted HBNF source/history into its own private repository:

- firmware/build inputs;
- Matrix/AUX/Opal tooling;
- Cart controller/PWA;
- HBNF release engineering;
- HBNF tests;
- HBNF workflows;
- HBNF platform/control state.

Its default branch becomes the actual current HBNF baseline rather than a permanent staging branch.

### Cross-project platform

Keep the platform catalog/routing layer small and capable of pointing at multiple repositories. Do not duplicate HBNF source back into Local Roots merely to make the catalog work.

## Why extraction is preferred over merging HBNF into main

HBNF and Local Roots are independently deployable systems with very different:

- build toolchains;
- deployment/recovery semantics;
- CI costs;
- runtime environments;
- risk profiles.

Merging hundreds of divergent HBNF commits into the Local Roots application would increase coupling instead of removing it.

## Migration sequence

Do **not** perform this during the current seq19/Packet20 incident.

1. Finish/recover the current HBNF diagnostic lane.
2. Freeze one accepted HBNF baseline commit.
3. Verify all unique HBNF source/artifacts are durably registered.
4. Create the dedicated HBNF repository from that accepted baseline/history.
5. Set its accepted baseline as default branch.
6. Copy only current/manual-recovery workflows; retire historical automatic workflow triggers.
7. Run the platform doctor + HBNF tests in the new repository.
8. Update AKS/catalog pointers.
9. Archive the legacy HBNF long-lived branches in `local-roots`.
10. Do not delete old history until repository/source/artifact readback is verified.

## Branch policy afterward

Use short-lived branches measured in hours/day, not permanent parallel trunks.

Long-running experiments should preserve state in artifacts/evidence, not by leaving a product branch alive indefinitely.

Release branches are snapshots, not alternate repositories.
