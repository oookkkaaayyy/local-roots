import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const output = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' });
const read = (name) => {
  const match = output.match(new RegExp('^' + name + '="([^"\\n]+)"$', 'm'));
  assert.ok(match, 'Supabase status did not report ' + name);
  return match[1];
};
const values = {
  SUPABASE_URL: read('API_URL'),
  SUPABASE_ANON_KEY: read('ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: read('SERVICE_ROLE_KEY'),
};
writeFileSync(process.env.GITHUB_ENV, Object.entries(values).map(([key, value]) => key + '=' + value).join('\n') + '\n');
writeFileSync(process.env.RUNNER_TEMP + '/du-generation-e2e.env', [
  // Edge Runtime runs in a container on the Supabase network; 127.0.0.1 is the runner, not Kong.
  'SUPABASE_URL=http://kong:8000',
  'SUPABASE_SERVICE_ROLE_KEY=' + values.SUPABASE_SERVICE_ROLE_KEY,
].join('\n') + '\n', { mode: 0o600 });
