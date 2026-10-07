# Guest V1 and AUX UV threat/integration notes

## Guest V1 controls

- Forwarded/static QR: it only identifies the cart and page; Guest Mode OFF is the hard interaction gate. Keep the QR same-origin and never place an owner secret or guest bearer token in its URL.
- Session copied across carts: session lookup checks the cart binding, server-side expiry, and current Guest Mode on every request.
- Session restored after an OFF/ON cycle: Guest Mode OFF expires that cart's server sessions; mode ON creates a fresh round.
- Accidental tap floods: per-session minute window and same-action debounce; return a clear retry response without repeated commands.
- Owner action races with guest: check owner override before dispatch and serialize writes at the existing cart authority boundary; guest cannot overwrite owner/safety state.
- Guest tries administrative/device actions: only the current guest-page action names are passed to existing cart handlers. No general control proxy exists.
- Reconnect after network interruption: HttpOnly session cookie revalidates against the same session store; expiry does not slide forward. Offline UI sends no commands.
- Shared backend deployment: the local reference throttle is per instance. If the existing backend runs multiple replicas, substitute its existing shared/native throttling mechanism during integration.

## AUX UV gates

- Controller disconnected: user reports AUX is reconnected and stable. Connectivity is closed as a blocker; no live probe or write was performed in this lane.
- Output/pin conflict: SP803E filed manual identifies PWM/NMOS channels IO25/26/27; current qualified underglow uses GPIO16. Existing AUX code maps 25/26 as UV candidates and 27 spare. Still require exact installed revision/config readback and boot-dark verification before enabling.
- Voltage/topology mismatch: the cart's addressable underglow is 12V and the installed UV strip is 5V USB. SP803E's PWM output is a built-in NMOS channel and the filed manual describes matching strip/controller supply voltage. The exact separate 5V UV supply wiring through the built-in channel, including no backfeed, must be proven before live connection; if not supported, add a separately powered 5V low-side MOSFET module driven by a verified logic-level output.
- Optical exposure: wavelength/irradiance are not established by the known strip label. No live use until wavelength, exposure distance, and shielding/placement receive review.
- Candidate config in `aux-uv-candidate.json` remains `software_feature_enabled=false`, `hardware_available=false`, brightness cap 0, and leaves GPIO16 unchanged.

## Preserved text/Vibe evidence

- Text too long/clips, unstable hold, or uncontrolled animation: keep existing functional text geometry, bounds-check content with the existing renderer, hold glyphs stable, revert to prior state on exit; default to current functional treatment until owner review.

## Later integration ordering

1. Wait for primary Phase 2 candidate closure; read its exact current route/session/action interfaces from that durable checkpoint.
2. Merge `guest-v1.html/js` into existing application hosting; add only one QR route and two session endpoints plus one action route, reusing existing owner state, session storage and action dispatch.
3. Add Guest Mode owner setting default OFF, expire sessions on OFF, set cookie attributes, validate guest action payloads, and check owner precedence through the current serialized authority path.
4. Keep UV software disabled and cap zero until exact WLED config readback and board/load/exposure checks close. Apply the native WLED output/segment mapping through existing AUX route only after no-conflict offline review.
5. Preserve the existing text treatment preparation and let the primary text/Vibe owner continue their current work; this continuation makes no text subsystem changes.

No production wiring, Matrix/AUX mutation, Supabase write, deployment, or lifecycle change occurred.
