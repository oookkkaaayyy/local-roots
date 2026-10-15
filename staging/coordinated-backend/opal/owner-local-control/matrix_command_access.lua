-- Per-request authenticated, allowlisted HBNF command proxy for Matrix.
-- Only this gateway constructs the upstream WLED JSON body.
local auth = dofile("/etc/hbnf-local-control/lua/auth.lua")
if auth.owner_access() ~= true then return end

local cjson = require "cjson.safe"
local function reject(status, code)
  return auth.json_response(status, { error = code })
end
local function only_keys(value, allowed)
  if type(value) ~= "table" then return false end
  for key in pairs(value) do
    if type(key) ~= "string" or not allowed[key] then return false end
  end
  return true
end
local function integer(value, minimum, maximum)
  return type(value) == "number" and value == value and value % 1 == 0 and value >= minimum and value <= maximum
end
local function keys(...)
  local result = {}
  for i = 1, select("#", ...) do result[select(i, ...)] = true end
  return result
end
local function valid_array(value, maximum_length, item_check)
  if type(value) ~= "table" then return false end
  local count = 0
  for key, item in pairs(value) do
    if type(key) ~= "number" or key % 1 ~= 0 or key < 1 or key > maximum_length or not item_check(item) then return false end
    count = count + 1
  end
  return count > 0 and count == #value
end

ngx.req.read_body()
local body = ngx.req.get_body_data()
if not body or #body > 2048 then return reject(413, "request_too_large") end
local input = cjson.decode(body)
if not only_keys(input, { HBNF = true }) or not only_keys(input.HBNF, keys(
  "scene", "vibe", "matrixBrightness", "auxBrightness", "motion", "audioResponse", "palette", "overlay"
)) then return reject(400, "invalid_matrix_command") end

local source, output = input.HBNF, {}
for key, value in pairs(source) do
  if key == "scene" then
    if type(value) ~= "string" or not ({ ["course-flow"] = true, ["field-mix"] = true, ["hbnf-signature"] = true, ["quiet-cosmos"] = true })[value] then return reject(400, "invalid_scene") end
    output.scene = value
  elseif key == "vibe" then
    if not integer(value, 0, 5) then return reject(400, "invalid_vibe") end
    output.vibe = value
  elseif key == "matrixBrightness" or key == "auxBrightness" then
    if not integer(value, 0, 255) then return reject(400, "invalid_brightness") end
    output[key] = value
  elseif key == "motion" or key == "audioResponse" then
    if not integer(value, 0, 100) then return reject(400, "invalid_response_control") end
    output[key] = value
  elseif key == "palette" then
    if not only_keys(value, keys("mode", "index", "rgb", "id")) or type(value.mode) ~= "string" then return reject(400, "invalid_palette") end
    if value.mode == "wled" then
      if not only_keys(value, keys("mode", "index")) or not integer(value.index, 0, 255) then return reject(400, "invalid_palette") end
      output.palette = { mode = "wled", index = value.index }
    elseif value.mode == "solid" then
      if not only_keys(value, keys("mode", "rgb")) or not valid_array(value.rgb, 3, function(item) return integer(item, 0, 255) end) or #value.rgb ~= 3 then return reject(400, "invalid_palette") end
      output.palette = { mode = "solid", rgb = { value.rgb[1], value.rgb[2], value.rgb[3] } }
    elseif value.mode == "legacy" then
      if not only_keys(value, keys("mode", "id")) or type(value.id) ~= "string" or not ({ ["hbnf-balanced"] = true, copper = true, ocean = true })[value.id] then return reject(400, "invalid_palette") end
      output.palette = { mode = "legacy", id = value.id }
    else return reject(400, "invalid_palette") end
  elseif key == "overlay" then
    if value == cjson.null then
      output.overlay = cjson.null
    elseif type(value) == "table" then
      if value.kind == "text" then
        if not only_keys(value, keys("id", "kind", "ttlMs", "text", "color")) or
          type(value.id) ~= "string" or #value.id < 1 or #value.id > 39 or not value.id:match("^[%w_-]+$") or
          not integer(value.ttlMs, 1000, 30000) or type(value.text) ~= "string" or #value.text < 1 or #value.text > 63 or
          type(value.color) ~= "string" or not value.color:match("^#%x%x%x%x%x%x$") then return reject(400, "invalid_text_overlay") end
        output.overlay = { id = value.id, kind = "text", ttlMs = value.ttlMs, text = value.text, color = value.color:upper() }
      elseif value.kind == "scoreboard" then
        if not only_keys(value, keys("id", "kind", "ttlMs", "label", "entries")) or
          type(value.id) ~= "string" or #value.id < 1 or #value.id > 39 or not value.id:match("^[%w_-]+$") or
          not integer(value.ttlMs, 1000, 30000) or type(value.label) ~= "string" or
          not ({ F9 = true, B9 = true, GLOW = true, SCORES = true })[value.label] or
          not valid_array(value.entries, 12, function(item) return type(item) == "string" and #item >= 1 and #item <= 63 end) then return reject(400, "invalid_scoreboard_overlay") end
        local entries = {}
        for i = 1, #value.entries do entries[i] = value.entries[i] end
        output.overlay = { id = value.id, kind = "scoreboard", ttlMs = value.ttlMs, label = value.label, entries = entries }
      else return reject(400, "invalid_overlay_kind") end
    else return reject(400, "invalid_overlay") end
  else
    return reject(400, "unsupported_matrix_command")
  end
end
if next(output) == nil then return reject(400, "empty_matrix_command") end

local encoded = cjson.encode({ HBNF = output })
if type(encoded) ~= "string" or #encoded > 2048 then return reject(413, "request_too_large") end
ngx.var.hbnf_matrix_body = encoded
