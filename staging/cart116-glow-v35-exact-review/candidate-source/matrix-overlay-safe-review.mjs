/**
 * Matrix/Controls Track A review-only safety adapter.
 * This does not submit WLED commands or modify v35 challenge/confirmation SQL.
 * A qualifying proposal is NOT permission to install or apply it.
 */
export const MATRIX_IP = '192.168.77.10';
export const AUX_IP = '192.168.77.11';
export const MATRIX_MAC = '704bca5b345c';
export const AUX_MAC = '8c94df55c34c';
export const R6_RELEASE = 'hbnf-cart2-phase2-r6-skins-readable-20261014';

const mac = value => String(value ?? '').toLowerCase().replaceAll(':', '');
const integer = value => Number.isInteger(value);
const blocked = reason => ({ eligible: false, reviewOnly: true, mutationAuthorized: false, reason });

// WLED 16.0.1 const.h: 22=WS2812 RGB, 41=analog single-channel PWM.
// Last authenticated Cart receipt 6613457326: [0,22) RGB GPIO16 and two
// physically distinct, OFF PWM buses at GPIO25/26. Neither bus is touched.
// This validates 24 CONFIGURED outputs and 22 DDP pixels; it does NOT
// pretend that AUX leds.count=22 or certify packet-level DDP framing.
export function inspectAux22DdpWithOffPwm({auxInfo, auxState, auxConfig}={}) {
  const reject = reason => ({compatible:false,reason});
  if (mac(auxInfo?.mac)!==AUX_MAC || auxInfo?.ip!==AUX_IP ||
      auxInfo?.leds?.count!==24 || auxInfo?.live!==true ||
      auxInfo?.lm!=='DDP' || auxInfo?.lip!==MATRIX_IP ||
      auxConfig?.if?.live?.maxbri!==false || auxState?.lor!==0)
    return reject('aux_identity_or_ddp_mismatch');
  const bus=auxConfig?.hw?.led?.ins;
  if (!Array.isArray(bus) || bus.length!==3) return reject('aux_bus_inventory_unproven');
  const expected=[{start:0,len:22,type:22,pin:16},
                  {start:22,len:1,type:41,pin:25},
                  {start:23,len:1,type:41,pin:26}];
  for(let i=0;i<3;i++) {
    const actual=bus[i],e=expected[i];
    if (!actual || actual.start!==e.start || actual.len!==e.len ||
        actual.type!==e.type || !Array.isArray(actual.pin) ||
        actual.pin.length!==1 || actual.pin[0]!==e.pin)
      return reject('aux_bus_geometry_or_pwm_type_mismatch');
  }
  const segments=auxState?.seg;
  if(!Array.isArray(segments)||segments.length!==3)
    return reject('aux_segment_inventory_unproven');
  for(let i=0;i<3;i++) {
    const x=segments.find(s=>s?.id===i),e=expected[i];
    if (!x || x.start!==e.start || x.stop!==e.start+e.len ||
        x.on!==(i===0))return reject('aux_pwm_not_proven_off');
  }
  // A network/source-state check is not a packet capture and never claims
  // that the two analog channels cannot be activated by another process.
  return {compatible:true,configuredLeds:24,ddpRgbPixels:22,
    pwmOffPins:[25,26],reason:'source_geometry_only_no_physical_actuation_proof'};
}

/**
 * Explicit, read-only inputs only. The caller must independently establish
 * ownerPriorityClear from its authoritative, revision-fenced Cart reducer.
 * 
 * IMPORTANT: Does not infer the effect ID from an old fx142 projection.
 */
