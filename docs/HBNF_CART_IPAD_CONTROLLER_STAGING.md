# iPad mini 2 controller staging

The iPad page is a separate compatibility surface; it is not a second cart-control backend.

- Route staged: `/hbnf-cart-ipad.html`
- Target: iPad mini 2 / iOS 12-era Safari
- Plain ES5-style JavaScript, XHR, no modules, no async/await, no service worker requirement
- Auth tokens are handled through Supabase Auth REST and stored only on that iPad
- Every lighting command goes to the existing `hbnf-cart-control` function with `expectedRevision`
- A 409 `stale_revision` triggers status refresh and one retry of the same command ID
- The page polls canonical state so iPhone and iPad converge when either makes a change
- No Matrix/AUX IP or WLED endpoint is present in the iPad light-control JavaScript
- Games button opens the bridge at `http://192.168.8.30/` while the iPad remains on HBNF-Cart

Production deployment is intentionally NOT included in this staging branch. The accepted release must be re-read and collision-audited first.
