# iPad mini 2 controller staging

The iPad page is a separate compatibility surface; it is not a second cart-control backend.

- Route staged: `/hbnf-cart-ipad.html`
- Target: iPad mini 2 / iOS 12-era Safari
- Plain ES5-style JavaScript, XHR, no modules, no async/await, no service worker requirement
- Normal control uses the current zero-pair guest-safe controller contract; no Supabase Auth login, magic link, or pairing ceremony is required on the mounted iPad
- Every lighting command goes to the existing `hbnf-cart-control` function with `expectedRevision`
- A 409 `stale_revision` triggers status refresh and one retry of the same command ID
- The page uses slow, semantic canonical-state refresh so iPhone and iPad converge without live telemetry chatter or rapid polling
- No Matrix/AUX IP or WLED endpoint is present in the iPad light-control JavaScript
- Games button opens the bridge at `http://192.168.8.30/` while the iPad remains on HBNF-Cart
- iPad is a client/control surface only; lighting and game runtime must continue if it sleeps, disconnects, or closes Safari
- Preferred network is HBNF-Cart when Opal is present; if Opal is absent, the iPad may fall back to the existing iPhone hotspot
- When Opal is present, upstream internet should be provided through the Opal (home Wi-Fi or iPhone hotspot/repeater) so the mounted iPad can remain on HBNF-Cart continuously

Production deployment is intentionally NOT included in this staging branch. The accepted release must be re-read and collision-audited first.
