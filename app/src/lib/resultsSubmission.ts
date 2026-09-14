export type OrganizerScoreType = 'to_par' | 'total_score' | 'points';

export type OrganizerResultRow = {
  division_code: string;
  place: number;
  player_name: string;
  value: number;
};

export type ParsedOrganizerResults = {
  rows: OrganizerResultRow[];
  divisions: string[];
  errors: string[];
};

function splitCsv(line: string) {
  const cells:string[]=[];
  let current='';
  let quoted=false;
  for(let i=0;i<line.length;i+=1){
    const char=line[i]!;
    if(char==='"'){
      if(quoted&&line[i+1]==='"'){current+='"';i+=1;}
      else quoted=!quoted;
      continue;
    }
    if(char===','&&!quoted){cells.push(current.trim());current='';continue;}
    current+=char;
  }
  cells.push(current.trim());
  return cells;
}

function splitLine(line:string, delimiter:'tab'|'comma') {
  return delimiter==='tab' ? line.split('\t').map(value=>value.trim()) : splitCsv(line);
}

function headerKey(value:string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}

function findHeaderIndex(headers:string[], aliases:string[]) {
  return headers.findIndex(header=>aliases.includes(header));
}

export function parseOrganizerResultsText(input:string, scoreType:OrganizerScoreType):ParsedOrganizerResults {
  const lines=input.replace(/\r/g,'').split('\n').map(line=>line.trim()).filter(Boolean);
  if(!lines.length)return {rows:[],divisions:[],errors:['Paste at least one result row.']};
  if(lines.length>301)return {rows:[],divisions:[],errors:['A submission can contain at most 300 result rows.']};

  const delimiter:'tab'|'comma'=lines.some(line=>line.includes('\t'))?'tab':'comma';
  const first=splitLine(lines[0]!,delimiter);
  const normalized=first.map(headerKey);
  const divisionIndex=findHeaderIndex(normalized,['division','division_code','div']);
  const placeIndex=findHeaderIndex(normalized,['place','position','rank']);
  const playerIndex=findHeaderIndex(normalized,['player','player_name','name','player_team','team']);
  const scoreIndex=findHeaderIndex(normalized,['score','value','total','to_par','points']);
  const hasHeader=[divisionIndex,placeIndex,playerIndex,scoreIndex].every(index=>index>=0);
  const indexes=hasHeader?{division:divisionIndex,place:placeIndex,player:playerIndex,score:scoreIndex}:{division:0,place:1,player:2,score:3};
  const dataLines=hasHeader?lines.slice(1):lines;
  const rows:OrganizerResultRow[]=[];
  const errors:string[]=[];
  const seen=new Set<string>();

  dataLines.forEach((line,offset)=>{
    const lineNumber=offset+(hasHeader?2:1);
    const cells=splitLine(line,delimiter);
    const division=(cells[indexes.division]??'').trim().toUpperCase();
    const player=(cells[indexes.player]??'').trim();
    const place=Number((cells[indexes.place]??'').trim());
    const rawScore=(cells[indexes.score]??'').trim();
    const value=/^e$/i.test(rawScore)?0:Number(rawScore.replace(/^\+/,''));

    if(!division||division.length>24){errors.push(`Line ${lineNumber}: enter a division code.`);return;}
    if(!Number.isInteger(place)||place<1||place>999){errors.push(`Line ${lineNumber}: place must be a whole number from 1 to 999.`);return;}
    if(!player||player.length>160){errors.push(`Line ${lineNumber}: enter a player or team name.`);return;}
    if(!Number.isFinite(value)){errors.push(`Line ${lineNumber}: score must be numeric${scoreType==='to_par'?' (or E for even)':''}.`);return;}
    if((scoreType==='to_par'||scoreType==='total_score')&&!Number.isInteger(value)){errors.push(`Line ${lineNumber}: this score type requires whole numbers.`);return;}
    if(scoreType==='total_score'&&value<=0){errors.push(`Line ${lineNumber}: total score must be greater than zero.`);return;}
    if(scoreType==='points'&&value<0){errors.push(`Line ${lineNumber}: points cannot be negative.`);return;}

    const key=`${division}|${place}|${player.toLowerCase()}`;
    if(seen.has(key)){errors.push(`Line ${lineNumber}: duplicate result row.`);return;}
    seen.add(key);
    rows.push({division_code:division,place,player_name:player,value});
  });

  if(!dataLines.length)errors.push('Paste at least one result row below the header.');
  const divisions=Array.from(new Set(rows.map(row=>row.division_code)));
  return {rows,divisions,errors};
}
