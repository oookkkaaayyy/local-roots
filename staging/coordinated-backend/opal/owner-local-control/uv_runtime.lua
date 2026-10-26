-- Shared read-only AUX identity/readiness checks for local UV routes.
local M = {}
local cjson = require "cjson.safe"

M.RELEASE = "hbnf-wow-aux-r3-2026-10-25-uv-follow-v1"
M.ENGINE = "aux-r3-wow-1d"
M.BUILD_WITNESS = "registry28-tempo-lock-1d-v7-network-no-starve-uv-follow"
M.FOLLOW_EFFECT_ID = 248

function M.decode_state(body)
  local state = cjson.decode(body or "")
  if type(state) ~= "table" then return nil, "invalid_aux_state" end
  local identity = state.HBNFAUX
  if type(identity) ~= "table"
      or identity.release ~= M.RELEASE
      or identity.engine ~= M.ENGINE
      or identity.buildWitness ~= M.BUILD_WITNESS
      or identity.uvFollowEffectId ~= M.FOLLOW_EFFECT_ID
      or identity.uvFollowRegistered ~= true
      or tonumber(identity.uvOutputsVerified) ~= 1 then
    return nil, "uv_firmware_not_ready"
  end
  local segments = {}
  for _, segment in ipairs(state.seg or {}) do
    if type(segment) == "table" and type(segment.id) == "number" then
      segments[segment.id] = segment
    end
  end
  if not segments[1] or not segments[2] then return nil, "uv_segments_not_ready" end
  return { root = state, identity = identity, segments = segments }
end

function M.read_state()
  local response = ngx.location.capture("/__aux_uv_state")
  if not response or response.status ~= 200 then return nil, "aux_state_unavailable" end
  local decoded, reason = M.decode_state(response.body)
  if not decoded then return nil, reason end
  return decoded
end

function M.segment_matches(segment, expected)
  return type(segment) == "table"
      and segment.on == expected.on
      and tonumber(segment.bri) == expected.bri
      and tonumber(segment.fx) == expected.fx
      and tonumber(segment.ix) == expected.ix
end

return M
