import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assertSourceInputs, resolveLocator } from "./locate-cart-owner-pwa.mjs";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const index = JSON.parse(readFileSync(join(root, "docs/HBNF_SOURCE_INDEX.json"), "utf8"));
const locator = index.owner_pwa_candidate_locator;
const packageRecord = {
  evidence: {
    deployment_status: locator.candidate.observed_status,
    source_commit: locator.source.ref,
    candidate: {
      version: locator.candidate.version,
      transaction_id: locator.candidate.transaction_id,
      path: locator.candidate.package_path,
      sha256: locator.candidate.package_sha256,
    },
    rollback_baseline: {
      owner_pwa_subtree_entries: locator.installed_baseline.entries,
      owner_pwa_subtree_manifest_sha256: locator.installed_baseline.manifest_sha256,
    },
  },
};
const packageManifest = {
  package: "hbnf-owner-pwa-local-v" + locator.candidate.version,
  transactionId: locator.candidate.transaction_id,
  sourceCommit: locator.source.ref,
  sourceInputs: [{ path: "hbnf-final-controller/hbnf-cart.html", sha256: "b".repeat(64) }],
  rollbackBaseline: {
    entries: locator.installed_baseline.entries,
    sha256: locator.installed_baseline.manifest_sha256,
    source: {
      ownerPwaVersion: locator.installed_baseline.version,
      installedPayloadManifest: { ownerPwaSubtreeEntries: locator.installed_baseline.entries },
      archive: { path: locator.rollback.recovery_bundle_path, sha256: locator.rollback.recovery_bundle_sha256 },
      historicalOwnerPwaArchive: { path: locator.rollback.exact_installed_baseline_archive_path, sha256: locator.rollback.exact_installed_baseline_archive_sha256 },
    },
  },
};
const model = {
  execution_system: {
    owner_pwa_recovery_lane: {
      post_recovery_successor: {
        candidate_transaction_id: locator.candidate.transaction_id,
        candidate_zip_sha256: locator.candidate.package_sha256,
        recovery_baseline_manifest_sha256: locator.installed_baseline.manifest_sha256,
      },
    },
  },
};
const state = {
  execution_cursor: {
    owner_pwa_transaction: { transaction_id: locator.transactions.predecessor.transaction_id, status: locator.transactions.predecessor.status },
    owner_pwa_recovery_transaction: {
      transaction_id: locator.transactions.recovery.transaction_id,
      status: locator.transactions.recovery.status,
      install_receipt_sha256: locator.installed_baseline.recovery_receipt_sha256,
    },
  },
};

test("locator resolves the exact candidate, installed baseline, transactions, and rollback", () => {
  const result = resolveLocator(locator, packageRecord, packageManifest, model, state);
  assert.equal(result.locator_status, "VERIFIED_LOCAL_BINDINGS");
  assert.equal(result.candidate.package_sha256, "e9fcebd2a9b9592712c3687667de80882eb9fe8d182574824441edbc2f27cc4f");
  assert.equal(result.installed_baseline.manifest_sha256, "971b22121876ddf87eff50adedfd54b985216fccbd847074fd67d6ec49bf044d");
  assert.equal(result.transactions.predecessor.status, "ROLLBACK_REQUIRED");
  assert.equal(result.transactions.recovery.status, "COMPLETE");
  assert.equal(result.transactions.successor.status, "NOT_RESERVED");
  assert.equal(result.rollback.exact_installed_baseline_archive_sha256, "35e0c596a4571bc3288179cf8a304d9c7420a615479f876b06623e58018740d3");
});

test("package source ref mismatch fails with one precise mismatch", () => {
  assert.throws(
    () => resolveLocator(locator, { ...packageRecord, evidence: { ...packageRecord.evidence, source_commit: "c".repeat(40) } }, packageManifest, model, state),
    /^Error: MISMATCH source\.ref\/package_record\.source_commit:/,
  );
});

test("baseline and transaction mismatches fail closed", () => {
  const changedManifest = structuredClone(packageManifest);
  changedManifest.rollbackBaseline.sha256 = "d".repeat(64);
  assert.throws(
    () => resolveLocator(locator, packageRecord, changedManifest, model, state),
    /^Error: MISMATCH installed_baseline\.manifest_sha256\/package_manifest\.baseline:/,
  );
  const changedState = structuredClone(state);
  changedState.execution_cursor.owner_pwa_recovery_transaction.status = "RUNNING";
  assert.throws(
    () => resolveLocator(locator, packageRecord, packageManifest, model, changedState),
    /^Error: MISMATCH transactions\.recovery\.status\/control_state:/,
  );
  const reserved = structuredClone(state);
  reserved.execution_cursor.owner_pwa_local_v108_transaction = { transaction_id: locator.candidate.transaction_id, status: "RESERVED" };
  assert.throws(
    () => resolveLocator(locator, packageRecord, packageManifest, model, reserved),
    /^Error: MISMATCH transactions\.successor\.status:/,
  );
});

test("source snapshot inputs must match the exact declared Git ref", () => {
  const bytes = Buffer.from("committed source\n");
  const source = { entry_path: "hbnf-final-controller/hbnf-cart.html" };
  const inputs = [{
    path: source.entry_path,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }];
  assert.doesNotThrow(() => assertSourceInputs(source, inputs, () => bytes));
  assert.throws(
    () => assertSourceInputs(source, [{ ...inputs[0], sha256: "e".repeat(64) }], () => bytes),
    /^Error: MISMATCH source\.input\.hbnf-final-controller\/hbnf-cart\.html:/,
  );
});
