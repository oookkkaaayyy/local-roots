-- Authenticated placeholder for the canonical local UV policy endpoint.
-- OpenResty on the verified Opal image cannot load the repository's Deno
-- policy module. Fail closed until a reviewed compatible runtime is present.
local auth = dofile("/etc/hbnf-local-control/lua/auth.lua")
if auth.owner_access(false) ~= true then return end

local cjson = require "cjson.safe"
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
local levels = input.brightnessBySegment
if (mode ~= "OFF" and mode ~= "MANUAL" and mode ~= "FOLLOW_MATRIX") or type(levels) ~= "table" then
  ngx.status = 400
  ngx.header.content_type = "application/json"
  ngx.say(cjson.encode({ error = "invalid_policy", mutationIssued = false }))
  return ngx.exit(400)
end
for key, value in pairs(levels) do
  if (key ~= "main" and key ~= "short") or type(value) ~= "number" or value % 1 ~= 0 or value < 0 or value > 255 then
    ngx.status = 400
    ngx.header.content_type = "application/json"
    ngx.say(cjson.encode({ error = "invalid_brightness_cap", mutationIssued = false }))
    return ngx.exit(400)
  end
end
if levels.main == nil or levels.short == nil then
  ngx.status = 400
  ngx.header.content_type = "application/json"
  ngx.say(cjson.encode({ error = "incomplete_brightness_caps", mutationIssued = false }))
  return ngx.exit(400)
end

-- No WLED proxy or command is issued here. The canonical shared UV policy
-- currently runs in Deno and the installed Opal runtime is Lua/OpenResty.
ngx.status = 503
ngx.header.content_type = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say(cjson.encode({ error = "local_uv_policy_runtime_unavailable", mutationIssued = false }))
return ngx.exit(503)
