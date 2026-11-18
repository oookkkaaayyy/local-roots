# HBNF Worker observed source snapshot

This directory preserves the 2026-10-22 recovered 44-asset source capsule associated with the existing Cloudflare Worker named `hbnf` and reported active version `d1a5f936-e2ea-4434-b4ee-b5858b1baa9e`.

This is an **observed source snapshot**, not proof that these exact 44 assets produced the active deployed Worker. The recovery capsule's release manifest records `public/skins.html` as the sole changed asset and supplies its SHA-256. The live `/skins` HTML and inline scoring-script hashes were observed separately. Provider-side hashes for all deployed assets and a commit-bound deployment receipt were not available when this snapshot was created. No claim of complete deployed-source parity is made.

The `wrangler.jsonc` and release receipts are preserved as evidence only. This directory is under `source-snapshots/`, outside the repository's application/deployment configuration. Do not treat it as a deployable project or wire it into a deployment workflow without a separately reviewed source/build/recovery path.
