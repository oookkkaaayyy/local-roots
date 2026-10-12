import test from "node:test";
import assert from "node:assert/strict";
import {validateArcadeInput} from "../hbnf-cart-core/domain/arcade-input.mjs";
import {arcadeExitRestore,createArcadeSession,transitionArcadeSession} from "../hbnf-cart-core/domain/arcade-runtime.mjs";
import {createMazeChaseGame,mazeChaseFrame,steerMazeChase,tickMazeChase} from "../hbnf-cart-core/domain/maze-chase-runtime.mjs";
import {createSnakeGame,snakeFrame,steerSnake,tickSnake} from "../hbnf-cart-core/domain/snake-runtime.mjs";

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
