(function(){
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const hexOk=h=>/^#[0-9A-Fa-f]{6}$/.test(h);
const hexRgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const rgbHex=a=>"#"+a.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,"0")).join("").toUpperCase();
const ss=(a,b,x)=>{const t=clamp((x-a)/((b-a)||1e-6),0,1);return t*t*(3-2*t)};
const edge=(a,v,s)=>ss(a-s/2,a+s/2,v);
const wrap=a=>{a=(a+Math.PI)%(2*Math.PI);if(a<0)a+=2*Math.PI;return a-Math.PI};
const PL=[
 {id:"star",name:"Star",fam:"star",up:1,base:"#F4F2E8"},
 {id:"gstar",name:"GStar",fam:"star",up:1.05,base:"#F2F0E6"},
 {id:"halo",name:"Halo Star",fam:"star",up:.98,base:"#F2F0E8"},
 {id:"pro",name:"Pro",fam:"star",up:.66,base:"#F1EFE5"},
 {id:"dx",name:"DX",fam:"star",up:.42,base:"#F2F0E5"},
 {id:"champion",name:"Champion",fam:"champion",up:1,base:"#DCE8E1",tr:.78}];
const BASES=["#F4F2E8","#F7E331","#F27A26","#E84C55","#59A9DE","#57A768","#8D62B6","#DCE8E1","#2B2B2E"];
const MEAS={base:"#38906F",c:{"UV Blast Green":{plate:"#8FC316",shoulder:"#69B820",rim:"#3BAF27"},"UV Blast Blaze Orange":{plate:"#B30003",shoulder:"#890507",rim:"#57090D"}}};
const TYPES={
 dip:{label:"Dip",p:{r0:.62,f:.5},g:'<circle cx="16" cy="16" r="12"/><path d="M5 22a12 12 0 0 0 22 0" stroke-width="5" opacity=".7"/>'},
 ring:{label:"Ring",p:{r0:.45,r1:.72,f:.3},g:'<circle cx="16" cy="16" r="13"/><circle cx="16" cy="16" r="6"/>'},
 wedge:{label:"Wedge",p:{a:-1.2,w:1.5,f:.3},g:'<circle cx="16" cy="16" r="13"/><path d="M16 16 L27 9 M16 16 L27 23"/>'},
 spot:{label:"Spot",p:{x:.32,y:-.25,rad:.28,f:.4},g:'<circle cx="16" cy="16" r="13"/><circle cx="21" cy="12" r="4.5"/>'}};
const uid=()=>Math.random().toString(36).slice(2,8);
const poolOf=g=>{let L=DYELIST.filter(d=>!d.c);if(g==="Inventory")L=L.filter(d=>d.i);else if(g==="ProChem")L=L.filter(d=>d.g==="ProChem");else if(g==="UV Blast")L=L.filter(d=>/UV Blast/.test(d.g)&&!d.i||/UV Blast/.test(d.n));return L};
const GROUPS=["Inventory","All","ProChem","UV Blast"];
function defState(){const a=uid(),b=uid();return{plastic:"star",base:"#F4F2E8",trans:"",pool:"Inventory",tab:"layers",mx:"mix",tg:"#2A8FD6",nd:2,sel:b,
 layers:[{id:a,type:"full",name:"Base",vis:true,dyes:[{n:"UV Blast Green",s:1}],p:{}},{id:b,type:"dip",name:"Dip",vis:true,dyes:[{n:"UV Blast Blaze Orange",s:1}],p:Object.assign({},TYPES.dip.p)}]}}
let S=defState();
try{const t=JSON.parse(localStorage.getItem("dds11")||"null");if(t&&t.layers&&t.layers.length)S=Object.assign(S,t)}catch(e){}
const save=()=>{try{localStorage.setItem("dds11",JSON.stringify(S))}catch(e){}};
const plastic=()=>PL.find(p=>p.id===S.plastic)||PL[0];
const baseL=()=>S.layers[0];
const selL=()=>S.layers.find(l=>l.id===S.sel)||S.layers[S.layers.length-1];
const transHex=()=>{if(hexOk(S.trans))return S.trans.toUpperCase();const p=plastic(),t=p.tr||.7,l=.38+.36*t;return rgbHex(hexRgb(S.base).map(v=>v+(255-v)*l))};
const pathAt=(r,p)=>{if(p.fam!=="champion")return 1;if(r<.58)return .64+r*.20;if(r<.84)return .78+(r-.58)*1.25;return 1.10+(r-.84)*3.10};
const zoneAt=r=>r<.58?"plate":r<.84?"shoulder":"rim";
function measured(its,r){const p=plastic();if(p.fam!=="champion"||its.length!==1)return null;const a=MEAS.c[its[0].name];if(!a)return null;
 if(Math.abs(its[0].s/p.up-1)>.1)return null;
 const m=hexRgb(MEAS.base),d=hexRgb(S.base).reduce((s,v,i)=>s+(v-m[i])**2,0);if(Math.sqrt(d)>48)return null;return a[zoneAt(r)]}
