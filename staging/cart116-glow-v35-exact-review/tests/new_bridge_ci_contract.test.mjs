// Changed-only CI: NEW managed outbound service and transaction, no devices.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = p => readFileSync(path.join(base,p),'utf8');
const h = bytes => createHash('sha256').update(bytes).digest('hex');
function repoMember(member){
 if (member==='candidate/opal/usr/libexec/hbnf-cart-glow-bridge') return 'opal/new-service/usr/libexec/hbnf-cart-glow-bridge';
 if (member==='candidate/opal/usr/libexec/hbnf-cart-glow-provision') return 'opal/new-service/usr/libexec/hbnf-cart-glow-provision';
 if (member==='candidate/opal/etc/init.d/hbnf-cart-glow-bridge') return 'opal/new-service/etc/init.d/hbnf-cart-glow-bridge';
 if (member==='candidate/opal/usr/lib/hbnf-glow-overlay-v1.sh') return 'opal/hbnf-glow-overlay-v1.sh';
 const pre='candidate/opal/www/mission-control-local/';
 if (member.startsWith(pre+'owner-pwa/')) return 'opal/owner-v1201-7target/owner-pwa/'+member.slice((pre+'owner-pwa/').length);
 if (member.startsWith(pre)) return 'opal/owner-v1201-7target/mission-control-local/'+member.slice(pre.length);
 throw Error('unexpected member '+member);
}
const rows = src('release/TARGETS.PENDING.tsv').trimEnd().split('\n').map(line=>line.split('\t'));

test('all 11 new-service and old Owner/Networking candidates have exact GitHub bytes',()=>{
 assert.equal(rows.length,11);
 const names=rows.map(r=>r[0]);assert.equal(new Set(names).size,11);
 for (const [target,member,digest,preimage,mode] of rows){
  assert.equal(target,'/'+member.replace('candidate/opal/',''));
  assert.match(digest,/^[0-9a-f]{64}$/);
  assert.equal(h(readFileSync(path.join(base,repoMember(member)))),digest);
  assert.match(preimage,/^(UNKNOWN|ABSENT|[0-9a-f]{64})$/);
  assert.match(mode,/^(600|644|700|755)$/);
 }
 assert.equal(rows.filter(r=>r[0].startsWith('/www/')).length,7);
 assert.equal(rows.filter(r=>r[3]==='UNKNOWN').length,3);
});
test('single outbound process is fail-closed and cannot invoke legacy full-state projection',()=>{
 const s=src('opal/new-service/usr/libexec/hbnf-cart-glow-bridge');
 assert.match(s,/HBNF_CART_GLOW_SOURCE_ADMITTED=false/);
 assert.match(s,/mkdir "\$RUN\/one-process"/);
 assert.match(s,/sleep 15/);
 assert.match(s,/ps w/);
 assert.doesNotMatch(s,/^[^#\n]*(?:op=next|op=check|aux_apply|restore_aux|wledPayload)/m);
 assert.doesNotMatch(s,/\bnc -l\b|\bhttpd\b|\bmosquitto_pub\b|\buci set\b/);
});
test('procd is a new service, never hijacks Owner WS or original relay',()=>{
 const s=src('opal/new-service/etc/init.d/hbnf-cart-glow-bridge');
 assert.match(s,/START=96/);
 assert.match(s,/procd_set_param command "\$BIN"/);
 assert.match(s,/HBNF_CART_GLOW_SOURCE_ADMITTED=true/);
 assert.match(s,/HBNF_OVERLAY_V1_SOURCE_ADMITTED=true/);
 assert.doesNotMatch(s,/\/etc\/init\.d\/hbnf-owner|service restart.*hbnf-matrix-relay/);
 assert.match(src('opal/owner-v1201-7target/mission-control-local/local-transport.js'),/ws:\/\/\$\{MATRIX_IP\}\/ws/);
});
test('native overlay helper has persistent reboot cursor, no independent AUX write',()=>{
 const s=src('opal/hbnf-glow-overlay-v1.sh');
 assert.match(s,/HBNF_OVERLAY_V1_SOURCE_ADMITTED=false/);
 assert.match(s,/CONF=\/etc\/hbnf-cart-glow-bridge.conf/);
 assert.match(s,/PENDING=\/etc\/hbnf-glow-overlay-v1.pending/);
 assert.match(s,/json\/si/);
 assert.match(s,/owner_overlay_id=/);
 assert.match(s,/snapshot \|\| exit 1/);
 assert.match(s,/GPIO25\/26/);
 assert.match(s,/\-1\) # Current physical profile/);
 assert.ok(s.includes('{"HBNF":{"overlay":%s}}')); 
 assert.doesNotMatch(s,/^[^#\n]*(?:aux_apply|A\/json\/state|AUX\/json\/state)/m);
});
test('transaction uses exact one-use approval, independent backup hash and only whitelisted targets',()=>{
 const s=src('release/cart116-opal-transaction.sh');
 for(const token of ['APPROVED_FOR_THIS_EXACT_MANIFEST','BACKUP_DOWNLOAD_BACK_VERIFIED','CAPSULE_SHA256','REGISTRY','check_targets','rollback_files','PHYSICAL_ACCEPTANCE_RECEIPT_SHA256'])assert.ok(s.includes(token),token);
 assert.match(s,/\[ "\$count" -eq 11 \]/);
 assert.match(s,/\[ "\$actual_paths" = "\$expected_paths" \]/);
 assert.match(s,/\[ "\$old_sha" = ABSENT \]/);
 assert.match(s,/OWNER_SERVICE="\$ROOT\/etc\/init\.d\/hbnf-cart-glow-bridge"/);
 assert.doesNotMatch(s,/^[^#\n]*(?:uci set|reboot|sysupgrade|\/etc\/init\.d\/hbnf-owner-local-control)/m);
});
test('root-only provisioner has no credential constants, args or log output',()=>{
 const s=src('opal/new-service/usr/libexec/hbnf-cart-glow-provision');
 assert.match(s,/umask 077/);
 assert.match(s,/IFS= read -r token/);
 assert.match(s,/IFS= read -r api_key/);
 assert.match(s,/chmod 600/);
 assert.match(s,/chown 0:0/);
 assert.doesNotMatch(s,/\b(?:echo|logger|set -x)\b.*(?:\$token|\$api_key)/);
 assert.doesNotMatch(s,/RELAY_TOKEN='[A-Za-z0-9_-]{43}/);
});
