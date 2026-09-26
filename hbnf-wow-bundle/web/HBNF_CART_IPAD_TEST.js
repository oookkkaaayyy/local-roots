const fs=require('fs');
const js=fs.readFileSync('hbnf-wow-bundle/web/hbnf-cart-ipad.js','utf8');
const html=fs.readFileSync('hbnf-wow-bundle/web/hbnf-cart-ipad.html','utf8');
const bad=[
  ['arrow function',/=>/],
  ['async function',/\basync\b/],
  ['await',/\bawait\b/],
  ['optional chaining',/\?\./],
  ['nullish coalescing',/\?\?/],
  ['ES module import',/\bimport\s/],
  ['crypto.randomUUID',/randomUUID/]
];
for(const [name,re] of bad){if(re.test(js))throw new Error('legacy compatibility violation: '+name)}
for(const need of [
  'hbnf-cart-control','expectedRevision','stale_revision','/auth/v1/otp',
  '/auth/v1/token?grant_type=refresh_token','setInterval','192.168.8.30'
]) if(!js.includes(need))throw new Error('missing contract: '+need);
for(const forbidden of ['192.168.8.20','192.168.8.21','/json/state','/json/info'])
  if(js.includes(forbidden))throw new Error('direct device control forbidden: '+forbidden);
if(!html.includes('hbnf-cart-ipad-legacy-v1'))throw new Error('missing build marker');
if(!html.includes('apple-mobile-web-app-capable'))throw new Error('missing iOS standalone marker');
new Function(js);
console.log('HBNF_IPAD_LEGACY_CONTROLLER_TEST=PASS');
