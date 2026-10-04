# D&U Generation V2 operator workflow

This workflow coordinates independent manual fresh-chat ChatGPT generations; it does not run an image model itself. Version `reference-anchored-v3.0` addresses the missing visual control that allowed scratchboard-like, over-detailed results: the same accepted stencil examples are privately stored, hash-checked, and included in every locked package as a distinct role.

## Operator sequence

1. Before the first job, import the accepted stencil examples through the admin card's private style library. Each image is stored privately and append-only; duplicate bytes are rejected. The library permits up to 12 references and requires at least 3 to lock a job. These examples guide stencil style only, never pet identity.
2. Choose the composition photo and lock the package. The server copies each original private intake image and each accepted style reference into unique private package paths, computes SHA-256 for every file, records role/order and prompt version, adds filename-based role instructions, hashes the manifest and prompt, and creates Attempt A. Package records cannot be updated or deleted.
3. Click **Download full reference package (.zip)**, unzip it, open a brand-new ChatGPT conversation, attach every image from that ZIP as native image attachments, and paste the locked prompt. The composition is named `01-APPROVED-COMPOSITION`, same-pet identity images are `02-IDENTITY-REFERENCE-NN`, and accepted stencil examples are `03-STYLE-REFERENCE-NN`. Compare output against the composition for identity/anatomy and against style examples for abstraction/detail scale before accepting a candidate. No client name, email, or phone is included in the prompt or generated filename.
4. Upload that conversation's candidate to its attempt. Mark it failed if no usable result, or review it beside other candidates. Attempts B/C become available only after the preceding attempt is failed or rejected. Each starts again from the exact same immutable package and prompt. Candidate bytes can be attached only once per attempt.
5. Select a candidate as immutable visual master only after comparing it against both required reference roles. Optionally open one localized correction branch from that selected image, upload its one result, and choose either it or the original selected image as final master. The original candidate remains stored and unchanged.
6. Download the final visual master. From the repository root on macOS, run the unchanged general productionizer and validator:

   ```sh
   swiftc app/scripts/du-stencil-viability.swift -o /tmp/du-stencil-viability
   swiftc app/scripts/du-stencil-productionize.swift -o /tmp/du-stencil-productionize
   /tmp/du-stencil-productionize --input "$HOME/Downloads/final-visual-master.<actual-extension>" --artwork-width-mm 190.5 --validator /tmp/du-stencil-viability --out-dir "$HOME/Downloads/du-generation-v2-productionized"
   ```

   Replace `<actual-extension>` with the extension shown on the downloaded master. The productionizer writes a `*-productionized.png`; attach that image and the exact report at `validator-after/rusty-viability-report.json`. The Edge Function accepts the record only when every report case is `PASS`, the reported artwork width is 190.5 mm, and the report's source SHA-256 equals the uploaded PNG's SHA-256.

## Guardrails and persistence

- All orchestration and style-library rows are private, RLS-enabled, and accessible only through the authenticated `du-admin` function using existing admin auth.
- Style references are append-only. Each job package pins a hashed copy, so later library changes cannot alter an existing attempt's visual controls. Add only examples the operator has accepted as representative.
- A job gets one locked source package, at most three ordered attempts, at most one selected attempt, at most one correction, one final master, and one production record.
- Failed candidates are never offered as source downloads for another generation attempt. Only files in the immutable package are offered there.
- Candidate, correction, productionized output, hashes, prompt, role manifest, status transitions, short failure/rejection notes, and validation report remain in private storage/database records. Filenames and notes avoid client contact/name fields.
- The existing productionizer and validator were copied byte-for-byte from the prior durable checkout. SHA-256: validator `84bc6066c29eeb261624261b5f38e50817e921e9a56fa0d55dfdcf6040bdbf84`; productionizer `4a5320b0e0164b3f4724e408b1f720fe2c314fed2e43434e56766e2e2b213785`.
- Apply the new migration and deploy the updated `du-admin` Edge Function before deploying the frontend. No live migration, function update, site deployment, or existing job mutation was performed while preparing this change.

The prompt includes the 190.5 mm generation target and empirically calibrated retained-white bias (2.0 × 2.0 mm minimum enclosed/floating white region; 1.0 mm minimum meaningful connected white width when the run is at least 0.4 mm), while leaving final manufacturability certification to the unchanged deterministic productionizer/validator. It specifically guards against scratchboard/engraving texture, repeated hairline fur marks, and micro-detail while asking the model to preserve the pet's identity and anatomy.

This improves repeatability by making the accepted visual examples part of the exact package each attempt uses. It does not automate generation or visual scoring: a human still has to reject outputs that fail the side-by-side identity and style review.
