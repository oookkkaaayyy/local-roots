import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root));
const sha=x=>createHash('sha256').update(x).digest('hex');
const base='opal/owner-v1201-7target/owner-pwa/';
test('exact seven Owner transport postimages and 11-target revised manifest',()=>{
const rows=read('release/TARGETS.PENDING.tsv').toString().trim().split('\n').map(x=>x.split('\t'));
assert.equal(rows.length,11);
assert.equal(rows.filter(x=>x[0].startsWith('/www/')).length,7);
for(const [target,member,hash] of rows){
if(target==='/www/mission-control-local/local-transport.js')assert.equal(hash,sha(read('opal/owner-v1201-7target/mission-control-local/local-transport.js')));
if(target.startsWith('/www/mission-control-local/owner-pwa/'))assert.equal(hash,sha(read(base+target.split('/').at(-1))));
}
assert.equal(sha(read('opal/owner-v1201-7target/mission-control-local/local-transport.js')),'b48f5d7a4b3ea850307b13596857d753d2ff2ee4b9991b859e66b41d0338b37a');
assert.equal(read(base+'.hbnf-package-version').toString(),'1.0.20-netfix2\n');
});
test('all 17 hashes include exact changed modules and unchanged features',()=>{
const list=read(base+'.hbnf-payload.sha256').toString().trim().split('\n').map(s=>s.split('  '));
assert.equal(list.length,17);assert.equal(new Set(list.map(x=>x[1])).size,17);
for(const name of ['hbnf-cart-local.js','hbnf-cart.html','hbnf-cart.js','hbnf-cart-features.js'])assert.ok(list.some(([hash,n])=>n===name&&hash===sha(read(base+name))));
const html=read(base+'hbnf-cart.html').toString(),main=read(base+'hbnf-cart.js').toString(),local=read(base+'hbnf-cart-local.js').toString();
assert.match(html,/hbnf-cart\.js\?v=20261103-cart116-netfix-2/);
assert.match(html,/hbnf-cart-features\.js\?v=20261103-cart116-netfix-1/);
assert.match(main,/hbnf-cart-local\.js\?v=20261103-cart116-netfix-2/);
assert.match(local,/local-transport\.js\?v=b48f5d7a4b3ea850/);
});