function colorAt(its,r,mc){
 const p=plastic();
 const m=measured(its,r);if(m&&!mc)return{hex:m,measured:true};
 const sp={baseHex:S.base,transHex:transHex(),family:p.fam,scene:"outdoor",zone:zoneAt(r),path:pathAt(r,p),items:its};
 const o=DE.predict(sp,mc?{mc}:{});
 return{hex:m||o.hex,spread:o.spread,lab:o.lab,gamut:o.gamutExcess>.02,measured:!!m};
}
// ---------- layer masks ----------
function maskW(L,x,y,r,ang){const p=L.p;
 switch(L.type){
 case"full":return 1;
 case"dip":return edge(p.r0,r,Math.max(.01,p.f*.5));
 case"ring":{const s=Math.max(.01,p.f*.5);return edge(p.r0,r,s)*(1-edge(p.r1,r,s))}
 case"wedge":return 1-edge(p.w/2,Math.abs(wrap(ang-p.a)),Math.max(.01,p.f*.8));
 case"spot":return 1-edge(p.rad,Math.hypot(x-p.x,y-p.y),Math.max(.01,p.f*.6*p.rad+.01))}
 return 0}
const upOf=()=>plastic().up;
function itemsFor(ws,layers){const up=upOf(),out=[];
 for(let i=0;i<layers.length;i++){const w=ws[i];if(!(w>.02))continue;for(const d of layers[i].dyes)out.push({name:d.n,s:Math.max(0,d.s*up*w)})}
 return out}
function weightsAt(x,y){const r=Math.hypot(x,y),ang=Math.atan2(y,x);return S.layers.map(L=>L.vis&&L.dyes.length?maskW(L,x,y,r,ang):0)}
function colorAtPt(x,y,mc){const r=Math.hypot(x,y);return colorAt(itemsFor(weightsAt(x,y),S.layers),r,mc)}
function layerAt(x,y){const ws=weightsAt(x,y);for(let i=S.layers.length-1;i>0;i--)if(ws[i]>.5)return S.layers[i];return S.layers[0]}
// ---------- rendering ----------
const cv=$("#cv"),ov=$("#ov"),sq=$(".sq"),vw=$(".vw");let B=800;const oc=document.createElement("canvas");
const NB=96;
function renderDisc(W){
 const layers=S.layers,n=layers.length,hasW=layers.some(l=>l.type==="wedge"&&l.vis&&l.dyes.length);
 const act=layers.map(l=>l.vis&&l.dyes.length>0);
 const cache=new Map();
 const img=new ImageData(W,W),d=img.data,c=W/2,R=W*.46,ws=new Array(n).fill(0),qs=new Array(n).fill(0);
 for(let y=0;y<W;y++)for(let x=0;x<W;x++){
  const u=(x+.5-c)/R,v=(y+.5-c)/R,r=Math.hypot(u,v);if(r>1.02||r<.12)continue;
  const ang=hasW?Math.atan2(v,u):0;let key=Math.min(NB-1,Math.round(r*(NB-1)));
  for(let i=0;i<n;i++){const w=act[i]?maskW(layers[i],u,v,r,ang):0;const q=Math.round(w*12);qs[i]=q;key=key*13+q}
  let rgb=cache.get(key);
  if(!rgb){for(let i=0;i<n;i++)ws[i]=qs[i]/12;const rr=Math.min(NB-1,Math.round(r*(NB-1)))/(NB-1);rgb=hexRgb(colorAt(itemsFor(ws,layers),rr).hex);cache.set(key,rgb)}
  const lip=ss(.88,.99,r),hole=1-ss(.12,.2,r),lit=1+.05*(-(u+v)*.7);
  const sh=lit*(1-.16*lip)*(1-.22*hole);
  const a=clamp((1-r)*R/1.1,0,1)*clamp((r-.14)*R/1.1,0,1);
  const k=(y*W+x)*4;d[k]=rgb[0]*sh;d[k+1]=rgb[1]*sh;d[k+2]=rgb[2]*sh;d[k+3]=a*255}
 return img}
let fastT=null;
function paint(fast){
 const W=fast?Math.max(240,Math.round(B/3)):B;oc.width=oc.height=W;oc.getContext("2d").putImageData(renderDisc(W),0,0);
 const ctx=cv.getContext("2d");ctx.clearRect(0,0,B,B);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(oc,0,0,B,B);
 clearTimeout(fastT);if(fast)fastT=setTimeout(()=>paint(false),140)}
// ---------- overlay: outline + handles ----------
const UI={edit:false,flashUntil:0,pt:{x:.5,y:0},drag:null,hideT:null,raf:0};
const P2=(u,v)=>[B/2+u*B*.46,B/2+v*B*.46];
function outline(ctx,L){const R=B*.46,c=B/2;
 const circ=r=>{ctx.beginPath();ctx.arc(c,c,r*R,0,7);ctx.stroke()};
 if(L.type==="full")circ(.995);
 else if(L.type==="dip")circ(L.p.r0);
 else if(L.type==="ring"){circ(L.p.r0);circ(L.p.r1)}
 else if(L.type==="wedge"){for(const s of[-1,1]){const a=L.p.a+s*L.p.w/2;ctx.beginPath();ctx.moveTo(c+Math.cos(a)*.14*R,c+Math.sin(a)*.14*R);ctx.lineTo(c+Math.cos(a)*.995*R,c+Math.sin(a)*.995*R);ctx.stroke()}
  ctx.beginPath();ctx.arc(c,c,.995*R,L.p.a-L.p.w/2,L.p.a+L.p.w/2);ctx.stroke()}
 else if(L.type==="spot"){ctx.beginPath();ctx.arc(c+L.p.x*R,c+L.p.y*R,L.p.rad*R,0,7);ctx.stroke()}}
