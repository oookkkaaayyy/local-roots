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
            "dirty": bool(dirty),
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

    if any(bool(s.get("mutation")) for s in stages):
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

    if adapter_cfg.exists():
        cfg = load_json(adapter_cfg)
        expected = str(cfg.get("expected_release_id") or "")
        if installed and expected and installed != expected:
            errors.append(
                "HBNF live-tool identity mismatch: control state says "
                f"installed_release={installed!r} but canonical Packet20 "
                f"adapter expects {expected!r}"
            )

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
