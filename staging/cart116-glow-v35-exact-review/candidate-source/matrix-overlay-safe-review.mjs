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

/**
 * Explicit, read-only inputs only. The caller must independently establish
 * ownerPriorityClear from its authoritative, revision-fenced Cart reducer.
 * 
 * IMPORTANT: Does not infer the effect ID from an old fx142 projection.
 */
export function proposeNativeOverlayOnly({ matrixInfo, matrixState, matrixBuild,
    auxInfo, auxState, ownerPriorityClear, overlay } = {}) {
  if (ownerPriorityClear !== true) return blocked('owner_priority_not_cleared');
  if (mac(matrixInfo?.mac) !== MATRIX_MAC ||
      mac(auxInfo?.mac) !== AUX_MAC ||
      Number(matrixInfo?.leds?.count) !== 534 ||
      Number(auxInfo?.leds?.count) !== 22 ||
      auxInfo?.ip !== AUX_IP) return blocked('target_or_topology_mismatch');
  if (!String(matrixInfo?.ver ?? '').startsWith('16.0.1')) return blocked('wled_version_unproven');
  if (matrixBuild?.release_id !== R6_RELEASE ||
      matrixState?.HBNF?.candidate !== R6_RELEASE ||
      matrixState?.HBNF?.schema !== 'foundation-v1') return blocked('installed_release_not_verified');
  if (matrixState?.on !== true || matrixState?.ps !== 60 ||
      !integer(matrixState?.HBNF?.effectId)) return blocked('wow_max_runtime_unproven');
  const segments = matrixState?.seg;
  if (!Array.isArray(segments) || segments.length !== 2) return blocked('segment_geometry_unproven');
  const a = segments.find(s => s?.id === 0);
  const b = segments.find(s => s?.id === 1);
  const fx = matrixState.HBNF.effectId;
  if (!a || !b || a.start !== 0 || a.stop !== 512 || b.start !== 512 ||
      b.stop !== 534 || a.fx !== fx || b.fx !== fx ||
      a.on !== true || b.on !== true) return blocked('active_foundation_effect_unproven');
  if (matrixState.HBNF.overlayId != null) return blocked('existing_overlay_not_preemptible');
  if (auxInfo?.live !== true || auxInfo?.lm !== 'DDP' ||
      auxInfo?.lip !== MATRIX_IP || Number(auxState?.lor) !== 0)
    return blocked('aux_ddp_not_verified');
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
    baseline: { releaseId: R6_RELEASE, preset: 60, effectId: fx,
      segmentIds: [0, 1], matrixMac: MATRIX_MAC, auxMac: AUX_MAC }
  };
}