function handles(L){const p=L.p,q=-Math.PI/4;
 if(L.type==="dip")return[{id:"r0",u:Math.cos(q)*p.r0,v:Math.sin(q)*p.r0}];
 if(L.type==="ring")return[{id:"r0",u:Math.cos(q)*p.r0,v:Math.sin(q)*p.r0},{id:"r1",u:Math.cos(q)*p.r1,v:Math.sin(q)*p.r1}];
 if(L.type==="wedge")return[{id:"a0",u:Math.cos(p.a-p.w/2)*.9,v:Math.sin(p.a-p.w/2)*.9},{id:"a1",u:Math.cos(p.a+p.w/2)*.9,v:Math.sin(p.a+p.w/2)*.9},{id:"c",u:Math.cos(p.a)*.5,v:Math.sin(p.a)*.5}];
 if(L.type==="spot")return[{id:"c",u:p.x,v:p.y},{id:"rad",u:p.x+p.rad,v:p.y}];
 return[]}
function dragTo(L,id,u,v){const p=L.p,r=Math.hypot(u,v);
 if(L.type==="dip")p.r0=clamp(r,.15,.98);
 else if(L.type==="ring"){if(id==="r0")p.r0=clamp(r,.14,p.r1-.05);else p.r1=clamp(r,p.r0+.05,.99)}
 else if(L.type==="wedge"){if(id==="c")p.a=Math.atan2(v,u);else p.w=clamp(2*Math.abs(wrap(Math.atan2(v,u)-p.a)),.15,6)}
 else if(L.type==="spot"){if(id==="c"){const k=Math.hypot(u,v),m=k>.98?.98/k:1;p.x=u*m;p.y=v*m}else p.rad=clamp(Math.hypot(u-p.x,v-p.y),.04,.9)}}
function drawOv(){const ctx=ov.getContext("2d");ctx.clearRect(0,0,B,B);const now=performance.now(),L=selL();
 const fa=clamp((UI.flashUntil-now)/350,0,1),a=UI.edit?1:fa;
 if(a>0){ctx.save();ctx.globalAlpha=a;ctx.lineCap="round";ctx.setLineDash([B*.012,B*.012]);
  ctx.strokeStyle="rgba(0,0,0,.6)";ctx.lineWidth=B*.007;outline(ctx,L);
  ctx.strokeStyle="#fff";ctx.lineWidth=B*.003;outline(ctx,L);ctx.restore()}
 if(fa>0&&!UI.edit){const[x,y]=P2(UI.pt.x,UI.pt.y);ctx.save();ctx.globalAlpha=fa;ctx.beginPath();ctx.arc(x,y,B*.012,0,7);ctx.lineWidth=B*.006;ctx.strokeStyle="rgba(0,0,0,.6)";ctx.stroke();ctx.lineWidth=B*.003;ctx.strokeStyle="#fff";ctx.stroke();ctx.restore()}
 if(UI.edit)for(const h of handles(L)){const[x,y]=P2(h.u,h.v);ctx.beginPath();ctx.arc(x,y,B*.017,0,7);ctx.fillStyle="#fff";ctx.fill();ctx.lineWidth=B*.006;ctx.strokeStyle="rgba(0,0,0,.65)";ctx.stroke();ctx.beginPath();ctx.arc(x,y,B*.006,0,7);ctx.fillStyle=UI.drag&&UI.drag.id===h.id?"#5ec2a1":"#222";ctx.fill()}
 if(a>0&&!UI.edit&&UI.flashUntil>now)UI.raf=requestAnimationFrame(drawOv);else UI.raf=0}
function flash(ms){UI.flashUntil=performance.now()+(ms||1100);if(!UI.raf)UI.raf=requestAnimationFrame(drawOv);else drawOv()}
function setEdit(on){UI.edit=on;clearTimeout(UI.hideT);drawOv();const b=$("[data-act=reshape]");if(b)b.classList.toggle("on",on)}
function hideSoon(){clearTimeout(UI.hideT);UI.hideT=setTimeout(()=>setEdit(false),2600)}
// ---------- pointer ----------
function toUV(e){const r=ov.getBoundingClientRect(),X=(e.clientX-r.left)/r.width*B,Y=(e.clientY-r.top)/r.height*B;return{u:(X-B/2)/(B*.46),v:(Y-B/2)/(B*.46),X,Y}}
function hit(e){const t=toUV(e),L=selL(),dpr=B/ov.getBoundingClientRect().width;let best=null,bd=1e9;
 for(const h of handles(L)){const[x,y]=P2(h.u,h.v),d=Math.hypot(x-t.X,y-t.Y);if(d<bd){bd=d;best=h}}
 return best&&bd<34*dpr?best:null}
let down=null;
ov.addEventListener("contextmenu",e=>e.preventDefault());
ov.addEventListener("pointerdown",e=>{ov.setPointerCapture(e.pointerId);const t=toUV(e);
 if(UI.edit){const h=hit(e);if(h){UI.drag={id:h.id};clearTimeout(UI.hideT);drawOv();return}}
 down={x:e.clientX,y:e.clientY,t:performance.now(),t0:t,moved:false,fired:false};
 down.lp=setTimeout(()=>{if(!down||down.moved)return;down.fired=true;const r=Math.hypot(down.t0.u,down.t0.v);if(r<1.02&&r>.12){selectLayer(layerAt(down.t0.u,down.t0.v).id,true);if(selL().type!=="full")setEdit(true,hideSoon());else flash(1200)}},380)});
