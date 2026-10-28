-- Authenticated read-only readiness from the existing AUX JSON state route.
local auth = dofile("/etc/hbnf-local-control/lua/auth.lua")
if auth.owner_access(false) ~= true then return end

local cjson = require "cjson.safe"
local runtime = dofile("/etc/hbnf-local-control/lua/uv_runtime.lua")
local current, reason = runtime.read_state()
local profile_ready, profile_reason = runtime.profile_ready()
local response = {
  available = current ~= nil,
  commissioningTestAvailable = current ~= nil and profile_ready ~= true,
  uvControlEnabled = current ~= nil and profile_ready == true,
  mutationIssued = false,
  reason = reason or profile_reason,
  hardwareProfileReady = profile_ready == true,
}
if current then
  if profile_ready then response.reason = nil end
  response.release = runtime.RELEASE
  response.engine = runtime.ENGINE
  response.buildWitness = runtime.BUILD_WITNESS
  response.uvBuildProfile = current.identity.uvBuildProfile
  response.uvFollowEffectId = runtime.FOLLOW_EFFECT_ID
  response.uvOutputsVerified = true
  response.channels = { main = 1, short = 2 }
  response.outputOn = {
    main = current.segments[1].on == true,
    short = current.segments[2].on == true,
  }
  local function observed_mode(segment)
    if segment.on ~= true then return "OFF" end
    if tonumber(segment.fx) == runtime.FOLLOW_EFFECT_ID then return "FOLLOW_MATRIX" end
    if tonumber(segment.fx) == 0 then return "MANUAL" end
    return "OTHER"
  end
  local main_mode = observed_mode(current.segments[1])
  local short_mode = observed_mode(current.segments[2])
  if main_mode == "FOLLOW_MATRIX" or short_mode == "FOLLOW_MATRIX" then
    if (main_mode == "FOLLOW_MATRIX" or main_mode == "OFF")
        and (short_mode == "FOLLOW_MATRIX" or short_mode == "OFF") then
      response.outputMode = "FOLLOW_MATRIX"
    else
      response.outputMode = "UNKNOWN"
    end
  elseif (main_mode == "MANUAL" or main_mode == "OFF")
      and (short_mode == "MANUAL" or short_mode == "OFF") then
    response.outputMode = (main_mode == "MANUAL" or short_mode == "MANUAL") and "MANUAL" or "OFF"
  else
    response.outputMode = "UNKNOWN"
  end
end
ngx.status = 200
ngx.header.content_type = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say(cjson.encode(response))
return ngx.exit(200)
