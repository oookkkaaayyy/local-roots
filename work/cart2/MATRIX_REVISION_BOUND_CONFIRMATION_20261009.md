# Cart 2.0 Matrix confirmation relay — offline release capsule

Status: implementation candidate only; no migration, Supabase function, Opal service, firmware, or UI is deployed or changed by this work.

## BESPOKE EXCEPTION — approved, narrow

Unmet requirement: confirm the exact current Cart desired revision and active actuator fence was applied by the physical Matrix runtime without falsely equating MQTT liveness or remote command acceptance with device application.

Mature/native alternatives evaluated:
- WLED MQTT /status and /g report liveness/master state, and the staged MQTT route used a public plaintext broker. They do not carry Cart revision/fence evidence, so they fail both security and correlation.
- WLED JSON API and WebSocket return device state but no Cart revision/fence; Supabase Edge cannot directly access the private cart LAN. The private Opal host can.
- Owner-browser local reads can see LAN state in some conditions, but are not a trusted always-on backend relay and do not atomically bind the readback to current revision/fence.
Official sources consulted: WLED JSON API and WebSocket documentation; Supabase Edge Function auth/secrets/config documentation; OpenWrt jsonfilter documentation. The minimal adaptation is one outbound Opal poller, one authenticated Edge endpoint, short-lived one-use DB challenge functions, and offline security/recovery tests. It does not alter firmware or expose an admin interface. Maintenance is limited to a procd worker, one dedicated token rotation, and a small SQL/Edge contract. Exit path: stop/disable procd worker, restore prior backend sources, then apply the matching down migration. The owner approved this exact exception; no broader architecture is authorized.

## Architecture

The canonical Cart command reducer remains the sole source of desired revision and active actuator fence. The reconciliation function validates that exact state and returns pending_relay; it no longer writes hardware or creates observations. The prior Foundation adapter is a fail-closed compatibility endpoint, and all MQTT mutation code plus the staged broker.emqx.io plaintext fallback are removed.

The one Matrix writer is an Opal-origin worker making outbound HTTPS requests to a Supabase Edge Function. The function reads canonical state/fence server-side, creates a 20-second one-use challenge, and returns a native WLED JSON projection. Opal checks Matrix MAC and candidate, reads /json/si, and sends the fresh response to the Edge Function. The function compares normalized effective state. An exact match is committed through a SQL RPC only if revision/fence are still current, challenge unexpired/unconsumed, and readback equals the stored expected map. A mismatch receives one per-challenge apply authorization; Opal sends one WLED JSON state write, rereads, and checks again. No response means no confirmation. On reconnection, the worker fetches the newest desired state and reads back before writing, so it does not replay an old queue.

Only the Edge Function has SUPABASE_SERVICE_ROLE_KEY. Opal has a separate random relay bearer token, stored in a root-only mode-0600 config file. Its token is checked in constant time and is not a JWT; the relay Edge Function alone must be deployed with JWT verification disabled and its custom bearer check remains mandatory. The endpoint has no CORS allowance. Matrix/Opal admin or OTA interfaces are not exposed. Firmware updater authority is not present.

## Pinned WLED evidence used

R6 WLED 16.0.1 reports candidate, scene, selected Vibe, motion, audio response, Matrix/AUX brightness, palette mode/index/solid RGB, overlay ID, and Matrix/Companion segment state in /json/state. The projection checks those fields, Matrix MAC 70:4b:ca:5b:34:5c, 534 LEDs, master brightness, and segment geometry. Overlay IDs are SHA-256-derived from normalized overlay content plus revision/fence, truncated to 128 bits and fit the pinned firmware's 39-character field. Legacy palettes are effective-state aliases because the firmware only reports mode=legacy.

## Guarantee and limits

A confirmed observation means the trusted Opal relay fetched a fresh WLED state from the fixed MAC, and that runtime reported the expected managed projection for the exact still-current Cart revision/fence and R6 candidate; the one-use challenge was atomically consumed while a new online/off observation was written. Stale, missing, expired, replayed, identity-mismatched, fence-mismatched, or state-mismatched evidence fails closed.

This is a trusted relay plus WLED runtime readback, not cryptographic firmware attestation. A compromised relay, Matrix, or token can falsify the receipt. WLED JSON readback cannot prove physical LEDs emitted light. The firmware does not report AUTO's dynamic resolved Vibe or every audio-input detail; the acknowledgement only claims fields it can observe. AUX brightness and Companion segment configuration are verified as Matrix runtime controls, not actual AUX pixel output. Physical AUX synchronization remains a separate required owner/live gate.

The relay is pinned to exact R6 candidate hbnf-cart2-phase2-offline-wow-r6-integrated-20261009 and must not write before that identity is observed. R4 remains the existing baseline until a later authorized coordinated release transaction.

## Offline and live sequence

Offline tests cover projection/readback normalization, overlay content correlation, fixed identity/topology, stale/replay/apply-once outcomes, connection-loss convergence, no MQTT writer, and no service-role key on Opal. The migration and edge path must still be applied/tested against a disposable/local Supabase instance before production authorization; this locked FileProvider checkout does not currently provide the full materialized local test tree.

Future one-transaction live sequence:
1. Read current control authority; verify R6 SHA 340fe93b2eae35518fc588fa194c097b1d44d34050d54933fd97e552762becfb, exact R4 rollback SHA 338afdf5e40e83f8887246c0d9e7e67e9b55caca4912f6b2ae743a2f3d8c, power, device identity, single worker, and network.
2. Apply the exact migration and set the generated relay token and fixed relay ID as Supabase secrets. The project function-slot limit rejected a new `hbnf-cart-relay` function, so the same handler is bundled into the already custom-authenticated `hbnf-cart-control` function. Dispatch requires the fixed `X-HBNF-Relay-ID` plus constant-time bearer validation; Owner/Guest requests without that header follow the unchanged existing path. Update that function in place, and deploy the no-write adapter and pending-only reconcile.
3. Verify Opal has curl, jsonfilter, procd and trusted CA already present. Install/enable the outbound relay only after the exact R6 candidate is live. Do not change router networking or install packages.
4. Deploy the matching Owner/Guest package after verifying its build/source hash; keep Guest Mode OFF, UV OFF.
5. Verify one owner command yields a current Matrix confirmed observation; force stale-revision, stale-fence, replay, and connection-loss cases in staging/test first. Report AUX as unverified until actual AUX read/physical gates pass.
6. Complete existing 28-kernel, combined-feature, continuous 90-minute soak, owner PWA/scoring, physical AUX sync/recovery, and T4/T5 gates. Offline tests do not count as live acceptance.

The relay handler shares the existing `hbnf-cart-control` URL to avoid consuming a new function slot. Supabase documents Edge Function deployment through its managed platform and per-function JWT configuration: https://supabase.com/docs/guides/functions. The deployed control function already has `verify_jwt=false`; the relay branch therefore enforces both the fixed relay identity header and its high-entropy bearer token before any privileged RPC. Calls without valid custom auth must return 401 with zero RPCs.


## Primary source references

- WLED JSON API: https://kno.wled.ge/interfaces/json-api/
- WLED WebSocket state interface: https://kno.wled.ge/interfaces/websocket/
- OpenWrt jsonfilter/jshn: https://openwrt.org/docs/guide-developer/jshn
- Supabase Edge Function secrets: https://supabase.com/docs/guides/functions/secrets
- Supabase Edge Function auth headers: https://supabase.com/docs/guides/functions/auth-headers
- Supabase function JWT configuration: https://supabase.com/docs/guides/functions/function-configuration
