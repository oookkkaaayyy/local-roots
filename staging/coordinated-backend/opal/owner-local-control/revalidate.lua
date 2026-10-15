local cjson = require "cjson.safe"
local auth = dofile("/etc/hbnf-local-control/lua/auth.lua")
if auth.origin_required() ~= true then return end
local token = auth.token_from_request()
if not token then return auth.json_response(401, { error = "paired_owner_required" }) end
local expiry = auth.read_expiry(token)
if not expiry then return auth.json_response(401, { error = "owner_session_expired_or_revoked" }) end
ngx.var.hbnf_owner_token = token
local validation = ngx.location.capture("/__validate_paired_owner", {
  method = ngx.HTTP_POST,
  vars = { hbnf_owner_token = token },
})
if validation and validation.status == 401 then
  auth.revoke(token)
  return auth.json_response(401, { error = "cloud_pairing_revoked" })
end
if validation and validation.status == 200 then
  local verified = cjson.decode(validation.body or "")
  if type(verified) ~= "table" or verified.paired ~= true then
    auth.revoke(token)
    return auth.json_response(401, { error = "cloud_pairing_revoked" })
  end
  return auth.json_response(200, { authenticated = true, cloudValidated = true, expiresAt = expiry })
end
-- WAN/Supabase outages must not disable a still-valid local Owner session.
-- Non-5xx protocol/client errors fail closed instead of treating misrouting as
-- an offline condition.
if validation and validation.status < 500 then
  return auth.json_response(503, { error = "cloud_pair_validation_unavailable" })
end
return auth.json_response(200, { authenticated = true, cloudValidated = false, expiresAt = expiry })
