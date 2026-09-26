#!/usr/bin/env bash
set -euo pipefail
REPO="${HBNF_REPO:-$PWD}"
STAGING_BRANCH="${HBNF_STAGING_BRANCH:-hbnf-cart-parallel-staging-20260926}"
STAGING_BASE="${HBNF_STAGING_BASE:-37e2a59a65aefd7f00777a9043692785e20c9c41}"
ACCEPTED_SHA="${1:-${HBNF_ACCEPTED_RELEASE_SHA:-}}"
[[ "$ACCEPTED_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "ERROR: exact accepted 40-char release SHA required" >&2; exit 2; }

git -C "$REPO" rev-parse --git-dir >/dev/null
git -C "$REPO" fetch --quiet origin "$STAGING_BRANCH:refs/remotes/origin/$STAGING_BRANCH"
git -C "$REPO" cat-file -e "$ACCEPTED_SHA^{commit}"
git -C "$REPO" merge-base --is-ancestor "$STAGING_BASE" "$ACCEPTED_SHA" || {
  echo "ERROR: accepted release does not descend from staging base" >&2; exit 3;
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git -C "$REPO" diff --name-only "$STAGING_BASE" "$ACCEPTED_SHA" | LC_ALL=C sort -u > "$TMP/release.paths"
git -C "$REPO" diff --name-only "$STAGING_BASE" "origin/$STAGING_BRANCH" | LC_ALL=C sort -u > "$TMP/staging.paths"
comm -12 "$TMP/release.paths" "$TMP/staging.paths" > "$TMP/collisions"
if [[ -s "$TMP/collisions" ]]; then
  echo "ERROR: release/staging path collision; refusing automatic overlay:" >&2
  cat "$TMP/collisions" >&2
  exit 4
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BRANCH="hbnf-cart-postrelease-$STAMP"
WT="${HBNF_POSTRELEASE_WORKTREE:-$(dirname "$REPO")/HBNF-CART-POSTRELEASE-$STAMP}"
[[ ! -e "$WT" ]] || { echo "ERROR: worktree path already exists: $WT" >&2; exit 5; }
git -C "$REPO" worktree add -b "$BRANCH" "$WT" "$ACCEPTED_SHA" >/dev/null
COMMITS="$(git -C "$REPO" rev-list --reverse "$STAGING_BASE..origin/$STAGING_BRANCH")"
[[ -n "$COMMITS" ]] || { echo "ERROR: no staging commits found" >&2; exit 6; }
for c in $COMMITS; do git -C "$WT" cherry-pick "$c" >/dev/null; done
bash "$WT/scripts/hbnf-cart-parallel-staging-qa.sh"
printf 'HBNF_POSTRELEASE_OVERLAY=PASS\nBRANCH=%s\nWORKTREE=%s\nBASE_ACCEPTED_SHA=%s\nSTAGING_HEAD=%s\n'   "$BRANCH" "$WT" "$ACCEPTED_SHA" "$(git -C "$REPO" rev-parse origin/$STAGING_BRANCH)"
