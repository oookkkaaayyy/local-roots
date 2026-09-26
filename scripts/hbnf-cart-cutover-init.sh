#!/usr/bin/env bash
set -euo pipefail
# Schema migration is separate. This script seeds state and profiles only; it never activates the fence.
: "${DATABASE_URL:?Set DATABASE_URL to the intended production database only during approved cutover}"
: "${INITIAL_CART_STATE_JSON:?Path to reviewed read-only known-good cart state JSON is required}"
: "${CART_OPERATOR_USER_ID:?Existing Supabase Auth user UUID is required}"
: "${HBNF_CART_RELEASE_ID:?Release ID is required}"
: "${HBNF_CART_RELEASE_ARTIFACT_ID:?Artifact ID is required}"
: "${HBNF_CART_RELEASE_SHA256:?Verified release SHA-256 is required}"
: "${HBNF_MATRIX_FIRMWARE_SHA256:?Verified Matrix SHA-256 is required}"
: "${HBNF_AUX_FIRMWARE_SHA256:?Verified AUX SHA-256 is required}"
: "${MATRIX_BRIGHTNESS:?Read-back Matrix brightness is required}"
: "${AUX_BRIGHTNESS:?Read-back AUX brightness is required}"

python3 - "$INITIAL_CART_STATE_JSON" "$MATRIX_BRIGHTNESS" "$AUX_BRIGHTNESS" <<'PY'
import json, pathlib, re, sys
state=json.loads(pathlib.Path(sys.argv[1]).read_text())
for i, value in zip(("matrix","aux"), sys.argv[2:]):
    brightness=int(value)
    profile=state.get("devices",{}).get(i,{})
    if not 0 <= brightness <= 255 or profile.get("brightness") != brightness or profile.get("brightnessLocked") is not True:
        raise SystemExit(f"{i} sticky brightness does not match reviewed readback")
if state.get("cartId") != "hbnf-cart" or state.get("revision") != 0:
    raise SystemExit("state must be the reviewed revision-0 hbnf-cart bootstrap snapshot")
if state.get("power") not in ("off","on"):
    raise SystemExit("cart power state missing or invalid")
for name in ("HBNF_CART_RELEASE_SHA256","HBNF_MATRIX_FIRMWARE_SHA256","HBNF_AUX_FIRMWARE_SHA256"):
    if not re.fullmatch(r"[0-9a-f]{64}", __import__("os").environ[name]):
        raise SystemExit(f"{name} must be a lowercase 64-character SHA-256")
PY

state_json="$(<"$INITIAL_CART_STATE_JSON")"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v initial_state_json="$state_json" \
  -v matrix_brightness="$MATRIX_BRIGHTNESS" -v aux_brightness="$AUX_BRIGHTNESS" \
  -v operator_user_id="$CART_OPERATOR_USER_ID" -v release_id="$HBNF_CART_RELEASE_ID" \
  -v release_artifact_id="$HBNF_CART_RELEASE_ARTIFACT_ID" \
  -v release_sha256="$HBNF_CART_RELEASE_SHA256" \
  -v matrix_sha256="$HBNF_MATRIX_FIRMWARE_SHA256" -v aux_sha256="$HBNF_AUX_FIRMWARE_SHA256" \
  -f scripts/hbnf-cart-production-cutover-init.sql
