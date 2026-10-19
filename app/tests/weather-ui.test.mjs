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

test('Weather keeps its Safari and installable scope with the approved Local Roots identity', async () => {
  const app = await read('../src/App.tsx');
  const manifest = JSON.parse(await read('../public/weather/manifest.webmanifest'));
  assert.match(app, /apple-mobile-web-app-capable/);
  assert.equal(manifest.start_url, '/weather/');
  assert.equal(manifest.scope, '/weather/');
  assert.ok(manifest.icons.some((icon) => icon.src === '/brand/local-roots-icon-192.png' && icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.src === '/brand/local-roots-icon-512.png' && icon.sizes === '512x512'));
  assert.match(app, /touchIcon\.href='\/apple-touch-icon\.png\?v=af4a80127dd7f9cf'/);
});

test('Weather mobile course rows stay compact and hourly details remain scrollable', async () => {
  const css = await read('../src/weather.css');
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /\.weather-course-list\{display:block/);
  assert.match(css, /\.weather-course\{overflow:visible;border:0;border-bottom:1px solid[^}]*box-shadow:none/);
  assert.ok(css.includes('.weather-course-toggle{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:auto auto auto;gap:8px 12px;padding:14px 38px 14px 2px;min-height:100px'));
  assert.match(css, /\.weather-hourly-scroll\{[^}]*overflow-x:auto/);
  assert.match(css, /\.weather-page\{[^}]*min-width:0/);
});

test('Fresh Weather searches retain 8 AM–4 PM unless URL hours are supplied', async () => {
  const page = await read('../src/pages/WeatherPage.tsx');
  assert.match(page, /start:8,end:16/);
  assert.match(page, /startParam=query\.get\('start'\); if\(startParam!==null\)/);
  assert.match(page, /endParam=query\.get\('end'\); if\(endParam!==null\)/);
});

test('Weather filter disclosure is closed initially and does not refetch on toggle', async () => {
  const page = await read('../src/pages/WeatherPage.tsx');
  const css = await read('../src/weather.css');
  assert.match(page, /\[filtersOpen,setFiltersOpen\]=useState\(false\)/);
  assert.match(page, /aria-expanded=\{filtersOpen\} aria-controls="weather-filters-panel"/);
  assert.match(page, /hidden=\{!filtersOpen\}/);
  assert.match(page, /setPreferences\(\{\.\.\.draft,location:draft\.location\.trim\(\)\}\);setExpanded\(null\);setFiltersOpen\(false\)/);
  assert.match(page, /\},\[preferences\.location,preferences\.radius,refreshKey\]\)/);
  assert.match(css, /\.weather-filter-toggle\{[^}]*min-height:48px/);
});

test('Weather frontend requests courses in bounded two-course batches',async()=>{
  const page=await read('../src/pages/WeatherPage.tsx');
  assert.match(page,/Math\.ceil\(nearby\.length\/2\)/);
  assert.match(page,/\.slice\(i\*2,i\*2\+2\)/);
  assert.match(page,/&ids=\$\{encodeURIComponent\(ids\)\}/);
});

test('Weather interface keeps player controls and removes internal explanations',async()=>{
  const page=await read('../src/pages/WeatherPage.tsx');
  assert.match(page,/>ZIP</);
  assert.match(page,/>Miles</);
  assert.match(page,/>Search</);
  assert.match(page,/> All Day</);
  assert.match(page,/<th>Rain<\/th>/);
  assert.match(page,/'NWS alert'/);
  assert.match(page,/view\.flags\.filter\(flag=>flag\.kind!=='alerts-unavailable'\)/);
  assert.doesNotMatch(page,/Course verification and sources|verified public courses|Course point is approximate|grid|App forecast flags:|Forecast ranges include|Forecast data: National Weather Service|ZIP lookup:/i);
  assert.doesNotMatch(page,/weather-sources|weather-coverage-note|weather-threshold-note/);
});


test('Primary navigation keeps the active links and exposes an accessible mobile disclosure', async () => {
  const shell = await read('../src/components/Shell.tsx');
  const styles = await read('../src/styles.css');
  const integration = await read('../src/lr-hbnf-integration.css');
  assert.ok(shell.includes(`className="nav-weather" href="/weather" aria-current={current('/weather')}>Weather</a>`));
  assert.ok(shell.includes(`href="/" aria-label="Local Roots home"`));
  assert.match(shell, /aria-expanded=\{menuOpen\} aria-controls="primary-navigation"/);
  assert.match(shell, /event\.key===\"Escape\"/);
  assert.match(integration, /\.mobile-menu-toggle\{display:inline-flex;[^}]*min-height:44px/);
  assert.match(integration, /\.site-header nav\.primary-nav a\{display:block!important;min-height:44px/);
  assert.doesNotMatch(styles, /@media\(max-width:720px\)\{\.site-header \.nav-home/);
  assert.doesNotMatch(integration, /\.site-header \.nav-hbnf\{display:block\}/);
});


test('Weather rolls only fresh defaults forward after 4 PM and preserves explicit past selections', async()=>{
  const page=await read('../src/pages/WeatherPage.tsx');
  const core=await read('../src/lib/weatherCore.js');
  assert.match(core,/export function forecastWindowHasPassed/);
  assert.match(page,/forecastWindowHasPassed\(today,8,16,TIME_ZONE\)\?plusDays\(today,1\):today/);
  assert.match(page,/date:isCalendarDate\(saved\.date\)\?saved\.date:initial\.date/);
  assert.match(page,/sharedDate=query\.get\('date'\); if\(isCalendarDate\(sharedDate\)\) initial\.date=sharedDate/);
  assert.match(page,/if\(allDayParam==='1'\)initial\.allDay=true;else if\(allDayParam==='0'\)initial\.allDay=false/);
  assert.match(page,/This time window has passed\./);
  assert.match(page,/Tomorrow · 8 AM–4 PM/);
  assert.match(page,/syncWeatherUrl\(next\)/);
  assert.match(page,/\},\[preferences\.location,preferences\.radius,refreshKey\]\)/);
});

test('Weather distinguishes a successful retrieval from NWS forecast publication and explains empty forecasts', async()=>{
  const page=await read('../src/pages/WeatherPage.tsx');
  assert.match(page,/retrievedAt:new Date\(\)\.toISOString\(\)/);
  assert.match(page,/aria-label="Forecast checked">Checked \{formatUpdated\(result\.retrievedAt\)\}/);
  assert.match(page,/Forecast issued \{formatForecastIssued\(view\.lastUpdatedAt\)\}/);
  assert.match(page,/No forecast for these hours/);
  assert.match(page,/Forecast unavailable/);
  assert.doesNotMatch(page,/aria-label="Forecast updated">Updated \{formatUpdated\(result\.lastSuccessfulUpdate\)\}/);
});
