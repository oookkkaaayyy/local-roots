// Authenticated, read-only Cloudflare source capture and independently durable Drive backup.
// Does NOT establish version-specific executable parity, perform rollback, or admit production.
import { createHash, randomUUID } from 'node:crypto';

const ACCOUNT = 'e3bc6b78f1104fa0c2a01245084594cf';
const ZONE = 'f126298df13dcb1d8b58b62b47f52a20';
const SCRIPT = 'hbnf';
const ROUTE = 'hbnightflyers.com';
const sha256 = b => createHash('sha256').update(b).digest('hex');
const hex64 = /^[a-f0-9]{64}$/;
const versionId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function tokens(env) {
  if (!env?.CLOUDFLARE_API_TOKEN || !env?.GOOGLE_DRIVE_ACCESS_TOKEN) throw Error('CLOUDFLARE_AND_DRIVE_AUTH_REQUIRED');
  return { cf: env.CLOUDFLARE_API_TOKEN, drive: env.GOOGLE_DRIVE_ACCESS_TOKEN };
}

function checkedFetch(fetchImpl, token, root) {
  return async (path, init = {}) => {
    const response = await fetchImpl(root + path, {
      ...init, headers: { authorization: 'Bearer ' + token, ...(init.headers || {}) }
    });
    if (!response.ok) throw Error('RECOVERY_PROVIDER_HTTP_' + response.status);
    return response;
  };
}

function pinned(manifest) {
  if (manifest?.status !== 'PENDING_NOT_ADMITTED' || manifest?.productionMutationAuthorized !== false)
    throw Error('CONTROLLING_MANIFEST_NOT_REVIEW_ONLY');
  const worker = manifest?.targets?.find(t => t.id === 'cloudflare-worker');
  if (!worker || worker.accountId !== ACCOUNT || worker.worker !== SCRIPT ||
    !versionId.test(worker.lastAuthenticatedVersionId || '') ||
    !hex64.test(worker.sourceMultipart?.sha256 || '') ||
    !Number.isSafeInteger(worker.sourceMultipart?.bytes) || worker.sourceMultipart.bytes < 1)
    throw Error('EXACT_CLOUDFLARE_BASELINE_MISSING');
  if (!hex64.test(worker.lastAuthenticatedScriptEtag || '')) throw Error('EXACT_VERSION_SCRIPT_ETAG_MISSING');
  return { version: worker.lastAuthenticatedVersionId, hash: worker.sourceMultipart.sha256,
    bytes: worker.sourceMultipart.bytes, scriptEtag: worker.lastAuthenticatedScriptEtag };
}

async function identity(cf, expectedVersion, expectedScriptEtag) {
  const [deployment, routes, version] = await Promise.all([
    cf('/accounts/' + ACCOUNT + '/workers/scripts/' + SCRIPT + '/deployments').then(r => r.json()),
    cf('/zones/' + ZONE + '/workers/routes').then(r => r.json()),
    cf('/accounts/' + ACCOUNT + '/workers/scripts/' + SCRIPT + '/versions/' + expectedVersion).then(r => r.json())
  ]);
  const deployments = deployment?.result?.deployments;
  if (!Array.isArray(deployments) || !deployments.length) throw Error('WORKER_DEPLOYMENT_UNAVAILABLE');
  const current = deployments[0];
  if (current?.versions?.length !== 1 || current.versions[0]?.percentage !== 100 ||
      current.versions[0]?.version_id !== expectedVersion)
    throw Error('WORKER_ACTIVE_VERSION_CHANGED');
  const route = routes?.result?.find?.(r => r.pattern === ROUTE && r.script === SCRIPT);
  if (!route) throw Error('WORKER_ROUTE_CHANGED');
  const v = version?.result;
  if (v?.id !== expectedVersion || !Number.isFinite(v.number)) throw Error('WORKER_VERSION_IDENTITY_MISSING');
  if (v?.resources?.script?.etag !== expectedScriptEtag) throw Error('WORKER_VERSION_SCRIPT_ETAG_MISMATCH');
  return { deploymentId: current.id, activeVersionId: expectedVersion, versionNumber: v.number,
    routeId: route.id || null, routePattern: route.pattern, routeScript: route.script,
    versionSpecificScriptEtag: expectedScriptEtag,
    versionResourcesSha256: sha256(Buffer.from(JSON.stringify(v.resources || null))) };
}

