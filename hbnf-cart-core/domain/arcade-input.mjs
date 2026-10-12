const ACTIONS=new Set(["UP","DOWN","LEFT","RIGHT","PRIMARY","SECONDARY","PAUSE","EXIT"]);
const OPPOSITE={UP:"DOWN",DOWN:"UP",LEFT:"RIGHT",RIGHT:"LEFT"};

/** Validates a small local-controller input envelope before game state can change. */
export function validateArcadeInput(envelope,context,now=Date.now()){
  if(!envelope||typeof envelope!=="object"||!context||typeof context!=="object")return {ok:false,reason:"invalid_envelope"};
  if(context.active!==true)return {ok:false,reason:"session_inactive"};
  if(envelope.sessionId!==context.sessionId)return {ok:false,reason:"session_mismatch"};
  if(!context.controllerId||envelope.controllerId!==context.controllerId)return {ok:false,reason:"controller_mismatch"};
  if(context.paired!==true||context.role!=="owner")return {ok:false,reason:"controller_not_authorized"};
  if(!Number.isSafeInteger(context.lastSequence)||context.lastSequence<0)return {ok:false,reason:"sequence_context_invalid"};
  if(!Number.isSafeInteger(envelope.sequence)||envelope.sequence<1||envelope.sequence<=context.lastSequence)return {ok:false,reason:"replayed_or_invalid_sequence"};
  if(!Number.isFinite(envelope.issuedAt)||envelope.issuedAt>now+250||now-envelope.issuedAt>2000)return {ok:false,reason:"stale_input"};
  if(!ACTIONS.has(envelope.action))return {ok:false,reason:"unsupported_action"};
  return {ok:true,context:{...context,lastSequence:envelope.sequence},action:envelope.action};
}

export function arcadeInputDirection(action){
  if(!["UP","DOWN","LEFT","RIGHT"].includes(action))return null;
  return action;
}

export function isOppositeDirection(current,next){return OPPOSITE[current]===next;}
