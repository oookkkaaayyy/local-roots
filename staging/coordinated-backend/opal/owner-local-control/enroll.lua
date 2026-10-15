local cjson = require "cjson.safe"
local auth = dofile("/etc/hbnf-local-control/lua/auth.lua")
if auth.origin_required() ~= true then return end
local token = auth.token_from_request()
if not token then return auth.json_response(401, { error = "paired_owner_required" }) end
-- The internal Supabase request uses this value only as its credential. The
-- bearer stays on Opal and is never forwarded to either WLED controller.
ngx.var.hbnf_owner_token = token
ngx.req.read_body()
local body = ngx.req.get_body_data()
if not body or #body > 512 then return auth.json_response(413, { error = "request_too_large" }) end
local input = cjson.decode(body)
if type(input) ~= "table" or input.action ~= "enroll" then
  return auth.json_response(400, { error = "invalid_enrollment" })
end
local validation = ngx.location.capture("/__validate_paired_owner", {
  method = ngx.HTTP_POST,
  vars = { hbnf_owner_token = token },
})
if not validation or validation.status ~= 200 then return auth.json_response(401, { error = "cloud_pair_validation_failed" }) end
local verified = cjson.decode(validation.body or "")
if type(verified) ~= "table" or verified.paired ~= true then
  return auth.json_response(401, { error = "cloud_pair_validation_failed" })
end
-- Never accept expiry from the browser. The trusted pairing verifier must
-- return the exact server-side paired-device expiry as Unix seconds.
local expiry = verified.expiresAtEpoch
if type(expiry) ~= "number" or expiry % 1 ~= 0 or expiry <= ngx.time() or expiry > ngx.time() + 180 * 24 * 60 * 60 then
  return auth.json_response(503, { error = "authoritative_pair_expiry_unavailable" })
end
local _, err = auth.persist(token, expiry)
if err then return auth.json_response(503, { error = err }) end
return auth.json_response(200, { enrolled = true, expiresAt = expiry })
