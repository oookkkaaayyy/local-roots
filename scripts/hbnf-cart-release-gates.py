#!/usr/bin/env python3
import hashlib, json, re, shutil, sys
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
matrix_adapter = require("release/source/hbnf-matrix-adapter/index.ts").read_text()
aux_adapter = require("release/source/hbnf-aux-adapter/index.ts").read_text()
for name, source in (("control", control), ("reconcile", reconcile), ("matrix", matrix_adapter)):
    if re.search(r"""[.]schema[(]["']hbnf_internal["'][)]""", source):
        fail(f"{name} production source uses unexposed hbnf_internal through PostgREST")
if "inert" in matrix_adapter.lower() or "inert" in aux_adapter.lower():
    fail("production adapter source contains inert staging marker")
if "hbnf-matrix-adapter" not in reconcile or "hbnf-aux-adapter" not in reconcile:
    fail("production reconciler is not bound to release-matched production adapters")
if not re.search(r"\baudio\s*:\s*\{", reconcile):
    fail("production reconciler projection is missing required audio semantics")
for forbidden in ("HBNF_MATRIX_ADAPTER_URL", "HBNF_AUX_ADAPTER_URL", "HBNF_MATRIX_ADAPTER_TOKEN", "HBNF_AUX_ADAPTER_TOKEN"):
    if forbidden in reconcile:
        fail(f"unresolved production adapter dependency remains: {forbidden}")
for name, source in (("matrix", matrix_adapter), ("aux", aux_adapter)):
    if "SUPABASE_SERVICE_ROLE_KEY" not in source:
        fail(f"{name} production adapter is missing protected internal authentication")
    if "cartRevision" not in source or "fenceEpoch" not in source or "confirmed" not in source:
        fail(f"{name} production adapter is missing projection acknowledgement contract")
production_migration = require("release/source/20260926080000_hbnf_cart_core_production.sql")
bridge_source = require("supabase/migrations/20260926215500_hbnf_cart_private_schema_rpc_bridge.sql")
bridge_packaged = root / "release/source/20260926215500_hbnf_cart_private_schema_rpc_bridge.sql"
shutil.copy2(bridge_source, bridge_packaged)
bridge_migration = require("release/source/20260926215500_hbnf_cart_private_schema_rpc_bridge.sql")
bridge_code = re.sub(r"/\*.*?\*/|--[^\n]*", "", bridge_migration.read_text(), flags=re.S).lower()
for token in (
    "hbnf_cart_operator_is_allowed", "hbnf_cart_get_status", "hbnf_cart_get_context",
    "hbnf_cart_commit_command_bridge", "hbnf_cart_get_observed", "hbnf_cart_upsert_observed",
):
    if token not in bridge_code:
        fail(f"private-schema bridge migration missing required RPC: {token}")
if "from public, anon, authenticated" not in bridge_code or "to service_role" not in bridge_code:
    fail("private-schema bridge is not restricted to service_role")
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
ui_html = require("release/source/web/hbnf-cart.html").read_text()
ui_js = require("release/source/web/hbnf-cart.js").read_text()
ui_deploy = require("release/source/web/DEPLOY_HBNF_CART_UI.command").read_text()
ui_manifest = json.loads(require("release/source/web/hbnf-cart-manifest.webmanifest").read_text())
if "hbnf-cart-canonical-v1" not in ui_html:
    fail("canonical cart UI build marker missing")
for token in ("createClient", "phcpbvuqibyarpfrftgx.supabase.co", "sb_publishable_", "auth.getSession()", "functions/v1/hbnf-cart-control"):
    if token not in ui_js:
        fail(f"canonical cart UI missing authenticated control requirement: {token}")
if "hbnf-cart-orchestrator" in ui_js:
    fail("canonical cart UI still routes through legacy orchestrator")
for token in ("hbnf-cart.html", "hbnf-cart.js", "CANONICAL_CART_UI_DEPLOY=PASS"):
    if token not in ui_deploy:
        fail(f"canonical cart UI deploy script missing: {token}")
if "matrix-control.js" in ui_deploy:
    fail("canonical cart UI deploy script must not publish the legacy Matrix controller")
if ui_manifest.get("start_url") != "/hbnf-cart.html":
    fail("canonical cart PWA start_url is not /hbnf-cart.html")

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

def parse_metrics(path):
    out = {}
    for line in require(path).read_text().splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out

firmware = (
    ("release/firmware/matrix", "HBNF_WLED16_MAX_WOWMAX_V3.bin", "registry28-semantic-tempo-v6-colorwifi"),
    ("release/firmware/aux", "HBNF_SP803E_AUX_R3.bin", "registry28-semantic-tempo-1d-v4-colorwifi"),
)
resolved_firmware = {}
for directory, filename, expected_witness in firmware:
    binary = require(f"{directory}/{filename}")
    manifest = require(f"{directory}/firmware-sha256.txt").read_text().split()[0]
    metrics = parse_metrics(f"{directory}/FINAL_METRICS.txt")
    actual = sha(binary)
    metric_sha = metrics.get("firmware_sha256")
    if manifest != actual or metric_sha != actual:
        fail(f"firmware checksum disagreement: {filename} manifest={manifest} metrics={metric_sha} binary={actual}")
    metric_bytes = int(metrics.get("firmware_bytes", "-1"))
    if metric_bytes != binary.stat().st_size:
        fail(f"firmware size disagreement: {filename}")
    if directory.endswith("/aux") and metrics.get("build_witness") != expected_witness:
        fail(f"AUX build witness mismatch: {metrics.get('build_witness')} expected {expected_witness}")
    resolved_firmware[filename] = actual

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
print(f"matrix_sha256={resolved_firmware['HBNF_WLED16_MAX_WOWMAX_V3.bin']}")
print(f"aux_sha256={resolved_firmware['HBNF_SP803E_AUX_R3.bin']}")
