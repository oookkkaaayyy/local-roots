import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalMatrixTransport, MATRIX_MAC, SUPPORTED_RELEASE} from '../staging/coordinated-backend/opal/mission-control-local/local-transport.js';
function harness() {
  const sockets=[];
  const tr = new LocalMatrixTransport({timeoutMs:110,socketFactory:url=>{
    const socket={url,readyState:0,sent:[],send(s){this.sent.push(s)},close(){this.readyState=3;this.onclose?.()}};
    sockets.push(socket); return socket;
  }});
  const open=(s)=>{s.readyState=1;s.onopen();};
  const state=(s,value={HBNF:{candidate:SUPPORTED_RELEASE,matrixBrightness:62},seg:[]})=>s.onmessage({data:JSON.stringify({state:value})});
  return {tr,sockets,open,state};
}
test('unexpected WS close must invalidate old snapshot before a new identity verification and socket open',async()=>{
 const f=harness(); f.tr.connect();const old=f.sockets[0];f.open(old);
 assert.equal(f.tr.verifyIdentity({mac:MATRIX_MAC}),true); f.state(old);assert.equal(f.tr.controlReady(),true);
 old.close();assert.equal(f.tr.controlReady(),false);
 assert.equal(f.tr.verifyIdentity({mac:MATRIX_MAC}),true);f.tr.connect();let fresh=f.sockets[1];f.open(fresh);
 assert.equal(f.tr.controlReady(),false,'old WS state must not confer new WS command capability before new WS state frame');
 const cmd=f.tr.command('TUNE',{matrixBrightness:70});await assert.rejects(cmd,/Fresh Matrix|not connected|superseded/);
 assert.equal(fresh.sent.filter(s=>s.includes('"matrixBrightness":70')).length,0);
 f.state(fresh);assert.equal(f.tr.controlReady(),true);f.tr.disconnect();
});
test('replacement can precede old socket close event and must reject queued command',async()=>{
 const f=harness();f.tr.connect();const old=f.sockets[0];f.open(old);
 assert.equal(f.tr.verifyIdentity({mac:MATRIX_MAC}),true);f.state(old);assert.equal(f.tr.controlReady(),true);
 const command=f.tr.command('TUNE',{matrixBrightness:79});
 old.readyState=3; // link lost; onclose event not yet delivered
 f.tr.connect();const current=f.sockets[1];f.open(current);
 await assert.rejects(command,/superseded by connection change|disconnected/);
 assert.equal(current.sent.filter(s=>s.includes('"matrixBrightness":79')).length,0);
 assert.equal(f.tr.controlReady(),false,'old state invalid during replacement before current socket fresh readback');
 old.onclose?.(); f.state(current);
 assert.equal(f.tr.controlReady(),true);f.tr.disconnect();
});

test('in-flight ACK waiters reject if socket replacement arrives before close callback', async () => {
  const f=harness();f.tr.connect();const old=f.sockets[0];f.open(old);
  assert.equal(f.tr.verifyIdentity({mac:MATRIX_MAC}),true);f.state(old);
  const inFlight=f.tr.command('TUNE',{matrixBrightness:93});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(old.sent.some(x=>x.includes('"matrixBrightness":93')),true);
  old.readyState=3;
  f.tr.connect();const fresh=f.sockets[1];f.open(fresh);
  await assert.rejects(inFlight,/replaced before state confirmation/);
  // A delayed message/close from the previous connection cannot be counted as an ACK.
  f.state(old,{HBNF:{candidate:SUPPORTED_RELEASE,matrixBrightness:93},seg:[]});
  old.onclose?.();
  assert.equal(f.tr.controlReady(),false);
  assert.equal(fresh.sent.some(x=>x.includes('"matrixBrightness":93')),false);
  f.state(fresh);
  assert.equal(f.tr.controlReady(),true);
  f.tr.disconnect();
});
