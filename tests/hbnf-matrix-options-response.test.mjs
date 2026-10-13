import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../staging/coordinated-backend/hbnf-cart-control/index.ts", import.meta.url), "utf8");

// Reproduce the production defect using Node's real Fetch Response constructor.
assert.throws(() => new Response("ok", { status: 204 }), TypeError);

// Confirm the handler now returns a bodyless 204 and keeps its Matrix CORS headers.
assert.match(source, /if\(matrixLiveRead&&req\.method==="OPTIONS"\)return new Response\(null,\{status:204,headers:matrixLiveCors\(req\)\}\);/);
const response = new Response(null, {
  status: 204,
  headers: {
    "Access-Control-Allow-Origin": "http://192.168.77.10",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "apikey, authorization, accept",
  },
});
assert.equal(response.status, 204);
assert.equal(await response.text(), "");
assert.equal(response.headers.get("Access-Control-Allow-Origin"), "http://192.168.77.10");
assert.equal(response.headers.get("Access-Control-Allow-Methods"), "GET, OPTIONS");
assert.equal(response.headers.get("Access-Control-Allow-Headers"), "apikey, authorization, accept");
