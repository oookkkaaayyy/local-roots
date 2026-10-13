// @ts-nocheck
const clean=(s:any)=>String(s??"").trim().replace(/\s*\/\s*/g,"/").replace(/\s+/g," ");
const cards=(s:any)=>Array.isArray(s?.cards)?s.cards:[];
export function laDate(){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
function hasNames(s:any,team:boolean){return cards(s).some((c:any)=>String(team?c?.teamsText??"":c?.playersText??"").trim());}
export function skinsSectionLocked(section:any){const list=cards(section);return !!section?.scoresLocked||(list.length>0&&list.every(card=>!!(card?.scoresLocked||card?.finalized)));}
export function projectSkinsForMatrix(skins:any,today=laDate()){
  const weeks=skins?.weeks;
  if(!weeks||typeof weeks!=="object"||Array.isArray(weeks))return null;
  const projectedWeeks:Record<string,any>={};
  for(const [date,week] of Object.entries(weeks)){
    if(!week||typeof week!=="object"||Array.isArray(week))continue;
    const current=date===today;
    const projectSection=(section:any,team:boolean,includeScores:boolean,includeAceWinner=true)=>{
      if(!section||typeof section!=="object"||Array.isArray(section))return undefined;
      const projected:any={};
      const participantField=team?"teamsText":"playersText";
      if(Array.isArray(section.cards))projected.cards=section.cards.map((card:any)=>{
        const out:any={};
        if(typeof card?.[participantField]==="string")out[participantField]=card[participantField];
        if(includeScores&&card?.winners&&typeof card.winners==="object")out.winners=card.winners;
        if(includeScores&&card?.id!=null)out.id=card.id;
        if(includeScores&&card?.scoresLocked===true)out.scoresLocked=true;
        if(includeScores&&card?.finalized===true)out.finalized=true;
        return out;
      });
      if(includeAceWinner&&typeof section.aceWinner==="string")projected.aceWinner=section.aceWinner;
      if(includeScores&&section.scoresLocked===true)projected.scoresLocked=true;
      return projected;
    };
    const front=projectSection(week.front,false,current),back=projectSection(week.back,true,current);
    const projectedWeek:any={};
    if(front)projectedWeek.front=front;
    const deferBack=current&&hasNames(week.back,true)&&!skinsSectionLocked(week.front);
    if(back&&!deferBack)projectedWeek.back=back;
    if(deferBack){
      // Preserve Back 9's ace-pot participant count without letting the
      // installed selector mistake its preloaded team names for the active nine.
      projectedWeeks[`${today}~pending-back-ace`]={back:projectSection(week.back,true,false,false)};
    }
    projectedWeeks[date]=projectedWeek;
  }
  return {skins:{weeks:projectedWeeks}};
}
function winnerIdx(card:any,hole:number,team:boolean){const m=String(card?.winners?.[String(hole)]??"").match(team?/_team_(\d+)$/ : /_p_(\d+)$/);return m?Number(m[1]):null;}
function skinsEntries(section:any,team:boolean,start:number){const out:string[]=[];for(const c of cards(section)){const names=String(team?c?.teamsText??"":c?.playersText??"").split(/\r?\n/).map(clean).filter(Boolean),counts=new Array(names.length).fill(0);let carry=1;for(let h=start;h<start+9;h++){const i=winnerIdx(c,h,team);if(i!==null&&i>=0&&i<names.length){counts[i]+=carry;carry=1;}else carry++;}const tb=String(c?.winners?.tb??"");if(carry>1&&tb){const m=tb.match(team?/_team_(\d+)$/ : /_p_(\d+)$/);if(m){const i=Number(m[1]);if(i>=0&&i<names.length)counts[i]+=carry-1;}}names.forEach((n:string,i:number)=>out.push(`${n} ${counts[i]??0}`));}return out;}
function glowEntries(w:any){const pars=w?.scorecardText?.holePars??{},out:string[]=[];for(const p of(Array.isArray(w?.players)?w.players:[])){if(p?.removed)continue;const name=clean((p?.partner1&&p?.partner2)?`${p.partner1}/${p.partner2}`:(p?.name||p?.partner1));if(!name)continue;let raw=0,par=0,done=0;for(let i=0;i<(Array.isArray(p?.scores)?p.scores:[]).length;i++){const sv=String(p.scores[i]??"").trim();if(!sv)continue;const s=Number(sv);if(!Number.isFinite(s))continue;raw+=s;done++;const pv=Number(pars[String(i+1)]);par+=(Number.isFinite(pv)&&pv>0)?pv:3;}const rel=raw-par,v=done===0?"E":rel===0?"E":rel>0?`+${rel}`:String(rel);out.push(`${name} ${v}`);}return out;}
function skinsPlayerCount(section:any,team:boolean){let n=0;for(const c of cards(section)){const lines=String(team?c?.teamsText??"":c?.playersText??"").split(/\r?\n/).map(clean).filter(Boolean);n+=team?lines.reduce((s:number,l:string)=>s+Math.max(1,l.split("/").map(clean).filter(Boolean).length),0):lines.length;}return n;}
export function skinsAcePot(state:any){let pot=0;for(const k of Object.keys(state?.skins?.weeks??{}).sort()){const w=state.skins.weeks[k]??{},f=skinsPlayerCount(w.front,false);if(f)pot+=f;if(f&&String(w?.front?.aceWinner??"").trim())pot=0;const b=skinsPlayerCount(w.back,true);if(b)pot+=b;if(b&&String(w?.back?.aceWinner??"").trim())pot=0;}return pot;}
const GLOW_ACE_SHARE=3,GLOW_ACE_MAIN_START=500,GLOW_ACE_RESERVE_START=79,GLOW_ACE_RULE_BASE_AFTER="2026-06-20",GLOW_ACE_FIRST_RESERVE_TARGET=200,GLOW_ACE_MAIN_STEP=200,GLOW_ACE_RESERVE_STEP=100;
function glowPlayerCount(w:any){return(Array.isArray(w?.players)?w.players:[]).reduce((s:number,p:any)=>{if(p?.removed)return s;const ns=[clean(p?.partner1),clean(p?.partner2)].filter(Boolean);return s+(ns.length||(clean(p?.name)?1:0));},0);}
function glowHasScores(w:any){return(Array.isArray(w?.players)?w.players:[]).some((p:any)=>!p?.removed&&Array.isArray(p?.scores)&&p.scores.some((v:any)=>String(v??"").trim()!==""));}
function advanceGlowAceRoute(st:any){if(st.mode==="reserve"){st.mode="main";st.mainTarget=Number(st.main||0)+GLOW_ACE_MAIN_STEP;}else{st.mode="reserve";st.reserveTarget=Number(st.reserve||0)+GLOW_ACE_RESERVE_STEP;}}
function routeGlowAceMoney(st:any,amount:number){let left=Math.max(0,Number(amount)||0),guard=0;while(left>0&&guard++<50){if(st.mode==="reserve"){const need=Number(st.reserveTarget||0)-Number(st.reserve||0);if(need<=0){advanceGlowAceRoute(st);continue;}const add=Math.min(left,need);st.reserve+=add;left-=add;}else{const need=Number(st.mainTarget||0)-Number(st.main||0);if(need<=0){advanceGlowAceRoute(st);continue;}const add=Math.min(left,need);st.main+=add;left-=add;}}}
function glowAcePot(state:any){const st:any={main:GLOW_ACE_MAIN_START,reserve:GLOW_ACE_RESERVE_START,mode:"reserve",mainTarget:GLOW_ACE_MAIN_START,reserveTarget:GLOW_ACE_FIRST_RESERVE_TARGET};for(const k of Object.keys(state?.glow?.weeks??{}).sort()){const w=state.glow.weeks[k]??{};if(!glowHasScores(w))continue;if(String(k)>GLOW_ACE_RULE_BASE_AFTER)routeGlowAceMoney(st,glowPlayerCount(w)*GLOW_ACE_SHARE);if(String(w?.aceWinner??"").trim()){st.main=Number(st.reserve||0);st.reserve=0;st.mode="reserve";st.mainTarget=Number(st.main||0);st.reserveTarget=GLOW_ACE_FIRST_RESERVE_TARGET;}}return Number(st.main||0);}
export function chooseLive(state:any){const today=laDate(),sw=state?.skins?.weeks?.[today],gw=state?.glow?.weeks?.[today];if(sw&&(hasNames(sw.front,false)||hasNames(sw.back,true))){if(hasNames(sw.back,true))return{active:true,label:"B9",event:"skins",entries:skinsEntries(sw.back,true,10),acePot:skinsAcePot(state)};return{active:true,label:"F9",event:"skins",entries:skinsEntries(sw.front,false,1),acePot:skinsAcePot(state)};}if(gw&&Array.isArray(gw?.players)&&gw.players.some((p:any)=>!p?.removed&&clean(p?.name||p?.partner1)))return{active:true,label:"GLOW",event:"glow",entries:glowEntries(gw),acePot:glowAcePot(state)};return{active:false,label:"",event:null,entries:[],acePot:skinsAcePot(state)};}
export function packScores(label:string,entries:string[],max=30){const pages:string[]=[];for(const raw of entries){const e=clean(raw).slice(0,24),text=`${label} | ${e}`;pages.push(text.length<=max?text:text.slice(0,max));}return pages.length?pages:[`${label} | SCORES STARTING`];}
