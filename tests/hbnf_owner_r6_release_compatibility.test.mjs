import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LocalMatrixTransport, MATRIX_MAC, SUPPORTED_RELEASE,
  REVIEW_OWNER_SAFE_RELEASE, acceptedDirectRelease,
} from "../staging/coordinated-backend/opal/mission-control-local/local-transport.js";
import {
  LocalOwnerControl, LOCAL_MATRIX_RELEASE,
  LOCAL_MATRIX_OWNER_SAFE_REVIEW_RELEASE, acceptedOpalDirectRelease,
} from "../hbnf-final-controller/hbnf-cart-local.mjs";

const OLD = "hbnf-cart2-phase2-r6-skins-readable-20261014";
const NEXT = "hbnf-cart2-r6-owner-safe-tuning-persist-review-20261104";

test("firmware-only new marker is explicitly compatible with the review Owner transport, not with arbitrary firmware", () => {
  assert.equal(SUPPORTED_RELEASE, OLD);
  assert.equal(LOCAL_MATRIX_RELEASE, OLD);
  assert.equal(REVIEW_OWNER_SAFE_RELEASE, NEXT);
  assert.equal(LOCAL_MATRIX_OWNER_SAFE_REVIEW_RELEASE, NEXT);
  for (const release of [OLD, NEXT]) {
    assert.equal(acceptedDirectRelease(release), true);
    assert.equal(acceptedOpalDirectRelease(release), true);
  }
  for (const release of ["", null, undefined, "hbnf-cart2-r6-unknown", NEXT + "-unverified"]) {
    assert.equal(acceptedDirectRelease(release), false);
    assert.equal(acceptedOpalDirectRelease(release), false);
  }
});

test("new reviewed firmware accepts control only after fresh exact MAC and WS state, then fresh matching ACK", async () => {
  const sockets = [];
  const transport = new LocalMatrixTransport({
    timeoutMs: 200,
    socketFactory: url => {
      const ws = {url,readyState:0,sent:[],
        send(body){ this.sent.push(body); },
        close(){this.readyState=3;this.onclose?.();}
      };
      sockets.push(ws);
      return ws;
    }
  });
  transport.connect();
  const ws = sockets[0];
  ws.readyState = 1;
  ws.onopen();
  assert.equal(transport.controlReady(), false);
  assert.equal(transport.verifyIdentity({mac: "not-the-matrix"}), false);
  ws.onmessage({data: JSON.stringify({state:{HBNF:{candidate:NEXT,matrixBrightness:40},seg:[]}})});
  assert.equal(transport.controlReady(), false);
  assert.equal(transport.verifyIdentity({mac:MATRIX_MAC}), true);
  assert.equal(transport.controlReady(), true);
  const pending = transport.command("TUNE",{matrixBrightness:44});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ws.sent.filter(x=>x.includes('"matrixBrightness":44')).length,1);
  ws.onmessage({data: JSON.stringify({state:{HBNF:{candidate:NEXT,matrixBrightness:44},seg:[]}})});
  assert.equal((await pending).HBNF.matrixBrightness,44);
  transport.disconnect();
  assert.equal(transport.controlReady(),false);
});

test("stored OFF/ON brightness levels remain same-device AND same-release only", () => {
  let stored = null;
  const storage = {
    getItem(){return stored == null ? null : JSON.stringify(stored);},
    setItem(k,v){stored=JSON.parse(v);},
    removeItem(){stored=null},
  };
  const owner = new LocalOwnerControl({opalDirect:true,storage});
  const record = {mac:MATRIX_MAC,release:NEXT,matrixBrightness:55,auxBrightness:70};
  owner.transport = {snapshot:{HBNF:{candidate:NEXT}}};
  stored = {...record};
  assert.deepEqual(owner.directPowerRecord(), record);
  stored = {...record,release:OLD};
  assert.equal(owner.directPowerRecord(),null,"old firmware power record cannot be replayed after new firmware");
  stored = {...record,release:"unapproved-release"};
  assert.equal(owner.directPowerRecord(),null);
  stored = {...record,mac:"different"};
  assert.equal(owner.directPowerRecord(),null);
  owner.transport = {snapshot:{HBNF:{candidate:OLD}}};
  stored = {...record,release:OLD};
  assert.deepEqual(owner.directPowerRecord(), stored,"original installed R6 is preserved");
});

test("paired legacy route remains old-release guarded; direct path uses only exact whitelist and actual ACK release", () => {
  const src = readFileSync(new URL("../hbnf-final-controller/hbnf-cart-local.mjs",import.meta.url),"utf8");
  assert.match(src,/async waitForState[\s\S]*?if \(release && release !== LOCAL_MATRIX_RELEASE\)/);
  assert.match(src,/async waitForFreshState[\s\S]*?if \(release && !acceptedOpalDirectRelease\(release\)\)/);
  assert.match(src,/async connectOpalDirect[\s\S]*?if \(!acceptedOpalDirectRelease\(candidate\)\)/);
  assert.match(src,/release: h\.candidate,[\s\S]*?commandType = "TUNE"/);
  assert.match(src,/matrix: \{ confirmed: true, mac: LOCAL_MATRIX_MAC, release: state\.HBNF\.candidate/);
  assert.match(src,/local-transport\.js\?v=928db9ce9514e7f2/);
  assert.doesNotMatch(src,/new WebSocket\(|kmwan restart|mwan3 restart|STA_BRIDGE_OVERRIDE/);
});
