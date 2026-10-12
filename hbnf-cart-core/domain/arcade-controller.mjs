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
  return applyAction(state,checked.action,now,{...state.controller,...checked.context});
}

/** Applies an action already authenticated by the device session receiver.
 * This is only for the local browser renderer after the ESP32 has verified
 * session, controller, role, sequence, replay window, and rate limit.
 */
export function applyAuthenticatedArcadeAction(state,event,now=Date.now()){
  if(!state||state.session.phase==="EXIT")return {ok:false,reason:"session_inactive"};
  if(!event||event.sessionId!==state.session.sessionId||!Number.isSafeInteger(event.sequence)||event.sequence<1||
     !["owner","guest"].includes(event.role)||!event.controllerId||
     !["UP","DOWN","LEFT","RIGHT","START","PAUSE","RESTART","EXIT"].includes(event.action))
    return {ok:false,reason:"unauthorized_device_event"};
  if(event.role==="guest"&&! ["UP","DOWN","LEFT","RIGHT"].includes(event.action))
    return {ok:false,reason:"guest_action_forbidden"};
  const previous=event.role==="owner"?state.ownerSequence||0:state.guestSequence||0;
  if(event.sequence<=previous)return {ok:false,reason:"replayed_or_invalid_sequence"};
  if(event.role==="owner"&&event.controllerId!==state.controller.controllerId)
    return {ok:false,reason:"owner_controller_mismatch"};
  const nextState={...state,[event.role==="owner"?"ownerSequence":"guestSequence"]:event.sequence};
  return applyAction(nextState,event.action,now,event.role==="owner"
    ?{...state.controller,lastSequence:event.sequence}
    :{...state.controller,lastSequence:event.sequence});
}

function applyAction(state,action,now,controller){
  if(action==="START")action="PRIMARY";
  if(action==="RESTART")action="SECONDARY";
  let session=state.session,game=state.game;
  if(action==="EXIT"){
    session=transitionArcadeSession(session,"EXIT",now);
    return {ok:true,state:{...state,session,controller},restoredSnapshot:arcadeExitRestore(session),frame:null};
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
  const next={...state,session,controller,game};
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

/** Encodes the actual row-major 32x16 RGB frame expected by the device. */
export function rgb888ToRgb565LE(rgb){
  if(!(rgb instanceof Uint8Array)||rgb.length!==32*16*3)throw new Error("invalid_32x16_rgb_frame");
  const out=new Uint8Array(32*16*2);
  for(let i=0;i<32*16;i++){
    const value=((rgb[i*3]>>3)<<11)|((rgb[i*3+1]>>2)<<5)|(rgb[i*3+2]>>3);
    out[i*2]=value&255;out[i*2+1]=value>>8;
  }
  return out;
}

function withFrame(state){return {...state,frame:renderGameFrame(state.session.gameId,state.game)};}
