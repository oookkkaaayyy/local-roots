# Expert-first decision record — WOW backend preparation

**Classification:** additive implementation detail within the existing Cart 2.0 lanes; offline, non-operational, reversible. It does not alter `HBNF_CONTROL_MODEL.json`, `HBNF_CONTROL_STATE.json`, Phase 2, Foundation, or release wiring. The associated governance JSON records the applicability/evidence classification.

## Decisions grounded in existing capability

- **Guest auth:** use Supabase Auth anonymous sign-in (no email or PII) as the guest identity/session substrate. A narrow owner-issued, short-lived, one-use QR join capability binds that anonymous identity to one cart and an explicit scope set. The offline Python reference policy demonstrates the scope/rate/expiry rules only; its process-local store and token are not production auth. Production must store/revoke through the existing Supabase backend/session path, with the deployed service validating the caller and capability on every mutation. Supabase warns anonymous identities use the `authenticated` database role, so existing RLS must explicitly distinguish `is_anonymous` and constrain scopes; do not expose broad authenticated table access.
- **UV:** keep the output control on native WLED outputs/segments and JSON state API. WLED documents ESP32 multiple outputs, PWM white and analog PWM/MOSFET output; its JSON API supports segment brightness. This proves software capability exists, not that this AUX board has a free independent output or the MOSFET/UV load stage. The module is a pure state-to-payload policy and injects segment IDs after exact device config inspection.
- **Text/Vibe:** keep current text geometry/rendering and layer Vibe-aware presets/transitions over it. WLED 16 adds native segment layering, transition blending, and custom font support for scrolling text. The style contract only describes possible treatments for owner evaluation; it neither selects a final aesthetic nor claims native text is cinematic. If its native primitives cannot deliver the reviewed treatment with stable readable holds, stop and return options before proposing a renderer.

## Alternatives challenged

- **New auth provider, JWT/session framework, or QR-specific service:** rejected; Supabase anonymous auth is already available and avoids a new identity architecture. The join capability is a constrained application grant, not a replacement auth system.
- **Custom PWM protocol or device firmware:** rejected; WLED already exposes native outputs, segments and JSON control. No live device request is made.
- **New font renderer:** rejected; current Cart text system remains the functional source of truth. A renderer is out of scope until native primitives are tested and shown insufficient.
- **New dependencies:** none. Reference modules use Python standard library only.

## Reversibility and cost

Only additive, isolated files under `hbnf-wow-backend-prep/` are introduced. Revert the branch commit to remove them. The reference in-memory guest store is explicitly unsuitable for multi-instance production; production work requires the existing Supabase-backed session and owner authority integration. Hardware commissioning and owner visual review remain gates.
