#!/usr/bin/env node
// Read-only resolver for the HBNF Owner PWA candidate and its exact Cart control bindings.
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, relative, isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const indexRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(field, expected, actual) {
  const printable = value => value === undefined ? "<missing>" : JSON.stringify(value);
  throw new Error(`MISMATCH ${field}: expected ${printable(expected)}, found ${printable(actual)}`);
}
function equal(field, expected, actual) {
  if (expected !== actual) fail(field, expected, actual);
}
function safePath(root, relativePath, field) {
  if (typeof relativePath !== "string" || isAbsolute(relativePath)) fail(field, "repository-relative path", relativePath);
  const full = resolve(root, relativePath);
  const rel = relative(root, full);
  if (rel.startsWith("..") || isAbsolute(rel)) fail(field, "path within Cart root", relativePath);
  return full;
}
function readJson(path, field) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (error) { fail(field, "readable JSON", error.message); }
}
function fileSha(path, field) {
  if (!existsSync(path)) fail(field, "existing file", "missing");
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
export function assertSourceInputs(source, sourceInputs, readSourceBytes) {
  if (!Array.isArray(sourceInputs) || sourceInputs.length === 0) {
    fail("package.sourceInputs", "nonempty source input list", sourceInputs);
  }
  if (!sourceInputs.some(input => input.path === source.entry_path)) {
    fail("source.entry_path", source.entry_path, "not present in package sourceInputs");
  }
  for (const input of sourceInputs) {
    const bytes = readSourceBytes(input.path);
    const actual = createHash("sha256").update(bytes).digest("hex");
    equal("source.input." + input.path, input.sha256, actual);
  }
}
function verifySourceSnapshot(root, source, packageManifest) {
  const type = spawnSync("git", ["-C", root, "cat-file", "-e", source.ref + "^{commit}"]);
  if (type.status !== 0) fail("source.ref", source.ref, "commit missing from Cart Git object database");
  assertSourceInputs(source, packageManifest.sourceInputs, path => {
    try { return execFileSync("git", ["-C", root, "show", source.ref + ":" + path], { maxBuffer: 20 * 1024 * 1024 }); }
    catch { fail("source.input." + path, "path present at exact Git commit " + source.ref, "unavailable"); }
  });
}
export function resolveLocator(locator, packageRecord, packageManifest, model, state) {
  const e = packageRecord?.evidence;
  if (!e) fail("package_record.evidence", "object", e);
  equal("source.ref/package_record.source_commit", locator.source.ref, e.source_commit);
  equal("candidate.version/package_record.version", locator.candidate.version, e.candidate?.version);
  equal("candidate.transaction_id/package_record.transaction_id", locator.candidate.transaction_id, e.candidate?.transaction_id);
  equal("candidate.package_path/package_record.path", locator.candidate.package_path, e.candidate?.path);
  equal("candidate.package_sha256/package_record.sha256", locator.candidate.package_sha256, e.candidate?.sha256);
  equal("candidate.transaction_id/package_manifest.transactionId", locator.candidate.transaction_id, packageManifest.transactionId);
  equal("candidate.version/package_manifest.package", "hbnf-owner-pwa-local-v" + locator.candidate.version, packageManifest.package);
  equal("source.ref/package_manifest.sourceCommit", locator.source.ref, packageManifest.sourceCommit);
  equal("installed_baseline.version/package_manifest.ownerPwaVersion", locator.installed_baseline.version, packageManifest.rollbackBaseline?.source?.ownerPwaVersion);
  equal("installed_baseline.manifest_sha256/package_manifest.baseline", locator.installed_baseline.manifest_sha256, packageManifest.rollbackBaseline?.sha256);
  equal("installed_baseline.entries/package_manifest.entries", locator.installed_baseline.entries, packageManifest.rollbackBaseline?.entries);
  equal("installed_baseline.entries/package_manifest.installedPayloadManifest", locator.installed_baseline.entries, packageManifest.rollbackBaseline?.source?.installedPayloadManifest?.ownerPwaSubtreeEntries);
  equal("installed_baseline.entries/package_record.entries", locator.installed_baseline.entries, e.rollback_baseline?.owner_pwa_subtree_entries);
  equal("installed_baseline.manifest_sha256/package_record.baseline", locator.installed_baseline.manifest_sha256, e.rollback_baseline?.owner_pwa_subtree_manifest_sha256);
  equal("rollback.archive_path/package_manifest.historical archive path", locator.rollback.exact_installed_baseline_archive_path, packageManifest.rollbackBaseline?.source?.historicalOwnerPwaArchive?.path);
  equal("rollback.archive_sha256/package_manifest.historical archive", locator.rollback.exact_installed_baseline_archive_sha256, packageManifest.rollbackBaseline?.source?.historicalOwnerPwaArchive?.sha256);
  equal("rollback.recovery_bundle_path/package_manifest.recovery archive path", locator.rollback.recovery_bundle_path, packageManifest.rollbackBaseline?.source?.archive?.path);
  equal("rollback.recovery_bundle_sha256/package_manifest.recovery archive", locator.rollback.recovery_bundle_sha256, packageManifest.rollbackBaseline?.source?.archive?.sha256);
  equal("candidate.observed_status/package_record.status", locator.candidate.observed_status, e.deployment_status);

  const successor = model?.execution_system?.owner_pwa_recovery_lane?.post_recovery_successor;
  if (!successor) fail("control_model.post_recovery_successor", "present", successor);
  equal("candidate.transaction_id/control_model.successor.transaction_id", locator.candidate.transaction_id, successor.candidate_transaction_id);
  equal("candidate.package_sha256/control_model.successor.package_sha256", locator.candidate.package_sha256, successor.candidate_zip_sha256);
  equal("installed_baseline.manifest_sha256/control_model.successor.baseline", locator.installed_baseline.manifest_sha256, successor.recovery_baseline_manifest_sha256);
  const cursor = state?.execution_cursor;
  if (!cursor) fail("control_state.execution_cursor", "present", cursor);
  const predecessor = cursor.owner_pwa_transaction;
  const recovery = cursor.owner_pwa_recovery_transaction;
  equal("transactions.predecessor.transaction_id/control_state", locator.transactions.predecessor.transaction_id, predecessor?.transaction_id);
  equal("transactions.predecessor.status/control_state", locator.transactions.predecessor.status, predecessor?.status);
  equal("transactions.recovery.transaction_id/control_state", locator.transactions.recovery.transaction_id, recovery?.transaction_id);
  equal("transactions.recovery.status/control_state", locator.transactions.recovery.status, recovery?.status);
  equal("installed_baseline.recovery_receipt_sha256/control_state", locator.installed_baseline.recovery_receipt_sha256, recovery?.install_receipt_sha256);
  if (cursor.owner_pwa_local_v108_transaction || cursor.owner_pwa_successor_transaction) {
    fail("transactions.successor.status", locator.transactions.successor.status, "successor transaction record already exists; refresh locator against current admission");
  }
  equal("transactions.successor.status/control_state", "NOT_RESERVED", locator.transactions.successor.status);
  return {
    locator_status: "VERIFIED_LOCAL_BINDINGS",
    repository: locator.repository,
    source: locator.source,
    candidate: { ...locator.candidate },
    installed_baseline: { ...locator.installed_baseline },
    transactions: { ...locator.transactions },
    rollback: { ...locator.rollback },
    evidence_scope: locator.evidence_scope
  };
}
function run(cartRoot) {
  const locator = readJson(join(indexRoot, "docs/HBNF_SOURCE_INDEX.json"), "source_index");
  const binding = locator.owner_pwa_candidate_locator;
  if (!binding) fail("source_index.owner_pwa_candidate_locator", "present", binding);
  const root = resolve(cartRoot);
  const packageRecord = readJson(safePath(root, binding.candidate.package_record_path, "candidate.package_record_path"), "package_record");
  const manifestPath = safePath(root, binding.candidate.package_manifest_path, "candidate.package_manifest_path");
  const packageManifest = readJson(manifestPath, "package_manifest");
  const model = readJson(safePath(root, binding.transactions.control_model_path, "transactions.control_model_path"), "control_model");
  const state = readJson(safePath(root, binding.transactions.control_state_path, "transactions.control_state_path"), "control_state");

  verifySourceSnapshot(root, binding.source, packageManifest);
  equal("candidate.package_sha256/file", binding.candidate.package_sha256, fileSha(safePath(root, binding.candidate.package_path, "candidate.package_path"), "candidate.package"));
  const checksumText = readFileSync(safePath(root, binding.candidate.package_checksum_path, "candidate.package_checksum_path"), "utf8");
  const checksumMatch = checksumText.match(/^([a-f0-9]{64})\s+/);
  if (!checksumMatch) fail("candidate.package_checksum", "SHA-256 plus filename", checksumText.trim());
  equal("candidate.package_sha256/PACKAGE.SHA256", binding.candidate.package_sha256, checksumMatch[1]);
  equal("installed_baseline.manifest_sha256/file", binding.installed_baseline.manifest_sha256, fileSha(safePath(root, binding.installed_baseline.manifest_path, "installed_baseline.manifest_path"), "installed_baseline.manifest"));
  equal("rollback.archive_sha256/file", binding.rollback.exact_installed_baseline_archive_sha256, fileSha(safePath(root, binding.rollback.exact_installed_baseline_archive_path, "rollback.archive_path"), "rollback.archive"));
  equal("rollback.recovery_bundle_sha256/file", binding.rollback.recovery_bundle_sha256, fileSha(safePath(root, binding.rollback.recovery_bundle_path, "rollback.recovery_bundle_path"), "rollback.recovery_bundle"));
  const recordSha = fileSha(safePath(root, binding.candidate.package_record_path, "candidate.package_record_path"), "candidate.package_record");
  equal("candidate.package_record_sha256/file", binding.candidate.package_record_sha256, recordSha);
  return resolveLocator(binding, packageRecord, packageManifest, model, state);
}
function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf("--cart-root");
  if (at < 0 || !args[at + 1]) {
    console.error("Usage: node scripts/locate-cart-owner-pwa.mjs --cart-root <Cart checkout>");
    process.exitCode = 2;
    return;
  }
  try { console.log(JSON.stringify(run(args[at + 1]), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
