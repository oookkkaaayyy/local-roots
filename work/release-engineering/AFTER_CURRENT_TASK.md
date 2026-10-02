# After the Current PR #46 / Source-Reconciliation Task Finishes

Do not interrupt the current task.

When it reaches a clean checkpoint, convert its verified evidence into the first complete golden release capsule.

## Required extraction
From the accepted task output, capture:
1. repository / branch / commit / source tree;
2. exact source evidence linking that tree to V1.1;
3. PlatformIO Core version;
4. exact platform/framework/toolchain;
5. build environment name;
6. platform_packages;
7. resolved lib_deps and VCS pins;
8. build flags/defines;
9. exact build command;
10. build log / size report;
11. no-op rebuild result;
12. rebuilt artifact SHA or documented nondeterministic reason;
13. rollback artifact location and verification;
14. any newly solved build/dependency issue.

## Then
- update config/HBNF_GOLDEN_RELEASE_V1_1_PENDING.json;
- set source.lineage_verified only from evidence;
- set build_environment.captured only when the actual resolved build environment is preserved;
- verify rollback;
- run scripts/hbnf_validate_release_capsule.py against the completed capsule;
- update config/HBNF_SOLVED_PROBLEMS.json with any newly validated fix;
- create the next active release-status file from HBNF_RELEASE_STATUS_TEMPLATE.json;
- write the completed capsule identity back to AKS.

## Hard rule
Do not substitute "the rebuilt BIN looks close", "the code resembles V1.1", or "the branch is nearby" for source-lineage proof.

If exact source lineage cannot be proven, preserve that as a blocker and report the exact missing evidence.
