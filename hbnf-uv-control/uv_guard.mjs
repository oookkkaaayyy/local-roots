export const UV_STALE_MS=1500;

export function resolveUvRelay({
  requestedOn=false, cartPower="off", auxOnline=false, canonicalAgeMs=Infinity,
}={}){
  if(cartPower!=="on") return {relayOn:false,reason:"global_off"};
  if(!requestedOn) return {relayOn:false,reason:"uv_not_requested"};
  if(!auxOnline) return {relayOn:false,reason:"aux_unavailable"};
  if(!Number.isFinite(canonicalAgeMs)||canonicalAgeMs>UV_STALE_MS)
    return {relayOn:false,reason:"canonical_stale"};
  return {relayOn:true,reason:"allowed"};
}
