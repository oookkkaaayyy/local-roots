import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(project, '../..');
const cli = path.join(project, 'node_modules/.bin/supabase');
const env = {
  ...process.env,
  SUPABASE_EXPERIMENTAL_STACK: '1',
  PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || '/private/tmp/hbnf-playwright-browsers',
};
if (!env.HBNF_QA_CHROMIUM_EXECUTABLE) {
  const systemChromium = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (existsSync(systemChromium)) env.HBNF_QA_CHROMIUM_EXECUTABLE = systemChromium;
}
const reportDir = path.join(project, 'reports');
const candidateDirectory = path.resolve(env.HBNF_QA_CANDIDATE_DIR || path.join(workspace, 'qa-artifacts/hbnf-scoring-candidate'));
const startedAt = new Date();
const report = {
  schemaVersion: 1,
  runId: `hbnf-local-${startedAt.toISOString().replaceAll(':', '').replaceAll('.', '-')}`,
  startedAt: startedAt.toISOString(),
  target: 'HBNF scoring candidate / isolated local Supabase only',
  productionRequests: 0,
  credentialsStored: false,
  steps: [],
};
let startedHere = false;

function safeError(text) {
  return String(text || '')
    .replace(/eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g, '[REDACTED TOKEN]')
    .replace(/(ANON_KEY|SERVICE_ROLE_KEY|JWT_SECRET)\s*[:=]\s*[^\s,]+/gi, '$1=[REDACTED]')
    .slice(-2000);
}

function run(command, args, cwd, step) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const details = safeError(result.stderr || result.error?.message || `command exited ${result.status}`);
    report.steps.push({ step, status: 'FAIL', details });
    throw new Error(`${step} failed (exit ${result.status ?? 'unavailable'}).`);
  }
  return result.stdout;
}

