const FLOW=new Set(["ATTRACT","MENU","READY","PLAY","PAUSE","GAME_OVER","EXIT"]);

/** Small lifecycle coordinator; display/audio snapshots stay owned by the host. */
export function createArcadeSession({gameId,sessionId,snapshot,now=Date.now()}){
  if(!["maze-chase","snake"].includes(gameId))throw new Error("unsupported arcade game");
  if(typeof sessionId!=="string"||!sessionId)throw new Error("sessionId is required");
  return {gameId,sessionId,phase:"READY",snapshot:structuredClone(snapshot??{}),startedAt:now,endedAt:null};
}

export function transitionArcadeSession(session,phase,now=Date.now()){
  if(!session||!FLOW.has(phase))throw new Error("invalid arcade lifecycle transition");
  const allowed={ATTRACT:["MENU"],MENU:["READY","EXIT"],READY:["PLAY","EXIT"],PLAY:["PAUSE","GAME_OVER","EXIT","READY"],PAUSE:["PLAY","GAME_OVER","EXIT","READY"],GAME_OVER:["READY","EXIT"],EXIT:[]};
  if(!allowed[session.phase]?.includes(phase))throw new Error(`invalid arcade transition ${session.phase} -> ${phase}`);
  return {...session,phase,endedAt:phase==="EXIT"?now:session.endedAt};
}

export function arcadeExitRestore(session){
  if(!session||session.phase!=="EXIT")throw new Error("only an exited game can restore the normal snapshot");
  return structuredClone(session.snapshot);
}
