# Owner local UV access v1.0.22

This is the installable correction for the v1.0.21 failed readback: Nginx caches `access_by_lua_file` handlers in its workers, so replacing `auth_owner.lua` alone does not activate the new exact-route rule. This package gracefully reloads only the dedicated Opal gateway after replacing the three source-bound Lua files, then checks the local read-only status route. If a check fails, it restores the exact prior three Lua files and reloads the gateway again.

The local pairing exception applies only to exact Cart-local Origin `http://192.168.77.1` and the two UV routes. Public-origin pairing, unknown-origin denial, fixed UV segments, commissioning gates, and output-off behavior remain unchanged. Installation tests issue no valid output command.