function localStatus() {
  const result = spawnSync(cli, ['status', '--output-format', 'json', '--workdir', project], {
    cwd: project, env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw new Error(`Could not read local stack status: ${safeError(result.error.message)}`);
  if (result.status !== 0) {
    const output = `${result.stderr || ''}\n${result.stdout || ''}`;
    if (output.includes('No managed stack exists for the selected project')) return null;
    if (output.includes('could not be read: Unable to decode state') && output.includes('Missing key')) {
      return { readiness: 'unavailable', runtime: 'native', projectRoot: project, apiUrl: null };
    }
    throw new Error(`Local stack status failed: ${safeError(output)}`);
  }
  const raw = result.stdout;
  const value = JSON.parse(raw);
  return {
    readiness: value.readiness,
    runtime: value.runtime || null,
    projectRoot: path.resolve(value.identity?.project_root || ''),
    apiUrl: value.env?.API_URL || null,
  };
}

function pause(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitForReady(state, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (state.readiness === 'starting' && Date.now() < deadline) {
    await pause(2000);
    state = localStatus();
  }
  return state;
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function persistReport() {
  report.finishedAt = new Date().toISOString();
  report.status = report.steps.some(s => s.status === 'FAIL') || report.error ? 'FAIL' : 'PASS';
  report.candidate = {
    directory: candidateDirectory,
    skinsHtmlSha256: await sha256(path.join(candidateDirectory, 'public/skins.html')),
    migrationSha256: await sha256(path.join(project, 'supabase/migrations/20261028203901_hbnf_scoring_qa_state.sql')),
    runnerSha256: await sha256(fileURLToPath(import.meta.url)),
  };
  await mkdir(reportDir, { recursive: true });
  const target = path.join(reportDir, `${report.runId}.json`);
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  report.reportPath = target;
  process.stdout.write(`${JSON.stringify({ ...report, reportPath: target }, null, 2)}\n`);
}

try {
  let state = localStatus();
  const stackExists = !!state;
  if (!state) state = { readiness: 'stopped', projectRoot: project, apiUrl: null };
  if (state.readiness === 'starting') state = await waitForReady(state);
  if (['stopped', 'unavailable'].includes(state.readiness)) {
    const startArgs = ['start', '--runtime', 'native', '--eager', '--workdir', project];
    run(cli, startArgs, project, 'start isolated native Supabase');
    startedHere = true;
    report.steps.push({ step: 'start isolated native Supabase', status: 'PASS' });
    state = await waitForReady(localStatus());
  }
  if (state.readiness === 'partial') {
    run(cli, ['stack', 'stop', '--workdir', project], project, 'recover partial local stack lifecycle');
    run(cli, ['stack', 'start', '--eager', '--workdir', project], project, 'restart isolated local Supabase');
    startedHere = true;
    state = await waitForReady(localStatus());
  }
  if (!['ready', 'sleeping'].includes(state.readiness) || state.projectRoot !== project ||
      !state.apiUrl || new URL(state.apiUrl).hostname !== '127.0.0.1') {
    throw new Error('Refusing to continue: isolated local Supabase identity/readiness check failed.');
  }
  report.environment = { readiness: state.readiness, runtime: state.runtime, endpointHost: '127.0.0.1' };
  report.steps.push({ step: 'isolated stack identity and readiness', status: 'PASS' });

  run(cli, ['db', 'reset', '--local', '--workdir', project], project, 'reset isolated local fixture database');
  report.steps.push({ step: 'reset isolated local fixture database', status: 'PASS' });

  run('npm', ['run', 'hbnf:score:test'], workspace, 'source regression harness');
  report.steps.push({ step: 'source regression harness', status: 'PASS' });

  const packageCheck = run('npm', ['run', 'hbnf:score:package'], workspace, 'deterministic 44-asset package check');
  if (!packageCheck.includes('"status": "PASS"') || !packageCheck.includes('"assetCount": 44')) {
    throw new Error('Package validation did not confirm the expected 44 assets.');
  }
  report.steps.push({ step: 'deterministic 44-asset package check', status: 'PASS' });

  const persistence = JSON.parse(run(process.execPath, [path.join(project, 'persistence-smoke.mjs')], project, 'local PostgREST persistence and CAS smoke'));
  if (persistence.status !== 'PASS' || persistence.fixtureRestored !== 'PASS') throw new Error('Local persistence smoke did not pass cleanly.');
  report.persistence = persistence;
  report.steps.push({ step: 'local PostgREST persistence and CAS smoke', status: 'PASS' });

  const browser = JSON.parse(run(process.execPath, [path.join(project, 'browser-scoring-smoke.mjs')], project, 'Chromium scoring integration'));
  if (browser.status !== 'PASS' || browser.productionRequests !== 0 || browser.fixtureRestored !== true) {
    throw new Error('Chromium scoring integration did not pass cleanly or local fixture was not restored.');
  }
  report.browser = browser;
  if (browser.scenarios?.crossProfileRealtimeSync !== 'PASS') {
    throw new Error('Chromium did not verify cross-profile Realtime synchronization.');
  }
  report.steps.push({ step: 'Chromium cross-profile Realtime synchronization', status: 'PASS' });
  report.steps.push({ step: 'Chromium scoring integration', status: 'PASS' });
  if (browser.overallScoringSafety?.startsWith('FAIL:')) {
    report.steps.push({ step: 'cross-writer Skins integrity / Glow issue #147', status: 'FAIL', details: browser.overallScoringSafety });
    throw new Error('Cross-writer scoring safety failed; preserve the evidence and do not admit a release.');
  }
} catch (error) {
  report.error = safeError(error.message);
  if (!report.steps.some(step => step.status === 'FAIL')) report.steps.push({ step: 'run', status: 'FAIL', details: report.error });
} finally {
  if (startedHere && process.env.HBNF_QA_KEEP_STACK !== '1') {
    try {
      run(cli, ['stack', 'stop', '--workdir', project], project, 'stop local Supabase started by runner');
      report.steps.push({ step: 'stop local Supabase started by runner', status: 'PASS' });
    } catch (error) {
      report.steps.push({ step: 'stop local Supabase started by runner', status: 'FAIL', details: safeError(error.message) });
      report.error ||= 'Could not stop the isolated local stack started by this runner.';
    }
  }
  await persistReport();
}

if (report.status !== 'PASS') process.exitCode = 1;
