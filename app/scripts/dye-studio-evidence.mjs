// D&U physical-evidence admission gate. This does not generate or fit dye colors.
export function qualifiesForNumeric(r,{overlap=false}={}){
 const basic=r.physicalDisc===true&&r.exactPlastic===true&&r.namedDyes===true&&
 r.methodKnown===true&&r.doseKnown===true&&r.timeKnown===true&&
 r.controlledColor===true&&r.independentReplicate===true;
 return basic&&(!overlap||r.isolatedABAB===true);
}
// A source URL is an immutable provenance identity, not an independently
// re-labelable train/holdout example. Remove only fragments and trailing slashes.
function sourceIdentity(r){
 return String(r?.source||r?.sourceUrl||"").trim().replace(/#.*$/,"").replace(/\/+$/,"");
}
export function auditEvidence(data){
 if(data.schemaVersion!==1||!Array.isArray(data.records))throw Error("Unsupported evidence schema");
 const ids=new Set(),groups=new Set(),issues=[],sourceGroups=new Map();
 for(const r of data.records){
  if(!r.id||ids.has(r.id))issues.push("Duplicate or missing source ID: "+r.id);
  ids.add(r.id);
  if(!r.source?.startsWith("https://")||!r.creatorGroup)issues.push("Missing original source/group: "+r.id);
  if(!["qualitative_only","excluded_numeric","numeric_candidate"].includes(r.use))issues.push("Invalid evidence use: "+r.id);
  if(r.use==="numeric_candidate"&&!qualifiesForNumeric(r))issues.push("Unsafe numerical promotion: "+r.id);
  const url=sourceIdentity(r);
  if(url&&sourceGroups.has(url)&&sourceGroups.get(url)!==r.creatorGroup)
   issues.push("Conflicting creator group for same original source: "+r.id);
  if(url)sourceGroups.set(url,r.creatorGroup);
  groups.add(r.creatorGroup);
 }
 return {sources:data.records.length,independentSourceGroups:groups.size,numericEligible:data.records.filter(r=>qualifiesForNumeric(r)).length,issues};
}
export function assertDisjointSources(training,holdout){
 const groups=new Set(training.map(r=>r.creatorGroup));
 const sources=new Set(training.map(sourceIdentity).filter(Boolean));
 for(const h of holdout){
  if(groups.has(h.creatorGroup))throw Error("Source-group leakage: "+h.creatorGroup);
  if(sources.has(sourceIdentity(h)))throw Error("Original-source URL leakage: "+sourceIdentity(h));
 }
 return true;
}
