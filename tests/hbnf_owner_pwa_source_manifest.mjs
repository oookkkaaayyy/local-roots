import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "hbnf-owner-source-manifest-"));
const checker = path.resolve(import.meta.dirname, "../scripts/hbnf_verify_owner_pwa_source_manifest.mjs");
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const run = (args, options = {}) => execFileSync(args[0], args.slice(1), { cwd: root, stdio: "pipe", ...options });

try {
  run(["git", "init", "-q"]);
  run(["git", "config", "user.name", "Manifest test"]);
  run(["git", "config", "user.email", "manifest-test@example.invalid"]);
  fs.writeFileSync(path.join(root, "source.js"), "export const sourceBound = true;\n");
  run(["git", "add", "source.js"]);
  run(["git", "commit", "-qm", "fixture source"]);
  const sourceCommit = run(["git", "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

  const pkg = path.join(root, "package");
  const payload = path.join(pkg, "owner-pwa");
  fs.mkdirSync(payload, { recursive: true });
  fs.writeFileSync(path.join(payload, "index.html"), "<main>source-bound</main>\n");
  const tools = {
    "install.sh": "#!/bin/sh\necho 'REVIEW ONLY: installation is disabled' >&2\nexit 64\n",
    "rollback.sh": "#!/bin/sh\necho 'REVIEW ONLY: rollback is disabled' >&2\nexit 64\n",
    "REVIEW_ONLY.txt": "Review artifact only. No installation or rollback is enabled.\n",
  };
  for (const [name, contents] of Object.entries(tools)) fs.writeFileSync(path.join(pkg, name), contents);
  const sourceBytes = fs.readFileSync(path.join(root, "source.js"));
  const manifest = {
    sourceCommit,
    releaseDisposition: "REVIEW_ONLY_NOT_ADMITTED_NOT_UPLOADED_NOT_INSTALLED",
    transactionId: null,
    sourceInputs: [{ path: "source.js", size: sourceBytes.length, sha256: sha(sourceBytes) }],
    assets: [{ path: "index.html", sha256: sha(fs.readFileSync(path.join(payload, "index.html"))) }],
    packageTools: Object.entries(tools).map(([name, contents]) => ({
      path: name,
      sha256: sha(contents),
      ...(name === "install.sh" || name === "rollback.sh" ? { mode: "disabled-review-stub" } : {}),
    })),
    rollbackBaseline: {
      entries: 20,
      sha256: "a".repeat(64),
    },
  };
  const manifestPath = path.join(pkg, "PACKAGE.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));

  const checked = spawnSync("node", [checker, "--verify-source-manifest", "--cart-root", root, "--manifest", manifestPath], { encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stderr || checked.stdout);
  assert.match(checked.stdout, /PASS: source manifest bound to/);

  fs.appendFileSync(path.join(pkg, "rollback.sh"), "# changed\n");
  const tampered = spawnSync("node", [checker, "--verify-source-manifest", "--cart-root", root, "--manifest", manifestPath], { encoding: "utf8" });
  assert.notEqual(tampered.status, 0, "tampered review rollback stub must fail validation");
  assert.match(tampered.stderr, /Review tool hash mismatch: rollback\.sh/);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("PASS: exact-source review-only Owner PWA manifest accepted; altered disabled rollback stub rejected");
