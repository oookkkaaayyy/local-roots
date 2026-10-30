const DRIVE_FOLDER = '1mZWMyzLIKnSjBTP82-EfGOqktld17X84';
const BASE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export function createGoogleDriveReleaseStore({ token = process.env.GOOGLE_DRIVE_ACCESS_TOKEN, fetchImpl = fetch } = {}) {
  if (!token) throw new Error('GOOGLE_DRIVE_ACCESS_TOKEN is required for durable admission storage');
  async function request(url, init = {}) {
    const response = await fetchImpl(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Google Drive durable operation failed with HTTP ${response.status}`);
    return response;
  }
  async function findByName(name) {
    const escaped = name.replaceAll("'", "\\'");
    const query = `name='${escaped}' and '${DRIVE_FOLDER}' in parents and trashed=false`;
    const found = [];
    let pageToken;
    do {
      const url = new URL(BASE);
      url.searchParams.set('q', query);
      url.searchParams.set('pageSize', '100');
      url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,size,webViewLink)');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const page = await (await request(url)).json();
      found.push(...(page.files || []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return found;
  }
  const durableStore = {
    async putOnce(name, bytes) {
      if (await findByName(name).then(files => files.length)) throw new Error(`${name} already exists; refusing overwrite or replay`);
      const boundary = `codex-${crypto.randomUUID()}`;
      const metadata = JSON.stringify({ name, mimeType: 'application/json', parents: [DRIVE_FOLDER] });
      const content = Buffer.from(bytes);
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n`), content,
        Buffer.from(`\r\n--${boundary}--`),
      ]);
      const url = new URL(UPLOAD);
      url.searchParams.set('uploadType', 'multipart');
      url.searchParams.set('fields', 'id,name,mimeType,size,webViewLink');
      const created = await (await request(url, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })).json();
      if (!created.id || !created.webViewLink) throw new Error(`${name} Drive create did not return immutable file identity and URL`);
      const copies = await findByName(name);
      if (copies.length !== 1 || copies[0].id !== created.id) throw new Error(`${name} is duplicated in the one-time Drive ledger; refusing admission`);
      return { id: created.id, url: created.webViewLink };
    },
    async download(id) {
      const url = new URL(`${BASE}/${encodeURIComponent(id)}`);
      url.searchParams.set('alt', 'media');
      return Buffer.from(await (await request(url)).arrayBuffer());
    },
  };
  const oneTimeLedger = {
    async claim(releaseId, manifestSha256, manifestDriveFileId) {
      const name = `${releaseId}.one-time-claim.json`;
      if (await findByName(name).then(files => files.length)) return false;
      try {
        const claim = Buffer.from(`${JSON.stringify({ format: 'hbnf-one-time-admission-claim-v1', releaseId, manifestSha256, manifestDriveFileId }, null, 2)}\n`);
        const stored = await durableStore.putOnce(name, claim);
        if (!(await durableStore.download(stored.id)).equals(claim)) return false;
        return true;
      } catch {
        return false;
      }
    },
    async has(releaseId) { return (await findByName(`${releaseId}.one-time-claim.json`)).length > 0; },
  };
  return { durableStore, oneTimeLedger };
}

let cached;
function adapters() {
  if (!cached) cached = createGoogleDriveReleaseStore();
  return cached;
}
export const durableStore = {
  putOnce: (...args) => adapters().durableStore.putOnce(...args),
  download: (...args) => adapters().durableStore.download(...args),
};
export const oneTimeLedger = {
  claim: (...args) => adapters().oneTimeLedger.claim(...args),
  has: (...args) => adapters().oneTimeLedger.has(...args),
};
export async function loadPriorLedger() {
  const releaseId = 'hbnf-glow-d68334f67026';
  return await oneTimeLedger.has(releaseId) ? [{ releaseId, state: 'ADMISSION_PASS' }] : [];
}
