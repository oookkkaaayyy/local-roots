# Expert-first decision record — bounded WOW integration

**Classification:** minimal reversible implementation detail using existing platform capabilities. No lifecycle model/state change, new dependency, service, auth scheme, device protocol, or live deployment.

## Guest V1

Coordinator-authoritative inspection identified `https://hbnightflyers.com`, the existing Cloudflare static worker root, `hbnf-cart-control` v16, and `hbnf-cart-reconcile` v11. The deployed CORS rule already permits the static host. Guest V1 therefore uses the existing static hosting and Supabase function, existing canonical command reducer, `hbnf_cart_commit_command_bridge`, and existing reconciliation path. The owner switch is protected by existing paired-device/operator authorization. Guest Mode defaults OFF and is metadata-only, with no actuator targets. Guests have no separate identity, cookies, tickets, token system, or general command proxy.

Official references consulted: [Supabase Edge Function CORS](https://supabase.com/docs/guides/functions/cors), [Supabase Edge Function testing](https://supabase.com/docs/guides/functions/unit-test), and [Cloudflare Workers static HTML routing](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/). These document platform support for cross-origin function calls and directory index routing; deployed CORS and function versions were separately verified read-only. Inference: direct calls are the smallest compatible path because the existing host is already allowlisted and owns the serialized command route.

## UV and Text/Vibe

Use native WLED outputs/text capabilities already present in the pinned source. UV remains OFF, unavailable, and brightness-capped at zero pending the preserved physical commissioning gates. Native font/treatment choices remain available for owner review; no aesthetics are frozen and no renderer is added.

## Alternatives and cost

Separate guest auth/session infrastructure, anonymous Supabase Auth, custom tickets/JWTs, and a new device path were rejected because trusted friends use the existing Cart command surface and those systems duplicate authorization/state machinery without a stated requirement. No maintained external component is needed. The implementation is plain integration glue with no dependency change. Rollback is a Git revert of this integration commit; live state is unaffected.