async function storeAndDownloadBack(drive, name, payload, folderId) {
  if (!folderId || typeof folderId !== 'string') throw Error('PRIVATE_EVIDENCE_FOLDER_REQUIRED');
  const boundary = 'hbnf-recovery-' + randomUUID();
  const meta = JSON.stringify({ name, parents: [folderId], mimeType: 'application/octet-stream' });
  const body = new Blob([
    '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta +
    '\r\n--' + boundary + '\r\nContent-Type: application/octet-stream\r\n\r\n',
    payload, '\r\n--' + boundary + '--'
  ]);
  const uploaded = await drive('/upload/drive/v3/files?uploadType=multipart&fields=id,name,size', {
    method: 'POST', headers: { 'content-type': 'multipart/related; boundary=' + boundary }, body
  }).then(r => r.json());
  if (!uploaded?.id) throw Error('DRIVE_BACKUP_UPLOAD_NOT_CONFIRMED');
  const back = Buffer.from(await (await drive('/drive/v3/files/' + encodeURIComponent(uploaded.id) + '?alt=media')).arrayBuffer());
  if (!Buffer.from(payload).equals(back)) throw Error('DRIVE_BACKUP_DOWNLOADBACK_MISMATCH');
  return { driveFileId: uploaded.id, bytes: back.length, sha256: sha256(back), downloadBackVerified: true };
}

export async function captureCurrentWorkerSource({ manifest, manifestSha256, folderId, env = process.env, fetchImpl = fetch }) {
  const pin = pinned(manifest);
  if (!hex64.test(manifestSha256 || '')) throw Error('CONTROLLING_MANIFEST_HASH_REQUIRED');
  const t = tokens(env);
  const cf = checkedFetch(fetchImpl, t.cf, 'https://api.cloudflare.com/client/v4');
  const drive = checkedFetch(fetchImpl, t.drive, 'https://www.googleapis.com');
  const before = await identity(cf, pin.version, pin.scriptEtag);
  const raw = Buffer.from(await (await cf('/accounts/' + ACCOUNT + '/workers/scripts/' + SCRIPT)).arrayBuffer());
  if (raw.length !== pin.bytes || sha256(raw) !== pin.hash) throw Error('WORKER_SCRIPT_BYTES_NOT_PINNED_BASELINE');
  const after = await identity(cf, pin.version, pin.scriptEtag);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('WORKER_DEPLOYMENT_DRIFT_DURING_CAPTURE');
  const backup = await storeAndDownloadBack(drive, 'hbnf-worker-active-' + pin.version + '.raw', raw, folderId);
  const finalIdentity = await identity(cf, pin.version, pin.scriptEtag);
  if (JSON.stringify(after) !== JSON.stringify(finalIdentity)) throw Error('WORKER_DEPLOYMENT_DRIFT_AFTER_BACKUP');
  const receipt = {
    schemaVersion: 1, recordType: 'HBNF_CLOUDFLARE_SOURCE_CAPTURE',
    controllingManifestSha256: manifestSha256, worker: SCRIPT, route: ROUTE,
    providerIdentity: finalIdentity, source: backup,
    sourceMatchesManifest: true, authenticatedScriptRead: true,
    versionSpecificScriptEtagVerified: true,
    versionSpecificExecutableBytesVerified: false,
    executableRollbackTested: false, releaseAdmission: 'NOT_ADMITTED',
  };
  const receiptBytes = Buffer.from(JSON.stringify(receipt));
  const receiptStored = await storeAndDownloadBack(drive, 'hbnf-worker-active-' + pin.version + '.capture-receipt.json', receiptBytes, folderId);
  return { status: 'SOURCE_BACKUP_DURABLE_ROLLBACK_UNQUALIFIED', source: backup,
    receipt: receiptStored, providerIdentity: finalIdentity,
    versionSpecificExecutableBytesVerified: false, versionSpecificScriptEtagVerified: true,
    releaseAdmission: 'NOT_ADMITTED' };
}

