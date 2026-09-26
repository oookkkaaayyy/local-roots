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
g++ -std=c++17 -O2 -Wall -Wextra -Werror -pedantic hbnf-game-adapter/test_session_lifecycle.cpp -o /tmp/hbnf-session
/tmp/hbnf-session
node hbnf-uv-control/test_uv_guard.mjs
python3 scripts/hbnf-cart-device-preflight.py --selftest
python3 scripts/hbnf-cart-lan-discover.py --selftest
python3 scripts/hbnf-cart-network-state.py --selftest
python3 scripts/hbnf-cart-uv-pin-plan.py --selftest
python3 scripts/hbnf-cart-postrelease-operator-audit.py
bash -n scripts/HBNF_POST_RELEASE_SETUP.command
bash -n scripts/hbnf-cart-postrelease-overlay.sh
bash -n scripts/FLASH_HBNF_GAME_BRIDGE.command
bash -n scripts/hbnf-cart-postrelease-kit-build.sh
python3 -m py_compile scripts/provision_hbnf_game_bridge.py
python3 -m json.tool config/hbnf-cart-router-manifest.json >/dev/null
grep -q '192.168.8.20' docs/HBNF_CART_ROUTER_STAGING.md
grep -q '192.168.8.21' docs/HBNF_CART_ROUTER_STAGING.md
grep -q '192.168.8.30' docs/HBNF_CART_ROUTER_STAGING.md
grep -q 'never replays a pre-game snapshot' hbnf-game-adapter/ARCHITECTURE.md
grep -q 'never connect UV to SP803E 12V VCC' hbnf-uv-control/README.md
grep -q 'local LAN works with no internet' docs/HBNF_CART_ZERO_DRAMA_POST_RELEASE.md
echo HBNF_PARALLEL_STAGING_QA=PASS

grep -q 'CFG_READONLY' scripts/hbnf-cart-device-preflight.py
grep -q 'SECOND Wi-Fi profile' scripts/HBNF_POST_RELEASE_SETUP.command
