-- Authenticated local validator for the shared UV policy contract. The route
-- remains fail-closed until trusted local readiness evidence is available.
local auth = dofile("/etc/hbnf-local-control/lua/auth.lua")
if auth.owner_access(false) ~= true then return end

local cjson = require "cjson.safe"
local spec_file = io.open("/etc/hbnf-local-control/lua/uv_policy_spec.json", "r")
if not spec_file then
  return auth.json_response(503, { error = "local_uv_policy_spec_unavailable", mutationIssued = false })
end
local spec_body = spec_file:read(8192)
spec_file:close()
local spec = cjson.decode(spec_body or "")
if type(spec) ~= "table" or spec.schema ~= "hbnf-aux-uv-policy-spec-v1"
    or type(spec.modes) ~= "table" or type(spec.brightness) ~= "table"
    or type(spec.brightness.requiredChannels) ~= "table"
    or type(spec.requiredCommissioningGates) ~= "table"
    or type(spec.requiredRuntimeGates) ~= "table"
    or type(spec.channels) ~= "table"
    or type(spec.networkBoundary) ~= "table"
    or spec.networkBoundary.directWledRouteAllowed ~= false then
  return auth.json_response(503, { error = "local_uv_policy_spec_invalid", mutationIssued = false })
end
ngx.req.read_body()
local body = ngx.req.get_body_data()
if not body or #body > 512 then
  ngx.status = 413
  ngx.header.content_type = "application/json"
  ngx.say(cjson.encode({ error = "request_too_large", mutationIssued = false }))
  return ngx.exit(413)
end

local input = cjson.decode(body)
if type(input) ~= "table" then
  ngx.status = 400
  ngx.header.content_type = "application/json"
  ngx.say(cjson.encode({ error = "invalid_request", mutationIssued = false }))
  return ngx.exit(400)
end
for key in pairs(input) do
  if key ~= "mode" and key ~= "brightnessBySegment" then
    ngx.status = 400
    ngx.header.content_type = "application/json"
    ngx.say(cjson.encode({ error = "unsupported_field", mutationIssued = false }))
    return ngx.exit(400)
  end
end
local mode = input.mode
if mode == nil then mode = spec.defaultMode end
if type(mode) == "string" then mode = string.upper(mode) end
local levels = input.brightnessBySegment
local mode_allowed = false
for _, allowed in ipairs(spec.modes) do
  if mode == allowed then mode_allowed = true; break end
end
if not mode_allowed or type(levels) ~= "table" then
  ngx.status = 400
  ngx.header.content_type = "application/json"
  ngx.say(cjson.encode({ error = "invalid_policy", mutationIssued = false }))
  return ngx.exit(400)
end
local required = {}
for _, channel in ipairs(spec.brightness.requiredChannels) do required[channel] = true end
for key, value in pairs(levels) do
  if not required[key] or type(value) ~= "number" or value % 1 ~= 0
      or value < spec.brightness.minimum or value > spec.brightness.maximum then
    ngx.status = 400
    ngx.header.content_type = "application/json"
    ngx.say(cjson.encode({ error = "invalid_brightness_cap", mutationIssued = false }))
    return ngx.exit(400)
  end
end
for channel in pairs(required) do
  if levels[channel] == nil then
    ngx.status = 400
    ngx.header.content_type = "application/json"
    ngx.say(cjson.encode({ error = "incomplete_brightness_caps", mutationIssued = false }))
    return ngx.exit(400)
  end
end

-- Shared request contract validation now executes on Opal, but trusted local
-- commissioning, hardware, AUX identity/runtime and network-isolation state
-- are not available here. Never infer readiness or issue a WLED mutation.
ngx.status = 503
ngx.header.content_type = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say(cjson.encode({ error = "local_uv_policy_readiness_unverified", mutationIssued = false }))
return ngx.exit(503)
