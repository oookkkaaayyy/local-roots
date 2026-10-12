import test from "node:test";
import assert from "node:assert/strict";
import {validateArcadeInput} from "../hbnf-cart-core/domain/arcade-input.mjs";
import {arcadeExitRestore,createArcadeSession,transitionArcadeSession} from "../hbnf-cart-core/domain/arcade-runtime.mjs";
import {createMazeChaseGame,mazeChaseFrame,steerMazeChase,tickMazeChase} from "../hbnf-cart-core/domain/maze-chase-runtime.mjs";
import {createSnakeGame,snakeFrame,steerSnake,tickSnake} from "../hbnf-cart-core/domain/snake-runtime.mjs";
import {applyArcadeControllerInput,applyAuthenticatedArcadeAction,createAuthorizedArcadeGame,rgb888ToRgb565LE,tickArcadeGame} from "../hbnf-cart-core/domain/arcade-controller.mjs";

test("input gate rejects unpaired/guest, wrong-session, stale, and replayed commands",()=>{
  const context={active:true,sessionId:"s1",controllerId:"c1",paired:true,role:"owner",lastSequence:7};
  const input={sessionId:"s1",controllerId:"c1",sequence:8,issuedAt:10000,action:"LEFT"};
  assert.equal(validateArcadeInput(input,context,10000).ok,true);
  assert.equal(validateArcadeInput({...input,sequence:7},context,10000).reason,"replayed_or_invalid_sequence");
  assert.equal(validateArcadeInput({...input,sessionId:"old"},context,10000).reason,"session_mismatch");
  assert.equal(validateArcadeInput({...input,issuedAt:7000},context,10000).reason,"stale_input");
  assert.equal(validateArcadeInput(input,{...context,role:"guest"},10000).reason,"controller_not_authorized");
  assert.equal(validateArcadeInput(input,{...context,paired:false},10000).reason,"controller_not_authorized");
  assert.equal(validateArcadeInput(input,{...context,lastSequence:undefined},10000).reason,"sequence_context_invalid");
  assert.equal(validateArcadeInput(input,{...context,lastSequence:-1},10000).reason,"sequence_context_invalid");
});

test("arcade lifecycle restores the exact normal-state snapshot on clean exit",()=>{
  const snapshot={brightness:66,vibe:5,palette:"ocean",motion:42};
  let session=createArcadeSession({gameId:"snake",sessionId:"s1",snapshot,now:1});
  session=transitionArcadeSession(session,"PLAY",2);
  session=transitionArcadeSession(session,"PAUSE",3);
  session=transitionArcadeSession(session,"PLAY",4);
  session=transitionArcadeSession(session,"EXIT",5);
  snapshot.brightness=0;
  assert.deepEqual(arcadeExitRestore(session),{brightness:66,vibe:5,palette:"ocean",motion:42});
  assert.throws(()=>transitionArcadeSession(session,"PLAY"),/invalid arcade transition/);
});

test("Snake has a 32x16 executable board, rejects instant reversal, grows and scores",()=>{
  let game=createSnakeGame({seed:123});
  game={...game,food:{x:9,y:8}};
  game=steerSnake(game,"LEFT");
  assert.equal(game.queuedDirection,"RIGHT");
  assert.equal(snakeFrame(game).length,512);
  game=tickSnake(game);
  assert.equal(game.score,1);
  assert.equal(game.snake.length,4);
});

test("Maze Chase has a deterministic 32x16 board, pellets, movement, and no wall traversal",()=>{
  let game=createMazeChaseGame();
  assert.equal(game.walls.length,512);
  assert.equal(game.pellets.reduce((a,b)=>a+b,0)>0,true);
  const reachable=new Set([game.player.y*game.width+game.player.x]),queue=[...reachable];
  for(let i=0;i<queue.length;i++){
    const cell=queue[i],x=cell%game.width,y=Math.floor(cell/game.width);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,ny=y+dy,next=ny*game.width+nx;
      if(nx>0&&nx<game.width-1&&ny>0&&ny<game.height-1&&!game.walls[next]&&!reachable.has(next)){reachable.add(next);queue.push(next);}
    }
  }
  for(let i=0;i<game.pellets.length;i++)if(game.pellets[i])assert.equal(reachable.has(i),true,"every pellet must be reachable");
  assert.equal(mazeChaseFrame(game).length,512);
  const before={...game.player};
  game=steerMazeChase(game,"LEFT"); // opposite input is ignored
  assert.equal(game.queuedDirection,"RIGHT");
  game=tickMazeChase(game);
  assert.notDeepEqual(game.player,before);
  for(let i=0;i<500&&["READY","PLAY"].includes(game.status);i++)game=tickMazeChase(game);
  assert.equal(game.walls.length,512);
  assert.equal(game.player.x>0&&game.player.x<31&&game.player.y>0&&game.player.y<15,true);
});

