import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

const base = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const fn = process.env.DU_ADMIN_FUNCTION_URL || (base + '/functions/v1/du-admin');
assert.ok(base && anon && service, 'Local Supabase status environment is required');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pngA = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvXcAAAAASUVORK5CYII=', 'base64');
const pngB = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');

async function request(path, method, body, token = service, key = service) {
  const response = await fetch(base + path, {
    method,
    headers: { apikey: key, Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { response, data };
}
async function action(token, body) {
  const response = await fetch(fn, {
    method: 'POST',
    headers: { apikey: anon, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await response.json(); } catch {}
  return { response, data };
}
async function expectAction(token, body, status = 200) {
  const result = await action(token, body);
  assert.equal(result.response.status, status, body.action + ' expected ' + status + ', got ' + result.response.status + ': ' + JSON.stringify(result.data));
  return result.data;
}

const suffix = randomUUID().slice(0, 8).toUpperCase();
const adminPassword = 'Isolated-' + randomUUID() + '-Only!';
const adminEmail = 'du-admin-' + suffix + '@example.test';
const created = await request('/auth/v1/admin/users', 'POST', { email: adminEmail, password: adminPassword, email_confirm: true });
assert.equal(created.response.status, 200, 'create test admin: ' + JSON.stringify(created.data));
const login = await request('/auth/v1/token?grant_type=password', 'POST', { email: adminEmail, password: adminPassword }, anon, anon);
assert.equal(login.response.status, 200, 'sign in test admin');
const adminToken = login.data.access_token;
const allow = await request('/rest/v1/lr_admin_users', 'POST', [{ user_id: created.data.id, display_name: 'Synthetic E2E Admin', role: 'admin', active: true }]);
assert.ok(allow.response.ok, 'seed admin allowlist: ' + JSON.stringify(allow.data));

const nonAdminPassword = 'Isolated-' + randomUUID() + '-Only!';
const nonAdminEmail = 'du-user-' + suffix + '@example.test';
const nonAdmin = await request('/auth/v1/admin/users', 'POST', { email: nonAdminEmail, password: nonAdminPassword, email_confirm: true });
assert.equal(nonAdmin.response.status, 200);
const nonAdminLogin = await request('/auth/v1/token?grant_type=password', 'POST', { email: nonAdminEmail, password: nonAdminPassword }, anon, anon);
assert.equal(nonAdminLogin.response.status, 200);
const nonAdminResult = await action(nonAdminLogin.data.access_token, { action: 'dashboard' });
assert.equal(nonAdminResult.response.status, 401, 'valid non-admin JWT denied: ' + JSON.stringify(nonAdminResult.data));
const noAuth = await fetch(fn, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'dashboard' }) });
assert.equal(noAuth.status, 401, 'missing JWT denied');

const jobId = randomUUID();
const jobNumber = 'E2E-' + suffix;
const jobSeed = await request('/rest/v1/jobs', 'POST', [{
  id: jobId, job_number: jobNumber, client_name: 'Synthetic Client', subject_name: 'Synthetic Subject',
  subject_type: 'dog', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), workflow_status: 'intake_complete',
}]);
assert.ok(jobSeed.response.ok, 'seed job: ' + JSON.stringify(jobSeed.data));

const createBucket = await request('/storage/v1/bucket', 'POST', { id: 'du-intake', name: 'du-intake', public: false });
assert.ok(createBucket.response.ok || createBucket.response.status === 409, 'private bucket available');
async function uploadObject(path, bytes) {
  const response = await fetch(base + '/storage/v1/object/du-intake/' + path, {
    method: 'POST', headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'image/png', 'x-upsert': 'false' }, body: bytes,
  });
  assert.ok(response.ok, 'storage upload failed ' + response.status + ': ' + await response.text());
}
const sourceA = 'jobs/' + jobNumber + '/source-a.png';
const sourceB = 'jobs/' + jobNumber + '/source-b.png';
await uploadObject(sourceA, pngA);
await uploadObject(sourceB, pngB);
const photoA = randomUUID(), photoB = randomUUID();
const photoSeed = await request('/rest/v1/job_photos', 'POST', [
  { id: photoA, job_id: jobId, storage_bucket: 'du-intake', storage_path: sourceA, content_type: 'image/png', sort_order: 1 },
  { id: photoB, job_id: jobId, storage_bucket: 'du-intake', storage_path: sourceB, content_type: 'image/png', sort_order: 2 },
]);
assert.ok(photoSeed.response.ok, 'seed source rows: ' + JSON.stringify(photoSeed.data));

