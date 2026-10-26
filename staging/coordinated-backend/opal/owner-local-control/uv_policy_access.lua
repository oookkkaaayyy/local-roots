-- Authenticated UV command gateway. Only segments 1/2 are addressable; the
-- Opal validates the installed AUX witness and never accepts arbitrary WLED JSON.
local auth = dofile("/etc/hbnf-local-control/lua/auth.lua")
if auth.owner_access(false) ~= true then return end

local cjson = require "cjson.safe"
local runtime = dofile("/etc/hbnf-local-control/lua/uv_runtime.lua")
local function respond(status, value)
  ngx.status = status
  ngx.header.content_type = "application/json"
  ngx.header["Cache-Control"] = "no-store"
  ngx.say(cjson.encode(value))
  return ngx.exit(status)
end

ngx.req.read_body()
local body = ngx.req.get_body_data()
if not body or #body > 512 then return respond(413, { error = "request_too_large", mutationIssued = false }) end
local input = cjson.decode(body)
if type(input) ~= "table" then return respond(400, { error = "invalid_request", mutationIssued = false }) end
for key in pairs(input) do
  if key ~= "mode" and key ~= "brightnessBySegment" then
    return respond(400, { error = "unsupported_field", mutationIssued = false })
  end
end

local mode = string.upper(tostring(input.mode or ""))
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

local effect = mode == "FOLLOW_MATRIX" and runtime.FOLLOW_EFFECT_ID or 0
local function make_segment(id, cap)
  if mode == "OFF" or cap == 0 then
    return { id = id, on = false, bri = 0, fx = 0, ix = 0 }
  end
  if mode == "FOLLOW_MATRIX" then
    return { id = id, on = true, bri = 255, fx = effect, ix = cap, col = {{255, 255, 255}} }
  end
  return { id = id, on = true, bri = cap, fx = 0, ix = cap, col = {{255, 255, 255}} }
end
local expected = {
  [1] = mode == "OFF" and { on = false, bri = 0, fx = 0, ix = 0 }
    or mode == "FOLLOW_MATRIX" and { on = true, bri = 255, fx = effect, ix = levels.main }
    or { on = levels.main > 0, bri = levels.main, fx = 0, ix = levels.main },
  [2] = mode == "OFF" and { on = false, bri = 0, fx = 0, ix = 0 }
    or mode == "FOLLOW_MATRIX" and { on = true, bri = 255, fx = effect, ix = levels.short }
    or { on = levels.short > 0, bri = levels.short, fx = 0, ix = levels.short },
}
local payload = cjson.encode({ seg = { make_segment(1, levels.main), make_segment(2, levels.short) } })
local response = ngx.location.capture("/__aux_uv_apply", { method = ngx.HTTP_POST, body = payload })
if not response or response.status ~= 200 then
  return respond(502, { error = "uv_device_response_unconfirmed", mutationIssued = "unknown" })
end
local readback, readback_error = runtime.decode_state(response.body)
if not readback then
  return respond(502, { error = readback_error or "uv_device_readback_unavailable", mutationIssued = "unknown" })
end
if not runtime.segment_matches(readback.segments[1], expected[1])
    or not runtime.segment_matches(readback.segments[2], expected[2]) then
  return respond(502, { error = "uv_device_readback_mismatch", mutationIssued = true })
end

return respond(200, {
  ok = true,
  action = "uv_policy",
  mutationIssued = true,
  mode = mode,
  requested = { main = levels.main, short = levels.short },
  acknowledgement = { transport = "local-opal-wled", acceptedByDevice = true, deviceReadback = true },
})
