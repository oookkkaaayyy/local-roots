import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const shell=read("../opal/hbnf-glow-overlay-v1.sh");
const m=JSON.parse(read("../admission/ADMISSION.PENDING.json"));
test("C8 helper accepts only the TWO exact pinned owner-safe release names",()=>{
 assert.match(shell,/case "\$native_owner_safe_release" in/);
 assert.match(shell,/'hbnf-cart2-r6-native-overlay-owner-safe-review-20261103'\|'hbnf-cart2-r6-owner-safe-tuning-persist-review-20261104'/);
 assert.match(shell,/\*\) return 1 ;;/);
 assert.match(shell,/build\.json" -e '@\.release_id'/);
 assert.match(shell,/state\.json" -e '@\.HBNF\.candidate'/);
 assert.doesNotMatch(shell,/native_owner_safe_release='hbnf-cart2-phase2-r6-skins-readable-20261014'/);
});
test("C8 source and native priority gates BOTH remain OFF; no extra AUX writes",()=>{
 assert.match(shell,/HBNF_OVERLAY_V1_SOURCE_ADMITTED=false/);
 assert.match(shell,/HBNF_NATIVE_OWNER_TEXT_PRIORITY_ADMITTED=false/);
 assert.match(shell,/\[ "\$HBNF_OVERLAY_V1_SOURCE_ADMITTED" = true \]/);
 assert.match(shell,/\[ "\$HBNF_NATIVE_OWNER_TEXT_PRIORITY_ADMITTED" = true \] \|\| exit 0/);
 assert.ok(shell.includes('{"HBNF":{"overlay":%s}}'));
 assert.match(shell,/auxWriteRequired/);
 assert.equal(m.firmware.matrix_flash,false);
 assert.equal(m.transaction.source_gate_change_admitted,false);
 assert.equal(m.dora_c9_c8_marker_source_review_20261105.status,"REVIEW_ONLY_NOT_INSTALLABLE");
});
