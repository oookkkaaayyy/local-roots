# HBNF Local Materialization + Generated-Inputs Gate

This gate is required before any baseline/candidate PlatformIO build is treated as release evidence.

## A. Immutable local source
- [ ] Source commit/tree identified.
- [ ] Build snapshot created from that exact source.
- [ ] Snapshot is fully local; no on-demand/FileProvider placeholders remain.
- [ ] No symlink unexpectedly escapes the allowed source/build roots.
- [ ] Build staging does not modify the source snapshot.

## B. Dependency closure
- [ ] Known-good dependency graph recorded.
- [ ] Exact selected package/library copies recorded.
- [ ] Duplicate candidates documented with selected/rejected disposition.
- [ ] Dependencies are fully materialized locally before build.
- [ ] Custom/patched dependencies have durable hashes/archive locations.
- [ ] LDF/package resolution matches the recorded closure.
- [ ] No unexpected global PlatformIO library participates.

PlatformIO LDF storage priority makes this important: project private lib, project libdeps, core/global libraries, then framework/SDK libraries. A future build must not silently fall through to a different global copy.

## C. Generated inputs
Every generated input must have one mode:

### DETERMINISTIC_GENERATED
- generator script/tool/version pinned;
- generator inputs/config hashed;
- output hash expected;
- regeneration verified.

### CANONICAL_FROZEN_INPUT
- accepted output bytes/hash archived;
- generator disabled or guarded for this build;
- drift causes failure.

No third/ambiguous mode is permitted.

## D. PlatformIO isolation
The clean-room build uses isolated:
- core_dir
- packages_dir
- workspace_dir
- libdeps_dir
- build_dir
- cache_dir

The accepted build must not rely on undocumented state in the user's default ~/.platformio tree.

## E. Pass condition
PASS only when A-D are complete and evidence is stored in the candidate/golden capsule.

Otherwise status is:
SOURCE/BUILD WORK REMAINS or BLOCKED ON: <specific gate>
