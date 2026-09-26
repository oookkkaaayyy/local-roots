import assert from "node:assert/strict";
import {resolveUvRelay,UV_STALE_MS} from "./uv_guard.mjs";

assert.deepEqual(resolveUvRelay({requestedOn:true,cartPower:"on",auxOnline:true,canonicalAgeMs:0}),
  {relayOn:true,reason:"allowed"});
for(const sample of [
  {requestedOn:true,cartPower:"off",auxOnline:true,canonicalAgeMs:0,reason:"global_off"},
  {requestedOn:false,cartPower:"on",auxOnline:true,canonicalAgeMs:0,reason:"uv_not_requested"},
  {requestedOn:true,cartPower:"on",auxOnline:false,canonicalAgeMs:0,reason:"aux_unavailable"},
  {requestedOn:true,cartPower:"on",auxOnline:true,canonicalAgeMs:UV_STALE_MS+1,reason:"canonical_stale"},
]){
  const out=resolveUvRelay(sample); assert.equal(out.relayOn,false); assert.equal(out.reason,sample.reason);
}
console.log("PASS: HBNF UV global-OFF/fail-closed guard");