test("authorized Snake controller input advances through a real 32x16 RGB frame and restores on exit",()=>{
  const controller={active:true,paired:true,role:"owner",controllerId:"owner-ipad"};
  const snapshot={brightness:66,auxBrightness:68,vibe:5,motion:42};
  let state=createAuthorizedArcadeGame({gameId:"snake",sessionId:"snake-session",controller,snapshot,seed:7,now:1000});
  const original=Array.from(state.frame);
  assert.equal(state.frame.length,32*16*3);
  assert.throws(()=>createAuthorizedArcadeGame({gameId:"snake",sessionId:"bad",controller:{...controller,role:"guest"},snapshot}),/authorized_paired_owner_controller_required/);
  const send=(sequence,action,at=1100)=>applyArcadeControllerInput(state,{sessionId:"snake-session",controllerId:"owner-ipad",sequence,action,issuedAt:at},at);
  let result=send(1,"PRIMARY");assert.equal(result.ok,true);state=result.state;
  result=send(2,"UP",1200);assert.equal(result.ok,true);state=result.state;
  state=tickArcadeGame(state);
  assert.notDeepEqual(Array.from(state.frame),original,"accepted input and game tick must change the rendered pixels");
  assert.equal(state.frame.length,1536);
  assert.equal(send(2,"LEFT",1201).reason,"replayed_or_invalid_sequence");
  result=send(3,"PAUSE",1300);assert.equal(result.ok,true);state=result.state;
  assert.equal(tickArcadeGame(state),state,"paused games do not advance");
  result=send(4,"PAUSE",1400);assert.equal(result.ok,true);state=result.state;
  result=send(5,"SECONDARY",1500);assert.equal(result.ok,true);state=result.state;
  result=send(6,"EXIT",1600);assert.equal(result.ok,true);
  assert.deepEqual(result.restoredSnapshot,snapshot);
  assert.equal(result.frame,null);
  assert.equal(applyArcadeControllerInput(result.state,{sessionId:"snake-session",controllerId:"owner-ipad",sequence:7,action:"UP",issuedAt:1700},1700).reason,"session_inactive");
});

test("Maze Chase controller path renders wall, pellet, player, and enemy RGB cells",()=>{
  const controller={active:true,paired:true,role:"owner",controllerId:"phone-1"};
  let state=createAuthorizedArcadeGame({gameId:"maze-chase",sessionId:"maze-session",controller,snapshot:{vibe:3},now:1});
  assert.equal(state.frame.length,1536);
  const before=Array.from(state.frame);
  let result=applyArcadeControllerInput(state,{sessionId:"maze-session",controllerId:"phone-1",sequence:1,action:"PRIMARY",issuedAt:2},2);
  state=result.state;
  result=applyArcadeControllerInput(state,{sessionId:"maze-session",controllerId:"phone-1",sequence:2,action:"RIGHT",issuedAt:3},3);
  state=tickArcadeGame(result.state);
  assert.equal(state.frame.length,1536);
  assert.notDeepEqual(Array.from(state.frame),before);
  const colors=new Set(Array.from({length:512},(_,i)=>Array.from(state.frame.slice(i*3,i*3+3)).join(",")));
  assert.ok(colors.has("18,36,150"));assert.ok(colors.has("82,108,166"));
});

test("device-authenticated guest events are direction-only, session-bound, replay-safe, and share the real renderer",()=>{
  const owner={active:true,paired:true,role:"owner",controllerId:"owner-ipad"};
  let state=createAuthorizedArcadeGame({gameId:"snake",sessionId:"device-session",controller:owner,snapshot:{vibe:2},seed:11,now:1});
  const apply=(event)=>applyAuthenticatedArcadeAction(state,{sessionId:"device-session",...event},10);
  let result=apply({role:"guest",controllerId:"guest-phone",sequence:1,action:"LEFT"});
  assert.equal(result.ok,true);state=result.state;
  assert.equal(state.frame.length,1536);
  assert.equal(apply({role:"guest",controllerId:"guest-phone",sequence:1,action:"RIGHT"}).reason,"replayed_or_invalid_sequence");
  assert.equal(apply({role:"guest",controllerId:"guest-phone",sequence:2,action:"EXIT"}).reason,"guest_action_forbidden");
  assert.equal(apply({role:"owner",controllerId:"not-owner",sequence:1,action:"PAUSE"}).reason,"owner_controller_mismatch");
  assert.equal(apply({role:"owner",controllerId:"owner-ipad",sequence:1,action:"START"}).ok,true);
});

test("rendered phone-controlled frame encodes to the exact 1024-byte little-endian Matrix payload",()=>{
  const owner={active:true,paired:true,role:"owner",controllerId:"owner-ipad"};
  let state=createAuthorizedArcadeGame({gameId:"snake",sessionId:"frame-session",controller:owner,snapshot:{},seed:11,now:1});
  const frame=rgb888ToRgb565LE(state.frame);
  assert.equal(frame.length,32*16*2);
  const snakeHead=(8*32+8)*2;
  const expected=((30>>3)<<11)|((220>>2)<<5)|(150>>3);
  assert.equal(frame[snakeHead],expected&255);
  assert.equal(frame[snakeHead+1],expected>>8);
  assert.throws(()=>rgb888ToRgb565LE(new Uint8Array(12)),/invalid_32x16_rgb_frame/);
});
