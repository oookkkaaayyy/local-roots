/**
 * Shared canonical reducer and small Guest V1 adapter.
 *
 * Guest inputs are reduced by the exact Cart command reducer used by the owner
 * route. This module owns no persistence, identity, or device transport.
 */
import { isManualRuntimeVibe } from "./runtime-vibe.ts";
export interface GuestCommandPlan {
  ok: true;
  type: string;
  payload: Record<string, unknown>;
  commandId: string;
  expectedRevision: number;
  nextState: Record<string, unknown>;
  currentRevision: number;
}

export interface GuestCommandRejection {
  ok: false;
  status: number;
  error: string;
  currentRevision?: number;
}

export function planGuestCommand(
  request: Record<string, unknown>,
  state: Record<string, unknown> | null | undefined,
  authoritativeRevision = Number(state?.revision),
): GuestCommandPlan | GuestCommandRejection {
  if (!isCommandId(request.commandId) || !Number.isSafeInteger(request.expectedRevision) || Number(request.expectedRevision) < 0) {
    return { ok: false, status: 400, error: "invalid_command" };
  }
  if (!state || state.guestMode !== true) return { ok: false, status: 403, error: "guest_mode_closed" };
  const currentRevision = authoritativeRevision;
  if (!Number.isSafeInteger(currentRevision) || currentRevision < 0) return { ok: false, status: 503, error: "cart_not_ready" };
  if (Number(request.expectedRevision) !== currentRevision) {
    return { ok: false, status: 409, error: "stale_revision", currentRevision };
  }

  const action = String(request.guestAction ?? "");
  const value = String(request.value ?? "");
  let type: string;
  let payload: Record<string, unknown>;
  if (action === "vibe" && (isManualRuntimeVibe(value) || ["mellow", "moderate", "energetic", "peak"].includes(value))) {
    type = "VIBE";
    payload = { vibe: value };
  } else if (action === "vibe_auto" && value === "") {
    type = "VIBE_AUTO";
    payload = {};
  } else if (action === "next" && value === "") {
    type = "NEXT";
    payload = {};
  } else if (action === "auto" && value === "") {
    type = "AUTO";
    payload = {};
  } else {
    return { ok: false, status: 400, error: "guest_action_not_allowed" };
  }

  const nextState = reduceCartCommand(state, type, payload, String(request.commandId), currentRevision);
  if (!nextState) return { ok: false, status: 400, error: "command_rejected" };
  return {
    ok: true,
    type,
    payload,
    commandId: String(request.commandId),
    expectedRevision: currentRevision,
    currentRevision,
    nextState,
  };
}

export function isMetadataOnlyCommand(type: string): boolean {
  return type === "GUEST_MODE";
}

export function reconcileTargetsForCommand(type: string, defaultTargets: readonly string[]): string[] {
  return isMetadataOnlyCommand(type) ? [] : [...defaultTargets];
}

export function requiresOwnerAuthorization(action: string, _commandType: unknown): boolean {
  // The generic command route can mutate power, scenes, palettes, tuning,
  // overlays, and device profiles. It must therefore require an authenticated
  // operator or a valid paired-device session for every command type. Guest
  // writes use the separate guest_command route and its bounded reducer.
  return action === "command" || action === "create_install_handoff" || action === "pair_device" ||
    ["skins_score_state", "skins_score_set", "skins_tiebreaker_set", "skins_ace_set"].includes(action);
}

