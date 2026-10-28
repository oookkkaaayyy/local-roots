# Owner local UV access v1.0.21

Fixes the v1.0.20 integration gap: the gateway authenticates in Nginx access phase before the UV handler runs. The exact Cart-local origin bypass is now applied in `auth_owner.lua` only for `/api/aux/uv-status` and `/api/aux/uv-policy`; public-origin Owner pairing and all other routes remain unchanged. The two UV handlers retain their strict checks and fixed hardware scope.

Install only through the one-time admission manifest and `install.sh`. The installer verifies the exact live 20-file baseline, retains a full rollback image and prior versions of the three changed Lua files, checks local read-only status and invalid-mode rejection before dispatch, confirms public pairing and unknown-origin denial, and writes a readback receipt. No valid UV output command is issued.
