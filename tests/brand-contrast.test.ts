import test from 'node:test';
import assert from 'node:assert/strict';
const lum=(h:string)=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4));return 0.2126*(c[0]??0)+0.7152*(c[1]??0)+0.0722*(c[2]??0);};
const ratio=(a:string,b:string)=>{const hi=Math.max(lum(a),lum(b)),lo=Math.min(lum(a),lum(b));return (hi+0.05)/(lo+0.05);};
const pairs:[string,string,string,number][]=[
 ['ink on paper','#3a2618','#f4ecdf',4.5],['ink on surface','#3a2618','#fbf5ea',4.5],
 ['muted on paper','#6e5a4a','#f4ecdf',4.5],['muted on surface','#6e5a4a','#fbf5ea',4.5],
 ['clay-dk on paper','#86401f','#f4ecdf',4.5],['clay-dk on surface','#86401f','#fbf5ea',4.5]];
for(const [n,f,b,min] of pairs) test(`contrast ${n}`,()=>assert.ok(ratio(f,b)>=min,`${n} ${ratio(f,b).toFixed(2)}`));
