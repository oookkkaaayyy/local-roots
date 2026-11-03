# Controls #116 — NEW managed outbound Glow bridge (PENDING, never auto-install)

Scope: replace the **unproven installed-relay replacement assumption** with one
new Controls-owned, outbound-only service. The direct Matrix WebSocket Owner
page remains separate and is not restarted, reconfigured, proxied or modified
by the service. Existing seven Owner/Safari12/Networking candidate files stay
byte-identical to the accepted previous review package.

## Source and installed evidence

- GitHub #116 owner clarification 6614692694, physical capture 6613457326,
  current correct-path readback 6614401763, Owner direct WS 6614414732.
- **ABSENT, timestamp-scoped:** `/usr/libexec/hbnf-matrix-relay`,
  `/etc/init.d/hbnf-matrix-relay`, historical `/usr/lib/hbnf-glow-overlay-v1.sh`.
  No matching named relay process seen. The new different name is not
  independently inventoried: `/usr/libexec/hbnf-cart-glow-bridge`,
  `/etc/init.d/hbnf-cart-glow-bridge`, and
  `/usr/libexec/hbnf-cart-glow-provision` require fresh absent-state proof.
- Seven existing file target hashes match the original v1.0.20 installed
  preimages at November 3 capture time. Their exact originals are protected by
  the preserved 21-file `rollback/owner-v120-exact.tar.gz` and external JS.
- Matrix physical state: `ps=-1`, two FX142 segments, HBNF.effectId142,
  HBNF.matrixBrightness=0 and auxBrightness=0. Neither source/native overlay
  independent rendering nor field Owner priority is accepted; **fail closed**.
- AUX: exactly 22 RGB GPIO16 plus 2 separate GPIO25/26 PWM buses, both OFF,
  total configured 24. Never normalize to 22 or write PWM config/state.

## Proposed managed target inventory

11 packaged Opal targets: 4 new executable/init/helper/provision assets and the
7 prior accepted PWA/Networking assets. One additional **generated** target,
`/etc/hbnf-cart-glow-bridge.conf`, is absent/unknown until phase0 and is NEVER
included in any ZIP, public repository, backup TAR or diagnostic receipt.

There is no preexisting Owner relay to replace. A new procd service
`/etc/init.d/hbnf-cart-glow-bridge` runs only the new single outgoing
`/usr/libexec/hbnf-cart-glow-bridge`; it never launches the legacy v35
`op=next/check` paired full-state actuator. No second poller or LAN listener.
The service uses a root-owned one-process lock and checks known conflicting
historical cloud relay paths. On WAN failure it backs off 15s; when healthy it
cycles no more frequently than 4s. Boot/reconnect only reuses a persisted
non-secret challenge cursor and persistent failure lockout, never replays an
indeterminate WLED write. If source hash, lockout state, Owner priority,
Matrix effect/preset, AUX PWM geometry or post-TTL restore cannot be proved,
it refuses automatic scoring and does not affect direct Owner WS controls.

## Secret provisioning

The root-only `hbnf-cart-glow-provision` accepts a dedicated *relay bearer
credential* and Supabase public/anon API key via **authenticated SSH STDIN**
only after the exact release is approved. The Mac prompts without echo, never
puts either value into argv, environment, logs, GitHub, Drive, or release ZIP.
The Opal must persist a minimal `0600 root:root` configuration for autonomous
cloud authentication; an unattended service cannot operate with no resident
credential of any kind. This is NOT the Supabase service-role key. The
provisioner fails if any config preexists and validates a strict safe charset.
On exact absent-state rollback the new config is removed, not exported.

## Executable two-phase transaction (SOURCE TESTED; DEVICE NOT RUN)

Use `cart116-opal-transaction.sh` only inside the eventual manifest-pinned
staging directory, with `TARGETS.tsv` from this exact package and a separate
root-owned 0600 one-time `RECEIPT` created after authentic owner approval.
There is no approval in this review. `preflight` performs read-only exact
source/preimage checks, including all 11 targets and generated config absence;
`backup` collects exact live originals/absence markers plus the whole Owner
21-file tree **before** mutation. The backup TAR SHA must then be stored
OFF-device in the existing private Drive, downloaded independently, and pinned
under the SAME manifest. `apply` refuses stale source, missing independent
backup, missing owner approval, stale current preimages, conflicting service,
replay of the same one-time transaction ID, or either hardcoded false source
gate. Only if ALL gates pass can it stage/rename the 11 files, provision the
root config via stdin, and enable/start the new procd service; failure invokes
exact reverse/absence-state recovery. No existing Owner service is stopped.
`rollback` is available after a consumed nonce to restore originals/remove
confirmed new files, stop/disable only the new service and remove only the new
root config. `closeout` requires external exact-manifest physical/independent
readback hashes; no HTTP ACK is treated as field acceptance.

A multi-file shell transaction is NOT filesystem-atomic as a whole; the
transaction relies on a verified preimage, a durable offline backup,
per-file atomic staging, same-manifest compensation, and an independent
readback. If a failure occurs after a device's one-use overlay command, never
force a global Matrix/AUX restore across Owner priority. Persist lockout,
stop Glow and follow the physical recovery witness.

## Mandatory release gates still open

1. Authentic current absent-state readbacks of three new named targets,
   generated config path, procd service inventory and no conflicting relay;
   preserve existing seven complete bytes and same-time Matrix/AUX state.
2. Independently durable upload/download-back of the ACTUAL private installed
   raw-preimage archive, and exact NEW transaction-specific backup. Previous
   old rollback ZIP/source is recovered but not evidence for newly named files.
3. Actual Matrix R6 native overlay/preset-independent behavior while `ps=-1`
   and FX142, direct Owner priority under Glow, zero slider preservation, real
   GPIO25/26 OFF and 22-RGB DDP, TTL/boot/reconnect evidence. No forced ps60.
4. Provider v35 exact source rollback has 10/10 parity; compiled new Edge
   provider candidate and compiled v35 restore still need provider/off-provider
   pinned bytes/download-back. SQL v1 migrations remain unapplied.
5. One unique manifest-specific **explicit owner approval**, durable approved
   manifest download-back, immediate pre-change readback, one guarded attempt,
   and the ONE combined iPad/Matrix/AUX/Glow/Owner/TTL/network field session.

**Review source admissions remain FALSE:**
`HBNF_CART_GLOW_SOURCE_ADMITTED=false`,
`HBNF_OVERLAY_V1_SOURCE_ADMITTED=false`, Edge `admitted:false` and
`nativeOverlayAdmitted:false`, scoring `auto_live=false`. No install here.
