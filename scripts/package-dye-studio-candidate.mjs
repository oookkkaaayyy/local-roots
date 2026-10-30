#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY = 'oookkkaaayyy/local-roots';
const RELEASE_IDS = new Map([
  ['156', 'local-roots-dye-studio-pr-156-2026-10-30-r1'],
  ['159', 'local-roots-dye-photo-pr-159-2026-10-30-r1'],
]);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function listFiles(root, current = root) {
  const result = [];
  for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(current, entry.name);
    const info = await lstat(fullPath);
    if (info.isSymbolicLink()) throw new Error(`Build output must not contain symbolic links: ${fullPath}`);
    if (entry.isDirectory()) result.push(...await listFiles(root, fullPath));
    else if (entry.isFile()) {
      const bytes = await readFile(fullPath);
      result.push({ path: path.relative(root, fullPath).split(path.sep).join('/'), bytes: bytes.length, sha256: sha256(bytes) });
    } else throw new Error(`Unsupported build output entry: ${fullPath}`);
  }
  return result;
}

async function main() {
  const [distArg, outputArg, sourceCommit, pullRequest = '156'] = process.argv.slice(2);
  const releaseId = RELEASE_IDS.get(pullRequest);
  if (!distArg || !outputArg || !/^[a-f0-9]{40}$/i.test(sourceCommit ?? '') || !releaseId) {
    throw new Error('usage: package-dye-studio-candidate.mjs <dist-directory> <output-directory> <full-source-commit> [approved-pr: 156|159]');
  }
  const dist = path.resolve(distArg);
  const output = path.resolve(outputArg);
  if (output === dist || output.startsWith(`${dist}${path.sep}`) || dist.startsWith(`${output}${path.sep}`)) {
    throw new Error('Output directory must be separate from the build directory');
  }
  await mkdir(output, { recursive: false });
  const files = await listFiles(dist);
  if (files.length === 0) throw new Error('Build output is empty');
  const archivePath = path.join(output, 'candidate.zip');
  execFileSync('zip', ['-X', '-q', '-r', archivePath, '.'], { cwd: dist, stdio: 'inherit' });
  const archive = await readFile(archivePath);
  const lockfile = await readFile(path.resolve(dist, '../package-lock.json')).catch(async () =>
    readFile(path.resolve(dist, '../../app/package-lock.json')));
  const manifest = {
    releaseId,
    repository: REPOSITORY,
    sourceCommit: sourceCommit.toLowerCase(),
    command: 'npm run build (working-directory: app)',
    toolchain: `GitHub Actions ${os.platform()} ${os.release()}; Node ${process.version}; npm ${execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim()}`,
    lockfileSha256: sha256(lockfile),
    archiveSha256: sha256(archive),
    archiveBytes: archive.length,
    fileCount: files.length,
    files,
  };
  await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`Packaged ${files.length} build files; candidate.zip sha256=${manifest.archiveSha256} bytes=${manifest.archiveBytes}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
