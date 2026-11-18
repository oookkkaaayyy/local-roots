# Dry-run evidence

- Toolchain: Wrangler 4.152.0, installed from the committed npm lockfile.
- Local source asset check: 44/44 exact byte hashes pass against `LOCAL_ASSET_SHA256SUMS`.
- Wrangler configuration validation/build: `wrangler deploy --dry-run --config ./wrangler.jsonc --outdir .wrangler-output` exits successfully and makes no deployment.
- Wrangler reported reading 45 asset-directory entries; the local manifest enumerates 44 regular files. The extra count is not explained by this evidence and must not be interpreted as a 45th source asset.
- The generated outdir contains only Wrangler's 313-byte no-op Worker, its source map, and a short README. It does not contain the 44 static asset payloads as a standalone installable package.
- The test config targets the non-production name `hbnf-observed-snapshot-validation`.

This validates the local pinned toolchain and static-asset configuration only. It is **not** an installable candidate, does not establish provider parity or deployment lineage, and does not clear any release gate.