ov.addEventListener("pointermove",e=>{
 if(UI.drag){const t=toUV(e);dragTo(selL(),UI.drag.id,t.u,t.v);paint(true);drawOv();syncShape();return}
 if(down&&!down.moved&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>10){down.moved=true;clearTimeout(down.lp)}});
ov.addEventListener("pointerup",e=>{
 if(UI.drag){UI.drag=null;commit();paint(false);drawOv();hideSoon();readout();return}
 if(!down)return;clearTimeout(down.lp);const d=down;down=null;
 if(d.fired){hideSoon();return}
 if(d.moved)return;
 const r=Math.hypot(d.t0.u,d.t0.v);if(UI.edit)setEdit(false);
 if(r<1.02&&r>.12){UI.pt={x:d.t0.u,y:d.t0.v};selectLayer(layerAt(d.t0.u,d.t0.v).id,true)}});
ov.addEventListener("pointercancel",()=>{if(down){clearTimeout(down.lp);down=null}UI.drag=null});
// ---------- history ----------
let H=[],hi=-1;
const snap=()=>JSON.stringify({plastic:S.plastic,base:S.base,trans:S.trans,layers:S.layers,sel:S.sel});
function commit(){save();const s=snap();if(H[hi]===s)return;H=H.slice(0,hi+1);H.push(s);if(H.length>80)H.shift();hi=H.length-1;undoBtns()}
function restore(s){Object.assign(S,JSON.parse(s));if(!S.layers.some(l=>l.id===S.sel))S.sel=S.layers[S.layers.length-1].id;save();all()}
function undoBtns(){$("#undo").classList.toggle("dis",hi<=0);$("#redo").classList.toggle("dis",hi>=H.length-1)}
$("#undo").onclick=()=>{if(hi>0){hi--;restore(H[hi]);undoBtns()}};
$("#redo").onclick=()=>{if(hi<H.length-1){hi++;restore(H[hi]);undoBtns()}};
// ---------- readout ----------
function lch(lab){return lab?{L:lab[0],C:Math.hypot(lab[1],lab[2]),h:(Math.atan2(lab[2],lab[1])*57.296+360)%360}:null}
function acc(m){if(m.measured)return"Accuracy Exact";if(m.spread===undefined)return"";return"Accuracy "+(m.spread<3?"High":m.spread<6?"Medium":"Low")}
function readout(){
 const a=Math.atan2(UI.pt.y,UI.pt.x),pr=Math.hypot(UI.pt.x,UI.pt.y);
 const main=colorAtPt(UI.pt.x,UI.pt.y,32),q=lch(main.lab);
 const pts=[.35,.72,.93].map(r=>colorAtPt(Math.cos(a)*r,Math.sin(a)*r));
 $("#rd").innerHTML=`<i class="big" style="background:${main.hex}"></i><div class="m"><div class="hx">${main.hex}</div><div class="st">${acc(main)}</div></div><div class="zs">${pts.map((p,i)=>`<div><b style="background:${p.hex}"></b>${["Center","Mid","Rim"][i]}<br>${p.hex}</div>`).join("")}</div>`}
// ---------- dye swatches ----------
let swKey="",swC={};
function dyeHex(n){const k=S.plastic+S.base+S.trans;if(k!==swKey){swKey=k;swC={}}if(!swC[n])swC[n]=colorAt([{name:n,s:upOf()}],.5).hex;return swC[n]}
function layerHex(L){const its=L.dyes.map(d=>({name:d.n,s:d.s*upOf()}));return colorAt(its,.5).hex}
function hueOf(h){const[r,g,b]=hexRgb(h).map(v=>v/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(d<.06)return 400+(1-mx);let x=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;return(x*60+360)%360}
// ---------- picker sheet ----------
let pickCb=null,pickG="Inventory",pickQ="";
function openPick(cb){pickCb=cb;pickG=S.pool;pickQ="";$("#pq").value="";$("#sheet").classList.add("open");drawPick()}
function closePick(){$("#sheet").classList.remove("open");pickCb=null}
function drawPick(){
 $("#pch").innerHTML=GROUPS.map(g=>`<button data-g="${g}" class="${pickG===g?"on":""}">${g}</button>`).join("");
 const q=pickQ.trim().toLowerCase();
 const L=poolOf(pickG).filter(d=>!q||d.n.toLowerCase().includes(q)).map(d=>({n:d.n,h:dyeHex(d.n)})).sort((a,b)=>hueOf(a.h)-hueOf(b.h));
 $("#pgr").innerHTML=L.map(d=>`<button class="dc" data-n="${esc(d.n)}"><i style="background:${d.h}"></i><span>${esc(d.n)}</span></button>`).join("")}
$("#pch").addEventListener("click",e=>{const b=e.target.closest("[data-g]");if(b){pickG=b.dataset.g;drawPick()}});
$("#pq").addEventListener("input",e=>{pickQ=e.target.value;drawPick()});
$("#pgr").addEventListener("click",e=>{const b=e.target.closest("[data-n]");if(b&&pickCb){const f=pickCb;closePick();f(b.dataset.n)}});
$("#px").onclick=closePick;$("#sheet").addEventListener("click",e=>{if(e.target.id==="sheet")closePick()});
// ---------- panel ----------
const EYE='<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const SHAPES={
 dip:[["Reach","reach",2,80,L=>Math.round((1-L.p.r0)*100),(L,v)=>L.p.r0=1-v/100]],
 ring:[["Inner","r0",5,94,L=>Math.round(L.p.r0*100),(L,v)=>L.p.r0=Math.min(v/100,L.p.r1-.04)],["Outer","r1",10,99,L=>Math.round(L.p.r1*100),(L,v)=>L.p.r1=Math.max(v/100,L.p.r0+.04)]],
 wedge:[["Angle","a",-180,180,L=>Math.round(L.p.a*57.296),(L,v)=>L.p.a=v/57.296],["Width","w",10,340,L=>Math.round(L.p.w*57.296),(L,v)=>L.p.w=v/57.296]],
 spot:[["X","x",-95,95,L=>Math.round(L.p.x*100),(L,v)=>L.p.x=v/100],["Y","y",-95,95,L=>Math.round(L.p.y*100),(L,v)=>L.p.y=v/100],["Size","rad",4,90,L=>Math.round(L.p.rad*100),(L,v)=>L.p.rad=v/100]]};
