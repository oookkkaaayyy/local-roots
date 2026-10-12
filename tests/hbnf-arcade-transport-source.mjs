import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";

const firmware="firmware/phase2/integration-r6-f89-compact-font/usermod/usermod_hbnf_foundation_v1.cpp";
const protocol="firmware/phase2/integration-r6-f89-compact-font/usermod/hbnf_arcade_session_protocol.h";
const source=fs.readFileSync(firmware,"utf8"),session=fs.readFileSync(protocol,"utf8");

test("pinned firmware exposes the generated browser modules and one bounded local game endpoint",()=>{
  execFileSync("python3",["scripts/hbnf_generate_arcade_assets.py","--check"]);
  for(const route of ["/hbnf/arcade/","/hbnf/arcade/app.mjs","/hbnf/arcade/modules/arcade-controller.mjs","/hbnf/arcade/modules/snake-runtime.mjs","/hbnf/arcade/modules/maze-chase-runtime.mjs"])
    assert.ok(source.includes(`server.on("${route}"`),`missing ${route}`);
  assert.match(source,/AsyncCallbackJsonWebHandler\* arcadeHandler=new AsyncCallbackJsonWebHandler\("\/hbnf\/game"/);
  assert.match(source,/arcadeHandler->setMaxContentLength\(2048\)/);
  assert.match(source,/hbnfArcadeSameOrigin\(request\)/);
});

test("game session fails closed without the configured owner PIN and binds guest permissions",()=>{
  assert.match(source,/strnlen\(settingsPIN,5\)!=4/);
  assert.match(source,/HBNF_ARCADE_GUEST_PLAY_ENABLED=false/);
  assert.match(source,/guest_play_disabled_for_provisional_test/);
  assert.match(source,/if\(!HBNF_ARCADE_GUEST_PLAY_ENABLED\)/);
  assert.match(source,/HBNF_ARCADE_START_LIMIT=5/);
  assert.match(session,/authenticate\(s,sessionId,token,controllerId\)/);
  assert.match(session,/role == Role::GUEST && action != Action::UP/);
  assert.match(session,/sequence <= last/);
  assert.match(session,/kInputIntervalMs/);
  assert.match(session,/kFrameIntervalMs/);
  assert.match(session,/kHeartbeatIntervalMs/);
  assert.match(session,/kGuestLeaseMs/);
  assert.match(session,/kOwnerLeaseMs/);
});

test("provisional browser exposes owner-only play and no guest invite/join flow",()=>{
  const html=fs.readFileSync("firmware/phase2/integration-r6-f89-compact-font/arcade-ui/index.html","utf8");
  const app=fs.readFileSync("firmware/phase2/integration-r6-f89-compact-font/arcade-ui/app.mjs","utf8");
  assert.match(html,/Owner-only provisional test\. Guest play is disabled\./);
  assert.doesNotMatch(html,/Join as a guest|Owner invite code|Create guest invite|Join game/);
  assert.doesNotMatch(app,/op:"guest_check"|op:"grant_guest"/);
  assert.match(app,/Owner-only session active\. Guest play is disabled\./);
});

test("game frame enters the same canonical Matrix image consumed by the 22-pixel AUX renderer",()=>{
  assert.match(source,/hbnfArcadeCopyFrame\(gameFrame\)/);
  assert.match(source,/canonicalMatrixPixels\[i\]=canonical/);
  assert.match(source,/canonicalMatrixFrame=f\.frame;canonicalMatrixValid=true/);
  assert.match(source,/renderCompanion22\(f,\[\]\(const CanonicalFrame& frame,uint16_t x,uint16_t y\)/);
  assert.match(source,/canonicalMatrixFrame==frame\.frame\?canonicalMatrixPixels/);
  assert.match(source,/hbnfArcadeExpire\(millis\(\)\)/);
});

test("browser uses local touch controls and does not stream pixels through native WLED DDP/WebSocket",()=>{
  const html=fs.readFileSync("firmware/phase2/integration-r6-f89-compact-font/arcade-ui/index.html","utf8");
  const app=fs.readFileSync("firmware/phase2/integration-r6-f89-compact-font/arcade-ui/app.mjs","utf8");
  assert.match(html,/data-dir="UP"/);assert.match(html,/data-dir="LEFT"/);assert.match(html,/data-dir="DOWN"/);assert.match(html,/data-dir="RIGHT"/);
  assert.match(app,/rgb888ToRgb565LE\(ownerState\.frame\)/);
  assert.match(app,/\/hbnf\/game/);
  assert.doesNotMatch(app,/new WebSocket|ddp|setRealtimePixel/i);
});
