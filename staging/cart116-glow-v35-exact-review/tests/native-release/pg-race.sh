#!/usr/bin/env bash
set -euo pipefail
: "${PG_CONTAINER:?local Docker Postgres 17 service only}"
PSQL=(docker exec -i "$PG_CONTAINER" psql -X -q -U postgres -d postgres -v ON_ERROR_STOP=1)
# No data from production, secrets, or external endpoints.
"${PSQL[@]}" < "$(dirname "$0")/pg-setup.sql"
"${PSQL[@]}" < "$(dirname "$0")/../../migrations/20261103_cart_glow_overlay_v1_REVIEW_ONLY.sql"
"${PSQL[@]}" < "$(dirname "$0")/pg-native.sql"
# Create two true independent Postgres sessions after a verified restored case.
# Both race the unique open challenge and advisory lock, so exactly one must win.
mktempdir="$(mktemp -d)"
trap 'rm -rf "$mktempdir"' EXIT
race_sql="SET ROLE service_role; SET request.jwt.claim.role='service_role'; SELECT public.hbnf_cart_glow_overlay_v1_issue('opal-hbnf-cart',7,3,'test-release-123','glow-20261103-nativecase','hbnf-fedcba9876543210fedcba9876543210',2000,repeat('b',64));"
"${PSQL[@]}" -c "$race_sql" > "$mktempdir/a.out" 2> "$mktempdir/a.err" & p1=$!
"${PSQL[@]}" -c "$race_sql" > "$mktempdir/b.out" 2> "$mktempdir/b.err" & p2=$!
a=0; b=0
wait "$p1" && a=1 || :
wait "$p2" && b=1 || :
if (( a + b != 1 )); then cat "$mktempdir"/*.err >&2; echo "PG FAILED: race granted $((a + b)) challenges, expected one" >&2; exit 1; fi
"${PSQL[@]}" -c "DO \$t\$ BEGIN IF (SELECT count(*) FROM hbnf_internal.cart_glow_overlay_challenges_v1 WHERE restored_at IS NULL) <> 1 THEN RAISE EXCEPTION 'race incorrect open count'; END IF; END \$t\$;" > /dev/null
# Demonstrate rollback inverse must NOT remove unresolved challenge rows.
if "${PSQL[@]}" < "$(dirname "$0")/../../migrations/20261103_cart_glow_overlay_v1_REVIEW_ONLY.down.sql" > "$mktempdir/down.out" 2> "$mktempdir/down.err"; then
 echo 'PG FAILED: rollback deleted unresolved challenge'; exit 1
fi
"${PSQL[@]}" -c "DO \$t\$ BEGIN IF to_regclass('hbnf_internal.cart_glow_overlay_challenges_v1') IS NULL THEN RAISE EXCEPTION 'rollback incorrectly dropped table'; END IF; END \$t\$;" > /dev/null
printf 'PG PASS: two independent clients -> exactly one challenge; rollback blocked while unresolved\n'
