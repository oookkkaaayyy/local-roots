import {validateArcadeInput} from "./arcade-input.mjs";
import {createArcadeSession,transitionArcadeSession,arcadeExitRestore} from "./arcade-runtime.mjs";
import {createSnakeGame,steerSnake,tickSnake,snakeFrame} from "./snake-runtime.mjs";
import {createMazeChaseGame,steerMazeChase,tickMazeChase,mazeChaseFrame} from "./maze-chase-runtime.mjs";

const COLORS={
  snake:{0:[0,0,0],1:[30,220,150],2:[255,104,42]},
  "maze-chase":{0:[0,0,0],1:[18,36,150],2:[82,108,166],3:[255,222,66],4:[255,74,108]},
};

/**
 * Creates a host arcade session after the caller has authenticated the owner
 * and paired controller. These role/pair fields are trusted context, not
 * authentication by themselves. The RGB frame is row-major 32x16, ready for
 * the existing Matrix renderer adapter; this module does not send frames.
 */
export function createAuthorizedArcadeGame({gameId,sessionId,controller,snapshot,seed=1,now=Date.now()}){
  if(!controller||controller.active!==true||controller.paired!==true||controller.role!=="owner"||!controller.controllerId)
    throw new Error("authorized_paired_owner_controller_required");
  if(!["snake","maze-chase"].includes(gameId))throw new Error("unsupported_arcade_game");
  const session=createArcadeSession({gameId,sessionId,snapshot,now});
  const game=gameId==="snake"?createSnakeGame({seed}):createMazeChaseGame();
  return {session,controller:{...controller,lastSequence:0},game,frame:renderGameFrame(gameId,game),seed};
}

/** Applies one fresh session-bound controller action, or rejects without mutation. */
export function applyArcadeControllerInput(state,envelope,now=Date.now()){
  if(!state||state.session.phase==="EXIT")return {ok:false,reason:"session_inactive"};
  const checked=validateArcadeInput(envelope,{...state.controller,sessionId:state.session.sessionId,active:true},now);
  if(!checked.ok)return checked;
  const action=checked.action;
  let session=state.session,game=state.game;
  if(action==="EXIT"){
    session=transitionArcadeSession(session,"EXIT",now);
    return {ok:true,state:{...state,session,controller:checked.context},restoredSnapshot:arcadeExitRestore(session),frame:null};
  }
  if(action==="PRIMARY"){
    if(session.phase==="READY"||session.phase==="GAME_OVER"){
      if(session.phase==="GAME_OVER")game=state.session.gameId==="snake"?createSnakeGame({seed:state.seed}):createMazeChaseGame();
      session=transitionArcadeSession(session,session.phase==="GAME_OVER"?"READY":"PLAY",now);
      if(session.phase==="READY")session=transitionArcadeSession(session,"PLAY",now);
    }
  }else if(action==="PAUSE"){
    if(session.phase==="PLAY")session=transitionArcadeSession(session,"PAUSE",now);
    else if(session.phase==="PAUSE")session=transitionArcadeSession(session,"PLAY",now);
    else return {ok:false,reason:"game_not_started"};
  }else if(action==="SECONDARY"){
    if(!["READY","PLAY","PAUSE","GAME_OVER"].includes(session.phase))return {ok:false,reason:"restart_not_available"};
    game=state.session.gameId==="snake"?createSnakeGame({seed:state.seed}):createMazeChaseGame();
    if(session.phase!=="READY")session=transitionArcadeSession(session,"READY",now);
  }else if(["UP","DOWN","LEFT","RIGHT"].includes(action)){
    if(!["READY","PLAY"].includes(session.phase))return {ok:false,reason:"game_not_playing"};
    game=session.gameId==="snake"?steerSnake(game,action):steerMazeChase(game,action);
  }
  const next={...state,session,controller:checked.context,game};
  return {ok:true,state:withFrame(next),frame:withFrame(next).frame};
}

/** Advances one deterministic game tick and produces the actual 32x16 RGB frame. */
export function tickArcadeGame(state){
  if(!state||state.session.phase!=="PLAY")return state;
  let game=state.session.gameId==="snake"?tickSnake(state.game):tickMazeChase(state.game);
  let session=state.session;
  if(game.status==="GAME_OVER")session=transitionArcadeSession(session,"GAME_OVER");
  return withFrame({...state,game,session});
}

export function renderGameFrame(gameId,game){
  const cells=gameId==="snake"?snakeFrame(game):gameId==="maze-chase"?mazeChaseFrame(game):null;
  if(!cells||cells.length!==32*16)throw new Error("invalid_32x16_game_frame");
  const palette=COLORS[gameId],rgb=new Uint8Array(cells.length*3);
  for(let i=0;i<cells.length;i++){
    const color=palette[cells[i]];
    if(!color)throw new Error("unknown_game_cell");
    rgb.set(color,i*3);
  }
  return rgb;
}

function withFrame(state){return {...state,frame:renderGameFrame(state.session.gameId,state.game)};}
