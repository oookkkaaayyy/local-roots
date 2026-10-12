const ACTIONS=new Set(["UP","DOWN","LEFT","RIGHT","PRIMARY","SECONDARY","PAUSE","EXIT"]);

/** Builds session-bound input for an authenticated backend command bridge; never talks to devices. */
export function createArcadeInputEmitter({submit,session,clock=()=>Date.now()}){
  if(typeof submit!=="function")throw new TypeError("authenticated submit bridge is required");
  if(!session||typeof session.sessionId!=="string"||!session.sessionId||typeof session.controllerId!=="string"||!session.controllerId)throw new TypeError("server-issued arcade session identity is required");
  if(session.paired!==true||session.role!=="owner")throw new Error("a paired owner controller is required");
  let sequence=Number.isSafeInteger(session.lastSequence)&&session.lastSequence>=0?session.lastSequence:0;
  let active=true;
  return Object.freeze({
    async send(action){
      if(!active)throw new Error("arcade controller session is closed");
      if(!ACTIONS.has(action))throw new Error("unsupported arcade action");
      const input={sessionId:session.sessionId,controllerId:session.controllerId,sequence:++sequence,issuedAt:clock(),action};
      return submit({action:"ARCADE_INPUT",input});
    },
    close(){active=false;},
    get sequence(){return sequence;}
  });
}