const dashboard = await expectAction(adminToken, { action: 'dashboard' });
assert.equal(dashboard.jobs.length, 1);
assert.equal(dashboard.jobs[0].job_number, jobNumber);
assert.equal(dashboard.jobs[0].source_photo_count, 2);
const detail = await expectAction(adminToken, { action: 'job', job_id: jobId });
assert.equal(detail.photos.length, 2);
assert.ok(detail.photos.every((photo) => photo.signed_url), 'private source photos get signed URLs');

const promptVersion = 'clean-room-v2.1';
const prompt = 'START D&U STENCIL — ' + jobNumber + ' — CLEAN ROOM v2.1\n\nUse 01-APPROVED-COMPOSITION as the only authority for pose and framing. Use identity references only for the same subject. Return one black-on-white stencil, preserving recognizable identity and avoiding tiny floating white details. Generation targets are not production certification.';
assert.equal((await action(adminToken, { action: 'generation_lock_package', job_id: jobId, composition_photo_id: photoA, locked_prompt: prompt })).response.status, 409, 'prompt version is required');
const locked = await expectAction(adminToken, { action: 'generation_lock_package', job_id: jobId, composition_photo_id: photoA, locked_prompt: prompt, prompt_version: promptVersion });
assert.ok(locked.package.id);
assert.equal(locked.package.source_manifest.sources.length, 2);
assert.equal(locked.package.source_manifest.prompt_version, promptVersion);
assert.deepEqual(locked.package.source_manifest.sources.map((source) => source.role), ['composition', 'identity_reference']);
assert.equal(locked.package.source_manifest.sources[0].sha256, hash(pngA));
assert.equal(locked.package.source_manifest.sources[1].sha256, hash(pngB));
assert.equal(Object.hasOwn(locked.package, 'client_name'), false);
assert.equal(locked.attempts.length, 1);
assert.equal((await action(adminToken, { action: 'generation_lock_package', job_id: jobId, composition_photo_id: photoA, locked_prompt: prompt, prompt_version: promptVersion })).response.status, 409);

const attemptA = locked.attempts[0];
await expectAction(adminToken, { action: 'generation_mark_attempt', job_id: jobId, attempt_id: attemptA.id, status: 'failed' }, 400);
const failed = await expectAction(adminToken, { action: 'generation_mark_attempt', job_id: jobId, attempt_id: attemptA.id, status: 'failed', failure_note: 'Synthetic isolated failure.' });
assert.equal(failed.attempts[0].status, 'failed');
assert.equal((await action(adminToken, { action: 'generation_upload_candidate', job_id: jobId, attempt_id: attemptA.id, image_data_url: 'data:image/png;base64,' + pngA.toString('base64') })).response.status, 409);

const stateB = await expectAction(adminToken, { action: 'generation_next_attempt', job_id: jobId });
const attemptB = stateB.attempts[1];
assert.equal(attemptB.package_id, locked.package.id);
assert.equal(attemptB.status, 'ready');
const imageB = 'data:image/png;base64,' + pngA.toString('base64');
const candidateB = await expectAction(adminToken, { action: 'generation_upload_candidate', job_id: jobId, attempt_id: attemptB.id, image_data_url: imageB });
assert.equal(candidateB.attempts[1].status, 'candidate');
await expectAction(adminToken, { action: 'generation_mark_attempt', job_id: jobId, attempt_id: attemptB.id, status: 'rejected' }, 400);
const rejected = await expectAction(adminToken, { action: 'generation_mark_attempt', job_id: jobId, attempt_id: attemptB.id, status: 'rejected', failure_note: 'Synthetic quality rejection.' });
assert.equal(rejected.attempts[1].status, 'rejected');

const stateC = await expectAction(adminToken, { action: 'generation_next_attempt', job_id: jobId });
const attemptC = stateC.attempts[2];
assert.equal(attemptC.attempt_number, 3);
assert.equal(attemptC.package_id, locked.package.id);
const candidateC = await expectAction(adminToken, { action: 'generation_upload_candidate', job_id: jobId, attempt_id: attemptC.id, image_data_url: 'data:image/png;base64,' + pngB.toString('base64') });
assert.equal(candidateC.attempts[2].status, 'candidate');
assert.equal((await action(adminToken, { action: 'generation_upload_candidate', job_id: jobId, attempt_id: attemptC.id, image_data_url: imageB })).response.status, 409);
assert.equal((await action(adminToken, { action: 'generation_next_attempt', job_id: jobId })).response.status, 409, 'three-attempt cap');
assert.ok(candidateC.attempts.every((attempt) => attempt.package_id === locked.package.id), 'A/B/C share only the immutable original package');

