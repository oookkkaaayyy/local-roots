# HBNF Watch Transport — Phase 2+ staging kit

Purpose: make the native watchOS app depend on one stable contract instead of Matrix/AUX/game implementation details.

## Integration rule

The Watch calls only `hbnf-watch-api-staging` during staging. Do not add direct Watch calls to:

- `hbnf-matrix-control`
- `hbnf-aux-control`
- `hbnf-cart-orchestrator`
- Matrix/AUX adapters
- the Phase 2 game bridge

## Cart mutations

Use `cartIntent(...)`, not a client-managed expected revision. The backend:

1. authenticates the Watch token,
2. requires the Watch's paired cart-device token,
3. reads canonical cart status,
4. uses the current authoritative revision,
5. sends the command to `hbnf-cart-control`,
6. retries once only when the canonical controller returns `stale_revision`.

This keeps rapid changes from iPhone/iPad/guest/Watch controllers from forcing revision logic into the Watch UI.

## Credentials

- Existing Watch API token remains an application credential and should not be regenerated solely for this migration.
- The Watch must receive its own cart device-session token after Phase 1 finalizes.
- Store that device token with `WatchCredentialStore`; do not put it in source, logs, URLs, AKS, or UserDefaults.
- No production device session is created by this staging kit.

## Phase 2+ providers

The facade currently fails closed for `game`, `uv`, and `overlay`. Their future implementations may change behind the facade without changing the Watch client contract.

## Physical acceptance still required

1. install the staging app on the real Watch;
2. save a Watch-specific paired cart device token;
3. read cart status;
4. execute one controlled cart intent and confirm canonical readback;
5. exercise Skins and Glow staging score flows;
6. only then consider production promotion.
