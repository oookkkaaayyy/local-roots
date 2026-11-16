import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../app/src/styles.css',import.meta.url),'utf8');
const shell=css.slice(css.indexOf('.public-brand-shell{'));
const expected={
 '--ui-canvas':'--lr-canvas',
 '--ui-surface':'--lr-paper',
 '--ui-surface-raised':'--lr-paper-deep',
 '--ui-text':'--lr-earth',
 '--ui-text-muted':'--muted',
 '--ui-accent':'--lr-sage',
 '--ui-selected-bg':'--lr-paper-deep',
 '--ui-selected-text':'--lr-earth',
 '--ui-disabled-bg':'--lr-paper-deep',
 '--ui-disabled-text':'--muted',
 '--ui-font-body':'--lr-ui',
 '--ui-font-heading':'--lr-ui',
};
test('Local Roots implements all twelve HBNF semantic names without duplicating values',()=>{
 for(const [semantic,source] of Object.entries(expected)){
  const rule=`${semantic}:var(${source})`;
  assert.ok(shell.includes(rule),rule);
  assert.equal(css.split(rule).length-1,1,rule);
 }
});
test('existing Local Roots brand tokens and light palette stay in place',()=>{
 for(const rule of ['--lr-canvas:#f4ecdf;','--lr-paper:#fbf5ea;','--lr-earth:#3a2618;','--lr-sage:#7f8962;']){
  assert.ok(shell.includes(rule),rule);
 }
 assert.ok(shell.indexOf('--lr-stone:#b79a79;')<shell.indexOf('--ui-canvas:var(--lr-canvas)'));
});
test('mapping is scoped to public brand shell, not admin or D&U UI',()=>{
 const before=css.slice(0,css.indexOf('.public-brand-shell{'));
 assert.doesNotMatch(before,/--ui-canvas:var\(--lr-canvas\)/);
 assert.match(shell,/\.public-brand-shell\{/);
});
