#!/bin/bash
set -euo pipefail

# Builds the iPhone field kit from the exact final proven firmware runs.
# Does not mutate the cart or Supabase production.

REPO="oookkkaaayyy/local-roots"
MATRIX_RUN="36233161859"
AUX_RUN="36233563104"
MATRIX_EXPECTED="bf8abe71b3e35200705e74c93afad6f89119f9c706d12e0914dc95b2fa4e1493"
AUX_EXPECTED="b3d6cd706bf1a09f5d78f859e9e1e9092d9a86634047f3359cc5594673bdb2f3"

HERE="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v gh >/dev/null || { echo "BLOCKER: gh missing"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "BLOCKER: GitHub auth unavailable"; exit 1; }

mkdir -p "$TMP/matrix" "$TMP/aux"
gh run download "$MATRIX_RUN" -R "$REPO" -n HBNF-WLED16-WOW-MAX-V3 -D "$TMP/matrix"
gh run download "$AUX_RUN" -R "$REPO" -n HBNF-SP803E-AUX-R3 -D "$TMP/aux"

MATRIX_BIN="$TMP/matrix/HBNF_WLED16_MAX_WOWMAX_V3.bin"
AUX_BIN="$TMP/aux/HBNF_SP803E_AUX_R3.bin"
[[ -s "$MATRIX_BIN" && -s "$AUX_BIN" ]] || { echo "BLOCKER: expected firmware files missing"; exit 1; }

MATRIX_SHA="$(shasum -a 256 "$MATRIX_BIN" | awk '{print $1}')"
AUX_SHA="$(shasum -a 256 "$AUX_BIN" | awk '{print $1}')"

[[ "$MATRIX_SHA" == "$MATRIX_EXPECTED" ]] || { echo "BLOCKER: Matrix SHA mismatch $MATRIX_SHA"; exit 1; }
[[ "$AUX_SHA" == "$AUX_EXPECTED" ]] || { echo "BLOCKER: AUX SHA mismatch $AUX_SHA"; exit 1; }

"$HERE/PREPARE_HBNF_PHONE_INSTALL.command" "$MATRIX_BIN" "$AUX_BIN"

echo
echo "HBNF_PHONE_FIELD_KIT_FROM_PROVEN_RUNS=PASS"
echo "MATRIX_RUN=$MATRIX_RUN"
echo "AUX_RUN=$AUX_RUN"
