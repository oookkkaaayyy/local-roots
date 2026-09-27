const fs=require('fs');
const path=require('path');
const js=fs.readFileSync(path.join(__dirname,'hbnf-cart-ipad.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'hbnf-cart-ipad.html'),'utf8');
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
  'hbnf-cart-control','expectedRevision','stale_revision','setInterval',
  '5000','192.168.8.30',"'apikey':SUPABASE_KEY"
]) if(!js.includes(need))throw new Error('missing contract: '+need);
for(const forbidden of [
  '192.168.8.20','192.168.8.21','/json/state','/json/info',
  '/auth/v1/otp','/auth/v1/token?grant_type=refresh_token',
  'sign_in_required','authEmail','sendMagicLink','ACCESS_KEY','REFRESH_KEY'
]) if(js.includes(forbidden)||html.includes(forbidden))throw new Error('forbidden legacy/direct-control contract: '+forbidden);
if(!html.includes('hbnf-cart-ipad-zero-pair-stable-v2'))throw new Error('missing build marker');
if(!html.includes('apple-mobile-web-app-capable'))throw new Error('missing iOS standalone marker');
new Function(js);
console.log('HBNF_IPAD_ZERO_PAIR_STABLE_TEST=PASS');