export function proposeNativeOverlayOnly({ matrixInfo, matrixState, matrixBuild,
    auxInfo, auxState, auxConfig, ownerPriorityClear, overlay } = {}) {
  if (ownerPriorityClear !== true) return blocked('owner_priority_not_cleared');
  if (mac(matrixInfo?.mac) !== MATRIX_MAC ||
      mac(auxInfo?.mac) !== AUX_MAC ||
      Number(matrixInfo?.leds?.count) !== 534 ||
      auxInfo?.ip !== AUX_IP) return blocked('target_or_topology_mismatch');
  if (!String(matrixInfo?.ver ?? '').startsWith('16.0.1')) return blocked('wled_version_unproven');
  if (matrixBuild?.release_id !== R6_RELEASE ||
      matrixState?.HBNF?.candidate !== R6_RELEASE ||
      matrixState?.HBNF?.schema !== 'foundation-v1') return blocked('installed_release_not_verified');
  if (matrixState?.on !== true || !integer(matrixState?.HBNF?.effectId) ||
      ![-1,60].includes(matrixState?.ps)) return blocked('matrix_active_profile_not_verified');
  const segments = matrixState?.seg;
  if (!Array.isArray(segments) || segments.length !== 2) return blocked('segment_geometry_unproven');
  const a = segments.find(s => s?.id === 0);
  const b = segments.find(s => s?.id === 1);
  const fx = matrixState.HBNF.effectId;
  if (!a || !b || a.start !== 0 || a.stop !== 512 || b.start !== 512 ||
      b.stop !== 534 || a.fx !== fx || b.fx !== fx ||
      a.on !== true || b.on !== true) return blocked('active_foundation_effect_unproven');
  if (matrixState.HBNF.overlayId != null) return blocked('existing_overlay_not_preemptible');
  const ddp=inspectAux22DdpWithOffPwm({auxInfo,auxState,auxConfig});
  if (!ddp.compatible) return blocked(ddp.reason);
  // EXACT COMPILED Oct 14 R6 source binding: 00e6552...,
  // integration-r6-f89-compact-font/usermod_hbnf_foundation_v1.cpp,
  // SHA-256 87bdbd9a68425e97cd5b97641768c4e4a16a527c3dfadfca3d0cb4e3ea5c5559.
  // Its loop keeps both segments on registered foundationEffectId (FX142 in
  // the actual Nov 3 readback), and mode_hbnf_foundation renders HBNF.overlay
  // without consulting ps. ps=-1 is NOT a failure or an instruction to load
  // preset 60. This review helper is NOT provider/device admission.
  if (matrixState.ps===-1 && fx!==142)
    return blocked('ps_minus1_requires_verified_r6_fx142');
  // R6 reserves WLED master+segment brightness at 255 and applies the user
  // brightness in HBNF.matrixBrightness. A non-null HBNF.overlay JSON also
  // normalizes WLED bri to 255. Preserve the baseline, never send bri writes.
  if (matrixState.bri!==255 || a.bri!==255 || b.bri!==255)
    return blocked('native_wled_unity_brightness_unproven');
  const matrixBrightness=matrixState.HBNF.matrixBrightness;
  if (!integer(matrixBrightness) || matrixBrightness<0 || matrixBrightness>255)
    return blocked('native_matrix_brightness_unproven');
  // The installed Nov 3 HBNF.matrixBrightness=0: native R6 outputs all-black
  // overlay pixels at zero. JSON overlayId can ACK but visible scoring cannot.
  // Never raise it automatically or ask owner to do so merely for a test.
  if (matrixBrightness===0)
    return blocked('matrix_brightness_zero_invisible_scoreboard');
  if (!overlay || overlay.kind !== 'scoreboard' || overlay.label !== 'GLOW' ||
      typeof overlay.id !== 'string' || !/^hbnf-[a-f0-9]{32}$/.test(overlay.id) ||
      !integer(overlay.ttlMs) || overlay.ttlMs < 250 || overlay.ttlMs > 30000 ||
      !Array.isArray(overlay.entries) || overlay.entries.length < 1 ||
      overlay.entries.length > 12 ||
      overlay.entries.some(entry => typeof entry !== 'string' ||
        !entry.trim() || entry.length > 63)) return blocked('glow_overlay_invalid');
  // Explicitly omit every WLED core key, segment/effect/brightness/preset,
  // HBNF scene/Vibe/palette/tuning key, and all AUX writes.
  const payload = { HBNF: { overlay: {
    id: overlay.id, kind: 'scoreboard', label: 'GLOW',
    entries: [...overlay.entries], ttlMs: overlay.ttlMs
  } } };
  return {
    eligible: true, reviewOnly: true, mutationAuthorized: false,
    reason: 'source_contract_only_not_connected_to_v35_relay',
    payload, expectedOverlayId: overlay.id,
    baseline: { releaseId: R6_RELEASE, preset: matrixState.ps, effectId: fx,
      segmentIds: [0, 1], matrixMac: MATRIX_MAC, auxMac: AUX_MAC }
  };
}
