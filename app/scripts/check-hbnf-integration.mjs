import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const events = read('src/pages/EventsPage.tsx');
const shell = read('src/components/Shell.tsx');
const hbnf = read('src/pages/HbnfPage.tsx');
const app = read('src/App.tsx');
const styles = read('src/lr-hbnf-integration.css');

assert.match(app, /if\(path==='\/'\)return <EventsPage landing\/>/);
assert.match(app, /path==='\/hb-night-flyers'\|\|path==='\/hbnf'/);
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

console.log('LR × HBNF integration source checks passed.');
