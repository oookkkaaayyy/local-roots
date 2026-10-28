# Opal UV commissioning v1.0.17

Narrow update of three UV Lua handlers for owner-authenticated, three-second, single-output white-channel test pulses and explicit OFF. Existing MANUAL/FOLLOW activation remains gated by the complete verified hardware profile. No AUX firmware, router configuration, Matrix behavior, score data, or cloud route is changed.

The install script requires a one-time PASS admission manifest bound to the exact candidate ZIP and the fresh 20-file Opal baseline. Before mutation it rechecks GL-SFT1200 identity, the running 9443 gateway, Nginx syntax, and all 20 installed hashes. It snapshots the three exact current modules before replacement and reloads only the dedicated gateway. Rollback is pinned to the same admission and restores those exact module bytes.

Acceptance stays separate from installation: owner status and auth, Cart pulse, Bar pulse, safe OFF, activation lock, and cloud boundary are all recorded individually. The pulse is not a firmware watchdog; if Opal/AUX/network fails during a pulse, final state can be unknown and must be checked.
