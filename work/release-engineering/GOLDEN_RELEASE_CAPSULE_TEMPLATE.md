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

## 3. Toolchain / build environment
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

## 4. Exact build procedure
1.
2.
3.

- Dependency-install command:
- Build command:
- Package command:
- Signing command shape (never private-key material):
- Output artifact path:

## 5. Artifact evidence
- Candidate BIN:
- Size:
- SHA-256:
- Build report:
- Build manifest:
- Rebuild comparison:
  - bit-for-bit reproducible: YES/NO
  - if NO, documented nondeterministic fields/reason:
  - equivalent-source/config/toolchain proof:

## 6. Runtime/deployment identity
- OTA release ID:
- Manifest URL/identity:
- Artifact URL/identity:
- Updater package version/SHA:
- Controller/PWA bundle identity:
- Matrix local controller identity:
- Expected Matrix/AUX relationship:
- Expected Opal routes/origins:

## 7. Acceptance evidence
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

## 8. Known issues
- Blocking:
- Non-blocking:
- Watch-only:

## 9. Rollback
- Artifact:
- SHA-256:
- Exact procedure:
- Automatic rollback trigger:
- Manual rollback trigger:
- Health condition required after rollback:

## 10. Promotion
- New accepted baseline: YES/NO
- AKS updated:
- Solved-problems ledger updated:
- Release-status file updated:
- Previous baseline preserved:
