#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import pathlib
import subprocess
import sys
import uuid
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[1]
PLATFORM = ROOT / "platform"
CATALOG = PLATFORM / "catalog.json"
POLICIES = PLATFORM / "policies.json"
WORKFLOWS = PLATFORM / "workflows"

MANDATORY_PRELIVE_STAGES = (
    "contract-closure",
    "recovery-proof",
    "transaction-rehearsal",
    "capture-current-state",
)


class PlatformError(RuntimeError):
    pass


def load_json(path: pathlib.Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text())
    except FileNotFoundError as exc:
        raise PlatformError(f"missing required file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise PlatformError(f"invalid JSON {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise PlatformError(f"expected JSON object: {path}")
    return value


def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def provisional_pending_authorization_matches(
    auth: dict[str, Any], pending: dict[str, Any], installed: str, contract: dict[str, Any]
) -> bool:
    """Bind current authority to the exact candidate; install authority remains ID-bound before OTA."""
    if not (
        auth.get("candidate_release_id") == pending.get("candidate_release_id")
        and auth.get("candidate_bin_sha256") == pending.get("candidate_sha256")
        and auth.get("rollback_bin_sha256") == contract.get("recovery_sha256")
    ):
        return False
    if installed == pending.get("candidate_release_id"):
        # Continuation authority is distinct from the consumed installation authorization.
        return True
    return auth.get("authorization_id") == pending.get("authorization_id")


def git(args: list[str]) -> str | None:
    try:
        p = subprocess.run(
            ["git", *args],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=5,
            check=True,
        )
    except Exception:
        return None
    return p.stdout.strip()


def repo_identity() -> dict[str, Any]:
    commit = git(["rev-parse", "HEAD"])
    branch = git(["rev-parse", "--abbrev-ref", "HEAD"])
    dirty = git(["status", "--porcelain"])
    if commit:
        return {
            "type": "git_commit",
            "value": commit,
            "branch": branch or None,
            # A timed-out/unavailable status command is unknown, not a clean tree.
            "dirty": None if dirty is None else bool(dirty),
        }

    candidates: list[pathlib.Path] = []
    for base in ("platform", "config", "scripts", "tools", "tests"):
        p = ROOT / base
        if p.is_dir():
            candidates.extend(x for x in p.rglob("*") if x.is_file())
    h = hashlib.sha256()
    for p in sorted(candidates):
        rel = p.relative_to(ROOT).as_posix()
        h.update(rel.encode())
        h.update(b"\0")
        h.update(bytes.fromhex(sha256_file(p)))
    return {
        "type": "source_tree_sha256",
        "value": h.hexdigest(),
        "branch": None,
        "dirty": None,
    }


def workflow_files() -> list[pathlib.Path]:
    if not WORKFLOWS.exists():
        return []
    return sorted(WORKFLOWS.glob("*.json"))


def workflow_by_id(workflow_id: str) -> tuple[pathlib.Path, dict[str, Any]]:
    matches = []
    for path in workflow_files():
        wf = load_json(path)
        if wf.get("id") == workflow_id:
            matches.append((path, wf))
    if not matches:
        raise PlatformError(f"unknown workflow id: {workflow_id}")
    if len(matches) != 1:
        raise PlatformError(f"duplicate workflow id: {workflow_id}")
    return matches[0]


def catalog_system(catalog: dict[str, Any], system_id: str) -> dict[str, Any]:
    matches = [s for s in catalog.get("systems", []) if s.get("id") == system_id]
    if len(matches) != 1:
        raise PlatformError(f"system id must resolve exactly once: {system_id}")
    return matches[0]


def validate_workflow(
    wf: dict[str, Any],
    errors: list[str],
    warnings: list[str],
) -> None:
    wid = str(wf.get("id") or "<missing>")
    stages = wf.get("stages")
    if not isinstance(stages, list) or not stages:
        errors.append(f"{wid}: stages must be a nonempty list")
        return

    ids = [str(s.get("id") or "") for s in stages if isinstance(s, dict)]
    if len(ids) != len(stages) or any(not x for x in ids):
        errors.append(f"{wid}: every stage needs a nonempty id")
    if len(ids) != len(set(ids)):
        errors.append(f"{wid}: duplicate stage ids")

    seen_mutation = False
    for i, stage in enumerate(stages):
        sid = str(stage.get("id") or f"stage-{i}")
        mutation = bool(stage.get("mutation"))
        if mutation:
            seen_mutation = True
            rollback = stage.get("rollback")
            if not isinstance(rollback, dict) or not rollback.get("strategy"):
                errors.append(f"{wid}/{sid}: mutating stage lacks rollback strategy")
            if stage.get("retry_policy") not in {
                "never",
                "explicit_only",
                "idempotent",
            }:
                errors.append(
                    f"{wid}/{sid}: invalid mutating-stage retry policy"
                )
        elif seen_mutation and stage.get("kind") == "preflight":
            warnings.append(f"{wid}/{sid}: preflight appears after mutation")

        budget = stage.get("timeout_budget")
        if budget is not None:
            if not isinstance(budget, dict):
                errors.append(f"{wid}/{sid}: timeout_budget must be an object")
            else:
                try:
                    outer = float(budget["outer_seconds"])
                    calls = int(budget["inner_calls_max"])
                    inner = float(budget["inner_timeout_seconds"])
                    margin = float(budget.get("margin_seconds", 0))
                    required = calls * inner + margin
                    if outer < required:
                        errors.append(
                            f"{wid}/{sid}: outer timeout {outer:g}s is below "
                            f"declared worst-case inner budget {required:g}s"
                        )
                except (KeyError, TypeError, ValueError):
                    errors.append(f"{wid}/{sid}: invalid timeout_budget")

    mutating_indexes = [i for i, s in enumerate(stages) if bool(s.get("mutation"))]
    if mutating_indexes:
        first_mutation = min(mutating_indexes)
        contract = wf.get("prelive_contract")
        if not isinstance(contract, dict):
            errors.append(f"{wid}: mutating workflow lacks prelive_contract")
        else:
            for key in (
                "deterministic_prerequisites_closed_offline",
                "consumer_contract_verified",
                "recovery_proven_before_first_device_mutation",
                "end_to_end_rehearsal_required",
                "exact_pre_mutation_state_capture_required",
            ):
                if contract.get(key) is not True:
                    errors.append(f"{wid}: prelive_contract {key} must be true")
            required_before = contract.get("required_before_stage_id")
            if required_before and required_before not in ids:
                errors.append(f"{wid}: prelive required_before_stage_id is unknown: {required_before}")

        for required_stage in MANDATORY_PRELIVE_STAGES:
            if required_stage not in ids:
                errors.append(f"{wid}: missing mandatory prelive stage {required_stage}")
            elif ids.index(required_stage) >= first_mutation:
                errors.append(
                    f"{wid}: mandatory prelive stage {required_stage} must occur before first mutation"
                )

        if not wf.get("terminal_recovery"):
            errors.append(f"{wid}: mutating workflow lacks terminal_recovery")


def validate_catalog(catalog: dict[str, Any], errors: list[str]) -> None:
    systems = catalog.get("systems")
    if not isinstance(systems, list) or not systems:
        errors.append("catalog: systems must be a nonempty list")
        return

    ids = [str(s.get("id") or "") for s in systems if isinstance(s, dict)]
    if len(ids) != len(systems) or any(not x for x in ids):
        errors.append("catalog: every system needs an id")
    if len(ids) != len(set(ids)):
        errors.append("catalog: duplicate system ids")

    known = set(ids)
    for system in systems:
        sid = system.get("id")
        for dep in system.get("depends_on", []):
            if dep not in known:
                errors.append(f"catalog/{sid}: unknown dependency {dep}")
        for path in system.get("repo_authority_paths", []):
            if not (ROOT / path).exists():
                errors.append(
                    f"catalog/{sid}: missing repo authority path {path}"
                )


def validate_hbnf_coherence(
    errors: list[str],
    warnings: list[str],
) -> None:
    state_path = ROOT / "config/HBNF_CONTROL_STATE.json"
    adapter_cfg = ROOT / "config/HBNF_PACKET20_LIVE_SWEEP_ADAPTER_20261004.json"
    if not state_path.exists():
        return

    state = load_json(state_path)
    installed = str(
        state.get("current_task", {}).get("installed_release") or ""
    )
    # A later, receipt-backed recovery can legitimately supersede the release
    # pinned in the older sweep adapter template. Require both current-state
    # fields and the recovery receipt to agree before treating that as current.
    recovery = state.get("current_task", {}).get(
        "r3_install_rollback_reconciliation", {}
    )
    recovery_is_current = (
        recovery.get("status")
        == "CLOSED__R4_RESTORED_AND_VERIFIED__AUTHORITY_CONSUMED"
        and recovery.get("r4_rollback_sha256")
        == state.get("current_task", {}).get("installed_firmware_sha256")
        == state.get("installed_firmware_sha256")
        and recovery.get("r4_rollback_sha256")
        == state.get("bounded_phase2_r3_live_qualification_authorization", {}).get(
            "rollback_sha256"
        )
    )
    # The exact R6 successor can be reconciled as the installed candidate
    # without changing the historical R7 adapter template. Accept that current
    # identity only when its receipt-backed runtime proof still hashes exactly.
    successor=state.get("r6_audio_cache_successor",{})
    runtime_receipt=successor.get("runtime_reconciliation_receipt") if isinstance(successor,dict) else None
    runtime_receipt_sha=successor.get("runtime_reconciliation_sha256") if isinstance(successor,dict) else None
    reconciled_candidate_is_current=False
    if runtime_receipt and runtime_receipt_sha:
        receipt_path=ROOT/runtime_receipt
        reconciled_candidate_is_current=(
            successor.get("status") in ("CANDIDATE_INSTALLED_QUALIFICATION_PENDING","QUALIFIED_OBJECTIVE_GATES_PASS","QUALIFICATION_FAILED_R4_RECOVERED","QUALIFICATION_HOST_FAILURE_CANDIDATE_REMAINS_UNQUALIFIED")
            and state.get("installed_release")==successor.get("candidate_release_id")==state.get("live_mutation_authorization",{}).get("candidate_release_id")
            and state.get("installed_firmware_sha256")==successor.get("candidate_sha256")==state.get("live_mutation_authorization",{}).get("candidate_sha256")
            and receipt_path.is_file() and sha256_file(receipt_path)==runtime_receipt_sha
        )

    # General current-task reconciliation: the execution cursor is the primary
    # operational checkpoint for exact successor candidates. Validate its
    # hash-bound runtime and transaction receipts instead of teaching the
    # platform about each candidate's historical release label.
    cursor=state.get("execution_cursor",{})
    subject=cursor.get("current_subject",{}) if isinstance(cursor,dict) else {}
    cursor_runtime=subject.get("runtime_readonly_receipt") if isinstance(subject,dict) else None
    cursor_runtime_sha=subject.get("runtime_readonly_sha256") if isinstance(subject,dict) else None
    cursor_tx=subject.get("qualification_result") if isinstance(subject,dict) else None
    cursor_tx_sha=subject.get("qualification_result_sha256") if isinstance(subject,dict) else None
    current_candidate_is_proven=False
    if cursor_runtime and cursor_runtime_sha and cursor_tx and cursor_tx_sha:
        runtime_path=ROOT/cursor_runtime
        tx_path=ROOT/cursor_tx
        try:
            runtime=load_json(runtime_path) if runtime_path.is_file() else {}
            tx=load_json(tx_path) if tx_path.is_file() else {}
            matrix=runtime.get("matrix",{}).get("identity",{})
            candidate_install_receipt_path=subject.get("candidate_install_receipt")
            candidate_install_receipt=ROOT/candidate_install_receipt_path if isinstance(candidate_install_receipt_path,str) else None
            if candidate_install_receipt is not None:
                try:
                    candidate_install_receipt.resolve().relative_to((ROOT/"evidence").resolve())
                except ValueError:
                    candidate_install_receipt=None
            install_receipt=load_json(candidate_install_receipt) if candidate_install_receipt and candidate_install_receipt.is_file() else {}
            install_receipt_proven=(
                install_receipt.get("schema")=="hbnf-cart2-candidate-qualification-transaction-v1"
                and install_receipt.get("candidate_release_id")==installed
                and install_receipt.get("candidate_sha256")==subject.get("installed_sha256")
                and install_receipt.get("candidate_install_attempts")==1
                and install_receipt.get("upload",{}).get("confirmed") is True
                and install_receipt.get("upload",{}).get("http_status")=="200"
                and subject.get("candidate_install_receipt_sha256")
                and sha256_file(candidate_install_receipt)==subject.get("candidate_install_receipt_sha256")
            )
            current_tx_proven=(
                tx.get("candidate_install_attempts")==1
                or (tx.get("schema")=="hbnf-cart2-candidate-qualification-continuation-v1"
                    and tx.get("candidate_install_attempts")==0
                    and tx.get("operation_scope")=="QUALIFICATION_ONLY"
                    and state.get("live_mutation_authorization",{}).get("candidate_attempts_used")==1
                    and state.get("live_mutation_authorization",{}).get("transaction_consumed") is True
                    and install_receipt_proven)
            )
            current_candidate_is_proven=(
                runtime.get("schema")=="cart2-current-matrix-readonly-snapshot-v1"
                and runtime.get("read_only") is True and runtime.get("device_mutations")==0
                and sha256_file(runtime_path)==cursor_runtime_sha
                and sha256_file(tx_path)==cursor_tx_sha
                and subject.get("installed_release_id")==installed
                and subject.get("installed_sha256")==state.get("installed_firmware_sha256")
                and matrix.get("release_id")==installed
                and matrix.get("candidate")==installed
                and matrix.get("mac","").replace(":","").lower()=="704bca5b345c"
                and tx.get("candidate_release_id")==installed
                and tx.get("candidate_sha256")==subject.get("installed_sha256")
                and current_tx_proven
                and tx.get("status") in ("QUALIFICATION_BRIGHTNESS_RESTORE_FAILED",
                    "QUALIFICATION_BRIGHTNESS_SETUP_FAILED_NO_PROFILES",
                    "QUALIFICATION_HOST_FAILURE_CANDIDATE_REMAINS_UNQUALIFIED")
            )
        except (OSError, ValueError, TypeError, AttributeError):
            current_candidate_is_proven=False

    pending_provisional_candidate_is_current = False
    pending = state.get("execution_cursor", {}).get("pending_provisional_candidate", {})
    if isinstance(pending, dict) and pending.get("schema") == "hbnf-pending-provisional-candidate-v1":
        try:
            workflow_path = ROOT / "platform/workflows/phase2-provisional-release.json"
            workflow = load_json(workflow_path)
            contract = workflow.get("provisional_release_contract", {})
            auth = state.get("live_authorization_binding", {})
            candidate_path = ROOT / str(contract.get("candidate_bin_path", ""))
            recovery_path = ROOT / str(contract.get("recovery_bin_path", ""))
            preflight_path = ROOT / str(pending.get("preflight_receipt", ""))
            preflight = load_json(preflight_path) if preflight_path.is_file() else {}
            exact_pending = (
                pending.get("workflow_id") == "phase2-provisional-release"
                and pending.get("workflow_sha256") == sha256_file(workflow_path)
                and pending.get("candidate_release_id") == contract.get("candidate_release")
                and pending.get("candidate_sha256") == contract.get("candidate_sha256")
                and pending.get("candidate_bin_path") == contract.get("candidate_bin_path")
                and pending.get("candidate_size_bytes") == contract.get("candidate_size_bytes")
                and candidate_path.is_file()
                and candidate_path.stat().st_size == pending.get("candidate_size_bytes")
                and sha256_file(candidate_path) == pending.get("candidate_sha256")
                and recovery_path.is_file()
                and sha256_file(recovery_path) == contract.get("recovery_sha256")
                and pending.get("preflight_sha256")
                and sha256_file(preflight_path) == pending.get("preflight_sha256")
                and preflight.get("pass") is True
                and preflight.get("candidate_release_id") == pending.get("candidate_release_id")
                and preflight.get("candidate_sha256") == pending.get("candidate_sha256")
                and preflight.get("rollback_sha256") == contract.get("recovery_sha256")
                and preflight.get("host_on_ac") is True
                and preflight.get("route") == "en0/192.168.77.0/24"
                and preflight.get("matrix", {}).get("release") == contract.get("starting_release_id")
                and preflight.get("matrix", {}).get("mac", "").replace(":", "").lower() == "704bca5b345c"
                and preflight.get("aux", {}).get("live") is True
                and preflight.get("aux", {}).get("mode") == "DDP"
                and preflight.get("aux", {}).get("source") == "192.168.77.10"
                and provisional_pending_authorization_matches(auth, pending, installed, contract)
            )
            if exact_pending and installed == contract.get("starting_release_id"):
                pending_provisional_candidate_is_current = (
                    auth.get("authorization_id") == pending.get("authorization_id")
                    and state.get("installed_firmware_sha256") == contract.get("starting_sha256")
                    and pending.get("candidate_install_attempts_used") in (0, 1)
                    and pending.get("status") in (
                        "LIVE_APPROVED_PENDING_INSTALL", "CANDIDATE_ATTEMPT_CONSUMED",
                        "OTA_NOT_INSTALLED_STARTING_RELEASE_REMAINS_NO_RETRY",
                        "TRANSACTION_EXCEPTION_STARTING_RELEASE_REMAINS",
                    )
                )
            elif exact_pending and installed == pending.get("candidate_release_id"):
                tx_path = ROOT / str(pending.get("transaction_result", ""))
                tx = load_json(tx_path) if tx_path.is_file() else {}
                tx_ok = (
                    pending.get("transaction_result_sha256")
                    and sha256_file(tx_path) == pending.get("transaction_result_sha256")
                    and tx.get("candidate_release_id") == pending.get("candidate_release_id")
                    and tx.get("candidate_sha256") == pending.get("candidate_sha256")
                    and tx.get("candidate_install_attempts") == 1
                )
                pending_provisional_candidate_is_current = bool(
                    tx_ok
                    and state.get("installed_firmware_sha256") == pending.get("candidate_sha256")
                    and tx.get("candidate_runtime", {}).get("matrix_build", {}).get("release_id") == pending.get("candidate_release_id")
                    and tx.get("status") in (
                        "PROVISIONAL_INSTALL_SMOKE_PASS_NOT_FULLY_QUALIFIED",
                        "PROVISIONAL_SMOKE_INCOMPLETE_CANDIDATE_UNQUALIFIED",
                    )
                )
            elif exact_pending and installed == contract.get("recovery_release"):
                tx_path = ROOT / str(pending.get("transaction_result", ""))
                tx = load_json(tx_path) if tx_path.is_file() else {}
                tx_ok = (
                    pending.get("transaction_result_sha256")
                    and sha256_file(tx_path) == pending.get("transaction_result_sha256")
                    and tx.get("candidate_release_id") == pending.get("candidate_release_id")
                    and tx.get("candidate_sha256") == pending.get("candidate_sha256")
                    and tx.get("candidate_install_attempts") == 1
                    and tx.get("recovery", {}).get("status") == "R4_READBACK_VERIFIED"
                )
                pending_provisional_candidate_is_current = bool(
                    tx_ok and state.get("installed_firmware_sha256") == contract.get("recovery_sha256")
                )
        except (OSError, ValueError, TypeError, AttributeError):
            pending_provisional_candidate_is_current = False

    if adapter_cfg.exists():
        # Prefer a frozen Foundation adapter only when both its release ID and
        # expected binary SHA match the last recorded control-state identity.
        # This is record reconciliation, not a claim that the device is
        # currently running that image; live identity still needs readback.
        adapters = [adapter_cfg, *sorted((ROOT / "config").glob("HBNF_FOUNDATION_LIVE_SWEEP_ADAPTER*.json"))]
        recorded_sha = str(state.get("current_task", {}).get("installed_firmware_sha256") or "")
        matching = []
        for candidate_path in adapters:
            if not candidate_path.is_file():
                continue
            try:
                candidate_cfg = load_json(candidate_path)
                args = candidate_cfg.get("preflight_argv", [])
                sha_bound = any(
                    isinstance(args[i], str) and args[i] == "HBNF_EXPECTED_FIRMWARE_SHA256=" + recorded_sha
                    for i in range(max(0, len(args) - 1))
                )
                if (candidate_cfg.get("expected_release_id") == installed
                        and recorded_sha and sha_bound):
                    matching.append(candidate_path)
            except (OSError, ValueError, TypeError):
                continue
        if matching:
            warnings.append(
                "HBNF live adapter reconciled to the last recorded release and SHA; "
                "current installed device identity remains unverified until fresh readback"
            )
        else:
            cfg = load_json(adapter_cfg)
            expected = str(cfg.get("expected_release_id") or "")
            if (installed and expected and installed != expected and not recovery_is_current
                    and not reconciled_candidate_is_current and not current_candidate_is_proven
                    and not pending_provisional_candidate_is_current):
                status = str(state.get("current_task", {}).get("status") or "")
                message = (
                    "HBNF live-tool identity mismatch: control state says "
                    f"installed_release={installed!r} but canonical Packet20 "
                    f"adapter expects {expected!r}; no exact release-and-SHA-bound Foundation adapter found"
                )
                if "RECOVERY" in status:
                    warnings.append(message + " (recovery-only state; diagnostic use remains blocked)")
                else:
                    errors.append(message)

    if state.get("live_mutation_authorized") is True:
        blockers = state.get("current_task", {}).get("blockers", [])
        if not blockers:
            warnings.append(
                "HBNF live mutation is authorized but current_task "
                "has no blockers/next work declared"
            )


def doctor() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    catalog = load_json(CATALOG)
    policies = load_json(POLICIES)
    validate_catalog(catalog, errors)

    seen_workflows: set[str] = set()
    for path in workflow_files():
        wf = load_json(path)
        wid = str(wf.get("id") or "")
        if wid in seen_workflows:
            errors.append(f"duplicate workflow id across files: {wid}")
        seen_workflows.add(wid)
        validate_workflow(wf, errors, warnings)

    for system in catalog.get("systems", []):
        for wid in system.get("golden_paths", []):
            if wid not in seen_workflows:
                errors.append(
                    f"catalog/{system.get('id')}: unknown golden_path {wid}"
                )

    limit = policies.get("process", {}).get(
        "max_consecutive_tooling_blockers_without_product_evidence"
    )
    if limit != 2:
        warnings.append(
            "policy: recommended process-blocker circuit breaker is 2"
        )

    validate_hbnf_coherence(errors, warnings)

    control_validator = ROOT / "scripts/hbnf_control.py"
    if control_validator.is_file():
        try:
            control = subprocess.run(
                [sys.executable, str(control_validator), "status"],
                cwd=ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=10,
                check=False,
            )
            status = json.loads(control.stdout)
            if control.returncode != 0 or status.get("model_valid") is not True:
                details = status.get("validation_errors") or [control.stdout.strip()]
                errors.append("HBNF control-plane validation failed: " + "; ".join(details))
        except Exception as exc:
            errors.append("HBNF control-plane validation unavailable: " + str(exc))

    proof_template = PLATFORM / "templates/PRELIVE_PROOF.template.json"
    if not proof_template.is_file():
        errors.append("platform: missing PRELIVE_PROOF template")
    else:
        template = load_json(proof_template)
        if template.get("schema") != "local-roots-prelive-proof-v1":
            errors.append("platform: invalid PRELIVE_PROOF template schema")

    guard = ROOT / "scripts/hbnf_guarded_run.py"
    if guard.is_file():
        guard_text = guard.read_text()
        for required in ("--capsule", "--prelive-proof", "prelive-check"):
            if required not in guard_text:
                errors.append(f"HBNF guard is missing platform enforcement token {required}")

    critical = PLATFORM / "cart2-critical-path-v1.json"
    if critical.is_file():
        cp = load_json(critical)
        state_path = ROOT / "config/HBNF_CONTROL_STATE.json"
        if state_path.is_file():
            state = load_json(state_path)
            if cp.get("current_lifecycle") != state.get("lifecycle_state"):
                errors.append("Cart2 critical path lifecycle does not match HBNF control state")
        if not cp.get("publication_recovery_invariant"):
            errors.append("Cart2 critical path lacks publication/recovery consumer invariant")

    required_failure_classes = {
        "hidden-build-inputs",
        "timeout-budget-inversion",
        "restore-evidence-loss",
        "credential-transport-surprise",
        "mutable-pointer-role-mismatch",
        "cloud-asset-reconstruction-risk",
        "stale-operational-state",
        "manual-prompt-improvisation",
    }
    actual_failure_classes = set(policies.get("failure_class_regressions", {}))
    missing_failure_classes = sorted(required_failure_classes - actual_failure_classes)
    if missing_failure_classes:
        errors.append("platform: missing failure-class controls: " + ", ".join(missing_failure_classes))

    result = {
        "schema": "local-roots-platform-doctor-v1",
        "ok": not errors,
        "repo_identity": repo_identity(),
        "workflow_count": len(seen_workflows),
        "system_count": len(catalog.get("systems", [])),
        "errors": errors,
        "warnings": warnings,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if not errors else 2


def required_repo_inputs(
    wf: dict[str, Any],
    system: dict[str, Any],
) -> list[str]:
    values: list[str] = []
    for item in system.get("repo_authority_paths", []):
        if item not in values:
            values.append(item)
    for item in wf.get("required_repo_inputs", []):
        if item not in values:
            values.append(item)
    return values


def make_capsule(args: argparse.Namespace) -> int:
    catalog = load_json(CATALOG)
    policies = load_json(POLICIES)
    wf_path, wf = workflow_by_id(args.workflow)
    system = catalog_system(catalog, args.system)

    errors: list[str] = []
    warnings: list[str] = []
    validate_workflow(wf, errors, warnings)
    if errors:
        raise PlatformError(
            "workflow is invalid: " + "; ".join(errors)
        )

    inputs = []
    missing = []
    for rel in required_repo_inputs(wf, system):
        p = ROOT / rel
        if not p.is_file():
            missing.append(rel)
            continue
        inputs.append(
            {
                "path": rel,
                "sha256": sha256_file(p),
                "bytes": p.stat().st_size,
            }
        )
    if missing:
        raise PlatformError(
            "capsule inputs missing: " + ", ".join(missing)
        )

    rid = args.run_id or (
        f"{args.system}-"
        f"{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-"
        f"{uuid.uuid4().hex[:8]}"
    )
    capsule = {
        "schema": "local-roots-execution-capsule-v1",
        "run_id": rid,
        "trace_id": uuid.uuid4().hex,
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "system_id": args.system,
        "workflow_id": args.workflow,
        "repo_identity": repo_identity(),
        "workflow_source": {
            "path": wf_path.relative_to(ROOT).as_posix(),
            "sha256": sha256_file(wf_path),
        },
        "repo_inputs": inputs,
        "external_authorities": system.get("external_authorities", {}),
        "storage_policy": catalog.get("storage_roles", {}),
        "cost_policy": policies.get("cost", {}),
        "user_interaction_policy": policies.get("user_interaction", {}),
        "stages": wf["stages"],
        "terminal_recovery": wf.get("terminal_recovery"),
        "expected_terminal_outputs": wf.get(
            "expected_terminal_outputs", []
        ),
    }

    out = pathlib.Path(args.out).expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(capsule, indent=2, sort_keys=True) + "\n"
    )
    print(
        json.dumps(
            {
                "status": "CAPSULE_CREATED",
                "path": str(out),
                "run_id": rid,
                "warnings": warnings,
            },
            indent=2,
        )
    )
    return 0


def check_capsule(args: argparse.Namespace) -> int:
    cap_path = pathlib.Path(args.capsule).expanduser().resolve()
    cap = load_json(cap_path)
    errors = []

    for item in cap.get("repo_inputs", []):
        p = ROOT / item.get("path", "")
        if not p.is_file():
            errors.append(f"missing {item.get('path')}")
            continue
        actual = sha256_file(p)
        if actual != item.get("sha256"):
            errors.append(
                f"hash mismatch {item.get('path')}: "
                f"expected {item.get('sha256')} got {actual}"
            )

    result = {
        "schema": "local-roots-capsule-check-v1",
        "ok": not errors,
        "run_id": cap.get("run_id"),
        "errors": errors,
        "current_repo_identity": repo_identity(),
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if not errors else 2


def append_event(args: argparse.Namespace) -> int:
    run_dir = pathlib.Path(args.run_dir).expanduser().resolve()
    run_dir.mkdir(parents=True, exist_ok=True)
    path = run_dir / "events.jsonl"
    event = {
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "run_id": args.run_id,
        "trace_id": args.trace_id,
        "stage": args.stage,
        "status": args.status,
        "kind": args.kind,
        "message": args.message,
    }
    with path.open("a", encoding="utf-8") as f:
        f.write(
            json.dumps(
                event,
                separators=(",", ":"),
                sort_keys=True,
            )
            + "\n"
        )
    print(
        json.dumps(
            {"status": "EVENT_RECORDED", "path": str(path)},
            indent=2,
        )
    )
    return 0


def summarize_runs(args: argparse.Namespace) -> int:
    root = pathlib.Path(args.runs_dir).expanduser().resolve()
    summaries = []
    if root.exists():
        for p in root.rglob("RUN_SUMMARY.json"):
            try:
                summaries.append(load_json(p))
            except PlatformError:
                continue

    total = len(summaries)
    passed = sum(
        1 for s in summaries if s.get("outcome") == "PASS"
    )
    failed = sum(
        1 for s in summaries if s.get("outcome") == "FAIL"
    )
    retries = sum(
        int(s.get("retry_count", 0) or 0) for s in summaries
    )
    blockers = sum(
        int(s.get("tooling_blockers", 0) or 0)
        for s in summaries
    )
    user_actions = sum(
        int(s.get("user_actions", 0) or 0)
        for s in summaries
    )
    lead = [
        float(s["lead_time_seconds"])
        for s in summaries
        if isinstance(s.get("lead_time_seconds"), (int, float))
    ]

    result = {
        "schema": "local-roots-platform-metrics-v1",
        "runs": total,
        "passed": passed,
        "failed": failed,
        "pass_rate": (passed / total) if total else None,
        "retry_count": retries,
        "tooling_blockers": blockers,
        "user_actions": user_actions,
        "mean_lead_time_seconds": (
            sum(lead) / len(lead)
        ) if lead else None,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


def validate_prelive_proof(cap_path: pathlib.Path, proof_path: pathlib.Path) -> list[str]:
    cap = load_json(cap_path)
    proof = load_json(proof_path)
    errors: list[str] = []
    if proof.get("schema") != "local-roots-prelive-proof-v1":
        errors.append("invalid prelive proof schema")
    if proof.get("run_id") != cap.get("run_id"):
        errors.append("prelive proof run_id does not match capsule")
    if proof.get("capsule_sha256") != sha256_file(cap_path):
        errors.append("prelive proof capsule_sha256 does not match capsule bytes")
    if proof.get("approved_for_mutation") is not True:
        errors.append("prelive proof is not approved_for_mutation")

    stages = proof.get("stages")
    if not isinstance(stages, dict):
        errors.append("prelive proof stages must be an object")
        stages = {}
    for stage_id in MANDATORY_PRELIVE_STAGES:
        row = stages.get(stage_id)
        if not isinstance(row, dict):
            errors.append(f"prelive proof missing stage {stage_id}")
            continue
        if row.get("status") != "PASS":
            errors.append(f"prelive proof stage {stage_id} is not PASS")
        evidence = row.get("evidence")
        if not isinstance(evidence, list) or not evidence or not all(isinstance(x, str) and x.strip() for x in evidence):
            errors.append(f"prelive proof stage {stage_id} lacks evidence pointers")

    recovery = proof.get("recovery_identity")
    if not isinstance(recovery, dict) or not recovery.get("identity") or not recovery.get("verification"):
        errors.append("prelive proof lacks exact recovery identity/verification")
    prior = proof.get("pre_mutation_state")
    if not isinstance(prior, dict) or not prior:
        errors.append("prelive proof lacks exact pre_mutation_state")
    consumer = proof.get("consumer_contract")
    if not isinstance(consumer, dict) or consumer.get("verified") is not True:
        errors.append("prelive proof consumer_contract is not verified")
    return errors


def prelive_check(args: argparse.Namespace) -> int:
    cap_path = pathlib.Path(args.capsule).expanduser().resolve()
    proof_path = pathlib.Path(args.proof).expanduser().resolve()
    errors = validate_prelive_proof(cap_path, proof_path)
    result = {
        "schema": "local-roots-prelive-check-v1",
        "ok": not errors,
        "run_id": load_json(cap_path).get("run_id") if cap_path.exists() else None,
        "capsule_sha256": sha256_file(cap_path) if cap_path.is_file() else None,
        "proof_sha256": sha256_file(proof_path) if proof_path.is_file() else None,
        "errors": errors,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if not errors else 2


def make_directive(args: argparse.Namespace) -> int:
    cap_path = pathlib.Path(args.capsule).expanduser().resolve()
    cap = load_json(cap_path)
    errors = []
    for item in cap.get("repo_inputs", []):
        p = ROOT / item.get("path", "")
        if not p.is_file() or sha256_file(p) != item.get("sha256"):
            errors.append(item.get("path", "<unknown>"))
    if errors:
        raise PlatformError("cannot generate directive from invalid capsule: " + ", ".join(errors))

    stages = cap.get("stages", [])
    stage_lines = []
    for stage in stages:
        stage_lines.append(
            f"- {stage.get('id')}: {stage.get('kind')} / retry={stage.get('retry_policy')}"
        )
    directive = "\n".join([
        "EXECUTE THIS CAPSULE. DO NOT IMPROVISE THE WORKFLOW.",
        f"Run ID: {cap.get('run_id')}",
        f"Trace ID: {cap.get('trace_id')}",
        f"System: {cap.get('system_id')}",
        f"Workflow: {cap.get('workflow_id')}",
        f"Repository identity: {json.dumps(cap.get('repo_identity'), sort_keys=True)}",
        "",
        "MANDATORY OPERATING RULES:",
        "- Validate the capsule before any mutating or paid step.",
        "- Close every deterministic prerequisite offline before mutation.",
        "- Do not discover build, publication, consumer-contract, timeout, credential, or rollback prerequisites during live execution.",
        "- Live execution may discover only irreducible runtime/physical behavior.",
        "- Do not substitute helpers, configs, artifacts, branches, URLs, or recovery targets.",
        "- Do not retry the same mechanism without new evidence.",
        "- If a required recovery path has not already been proven end-to-end, STOP BEFORE MUTATION.",
        "- Do not use the user as a command/output relay.",
        "- Return only terminal product evidence or one irreducible blocker.",
        "",
        "ORDERED STAGES:",
        *stage_lines,
        "",
        "TERMINAL RECOVERY:",
        str(cap.get("terminal_recovery") or ""),
        "",
        "EXPECTED TERMINAL OUTPUTS:",
        *[f"- {x}" for x in cap.get("expected_terminal_outputs", [])],
    ])
    out = pathlib.Path(args.out).expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(directive + "\n")
    print(json.dumps({"status":"DIRECTIVE_CREATED","path":str(out),"run_id":cap.get("run_id")}, indent=2))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(
        description=(
            "Local Roots minimum viable internal developer platform"
        )
    )
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser(
        "doctor",
        help="Validate catalog, golden paths, and cross-system contracts",
    )

    c = sub.add_parser(
        "capsule",
        help="Create a self-validating execution capsule",
    )
    c.add_argument("--system", required=True)
    c.add_argument("--workflow", required=True)
    c.add_argument("--out", required=True)
    c.add_argument("--run-id")

    cc = sub.add_parser(
        "check-capsule",
        help="Verify a capsule against the current checkout",
    )
    cc.add_argument("--capsule", required=True)

    e = sub.add_parser(
        "event",
        help="Append one correlated structured run event",
    )
    e.add_argument("--run-dir", required=True)
    e.add_argument("--run-id", required=True)
    e.add_argument("--trace-id", required=True)
    e.add_argument("--stage", required=True)
    e.add_argument(
        "--status",
        required=True,
        choices=["STARTED", "PASS", "FAIL", "BLOCKED", "SKIPPED"],
    )
    e.add_argument("--kind", default="execution")
    e.add_argument("--message", default="")

    m = sub.add_parser(
        "metrics",
        help="Summarize run outcomes and toil indicators",
    )
    m.add_argument("--runs-dir", required=True)

    d = sub.add_parser(
        "directive",
        help="Compile a validated capsule into one deterministic worker directive",
    )
    d.add_argument("--capsule", required=True)
    d.add_argument("--out", required=True)

    pc = sub.add_parser(
        "prelive-check",
        help="Fail closed unless deterministic prelive closure is proven",
    )
    pc.add_argument("--capsule", required=True)
    pc.add_argument("--proof", required=True)

    args = ap.parse_args()
    try:
        if args.cmd == "doctor":
            return doctor()
        if args.cmd == "capsule":
            return make_capsule(args)
        if args.cmd == "check-capsule":
            return check_capsule(args)
        if args.cmd == "event":
            return append_event(args)
        if args.cmd == "metrics":
            return summarize_runs(args)
        if args.cmd == "directive":
            return make_directive(args)
        if args.cmd == "prelive-check":
            return prelive_check(args)
    except PlatformError as exc:
        print(
            json.dumps(
                {"status": "FAIL", "error": str(exc)},
                indent=2,
            ),
            file=sys.stderr,
        )
        return 2
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
