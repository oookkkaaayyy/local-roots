# D&U Generation V2 operator workflow

This branch replaces in-app/Workers AI image generation and iterative whole-image regeneration with a manual fresh-chat ChatGPT loop. ChatGPT remains the image generator. The browser never opens ChatGPT or fabricates an app link.

## Operator sequence

1. In the authenticated D&U admin job card, choose the composition photo and lock the package. The site supplies the versioned canonical D&U clean-room prompt automatically; there is no operator-maintained prompt paste step. The server copies each original private intake image into a unique, private package path, computes SHA-256 for every copied image, records role/order and prompt version, adds exact filename-based role instructions to the prompt, hashes the manifest and final prompt, and creates Attempt A. Package records cannot be updated or deleted.
2. Click **Download all source photos (.zip)**, unzip it, open a brand-new ChatGPT conversation, attach every image from that ZIP as native image attachments, and paste the locked prompt. Individual source downloads remain available only as a fallback. The source photo selected as composition is named `01-APPROVED-COMPOSITION`; remaining photos are named `02-IDENTITY-REFERENCE-NN`. No client name, email, or phone is included in the prompt or generated filename.
3. Upload that conversation's candidate to its attempt. Mark it failed if no usable result, or review it beside other candidates. Attempts B/C become available only after the preceding attempt is failed or rejected. Each starts again from the exact same package and prompt. Candidate bytes can be attached only once per attempt.
4. Select one candidate as immutable visual master. Optionally open one localized correction branch from that selected image, upload its one result, and choose either it or the original selected image as final master. The original candidate remains stored and unchanged. No second correction branch or whole-image retry chain is available.
5. Download the final visual master. From the repository root on macOS, run the unchanged general productionizer and validator:

   ```sh
   swiftc app/scripts/du-stencil-viability.swift -o /tmp/du-stencil-viability
   swiftc app/scripts/du-stencil-productionize.swift -o /tmp/du-stencil-productionize
   /tmp/du-stencil-productionize --input "$HOME/Downloads/final-visual-master.<actual-extension>" --artwork-width-mm 190.5 --validator /tmp/du-stencil-viability --out-dir "$HOME/Downloads/du-generation-v2-productionized"
   ```

   Replace `<actual-extension>` with the extension shown on the downloaded master (for example `png`, `jpg`, or `webp`). The productionizer writes a `*-productionized.png`; attach that image and the exact report at `validator-after/rusty-viability-report.json` from the output directory. The Edge Function accepts the record only when every report case is `PASS`, the reported artwork width is 190.5 mm, and the report's source SHA-256 equals the uploaded PNG's SHA-256.

## Guardrails and persistence

- All orchestration rows are private, RLS-enabled, and accessible only through the authenticated `du-admin` function using the existing admin auth.
- A job gets one locked source package, at most three ordered attempts, at most one selected attempt, at most one correction, one final master, and one production record.
- Failed candidates are never offered as source downloads for another generation attempt. Only the immutable package files are offered there.
- Candidate, correction, productionized output, hashes, prompt, role manifest, status transitions, short failure/rejection notes, and validation report remain in private storage/database records for future evaluation. Filenames and notes avoid client contact/name fields.
- The existing productionizer and validator were copied byte-for-byte from the prior durable checkout. SHA-256: validator `84bc6066c29eeb261624261b5f38e50817e921e9a56fa0d55dfdcf6040bdbf84`; productionizer `4a5320b0e0164b3f4724e408b1f720fe2c314fed2e43434e56766e2e2b213785`.
- Apply the new migration and deploy the updated `du-admin` Edge Function before deploying the frontend. No live migration, function update, site deployment, or existing job mutation was performed while preparing this branch.

The prompt is locked per job so that all independent attempts use byte-identical prompt text. The UI now generates that recipe from one versioned canonical prompt (`clean-room-v2.1`) and the backend rejects stale prompt versions. The prompt includes the current 190.5 mm generation target and the empirically calibrated retained-white bias (2.0 × 2.0 mm minimum enclosed/floating white region; 1.0 mm minimum meaningful connected white width when the run is at least 0.4 mm), while explicitly leaving final manufacturability certification to the unchanged deterministic productionizer/validator.
