# HBNF Worker package and release gates

This directory pins Wrangler `4.152.0` and its lockfile. `npm ci`, the 44-file asset check, focused save/conflict tests, response normalization tests, and `wrangler deploy --dry-run` validate source/tooling only. Wrangler's dry-run output is a small no-op Worker and is **not** the full static-assets package.

The exact release input consists of the complete `public/` directory, the production-shaped `wrangler.jsonc`, and the pinned Wrangler toolchain. Cloudflare's supported `wrangler versions upload` command accepts a directory of static assets or the configured project and creates a new remote Worker Version. That is a provider write, even though it does not route production traffic. It must be separately authorized; this task has not uploaded a version or changed traffic.

After an authorized upload, capture the returned candidate Version ID and preview it through Cloudflare's version preview route before any traffic change. The current active production Version recorded in the evidence is `d1a5f936-e2ea-4434-b4ee-b5858b1baa9e`; verify the live deployment again immediately before any future rollout. Rollback must use the exact pre-change active Version ID at 100% using `wrangler versions deploy <active-version-id>@100%`. Do not use the older `dfde63fe-685c-44f8-a230-9481caa3c3a3` manifest rollback ID as if it were the immediately prior production version.

`LOCAL_ASSET_SHA256SUMS` covers the raw source snapshot; it is separate from historical preserved release evidence. A live route GET plus removal of only the identified appended Cloudflare challenge script is route-level response evidence, not provider asset export, binary equivalence, or source deployment lineage. Candidate/source mismatch on `/skins` is reported and must not be normalized away.

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
