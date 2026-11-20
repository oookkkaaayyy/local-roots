import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const events = read('src/pages/EventsPage.tsx');
const filterSheet = read('src/lib/useFilterSheet.ts');
const shell = read('src/components/Shell.tsx');
const hbnf = read('src/pages/HbnfPage.tsx');
const routes = read('src/LegacyRoutes.tsx');

assert.match(routes, /if\(path==='\/'\)return <EventsPage landing\/>/);
assert.match(routes, /path==='\/hb-night-flyers'\|\|path==='\/hbnf'/);
assert.match(shell, /nav\('nav-events','\/events'/);
const primaryStart=shell.lastIndexOf('<nav id="primary-navigation"');
const primaryEnd=shell.indexOf('</nav>',primaryStart);
assert.ok(primaryStart>0&&primaryEnd>primaryStart);
assert.match(shell.slice(primaryStart,primaryEnd),/nav\('nav-hbnf','\/hb-night-flyers'/);

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
assert.match(events, /useFilterSheet/);
assert.match(filterSheet, /dialog\.showModal\(\)/);
assert.match(filterSheet, /dialog\.close\(\)/);
assert.match(events, /onCancel=\{\(\)=>setFiltersOpen\(false\)\}/);
assert.match(events, /data-filter-close/);

assert.match(hbnf, /<iframe[^>]*src=\{HBNF_SITE\}/);
assert.match(hbnf, /HBNF_SITE = 'https:\/\/hbnightflyers\.com\/'/);

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

console.log('LR × HBNF integration source checks passed.');
