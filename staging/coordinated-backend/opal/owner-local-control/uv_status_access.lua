-- Authenticated status endpoint. Readiness is unavailable until trusted local
-- commissioning evidence exists; this handler can never issue a mutation.
local auth = dofile("/etc/hbnf-local-control/lua/auth.lua")
if auth.owner_access(false) ~= true then return end

local cjson = require "cjson.safe"
ngx.status = 200
ngx.header.content_type = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say(cjson.encode({
  available = false,
  uvControlEnabled = false,
  mutationIssued = false,
  reason = "local_uv_readiness_unverified"
}))
return ngx.exit(200)