const slider=(id,k,i,lo,hi,val,name,unit)=>`<div class="sl"><span class="nm">${name}</span><input type="range" min="${lo}" max="${hi}" value="${val}" data-id="${id}" data-k="${k}" data-i="${i}" style="--v:${(val-lo)/(hi-lo)*100}%"><span class="pc" data-for="${id}${k}${i}">${val}${unit}</span></div>`;
function layerCard(L){const sel=L.id===S.sel;
 const sum=L.dyes.map(d=>esc(d.n)+" "+Math.round(d.s*100)+"%").join(" + ");
 let h=`<div class="lc${sel?" sel":""}"><div class="lh" data-act="sel" data-id="${L.id}"><i class="sw" style="background:${layerHex(L)}"></i><div class="ln"><b>${esc(L.name)}</b><span>${sum}</span></div><button class="ic${L.vis?"":" off"}" data-act="vis" data-id="${L.id}">${EYE}</button></div>`;
 if(sel){h+=`<div class="lb">`;
  L.dyes.forEach((d,i)=>{h+=`<div class="dr"><button class="dsw" data-act="dyepick" data-i="${i}"><i style="background:${dyeHex(d.n)}"></i></button><button class="dn" data-act="dyepick" data-i="${i}">${esc(d.n)}</button><span class="pc" data-for="${L.id}s${i}">${Math.round(d.s*100)}%</span><button class="ic" data-act="dyedel" data-i="${i}">×</button></div>`+
   `<input type="range" min="5" max="150" value="${Math.round(d.s*100)}" data-id="${L.id}" data-k="s" data-i="${i}" style="--v:${(Math.round(d.s*100)-5)/145*100}%">`});
  h+=`<div class="row" style="margin-top:10px"><button class="g" data-act="dyeadd">+ Dye</button></div>`;
  if(L.type!=="full"){h+=`<div class="lbl">Shape</div>`+SHAPES[L.type].map(([nm,k,lo,hi,get],i)=>slider(L.id,"p"+k,i,lo,hi,get(L),nm,k==="a"||k==="w"?"°":"%")).join("")+slider(L.id,"pf",9,0,100,Math.round(L.p.f*100),"Softness","%")+
   `<div class="foot"><button data-act="reshape" class="${UI.edit?"on":""}">Reshape</button><button data-act="dup">Duplicate</button><button data-act="del" class="dg">Delete</button></div>`}
  h+=`</div>`}
 return h+`</div>`}
function tabLayers(){
 let h=`<div class="row" style="margin-bottom:10px"><button class="g${S.addOpen?" on":""}" data-act="addtoggle">+ Layer</button></div>`;
 if(S.addOpen)h+=`<div class="add">`+Object.entries(TYPES).map(([k,t])=>`<button data-act="addlayer" data-t="${k}"><svg viewBox="0 0 32 32">${t.g}</svg>${t.label}</button>`).join("")+`</div>`;
 for(let i=S.layers.length-1;i>=0;i--)h+=layerCard(S.layers[i]);return h}
const colorField=(id,val)=>`<div class="cl"><input type="color" id="${id}C" value="${val}"><input type="text" id="${id}H" value="${val}" maxlength="7" autocapitalize="characters" autocorrect="off" spellcheck="false"></div>`;
function tabDisc(){
 let h=`<div class="lbl">Plastic</div><div class="pl">`+PL.map(p=>`<button data-act="plastic" data-id="${p.id}" class="${p.id===S.plastic?"on":""}">${p.name}</button>`).join("")+`</div>`;
 h+=`<div class="lbl">Base</div><div class="bs">`+BASES.map(b=>`<button data-act="base" data-c="${b}" class="${b===S.base.toUpperCase()?"on":""}" style="background:${b}"></button>`).join("")+`</div>`+colorField("b",S.base);
 if(plastic().fam==="champion")h+=`<div class="lbl">Tint</div>`+colorField("t",transHex());
 return h}
function names(){return poolOf(S.pool).map(d=>d.n).slice(0,24)}
const sh=n=>n.replace(/^(ProChem |iDye Poly )/,"");
const chips=()=>`<div class="ch">`+GROUPS.map(g=>`<button data-act="pool" data-g="${g}" class="${S.pool===g?"on":""}">${g}</button>`).join("")+`</div>`;
function tabExplore(){
 return chips()+`<div class="seg" style="margin-bottom:10px"><button data-act="mx" data-m="mix" class="${S.mx==="mix"?"on":""}">Mix</button><button data-act="mx" data-m="base" class="${S.mx==="base"?"on":""}">Bases</button></div><div class="gr" id="grid"></div>`}
