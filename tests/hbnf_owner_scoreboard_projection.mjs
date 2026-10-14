import assert from "node:assert/strict";
import { buildWledProjection } from "../staging/coordinated-backend/hbnf-cart-control/matrix-relay-projection.ts";

const entries=Array.from({length:20},(_,i)=>`P${i+1} ${i%10}`);
function context(roster,expiry=56000){
  return {desired:{state:{power:"on",selectedVibe:"groove",sceneId:"course-flow",paletteId:"hbnf-balanced",
    devices:{matrix:{enabled:true,brightness:60},aux:{enabled:true,brightness:50}},tuning:{motion:60,audioResponse:75},
    overlays:[{id:"owner-scoreboard",kind:"scoreboard",priority:60,expiresAt:expiry,payload:{label:"F9",entries:roster}}]}}};
}
const projection=await buildWledProjection(context(entries),51,7,1000);
assert.equal(projection.wledPayload.HBNF.overlay.ttlMs,55000);
assert.deepEqual(projection.wledPayload.HBNF.overlay.entries,entries);
assert.equal(projection.wledPayload.HBNF.overlay.entries.length,20);
for(const size of [1,12,13,20]){
  const sample=entries.slice(0,size);
  const result=await buildWledProjection(context(sample,1000+Math.ceil(size/2)*5500),51,7,1000);
  assert.deepEqual(result.wledPayload.HBNF.overlay.entries,sample,`projection preserves ${size} entries without truncation`);
}
await assert.rejects(buildWledProjection(context([...entries,"P21 1"]),52,7,1000),/invalid_scoreboard_overlay/);
await assert.rejects(buildWledProjection(context(["TOOLONG 1"]),53,7,1000),/invalid_scoreboard_overlay/);
console.log("PASS: canonical projection preserves all 20 supported entries and 55-second page budget; rejects oversized rosters without truncation");
