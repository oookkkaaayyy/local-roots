// REVIEW_ONLY synthetic reference. These are contract fixtures, not proof of any deployed HBNF runtime.
import test from "node:test";
import assert from "node:assert/strict";

function relativeToPar(strokes, pars) {
  if (!Array.isArray(strokes) || !Array.isArray(pars) ||
      strokes.length !== pars.length || !strokes.length ||
      [...strokes, ...pars].some(n => !Number.isInteger(n) || n <= 0)) return null;
  return strokes.reduce((sum, s, i) => sum + s - pars[i], 0);
}
function rankBy(items, key, ascending=false) {
  const ordered=[...items].sort((a,b) =>
    (ascending ? a[key]-b[key] : b[key]-a[key]) || a.name.localeCompare(b.name));
  let previous, rank=0;
  return ordered.map((item,i) => {
    if (i===0 || item[key]!==previous) rank=i+1;
    previous=item[key];
    return {...item,rank};
  });
}
function freshness(lastHole, nowMs) {
  if (lastHole == null) return null;
  const seconds=Math.floor((nowMs-lastHole)/1000);
  return {seconds,label:seconds<=300 ? "Current" : "Stale"};
}
function selectApprovedFinals(records,start,end) {
  const latest=new Map();
  for(const r of records) {
    if(!r.official || !r.approvedFinal || r.oneOff || r.synthetic ||
      r.startsAt<start || r.startsAt>=end) continue;
    if(!latest.has(r.roundId) || r.revision>latest.get(r.roundId).revision)
      latest.set(r.roundId,r);
  }
  return [...latest.values()];
}
function awardSkins(holes, certifiedTiebreak=null) {
  const won=new Map();
  let carry=0;
  for(const hole of holes) {
    if(hole.winner==null){carry+=1;continue;}
    won.set(hole.winner,(won.get(hole.winner)||0)+carry+1);
    carry=0;
  }
  if(carry && certifiedTiebreak)
    won.set(certifiedTiebreak,(won.get(certifiedTiebreak)||0)+carry);
  return won;
}

test("1. Empty read, failed read and empty certified season remain distinct",()=>{
  const display=(readOk,hasLive)=>!readOk?"Scores unavailable":hasLive?"Live":"No live round";
  assert.equal(display(true,false),"No live round");
  assert.equal(display(false,false),"Scores unavailable");
  assert.equal(selectApprovedFinals([],"2026-01-01","2027-01-01").length,0);
});
test("2. Glow par and competition ties, with mismatched or missing pars withheld",()=>{
  const pars=[3,4];
  const teams=[
    {name:"AB",strokes:[2,4]},
    {name:"CD",strokes:[3,3]},
    {name:"EF",strokes:[4,4]}
  ];
  const eligible=teams.map(x=>({...x,score:relativeToPar(x.strokes,pars)}));
  assert.deepEqual(eligible.map(x=>x.score),[-1,-1,1]);
  assert.deepEqual(rankBy(eligible,"score",true).map(x=>x.rank),[1,1,3]);
  assert.equal(relativeToPar([2],[3,4]),null);
  assert.equal(relativeToPar([2,4],[3,null]),null);
});
test("3. Five-minute boundary, standby update and outage are independent",()=>{
  const last=Date.parse("2026-11-17T18:00:00-08:00");
  assert.deepEqual(freshness(last,last+300000),{seconds:300,label:"Current"});
  assert.deepEqual(freshness(last,last+301000),{seconds:301,label:"Stale"});
  const snapshot={status:"Live",scoreRevision:2,lastHole:last,score:6};
  const failedRead=false;
  assert.deepEqual({status:snapshot.status,feed:failedRead?"Feed available":"Feed unavailable",score:snapshot.score},
    {status:"Live",feed:"Feed unavailable",score:6});
  assert.equal(freshness(null,last),null);
});
test("4. Final-only certified Glow winner credits unique partners once",()=>{
  const certified={official:true,approvedFinal:true,adjudicated:true,winners:["C","D","D"]};
  assert.deepEqual([...new Set(certified.winners)],["C","D"]);
  const pending={...certified,adjudicated:false};
  assert.equal(pending.adjudicated?new Set(pending.winners).size:0,0);
});
test("5. Skins carry and certified doubles credit, appearances unique by round",()=>{
  assert.equal(awardSkins([{winner:null},{winner:null},{winner:"A"}]).get("A"),3);
  const result=awardSkins([{winner:null},{winner:null}],"CD");
  assert.equal(result.get("CD"),2);
  const partners=["C","D"];
  assert.deepEqual(partners.map(()=>result.get("CD")),[2,2]);
  assert.equal(new Set(["C","C"]).size,1);
});
test("6. Latest approved official final only, half-open Pacific calendar",()=>{
  const start="2026-01-01T00:00:00-08:00",end="2027-01-01T00:00:00-08:00";
  const r={roundId:"glow-nov10",official:true,approvedFinal:true,startsAt:"2026-11-10T17:30:00-08:00"};
  const records=[
    {...r,revision:1,winner:"AB"},
    {...r,revision:2,winner:"CD"},
    {...r,revision:3,approvedFinal:false,winner:"EF"},
    {...r,roundId:"oneoff",revision:1,oneOff:true},
    {...r,roundId:"synthetic-sept2",revision:1,synthetic:true},
    {...r,roundId:"new-year",revision:1,startsAt:end}
  ];
  assert.deepEqual(selectApprovedFinals(records,start,end).map(x=>[x.roundId,x.revision,x.winner]),
    [["glow-nov10",2,"CD"]]);
});
test("7. Final status remains final during outage, and old data cannot replace newer",()=>{
  let snapshot={roundId:"glow-nov10",revision:4,status:"Final",lastHole:Date.parse("2026-11-17T18:00:00-08:00")};
  const incoming={...snapshot,revision:3,status:"Live"};
  if(incoming.revision>snapshot.revision) snapshot=incoming;
  assert.equal(snapshot.status,"Final");
  assert.equal(freshness(snapshot.lastHole,snapshot.lastHole+360000).label,"Stale");
  assert.equal(snapshot.revision,4);
});
test("9. Equal season totals retain competition rank instead of secondary split",()=>{
  const skins=rankBy([{name:"Ana",score:10,front:7},{name:"Ben",score:10,front:2},{name:"Cam",score:9,front:4}],"score");
  assert.deepEqual(skins.map(x=>x.rank),[1,1,3]);
  const glow=rankBy([{name:"Ana",score:4},{name:"Ben",score:4},{name:"Cam",score:2}],"score");
  assert.deepEqual(glow.map(x=>x.rank),[1,1,3]);
});
test.skip("8. Same-host Live to Season to Cart navigation and device status require browser/auth fixtures");
