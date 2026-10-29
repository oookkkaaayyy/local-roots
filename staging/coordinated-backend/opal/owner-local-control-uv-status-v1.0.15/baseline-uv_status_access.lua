-- Authenticated read-only readiness from the existing AUX JSON state route.
local auth = dofile("/etc/hbnf-local-control/lua/auth.lua")
if auth.owner_access(false) ~= true then return end

local cjson = require "cjson.safe"
local runtime = dofile("/etc/hbnf-local-control/lua/uv_runtime.lua")
local current, reason = runtime.read_state()
local profile_ready, profile_reason = runtime.profile_ready()
local response = {
  available = current ~= nil,
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
end
ngx.status = 200
ngx.header.content_type = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say(cjson.encode(response))
return ngx.exit(200)
