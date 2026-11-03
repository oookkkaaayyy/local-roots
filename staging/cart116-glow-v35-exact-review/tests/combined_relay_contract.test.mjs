import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');
const candidate=read('../opal/hbnf-matrix-relay');
const helper=read('../opal/hbnf-glow-overlay-v1.sh');
const oldBlob='76247371aa2c0c1b70703b4a0f18b88b25218a15';
const newBlob='8a929fbb792824dd0fca06d41caf2e1d5a35591f';
const gitBlob=s=>crypto.createHash('sha1').update(`blob ${Buffer.byteLength(s)}\0`).update(s).digest('hex');
const before='while :; do\n if ! snapshot; then sleep 5; continue; fi';
const after=`while :; do
 # ONE Controls-owned Opal relay process. No second poller/service. The staged
 # versioned native overlay helper is hard source-gated FALSE until a separately
 # authorized same-manifest release. Never invoke an untrusted symlink.
 OVERLAY_HELPER=/usr/lib/hbnf-glow-overlay-v1.sh
 if [ -L "$OVERLAY_HELPER" ]; then log "overlay helper symlink prohibited"; exit 1; fi
 if [ -e "$OVERLAY_HELPER" ]; then
  [ -f "$OVERLAY_HELPER" ] && [ -r "$OVERLAY_HELPER" ] || { log "overlay helper invalid"; exit 1; }
  /bin/ash "$OVERLAY_HELPER" || { log "native overlay v1 single-shot failed; relay stopped for safe recovery"; exit 1; }
 fi
 if ! snapshot; then sleep 5; continue; fi`;
test('candidate main Opal source exactly contains final Networking main plus one guarded helper hook',()=>{
 assert.equal(gitBlob(candidate),newBlob);
 assert.equal(candidate.split(after).length,2);
 assert.equal(gitBlob(candidate.replace(after,before)),oldBlob);
});
test('main and overlay helper both parse under native BusyBox ash',()=>{
 for(const src of [candidate,helper]){
  const p=spawnSync('/usr/bin/busybox',['ash','-n'],{input:src,encoding:'utf8'});
  assert.equal(p.status,0,p.stderr);
 }
});
test('no added service, polling loop, brightness rewrite or environmental admission bypass',()=>{
 assert.equal((candidate.match(/while :; do/g)||[]).length,1);
 assert.equal((candidate.match(/OVERLAY_HELPER=\/usr\/lib\/hbnf-glow-overlay-v1\.sh/g)||[]).length,1);
 assert.match(helper,/HBNF_OVERLAY_V1_SOURCE_ADMITTED=false/);
 assert.doesNotMatch(helper,/\$\{HBNF_OVERLAY_V1_SOURCE_ADMITTED/);
 assert.doesNotMatch(candidate,/auto_live=true|firmware_flash|uci commit/);
 assert.match(helper,/"\$M\/json\/state"/);
 assert.doesNotMatch(helper,/\$A\/json\/state/);
});
