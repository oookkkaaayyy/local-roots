import { createHash, randomUUID } from 'node:crypto';
import { readZipMember } from './zip-member.mjs';

const ACCOUNT = 'e3bc6b78f1104fa0c2a01245084594cf';
const ZONE = 'f126298df13dcb1d8b58b62b47f52a20';
const PROJECT = 'phcpbvuqibyarpfrftgx';
const RETAINED_WORKER_ROLLBACK = '3b019c24-0288-4c0d-bcc2-46cb6028d0f6';
const EDGE_SLUGS = Object.freeze({ 'edge-tag-editor': 'hbnf-tag-editor', 'edge-tags-live': 'hbnf-tags-live', 'edge-watch-score': 'hbnf-watch-score' });
const sha = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) || value instanceof Uint8Array ? value : JSON.stringify(value)).digest('hex');
const STABLE_STATE_SQL = `select jsonb_build_object(
 'project', (select jsonb_build_object('id', project, 'version', version) from (select current_database() as project, current_setting('server_version') as version) p),
 'league_state', (select jsonb_build_object('id',id,'updated_at',updated_at,'bytes',octet_length(state_json::text),'sha256',encode(digest(state_json::text,'sha256'),'hex')) from public.league_state where id=1),
 'triggers', (select coalesce(jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definitionSha256',encode(digest(pg_get_triggerdef(oid)::text,'sha256'),'hex')) order by tgname),'[]'::jsonb) from pg_trigger where tgrelid='public.league_state'::regclass and not tgisinternal),
 'functions', (select coalesce(jsonb_agg(jsonb_build_object('name',p.proname,'securityDefiner',p.prosecdef,'definitionSha256',encode(digest(pg_get_functiondef(p.oid)::text,'sha256'),'hex')) order by p.proname),'[]'::jsonb) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('hbnf_enforce_league_state_revision','hbnf_save_league_state_v1','hbnf_verify_round_tag_v1')),
 'grants', (select coalesce(jsonb_agg(jsonb_build_object('grantee',grantee,'privilege',privilege_type) order by grantee,privilege_type),'[]'::jsonb) from information_schema.role_table_grants where table_schema='public' and table_name='league_state' and grantee in ('anon','authenticated','service_role')),
 'policies', (select coalesce(jsonb_agg(jsonb_build_object('name',policyname,'permissive',permissive,'roles',roles,'cmd',cmd,'qual',qual,'withCheck',with_check) order by policyname),'[]'::jsonb) from pg_policies where schemaname='public' and tablename='league_state')
) as snapshot`;

