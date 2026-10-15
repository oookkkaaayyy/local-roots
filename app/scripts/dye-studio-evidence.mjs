// D&U physical-evidence admission gate. This does not generate or fit dye colors.
export function qualifiesForNumeric(r,{overlap=false}={}){
 const basic=r.physicalDisc===true&&r.exactPlastic===true&&r.namedDyes===true&&
 r.methodKnown===true&&r.doseKnown===true&&r.timeKnown===true&&
 r.controlledColor===true&&r.independentReplicate===true;
 return basic&&(!overlap||r.isolatedABAB===true);
}
export function auditEvidence(data){
 if(data.schemaVersion!==1||!Array.isArray(data.records))throw Error("Unsupported evidence schema");
 const ids=new Set(),groups=new Set(),issues=[];
 for(const r of data.records){
  if(!r.id||ids.has(r.id))issues.push("Duplicate or missing source ID: "+r.id);
  ids.add(r.id);
  if(!r.source?.startsWith("https://")||!r.creatorGroup)issues.push("Missing original source/group: "+r.id);
  if(!["qualitative_only","excluded_numeric","numeric_candidate"].includes(r.use))issues.push("Invalid evidence use: "+r.id);
  if(r.use==="numeric_candidate"&&!qualifiesForNumeric(r))issues.push("Unsafe numerical promotion: "+r.id);
  groups.add(r.creatorGroup);
 }
 return {sources:data.records.length,independentSourceGroups:groups.size,numericEligible:data.records.filter(r=>qualifiesForNumeric(r)).length,issues};
}
export function assertDisjointSources(training,holdout){
 const groups=new Set(training.map(r=>r.creatorGroup));
 for(const h of holdout)if(groups.has(h.creatorGroup))throw Error("Source-group leakage: "+h.creatorGroup);
 return true;
}
