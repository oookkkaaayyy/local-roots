import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {createServer} from "node:http";
import {once} from "node:events";
import {isMatrixLiveReadPath,MATRIX_LIVE_READ_PATH} from "../staging/coordinated-backend/hbnf-cart-control/live.ts";

const path=process.env.HBNF_MATRIX_CONFIG_PATH;
assert.ok(path,"Set HBNF_MATRIX_CONFIG_PATH to the existing hosted config.js source under test");
const source=fs.readFileSync(path,"utf8");
function loadFor(hostname){
  const window={location:{hostname}};
  vm.runInNewContext(source,{window});
  return window.APP_CONFIG;
}

const site=loadFor("hbnightflyers.com");
const matrix=loadFor("192.168.77.10");
assert.equal(site.SUPABASE_URL,"https://phcpbvuqibyarpfrftgx.supabase.co","website scoring keeps its existing Supabase API base");
assert.equal(matrix.SUPABASE_URL,"https://phcpbvuqibyarpfrftgx.supabase.co/functions/v1/hbnf-cart-control","Matrix receives only the function-specific API base");
assert.equal(matrix.SUPABASE_ANON_KEY,site.SUPABASE_ANON_KEY,"existing public key is preserved exactly across host selection");

// Model the browser's unchanged suffix and Supabase's /functions/v1 gateway
// removal. Supabase documents that the function-name prefix remains visible
// to the Edge Function handler.
const browserUrl=new URL(`${matrix.SUPABASE_URL}/rest/v1/league_state?select=state_json,updated_at&id=eq.1`);
const edgeHandlerPath=browserUrl.pathname.replace(/^\/functions\/v1/,"");
assert.equal(edgeHandlerPath,MATRIX_LIVE_READ_PATH);
assert.equal(isMatrixLiveReadPath(edgeHandlerPath),true);
assert.equal(isMatrixLiveReadPath("/rest/v1/league_state"),false);

const server=createServer((req,res)=>{
  const routed=new URL(req.url,"http://127.0.0.1");
  if(req.method!=="GET"||!isMatrixLiveReadPath(routed.pathname)){res.writeHead(404).end();return;}
  res.writeHead(200,{"content-type":"application/json"}).end(JSON.stringify({handlerPath:routed.pathname,query:routed.search}));
});
server.listen(0,"127.0.0.1");
await once(server,"listening");
try{
  const address=server.address();
  const routed=await fetch(`http://127.0.0.1:${address.port}${edgeHandlerPath}${browserUrl.search}`);
  assert.equal(routed.status,200,"the HTTP router dispatches the complete function-prefixed path");
  assert.deepEqual(await routed.json(),{handlerPath:MATRIX_LIVE_READ_PATH,query:browserUrl.search});
  const oldPath=await fetch(`http://127.0.0.1:${address.port}/rest/v1/league_state${browserUrl.search}`);
  assert.equal(oldPath.status,404,"the previous unprefixed route no longer dispatches");
}finally{server.close();}
console.log("Matrix live config/routing PASS: website base preserved; Matrix URL resolves to the function-prefixed Edge handler route.");
