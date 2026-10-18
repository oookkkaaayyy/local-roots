import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Weather route loads before Supabase-backed legacy routes', async () => {
  const app = await read('../src/App.tsx');
  const legacy = await read('../src/LegacyRoutes.tsx');
  assert.match(app, /const LegacyRoutes = lazy\(\(\) => import\('\.\/LegacyRoutes'\)\)/);
  assert.match(app, /if\(path==='\/weather'\)return <WeatherPage\/>/);
  assert.doesNotMatch(app, /from ['"].*supabase/);
  assert.match(legacy, /from '\.\/lib\/supabase'/);
});

test('Weather has a dedicated Safari and installable home-screen icon and scope', async () => {
  const app = await read('../src/App.tsx');
  const manifest = JSON.parse(await read('../public/weather/manifest.webmanifest'));
  assert.match(app, /apple-mobile-web-app-capable/);
  assert.equal(manifest.start_url, '/weather/');
  assert.equal(manifest.scope, '/weather/');
  assert.ok(manifest.icons.some((icon) => icon.src === '/weather/weather-icon.png' && icon.sizes === '180x180'));
});

test('Weather compact list and hourly detail have narrow-screen layout rules', async () => {
  const css = await read('../src/weather.css');
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /\.weather-course-toggle\{grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(css, /\.weather-hourly-scroll\{[^}]*overflow-x:auto/);
  assert.match(css, /\.weather-page\{[^}]*min-width:0/);
});

test('Weather frontend requests courses in bounded two-course batches',async()=>{
  const page=await read('../src/pages/WeatherPage.tsx');
  assert.match(page,/Math\.ceil\(nearby\.length\/2\)/);
  assert.match(page,/\.slice\(i\*2,i\*2\+2\)/);
  assert.match(page,/&ids=\$\{encodeURIComponent\(ids\)\}/);
});
