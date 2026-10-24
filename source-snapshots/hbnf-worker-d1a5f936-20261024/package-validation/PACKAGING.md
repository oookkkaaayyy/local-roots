# Local Worker package validation

This separate validation folder has a locally pinned Wrangler CLI and lockfile so the recovered assets can be dry-run built reproducibly without changing the observed snapshot's Wrangler evidence. Cloudflare documents `wrangler deploy --dry-run --outdir` as a compile without deployment. The validation config is asset-only, intentionally has no Worker script entrypoint, and uses a non-production Worker name.

From this directory:

1. Run `npm ci` to install the locked toolchain.
2. Run `npm run wrangler:version` to confirm the local CLI version.
3. Run `npm run build:dry-run` to verify the 44 local asset hashes and compile into `.wrangler-output/` without publishing.
4. Run `npm run test:route-parity` for the offline response-normalization checks, then `npm run verify:live-routes` to compare the nine known public HTML routes to this exact snapshot. The live check removes only the specifically identified Cloudflare challenge script injected into the HTML response; other differences remain visible and cause a nonzero exit.

`LOCAL_ASSET_SHA256SUMS` records the exact bytes of the local `public/` files. It is deliberately separate from the existing `ASSET_SHA256SUMS` and release manifest: those are preserved source evidence and include a candidate/live `/skins` hash that differs from the raw recovered file. This mismatch remains unresolved and must not be normalized away.

The local hash check does **not** establish that every file matches the active Cloudflare deployment or that this snapshot is the deployed source. Provider parity, deployment lineage, provider save/readback, installable release packaging, rollback, and physical/device acceptance remain separate release gates.

The live-route check is response-level evidence only. A passing result still does not prove which Worker version served the bytes. A differing route is printed with both hashes rather than being normalized, overwritten, or treated as an unexplained hash mismatch.
