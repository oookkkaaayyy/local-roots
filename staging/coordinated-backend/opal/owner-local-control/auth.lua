-- HBNF Owner Local Control request authentication.
-- The only persistent credential material is the SHA-256 digest in the
-- session filename; raw paired tokens are never written or logged.
local cjson = require "cjson.safe"
local sha256 = require "resty.sha256"
local resty_string = require "resty.string"
local M = {}

local ORIGIN = "https://hbnightflyers.com"
local SESSION_DIR = "/etc/hbnf-local-control-state/sessions/"
local REVOKED_DIR = "/etc/hbnf-local-control-state/revoked/"
local MAX_SESSION_SECONDS = 180 * 24 * 60 * 60
local CACHE = ngx.shared.hbnf_owner_sessions
local RATE = ngx.shared.hbnf_owner_rate

local function response(status, code)
  ngx.status = status
  ngx.header["Content-Type"] = "application/json; charset=utf-8"
  ngx.header["Cache-Control"] = "no-store"
  ngx.say(cjson.encode({ error = code }))
  return ngx.exit(status)
end

local function token_hash(token)
  local digest = sha256:new()
  if not digest then return nil end
  if not digest:update(token) then return nil end
  local raw = digest:final()
  if type(raw) ~= "string" then return nil end
  return resty_string.to_hex(raw)
end

local function bearer_from_request(websocket)
  local headers = ngx.req.get_headers(32)
  if websocket then
    local offered = headers["sec-websocket-protocol"]
    if type(offered) ~= "string" or #offered > 160 then return nil end
    local found = nil
    for part in offered:gmatch("[^,]+") do
      local name, value = part:match("^%s*([%w%._-]+)%s*$"), nil
      if name then value = name:match("^hbnf%-owner%-v1%.([a-fA-F0-9]+)$") end
      if not value then return nil end
      if value then
        if found then return nil end
        found = value
      end
    end
    return found
  end
  local token = headers["x-hbnf-device"]
  if type(token) ~= "string" or #token ~= 64 or not token:match("^[a-fA-F0-9]+$") then return nil end
  return token
end

local function session_expiry(hash)
  local now = ngx.time()
  local revoked = CACHE and CACHE:get("revoked:" .. hash)
  if revoked then return nil, "revoked" end
  local revoked_file = io.open(REVOKED_DIR .. hash .. ".exp", "r")
  if revoked_file then
    local revoked_until = tonumber(revoked_file:read(24))
    revoked_file:close()
    if revoked_until and revoked_until > now then
      if CACHE then CACHE:set("revoked:" .. hash, 1, revoked_until - now) end
      return nil, "revoked"
    end
    os.remove(REVOKED_DIR .. hash .. ".exp")
  end
  local cached = CACHE and CACHE:get(hash)
  if cached then
    if cached > now then return cached end
    CACHE:delete(hash)
  end
  local file = io.open(SESSION_DIR .. hash .. ".exp", "r")
  if not file then return nil, "missing" end
  local value = file:read(24)
  file:close()
  local expiry = tonumber(value)
  if not expiry or expiry % 1 ~= 0 or expiry <= now or expiry > now + MAX_SESSION_SECONDS then
    os.remove(SESSION_DIR .. hash .. ".exp")
    return nil, "expired"
  end
  if CACHE then CACHE:set(hash, expiry, expiry - now) end
  return expiry, "active"
end

local function request_rate(key, max_hits, window_seconds)
  if not RATE then return false end
  local count, err = RATE:incr(key, 1, 0, window_seconds)
  if not count then return false end
  return count <= max_hits
end

function M.origin_required()
  local headers = ngx.req.get_headers(16)
  if headers.origin ~= ORIGIN then return response(403, "owner_origin_required") end
  return true
end

function M.require_owner(websocket)
  if M.origin_required() ~= true then return end
  local token = bearer_from_request(websocket == true)
  if not token then return response(401, "paired_owner_required") end
  local hash = token_hash(token)
  if not hash then return response(503, "secure_hash_unavailable") end
  local expiry = session_expiry(hash)
  if not expiry then return response(401, "owner_session_expired_or_revoked") end
  local remote = ngx.var.remote_addr or "unknown"
  local key = (websocket and "ws:" or "http:") .. remote
  if not request_rate(key, websocket and 20 or 120, 60) then return response(429, "owner_rate_limited") end
  ngx.ctx.hbnf_owner_hash = hash
  ngx.ctx.hbnf_owner_expiry = expiry
  ngx.var.hbnf_owner_token = token
  if websocket then
    -- The browser requires the server to select one offered subprotocol.
    -- WLED does not negotiate one, so the TLS gateway returns this value
    -- itself while stripping the credential before proxying upstream.
    ngx.var.hbnf_ws_protocol = "hbnf-owner-v1." .. token:lower()
  end
  return true
end

function M.read_expiry(token)
  if type(token) ~= "string" or #token ~= 64 or not token:match("^[a-fA-F0-9]+$") then return nil end
  local hash = token_hash(token)
  if not hash then return nil end
  local expiry, reason = session_expiry(hash)
  return expiry, hash, reason
end

function M.persist(token, expiry)
  if type(token) ~= "string" or #token ~= 64 or not token:match("^[a-fA-F0-9]+$") then return nil, "invalid_token" end
  local now = ngx.time()
  if type(expiry) ~= "number" or expiry % 1 ~= 0 or expiry <= now or expiry > now + MAX_SESSION_SECONDS then return nil, "invalid_expiry" end
  local hash = token_hash(token)
  if not hash then return nil, "secure_hash_unavailable" end
  local _, reason = session_expiry(hash)
  if reason == "revoked" then return nil, "session_revoked" end
  local temp = SESSION_DIR .. "." .. hash .. "." .. tostring(math.floor(ngx.now() * 1000)) .. ".tmp"
  local file, err = io.open(temp, "w")
  if not file then return nil, "session_store_unavailable" end
  file:write(tostring(expiry), "\n")
  file:close()
  if not os.rename(temp, SESSION_DIR .. hash .. ".exp") then
    os.remove(temp)
    return nil, "session_store_unavailable"
  end
  if CACHE then CACHE:set(hash, expiry, expiry - now) end
  return hash
end

function M.revoke(token)
  if type(token) ~= "string" or #token ~= 64 or not token:match("^[a-fA-F0-9]+$") then return false end
  local hash = token_hash(token)
  if not hash then return false end
  local expiry = session_expiry(hash)
  if not expiry or expiry <= ngx.time() then expiry = ngx.time() + MAX_SESSION_SECONDS end
  local temp = REVOKED_DIR .. "." .. hash .. "." .. tostring(math.floor(ngx.now() * 1000)) .. ".tmp"
  local file = io.open(temp, "w")
  if not file then return false end
  file:write(tostring(expiry), "\n")
  file:close()
  if not os.rename(temp, REVOKED_DIR .. hash .. ".exp") then os.remove(temp); return false end
  if CACHE then CACHE:delete(hash) end
  os.remove(SESSION_DIR .. hash .. ".exp")
  if CACHE then CACHE:set("revoked:" .. hash, 1, expiry - ngx.time()) end
  return true
end

function M.json_response(status, body)
  ngx.status = status
  ngx.header["Content-Type"] = "application/json; charset=utf-8"
  ngx.header["Cache-Control"] = "no-store"
  ngx.say(cjson.encode(body))
  return ngx.exit(status)
end

function M.token_from_request()
  return bearer_from_request(false)
end

function M.owner_access(websocket)
  return M.require_owner(websocket == true)
end

return M
