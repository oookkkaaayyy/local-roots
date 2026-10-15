-- Authenticated, tightly allowlisted AUX state mutation for the paired owner.
local auth = dofile("/etc/hbnf-local-control/lua/auth.lua")
if auth.owner_access(false) ~= true then return end

local cjson = require "cjson.safe"
ngx.req.read_body()
local body = ngx.req.get_body_data()
if not body or #body > 512 then ngx.status = 413; return ngx.exit(413) end
local input = cjson.decode(body)
if type(input) ~= "table" then ngx.status = 400; return ngx.exit(400) end
local output = {}
for key, value in pairs(input) do
  if key == "bri" then
    if type(value) ~= "number" or value % 1 ~= 0 or value < 0 or value > 255 then ngx.status = 400; return ngx.exit(400) end
    output.bri = value
  elseif key == "on" then
    if type(value) ~= "boolean" then ngx.status = 400; return ngx.exit(400) end
    output.on = value
  else
    ngx.status = 400; return ngx.exit(400)
  end
end
if next(output) == nil then ngx.status = 400; return ngx.exit(400) end

-- Canonicalize before proxying; no caller-supplied headers or extra WLED
-- state fields are sent to the receiver.
ngx.var.hbnf_aux_body = cjson.encode(output)