export async function runGuestCommand(
  request: Record<string, unknown>,
  deps: {
    readContext: () => Promise<{ data: any; error: any }>;
    commit: (input: { commandId: string; type: string; expectedRevision: number; nextState: Record<string, unknown> }) => Promise<{ data: any; error: any }>;
    reconcile: (input: { revision: number; fence: Record<string, unknown>; type: string }) => Promise<{ ok: boolean; status: number; body: unknown }>;
  },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { data: context, error: readError } = await deps.readContext();
  const row = context?.desired as { revision: number; state: Record<string, unknown> } | null;
  const fence = context?.fence as { epoch: number; release_id: string; active: boolean } | null;
  if (readError || !row || !fence?.active) return { status: 503, body: { error: "cart_not_ready" } };

  // Revision is canonical on the desired row, not necessarily duplicated in
  // its JSON state. Never trust a caller-supplied or missing state revision.
  const plan = planGuestCommand(request, row.state, Number(row.revision));
  if (!plan.ok) return { status: plan.status, body: { error: plan.error, ...(plan.currentRevision === undefined ? {} : { currentRevision: plan.currentRevision }) } };

  const { data: committed, error: commitError } = await deps.commit({
    commandId: plan.commandId,
    type: plan.type,
    expectedRevision: plan.expectedRevision,
    nextState: plan.nextState,
  });
  if (commitError) return {
    status: commitError.code === "40001" ? 409 : 500,
    body: { error: commitError.code === "40001" ? "stale_revision" : "command_commit_failed" },
  };

  const revision = Number(committed?.result_revision);
  const reconciliation = await deps.reconcile({ revision, fence, type: plan.type });
  return {
    status: 202,
    body: {
      revision,
      duplicate: Boolean(committed?.duplicate),
      reconciliation: reconciliation.ok ? reconciliation.body : { status: "pending", httpStatus: reconciliation.status },
    },
  };
}

function isCommandId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}


const required = (value: unknown, max = 128) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
const devices = ["matrix", "aux"] as const;

