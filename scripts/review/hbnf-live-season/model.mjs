// REVIEW ONLY. Pure reference calculations over explicitly approved, synthetic
// final receipts. No network, localStorage, HBNF score source, or device access.
const dateMs=(value)=>{
  if(typeof value!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;
  const ms=Date.parse(value);
  return Number.isFinite(ms)?ms:null;
};
const validId=(s)=>typeof s==='string'&&s.trim().length>0;

export function relativeToPar(strokes,pars){
 if(!Array.isArray(strokes)||!Array.isArray(pars)||!strokes.length||strokes.length!==pars.length)return null;
 if([...strokes,...pars].some(n=>!Number.isInteger(n)||n<=0))return null;
 return strokes.reduce((sum,s,i)=>sum+s-pars[i],0);
}

export function competitionRanks(rows,{field='score',ascending=false}={}){
 if(!Array.isArray(rows)||rows.some(r=>!validId(r.id)||!Number.isFinite(r[field])))throw Error('Ranking requires stable IDs and finite certified scores');
 if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Duplicate participant ID');
 const sorted=[...rows].sort((a,b)=>{
   const score=ascending?a[field]-b[field]:b[field]-a[field];
   return score||String(a.label||a.id).localeCompare(String(b.label||b.id))||a.id.localeCompare(b.id);
 });
 let previous,rank=0;
 return sorted.map((r,i)=>{
   if(i===0||r[field]!==previous)rank=i+1;
   previous=r[field];
   return {...r,rank};
 });
}

export function approvedSeasonFinals(rounds,seasonStart,seasonEnd){
 const start=dateMs(seasonStart),end=dateMs(seasonEnd);
 if(start===null||end===null||end<=start)throw Error('Season interval must have explicit timezones');
 if(!Array.isArray(rounds))throw Error('Round receipts must be an array');
 const selected=new Map();
 for(const r of rounds){
   if(!r||!validId(r.roundId)||!Number.isSafeInteger(r.revision)||r.revision<0)continue;
   const date=dateMs(r.startsAt);
   if(date===null||date<start||date>=end)continue;
   if(r.official!==true||r.approvedFinal!==true||r.adjudicated!==true||r.oneOff===true||r.synthetic===true)continue;
   const prior=selected.get(r.roundId);
   if(prior&&prior.revision===r.revision&&JSON.stringify(prior)!==JSON.stringify(r)){
     throw Error('Conflicting certified revisions for round '+r.roundId);
   }
   if(!prior||r.revision>prior.revision)selected.set(r.roundId,r);
 }
 return [...selected.values()].sort((a,b)=>dateMs(a.startsAt)-dateMs(b.startsAt)||a.roundId.localeCompare(b.roundId));
}

export function liveFeedStatus({roundStatus,lastScoredAt,readOk,now}){
 const allowed=['Scheduled','Live','Result pending','Final'];
 if(!allowed.includes(roundStatus))throw Error('Unknown round status');
 if(typeof readOk!=='boolean')throw Error('Read availability must be explicit');
 const nowMs=typeof now==='number'?now:dateMs(now);
 if(!Number.isFinite(nowMs))throw Error('Invalid observation time');
 const scoredMs=lastScoredAt==null?null:(typeof lastScoredAt==='number'?lastScoredAt:dateMs(lastScoredAt));
 const seconds=scoredMs===null||!Number.isFinite(scoredMs)||scoredMs>nowMs?null:Math.floor((nowMs-scoredMs)/1000);
 return {roundStatus,feed:readOk?'Feed available':'Feed unavailable',
   ageSeconds:seconds,freshness:seconds===null?null:seconds<=300?'Current':'Stale'};
}

export function certifiedSkinAwards(holes,{tiebreakWinner=null}={}){
 if(!Array.isArray(holes))throw Error('Holes must be a list');
 const awards=new Map();let carry=0;
 for(const h of holes){
   if(!h||!('winner' in h))throw Error('Hole requires certified result');
   if(h.winner===null){carry++;continue}
   if(!validId(h.winner))throw Error('Unrecognized winner');
   awards.set(h.winner,(awards.get(h.winner)||0)+carry+1);
   carry=0;
 }
 if(carry&&validId(tiebreakWinner)){
   awards.set(tiebreakWinner,(awards.get(tiebreakWinner)||0)+carry);
   carry=0;
 }
 return {awards,unresolvedCarry:carry};
}
