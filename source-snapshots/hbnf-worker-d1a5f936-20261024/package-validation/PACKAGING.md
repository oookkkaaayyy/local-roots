# HBNF Worker package and release gates

This directory pins Wrangler `4.152.0` and its lockfile. `npm ci`, the 44-file asset check, focused save/conflict tests, response normalization tests, and `wrangler deploy --dry-run` validate source/tooling only. Wrangler's dry-run output is a small no-op Worker and is **not** the full static-assets package.

The exact release input consists of the complete `public/` directory, the production-shaped `wrangler.jsonc`, and the pinned Wrangler toolchain. Cloudflare's supported `wrangler versions upload` command accepts a directory of static assets or the configured project and creates a new remote Worker Version. That is a provider write, even though it does not route production traffic. It must be separately authorized; this task has not uploaded a version or changed traffic.

After an authorized upload, capture the returned candidate Version ID and preview it through Cloudflare's version preview route before any traffic change. The current active production Version recorded in the evidence is `d1a5f936-e2ea-4434-b4ee-b5858b1baa9e`; verify the live deployment again immediately before any future rollout. Rollback must use the exact pre-change active Version ID at 100% using `wrangler versions deploy <active-version-id>@100%`. Do not use the older `dfde63fe-685c-44f8-a230-9481caa3c3a3` manifest rollback ID as if it were the immediately prior production version.

Release candidates are composed from the independently retained v343 archive `HBNF-P0-candidate-44-assets-deterministic-20261028.zip` (Worker version `3b019c24-0288-4c0d-bcc2-46cb6028d0f6`, archive SHA-256 `29d3c6c2aa9038063c659a5361b932ce2c9819a481fd020b5172701450dc477a`). The builder hard-pins this version/hash and reads the 44 assets from that archive; it never copies the 44 deployed pages from this older source snapshot. It overlays only `public/glow.html` from the exact source commit and adds only `public/glow-save-sync.mjs` and `public/league-state-cas.mjs`. The build fails unless the asset delta is exactly 43 unchanged, Glow modified, and those two files added. `PACKAGE_MANIFEST.json` records a source/baseline and SHA-256 lineage entry for every asset.

The builder also emits the exact v343 rollback archive and sidecar checksum. Rollback must restore the retained immutable v343 version and explicitly remove the newly introduced one-minute Cron Trigger by deploying rollback configuration with `triggers.crons: []`; omitting `triggers` or `crons` leaves existing triggers active. This procedure is documented in the package manifest. No provider mutation is part of package creation.

## Safe local checks

Run from this directory:

1. `npm ci`
2. `npm run wrangler:version` (must report `4.152.0`)
3. `npm run verify:assets`
4. `npm run test:sync-baseline`
5. `npm run test:save-reconnect`
6. `npm run test:route-parity`
7. `npm run build:dry-run`
8. `npm run verify:live-routes` for read-only HTTP observation; known `/skins` source drift is an expected difference until a candidate is deployed and previewed.

No real Supabase row, production score, tag, or Cloudflare traffic is changed by these commands.
