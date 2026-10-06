const $=id=>document.getElementById(id);
const sectionNode=$("skinsSection"),cardNode=$("skinsCard"),holeNode=$("skinsHole"),winnerNode=$("skinsWinner"),statusNode=$("skinsScoreStatus"),aceWinnerNode=$("skinsAceWinner"),aceSummaryNode=$("skinsAceSummary");
let scoreState=null,requestInFlight=false,initialPaint=true;
function status(message,bad=false){statusNode.textContent=message;statusNode.className=bad?"status bad":"status";}
function fill(select,items,selected){select.replaceChildren();for(const item of items){const option=document.createElement("option");option.value=String(item.value);option.textContent=item.label;select.append(option);}if(selected!==undefined&&Array.from(select.options).some(o=>o.value===String(selected)))select.value=String(selected);}
function selectedSection(){return scoreState?.sections?.[sectionNode.value]||[];}
function selectedCard(){return selectedSection().find(card=>card.id===cardNode.value)||null;}
function selectedEntry(){
  const card=selectedCard();if(!card)return null;
  if(holeNode.value==="tb")return {type:"tiebreaker",winner_id:card.tiebreaker?.winner_id||"",carry:Number(card.tiebreaker?.carry||0)};
  const hole=(card.holes||[]).find(x=>String(x.hole)===holeNode.value);
  return hole?{type:"hole",winner_id:hole.winner_id||"",hole:Number(hole.hole)}:null;
}
function paintCards(){
  const section=selectedSection(),prior=cardNode.value;
  fill(cardNode,section.map(card=>({value:card.id,label:card.locked?`🔒 ${card.id}`:card.id})),prior);
  paintHoles();
  paintAce();
}
function paintHoles(){
  const card=selectedCard(),prior=holeNode.value,items=(card?.holes||[]).map(x=>({value:x.hole,label:`Hole ${x.hole}`}));
  if(card?.tiebreaker?.enabled)items.push({value:"tb",label:`Tiebreak · ${card.tiebreaker.carry} carried skin${Number(card.tiebreaker.carry)===1?"":"s"}`});
  fill(holeNode,items,prior);
  paintWinners();
}
function paintWinners(){
  const card=selectedCard(),entry=selectedEntry();
  fill(winnerNode,[{value:"",label:entry?.type==="tiebreaker"?"No tiebreak winner":"No winner · carry skin"},...(card?.participants||[]).map(x=>({value:x.id,label:x.name}))],entry?.winner_id||"");
  const locked=!card||card.locked||!entry;
  winnerNode.disabled=locked;$("skinsSave").disabled=locked;
  $("skinsSave").textContent=entry?.type==="tiebreaker"?"Save tiebreaker":"Save hole";
}
function paintAce(){
  const ace=scoreState?.ace?.[sectionNode.value]||{participants:[],winner_name:"",locked:true};
  fill(aceWinnerNode,[{value:"",label:"No ace"},...(ace.participants||[]).map(x=>({value:x.name,label:x.name}))],ace.winner_name||"");
  aceWinnerNode.disabled=!!ace.locked;$("skinsAceSave").disabled=!!ace.locked;
  const front=scoreState?.ace?.front?.winner_name||"—",back=scoreState?.ace?.back?.winner_name||"—",pot=Number(scoreState?.ace?.pot||0);
  aceSummaryNode.textContent=`Ace pot $${pot.toFixed(0)} · F9 ${front} · B9 ${back}`;
}
function paint(){
  if(!scoreState)return;
  const available=["front","back"].filter(k=>scoreState.sections[k]?.length),prior=sectionNode.value;
  fill(sectionNode,[{value:"front",label:"Front 9 · Singles"},{value:"back",label:"Back 9 · Doubles"}].filter(x=>available.includes(x.value)),initialPaint?scoreState.active_section:prior);
  initialPaint=false;paintCards();
}
async function refresh(){
  if(requestInFlight)return;requestInFlight=true;$("skinsRefresh").disabled=true;
  try{
    scoreState=await window.HBNFCanonical.read("skins_score_state");paint();
    status(`Round ${scoreState.round_date} · authoritative scorecard loaded · saved ${new Date(scoreState.updated_at).toLocaleTimeString()}`);
  }catch(error){status(error.message.includes("unauthorized")?"Pair this owner device before entering Skins scores.":`Scorecard unavailable: ${error.message}`,true);}
  finally{requestInFlight=false;$("skinsRefresh").disabled=false;}
}
async function save(){
  if(requestInFlight)return;const card=selectedCard(),entry=selectedEntry();
  if(!card||card.locked||!entry){status("This scorecard is locked.",true);return;}
  const section=sectionNode.value,winnerId=winnerNode.value;
  requestInFlight=true;$("skinsSave").disabled=true;
  try{
    const result=entry.type==="tiebreaker"
      ?await window.HBNFCanonical.read("skins_tiebreaker_set",{round_date:scoreState.round_date,section,card_id:card.id,winner_id:winnerId,expected_winner_id:entry.winner_id})
      :await window.HBNFCanonical.read("skins_score_set",{round_date:scoreState.round_date,section,card_id:card.id,hole:entry.hole,winner_id:winnerId,expected_winner_id:entry.winner_id});
    await refreshAfterSave(result);
  }catch(error){if(error.status)status(`Score was not saved: ${error.message}. Refresh before trying again.`,true);else status("Save status is uncertain because the connection ended. Refresh the scorecard before trying again.",true);}
  finally{requestInFlight=false;paintWinners();}
}
async function saveAce(){
  if(requestInFlight)return;
  const section=sectionNode.value,ace=scoreState?.ace?.[section];
  if(!ace||ace.locked){status("Ace state is locked.",true);return;}
  requestInFlight=true;$("skinsAceSave").disabled=true;
  try{
    const result=await window.HBNFCanonical.read("skins_ace_set",{round_date:scoreState.round_date,section,winner_name:aceWinnerNode.value,expected_winner_name:ace.winner_name||""});
    await refreshAfterSave(result);
  }catch(error){if(error.status)status(`Ace state was not saved: ${error.message}. Refresh before trying again.`,true);else status("Ace save status is uncertain because the connection ended. Refresh before another edit.",true);}
  finally{requestInFlight=false;paintAce();}
}
async function refreshAfterSave(result){
  const outcome=result.entry_type==="ace"
    ?(result.winner_name?`${result.winner_name} recorded as ${String(result.section).toUpperCase()} ace winner`:`${String(result.section).toUpperCase()} ace cleared`)
    :result.entry_type==="tiebreaker"
      ?(result.winner_name?`${result.winner_name} wins ${result.carry} carried skin${Number(result.carry)===1?"":"s"}`:"Tiebreaker cleared")
      :(result.winner_name?`${result.winner_name} wins hole ${result.hole}`:`Hole ${result.hole} is a carry`);
  try{
    scoreState=await window.HBNFCanonical.read("skins_score_state",{round_date:result.round_date});paint();
    status(`${outcome} · confirmed on the authoritative scorecard · ${new Date(scoreState.updated_at).toLocaleTimeString()}`);
  }catch{status(`${outcome} · save confirmed; authoritative readback unavailable. Refresh before the next edit.`,true);}
}
if(sectionNode&&window.HBNFCanonical){
  sectionNode.addEventListener("change",paintCards);cardNode.addEventListener("change",paintHoles);holeNode.addEventListener("change",paintWinners);winnerNode.addEventListener("change",paintWinners);
  aceWinnerNode.addEventListener("change",paintAce);
  $("skinsRefresh").addEventListener("click",refresh);$("skinsSave").addEventListener("click",save);$("skinsAceSave").addEventListener("click",saveAce);
  paintWinners();paintAce();refresh();
}
