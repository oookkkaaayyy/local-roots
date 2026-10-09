/** Old observations can be displayed with their original timestamp but never become a new acknowledgement. */
export function canCarryForwardObservation(prior:any,revision:number,fenceEpoch:number,releaseId:string){
 return !!prior&&["online","off"].includes(String(prior.status))&&Number(prior.desired_revision)===revision&&
 Number(prior.fence_epoch)===fenceEpoch&&prior.release_id===releaseId&&
 Number(prior.reported?.desiredRevision??prior.reported?.cartRevision)===revision&&
 Number(prior.reported?.fenceEpoch)===fenceEpoch;
}
export function carryForwardObservation(prior:any,revision:number,fenceEpoch:number,releaseId:string){
 if(!canCarryForwardObservation(prior,revision,fenceEpoch,releaseId))return null;
 const observedAt=prior.observed_at;if(typeof observedAt!=="string"||!Number.isFinite(Date.parse(observedAt)))return null;
 return{status:"carried" as const,observedAt,commandApplicationConfirmed:false as const};
}
/** Legacy MQTT adapter responses can never be promoted to device application. */
export async function classifyFoundationInvocation(_error:any,_ack:any,_projection:any){
 return{ok:false as const,status:"pending_relay" as const,failureCode:"matrix_writer_moved_to_opal_relay",httpStatus:409};
}