function authFetch(fetchImpl, base, token) {
  if (!token) throw new Error('AUTH_CONFIGURATION_MISSING');
  return async (path, init = {}) => {
    const response = await fetchImpl(`${base}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } });
    if (!response.ok) throw new Error(`PROVIDER_READ_FAILED:${response.status}`);
    return response;
  };
}

export function createAuthenticatedReadAdapters({ env = process.env, fetchImpl = fetch } = {}) {
  const cf = authFetch(fetchImpl, 'https://api.cloudflare.com/client/v4', env.CLOUDFLARE_API_TOKEN);
  const sb = authFetch(fetchImpl, 'https://api.supabase.com', env.SUPABASE_ACCESS_TOKEN);
  const drive = authFetch(fetchImpl, 'https://www.googleapis.com', env.GOOGLE_DRIVE_ACCESS_TOKEN);
  const json = async response => response.json();
  return Object.freeze({
    readOnly: true,
    async readAllTargets() {
      const [deployment, versions, routes, project, functions, query] = await Promise.all([
        cf(`/accounts/${ACCOUNT}/workers/scripts/hbnf/deployments`).then(json),
        cf(`/accounts/${ACCOUNT}/workers/scripts/hbnf/versions`).then(json),
        cf(`/zones/${ZONE}/workers/routes`).then(json),
        sb(`/v1/projects/${PROJECT}`).then(json),
        sb(`/v1/projects/${PROJECT}/functions`).then(json),
        sb(`/v1/projects/${PROJECT}/database/query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: STABLE_STATE_SQL }) }).then(json),
      ]);
      const latestDeployment = deployment.result?.deployments?.[0];
      const active = latestDeployment?.versions?.find(v => v.percentage === 100);
      if (!active?.version_id) throw new Error('ACTIVE_WORKER_VERSION_NOT_UNAMBIGUOUS');
      const versionItems = versions.result?.items;
      if (!Array.isArray(versionItems)) throw new Error('WORKER_VERSION_LIST_MISSING');
      const version = versionItems.find(v => v.id === active.version_id);
      const retainedRollback = versionItems.find(v => v.id === RETAINED_WORKER_ROLLBACK);
      const route = (routes.result || []).find(r => r.pattern === 'hbnightflyers.com' && r.script === 'hbnf');
      if (!version || !route || !retainedRollback) throw new Error('WORKER_VERSION_ROUTE_OR_RETAINED_ROLLBACK_NOT_FOUND');
      const rows = query.result || query;
      const dbSnapshot = Array.isArray(rows) ? rows[0]?.snapshot : rows?.snapshot;
      if (!dbSnapshot) throw new Error('DATABASE_READBACK_MISSING');
      const bySlug = new Map((functions || []).map(f => [f.slug, f]));
      const targets = {
        'cloudflare-worker': { accountId: ACCOUNT, service: 'hbnf', activeVersionId: version.id, versionNumber: version.number, deploymentId: latestDeployment.id, percentage: active.percentage, route, versionIdentity: version.source?.hash || version.id, retainedRollbackVersionId: retainedRollback.id, retainedRollbackVersionNumber: retainedRollback.number },
        'supabase-schema': { projectId: PROJECT, projectStatus: project.status, region: project.region, snapshot: dbSnapshot },
      };
      for (const [targetId, slug] of Object.entries(EDGE_SLUGS)) {
        const fn = bySlug.get(slug);
        if (!fn || fn.status !== 'ACTIVE') throw new Error(`EDGE_IDENTITY_UNAVAILABLE:${slug}`);
        targets[targetId] = { projectId: PROJECT, slug, status: fn.status, version: fn.version, providerSourceIdentity: fn.ezbr_sha256, verifyJwt: fn.verify_jwt, updatedAt: fn.updated_at };
      }
      return targets;
    },
    async persistAndDownloadBack(name, bytes, parentFolderId) {
      if (!env.GOOGLE_DRIVE_ACCESS_TOKEN || !parentFolderId) throw new Error('DURABLE_EVIDENCE_CONFIGURATION_MISSING');
      const boundary = `hbnf-${randomUUID()}`;
      const meta = JSON.stringify({ name, parents: [parentFolderId], mimeType: 'application/octet-stream' });
      const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`, bytes, `\r\n--${boundary}--`]);
      const created = await drive('/upload/drive/v3/files?uploadType=multipart&fields=id,name,size', { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body }).then(json);
      const back = await drive(`/drive/v3/files/${encodeURIComponent(created.id)}?alt=media`);
      const downloaded = Buffer.from(await back.arrayBuffer());
      if (!Buffer.from(bytes).equals(downloaded)) throw new Error('DURABLE_EVIDENCE_DOWNLOADBACK_MISMATCH');
      return { id: created.id, name: created.name, bytes: downloaded.length, sha256: sha(downloaded), downloadBackVerified: true };
    },
    async readAndVerifyDriveArtifact({ driveFileId, sha256: expectedSha, bytes: expectedBytes, zipMember, memberSha256, memberBytes }) {
      const response=await drive(`/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`);
      const downloaded=Buffer.from(await response.arrayBuffer()), actualSha=sha(downloaded);
      const archiveVerified=downloaded.length===expectedBytes&&actualSha===expectedSha;
      if (!zipMember) return { driveFileId, bytes:downloaded.length, sha256:actualSha, verified:archiveVerified };
      if (!archiveVerified || !/^[a-f0-9]{64}$/.test(memberSha256||'') || !Number.isSafeInteger(memberBytes) || memberBytes < 1) {
        return { driveFileId, zipMember, bytes:downloaded.length, sha256:actualSha, verified:false };
      }
      try {
        const member=readZipMember(downloaded,zipMember);
        const memberActualSha=sha(member);
        return {driveFileId,zipMember,bytes:downloaded.length,sha256:actualSha,
          memberBytes:member.length,memberSha256:memberActualSha,
          verified:member.length===memberBytes&&memberActualSha===memberSha256};
      } catch { return {driveFileId,zipMember,bytes:downloaded.length,sha256:actualSha,verified:false}; }
    },
  });
}

export const providerTargets = Object.freeze({ accountId: ACCOUNT, zoneId: ZONE, projectId: PROJECT, edgeFunctions: EDGE_SLUGS });
