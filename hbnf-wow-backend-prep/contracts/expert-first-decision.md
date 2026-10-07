# Expert-first decision record — WOW backend preparation

**Classification:** additive implementation detail within the existing Cart 2.0 lanes; offline, non-operational, reversible. It does not alter `HBNF_CONTROL_MODEL.json`, `HBNF_CONTROL_STATE.json`, Phase 2, Foundation, or release wiring. The associated governance JSON records the applicability/evidence classification.

## Decisions grounded in existing capability

- **Guest V1:** the user-approved trusted-friends model is a static same-origin QR page, an OFF-by-default owner Guest Mode switch, and short-lived continuity in the Cart's existing server session mechanism. A QR join-ticket system, Supabase anonymous identity, granular capability matrix, and custom JWT add machinery without meeting a stated need. Supabase remains an internal implementation only if the existing backend already relies on it; the guest browser gets no table authority. The adapter delegates to current session/mode/action interfaces.
- **UV:** use native WLED multi-output/PWM and JSON controls. Official SP803E filing material identifies GPIO25/26/27 as onboard NMOS PWM channels and GPIO16 as SPI data; project evidence says the qualified underglow uses GPIO16 and existing AUX code marks 25/26 as UV candidates. WLED documents ESP32 multi-output/PWM white support. This establishes a credible software/output route, but the current installed output config, boot-dark behavior, 5V UV supply through the 12V-powered controller, no-backfeed behavior, and optical exposure still need qualification. The existing UV policy remains pure, disabled by default and brightness-capped at zero until that work is done.
- **Text/Vibe:** keep current text geometry/rendering and layer Vibe-aware presets/transitions over it. WLED 16 adds native segment layering, transition blending, and custom font support for scrolling text. The style contract only describes possible treatments for owner evaluation; it neither selects a final aesthetic nor claims native text is cinematic. If its native primitives cannot deliver the reviewed treatment with stable readable holds, stop and return options before proposing a renderer.

## Alternatives challenged

- **QR tickets, anonymous Auth, a capability framework, or bespoke guest auth:** rejected for this product scope; the static QR plus existing server-side session mechanism and live owner mode gate covers reconnect, expiry and OFF behavior with less machinery. No direct database access is given to the guest.
- **Custom PWM protocol or device firmware:** rejected; WLED already exposes native outputs, segments and JSON control. No live device request is made.
- **New font renderer:** rejected; current Cart text system remains the functional source of truth. A renderer is out of scope until native primitives are tested and shown insufficient.
- **New dependencies:** none. Reference modules use Python standard library only.

## Reversibility and cost

Only isolated files under `hbnf-wow-backend-prep/` are changed. The guest adapter has no session store of its own; the host must inject the existing Cart session mechanism. Its simple throttle is per-process and should use the backend's existing shared limiter if the service has multiple instances. Revert the branch commit to remove the prep. UV commissioning and owner visual review remain later gates.
