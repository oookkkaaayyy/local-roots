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

-- A paired Owner can verify one output before the full commissioning profile
-- is accepted. The pulse is auto-cleared after three seconds; normal UV writes
-- below continue to require every profile and acceptance gate.
if mode == "COMMISSIONING_TEST" then
  for key in pairs(input) do
    if key ~= "mode" and key ~= "channel" and key ~= "brightness" then
      return respond(400, { error = "unsupported_field", mutationIssued = false })
    end
  end
  local channel, brightness = input.channel, input.brightness
  if (channel ~= "main" and channel ~= "short") or type(brightness) ~= "number"
      or brightness % 1 ~= 0 or brightness < 1 or brightness > 255 then
    return respond(400, { error = "invalid_commissioning_test", mutationIssued = false })
  end
  local current, readiness_error = runtime.read_state()
  if not current then return respond(503, { error = readiness_error, mutationIssued = false }) end
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
    return respond(429, { error = "uv_commissioning_test_in_progress", mutationIssued = false })
  end
  local function unlock() rate:delete("uv_policy_lock") end
  local selected = channel == "main" and 1 or 2
  local function segment(id, on, bri)
    if not on then return { id = id, on = false, bri = 0, fx = 0, ix = 0 } end
    return { id = id, on = true, bri = bri, fx = 0, ix = bri, col = {{0, 0, 0, 255}} }
  end
  local function apply_and_read(segments)
    local result = ngx.location.capture("/__aux_uv_apply", { method = ngx.HTTP_POST,
      body = cjson.encode({ seg = segments }) })
    if not result then return nil, "wled_apply_no_response" end
    if result.status ~= 200 then return nil, "wled_apply_http_" .. tostring(result.status) end
    -- WLED's POST reply is an acknowledgement, not the full /json/state
    -- document. Confirm the write with the separate internal GET route.
    local state, state_error = runtime.read_state()
    if not state then return nil, "wled_state_" .. tostring(state_error or "unavailable") end
    return state
  end
  local pulse = {
    segment(1, selected == 1, selected == 1 and brightness or 0),
    segment(2, selected == 2, selected == 2 and brightness or 0),
  }
  local on_ok, applied, on_error = pcall(apply_and_read, pulse)
  local on_confirmed = false
  if on_ok and applied then
    local match_ok, selected_matches = pcall(runtime.segment_matches, applied.segments[selected], {
      on = true, bri = brightness, fx = 0, ix = brightness, col = {0, 0, 0, 255} })
    local other = applied.segments[selected == 1 and 2 or 1]
    on_confirmed = match_ok and selected_matches and other ~= nil and other.on ~= true
    if not match_ok then on_error = "wled_state_match_error" end
    if match_ok and not selected_matches then on_error = "wled_selected_segment_mismatch" end
    if not other then on_error = "wled_other_segment_missing" end
    if other and other.on == true then on_error = "wled_other_segment_on" end
  end
  if on_confirmed then ngx.sleep(3) end
  -- Always issue a best-effort OFF after any attempted pulse, including an
  -- ambiguous ON acknowledgement. Never leave the lock held on Lua errors.
  local off_ok, off, off_error = pcall(apply_and_read, { segment(1, false, 0), segment(2, false, 0) })
  unlock()
  local off_confirmed = off_ok and off ~= nil and off.segments[1] ~= nil and off.segments[2] ~= nil
    and off.segments[1].on ~= true and off.segments[2].on ~= true
  if not on_confirmed then
    return respond(502, { error = "uv_commissioning_test_on_unconfirmed",
      mutationIssued = "unknown", outputOffConfirmed = off_confirmed,
      diagnosis = { on = on_error or (on_ok and "wled_state_unconfirmed" or ("wled_apply_exception: " .. tostring(applied))),
        off = off_error or (off_ok and "wled_state_unconfirmed" or ("wled_apply_exception: " .. tostring(off))) } })
  end
  if not off_confirmed then
    return respond(502, { error = "uv_commissioning_test_off_unconfirmed", mutationIssued = true,
      diagnosis = { off = off_error or (off_ok and "wled_state_unconfirmed" or ("wled_apply_exception: " .. tostring(off))) } })
  end
  return respond(200, { ok = true, action = "uv_commissioning_test", channel = channel,
    requestedBrightness = brightness, pulseSeconds = 3, mutationIssued = true,
    outputOffConfirmed = true, deviceReadback = true })
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
local capture_ok, response = pcall(ngx.location.capture, "/__aux_uv_apply", { method = ngx.HTTP_POST, body = payload })
if not capture_ok then rate:delete("uv_policy_lock") end
if not capture_ok then return respond(502, { error = "uv_device_response_unconfirmed", mutationIssued = "unknown" }) end
if not response or response.status ~= 200 then
  rate:delete("uv_policy_lock")
  return respond(502, { error = "uv_device_response_unconfirmed", mutationIssued = "unknown" })
end
local readback, readback_error = runtime.decode_state(response.body)
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
