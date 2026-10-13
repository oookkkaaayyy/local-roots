// Owner-only edits to the existing authoritative league_state Skins cards.
// @ts-nocheck
import { skinsAcePot } from "./live.ts";

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
function unresolvedCarry(card,sectionName){
  const id=String(card?.id||"card_1"),rows=rowsForCard(card,sectionName),winners=card?.winners&&typeof card.winners==="object"?card.winners:{};
  let carry=1;
  for(let i=0;i<9;i++){
    const hole=(sectionName==="front"?1:10)+i;
    if(resolveWinner(winners[String(hole)],rows,id,sectionName))carry=1;else carry++;
  }
  return Math.max(0,carry-1);
}
function sectionLocked(section){
  const list=cards(section);
  return !!section?.scoresLocked||(list.length>0&&list.every(card=>!!(card?.scoresLocked||card?.finalized)));
}
function aceParticipants(section,sectionName){
  const seen=new Set(),out=[];
  for(const card of cards(section)){
    for(const row of rowsForCard(card,sectionName)){
      const names=sectionName==="back"?row.name.split(/\s*\/\s*/):[row.name];
      for(const raw of names){const name=clean(raw),key=name.toLowerCase();if(name&&!seen.has(key)){seen.add(key);out.push({id:name,name});}}
    }
  }
  const current=clean(section?.aceWinner);
  if(current&&!seen.has(current.toLowerCase()))out.push({id:current,name:current});
  return out;
}
function sectionView(section,sectionName){
  return cards(section).map((card,index)=>{
    const id=String(card?.id||`card_${index+1}`),rows=rowsForCard(card,sectionName),winners=card?.winners&&typeof card.winners==="object"?card.winners:{};
    const pendingCarry=unresolvedCarry(card,sectionName),tb=resolveWinner(winners.tb,rows,id,sectionName);
    return {id,locked:!!(section?.scoresLocked||card?.scoresLocked||card?.finalized),participants:rows,
      holes:Array.from({length:9},(_,i)=>{const hole=(sectionName==="front"?1:10)+i;const winner=resolveWinner(winners[String(hole)],rows,id,sectionName);return {hole,winner_id:winner?.id||"",winner_name:winner?.name||""};}),
      tiebreaker:{winner_id:tb?.id||"",winner_name:tb?.name||"",carry:pendingCarry,enabled:pendingCarry>0||!!tb}};
  }).filter(card=>card.participants.length>0);
}
function aceSectionView(section,sectionName){
  return {winner_name:clean(section?.aceWinner),participants:aceParticipants(section,sectionName),locked:sectionLocked(section)};
}

export function buildSkinsScoreState(root,roundDate){
  const week=root?.skins?.weeks?.[roundDate];
  if(!week)throw new Error("No Skins round found for this date.");
  const front=sectionView(week.front,"front"),back=sectionView(week.back,"back");
  return {
    round_date:roundDate,
    active_section:back.length?"back":"front",
    sections:{front,back},
    ace:{pot:skinsAcePot(root),front:aceSectionView(week.front,"front"),back:aceSectionView(week.back,"back")},
    updated_at:null
  };
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
  return {entry_type:"hole",round_date:roundDate,section:sectionName,card_id:String(cardId),hole:n,winner_id:value||null,winner_name:winner?.name||null};
}

export function applySkinsTiebreaker(root,{roundDate,sectionName,cardId,winnerId,expectedWinnerId}){
  if(!["front","back"].includes(sectionName))throw new Error("Section must be front or back.");
  const week=root?.skins?.weeks?.[roundDate];if(!week)throw new Error("No Skins round found for this date.");
  const section=week[sectionName],card=cards(section).find((item,index)=>String(item?.id||`card_${index+1}`)===String(cardId));
  if(!card)throw new Error("Scorecard not found.");
  if(section?.scoresLocked||card?.scoresLocked||card?.finalized)throw new Error("That scorecard is finalized and locked.");
  const rows=rowsForCard(card,sectionName);if(!rows.length)throw new Error("Scorecard has no participants.");
  const value=String(winnerId??"");
  if(value&&!rows.some(row=>row.id===value))throw new Error("Winner is not on this scorecard.");
  const winners=card.winners&&typeof card.winners==="object"?card.winners:{};
  const current=resolveWinner(winners.tb,rows,String(card.id||cardId),sectionName)?.id||"";
  if(typeof expectedWinnerId!=="string"||expectedWinnerId!==current)throw new Error("This tiebreaker changed on another device. Refresh before saving.");
  const carry=unresolvedCarry(card,sectionName);
  if(value&&carry<1)throw new Error("No carried skins require a tiebreaker.");
  card.winners=winners;
  if(value)card.winners.tb=value;else delete card.winners.tb;
  const winner=rows.find(row=>row.id===value);
  return {entry_type:"tiebreaker",round_date:roundDate,section:sectionName,card_id:String(cardId),carry,winner_id:value||null,winner_name:winner?.name||null};
}

export function applySkinsAceWinner(root,{roundDate,sectionName,winnerName,expectedWinnerName}){
  if(!["front","back"].includes(sectionName))throw new Error("Section must be front or back.");
  const week=root?.skins?.weeks?.[roundDate];if(!week)throw new Error("No Skins round found for this date.");
  const section=week[sectionName];if(!section)throw new Error("Skins section not found.");
  if(sectionLocked(section))throw new Error("That Skins section is finalized and locked.");
  const value=clean(winnerName),current=clean(section?.aceWinner);
  if(typeof expectedWinnerName!=="string"||clean(expectedWinnerName)!==current)throw new Error("Ace state changed on another device. Refresh before saving.");
  const participants=aceParticipants(section,sectionName);
  if(value&&!participants.some(row=>row.name===value))throw new Error("Ace winner is not in this Skins section.");
  if(value)section.aceWinner=value;else delete section.aceWinner;
  return {entry_type:"ace",round_date:roundDate,section:sectionName,winner_name:value||null};
}

async function writeMutation(service,input,apply){
  for(let attempt=0;attempt<4;attempt++){
    const {data,error}=await service.from("league_state").select("state_json,updated_at").eq("id",1).single();
    if(error)throw error;
    const root=structuredClone(data?.state_json||{});
    const result=apply(root,input);
    const now=new Date().toISOString();
    const saved=await service.from("league_state").update({state_json:root,updated_at:now}).eq("id",1).eq("updated_at",data.updated_at).select("updated_at").maybeSingle();
    if(saved.error)throw saved.error;
    if(saved.data)return {...result,updated_at:saved.data.updated_at};
    await new Promise(resolve=>setTimeout(resolve,80*(attempt+1)));
  }
  throw new Error("Score update conflicted with another owner. Refresh and try again.");
}

export async function readSkinsScoreState(service,roundDate){
  const {data,error}=await service.from("league_state").select("state_json,updated_at").eq("id",1).single();
  if(error)throw error;
  const result=buildSkinsScoreState(data?.state_json||{},roundDate);result.updated_at=data.updated_at;return result;
}
export const writeSkinsWinner=(service,input)=>writeMutation(service,input,applySkinsWinner);
export const writeSkinsTiebreaker=(service,input)=>writeMutation(service,input,applySkinsTiebreaker);
export const writeSkinsAceWinner=(service,input)=>writeMutation(service,input,applySkinsAceWinner);
