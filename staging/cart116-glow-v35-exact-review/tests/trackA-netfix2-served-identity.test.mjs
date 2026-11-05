import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
const root=new URL("../",import.meta.url), read=p=>readFileSync(new URL(p,root));
const sha=x=>createHash("sha256").update(x).digest("hex");
const base="opal/owner-v1201-7target/owner-pwa/";
test("C8 eleven-target package remains frozen and is NOT eligible for C9 paired release",()=>{
 const rows=read("release/TARGETS.PENDING.tsv").toString().trim().split("\n").map(v=>v.split("\t"));
 assert.equal(rows.length,11);assert.equal(rows.filter(x=>x[0].startsWith("/www/")).length,7);
 const changed=new Set(["local-transport.js","hbnf-cart-local.js","hbnf-cart.js","hbnf-cart.html",".hbnf-payload.sha256",".hbnf-package-version"]);
 for(const [target,_,hash] of rows){if(!target.startsWith("/www/"))continue;
   const name=target.split("/").at(-1);
   const staged=target.includes("owner-pwa/")?read(base+name):read("opal/owner-v1201-7target/mission-control-local/local-transport.js");
   if(changed.has(name))assert.notEqual(hash,sha(staged));else assert.equal(hash,sha(staged));
 }
 assert.equal(sha(read("opal/owner-v1201-7target/mission-control-local/local-transport.js")),"928db9ce9514e7f2f6cf5093c756b3181f861569433bb0f367ddddfc89bd3387");
 assert.equal(read(base+".hbnf-package-version").toString(),"1.0.21-c9pair1\n");
});
test("C9 exact Owner 17-member checksums and cache chain; unchanged feature URL",()=>{
 const rows=read(base+".hbnf-payload.sha256").toString().trim().split("\n").map(s=>s.split("  "));
 assert.equal(rows.length,17);assert.equal(new Set(rows.map(x=>x[1])).size,17);
 for(const name of ["hbnf-cart-local.js","hbnf-cart.html","hbnf-cart.js","hbnf-cart-features.js"])assert.equal(rows.find(x=>x[1]===name)[0],sha(read(base+name)));
 const html=read(base+"hbnf-cart.html").toString(),main=read(base+"hbnf-cart.js").toString(),local=read(base+"hbnf-cart-local.js").toString();
 assert.match(html,/hbnf-cart\.js\?v=20261105-cart116-c9pair-1/);
 assert.match(html,/hbnf-cart-features\.js\?v=20261103-cart116-netfix-1/);
 assert.match(main,/hbnf-cart-local\.js\?v=20261105-cart116-c9pair-1/);
 assert.match(local,/local-transport\.js\?v=928db9ce9514e7f2/);
});
