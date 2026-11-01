-- UV control from the exact Cart-local PWA does not require pairing, as
-- explicitly accepted by the owner for this private Cart LAN. Public-origin
-- callers still require the paired Owner token. CORS origin checks are not a
-- security boundary; the owner accepts unpaired local clients may control UV.
if ngx.var.http_origin ~= "http://192.168.77.1" then
  local auth = dofile("/etc/hbnf-local-control/lua/auth.lua")
  if auth.owner_access(false) ~= true then return end
end

-- Only fixed UV segments are addressable; arbitrary WLED JSON is never accepted.

local cjson = require "cjson.safe"
local runtime = dofile("/etc/hbnf-local-control/lua/uv_runtime.lua")
local function respond(status, value)
  ngx.status = status
  ngx.header.content_type = "application/json"
  ngx.header["Cache-Control"] = "no-store"
  ngx.say(cjson.encode(value))
  -- Return no value so content_by_lua finishes naturally after ngx.say.
end

ngx.req.read_body()
local body = ngx.req.get_body_data()
if not body or #body > 512 then return respond(413, { error = "request_too_large", mutationIssued = false }) end
local input = cjson.decode(body)
if type(input) ~= "table" then return respond(400, { error = "invalid_request", mutationIssued = false }) end
local mode = string.upper(tostring(input.mode or ""))

-- The Cart's UV electrical commissioning evidence is NOT admitted. A paired
-- Owner and WLED state readback do not prove protected wiring, boot/OFF safety
-- or direct-WLED access restrictions. No ON pulse may be issued on this route.
-- Keep commissioning hard-disabled until a distinct, trusted electrical
-- qualification mechanism is reviewed and independently verified.
if mode == "COMMISSIONING_TEST" then
  return respond(503, { error = "uv_electrical_qualification_not_admitted",
    mutationIssued = false })
end

for key in pairs(input) do
  if key ~= "mode" and key ~= "brightnessBySegment" then
    return respond(400, { error = "unsupported_field", mutationIssued = false })
  end
end

if mode ~= "OFF" and mode ~= "MANUAL" and mode ~= "FOLLOW_MATRIX" then
  return respond(400, { error = "unsupported_uv_mode", mutationIssued = false })
end
local levels = input.brightnessBySegment
if type(levels) ~= "table" then return respond(400, { error = "missing_brightness_caps", mutationIssued = false }) end
for key in pairs(levels) do
  if key ~= "main" and key ~= "short" then return respond(400, { error = "unsupported_uv_channel", mutationIssued = false }) end
end
local function valid_level(value)
  return type(value) == "number" and value % 1 == 0 and value >= 0 and value <= 255
end
if not valid_level(levels.main) or not valid_level(levels.short) then
  return respond(400, { error = "invalid_brightness_cap", mutationIssued = false })
end

local current, readiness_error = runtime.read_state()
if not current then return respond(503, { error = readiness_error, mutationIssued = false }) end
if mode ~= "OFF" then
  local profile_ready, profile_error = runtime.profile_ready()
  if profile_ready ~= true then
    return respond(503, { error = profile_error or "uv_commissioning_gates_incomplete", mutationIssued = false })
  end
end

local effect = mode == "FOLLOW_MATRIX" and runtime.FOLLOW_EFFECT_ID or 0
local function make_segment(id, cap)
  if mode == "OFF" or cap == 0 then
    return { id = id, on = false, bri = 0, fx = 0, ix = 0 }
  end
  if mode == "FOLLOW_MATRIX" then
    return { id = id, on = true, bri = 255, fx = effect, ix = cap, col = {{0, 0, 0, 255}} }
  end
  -- AUX UV buses are one-channel PWM with per-bus white mode MANUAL_ONLY (0).
  -- RGB-only white therefore produces zero PWM; set the W component explicitly.
  return { id = id, on = true, bri = cap, fx = 0, ix = cap, col = {{0, 0, 0, 255}} }
end
local expected = {
  [1] = mode == "OFF" and { on = false, bri = 0, fx = 0, ix = 0 }
    or mode == "FOLLOW_MATRIX" and { on = true, bri = 255, fx = effect, ix = levels.main, col = {0, 0, 0, 255} }
    or { on = levels.main > 0, bri = levels.main, fx = 0, ix = levels.main, col = {0, 0, 0, 255} },
  [2] = mode == "OFF" and { on = false, bri = 0, fx = 0, ix = 0 }
    or mode == "FOLLOW_MATRIX" and { on = true, bri = 255, fx = effect, ix = levels.short, col = {0, 0, 0, 255} }
    or { on = levels.short > 0, bri = levels.short, fx = 0, ix = levels.short, col = {0, 0, 0, 255} },
}
-- Keep output serialization separate from short-lived Owner auth rate keys.
local rate = ngx.shared.hbnf_uv_policy_lock
if not rate then
  return respond(503, { error = "uv_policy_lock_storage_unavailable", mutationIssued = false })
end
local acquired, lock_error = rate:add("uv_policy_lock", 1, 15)
if not acquired then
  if lock_error ~= "exists" then
    return respond(503, { error = "uv_policy_lock_storage_failed", mutationIssued = false })
  end
  return respond(429, { error = "uv_policy_request_in_progress", mutationIssued = false })
end
local payload = cjson.encode({ seg = { make_segment(1, levels.main), make_segment(2, levels.short) } })
-- OpenResty internal subrequests can yield. Do not wrap this call in pcall:
-- on the Opal's LuaJIT runtime that raises "attempt to yield across
-- metamethod/C-call boundary" before a manual/follow command reaches WLED.
-- The shared lock has a 15-second expiry, so an unexpected Lua error cannot
-- leave UV commands blocked indefinitely.
local applied = ngx.location.capture("/__aux_uv_apply", { method = ngx.HTTP_POST, body = payload })
if not applied or applied.status ~= 200 then
  rate:delete("uv_policy_lock")
  return respond(502, { error = "uv_device_response_unconfirmed", mutationIssued = "unknown" })
end
-- WLED's POST response is only an acknowledgement, not /json/state. Read the
-- device state separately before claiming the requested mode was applied.
local readback, readback_error = runtime.read_state()
if not readback then
  rate:delete("uv_policy_lock")
  return respond(502, { error = readback_error or "uv_device_readback_unavailable", mutationIssued = "unknown" })
end
if not runtime.segment_matches(readback.segments[1], expected[1])
    or not runtime.segment_matches(readback.segments[2], expected[2]) then
  rate:delete("uv_policy_lock")
  return respond(502, { error = "uv_device_readback_mismatch", mutationIssued = true })
end
rate:delete("uv_policy_lock")

return respond(200, {
  ok = true,
  action = "uv_policy",
  mutationIssued = true,
  mode = mode,
  requested = { main = levels.main, short = levels.short },
  acknowledgement = { transport = "local-opal-wled", acceptedByDevice = true, deviceReadback = true },
})
