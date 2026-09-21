const W=32,H=16;
const BLACK="000000";
function blank(){return Array(W*H).fill(BLACK);}
function hex(r:number,g:number,b:number){return [r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("").toUpperCase();}
function put(f:string[],x:number,y:number,c:string){if(x>=0&&x<W&&y>=0&&y<H)f[y*W+x]=c;}
function line(f:string[],x0:number,y0:number,x1:number,y1:number,c:string){
 let dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,err=dx+dy;
 while(true){put(f,x0,y0,c);if(x0===x1&&y0===y1)break;const e2=2*err;if(e2>=dy){err+=dy;x0+=sx;}if(e2<=dx){err+=dx;y0+=sy;}}
}
function ring(f:string[],cx:number,cy:number,r:number,c:string){
 const rr=r*r,lo=Math.max(0,rr-r),hi=rr+r+1;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const dx=x-cx,dy=y-cy,d=dx*dx+dy*dy;if(d>=lo&&d<=hi)put(f,x,y,c);}
}
function star(f:string[],cx:number,cy:number,r:number,c:string){
 line(f,cx-r,cy,cx+r,cy,c);line(f,cx,cy-r,cx,cy+r,c);line(f,cx-r,cy-r,cx+r,cy+r,c);line(f,cx-r,cy+r,cx+r,cy-r,c);
}
function targetFrames(){
 const out:string[][]=[];for(let r=1;r<=7;r+=2){const f=blank();ring(f,16,8,r,"FFFFFF");if(r>2)ring(f,16,8,r-2,"FF32C8");put(f,16,8,"FFE66D");out.push(f);}return out;
}
function aceFrames(){
 const out:string[][]=[];const colors=["FF3BD4","FF9F1C","FFF27A","FFFFFF","FF3BD4"];
 for(let i=0;i<5;i++){const f=blank();star(f,16,8,Math.min(7,2+i),colors[i]);ring(f,16,8,Math.min(7,1+i),i%2?"FF9F1C":"FF3BD4");const spread=3+i*2;put(f,Math.max(0,16-spread),Math.max(0,8-(i%3+1)),"FFFFFF");put(f,Math.min(31,16+spread),Math.min(15,8+(i%3+1)),"FFFFFF");out.push(f);}return out;
}
function niceFrames(){
 const out:string[][]=[];for(let i=0;i<5;i++){const f=blank();const x=3+i*5;line(f,Math.max(0,x-8),13,x,5,"8CFF5A");line(f,Math.max(0,x-5),14,x+3,6,"FFFFFF");put(f,Math.min(31,x+5),3,"FFE66D");put(f,Math.min(31,x+7),8,"FF3BD4");out.push(f);}return out;
}
function puttFrames(){
 const out:string[][]=[];for(let i=0;i<5;i++){const f=blank();const rim=6-i;ring(f,16,8,Math.max(2,rim),"C8FF7A");line(f,16,2+i,16,13,"FFFFFF");line(f,11,5+i%3,21,5+i%3,"8CFF5A");put(f,16,Math.min(14,3+i*2),"FFE66D");out.push(f);}return out;
}
function glowFrames(){
 const out:string[][]=[];for(let i=0;i<5;i++){const f=blank();for(let r=1;r<=7;r+=3)ring(f,16,8,Math.max(1,(r+i)%8),"9D5CFF");star(f,16,8,2+(i%3),"5CFFF3");put(f,3+i*6,2+i%4,"FFFFFF");put(f,28-i*5,13-i%3,"FF3BD4");out.push(f);}return out;
}
function skinsFrames(){
 const out:string[][]=[];for(let i=0;i<5;i++){const f=blank();const r=2+i;ring(f,10,8,Math.min(6,r),"FFE66D");ring(f,22,8,Math.min(6,7-r+2),"FF8C42");line(f,10,8,22,8,i%2?"FFFFFF":"FF3BD4");out.push(f);}return out;
}
export function getWowEvent(kind:string){
 const k=String(kind||"").trim().toLowerCase();
 if(k==="ace")return{kind:k,text:"ACE!",color:[255,226,90],frames:aceFrames(),frameMs:95,holdMs:1350};
 if(k==="ctp")return{kind:k,text:"CTP",color:[255,255,255],frames:targetFrames(),frameMs:105,holdMs:1200};
 if(k==="nice_shot"||k==="nice shot")return{kind:"nice_shot",text:"NICE SHOT",color:[160,255,100],frames:niceFrames(),frameMs:90,holdMs:1300};
 if(k==="skins"||k==="skin")return{kind:"skins",text:"SKINS",color:[255,210,80],frames:skinsFrames(),frameMs:100,holdMs:1250};
 if(k==="nice_putt"||k==="nice putt")return{kind:"nice_putt",text:"NICE PUTT",color:[185,255,105],frames:puttFrames(),frameMs:95,holdMs:1250};
 if(k==="glow")return{kind:"glow",text:"GLOW",color:[160,110,255],frames:glowFrames(),frameMs:95,holdMs:1250};
 return null;
}
export function wowEventSelfTest(){
 const names=["ace","ctp","nice_shot","nice_putt","skins","glow"];for(const n of names){const e=getWowEvent(n);if(!e||e.frames.length<4)throw new Error("missing "+n);for(const f of e.frames){if(f.length!==512)throw new Error(n+" frame length");for(const p of f)if(!/^[0-9A-F]{6}$/.test(p))throw new Error(n+" pixel");}}
 return{ok:true,events:names,frames:names.map(n=>getWowEvent(n)!.frames.length)};
}
