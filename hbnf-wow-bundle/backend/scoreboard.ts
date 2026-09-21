// @ts-nocheck
const W=32,H=16,BLACK="000000",NAME_COLOR="7DCD62",SCORE_COLOR="FFFFFF";
const FONT:any={
 A:["01110","10001","10001","11111","10001","10001","10001"],B:["11110","10001","10001","11110","10001","10001","11110"],
 C:["01111","10000","10000","10000","10000","10000","01111"],D:["11110","10001","10001","10001","10001","10001","11110"],
 E:["11111","10000","10000","11110","10000","10000","11111"],F:["11111","10000","10000","11110","10000","10000","10000"],
 G:["01111","10000","10000","10111","10001","10001","01111"],H:["10001","10001","10001","11111","10001","10001","10001"],
 I:["11111","00100","00100","00100","00100","00100","11111"],J:["00111","00010","00010","00010","10010","10010","01100"],
 K:["10001","10010","10100","11000","10100","10010","10001"],L:["10000","10000","10000","10000","10000","10000","11111"],
 M:["10001","11011","10101","10101","10001","10001","10001"],N:["10001","11001","10101","10011","10001","10001","10001"],
 O:["01110","10001","10001","10001","10001","10001","01110"],P:["11110","10001","10001","11110","10000","10000","10000"],
 Q:["01110","10001","10001","10001","10101","10010","01101"],R:["11110","10001","10001","11110","10100","10010","10001"],
 S:["01111","10000","10000","01110","00001","00001","11110"],T:["11111","00100","00100","00100","00100","00100","00100"],
 U:["10001","10001","10001","10001","10001","10001","01110"],V:["10001","10001","10001","10001","10001","01010","00100"],
 W:["10001","10001","10001","10101","10101","10101","01010"],X:["10001","10001","01010","00100","01010","10001","10001"],
 Y:["10001","10001","01010","00100","00100","00100","00100"],Z:["11111","00001","00010","00100","01000","10000","11111"],
 "/":["00001","00010","00100","01000","10000","00000","00000"],
 "0":["01110","10001","10011","10101","11001","10001","01110"],"1":["00100","01100","00100","00100","00100","00100","01110"],
 "2":["01110","10001","00001","00010","00100","01000","11111"],"3":["11110","00001","00001","01110","00001","00001","11110"],
 "4":["00010","00110","01010","10010","11111","00010","00010"],"5":["11111","10000","10000","11110","00001","00001","11110"],
 "6":["01110","10000","10000","11110","10001","10001","01110"],"7":["11111","00001","00010","00100","01000","01000","01000"],
 "8":["01110","10001","10001","01110","10001","10001","01110"],"9":["01110","10001","10001","01111","00001","00001","01110"],
 " ":["00000","00000","00000","00000","00000","00000","00000"]
};
const SCORE:any={
 "0":["111","101","101","101","101","101","111"],"1":["010","110","010","010","010","010","111"],"2":["110","001","001","111","100","100","111"],
 "3":["110","001","001","110","001","001","110"],"4":["101","101","101","111","001","001","001"],"5":["111","100","100","110","001","001","110"],
 "6":["011","100","100","111","101","101","111"],"7":["111","001","001","010","010","010","010"],"8":["111","101","101","111","101","101","111"],
 "9":["111","101","101","111","001","001","110"],"+":["010","010","111","010","010","000","000"],"-":["000","000","000","111","000","000","000"],
 E:["111","100","100","110","100","100","111"],"?":["110","001","001","010","010","000","010"]
};
const clean=(v:any)=>String(v??"").trim().replace(/\s+/g," ");
const nameW=(s:string)=>s?6*s.length-1:0,scoreW=(s:string)=>s?4*s.length-1:0;
function draw(buf:string[],pat:string[],x:number,y:number,color:string){for(let yy=0;yy<pat.length;yy++)for(let xx=0;xx<pat[yy].length;xx++)if(pat[yy][xx]==="1"){const px=x+xx,py=y+yy;if(px>=0&&px<W&&py>=0&&py<H)buf[py*W+px]=color;}}
function drawName(buf:string[],text:string,x:number,y:number){let cx=x;for(const ch of text){draw(buf,FONT[ch]||FONT[" "],cx,y,NAME_COLOR);cx+=6;}}
function drawScore(buf:string[],text:string,x:number,y:number){let cx=x;for(const ch of text){draw(buf,SCORE[ch]||SCORE["?"],cx,y,SCORE_COLOR);cx+=4;}}
function firstToken(name:string){return clean(name).split(/\s+/)[0]||"PLAYER";}
function maxNameChars(score:string){return Math.max(2,Math.min(4,Math.floor((31-scoreW(score))/6)));}
function primaryCode(name:string,maxChars:number){
 const parts=clean(name).split("/").map(x=>firstToken(x).replace(/[^A-Za-z0-9]/g,"").toUpperCase()).filter(Boolean);
 if(parts.length>=2){const a=parts[0]||"X",b=parts[1]||"X";if(maxChars>=4)return(a.slice(0,2)+"/"+b[0]).slice(0,maxChars);return((a[0]||"X")+"/"+(b[0]||"X")).slice(0,maxChars);}
 return(parts[0]||"PLAYER").slice(0,maxChars);
}
function alternateCode(name:string,maxChars:number,stage:number,index:number){
 const parts=clean(name).split("/").map(x=>firstToken(x).replace(/[^A-Za-z0-9]/g,"").toUpperCase()).filter(Boolean);
 if(parts.length>=2){const a=parts[0]||"X",b=parts[1]||"X";if(maxChars>=4&&stage===1)return(a[0]+"/"+b.slice(0,2)).slice(0,maxChars);if(maxChars>=4&&stage===2)return(a.slice(0,2)+"/"+b.slice(-1)).slice(0,maxChars);return((a[0]||"X")+"/"+String((index%9)+1)).slice(0,maxChars);}
 const a=parts[0]||"PLAYER";if(stage===1&&maxChars>=3)return(a.slice(0,maxChars-1)+(a.slice(-1)||"")).slice(0,maxChars);if(stage===2&&maxChars>=3)return(a[0]+a.slice(-maxChars+1)).slice(0,maxChars);return((a[0]||"P")+String((index%9)+1)).slice(0,maxChars);
}
function makeCodes(items:any[]){
 const maxes=items.map(x=>maxNameChars(String(x.score||"?"))),out=items.map((x,i)=>primaryCode(x.name,maxes[i]));
 for(let stage=1;stage<=3;stage++){const groups=new Map<string,number[]>();out.forEach((c,i)=>{const g=groups.get(c)||[];g.push(i);groups.set(c,g);});let collision=false;for(const ids of groups.values())if(ids.length>1){collision=true;for(const i of ids)out[i]=alternateCode(items[i].name,maxes[i],stage,i);}if(!collision)break;}
 return out;
}
function rgb(h:string){const s=String(h||"000000").replace("#","").padEnd(6,"0").slice(0,6);return[parseInt(s.slice(0,2),16)||0,parseInt(s.slice(2,4),16)||0,parseInt(s.slice(4,6),16)||0];}
function hx(v:number){return Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0").toUpperCase();}
export function blendFrames(a:string[],b:string[],steps=4){const out:string[][]=[];for(let k=1;k<=steps;k++){const t=k/(steps+1),f:string[]=[];for(let i=0;i<512;i++){const x=rgb(a[i]||BLACK),y=rgb(b[i]||BLACK);f.push(hx(x[0]+(y[0]-x[0])*t)+hx(x[1]+(y[1]-x[1])*t)+hx(x[2]+(y[2]-x[2])*t));}out.push(f);}return out;}
export function parseScoreEntries(entries:any[]){return(Array.isArray(entries)?entries:[]).map(raw=>{const s=clean(raw),m=s.match(/^(.*)\s+([+-]?\d+|E)$/i);return m?{name:clean(m[1]),score:String(m[2]).toUpperCase()}:{name:s||"PLAYER",score:"?"};});}
export function scoreboardPages(entries:any[]){
 const parsed=parseScoreEntries(entries),codes=makeCodes(parsed),items=parsed.map((x,i)=>({...x,code:codes[i]})),pages:any[]=[];
 for(let start=0;start<items.length;start+=2){const part=items.slice(start,start+2),buf=Array(W*H).fill(BLACK);part.forEach((it:any,j:number)=>{const y=j===0?0:9,score=String(it.score||"?").slice(0,4),code=String(it.code||"PLYR").slice(0,maxNameChars(score)),sw=scoreW(score);drawName(buf,code,0,y);drawScore(buf,score,W-1-sw,y);});pages.push({pixels:buf,items:part});}
 return pages;
}
export function scoreboardHoldMs(pageCount:number){return Math.max(4000,Math.min(24000,1200+Math.max(1,pageCount)*3000));}
