#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const SOURCE_MAP_TYPE = 'application/source-map';

function fail(message) {
  throw new Error(message);
}

function decodeBase64(value, label) {
  if (typeof value !== 'string' || value.length === 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    fail(`${label} must be canonical base64`);
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) fail(`${label} must be canonical base64`);
  return bytes;
}

function parseSourceMap(bytes, label) {
  let map;
  try {
    map = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
  if (!map || typeof map !== 'object' || Array.isArray(map) || map.version !== 3) {
    fail(`${label} must be a Source Map v3 object`);
  }
  const indexed = Array.isArray(map.sections);
  if (indexed && map.sections.some(section => !section || typeof section !== 'object' || !section.map)) {
    fail(`${label} indexed sections must each contain a map`);
  }
  if (!indexed && (!Array.isArray(map.sources) || typeof map.mappings !== 'string')) {
    fail(`${label} must include a sources array and mappings string`);
  }
  if (Array.isArray(map.sources) && map.sources.some(source => typeof source !== 'string')) {
    fail(`${label} sources entries must be strings`);
  }
  if (map.file !== undefined && typeof map.file !== 'string') {
    fail(`${label} file must be a string when present`);
  }
  if (map.sourceRoot !== undefined && typeof map.sourceRoot !== 'string') {
    fail(`${label} sourceRoot must be a string when present`);
  }
  if (map.sourcesContent !== undefined && (!Array.isArray(map.sourcesContent) ||
      map.sourcesContent.some(source => source !== null && typeof source !== 'string'))) {
    fail(`${label} sourcesContent must be an array of strings or nulls`);
  }
  if (map.names !== undefined && (!Array.isArray(map.names) || map.names.some(name => typeof name !== 'string'))) {
    fail(`${label} names must be an array of strings when present`);
  }
  validateMappings(map, label);
  return map;
}

const VLQ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeVlq(segment, label) {
  const values = [];
  let value = 0;
  let shift = 0;
  for (const char of segment) {
    const digit = VLQ.indexOf(char);
    if (digit < 0) fail(`${label} contains a non-base64 VLQ character`);
    const continuation = digit & 32;
    value += (digit & 31) * (2 ** shift);
    if (!continuation) {
      const negative = value & 1;
      const magnitude = Math.floor(value / 2);
      values.push(negative ? -magnitude : magnitude);
      value = 0;
      shift = 0;
    } else {
      shift += 5;
      if (shift > 50) fail(`${label} contains an overlong VLQ value`);
    }
  }
  if (shift !== 0) fail(`${label} contains a truncated VLQ value`);
  return values;
}

function validateMappings(map, label) {
  // Indexed maps use sections instead of the flat sources/mappings fields.
  if (Array.isArray(map.sections)) {
    for (const [index, section] of map.sections.entries()) {
      if (!section || typeof section !== 'object' || !section.map) fail(`${label} section ${index} must contain a map`);
      validateMappings(section.map, `${label} section ${index}`);
    }
    return;
  }
  if (typeof map.mappings !== 'string') return;
  let sourceIndex = 0;
  let originalLine = 0;
  let originalColumn = 0;
  let nameIndex = 0;
  for (const [lineIndex, line] of map.mappings.split(';').entries()) {
    let generatedColumn = 0;
    if (line === '') continue;
    for (const [segmentIndex, segment] of line.split(',').entries()) {
      if (segment === '') fail(`${label} line ${lineIndex + 1} has an empty segment`);
      const fields = decodeVlq(segment, `${label} line ${lineIndex + 1} segment ${segmentIndex + 1}`);
      if (![1, 4, 5].includes(fields.length)) fail(`${label} segments must contain 1, 4, or 5 VLQ fields`);
      generatedColumn += fields[0];
      if (generatedColumn < 0) fail(`${label} generated columns cannot be negative`);
      if (fields.length === 1) continue;
      sourceIndex += fields[1];
      originalLine += fields[2];
      originalColumn += fields[3];
      if (sourceIndex < 0 || sourceIndex >= map.sources.length) fail(`${label} references a source outside sources[]`);
      if (originalLine < 0 || originalColumn < 0) fail(`${label} original positions cannot be negative`);
      if (fields.length === 5) {
        nameIndex += fields[4];
        if (!Array.isArray(map.names) || nameIndex < 0 || nameIndex >= map.names.length) fail(`${label} references a name outside names[]`);
      }
    }
  }
}

function isMapPart(name, type) {
  return type.split(';', 1)[0].trim().toLowerCase() === SOURCE_MAP_TYPE || /\.map$/i.test(name);
}

function validateMetadataModules(metadata, availableMaps) {
  if (!Array.isArray(metadata.modules)) return;
  for (const [index, module] of metadata.modules.entries()) {
    if (!module || typeof module !== 'object') fail(`metadata.modules[${index}] must be an object`);
    if (module.content_type === SOURCE_MAP_TYPE || /\.map$/i.test(module.name || '')) {
      if (typeof module.name !== 'string' || module.name.length === 0) fail(`metadata.modules[${index}].name is required for source maps`);
      if (module.content_type !== SOURCE_MAP_TYPE) fail(`source map ${module.name} must use content_type ${SOURCE_MAP_TYPE}`);
      const bytes = decodeBase64(module.content_base64, `metadata.modules[${index}].content_base64`);
      parseSourceMap(bytes, `source map ${module.name}`);
      availableMaps.add(module.name);
    }
  }
}

export async function validateCloudflareWorkerMultipart(body, contentType) {
  if (!/^multipart\/form-data\s*;/i.test(contentType || '')) fail('Content-Type must be multipart/form-data with a boundary');
  let form;
  try {
    form = await new Response(body, { headers: { 'content-type': contentType } }).formData();
  } catch (error) {
    fail(`multipart body could not be parsed: ${error.message}`);
  }

  const availableMaps = new Set();
  let metadata = null;
  for (const [name, value] of form.entries()) {
    if (name === 'metadata') {
      const text = typeof value === 'string' ? value : await value.text();
      try { metadata = JSON.parse(text); }
      catch (error) { fail(`metadata is not valid JSON: ${error.message}`); }
      continue;
    }
    if (typeof value === 'string') {
      continue;
    }
    if (isMapPart(value.name || name, value.type || '')) {
      const bytes = Buffer.from(await value.arrayBuffer());
      parseSourceMap(bytes, `multipart part ${value.name || name}`);
      availableMaps.add(value.name || name);
    }
  }

  if (metadata !== null) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) fail('metadata must be a JSON object');
    validateMetadataModules(metadata, availableMaps);
  }

  const mapReferences = [];
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string' || !/\.(?:m?js|cjs)$/i.test(value.name || name)) continue;
    const source = await value.text();
    const matches = source.matchAll(/[#@]\s*sourceMappingURL\s*=\s*([^\s*]+)/g);
    for (const match of matches) {
      const reference = match[1];
      if (/^(?:data:|https?:)/i.test(reference)) continue;
      const resolved = new URL(reference, `https://upload.invalid/${value.name || name}`).pathname.slice(1);
      if (!availableMaps.has(resolved) && !availableMaps.has(reference)) {
        fail(`${value.name || name} references missing source map ${reference}`);
      }
      mapReferences.push({ script: value.name || name, map: reference });
    }
  }

  return { valid: true, sourceMaps: availableMaps.size, references: mapReferences.length };
}

async function main() {
  const [, , multipartFile, contentType] = process.argv;
  if (!multipartFile || !contentType) fail('usage: node scripts/validate-cloudflare-worker-multipart.mjs <multipart-body-file> <content-type-with-boundary>');
  const body = await readFile(multipartFile);
  const result = await validateCloudflareWorkerMultipart(body, contentType);
  console.log(`Cloudflare Worker multipart preflight: PASS (${result.sourceMaps} source map(s), ${result.references} script reference(s))`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch(error => {
    console.error(`Cloudflare Worker multipart preflight: FAIL: ${error.message}`);
    process.exitCode = 1;
  });
}
