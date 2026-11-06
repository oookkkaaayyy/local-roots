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

-- This is a *different* circuit than the 12V isolated-repeater policy.
-- Do not treat a 12V-fed as-built SP803E or logical WLED OFF as same-5V proof.
function M.same5v_profile_ready(profile, policy)
  local spec = policy.same5vCandidate
  local required = policy.same5vRequiredSafetyGates
  local hw = profile.hardware or profile
  local sw, shared, proof = hw.switching, hw.sharedSupply, hw.hardwareQualification
  local main = hw.channels and hw.channels.main
  local short = hw.channels and hw.channels.short
  local supplies = hw.supplyByChannel
  local function positive_integer(x)
    return type(x) == "number" and x > 0 and x % 1 == 0
  end
  local function digest(x)
    return type(x) == "string" and #x == 64 and x:match("^[0-9a-f]+$") ~= nil
  end
  if type(spec) ~= "table" or type(required) ~= "table" or #required < 10
      or profile.verified ~= true or profile.topologyId ~= spec.schema
      or type(profile.evidence) ~= "string" or profile.evidence == ""
      or type(proof) ~= "table" or not digest(proof.installedBoardEvidenceSha256)
      or not digest(proof.dummyLoadAndOpticalAcceptanceSha256)
      or type(proof.boardRevision) ~= "string" or proof.boardRevision == ""
      or proof.manufacturerRatedLowSideOutputs ~= true
      or proof.manualResetNoAutoRearmObserved ~= true
      or proof.gpio16AddressableRailPreserved ~= true then
    return false, "uv_same5v_qualification_missing"
  end
  for _, key in ipairs(required) do
    if type(profile.physicalSafety) ~= "table"
        or profile.physicalSafety[key] ~= true then
      return false, "uv_same5v_physical_gate_incomplete"
    end
  end
  if type(sw) ~= "table" or type(shared) ~= "table"
      or type(main) ~= "table" or type(short) ~= "table"
      or type(supplies) ~= "table"
      or sw.verified ~= true or sw.isolated ~= false
      or sw.method ~= spec.method
      or sw.inputVoltageV ~= spec.controllerSupplyVoltageV
      or sw.outputVoltageV ~= spec.uvLoadVoltageV
      or tonumber(sw.maxLoadVoltageV) == nil or sw.maxLoadVoltageV < spec.uvLoadVoltageV
      or sw.channels ~= 2
      or not positive_integer(sw.maxChannelCurrentMa)
      or not positive_integer(sw.maxTotalCurrentMa)
      or not positive_integer(sw.pwmFrequencyHz)
      or not positive_integer(sw.measuredPwmFrequencyHz)
      or math.abs(sw.pwmFrequencyHz - sw.measuredPwmFrequencyHz) > sw.pwmFrequencyHz * 0.1
      or shared.verified ~= true or shared.topology ~= spec.sharedSupplyTopology
      or shared.converter ~= spec.controllerSupply
      or shared.controllerInputVoltageV ~= spec.controllerSupplyVoltageV
      or shared.addressableSupplyVoltageV ~= spec.addressableSupplyVoltageV
      or shared.addressableDataGpio ~= spec.addressableDataGpio
      or shared.addressableGroups ~= spec.addressableGroups
      or not positive_integer(shared.fuseRatingMa)
      or not positive_integer(shared.trunkWireCurrentRatingMa)
      or shared.trunkWireCurrentRatingMa < shared.fuseRatingMa
      or not positive_integer(shared.converterOutputContinuousRatingMa)
      or not positive_integer(shared.controllerCurrentMarginMa)
      or not positive_integer(shared.measuredCombinedPeakMa)
      or not positive_integer(shared.currentLimitMa)
      or shared.currentLimitMa > shared.converterOutputContinuousRatingMa
      or not positive_integer(hw.maxBrightness)
      or hw.maxBrightness > (tonumber(policy.brightness and policy.brightness.maximum) or 255) then
    return false, "uv_same5v_topology_unqualified"
  end
  local function channel_ok(channel, output, expected)
    return type(output) == "table"
      and channel.gpio == expected.gpio and channel.segmentId == expected.segmentId
      and channel.loadVoltageV == spec.uvLoadVoltageV
      and output.outputVoltageV == spec.uvLoadVoltageV
      and positive_integer(channel.loadCurrentMa)
      and positive_integer(channel.measuredPeakCurrentMa)
      and channel.measuredPeakCurrentMa >= channel.loadCurrentMa
      and positive_integer(channel.fuseRatingMa)
      and channel.fuseRatingMa >= channel.measuredPeakCurrentMa
      and positive_integer(channel.wireCurrentRatingMa)
      and channel.wireCurrentRatingMa >= channel.fuseRatingMa
      and positive_integer(output.currentLimitMa)
      and output.currentLimitMa >= channel.measuredPeakCurrentMa
  end
  if not channel_ok(main, supplies.main, policy.channels.main)
      or not channel_ok(short, supplies.short, policy.channels.short) then
    return false, "uv_same5v_channel_unqualified"
  end
  local lamp_peak = main.measuredPeakCurrentMa + short.measuredPeakCurrentMa
  if shared.measuredCombinedPeakMa < lamp_peak + shared.controllerCurrentMarginMa
      or shared.measuredCombinedPeakMa > shared.fuseRatingMa
      or shared.measuredCombinedPeakMa > shared.currentLimitMa
      or sw.maxChannelCurrentMa < math.max(main.measuredPeakCurrentMa, short.measuredPeakCurrentMa)
      or sw.maxTotalCurrentMa < lamp_peak then
    return false, "uv_same5v_current_margin_unqualified"
  end
  return true
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

  -- This alternate route has its OWN physical gates and never inherits
  -- optoisolator evidence or a 12V-controller profile.
  if type(profile.switching) == "table"
      and type(policy.same5vCandidate) == "table"
      and profile.switching.method == policy.same5vCandidate.method then
    return M.same5v_profile_ready(profile, policy)
  end

  -- The Opal local command path must enforce the same physical UV cutoff,
  -- isolated signal-to-load power domains, optical interlock, and fail-OFF
  -- contract as the AUX backend. A profile label alone never enables UV.
  if type(policy.requiredPhysicalSafetyGates) ~= "table"
      or #policy.requiredPhysicalSafetyGates == 0 then
    return false, "uv_physical_safety_contract_missing"
  end
  for _, key in ipairs(policy.requiredPhysicalSafetyGates) do
    if type(profile.physicalSafety) ~= "table"
        or profile.physicalSafety[key] ~= true then
      return false, "uv_physical_safety_gate_incomplete"
    end
  end
  local hw = profile.hardware or profile
  local main = hw.channels and hw.channels.main
  local short = hw.channels and hw.channels.short
  local supplies = hw.supplyByChannel
  local switching = hw.switching
  local shared_supply = hw.sharedSupply
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
  local shared_fuse = type(shared_supply) == "table" and (tonumber(shared_supply.fuseRatingMa) or 0) or 0
  local shared_limit = type(shared_supply) == "table" and (tonumber(shared_supply.currentLimitMa) or 0) or 0
  local control_voltage = tonumber(switchingSpec.controlVoltage) or 3.3
  local max_channel = tonumber(switching.maxChannelCurrentMa) or 0
  local max_total = tonumber(switching.maxTotalCurrentMa) or 0
  local max_brightness = tonumber(hw.maxBrightness) or 0
  local frequency = tonumber(switching.pwmFrequencyHz) or 0
  local frequency_limits = switchingSpec.pwmFrequencyHz or {}
  if not channel_ready(main, supplies.main or {}, policyChannels.main or {})
      or not channel_ready(short, supplies.short or {}, policyChannels.short or {})
      or switching.verified ~= true or switching.isolated ~= true
      or switching.method ~= switchingSpec.method
      or tonumber(switching.inputVoltageV) ~= tonumber(switchingSpec.controlVoltage)
      or tonumber(switching.outputVoltageV) ~= tonumber(switchingSpec.loadVoltage)
      or frequency < (tonumber(frequency_limits.minimum) or math.huge)
      or frequency > (tonumber(frequency_limits.maximum) or 0)
      or (tonumber(switching.maxLoadVoltageV) or 0) < max_load_voltage
      or (tonumber(switching.controlInputMinVoltage) or math.huge) > control_voltage
      or (tonumber(switching.controlInputMaxVoltage) or 0) < control_voltage
      or tonumber(switching.channels) ~= tonumber(switchingSpec.channels)
      or max_channel <= 0 or max_total < total_load
      or type(shared_supply) ~= "table" or shared_supply.verified ~= true
      or shared_fuse <= 0 or shared_limit < shared_fuse or total_load > shared_fuse
      or (tonumber(main.wireCurrentRatingMa) or 0) < shared_fuse
      or (tonumber(short.wireCurrentRatingMa) or 0) < shared_fuse
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
