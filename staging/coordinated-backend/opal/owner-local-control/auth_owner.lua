-- The private Cart PWA may use UV readiness and the existing bounded UV
-- controller without Owner pairing. Scope this exception to the exact local
-- origin and the two UV-only routes; every other route keeps Owner auth.
local origin = ngx.var.http_origin or ""
local uri = ngx.var.uri or ""
if origin == "http://192.168.77.1"
    and (uri == "/api/aux/uv-status" or uri == "/api/aux/uv-policy") then
  return
end

local auth = dofile("/etc/hbnf-local-control/lua/auth.lua")
auth.owner_access(false)