function fillGrid(){const g=$("#grid");if(!g)return;const N=names(),up=upOf(),keep=S.base;let t=`<table><tr><th class="c"></th>`+N.map(n=>`<th>${esc(sh(n).slice(0,9))}</th>`).join("")+`</tr>`;
 if(S.mx==="mix"){N.forEach(a=>{t+=`<tr><th class="l">${esc(sh(a).slice(0,14))}</th>`+N.map(b=>{const its=a===b?[{name:a,s:up}]:[{name:a,s:.6*up},{name:b,s:.6*up}];return`<td><div data-a="${esc(a)}" data-b="${esc(b)}" style="background:${colorAt(its,.5).hex}"></div></td>`}).join("")+`</tr>`})}
 else{BASES.forEach(bh=>{S.base=bh;t+=`<tr><th class="l">${bh}</th>`+N.map(n=>`<td><div data-bc="${bh}" data-a="${esc(n)}" style="background:${colorAt([{name:n,s:up}],.5).hex}"></div></td>`).join("")+`</tr>`});S.base=keep}
 g.innerHTML=t+"</table>"}
function tabRecipe(){
 return chips()+`<div class="cl" style="margin-top:0"><input type="color" id="gC" value="${S.tg.toLowerCase()}"><input type="text" id="gH" value="${S.tg}" maxlength="7" autocapitalize="characters" autocorrect="off" spellcheck="false"></div>`+
 `<div class="seg" style="margin-top:10px">`+[1,2,3].map(n=>`<button data-act="nd" data-n="${n}" class="${S.nd===n?"on":""}">${n}</button>`).join("")+`<button data-act="grab">Sample</button><button class="pri" data-act="solve">Find</button></div><div id="rec"></div>`}
function panel(){const b=$("#body"),y=b.scrollTop;
 b.innerHTML=S.tab==="layers"?tabLayers():S.tab==="disc"?tabDisc():S.tab==="explore"?tabExplore():tabRecipe();
 document.querySelectorAll("#tabs button").forEach(x=>x.classList.toggle("on",x.dataset.t===S.tab));
 if(S.tab==="explore")fillGrid();b.scrollTop=y}
function all(){paint(false);drawOv();readout();panel();undoBtns()}
function selectLayer(id,fl){S.sel=id;if(S.tab!=="layers")S.tab="layers";save();readout();panel();if(fl)flash(1100);else drawOv()}
function syncShape(){const L=selL(),sp=SHAPES[L.type]||[];sp.forEach(([nm,k,lo,hi,get],i)=>{const v=get(L),inp=document.querySelector(`[data-id="${L.id}"][data-k="p${k}"]`);if(inp){inp.value=v;inp.style.setProperty("--v",(v-lo)/(hi-lo)*100+"%")}const o=document.querySelector(`[data-for="${L.id}p${k}${i}"]`);if(o)o.textContent=v+(k==="a"||k==="w"?"°":"%")})}
// panel events
const body=$("#body");
body.addEventListener("click",e=>{const t=e.target.closest("[data-act]");if(!t)return;const a=t.dataset.act,L=selL();
 if(a==="sel"){if(e.target.closest("[data-act=vis]"))return;selectLayer(t.dataset.id,true)}
 else if(a==="vis"){const l=S.layers.find(x=>x.id===t.dataset.id);l.vis=!l.vis;commit();all()}
 else if(a==="addtoggle"){S.addOpen=!S.addOpen;panel()}
 else if(a==="addlayer"){const ty=t.dataset.t,n=S.layers.filter(l=>l.type===ty).length,pool=poolOf("Inventory"),used=new Set(S.layers.flatMap(l=>l.dyes.map(d=>d.n))),pick=(pool.find(d=>!used.has(d.n))||pool[0]).n;
  const N={id:uid(),type:ty,name:TYPES[ty].label+(n?" "+(n+1):""),vis:true,dyes:[{n:pick,s:1}],p:Object.assign({},TYPES[ty].p)};S.layers.push(N);S.sel=N.id;S.addOpen=false;commit();all();flash(1300)}
 else if(a==="dyepick"){const i=+t.dataset.i;openPick(n=>{L.dyes[i].n=n;commit();all()})}
 else if(a==="dyeadd")openPick(n=>{L.dyes.push({n,s:1});commit();all()});
 else if(a==="dyedel"){L.dyes.splice(+t.dataset.i,1);commit();all()}
 else if(a==="reshape"){setEdit(!UI.edit);if(UI.edit)hideSoon()}
 else if(a==="dup"){const N=JSON.parse(JSON.stringify(L));N.id=uid();N.name=L.name+" 2";if(N.type==="spot")N.p.x=clamp(N.p.x*-1,-.9,.9);else if(N.type==="wedge")N.p.a=wrap(N.p.a+Math.PI);S.layers.push(N);S.sel=N.id;commit();all();flash(1200)}
 else if(a==="del"){S.layers=S.layers.filter(l=>l.id!==L.id);S.sel=S.layers[S.layers.length-1].id;setEdit(false);commit();all()}
 else if(a==="plastic"){const prev=plastic();S.plastic=t.dataset.id;const p=plastic();if(S.base.toUpperCase()===prev.base.toUpperCase())S.base=p.base;S.trans="";commit();all()}
 else if(a==="base"){S.base=t.dataset.c;commit();all()}
 else if(a==="pool"){S.pool=t.dataset.g;save();panel()}
 else if(a==="mx"){S.mx=t.dataset.m;panel()}
 else if(a==="nd"){S.nd=+t.dataset.n;save();panel()}
 else if(a==="grab"){S.tg=colorAtPt(UI.pt.x,UI.pt.y).hex;save();panel()}
 else if(a==="solve")solve(t);
 else if(a==="use"){const o=lastRec[+t.dataset.r],up=upOf();L.dyes=o.items.map(x=>({n:x.name,s:clamp(x.s/up,.05,1.5)}));commit();all();flash(900)}
 const c=e.target.closest("[data-a]");if(c&&!t.dataset.act){}});
