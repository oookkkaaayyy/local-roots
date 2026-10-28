-- Shared read-only AUX identity/readiness checks for local UV routes.
local M = {}
local cjson = require "cjson.safe"
local PROFILE_PATH = "/etc/hbnf-local-control-state/uv_hardware_profile.json"
local POLICY_PATH = "/etc/hbnf-local-control/lua/uv_policy_spec.json"

M.RELEASE = "hbnf-wow-aux-r3-2026-10-25-uv-follow-v1"
M.ENGINE = "aux-r3-wow-1d"
M.BUILD_WITNESS = "registry28-tempo-lock-1d-v7-network-no-starve-uv-follow"
M.FOLLOW_EFFECT_ID = 248

local function read_json(path)
  local file = io.open(path, "rb")
  if not file then return nil end
  local body = file:read("*a")
  file:close()
  return cjson.decode(body or "")
end

function M.profile_ready(profile, policy)
  profile = profile or read_json(PROFILE_PATH)
  policy = policy or read_json(POLICY_PATH)
  if type(profile) ~= "table" or type(policy) ~= "table"
      or profile.schema ~= "hbnf-aux-uv-hardware-profile-v1"
      or profile.verified ~= true
      or type(profile.evidence) ~= "string" or profile.evidence == "" then
    return false, "uv_hardware_profile_unverified"
  end
  for _, key in ipairs(policy.requiredRuntimeGates or {}) do
    -- hardwareReady is derived below from the full profile, never trusted as
    -- an editable profile assertion.
    if key ~= "hardwareReady"
        and (type(profile.runtimeGates) ~= "table" or profile.runtimeGates[key] ~= true) then
      return false, "uv_runtime_gate_incomplete"
    end
  end
  for _, key in ipairs(policy.requiredCommissioningGates or {}) do
    if type(profile.commissioningGates) ~= "table" or profile.commissioningGates[key] ~= true then
      return false, "uv_commissioning_gate_incomplete"
    end
  end

  local hw = profile.hardware or profile
  local main = hw.channels and hw.channels.main
  local short = hw.channels and hw.channels.short
  local supplies = hw.supplyByChannel
  local switching = hw.switching
  local policyChannels = policy.channels
  local switchingSpec = policy.switching
  if type(main) ~= "table" or type(short) ~= "table" or type(supplies) ~= "table"
      or type(switching) ~= "table" or type(policyChannels) ~= "table"
      or type(switchingSpec) ~= "table" then
    return false, "uv_hardware_profile_incomplete"
  end
  local function channel_ready(channel, supply, expected)
    local load = tonumber(channel.loadCurrentMa) or 0
    local supply_limit = tonumber(supply.currentLimitMa) or 0
    local fuse = tonumber(channel.fuseRatingMa) or 0
    local wire = tonumber(channel.wireCurrentRatingMa) or 0
    local voltage = tonumber(channel.loadVoltageV)
    return voltage and voltage > 0
      and tonumber(supply.outputVoltageV) == voltage
      and supply_limit >= load and load > 0
      and fuse >= load and fuse <= supply_limit
      and wire >= fuse
      and channel.gpio == expected.gpio
      and channel.segmentId == expected.segmentId
  end
  local max_load_voltage = math.max(tonumber(main.loadVoltageV) or 0, tonumber(short.loadVoltageV) or 0)
  local total_load = (tonumber(main.loadCurrentMa) or 0) + (tonumber(short.loadCurrentMa) or 0)
  local control_voltage = tonumber(switchingSpec.controlVoltage) or 3.3
  local max_channel = tonumber(switching.maxChannelCurrentMa) or 0
  local max_total = tonumber(switching.maxTotalCurrentMa) or 0
  local max_brightness = tonumber(hw.maxBrightness) or 0
  if not channel_ready(main, supplies.main or {}, policyChannels.main or {})
      or not channel_ready(short, supplies.short or {}, policyChannels.short or {})
      or switching.verified ~= true or switching.isolated ~= true
      or (tonumber(switching.maxLoadVoltageV) or 0) < max_load_voltage
      or (tonumber(switching.controlInputMinVoltage) or math.huge) > control_voltage
      or (tonumber(switching.controlInputMaxVoltage) or 0) < control_voltage
      or tonumber(switching.channels) ~= tonumber(switchingSpec.channels)
      or max_channel <= 0 or max_total < total_load
      or max_brightness <= 0 or max_brightness > (tonumber(policy.brightness and policy.brightness.maximum) or 255)
      or (tonumber(main.loadCurrentMa) or 0) > max_channel
      or (tonumber(short.loadCurrentMa) or 0) > max_channel then
    return false, "uv_hardware_limits_incomplete"
  end
  return true
end

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
      or tonumber(identity.uvOutputsVerified) ~= 1
      or identity.uvBuildProfile ~= "uv-follow-output-capable-v1" then
    return nil, "uv_firmware_not_ready"
  end
  local segments = {}
  for _, segment in ipairs(state.seg or {}) do
    if type(segment) == "table" and type(segment.id) == "number" then
      segments[segment.id] = segment
    end
  end
  if not segments[1] or not segments[2] then return nil, "uv_segments_not_ready" end
  if tonumber(segments[1].start) ~= 22 or tonumber(segments[1].stop) ~= 23
      or tonumber(segments[2].start) ~= 23 or tonumber(segments[2].stop) ~= 24 then
    return nil, "uv_segment_map_mismatch"
  end
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
  if type(segment) ~= "table" or segment.on ~= expected.on
      or (expected.on == true and tonumber(segment.bri) ~= expected.bri)
      or tonumber(segment.fx) ~= expected.fx or tonumber(segment.ix) ~= expected.ix then
    return false
  end
  -- One-channel PWM state is the RGBW white value. Require the W readback too;
  -- on=true and a nonzero brightness can still leave this output electrically dark.
  if expected.col then
    local color = type(segment.col) == "table" and segment.col[1] or nil
    if type(color) ~= "table" or #color < 4
        or tonumber(color[1]) ~= expected.col[1]
        or tonumber(color[2]) ~= expected.col[2]
        or tonumber(color[3]) ~= expected.col[3]
        or tonumber(color[4]) ~= expected.col[4] then
      return false
    end
  end
  return true
end

return M
