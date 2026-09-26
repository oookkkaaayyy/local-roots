#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
g++ -std=c++17 -O2 -Wall -Wextra -Werror -pedantic hbnf-game-adapter/test_game_core.cpp -o /tmp/hbnf-game-core
/tmp/hbnf-game-core
g++ -std=c++17 -O2 -Wall -Wextra -Werror -pedantic hbnf-game-adapter/test_ddp_frame.cpp -o /tmp/hbnf-ddp
/tmp/hbnf-ddp
g++ -std=c++17 -O2 -Wall -Wextra -Werror -pedantic hbnf-game-adapter/test_game_lease_guard.cpp -o /tmp/hbnf-lease
/tmp/hbnf-lease
node hbnf-uv-control/test_uv_guard.mjs
grep -q '192.168.8.20' docs/HBNF_CART_ROUTER_STAGING.md
grep -q '192.168.8.21' docs/HBNF_CART_ROUTER_STAGING.md
grep -q '192.168.8.30' docs/HBNF_CART_ROUTER_STAGING.md
grep -q 'never replays a pre-game snapshot' hbnf-game-adapter/ARCHITECTURE.md
grep -q 'never connect UV to SP803E 12V VCC' hbnf-uv-control/README.md
echo HBNF_PARALLEL_STAGING_QA=PASS
