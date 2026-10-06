// Owner-only edits to the existing authoritative league_state Skins cards.
// @ts-nocheck
const clean=(value)=>String(value??"").trim().replace(/\s*\/\s*/g," / ").replace(/\s+/g," ");
const lines=(value)=>String(value??"").split(/\r?\n/).map(clean).filter(Boolean);
const cards=(section)=>Array.isArray(section?.cards)?section.cards:[];
export const laDate=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

function rowsForCard(card,sectionName){
  const cardId=String(card?.id||"card_1");
  if(sectionName==="front")return lines(card?.playersText).map((name,index)=>({id:`${cardId}_p_${index}`,name}));
  return lines(card?.teamsText).map((name,index)=>({id:`${cardId}_team_${index}`,name}));
}
function resolveWinner(raw,rows,cardId,sectionName){
  const value=String(raw??"").trim();if(!value)return null;
  const exact=rows.find(row=>row.id===value);if(exact)return exact;
  const byName=rows.find(row=>row.name===value);if(byName)return byName;
  if(sectionName==="front")return rows.find(row=>row.id===`${cardId}_p_${rows.findIndex(x=>x.name===value)}`)||null;
  const legacy=/^team_(\d+)$/.exec(value);return legacy?rows.find(row=>row.id===`${cardId}_team_${legacy[1]}`)||null:null;
}
function sectionView(section,sectionName){
  return cards(section).map((card,index)=>{
    const id=String(card?.id||`card_${index+1}`),rows=rowsForCard(card,sectionName),winners=card?.winners&&typeof card.winners==="object"?card.winners:{};
    return {id,locked:!!(section?.scoresLocked||card?.scoresLocked||card?.finalized),participants:rows,
      holes:Array.from({length:9},(_,i)=>{const hole=(sectionName==="front"?1:10)+i;const winner=resolveWinner(winners[String(hole)],rows,id,sectionName);return {hole,winner_id:winner?.id||"",winner_name:winner?.name||""};})};
  }).filter(card=>card.participants.length>0);
}

export function buildSkinsScoreState(root,roundDate){
  const week=root?.skins?.weeks?.[roundDate];
  if(!week)throw new Error("No Skins round found for this date.");
  return {round_date:roundDate,sections:{front:sectionView(week.front,"front"),back:sectionView(week.back,"back")},updated_at:null};
}

export function applySkinsWinner(root,{roundDate,sectionName,cardId,hole,winnerId,expectedWinnerId}){
  if(!["front","back"].includes(sectionName))throw new Error("Section must be front or back.");
  const n=Number(hole),min=sectionName==="front"?1:10,max=sectionName==="front"?9:18;
  if(!Number.isInteger(n)||n<min||n>max)throw new Error(`Hole must be ${min}-${max}.`);
  const week=root?.skins?.weeks?.[roundDate];if(!week)throw new Error("No Skins round found for this date.");
  const section=week[sectionName],card=cards(section).find((item,index)=>String(item?.id||`card_${index+1}`)===String(cardId));
  if(!card)throw new Error("Scorecard not found.");
  if(section?.scoresLocked||card?.scoresLocked||card?.finalized)throw new Error("That scorecard is finalized and locked.");
  const rows=rowsForCard(card,sectionName);if(!rows.length)throw new Error("Scorecard has no participants.");
  const value=String(winnerId??"");
  if(value&&!rows.some(row=>row.id===value))throw new Error("Winner is not on this scorecard.");
  const winners=card.winners&&typeof card.winners==="object"?card.winners:{};
  const current=resolveWinner(winners[String(n)],rows,String(card.id||cardId),sectionName)?.id||"";
  if(typeof expectedWinnerId!=="string"||expectedWinnerId!==current)throw new Error("This hole changed on another device. Refresh before saving.");
  card.winners=winners;
  if(value)card.winners[String(n)]=value;else delete card.winners[String(n)];
  const winner=rows.find(row=>row.id===value);
  return {round_date:roundDate,section:sectionName,card_id:String(cardId),hole:n,winner_id:value||null,winner_name:winner?.name||null};
}

export async function readSkinsScoreState(service,roundDate){
  const {data,error}=await service.from("league_state").select("state_json,updated_at").eq("id",1).single();
  if(error)throw error;
  const result=buildSkinsScoreState(data?.state_json||{},roundDate);result.updated_at=data.updated_at;return result;
}

export async function writeSkinsWinner(service,input){
  for(let attempt=0;attempt<4;attempt++){
    const {data,error}=await service.from("league_state").select("state_json,updated_at").eq("id",1).single();
    if(error)throw error;
    const root=structuredClone(data?.state_json||{});
    const result=applySkinsWinner(root,input);
    const now=new Date().toISOString();
    const saved=await service.from("league_state").update({state_json:root,updated_at:now}).eq("id",1).eq("updated_at",data.updated_at).select("updated_at").maybeSingle();
    if(saved.error)throw saved.error;
    if(saved.data)return {...result,updated_at:saved.data.updated_at};
    await new Promise(resolve=>setTimeout(resolve,80*(attempt+1)));
  }
  throw new Error("Score update conflicted with another owner. Refresh and try again.");
}
