#!/bin/sh
set -eu
BASE=/etc/hbnf-local-control
STATE=/etc/hbnf-local-control-state
CONF=/etc/nginx/conf.d/hbnf-owner-local-control.conf
TARGET=/www/mission-control-local/local-transport.js
BACKUP=/root/hbnf-owner-local-control.rollback-20261015
CANDIDATE_TRANSPORT_SHA=51e4f03ff1ffc9d8cece0a3e6f14fefac77e642fe1a4eced95ca749d777f676a
fail(){ echo "ROLLBACK BLOCKED: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || fail "run as root"
[ -f "$BACKUP/local-transport.js" ] || fail "exact pre-install transport snapshot missing"
[ -f "$TARGET" ] || fail "installed transport missing"
actual=$(sha256sum "$TARGET" | awk '{print $1}')
[ "$actual" = "$CANDIDATE_TRANSPORT_SHA" ] || fail "installed transport changed after release; preserve files and inspect manually"
cp -p "$BACKUP/local-transport.js" "$TARGET.rollback"
cmp -s "$BACKUP/local-transport.js" "$TARGET.rollback" || fail "rollback copy verification failed"
mv "$TARGET.rollback" "$TARGET"
rm -f "$CONF"
rm -rf "$BASE/lua" "$STATE"
nginx -t || fail "restored configuration test failed; do not reload"
nginx -s reload || fail "Nginx reload failed after restoring old transport"
actual=$(sha256sum "$TARGET" | awk '{print $1}')
[ "$actual" = "a91e84c89a481739f9c47c619a1d3c5c35d690869c54159486d528d3863c746e" ] || fail "restored transport hash mismatch"
echo "ROLLBACK_VERIFIED: previous Opal Mission Control transport restored; existing Skins relay and Matrix firmware were not modified."
