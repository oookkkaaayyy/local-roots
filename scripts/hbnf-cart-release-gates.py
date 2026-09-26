#!/usr/bin/env python3
import hashlib, json, re, sys
from pathlib import Path

root = Path(".")
def fail(message):
    raise SystemExit(f"FAIL: {message}")
def require(path):
    p = root / path
    if not p.is_file() or p.stat().st_size == 0:
        fail(f"required release source missing: {path}")
    return p
def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

control = require("release/source/hbnf-cart-control/index.ts").read_text()
require("release/source/hbnf-cart-control/deno.json")
reconcile = require("release/source/hbnf-cart-reconcile/index.ts").read_text()
require("release/source/hbnf-cart-reconcile/deno.json")
production_migration = require("release/source/20260926080000_hbnf_cart_core_production.sql")
staging_migration = require("release/source/20260926053151_hbnf_cart_shadow_staging.sql")
require("release/source/20260926070000_hbnf_cart_parity_inert_staging.sql")
if production_migration.resolve() == staging_migration.resolve() or production_migration.read_bytes() == staging_migration.read_bytes():
    fail("staging-only migration was substituted for production migration")
sql = production_migration.read_text()
code = re.sub(r"/\*.*?\*/|--[^\n]*", "", sql, flags=re.S).lower()
for token in ("hbnf_cart_commit_command", "cart_desired_state", "cart_device_observed",
              "cart_command_receipts", "cart_actuator_fence", "cart_operator_allowlist",
              "cart_cutover_readiness"):
    if token not in code:
        fail(f"production migration missing required object: {token}")
if not re.search(r"insert into hbnf_internal\.cart_actuator_fence[^;]*values\s*\(\s*'hbnf-cart'\s*,\s*1\s*,\s*'hbnf-cart-foundation-v1-20260925'\s*,\s*false\s*\)", code, re.S):
    fail("migration must seed only the expected inactive fence")
if not re.search(r"cart_actuator_fence\s*\([^;]*?active\s+boolean\s+not\s+null\s+default\s+false", code, re.S):
    fail("actuator fence must default inactive")
for forbidden in (r"active\s*=\s*true",
                  r"\bmqtt\b", r"\bhttps?://", r"\bfetch\s*\(", r"pg_net",
                  r"hbnf-matrix-control", r"hbnf-aux-control", r"network\s+request"):
    if re.search(forbidden, code, re.I):
        fail(f"production migration contains activation or actuation marker: {forbidden}")
if "enable row level security" not in code or "revoke all on all tables" not in code:
    fail("production tables are missing private-schema access hardening")
if "grant execute" not in code or "to service_role" not in code:
    fail("service-role RPC grant is missing")

for slug in ("hbnf-cart-control-parity-staging", "hbnf-cart-reconcile-parity-staging",
             "hbnf-matrix-adapter-inert-staging", "hbnf-aux-adapter-inert-staging"):
    require(f"release/source/{slug}/index.ts")
for path in (
    "release/source/scripts/hbnf-cart-production-cutover-init.sql",
    "release/source/scripts/hbnf-cart-production-activate.sql",
    "release/source/scripts/hbnf-cart-production-readiness.sql",
    "release/source/scripts/hbnf-cart-cutover-init.sh",
    "release/source/scripts/hbnf-cart-migration-dry-run.sh",
    "release/source/scripts/hbnf-cart-projection-preflight.mjs",
    "release/source/scripts/hbnf-cart-release-gates.py",
    "release/source/docs/HBNF_CART_PRODUCTION_CUTOVER.md",
):
    require(path)

baseline = json.loads(require("release/rollback/CURRENT_LIVE_CONTROL_BASELINE.json").read_text())
expected = {
    "hbnf-matrix-control": (171, "0085af32c25a1218913d9e7c80483f542efa5e5e3e64180702f7d50c10f51304"),
    "hbnf-aux-control": (14, "b9a4bf32cd5b7ec1f69c4b0a1e38e57d7b8f67061548d124778ea4ae318da8b6"),
    "hbnf-cart-orchestrator": (5, "d941c7e9143722d0b55e0079423a81b963bfac620afbb99d4d3f972ca65f488b"),
}
for name, (version, digest) in expected.items():
    item = next((x for x in baseline["controls"] if x["slug"] == name), None)
    if not item or item["activeVersion"] != version or item["ezbrSha256"] != digest:
        fail(f"rollback baseline identity mismatch: {name}")
for path in (
    "release/rollback/supabase-functions/hbnf-matrix-control-v171/index.ts",
    "release/rollback/supabase-functions/hbnf-matrix-control-v171/shared.ts",
    "release/rollback/supabase-functions/hbnf-aux-control-v14/index.ts",
    "release/rollback/supabase-functions/hbnf-cart-orchestrator-v5/index.ts",
    "release/source/production-control-baseline/hbnf-matrix-control-v171/index.ts",
    "release/source/production-control-baseline/hbnf-aux-control-v14/index.ts",
):
    require(path)

firmware = (
    ("release/firmware/matrix", "HBNF_WLED16_MAX_WOWMAX_V3.bin",
     "761a83f2b34f69eaa6ec3a87bcf8b1201c40c41c9d51220284c984f2d8146b8d"),
    ("release/firmware/aux", "HBNF_SP803E_AUX_R3.bin",
     "b2ef3045f00e37cdf6e6e4f9864ef831fae59ab5636cf37780b2dbada3e767d4"),
)
for directory, filename, expected_hash in firmware:
    binary = require(f"{directory}/{filename}")
    manifest = require(f"{directory}/firmware-sha256.txt").read_text().split()[0]
    actual = sha(binary)
    if manifest != expected_hash or actual != expected_hash:
        fail(f"matched firmware identity mismatch: {filename} expected {expected_hash}, metadata {manifest}, binary {actual}")

for directory, expected_hash, expected_size in (
    ("release/rollback/firmware/matrix-r2", "e81adb8523cf3a875d3ce05962d538b7c6cf3f178bfeaf42833678b9c4cd5d10", 1353296),
    ("release/rollback/firmware/aux-r3", "2a70872fd2373a8ecdcd98c8c73c2e8d871dc902c92599f85081895fe98f744e", 1342288),
):
    root_dir = root / directory
    bins = list(root_dir.rglob("*.bin"))
    if not bins:
        fail(f"rollback firmware missing: {directory}")
    for image in bins:
        if image.stat().st_size != expected_size or sha(image) != expected_hash:
            fail(f"rollback firmware identity mismatch: {image}")

print("RELEASE_GATES=PASS")
print("production_sources=present")
print("production_migration=inert-and-distinct")
print("rollback_sources_and_firmware=verified")
print("matrix_sha256=761a83f2b34f69eaa6ec3a87bcf8b1201c40c41c9d51220284c984f2d8146b8d")
print("aux_sha256=b2ef3045f00e37cdf6e6e4f9864ef831fae59ab5636cf37780b2dbada3e767d4")