body.addEventListener("click",e=>{const c=e.target.closest("td [data-a]");if(!c)return;const L=selL(),up=0;
 if(c.dataset.bc){S.base=c.dataset.bc;L.dyes=[{n:c.dataset.a,s:1}]}
 else L.dyes=c.dataset.a===c.dataset.b?[{n:c.dataset.a,s:1}]:[{n:c.dataset.a,s:.6},{n:c.dataset.b,s:.6}];
 commit();paint(false);readout();drawOv();flash(900)});
body.addEventListener("input",e=>{const t=e.target;
 if(t.type==="range"){const L=S.layers.find(l=>l.id===t.dataset.id);if(!L)return;const v=+t.value,k=t.dataset.k,i=+t.dataset.i;
  const lo=+t.min,hi=+t.max;t.style.setProperty("--v",(v-lo)/(hi-lo)*100+"%");
  if(k==="s"){L.dyes[i].s=v/100;const o=document.querySelector(`[data-for="${L.id}s${i}"]`);if(o)o.textContent=v+"%"}
  else if(k==="pf"){L.p.f=v/100;const o=document.querySelector(`[data-for="${L.id}pf9"]`);if(o)o.textContent=v+"%"}
  else{const sp=SHAPES[L.type].find(x=>"p"+x[1]===k);sp[5](L,v);syncShape()}
  paint(true);readout();if(k!=="s")flash(700);return}
 if(t.id==="bC"||t.id==="bH"){const v=t.value.toUpperCase();if(hexOk(v)){S.base=v;if(t.id==="bC")$("#bH").value=v;else $("#bC").value=v;S.trans=S.trans;paint(true);readout()}}
 if(t.id==="tC"||t.id==="tH"){const v=t.value.toUpperCase();if(hexOk(v)){S.trans=v;if(t.id==="tC")$("#tH").value=v;else $("#tC").value=v;paint(true);readout()}}
 if(t.id==="gC"||t.id==="gH"){const v=t.value.toUpperCase();if(hexOk(v)){S.tg=v;if(t.id==="gC")$("#gH").value=v;else $("#gC").value=v;save()}}});
body.addEventListener("change",e=>{const t=e.target;if(t.type==="range"||/^[bt]([CH])$/.test(t.id||"")){commit();if(t.id==="bC"||t.id==="bH")panel();if(t.type==="range")panel()}});
let lastRec=[];
function solve(btn){const tg=S.tg.toUpperCase();if(!hexOk(tg))return;btn.textContent="…";const p=plastic(),pool=poolOf(S.pool).map(d=>d.n);
 setTimeout(()=>{lastRec=DE.recipe(tg,S.base,p.fam,pool,{maxDyes:S.nd,top:6,transHex:transHex()});
  $("#rec").innerHTML=lastRec.map((o,i)=>`<div class="rc"><i class="sw" style="background:${o.hex}"></i><div class="m"><div class="a">${o.hex} · ${Math.max(0,Math.round(100-o.dE*3))}%</div><div class="b">${o.items.map(x=>esc(x.name)+" "+Math.round(x.s/upOf()*100)+"%").join(" + ")}</div></div><button data-act="use" data-r="${i}">Use</button></div>`).join("");
  btn.textContent="Find"},20)}
$("#tabs").addEventListener("click",e=>{const b=e.target.closest("[data-t]");if(b){S.tab=b.dataset.t;save();setEdit(false);panel()}});
// header
const flip=(b,t)=>{const o=b.dataset.o||b.textContent;b.dataset.o=o;b.textContent=t;clearTimeout(b._t);b._t=setTimeout(()=>b.textContent=o,1400)};
const MM=105,pad=n=>String(n).padStart(2,"0"),slug=t=>t.replace(/UV Blast |iDye Poly |ProChem /g,"").replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,"");
function recipeText(d){d=d||new Date();const mm=r=>Math.round(r*MM),dy=l=>l.dyes.map(x=>x.n+" "+Math.round(x.s*100)+"%").join(" + ")||"none";
 const L=["DYE RECIPE "+d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+" "+pad(d.getHours())+":"+pad(d.getMinutes()),"Plastic: "+plastic().name+(plastic().fam==="champion"?" (tint "+transHex()+")":"")+" | Base color: "+S.base,"Strength: 100% = standard bath for the dye. Layers add dye; apply in order.",""];
 S.layers.forEach((l,i)=>{if(!l.vis||!l.dyes.length)return;const p=l.p;let g;
  if(l.type==="full")g="whole disc";
  else if(l.type==="dip")g="dip the rim edge in to "+mm(1-p.r0)+" mm depth ("+mm(p.r0)+" mm radius from center); edge softness "+Math.round(p.f*100)+"%";
  else if(l.type==="ring")g="ring from "+mm(p.r0)+" mm to "+mm(p.r1)+" mm radius from center; edge softness "+Math.round(p.f*100)+"%";
  else if(l.type==="wedge")g="wedge "+Math.round(p.w*57.296)+"° wide centered at "+Math.round(((p.a*57.296)+360)%360)+"° (0° = 3 o'clock, clockwise), full radius; edge softness "+Math.round(p.f*100)+"%";
  else g="spot "+mm(p.rad*2)+" mm across, centered "+mm(Math.abs(p.x))+" mm "+(p.x>=0?"right":"left")+" and "+mm(Math.abs(p.y))+" mm "+(p.y>=0?"below":"above")+" disc center; edge softness "+Math.round(p.f*100)+"%";
  L.push((i+1)+". "+l.name+": "+dy(l)+" - "+g)});
 const a=Math.atan2(UI.pt.y,UI.pt.x),pts=[.35,.72,.93].map(r=>colorAtPt(Math.cos(a)*r,Math.sin(a)*r).hex);
 L.push("","Predicted (sample direction): center "+pts[0]+", mid "+pts[1]+", rim "+pts[2]);return L.join("\n")}
