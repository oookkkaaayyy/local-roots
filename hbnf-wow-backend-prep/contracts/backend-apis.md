# WOW integration contracts — offline only

## Trusted-friends Guest V1 (coordinator correction, 2026-10-07)

The static Cart host is `https://hbnightflyers.com`. The QR destination is `/guest/hbnf-cart/`, served from the existing Cloudflare static worker public root. Cloudflare's directory index behavior serves `guest/hbnf-cart/index.html` at that route.

The page calls the existing Supabase Edge Function `hbnf-cart-control` directly. Browser requests use the already deployed `https://hbnightflyers.com` CORS allowance and the existing publishable key. There is no guest account, identity, ticket, JWT, cookie, session store, or separate limiter service.

Guest Mode is a canonical state field, defaults OFF when absent, and can only be changed by the existing paired-device/operator owner authorization path. `GUEST_MODE` commits through `hbnf_cart_commit_command_bridge` and then calls the existing reconciler with no actuator targets; the v11 reconciler carries forward Matrix/AUX observations without an adapter write. Guest actions are a closed mapping to VIBE, VIBE_AUTO, NEXT, and AUTO in the existing reducer. `guest_command` reads current canonical context, checks Guest Mode and expected revision, applies the same reducer, commits through the same bridge, and reconciles through `hbnf-cart-reconcile`. No alternate device path or duplicate state machine exists. Stale revisions are rejected without retry. Owner writes retain precedence through the canonical revision compare-and-commit boundary.

The page exposes only Vibe and Cart fun controls. It contains no release, firmware, device-admin, deployment, or pairing controls. Browser memory holds only the latest status revision; requests omit credentials and use no browser persistence. A small in-page debounce prevents accidental repeat taps.

## AUX UV and text/Vibe

Dormant UV policy and the exact commissioning gates remain in `aux-uv-candidate.json` and `uv-hardware-requirements.md`; software defaults OFF, hardware unavailable, cap zero. The text presentation menu remains in `text_presentation.json`; supported native WLED 16.0.1 font choices and three treatment concepts remain UNFROZEN for owner review.
