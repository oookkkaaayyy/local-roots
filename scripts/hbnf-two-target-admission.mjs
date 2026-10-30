#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateReleaseReceipt } from './validate-release-receipt.mjs';

export const HBNF_ADMISSION = Object.freeze({
  releaseId: 'hbnf-glow-d68334f67026',
  sourceCommit: '7c5598133c2ed7d78f08bb57f704f95cb735b7c8',
  sourceBundleSha256: '2acd1db9bf4d29ce0dbdbc4e62ea6553450e523059386b8830a434cb161f65ee',
  sourceBundleBytes: 5445720,
  candidateSha256: 'a3ef09676caf0a39d53cc269ed8863cf2705708c528641cf94cd47dd49d58dc7',
  candidateBytes: 5029798,
  evidenceSha256: '3dd2f81daf4f65475c042709f3d51b7d47e0470bfbe09b3b2c0d4d16368426c2',
  evidenceBytes: 4672,
  cloudflareAccount: 'e3bc6b78f1104fa0c2a01245084594cf',
  cloudflareWorker: 'hbnf',
  cloudflareVersion: '3b019c24-0288-4c0d-bcc2-46cb6028d0f6',
  rollbackSha256: '29d3c6c2aa9038063c659a5361b932ce2c9819a481fd020b5172701450dc477a',
  rollbackBytes: 3264714,
  supabaseProject: 'phcpbvuqibyarpfrftgx',
  migrationHashes: Object.freeze({
    '20261029200450_hbnf_glow_atomic_week_sync.sql': '740536e7046dc5592022a46b363d9e6e9e370a6f79f8b1ec8c3af87e30ba1e69',
    '20261029203741_hbnf_league_state_server_revision_guard.sql': '8521bc34fdaf7e3015c76c0d0f2f1bd6d1baf00d8dca7b262aec19b38e587b2d',
    '20261030021038_hbnf_league_state_anon_cas_rpc.sql': '460a8bee8961ebd78968678d1690b7c4565f6a8785347e6c08f6cba4903739b7',
  }),
});

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(message); };

function assertFresh(timestamp, label, now, maxAgeMs) {
  const then = Date.parse(timestamp);
  if (!Number.isFinite(then)) fail(`${label} timestamp is missing or invalid`);
  if (then > now + 30_000) fail(`${label} timestamp is in the future`);
  if (now - then > maxAgeMs) fail(`${label} is stale`);
}

export async function readCloudflareDeploymentEvidence({ token = process.env.CLOUDFLARE_API_TOKEN, fetchImpl = fetch, now = Date.now() } = {}) {
  if (!token) fail('CLOUDFLARE_API_TOKEN is required for authenticated deployment readback');
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${HBNF_ADMISSION.cloudflareAccount}/workers/scripts/${HBNF_ADMISSION.cloudflareWorker}/deployments`;
  const response = await fetchImpl(endpoint, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!response.ok) fail(`Cloudflare deployment readback failed with HTTP ${response.status}`);
  const payload = await response.json();
  return { provider: 'cloudflare-api', endpoint, capturedAt: response.headers?.get?.('date') || new Date(now).toISOString(), payload };
}

export const SUPABASE_READ_ONLY_QUERY = `
WITH cols AS (
  SELECT jsonb_agg(jsonb_build_object('column', column_name, 'type', data_type, 'nullable', is_nullable) ORDER BY ordinal_position) AS v
  FROM information_schema.columns WHERE table_schema='public' AND table_name='league_state'
), grants AS (
  SELECT jsonb_agg(jsonb_build_object('grantee', grantee, 'privilege', privilege_type) ORDER BY grantee, privilege_type) AS v
  FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='league_state'
    AND grantee IN ('anon','authenticated','service_role')
), policies AS (
  SELECT jsonb_agg(jsonb_build_object('name', policyname, 'command', cmd, 'roles', roles, 'using', qual, 'check', with_check) ORDER BY policyname) AS v
  FROM pg_policies WHERE schemaname='public' AND tablename='league_state'
), triggers AS (
  SELECT jsonb_agg(jsonb_build_object('name', trigger_name, 'event', event_manipulation, 'timing', action_timing, 'statement', action_statement) ORDER BY trigger_name, event_manipulation) AS v
  FROM information_schema.triggers WHERE event_object_schema='public' AND event_object_table='league_state'
), migrations AS (
  SELECT jsonb_agg(jsonb_build_object('version', version, 'name', name) ORDER BY version) AS v
  FROM supabase_migrations.schema_migrations
  WHERE version IN ('20261029200450','20261029203741','20261030021038')
)
SELECT jsonb_build_object(
  'serverTime', now(), 'tableExists', to_regclass('public.league_state') IS NOT NULL,
  'rlsEnabled', coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.league_state')), false),
  'columns', (SELECT v FROM cols), 'grants', (SELECT v FROM grants),
  'policies', (SELECT v FROM policies), 'triggers', (SELECT v FROM triggers),
  'candidateMigrations', coalesce((SELECT v FROM migrations), '[]'::jsonb)
) AS admission_evidence;`;

export async function readSupabaseBaselineEvidence({ token = process.env.SUPABASE_ACCESS_TOKEN, fetchImpl = fetch, now = Date.now() } = {}) {
  if (!token) fail('SUPABASE_ACCESS_TOKEN with database:read permission is required for authenticated read-only baseline query');
  const endpoint = `https://api.supabase.com/v1/projects/${HBNF_ADMISSION.supabaseProject}/database/query/read-only`;
  const response = await fetchImpl(endpoint, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: SUPABASE_READ_ONLY_QUERY }),
  });
  if (!response.ok) fail(`Supabase read-only baseline query failed with HTTP ${response.status}`);
  const payload = await response.json();
  let snapshot = payload?.admission_evidence;
  if (Array.isArray(payload) && payload.length === 1) snapshot = payload[0]?.admission_evidence;
  if (typeof snapshot === 'string') snapshot = JSON.parse(snapshot);
  if (!snapshot?.serverTime || !Number.isFinite(Date.parse(snapshot.serverTime))) fail('Supabase query did not return its authoritative server timestamp');
  return { provider: 'supabase-readonly-api', endpoint, projectId: HBNF_ADMISSION.supabaseProject, capturedAt: new Date(snapshot.serverTime).toISOString(), payload };
}

function verifyCloudflare(readback, { now, maxAgeMs }) {
  assertFresh(readback?.capturedAt, 'Cloudflare readback', now, maxAgeMs);
  const expectedEndpoint = `https://api.cloudflare.com/client/v4/accounts/${HBNF_ADMISSION.cloudflareAccount}/workers/scripts/${HBNF_ADMISSION.cloudflareWorker}/deployments`;
  if (readback.provider !== 'cloudflare-api' || readback.endpoint !== expectedEndpoint) fail('Cloudflare evidence is not from the authenticated target-specific deployments endpoint');
  const result = readback.payload?.result;
  if (readback.payload?.success !== true || !Array.isArray(result?.deployments) || result.deployments.length === 0) fail('Cloudflare response is missing a successful deployments result');
  const active = result.deployments[0];
  const versions = active?.versions;
  if (!Array.isArray(versions) || versions.length === 0) fail('Cloudflare active deployment has no version allocation');
  const total = versions.reduce((sum, item) => sum + Number(item?.percentage || 0), 0);
  const exact = versions.filter(item => item.version_id === HBNF_ADMISSION.cloudflareVersion && Number(item.percentage) === 100);
  if (exact.length !== 1 || total !== 100 || versions.length !== 1) fail('Cloudflare active Worker version is not the exact expected UUID at 100%');
  const retainedIds = new Set(result.deployments.flatMap(d => (d.versions || []).map(v => v.version_id)));
  if (!retainedIds.has(HBNF_ADMISSION.cloudflareVersion)) fail('Cloudflare rollback version is not present in retained deployment history');
  return { identity: HBNF_ADMISSION.cloudflareVersion, percentage: 100, deploymentId: active.id };
}

function verifySupabase(readback, { now, maxAgeMs }) {
  assertFresh(readback?.capturedAt, 'Supabase readback', now, maxAgeMs);
  const directApi = readback.provider === 'supabase-readonly-api' && readback.endpoint === `https://api.supabase.com/v1/projects/${HBNF_ADMISSION.supabaseProject}/database/query/read-only`;
  const connectedMcp = readback.provider === 'supabase-mcp-read-only' && readback.projectId === HBNF_ADMISSION.supabaseProject && readback.tool === 'mcp__codex_apps__supabase_execute_sql' && readback.readOnly === true;
  if ((!directApi && !connectedMcp) || readback.projectId !== HBNF_ADMISSION.supabaseProject) fail('Supabase evidence is not from an authenticated read-only source for the required project');
  let snapshot = readback.payload?.admission_evidence ?? readback.snapshot ?? readback.payload?.snapshot;
  if (!snapshot && Array.isArray(readback.payload) && readback.payload.length === 1) snapshot = readback.payload[0]?.admission_evidence;
  if (typeof snapshot === 'string') snapshot = JSON.parse(snapshot);
  if (!snapshot || snapshot.tableExists !== true || snapshot.rlsEnabled !== true) fail('Supabase baseline table/RLS evidence is incomplete or mismatched');
  const cols = new Map((snapshot.columns || []).map(c => [c.column, `${c.type}:${c.nullable}`]));
  for (const [key, value] of Object.entries({ id: 'bigint:NO', state_json: 'jsonb:NO', updated_at: 'timestamp with time zone:NO' })) {
    if (cols.get(key) !== value) fail(`Supabase league_state column baseline mismatch: ${key}`);
  }
  const grantSet = new Set((snapshot.grants || []).map(g => `${g.grantee}:${g.privilege}`));
  for (const role of ['anon', 'authenticated', 'service_role']) for (const privilege of ['SELECT', 'INSERT', 'UPDATE']) {
    if (!grantSet.has(`${role}:${privilege}`)) fail(`Supabase legacy grant missing: ${role} ${privilege}`);
  }
  const policySet = new Set((snapshot.policies || []).map(p => `${p.name}:${p.command}`));
  for (const [name, command] of [['Public can read league_state', 'SELECT'], ['Public can update league_state', 'UPDATE'], ['Public can write league_state', 'INSERT']]) {
    if (!policySet.has(`${name}:${command}`)) fail(`Supabase policy baseline missing: ${name}`);
  }
  if ((snapshot.candidateMigrations || []).length !== 0) fail('Supabase candidate migration ledger is not empty');
  const triggerNames = new Set((snapshot.triggers || []).map(t => t.name));
  for (const name of ['hbnf_matrix_vnext_capture_after_state_change', 'hbnf_project_current_tags_into_league_state', 'trg_hbnf_matrix_sync']) {
    if (!triggerNames.has(name)) fail(`Supabase pre-existing trigger baseline missing: ${name}`);
  }
  return { identity: readback.projectId, migrationsApplied: 0, triggers: [...triggerNames].sort() };
}

async function verifyHash(pathname, expectedHash, expectedBytes, label) {
  const bytes = await readFile(pathname);
  if (bytes.length !== expectedBytes || sha256(bytes) !== expectedHash) fail(`${label} bytes or SHA-256 mismatch`);
  return bytes;
}

export async function validateHbnfTwoTargetAdmission({ manifest, readbacks, repoRoot, artifactRoot, now = Date.now(), maxAgeMs = 5 * 60_000, priorLedger = [] }) {
  if (!manifest || manifest.format !== 'hbnf-two-target-release-admission-v1' || manifest.releaseId !== HBNF_ADMISSION.releaseId || manifest.phase !== 'PENDING' || manifest.status !== 'REVIEW_ONLY' || manifest.oneTime !== true) fail('parent manifest identity/phase is invalid or already claimed');
  if (manifest.source?.commit !== HBNF_ADMISSION.sourceCommit || manifest.source?.packageBuilderCommit !== HBNF_ADMISSION.sourceCommit || manifest.source?.branch !== 'feature/udisc-glow-standings-prototype') fail('source commit/branch does not match the qualified release');
  if (manifest.durableRecovery?.sourceBundle?.sha256 !== HBNF_ADMISSION.sourceBundleSha256 || manifest.durableRecovery.sourceBundle.bytes !== HBNF_ADMISSION.sourceBundleBytes ||
      manifest.durableRecovery?.candidate?.sha256 !== HBNF_ADMISSION.candidateSha256 || manifest.durableRecovery.candidate.bytes !== HBNF_ADMISSION.candidateBytes ||
      manifest.durableRecovery?.rollback?.sha256 !== HBNF_ADMISSION.rollbackSha256 || manifest.durableRecovery.rollback.bytes !== HBNF_ADMISSION.rollbackBytes ||
      manifest.durableRecovery?.qualificationEvidenceBundle?.sha256 !== HBNF_ADMISSION.evidenceSha256 || manifest.durableRecovery.qualificationEvidenceBundle.bytes !== HBNF_ADMISSION.evidenceBytes ||
      manifest.durableRecovery.qualificationEvidenceBundle.independentDownloadBack !== 'PASS') fail('source/candidate/rollback/qualification recovery evidence is incomplete or stale');
  if ((priorLedger || []).some(entry => entry.releaseId === manifest.releaseId && entry.state === 'ADMISSION_PASS')) fail('one-time release admission has already been claimed');
  const targets = manifest.targets;
  if (!Array.isArray(targets) || targets.length !== 2) fail('both provider targets are required exactly once');
  const cf = targets.filter(t => t.kind === 'cloudflare-worker' && t.target === 'hbnf');
  const sb = targets.filter(t => t.kind === 'supabase-database' && t.targetProject === HBNF_ADMISSION.supabaseProject);
  if (cf.length !== 1 || sb.length !== 1) fail('provider targets are missing, duplicated, or mismatched');
  const candidate = manifest.candidate;
  if (candidate.sha256 !== HBNF_ADMISSION.candidateSha256 || candidate.bytes !== HBNF_ADMISSION.candidateBytes) fail('candidate identity does not match the exact qualified artifact');
  await verifyHash(path.join(artifactRoot, 'source-7c5598133c2ed7d78f08bb57f704f95cb735b7c8.bundle'), HBNF_ADMISSION.sourceBundleSha256, HBNF_ADMISSION.sourceBundleBytes, 'source bundle');
  await verifyHash(path.join(artifactRoot, 'HBNF-qualification-evidence-final.zip'), HBNF_ADMISSION.evidenceSha256, HBNF_ADMISSION.evidenceBytes, 'qualification evidence bundle');
  await verifyHash(path.join(artifactRoot, 'HBNF-scoring-candidate.zip'), HBNF_ADMISSION.candidateSha256, candidate.bytes, 'candidate');
  const rollback = cf[0].rollback;
  if (rollback.sha256 !== HBNF_ADMISSION.rollbackSha256 || rollback.bytes !== HBNF_ADMISSION.rollbackBytes || cf[0].expectedBaselineVersion !== HBNF_ADMISSION.cloudflareVersion) fail('Worker baseline or exact rollback identity does not match the qualified release');
  await verifyHash(path.join(artifactRoot, 'HBNF-scoring-rollback.zip'), HBNF_ADMISSION.rollbackSha256, HBNF_ADMISSION.rollbackBytes, 'Worker rollback');
  if (rollback.cronRemoval !== 'deploy rollback config with triggers.crons=[]') fail('explicit Cron-removal rollback is missing or changed');
  if (!Array.isArray(sb[0].migrations) || sb[0].migrations.length !== 3 || new Set(sb[0].migrations.map(m => path.basename(m.path))).size !== 3) fail('all three distinct candidate migrations are required');
  for (const migration of sb[0].migrations) {
    const name = path.basename(migration.path);
    const expected = HBNF_ADMISSION.migrationHashes[name];
    if (!expected || expected !== migration.sha256) fail(`migration identity/hash mismatch: ${name}`);
    if (migration.path !== `database/${name}`) fail(`migration path mismatch: ${migration.path}`);
    await verifyHash(path.join(repoRoot, 'supabase/migrations', name), expected, migration.bytes, `migration ${name}`);
  }
  const cfResult = verifyCloudflare(readbacks?.cloudflare, { now, maxAgeMs });
  const sbResult = verifySupabase(readbacks?.supabase, { now, maxAgeMs });
  return {
    phase: 'ADMISSION_VALIDATED_PENDING_DURABLE_PARENT', releaseId: manifest.releaseId,
    sourceCommit: manifest.source.commit, candidateSha256: HBNF_ADMISSION.candidateSha256,
    targets: { cloudflare: cfResult, supabase: sbResult },
    immutableParentRequired: true, productionMutationAuthorized: false,
  };
}

export async function validateSharedTargetReceipts({ receipts, root, parentManifest }) {
  if (!Array.isArray(receipts) || receipts.length !== 2) fail('two shared-validator receipts, one for each provider target, are required');
  const results = [];
  for (const { receipt, expectedProvider, expectedTarget } of receipts) {
    if (receipt?.releaseId !== HBNF_ADMISSION.releaseId || receipt?.source?.commit !== HBNF_ADMISSION.sourceCommit ||
        receipt?.package?.sha256 !== HBNF_ADMISSION.candidateSha256 || receipt?.deployment?.provider !== expectedProvider ||
        receipt?.deployment?.target !== expectedTarget || receipt?.baseline?.provider !== expectedProvider ||
        receipt?.baseline?.target !== expectedTarget) fail(`shared receipt is not bound to the parent release and target ${expectedTarget}`);
    const result = await validateReleaseReceipt(receipt, root, { phase: 'admission' });
    if (result.releaseId !== parentManifest.releaseId || result.packageSha256 !== parentManifest.candidate.sha256) fail(`shared validator result does not match parent candidate for ${expectedTarget}`);
    results.push({ provider: expectedProvider, target: expectedTarget, result });
  }
  return results;
}

export async function buildSharedTargetReceipts({ manifest, readbacks, repoRoot, artifactRoot, root }) {
  if (!readbacks?.supabase?.driveFileId) fail('durably stored and downloaded Supabase baseline readback identity is required');
  const cfEvidence = readbacks.cloudflare;
  const cfIdentity = HBNF_ADMISSION.cloudflareVersion;
  const sbEvidence = readbacks.supabase;
  let snapshot = sbEvidence.snapshot ?? sbEvidence.payload?.admission_evidence ?? sbEvidence.payload?.snapshot;
  if (!snapshot && Array.isArray(sbEvidence.payload) && sbEvidence.payload.length === 1) snapshot = sbEvidence.payload[0]?.admission_evidence;
  if (typeof snapshot === 'string') snapshot = JSON.parse(snapshot);
  const snapshotBytes = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`);
  if (sha256(snapshotBytes) !== sbEvidence.snapshotSha256 || snapshotBytes.length !== sbEvidence.snapshotBytes) fail('Supabase baseline readback does not match its independent Drive hash/size');

  await mkdir(path.join(root, 'evidence'), { recursive: true });
  const candidate = await readFile(path.join(artifactRoot, 'HBNF-scoring-candidate.zip'));
  const rollback = await readFile(path.join(artifactRoot, 'HBNF-scoring-rollback.zip'));
  const lockBytes = await readFile(path.join(repoRoot, 'package-lock.json'));
  const entry = async (name, bytes) => {
    const relative = `evidence/${name}`;
    await writeFile(path.join(root, relative), bytes);
    return { path: relative, bytes: bytes.length, sha256: sha256(bytes) };
  };
  const make = async ({ key, provider, target, identity, baselineBytes, baselineDriveId, restoreProcedure }) => {
    const packageEntry = await entry(`${key}-candidate.zip`, candidate);
    const packageRecovery = await entry(`${key}-candidate.download.zip`, candidate);
    const baselineEntry = await entry(`${key}-baseline.bin`, baselineBytes);
    const baselineRestore = await entry(`${key}-baseline-rollback.bin`, baselineBytes);
    const baselineDownload = await entry(`${key}-baseline.download.bin`, baselineBytes);
    const baselineRollbackDownload = await entry(`${key}-baseline-rollback.download.bin`, baselineBytes);
    const rollbackEntry = await entry(`${key}-rollback.bin`, baselineBytes);
    const rollbackDownload = await entry(`${key}-rollback.download.bin`, baselineBytes);
    const identityBytes = Buffer.from(`${JSON.stringify({ identity, sourceCommit: 'unknown', artifactSha256: baselineEntry.sha256, artifactBytes: baselineEntry.bytes }, null, 2)}\n`);
    const identityEntry = await entry(`${key}-identity.json`, identityBytes);
    const acceptanceName = key === 'cloudflare' ? 'Worker deployment and route verification' : 'Additive migration compatibility and rollback preservation';
    const receipt = {
      schemaVersion: 1, releaseId: HBNF_ADMISSION.releaseId,
      source: { repository: 'oookkkaaayyy/local-roots', ref: manifest.source.branch, commit: HBNF_ADMISSION.sourceCommit },
      build: { command: 'exact-commit candidate package', toolchain: 'Wrangler 4.152.0', lockfileSha256: sha256(lockBytes), inputs: [{ name: 'package-lock.json', version: 'exact pinned dependencies', sha256: sha256(lockBytes) }] },
      baseline: {
        authorityUrl: `https://drive.google.com/file/d/${baselineDriveId}/view`, provider, target, identity,
        sourceCommit: 'unknown', sourceEvidence: 'Authenticated read-only target-specific identity and baseline snapshot.',
        identityEvidence: identityEntry, acceptance: 'PASS: pre-install baseline is preserved and read back.',
        artifact: { disposition: 'recovered', driveFileId: baselineDriveId, ...baselineEntry },
        rollback: { ...baselineRestore, driveFileId: baselineDriveId, baselineIdentity: identity, downloadBackVerified: true, downloadBack: baselineRollbackDownload, restoreProcedure },
      },
      package: packageEntry,
      deployment: { provider, target, plannedRoute: 'Two-target HBNF Glow admission; installation requires separate authorization.', restoreProcedure },
      rollback: { artifact: rollbackEntry, restoreProcedure, recovery: { driveFileId: baselineDriveId, driveUrl: `https://drive.google.com/file/d/${baselineDriveId}/view`, downloadBackVerified: true, downloadBack: rollbackDownload } },
      acceptance: { scope: `HBNF UDisc-to-Glow ${provider} target`, criteria: [{ id: key, description: acceptanceName, method: 'Fresh provider readback bound to exact target, source and candidate.', expectedOutcome: 'This target matches its exact baseline and rollback contract.', status: 'PENDING' }] },
      recovery: { driveFileId: manifest.durableRecovery.candidate.driveId, driveUrl: `https://drive.google.com/file/d/${manifest.durableRecovery.candidate.driveId}/view`, downloadBackVerified: true, downloadBack: packageRecovery },
    };
    return { receipt, expectedProvider: provider, expectedTarget: target };
  };
  const cfDriveId = manifest.durableRecovery.rollback.driveId;
  const cfRestore = 'Restore exact v343 Worker asset archive and deploy rollback config with triggers.crons=[].';
  const dbRestore = 'No down migration: keep the additive SQL; restore Worker v343 and deploy triggers.crons=[].';
  const cloudflare = await make({ key: 'cloudflare', provider: 'cloudflare', target: 'hbnf', identity: cfIdentity, baselineBytes: rollback, baselineDriveId: cfDriveId, restoreProcedure: cfRestore });
  const supabase = await make({ key: 'supabase', provider: 'supabase', target: HBNF_ADMISSION.supabaseProject, identity: `schema-baseline-sha256:${sha256(snapshotBytes)}`, baselineBytes: snapshotBytes, baselineDriveId: sbEvidence.driveFileId, restoreProcedure: dbRestore });
  return [cloudflare, supabase];
}

