# Owner local UV lock isolation v1.0.23

Fixes the live 429 `uv_commissioning_test_in_progress` response that persists after a dedicated gateway restart. The UV command lock now uses its own Nginx shared-memory zone rather than sharing the small Owner-auth rate-limit zone. Both ordinary UV policy updates and the bounded commissioning test use this same dedicated lock. No UV safety or hardware profile gate is relaxed.

The install updates the exact live baseline's Nginx server include with one additive 8 KiB shared dictionary and changes the UV policy lock lookup. It snapshots the exact current four files, retains the full 20-file rollback, validates the candidate config, reloads only the dedicated gateway, and checks local UV status, invalid-command rejection, public pairing, and unknown-origin denial. The installer does not issue a valid UV output command.