export function reduceCartCommand(state: Record<string, unknown>, type: string, payload: Record<string, unknown>, commandId: string, revision: number) {
  const next = structuredClone(state) as Record<string, unknown>;
  const devicesState = structuredClone((state.devices ?? {}) as Record<string, Record<string, unknown>>);
  switch (type) {
    case "GUEST_MODE": if (typeof payload.enabled !== "boolean") return null; next.guestMode = payload.enabled; break;
    case "OFF": next.power = "off"; break;
    case "ON": next.power = "on"; break;
    case "NEXT": next.sequenceCursor = Number(next.sequenceCursor ?? 0) + 1; next.programMode = "auto"; break;
    case "AUTO": next.programMode = "auto"; break;
    case "LOCK": next.programMode = "lock"; break;
    case "SCENE": if (!required(payload.sceneId, 80) || ["brightness", "power", "deviceProfiles"].some(k => JSON.stringify(payload).toLowerCase().includes(k.toLowerCase()))) return null; next.sceneId = payload.sceneId; next.programMode = "lock"; break;
    case "PALETTE": if (!required(payload.paletteId, 80)) return null; next.paletteId = payload.paletteId; break;
    case "TUNE": {
      let changed = false;
      const tune = structuredClone((state.tuning ?? {}) as Record<string, unknown>);

      if (payload.sceneId !== undefined) {
        if (!required(payload.sceneId, 80) || !["course-flow","field-mix","hbnf-signature","quiet-cosmos"].includes(String(payload.sceneId))) return null;
        next.sceneId = String(payload.sceneId);
        changed = true;
      }
      if (payload.paletteId !== undefined) {
        if (!required(payload.paletteId, 80)) return null;
        next.paletteId = String(payload.paletteId);
        changed = true;
      }
      if (payload.vibe !== undefined) {
        const value = String(payload.vibe);
        if (isManualRuntimeVibe(value)) {
          next.selectedVibe = value;
          next.vibeMode = "manual";
        } else if (["mellow","moderate","energetic","peak"].includes(value)) {
          // Keep the pre-Cart-2.0 energy category compatible for old clients.
          next.vibe = value;
          next.vibeMode = "manual";
        } else return null;
        changed = true;
      }
      if (payload.speedBias !== undefined) {
        if (!Number.isFinite(payload.speedBias)) return null;
        next.manualSpeedBias = Math.max(0.5, Math.min(2, Number(payload.speedBias)));
        next.tempoMode = "manual";
        changed = true;
      }
      if (payload.tempoMode !== undefined) {
        if (String(payload.tempoMode) !== "manual") return null;
        next.tempoMode = "manual";
        changed = true;
      }
      if (payload.matrixBrightness !== undefined || payload.auxBrightness !== undefined) {
        const matrixProfile = devicesState.matrix;
        const auxProfile = devicesState.aux;
        const oldMatrix = clamp(Number(matrixProfile.brightness ?? 0), 0, 255);
        const oldAux = clamp(Number(auxProfile.brightness ?? 0), 0, 255);

        const requestedMatrix = payload.matrixBrightness === undefined
          ? oldMatrix
          : clamp(Number(payload.matrixBrightness), 0, 255);
        const requestedAux = payload.auxBrightness === undefined
          ? oldAux
          : clamp(Number(payload.auxBrightness), 0, 255);

        if (!Number.isFinite(requestedMatrix) || !Number.isFinite(requestedAux)) return null;

        const matrixChanged = requestedMatrix !== oldMatrix;
        const auxExplicitlyChanged = requestedAux !== oldAux;

        let finalAux = requestedAux;
        if (matrixChanged && !auxExplicitlyChanged) {
          finalAux = oldMatrix > 0
            ? clamp(Math.round(oldAux * requestedMatrix / oldMatrix), 0, 255)
            : (requestedMatrix === 0 ? 0 : oldAux);
        }

        if (oldMatrix !== requestedMatrix) matrixProfile.profileRevision = Number(matrixProfile.profileRevision ?? 0) + 1;
        matrixProfile.brightness = requestedMatrix;
        matrixProfile.brightnessLocked = true;

        if (oldAux !== finalAux) auxProfile.profileRevision = Number(auxProfile.profileRevision ?? 0) + 1;
        auxProfile.brightness = finalAux;
        auxProfile.brightnessLocked = true;

        changed = true;
      }
      if (payload.micSensitivity !== undefined) {
        if (!Number.isFinite(payload.micSensitivity)) return null;
        tune.micSensitivity = clamp(Number(payload.micSensitivity), 64, 255);
        changed = true;
      }
      if (payload.audioProfile !== undefined) {
        if (!["scene","bass","mid","balanced","treble","full","impact"].includes(String(payload.audioProfile))) return null;
        tune.audioProfile = String(payload.audioProfile);
        changed = true;
      }
      if (payload.audioStyle !== undefined) {
        if (!["scene","clean","punch","ring","spark","chroma","hybrid"].includes(String(payload.audioStyle))) return null;
        tune.audioStyle = String(payload.audioStyle);
        changed = true;
      }
      if (payload.responseBoost !== undefined) {
        if (!Number.isFinite(payload.responseBoost)) return null;
        tune.responseBoost = Math.max(1, Math.min(1.5, Number(payload.responseBoost)));
        changed = true;
      }
      if (payload.variation !== undefined) {
        if (!Number.isFinite(payload.variation)) return null;
        tune.variation = clamp(Number(payload.variation), 0, 100);
        changed = true;
      }
      if (payload.energy !== undefined) {
        if (!Number.isFinite(payload.energy)) return null;
        tune.energy = clamp(Number(payload.energy), 0, 100);
        changed = true;
      }
      if (payload.audioResponse !== undefined) {
        if (!Number.isFinite(payload.audioResponse)) return null;
        tune.audioResponse = clamp(Number(payload.audioResponse), 0, 100);
        changed = true;
      }
      if (payload.motion !== undefined) {
        if (!Number.isFinite(payload.motion)) return null;
        tune.motion = clamp(Number(payload.motion), 0, 100);
        changed = true;
      }
      if (!changed) return null;
      next.tuning = tune;
      break;
    }
    case "VIBE": {
      const value = String(payload.vibe);
      if (isManualRuntimeVibe(value)) {
        next.selectedVibe = value;
        next.vibeMode = "manual";
      } else if (["mellow","moderate","energetic","peak"].includes(value)) {
        next.vibe = value;
        next.vibeMode = "manual";
      } else return null;
      break;
    }
    case "VIBE_AUTO": next.selectedVibe = "auto"; next.vibeMode = "music"; break;
    case "TEMPO_AUTO": return null;
    case "SPEED": if (!Number.isFinite(payload.speedBias)) return null; next.manualSpeedBias = clamp(Number(payload.speedBias), 0.5, 2); next.tempoMode = "manual"; break;
    case "OVERLAY_START": {
      if (!required(payload.overlayId, 80)) return null;
      const kind = String(payload.kind ?? "");
      if (!["text","scoreboard"].includes(kind)) return null;
      const maxTtlMs = kind === "scoreboard" ? 120000 : 30000;
      const ttlMs = clamp(Number(payload.ttlMs ?? 8000), 1000, maxTtlMs);
      const priority = clamp(Number(payload.priority ?? 60), 1, 100);
      const data = payload.data && typeof payload.data === "object" ? structuredClone(payload.data as Record<string, unknown>) : {};
      if (kind === "text") {
        const text = String((data as Record<string, unknown>).text ?? "").trim();
        if (!text || text.length > 63) return null;
        (data as Record<string, unknown>).text = text;
        const color = String((data as Record<string, unknown>).color ?? "#FFFFFF").toUpperCase();
        if (!/^#[0-9A-F]{6}$/.test(color)) return null;
        (data as Record<string, unknown>).color = color;
        const rawFontIndex = (data as Record<string, unknown>).fontIndex;
        const fontIndex = rawFontIndex === undefined ? 4 : rawFontIndex;
        if (!Number.isInteger(fontIndex) || ![0, 2, 3, 4].includes(fontIndex as number)) return null;
        (data as Record<string, unknown>).fontIndex = fontIndex;
      } else {
        const entries = Array.isArray((data as Record<string, unknown>).entries) ? (data as Record<string, unknown>).entries as unknown[] : [];
        if (!entries.length || entries.length > 20) return null;
        const normalizedEntries = entries.map(x => String(x).trim());
        if (normalizedEntries.some(x => !x || x.length > 8)) return null;
        (data as Record<string, unknown>).entries = normalizedEntries;
        (data as Record<string, unknown>).label = String((data as Record<string, unknown>).label ?? "SCORES").trim().slice(0,24);
      }
      const now = Date.now();
      const overlays = Array.isArray(next.overlays) ? next.overlays as Record<string, unknown>[] : [];
      next.overlays = overlays
        .filter(x => Number(x.expiresAt) > now && String(x.id) !== String(payload.overlayId))
        .concat([{ id:String(payload.overlayId), kind, priority, expiresAt:now + ttlMs, payload:data }]);
      break;
    }
    case "OVERLAY_EXPIRE": {
      const now = Date.now();
      const overlays = Array.isArray(next.overlays) ? next.overlays as Record<string, unknown>[] : [];
      next.overlays = overlays.filter(x => Number(x.expiresAt) > now);
      break;
    }

    case "BRIGHTNESS": {
      const id = payload.deviceId;
      if (!devices.includes(id as typeof devices[number]) || !Number.isFinite(payload.brightness)) return null;
      const profile = devicesState[String(id)]; profile.brightness = clamp(Number(payload.brightness), 0, 255); profile.brightnessLocked = true; profile.profileRevision = Number(profile.profileRevision ?? 0) + 1;
      break;
    }
    default: return null;
  }
  if (Array.isArray(next.overlays)) next.overlays = (next.overlays as Record<string, unknown>[]).filter(x => Number(x.expiresAt) > Date.now());
  next.devices = devicesState; next.revision = revision + 1; next.lastCommandId = commandId;
  return next;
}
function clamp(value: number, min: number, max: number) { return Math.round(Math.min(max, Math.max(min, value))); }