const selected = await expectAction(adminToken, { action: 'generation_select_attempt', job_id: jobId, attempt_id: attemptC.id });
assert.equal(selected.selection.attempt_id, attemptC.id);
assert.equal(selected.attempts[2].status, 'selected');
assert.equal((await action(adminToken, { action: 'generation_select_attempt', job_id: jobId, attempt_id: attemptC.id })).response.status, 409);

const correction = await expectAction(adminToken, { action: 'generation_start_correction', job_id: jobId, correction_prompt: 'Widen only the left ear connection.' });
assert.equal(correction.correction.base_attempt_id, attemptC.id);
assert.equal(correction.correction.base_candidate_sha256, candidateC.attempts[2].candidate_sha256);
assert.equal((await action(adminToken, { action: 'generation_start_correction', job_id: jobId, correction_prompt: 'Widen only the left ear connection.' })).response.status, 409);
const correctionUpload = await expectAction(adminToken, { action: 'generation_upload_correction', job_id: jobId, image_data_url: imageB });
const finalMaster = await expectAction(adminToken, { action: 'generation_finalize_master', job_id: jobId, master_kind: 'correction' });
assert.equal(finalMaster.final_master.master_sha256, correctionUpload.correction.corrected_sha256);

const productionBytes = pngB;
const productionHash = hash(productionBytes);
const productionImage = 'data:image/png;base64,' + productionBytes.toString('base64');
const wrongReport = { artwork_width_mm: 190.5, cases: [{ physical_verdict: 'PASS', source_sha256: hash(pngA) }] };
await expectAction(adminToken, { action: 'generation_upload_production', job_id: jobId, image_data_url: productionImage, validator_report: wrongReport }, 400);
const report = { artwork_width_mm: 190.5, cases: [{ physical_verdict: 'PASS', source_sha256: productionHash }] };
const production = await expectAction(adminToken, { action: 'generation_upload_production', job_id: jobId, image_data_url: productionImage, validator_report: report });
assert.equal(production.production_run.output_sha256, productionHash);
assert.equal(production.production_run.input_master_sha256, finalMaster.final_master.master_sha256);
assert.equal((await action(adminToken, { action: 'generation_upload_production', job_id: jobId, image_data_url: productionImage, validator_report: report })).response.status, 409);

const browserRead = await request('/rest/v1/du_generation_packages?job_id=eq.' + jobId + '&select=id', 'GET', undefined, adminToken, anon);
assert.equal(browserRead.response.status, 401, 'authenticated browser role cannot access private orchestration rows');
const immutableEdit = await request('/rest/v1/du_generation_packages?id=eq.' + locked.package.id, 'PATCH', { locked_prompt: 'Mutate locked prompt' });
assert.equal(immutableEdit.response.status, 400, 'database trigger rejects service-role mutation');
const readback = await expectAction(adminToken, { action: 'generation_state', job_id: jobId });
assert.equal(readback.package.id, locked.package.id);
assert.deepEqual(readback.attempts.map((attempt) => attempt.status), ['failed', 'rejected', 'selected']);
assert.equal(readback.selection.attempt_id, attemptC.id);
assert.equal(readback.correction.base_candidate_sha256, candidateC.attempts[2].candidate_sha256);
assert.equal(readback.final_master.master_sha256, finalMaster.final_master.master_sha256);
assert.equal(readback.production_run.output_sha256, productionHash);
console.log(JSON.stringify({
  result: 'PASS', job_number: jobNumber, authenticated_admin_dashboard: true,
  source_sha256: readback.package.source_manifest.sources.map((source) => ({ role: source.role, sha256: source.sha256 })),
  attempts: readback.attempts.map((attempt) => ({ number: attempt.attempt_number, package_id: attempt.package_id, status: attempt.status })),
  correction_base_sha256: readback.correction.base_candidate_sha256,
  final_master_sha256: readback.final_master.master_sha256,
  production_output_sha256: productionHash, validator_report: report,
  invalid_transitions_rejected: true, persisted_readback: true,
}, null, 2));