function fileName(d){const bl=S.layers[0],parts=[d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()),pad(d.getHours())+pad(d.getMinutes()),slug(plastic().name),slug(S.base)];
 S.layers.forEach((l,i)=>{if(l.vis&&l.dyes.length)parts.push((i?l.name.replace(/\s+/g,""):"Base")+"-"+l.dyes.map(x=>slug(x.n)+Math.round(x.s*100)).join("+"))});return parts.join("_").slice(0,150)}
const SB="https://wtymjxscneufjlkkywyg.supabase.co/rest/v1/du_dye_recipes",SK="sb_publishable_rimiZU1rSfq1nCEOUBw3ew_1j_GuZUx";
const sent=new Set();
function logRecipe(action){try{const d=new Date(),spec={plastic:S.plastic,base:S.base,trans:S.trans,layers:S.layers.map(l=>({type:l.type,name:l.name,vis:l.vis,dyes:l.dyes,p:l.p}))},key=JSON.stringify(spec);if(sent.has(key))return;sent.add(key);
 const row={file_name:fileName(d),plastic:plastic().name,base_hex:S.base,recipe:recipeText(d),spec,action};
 const q=JSON.parse(localStorage.getItem("dds11q")||"[]");q.push(row);localStorage.setItem("dds11q",JSON.stringify(q.slice(-20)));flushQ()}catch(e){}}
function flushQ(){let q;try{q=JSON.parse(localStorage.getItem("dds11q")||"[]")}catch(e){return}if(!q.length)return;
 fetch(SB,{method:"POST",keepalive:true,headers:{apikey:SK,Authorization:"Bearer "+SK,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify(q)}).then(r=>{if(r.ok){try{localStorage.setItem("dds11q","[]")}catch(e){}}}).catch(()=>{})}
function publicText(){return S.layers.filter(l=>l.vis&&l.dyes.length).map(l=>l.name+": "+l.dyes.map(d=>d.n+" "+Math.round(d.s*100)+"%").join(" + ")).join("\n")+"\n"+plastic().name+" "+S.base}
function copyText(t){return(navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(t):Promise.reject()).catch(()=>{const x=document.createElement("textarea");x.value=t;x.style.cssText="position:fixed;left:-999px;top:0;opacity:0";document.body.appendChild(x);x.focus();x.select();try{document.execCommand("copy")}catch(e){}x.remove()})}
function makePng(){return new Promise(r=>{const W=1600,c=document.createElement("canvas");c.width=c.height=W;c.getContext("2d").putImageData(renderDisc(W),0,0);c.toBlob(r,"image/png")})}
let pngBlob=null,pngUrl="";
async function prepPng(){pngBlob=await makePng();if(pngUrl)URL.revokeObjectURL(pngUrl);pngUrl=URL.createObjectURL(pngBlob)}
$("#png").onclick=async()=>{const b=$("#png");logRecipe("save");flip(b,"…");await prepPng();
 const f=new File([pngBlob],"disc.png",{type:"image/png"});
 if(navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f]});flip(b,"Saved");return}catch(e){if(e&&e.name==="AbortError"){flip(b,"Save");return}}}
 $("#svimg").src=pngUrl;$("#svdl").href=pngUrl;$("#save").classList.add("open");flip(b,"Save")};
$("#svx").onclick=()=>$("#save").classList.remove("open");$("#save").addEventListener("click",e=>{if(e.target.id==="save")$("#save").classList.remove("open")});
$("#copy").onclick=()=>{logRecipe("copy");copyText(publicText());flip($("#copy"),"Copied")};
// layout
function layout(){const w=vw.clientWidth,h=vw.clientHeight,s=Math.max(120,Math.floor(Math.min(w,h)-8));sq.style.width=sq.style.height=s+"px";
 const nb=clamp(Math.round(s*Math.min(2,window.devicePixelRatio||1)),480,1400);if(nb!==B||cv.width!==nb){B=nb;cv.width=cv.height=ov.width=ov.height=B;paint(false);drawOv()}}
new ResizeObserver(layout).observe(vw);
window.addEventListener("keydown",e=>{if(e.key==="Escape"){closePick();setEdit(false)}});
flushQ();layout();H=[snap()];hi=0;all();
})();
