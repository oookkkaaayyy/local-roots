# Opal local PWA CORS update v1.0.18

This package changes only `/etc/hbnf-local-control/nginx-server.conf`. It adds the exact local PWA origin `http://192.168.77.1` to the existing public HTTPS origin allowlist. Requests remain subject to the existing paired Owner token checks. Unknown origins remain denied.

The Opal-hosted PWA is opened at `http://192.168.77.1/mission-control-local/owner-pwa/hbnf-cart.html`. Its UV status and command requests go to the dedicated HTTPS gateway on port 9443. The previous gateway allowed only `https://hbnightflyers.com`, so the actual local page's browser preflight was rejected with 403 and UV controls stayed unavailable. This update aligns the gateway allowlist with the local page's real browser origin.

The installer verifies the complete current 20-file gateway baseline, exact one-time admission, package hashes, and exact rollback. It changes one Nginx server config, checks syntax, reloads only the dedicated gateway, then checks the local and public preflights return 204 with their exact origins while an unrelated origin remains 403. It does not change firmware, WLED routes, Matrix/AUX behavior, Mission Control files, or the router-wide Nginx instance.

The local PWA's UV readiness, commissioning gates, and physical LED response remain separate acceptance checks after CORS succeeds.
