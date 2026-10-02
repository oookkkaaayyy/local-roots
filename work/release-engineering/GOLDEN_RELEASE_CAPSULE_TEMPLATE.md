# HBNF Golden Release Capsule Template

STATUS: TEMPLATE — populate only from verified evidence.

## 1. Accepted identity
- Release ID:
- Acceptance date:
- Firmware SHA-256:
- Rollback firmware SHA-256:
- Matrix MAC/IP:
- AUX MAC/IP:
- Opal model/version:
- WLED version:
- HBNF build ID/usermod marker:

## 2. Source provenance
- Repository:
- Branch:
- Commit:
- Source tree clean/dirty:
- Local-only source inputs:
- Generated source/header inputs:
- Source manifest SHA-256:
- Evidence proving this source produced or exactly corresponds to the accepted artifact:

## 3. Source materialization / dependency closure
- Build snapshot path:
- Snapshot type: immutable Git archive / clean local clone / other:
- Snapshot commit/tree:
- Fully local/materialized: YES/NO
- Cloud/FileProvider placeholders detected: YES/NO
- Symlinks leaving snapshot/build root: YES/NO
- Dependency closure manifest:
- Exact dependency graph from known-good build:
- Duplicate dependency candidates and disposition:
- Unexpected global-library dependencies: NONE / list:
- Dependency content hashes:
- Custom/patched dependency archive locations:

## 4. Generated build-input policy
For every generated header/source/assets file used by the build:
- File:
- Policy: DETERMINISTIC_GENERATED / CANONICAL_FROZEN_INPUT
- Expected SHA-256:
- Generator enabled during accepted build: YES/NO
- Generator tool/version:
- Generator script SHA-256:
- Generator input/config hashes:
- Deterministic regeneration verified: YES/NO/NOT_APPLICABLE
- If frozen input: exact file archived and generator disabled/guarded: YES/NO
- Drift behavior: FAIL CLOSED

No release may rely on an undocumented sequence of "generator changes files -> restore old files -> continue."

## 5. Toolchain / build environment
- OS:
- Python:
- PlatformIO Core:
- Platform:
- Framework:
- Toolchain:
- Build environment name:
- platform_packages:
- lib_deps:
- VCS dependency commit pins:
- Build flags / defines:
- Relevant environment variables (NO SECRETS):
- Package/cache notes:

Attach:
- pio project config --json-output
- pio project metadata --json-output
- pio pkg list
- resolved platformio.ini / extra_configs
- build log
- size/memory report

## 6. Exact build procedure
1.
2.
3.

- Dependency-install command:
- Build command:
- Package command:
- Signing command shape (never private-key material):
- Output artifact path:

## 7. Artifact evidence
- Candidate BIN:
- Size:
- SHA-256:
- Build report:
- Build manifest:
- Rebuild comparison:
  - bit-for-bit reproducible: YES/NO
  - if NO, documented nondeterministic fields/reason:
  - equivalent-source/config/toolchain proof:

## 8. Runtime/deployment identity
- OTA release ID:
- Manifest URL/identity:
- Artifact URL/identity:
- Updater package version/SHA:
- Controller/PWA bundle identity:
- Matrix local controller identity:
- Expected Matrix/AUX relationship:
- Expected Opal routes/origins:

## 9. Acceptance evidence
### Technical
- Build/tests:
- Frame timing:
- Heap/RAM:
- Flash:
- Controller compatibility:
- Offline/local-first:
- OTA/rollback:

### Physical
- Matrix visual:
- Audio reactivity:
- AUX coherence:
- Brightness:
- Motion:
- Audio Response:
- iPad:
- Guest:
- Games:
- Text/moments:
- Other:

## 10. Known issues
- Blocking:
- Non-blocking:
- Watch-only:

## 11. Rollback
- Artifact:
- SHA-256:
- Exact procedure:
- Automatic rollback trigger:
- Manual rollback trigger:
- Health condition required after rollback:

## 12. Promotion
- New accepted baseline: YES/NO
- AKS updated:
- Solved-problems ledger updated:
- Release-status file updated:
- Previous baseline preserved:
