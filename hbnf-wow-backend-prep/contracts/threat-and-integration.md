# Guest V1 and AUX UV integration notes

## Guest V1

- QR forwarding exposes only the static page. Every action checks the current canonical Guest Mode flag, which defaults OFF when absent.
- The guest browser sends a closed action name/value pair and expected revision. The backend maps it to an existing reducer command; arbitrary command types are ignored.
- Owner toggle requires existing operator/paired-device authorization. Guest Mode changes use the canonical command bridge and reconcile with no actuator targets.
- Owner/guest races are resolved by the existing expected-revision compare-and-commit. A stale guest request gets 409 and is not retried.
- The browser stores no guest token/session and sends no cookies. The existing public endpoint is CORS-allowed for the static host.
- No admin, release, firmware, pairing, or device-control endpoint is exposed in the guest UI.

## AUX UV gates

- Current candidate remains software disabled, hardware unavailable, and max brightness 0; no AUX live mutation occurred.
- Preserve the exact physical gates: verify installed controller revision and output configuration, boot-dark/fail-safe behavior, 5V load/switching topology with no backfeed, optical wavelength/irradiance and exposure placement, then owner authorization before any physical commissioning.
- Existing qualified GPIO16 addressable output remains unchanged. Candidate PWM channels remain unenergized.

## Text/Vibe

The existing native WLED text baseline remains functional. Font/treatment options are an owner-review menu and remain UNFROZEN. No custom renderer or final visual choice is introduced.
