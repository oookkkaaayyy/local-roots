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
  const index = await read('../index.html');
  assert.match(index, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(app, /const WEATHER_MANIFEST = '\/weather\/manifest\.webmanifest'/);
  assert.match(app, /isWeather\?WEATHER_MANIFEST/);
  assert.equal(manifest.start_url, '/weather/');
  assert.equal(manifest.scope, '/weather/');
  assert.ok(manifest.icons.some((icon) => icon.src === '/brand/local-roots-icon-192.png' && icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.src === '/brand/local-roots-icon-512.png' && icon.sizes === '512x512'));
  assert.match(app, /if\(touchIcon\)touchIcon\.href=isDuAdmin\|\|isDyeStudio\|\|isDuPublic\?DU_TOUCH_ICON:LR_TOUCH_ICON/);
});

test('Weather mobile course rows stay compact and hourly details remain accessible', async () => {
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


test('Weather first visits default to today all-day without a passed-window notice; explicit shared filters still work', async()=>{
  const page=await read('../src/pages/WeatherPage.tsx');
  assert.match(page,/const initial:Preferences=\{location:'92648',radius:80,date:today,start:8,end:16,allDay:true,sort:'distance'\}/);
  assert.doesNotMatch(page,/This time window has passed|Tomorrow · 8 AM–4 PM|chooseNextAvailableWindow|forecastWindowHasPassed/);
  assert.doesNotMatch(page,/date:isCalendarDate\(saved\.date\)|allDay:Boolean\(saved\.allDay\)/);
  assert.match(page,/sharedDate=query\.get\('date'\); if\(isCalendarDate\(sharedDate\)\) initial\.date=sharedDate/);
  assert.match(page,/if\(allDayParam==='1'\)initial\.allDay=true;else if\(allDayParam==='0'\)initial\.allDay=false/);
  assert.match(page,/\{preferences\.allDay\?'All day':/);
  assert.match(page,/aria-expanded=\{open\}/);
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


test('Weather heading keeps Events typography and rolling detail does not alter summary requests',async()=>{
  const page=await read('../src/pages/WeatherPage.tsx');const weather=await read('../src/weather.css');const events=await read('../src/events-enhancements.css');const integration=await read('../src/lr-hbnf-integration.css');const polish=await read('../src/share-ready-polish.css');
  assert.match(page,/<h1>Forecast<\/h1>/);assert.doesNotMatch(page,/<h1>Disc Golf Weather<\/h1>/);
  const weatherRule=weather.match(/\.weather-heading h1\{([^}]*)\}/)?.[1];
  assert.ok(weatherRule);
  assert.match(weatherRule,/color:var\(--root\)/);
  assert.match(weatherRule,/font-family:var\(--lr-public-font,Arial,sans-serif\)/);
  assert.match(weatherRule,/font-size:1\.2rem;font-weight:700;letter-spacing:-\.012em/);
  assert.match(events,/\.events-page \.list-header h2\{font-size:1\.28rem;font-weight:700;letter-spacing:-\.012em\}/);
  assert.match(polish,/\.public-brand-shell \.events-page \.list-header h2\{\s*font-size:1\.2rem;\s*\}/);
  assert.match(integration,/\.public-brand-shell \.events-page \.list-header h2\{font-size:1\.08rem\}/);
  assert.match(weather,/@media\(max-width:720px\)\{\.weather-heading h1\{font-size:1\.08rem\}\}/);
  assert.doesNotMatch(weather,/@media\(max-width:700px\)\{\.weather-heading h1\{/);
  assert.match(page,/buildRolling24HourRows/);assert.match(page,/No forecast for these hours/);assert.match(page,/Forecast covers \{Math\.round\(hourly\.coverage\*100\)\}% of these hours/);assert.match(page,/formatHourlyTimeLabel/);assert.match(page,/summarizeHourly\(extracted\.rows\)/);assert.match(page,/forecastFlags\(extracted\.rows,alerts,alertsAvailable\)/);assert.equal((page.match(/\bfetch\(/g)||[]).length,2);
  assert.match(page,/view\.error\?\<p className="weather-error">Forecast unavailable\.<\/p>/);assert.match(page,/view\.flags\.length\?<div className="weather-flag-list"/);
});

test('mobile hourly detail keeps time, rain, and conditions together without sideways scrolling',async()=>{
  const css=await read('../src/weather.css');
  const page=await read('../src/pages/WeatherPage.tsx');
  assert.match(css,/\.weather-hourly-scroll\{overflow-x:hidden/);
  assert.match(css,/\.weather-hourly\{display:block;width:100%;min-width:0/);
  assert.match(css,/\.weather-hourly tbody tr\{display:grid/);
  assert.match(css,/\.weather-hourly tbody td:nth-child\(5\)\{grid-column:3;grid-row:1(?:;|\})/);
  assert.match(css,/\.weather-hourly tbody th\{grid-column:1;grid-row:1\/4;/);
  assert.match(css,/\.weather-hourly tbody td:nth-child\(6\)\{grid-column:2\/4;grid-row:3\}/);
  assert.match(css,/\.weather-hourly-clock\{display:block;color:var\(--root\);font-size:1\.03rem;font-weight:850/);
  assert.match(page,/function hourlyTimeParts\(/);
  assert.match(page,/className="weather-hourly-clock"/);
  assert.match(page,/className="weather-hourly-day"/);
  assert.ok(page.includes("time:label.replace(/:00 (?=AM|PM)/,' ')"));
  for(const label of ['Temp','Wind','Gust','Rain','Conditions'])assert.ok(page.includes('data-label="'+label+'"'));
  assert.match(page,/role="table"/);
});

test('expanded detail respects selected date or time, otherwise retains rolling today',async()=>{
  const page=await read('../src/pages/WeatherPage.tsx');
  assert.match(page,/const rolling=preferences\.date===dateInPacific\(new Date\(referenceTime\)\)&&preferences\.allDay/);
  assert.match(page,/rolling\?extractRollingHourRows\(view\.raw,view\.course,referenceTime\):extractHourRows\(view\.raw,view\.course,preferences\)/);
  assert.match(page,/periodLabel=rolling\?'Next 24 hours'/);
  assert.match(page,/summarizeHourly\(extracted\.rows\)/);
  assert.match(page,/forecastFlags\(extracted\.rows,alerts,alertsAvailable\)/);
  assert.equal((page.match(/\bfetch\(/g)||[]).length,2);
});

test('course locations expose source-verified ZIPs and coordinate-based NWS links',async()=>{
  const page=await read('../src/pages/WeatherPage.tsx');
  const courses=JSON.parse(await read('../src/data/weather-courses.json'));
  const postals=courses.filter(course=>course.postalCode);
  assert.equal(courses.length,35);
  assert.equal(postals.length,12);
  for(const course of postals){
    assert.match(course.postalCode,/^\d{5}$/);
    assert.match(course.postalCodeSource,/^https:\/\//);
  }
  assert.equal(courses.find(course=>course.id==='oak-grove').postalCode,'91103');
  assert.equal(courses.find(course=>course.id==='huntington-central').postalCode,'92647');
  assert.doesNotMatch(page,/Copy location/);
  assert.doesNotMatch(page,/NWS forecast/);
  assert.match(page,/google\.com\/maps\/dir\/\?api=1&destination=/);
});

test('mobile filter grid gives native iPhone date control its own full-width row',async()=>{
  const css=await read('../src/weather.css');
  const page=await read('../src/pages/WeatherPage.tsx');
  assert.match(css,/grid-template-areas:"zip radius" "date date" "start end" "allDay search"/);
  assert.match(css,/\.weather-controls \.weather-field-date\{grid-area:date\}/);
  assert.match(css,/\.weather-controls input\[type="date"\]\{[^}]*width:calc\(100% - 16px\);min-width:0;max-width:calc\(100% - 16px\);box-sizing:border-box/);
  for(const field of ['zip','radius','date','start','end'])assert.match(page,new RegExp('className="weather-field-'+field+'"'));
  assert.match(page,/type="date" min=\{selectDateMin\} max=\{selectDateMax\}/);
});
