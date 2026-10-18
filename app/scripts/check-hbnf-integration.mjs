import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const events = read('src/pages/EventsPage.tsx');
const shell = read('src/components/Shell.tsx');
const hbnf = read('src/pages/HbnfPage.tsx');
const routes = read('src/LegacyRoutes.tsx');
const styles = read('src/lr-hbnf-integration.css');

assert.match(routes, /if\(path==='\/'\)return <EventsPage landing\/>/);
assert.match(routes, /path==='\/hb-night-flyers'\|\|path==='\/hbnf'/);
assert.match(shell, /nav-events[^>]*href="\/events"/);
assert.match(shell, /nav-hbnf[^>]*href="\/hb-night-flyers"/);
assert.ok(shell.indexOf('className="nav-events"') < shell.indexOf('className="nav-hbnf"'));

for (const label of ['Upcoming', 'Results', 'Month', 'County', 'Sanction', 'Type', 'Clear filters']) {
  assert.ok(events.includes(label), 'missing existing filter control: ' + label);
}
assert.match(events, /lr_public_events/);
assert.match(events, /params\.set\('county',county\)/);
assert.match(events, /params\.set\('sanction',sanction\)/);
assert.match(events, /params\.set\('type',eventType\)/);
assert.match(events, /params\.set\('month',month\)/);
assert.match(events, /params\.set\('results',resultsFilter\)/);
assert.match(events, /<dialog[^>]+aria-labelledby="filters-title"/);
assert.match(events, /dialog\.showModal\(\)/);
assert.match(events, /dialog\.close\(\)/);
assert.match(events, /onCancel=\{\(\)=>setFiltersOpen\(false\)\}/);
assert.match(events, /data-filter-close/);
assert.match(styles, /max-height:min\(84dvh,720px\)/);
assert.match(styles, /overscroll-behavior:contain/);

assert.match(hbnf, /https:\/\/hbnightflyers\.com\/skins/);
assert.match(hbnf, /https:\/\/hbnightflyers\.com\/glow/);
assert.match(hbnf, /supabase!\.rpc\('lr_public_events'\)/);
assert.match(hbnf, /isHbnfEvent\(event\)/);
assert.match(hbnf, /eventDetailPath\(event\)/);
assert.match(hbnf, /sort\(\(a, b\) => a\.start_date\.localeCompare\(b\.start_date\)/);
assert.doesNotMatch(hbnf, /hbnightflyers\.com\/(scorecards|standings|tags)(?:\b|\/)/);
assert.doesNotMatch(hbnf, /const events\s*=\s*\[/);

assert.match(styles, /url\('\/fonts\/cabin-latin-400\.woff2'\)/);
assert.match(styles, /url\('\/fonts\/cabin-latin-700\.woff2'\)/);
assert.match(styles, /mask:url\('\/brand\/hbnf-mark-authentic\.png'\)/);
const png = readFileSync(path.join(root, 'public/brand/hbnf-mark-authentic.png'));
assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
assert.equal(png.readUInt32BE(16), 600);
assert.equal(png.readUInt32BE(20), 600);
assert.match(read('public/fonts/SOURCE.txt'), /SIL Open Font License 1\.1/);
assert.match(read('public/fonts/OFL.txt'), /SIL OPEN FONT LICENSE Version 1\.1/);


assert.doesNotMatch(events, /↗/);
assert.doesNotMatch(hbnf, /↗/);
assert.doesNotMatch(read('src/pages/EventDetailPage.tsx'), /↗/);
assert.doesNotMatch(read('src/lib/eventPresentation.ts'), /↗/);

assert.ok(styles.includes('event-actions{display:flex;flex-flow:row wrap;'));
assert.ok(!styles.includes('grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;justify-content:stretch'));
assert.ok(styles.includes('min-height:28px;padding:4px 7px'));
assert.ok(!styles.includes('.site-header nav a[aria-current=page]{text-decoration:underline'));
assert.ok(styles.includes('.public-brand-shell .events-page,\n.public-brand-shell .event-detail-page{font-family:var(--lr-public-font)}'));
console.log('LR × HBNF integration source checks passed.');
assert.ok(styles.includes('@media(max-width:400px)'));
assert.ok(styles.includes('.public-brand-shell .events-page :is(h1,h2,h3,.event-date-block strong,.event-card,.event-location'));