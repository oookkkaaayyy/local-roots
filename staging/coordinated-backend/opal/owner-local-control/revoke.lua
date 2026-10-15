local cjson = require "cjson.safe"
local auth = dofile("/etc/hbnf-local-control/lua/auth.lua")
if auth.origin_required() ~= true then return end
ngx.req.read_body()
local body = ngx.req.get_body_data()
if not body or #body > 512 then return auth.json_response(413, { error = "request_too_large" }) end
local input = cjson.decode(body)
local token = auth.token_from_request()
if type(input) ~= "table" or input.action ~= "revoke" or not token then
  return auth.json_response(400, { error = "invalid_revocation" })
end
if not auth.revoke(token) then return auth.json_response(503, { error = "revocation_store_unavailable" }) end
return auth.json_response(200, { revoked = true, scope = "this_opal" })
