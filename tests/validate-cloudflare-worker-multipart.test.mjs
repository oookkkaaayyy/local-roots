import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCloudflareWorkerMultipart } from '../scripts/validate-cloudflare-worker-multipart.mjs';

const sourceMap = JSON.stringify({ version: 3, file: 'worker.js', sources: ['worker.ts'], names: [], mappings: 'AAAA' });
const mapName = 'worker.js.map';

function makeMultipart({ mapBytes = Buffer.from(sourceMap), base64Map = false, script = '//# sourceMappingURL=worker.js.map\n', mapType = 'application/source-map' } = {}) {
  const form = new FormData();
  const metadata = base64Map ? {
    main_module: 'worker.js',
    modules: [{ name: mapName, content_type: mapType, content_base64: mapBytes.toString('base64') }],
  } : { main_module: 'worker.js', modules: [] };
  form.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json');
  form.set('worker.js', new Blob([script], { type: 'application/javascript' }), 'worker.js');
  if (!base64Map) form.set(mapName, new Blob([mapBytes], { type: mapType }), mapName);
  return new Request('https://example.invalid/upload', { method: 'POST', body: form });
}

test('accepts a valid raw Source Map v3 in the actual multipart form body', async () => {
  const request = makeMultipart();
  const result = await validateCloudflareWorkerMultipart(await request.arrayBuffer(), request.headers.get('content-type'));
  assert.deepEqual(result, { valid: true, sourceMaps: 1, references: 1 });
});

test('decodes and validates a base64 Source Map v3 inside Cloudflare metadata', async () => {
  const request = makeMultipart({ base64Map: true });
  const result = await validateCloudflareWorkerMultipart(await request.arrayBuffer(), request.headers.get('content-type'));
  assert.deepEqual(result, { valid: true, sourceMaps: 1, references: 1 });
});

test('rejects invalid raw map JSON before upload', async () => {
  const request = makeMultipart({ mapBytes: Buffer.from('{"version":3,') });
  const body = await request.arrayBuffer();
  await assert.rejects(() => validateCloudflareWorkerMultipart(body, request.headers.get('content-type')), /not valid JSON/);
});

test('rejects malformed VLQ mappings and accepts indexed Source Map v3 sections', async () => {
  const malformed = Buffer.from(JSON.stringify({ version: 3, sources: ['worker.ts'], names: [], mappings: 'A?' }));
  const invalidRequest = makeMultipart({ mapBytes: malformed });
  const invalidBody = await invalidRequest.arrayBuffer();
  await assert.rejects(() => validateCloudflareWorkerMultipart(invalidBody, invalidRequest.headers.get('content-type')), /non-base64 VLQ/);

  const indexed = Buffer.from(JSON.stringify({ version: 3, sections: [{ offset: { line: 0, column: 0 }, map: JSON.parse(sourceMap) }] }));
  const validRequest = makeMultipart({ mapBytes: indexed });
  const validBody = await validRequest.arrayBuffer();
  const result = await validateCloudflareWorkerMultipart(validBody, validRequest.headers.get('content-type'));
  assert.deepEqual(result, { valid: true, sourceMaps: 1, references: 1 });
});

test('rejects malformed base64 source map metadata', async () => {
  const request = makeMultipart({ base64Map: true, mapBytes: Buffer.from(sourceMap) });
  const parsed = await request.formData();
  const metadata = JSON.parse(await parsed.get('metadata').text());
  metadata.modules[0].content_base64 = 'not-base64!';
  parsed.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json');
  const rewritten = new Request(request.url, { method: 'POST', body: parsed });
  const body = await rewritten.arrayBuffer();
  await assert.rejects(() => validateCloudflareWorkerMultipart(body, rewritten.headers.get('content-type')), /canonical base64/);
});

test('rejects an invalid source-map media type and an unresolved JavaScript map reference', async () => {
  const wrongType = makeMultipart({ base64Map: true, mapType: 'application/json' });
  const wrongTypeBody = await wrongType.arrayBuffer();
  await assert.rejects(() => validateCloudflareWorkerMultipart(wrongTypeBody, wrongType.headers.get('content-type')), /must use content_type application\/source-map/);
  const missing = makeMultipart({ script: '//# sourceMappingURL=missing.js.map\n' });
  const form = await missing.formData();
  form.delete(mapName);
  const noMap = new Request(missing.url, { method: 'POST', body: form });
  const noMapBody = await noMap.arrayBuffer();
  await assert.rejects(() => validateCloudflareWorkerMultipart(noMapBody, noMap.headers.get('content-type')), /references missing source map/);
});
