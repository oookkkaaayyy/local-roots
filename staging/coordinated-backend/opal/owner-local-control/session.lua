local auth = dofile("/etc/hbnf-local-control/lua/auth.lua")
local token = auth.token_from_request()
local expiry, hash, reason
if token then expiry, hash, reason = auth.read_expiry(token) end
if not expiry then
  if reason == "missing" then return auth.json_response(404, { error = "owner_session_not_enrolled" }) end
  return auth.json_response(401, { error = "owner_session_expired_or_revoked" })
end
return auth.json_response(200, { authenticated = true, expiresAt = expiry })