export async function captureFromControllingDriveManifest({
  manifestFileId, expectedManifestSha256, env = process.env, fetchImpl = fetch
}) {
  if (!manifestFileId || !hex64.test(expectedManifestSha256 || '')) throw Error('PINNED_MANIFEST_ID_AND_HASH_REQUIRED');
  const t = tokens(env);
  const drive = checkedFetch(fetchImpl, t.drive, 'https://www.googleapis.com');
  const bytes = Buffer.from(await (await drive('/drive/v3/files/' + encodeURIComponent(manifestFileId) + '?alt=media')).arrayBuffer());
  if (sha256(bytes) !== expectedManifestSha256) throw Error('CONTROLLING_MANIFEST_CHANGED');
  const metadata = await drive('/drive/v3/files/' + encodeURIComponent(manifestFileId) + '?fields=id,parents,trashed').then(r => r.json());
  if (metadata.trashed || metadata.id !== manifestFileId || metadata.parents?.length !== 1) throw Error('PRIVATE_MANIFEST_PARENT_NOT_UNAMBIGUOUS');
  // A UTF-8 BOM is present in the controlling Drive record; preserve original bytes for SHA verification.
  const manifest = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  return captureCurrentWorkerSource({ manifest, manifestSha256: expectedManifestSha256,
    folderId: metadata.parents[0], env, fetchImpl });
}


// Cloudflare-only, GET-only capture path for an existing authenticated
// Wrangler Mac. The output is UNBACKED-UP source evidence until a separate
// private Drive upload and independent byte-identical download-back.
// This intentionally never requires a Google Drive bearer token on the Mac.
export async function captureCurrentWorkerForOfflineTransfer({
 manifest,manifestSha256,env=process.env,fetchImpl=fetch
}={}){
 const pin=pinned(manifest);
 if(!hex64.test(manifestSha256||''))throw Error('CONTROLLING_MANIFEST_HASH_REQUIRED');
 if(!env?.CLOUDFLARE_API_TOKEN)throw Error('CLOUDFLARE_EXISTING_AUTH_REQUIRED');
 const cf=checkedFetch(fetchImpl,env.CLOUDFLARE_API_TOKEN,'https://api.cloudflare.com/client/v4');
 const before=await identity(cf,pin.version,pin.scriptEtag);
 const bytes=Buffer.from(await (await cf('/accounts/'+ACCOUNT+'/workers/scripts/'+SCRIPT)).arrayBuffer());
 if(bytes.length!==pin.bytes||sha256(bytes)!==pin.hash)
  throw Error('WORKER_SCRIPT_BYTES_NOT_PINNED_BASELINE');
 const after=await identity(cf,pin.version,pin.scriptEtag);
 if(JSON.stringify(before)!==JSON.stringify(after))
  throw Error('WORKER_DEPLOYMENT_DRIFT_DURING_CAPTURE');
 return {
  schemaVersion:1,status:'LOCAL_SOURCE_VERIFIED_NOT_DURABLE_OR_ROLLBACK_QUALIFIED',
  recordType:'HBNF_CLOUDFLARE_GET_ONLY_OFFLINE_TRANSFER',
  controllingManifestFileId:'12X06fFmdc5oPGlcq9kprf1hhglbVV7mW',
  controllingManifestSha256:manifestSha256,
  providerIdentity:after,
  source:{bytes:bytes.length,sha256:sha256(bytes),multipartBase64:bytes.toString('base64')},
  providerMethod:'GET_ONLY',
  driveDownloadBackVerified:false,
  versionSpecificExecutableBytesVerified:false,
  executableRollbackTested:false,
  releaseAdmission:'NOT_ADMITTED'
 };
}