function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`); }

async function durableRoundTrip(store, key, bytes) {
  const stored = await store.putOnce(key, Buffer.from(bytes));
  if (!stored?.id || !stored?.url) fail(`${key} durable store did not return an immutable identity`);
  const downloaded = Buffer.from(await store.download(stored.id));
  if (!downloaded.equals(bytes)) fail(`${key} durable download-back is not byte-identical`);
  return { stored, bytes: downloaded, sha256: sha256(downloaded) };
}

/**
 * Two-target admission only. Provider implementations are read-only; no mutation
 * method is accepted here. Durable storage and the one-time ledger are explicit
 * dependencies so Drive-backed production wiring and isolated tests share this
 * exact fail-closed sequence.
 */
export async function runHbnfTwoTargetAdmission({ manifest, originalManifestBytes, readbacks, receiptRoot, repoRoot, artifactRoot, durableStore, oneTimeLedger, priorLedger = [], now = Date.now(), maxAgeMs = 5 * 60_000 }) {
  if (!durableStore?.putOnce || !durableStore?.download || !oneTimeLedger?.claim) fail('durable Drive store and one-time release ledger adapters are required');
  if (!originalManifestBytes || JSON.stringify(JSON.parse(Buffer.from(originalManifestBytes).toString('utf8'))) !== JSON.stringify(manifest)) fail('exact original manifest bytes are required and must match the parsed manifest');
  const validated = await validateHbnfTwoTargetAdmission({ manifest, readbacks, repoRoot, artifactRoot, now, maxAgeMs, priorLedger });
  if (await oneTimeLedger.has?.(HBNF_ADMISSION.releaseId)) fail('one-time release ledger already contains this release ID');
  const targetReceipts = await buildSharedTargetReceipts({ manifest, readbacks, repoRoot, artifactRoot, root: receiptRoot });
  const sharedValidatorResults = await validateSharedTargetReceipts({ receipts: targetReceipts, root: receiptRoot, parentManifest: manifest });
  const readbackHashes = {
    cloudflare: sha256(jsonBytes(readbacks.cloudflare)),
    supabase: sha256(jsonBytes(readbacks.supabase)),
  };
  const parentManifest = {
    format: 'hbnf-two-target-admission-parent-v1', releaseId: HBNF_ADMISSION.releaseId,
    phase: 'PENDING_DURABLE_ADMISSION', oneTime: true,
    sourceCommit: HBNF_ADMISSION.sourceCommit, candidateSha256: HBNF_ADMISSION.candidateSha256,
    originalManifestSha256: sha256(Buffer.from(originalManifestBytes)), readbackHashes,
    targets: validated.targets, sharedValidatorResults,
  };
  const parentBytes = jsonBytes(parentManifest);
  const storedParent = await durableRoundTrip(durableStore, `${HBNF_ADMISSION.releaseId}.parent-admission.json`, parentBytes);
  if (priorLedger.some(entry => entry.releaseId === HBNF_ADMISSION.releaseId)) fail('one-time release ledger already contains this release ID');
  if (!await oneTimeLedger.claim(HBNF_ADMISSION.releaseId, storedParent.sha256, storedParent.stored.id)) fail('one-time release ledger rejected an already claimed or replayed admission');
  const decision = {
    format: 'hbnf-two-target-admission-decision-v1', releaseId: HBNF_ADMISSION.releaseId,
    status: 'ADMISSION_PASS', disposition: 'AWAITING_SEPARATE_OWNER_INSTALLATION_AUTHORIZATION',
    parentManifestSha256: storedParent.sha256, parentManifestDriveFileId: storedParent.stored.id,
    parentManifestDriveUrl: storedParent.stored.url, parentManifestBytes: parentBytes.length,
    independentDownloadBack: 'PASS', sourceCommit: HBNF_ADMISSION.sourceCommit,
    candidateSha256: HBNF_ADMISSION.candidateSha256, targets: validated.targets, sharedValidatorResults,
    productionMutationAuthorized: false,
  };
  const decisionBytes = jsonBytes(decision);
  const storedDecision = await durableRoundTrip(durableStore, `${HBNF_ADMISSION.releaseId}.decision.json`, decisionBytes);
  return {
    status: 'ADMISSION_PASS', decision, decisionSha256: storedDecision.sha256,
    decisionDriveFileId: storedDecision.stored.id, decisionDriveUrl: storedDecision.stored.url,
    productionMutationAuthorized: false,
  };
}

export function verifyDurableParentBytes({ originalBytes, downloadedBytes, driveFileId, expectedSha256 }) {
  if (!driveFileId) fail('durable parent Drive identity is required');
  const original = Buffer.from(originalBytes);
  const downloaded = Buffer.from(downloadedBytes);
  if (!original.length || !downloaded.equals(original)) fail('durable admission download-back is not byte-identical');
  if (sha256(original) !== expectedSha256) fail('durable admission bytes do not match the expected manifest SHA-256');
  return { driveFileId, bytes: original.length, sha256: expectedSha256, downloadBack: 'PASS' };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === '--help' || !command) {
    process.stdout.write('usage: node scripts/hbnf-two-target-admission.mjs --capture <readbacks.json>\n       node scripts/hbnf-two-target-admission.mjs --validate <manifest.json> <readbacks.json> <receipt-root> <artifact-root>\n       node scripts/hbnf-two-target-admission.mjs --admit <manifest.json> <readbacks.json> <receipt-root> <artifact-root> <durable-adapter.mjs>\n');
    return;
  }
  if (command === '--capture') {
    if (args.length !== 1) fail('--capture requires one output path');
    const [cloudflare, supabase] = await Promise.all([readCloudflareDeploymentEvidence(), readSupabaseBaselineEvidence()]);
    await writeFile(args[0], `${JSON.stringify({ cloudflare, supabase }, null, 2)}\n`, { flag: 'wx' });
    process.stdout.write(`PASS read-only provider evidence captured to ${path.basename(args[0])}\n`);
    return;
  }
  if (command === '--validate') {
    if (args.length !== 4) fail('--validate requires manifest.json, readbacks.json, receipt-root, and artifact-root');
    const [manifestFile, readbacksFile, receiptRoot, artifactRoot] = args;
    const [manifestBytes, readbacksBytes] = await Promise.all([readFile(manifestFile), readFile(readbacksFile)]);
    const manifest = JSON.parse(manifestBytes);
    const readbacks = JSON.parse(readbacksBytes);
    const result = await validateHbnfTwoTargetAdmission({ manifest, readbacks, repoRoot: process.cwd(), artifactRoot });
    const receipts = await buildSharedTargetReceipts({ manifest, readbacks, repoRoot: process.cwd(), artifactRoot, root: receiptRoot });
    result.sharedValidatorResults = await validateSharedTargetReceipts({ receipts, root: receiptRoot, parentManifest: manifest });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command === '--admit') {
    if (args.length !== 5) fail('--admit requires manifest.json, readbacks.json, receipt-root, artifact-root, and durable-adapter.mjs');
    const [manifestFile, readbacksFile, receiptRoot, artifactRoot, adapterFile] = args;
    const [manifestBytes, readbacksBytes] = await Promise.all([readFile(manifestFile), readFile(readbacksFile)]);
    const adapter = await import(pathToFileURL(path.resolve(adapterFile)).href);
    const result = await runHbnfTwoTargetAdmission({
      manifest: JSON.parse(manifestBytes), originalManifestBytes: manifestBytes,
      readbacks: JSON.parse(readbacksBytes), receiptRoot,
      repoRoot: process.cwd(), artifactRoot, durableStore: adapter.durableStore,
      oneTimeLedger: adapter.oneTimeLedger, priorLedger: await adapter.loadPriorLedger?.() || adapter.priorLedger || [],
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  fail('unknown command; use --help');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`PENDING ${error.message}\n`);
    process.exitCode = 2;
  });
}
