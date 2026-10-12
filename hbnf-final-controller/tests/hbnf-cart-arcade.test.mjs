import test from "node:test";
import assert from "node:assert/strict";
import {createArcadeInputEmitter} from "../hbnf-cart-arcade.mjs";

test("controller emits monotonic, session-bound semantic input through canonical bridge",async()=>{
  const sent=[];
  const controller=createArcadeInputEmitter({submit:async payload=>{sent.push(payload);return {accepted:true};},session:{sessionId:"s1",controllerId:"owner-device",paired:true,role:"owner",lastSequence:4},clock:()=>1234});
  await controller.send("UP");await controller.send("PAUSE");
  assert.deepEqual(sent.map(x=>x.input),[
    {sessionId:"s1",controllerId:"owner-device",sequence:5,issuedAt:1234,action:"UP"},
    {sessionId:"s1",controllerId:"owner-device",sequence:6,issuedAt:1234,action:"PAUSE"}
  ]);
  assert.ok(sent.every(x=>x.action==="ARCADE_INPUT"));
});

test("controller adapter rejects guest, unpaired, invalid, and post-close input",async()=>{
  const base={submit:async()=>({accepted:true}),session:{sessionId:"s1",controllerId:"c1",paired:true,role:"owner"}};
  assert.throws(()=>createArcadeInputEmitter({...base,session:{...base.session,role:"guest"}}),/paired owner/);
  assert.throws(()=>createArcadeInputEmitter({...base,session:{...base.session,paired:false}}),/paired owner/);
  const controller=createArcadeInputEmitter(base);
  await assert.rejects(controller.send("RAW_HTTP"),/unsupported arcade action/);
  controller.close();await assert.rejects(controller.send("LEFT"),/session is closed/);
});
