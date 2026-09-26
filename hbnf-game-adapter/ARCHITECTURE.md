# HBNF game adapter — canonical-safe staging architecture

Status: isolated branch only. Nothing here deploys, flashes, changes Supabase, or changes Matrix/AUX networking.

## Boundary
The canonical cart system remains the only owner of persistent cart state: OFF/ON, Matrix/AUX brightness, program/scene/palette, overlays, music semantics, and the Matrix -> AUX follower relationship.

The game bridge owns only a temporary WLED realtime visual stream. It never writes a preset, scene, brightness, power state, AUX state, or historical restore snapshot.

## Runtime contract
1. Start only with a fresh safe observation: cart ON, Matrix online, observed revision caught up.
2. Stream the 32x16 framebuffer to Matrix by DDP UDP/4048.
3. Global OFF, Matrix loss, stale canonical observation, or controller watchdog expiry stops DDP immediately.
4. Canonical brightness remains authoritative. DDP carries RGB only and never writes master brightness.
5. Canonical music/show state continues underneath. AUX stays on the canonical follower path; the bridge never controls AUX.
6. Exit stops DDP and lets WLED realtime end. The bridge never replays a pre-game snapshot.
7. Canonical changes made during a game are therefore the state visible after the realtime lease ends.

## Overlay semantics
Game is a visual lease, not a queue. Current canonical overlays/state are never deleted or rewritten by the bridge. V1 may temporarily obscure a normal visual overlay while playing; global OFF is never obscured because the guard terminates the lease fail-closed.

## Watchdogs
- canonical safety stale: 1.2 s -> stop DDP
- controller absent: 2.2 s -> stop DDP
- user exit: immediate stop
- bridge crash/reboot: packets cease; WLED resumes after realtime timeout
- no restore command is ever sent

## Initial games
- Snake
- 2-player Pong

The prior games-lab pure game core and DDP encoder are reused byte-for-byte. Expansion does not change the safety boundary.
