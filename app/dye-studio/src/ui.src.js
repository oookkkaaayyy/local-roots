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
 {id:"champion",name:"Champion",fam:"champion",up:1,base:"#DCE8E1",tr:.78},
 {id:"glow",name:"Glow",fam:"champion",up:1,base:"#D3E4A0",tr:.78,est:1}];
const BASES=["#F4F2E8","#DCE8E1","#D3E4A0","#F7E331","#F27A26","#E84C55","#59A9DE","#57A768","#8D62B6","#2B2B2E"];
const MEAS={base:"#38906F",c:{"UV Blast Green":{plate:"#8FC316",shoulder:"#69B820",rim:"#3BAF27"},"UV Blast Blaze Orange":{plate:"#B30003",shoulder:"#890507",rim:"#57090D"}}};
const TYPES={
 stripe:{label:"Color",p:{x:0,y:0,a:Math.PI/2,h:.45}},
 box:{label:"Box",p:{x:0,y:0,a:0,w:.8,h:.5}},
 stencil:{label:"Stencil",p:{x:0,y:0,s:190.5/105}}};
const TOOL=window.__dsTool==="stencil"?"stencil":"dye";
const STN={};
const uid=()=>Math.random().toString(36).slice(2,8);
const poolOf=g=>{let L=DYELIST.filter(d=>!d.c);if(g==="Inventory")L=L.filter(d=>d.i);else if(g==="ProChem")L=L.filter(d=>d.g==="ProChem");else if(g==="UV Blast")L=L.filter(d=>/UV Blast/.test(d.g)&&!d.i||/UV Blast/.test(d.n));return L};
const GROUPS=["Inventory"];const GL={Inventory:"Available"};
function defState(){const a=uid();return{plastic:"star",base:"#F4F2E8",rim:null,trans:"",pool:"Inventory",tab:"disc",mx:"mix",tg:"#2A8FD6",nd:2,sel:a,
 layers:[{id:a,type:"full",name:"Base",vis:true,dyes:[],p:{}}]}}
let S=defState();
let PENDST=null;try{const t=TOOL==="dye"?JSON.parse(localStorage.getItem("dds11")||"null"):null;if(t&&t.layers&&t.layers.length){PENDST=t.layers.find(l=>l.type==="stencil")||null;t.layers=t.layers.filter(l=>l.type==="full"||l.type!=="stencil"&&TYPES[l.type]);t.layers.forEach(l=>{(l.dyes||[]).forEach(d=>{d.s=1/l.dyes.length});if(l.name==="Stripe")l.name="Color";else if(/^Stripe \d+$/.test(l.name))l.name=l.name.replace("Stripe","Color")});if(t.tab==="design")t.tab="disc";if(t.layers.length&&t.layers[0].type==="full")S=Object.assign(S,t)}}catch(e){}if(!PL.some(p=>p.id===S.plastic))S.plastic="star";S.trans="";S.pool="Inventory";S.tab="disc";
const dropGhost=()=>{S.layers=S.layers.filter(l=>l.type!=="stencil"||STN[l.id]);if(!S.layers.some(l=>l.id===S.sel))S.sel=S.layers[S.layers.length-1].id};
const save=()=>{if(TOOL!=="dye")return;try{localStorage.setItem("dds11",JSON.stringify(S))}catch(e){}};
const plastic=()=>PL.find(p=>p.id===S.plastic)||PL[0];
const baseL=()=>S.layers[0];
const selL=()=>S.layers.find(l=>l.id===S.sel)||S.layers[S.layers.length-1];
const mixHex=(a,b,k)=>{const A=hexRgb(a),B2=hexRgb(b);return rgbHex(A.map((v,i)=>v+(B2[i]-v)*k))};
const rimK=r=>{if(!S.rim)return 0;const w=S.rim.w/100,f=.14*(1-S.rim.f)+.006;return ss(1-w-f/2,1-w+f/2,r)};
const baseAt=r=>S.rim?mixHex(S.base,S.rim.c,rimK(r)):S.base;
const transHex=bh=>{if(hexOk(S.trans))return S.trans.toUpperCase();const p=plastic(),t=p.tr||.7,c=hexRgb(bh||S.base),lum=(.2126*c[0]+.7152*c[1]+.0722*c[2])/255,l=(.38+.36*t)*Math.pow(lum,.6);return rgbHex(c.map(v=>v+(255-v)*l))};
const pathAt=(r,p)=>p.fam!=="champion"?1:.74;
const zoneAt=r=>"plate";
function measured(its,r){const p=plastic();if(p.fam!=="champion"||its.length!==1||rimK(r)>0)return null;const a=MEAS.c[its[0].name];if(!a)return null;
 if(Math.abs(its[0].s/p.up-1)>.1)return null;
 const m=hexRgb(MEAS.base),d=hexRgb(S.base).reduce((s,v,i)=>s+(v-m[i])**2,0);if(Math.sqrt(d)>48)return null;return a[zoneAt(r)]}
function colorAt(its,r,mc){
 const p=plastic();
 const m=measured(its,r);if(m&&!mc)return{hex:m,measured:true};
 const bh=baseAt(r);if(p.fam==="champion"&&!its.length)return{hex:bh,spread:0,lab:null,gamut:false,measured:false};
 const sp={baseHex:bh,transHex:transHex(bh),family:p.fam,scene:"outdoor",zone:zoneAt(r),path:pathAt(r,p),items:its};
 const o=DE.predict(sp,mc?{mc}:{});
 return{hex:m||o.hex,spread:o.spread,lab:o.lab,gamut:o.gamutExcess>.02,measured:!!m};
}
// ---------- layer masks ----------
function loc(L,u,v){const p=L.p,c=Math.cos(p.a),s=Math.sin(p.a),dx=u-p.x,dy=v-p.y;return[dx*c+dy*s,-dx*s+dy*c]}
function maskW(L,x,y,r,ang){const p=L.p;
 switch(L.type){
 case"full":return 1;
 case"stripe":{const q=loc(L,x,y);return 1-edge(p.h/2,Math.abs(q[1]),.004)}
 case"box":{const q=loc(L,x,y);return(1-edge(p.w/2,Math.abs(q[0]),.004))*(1-edge(p.h/2,Math.abs(q[1]),.004))}
 case"stencil":{const m=STN[L.id];if(!m)return 0;const hw=p.s/2,hh=hw*m.h/m.w,u=(x-p.x)/hw,v=(y-p.y)/hh;if(u<-1||u>1||v<-1||v>1)return 0;
  const fx=(u+1)/2*m.w-.5,fy=(v+1)/2*m.h-.5,x0=Math.floor(fx),y0=Math.floor(fy),tx=fx-x0,ty=fy-y0,g=(a,b)=>a<0||b<0||a>=m.w||b>=m.h?1:m.mask[b*m.w+a];
  return 1-((g(x0,y0)*(1-tx)+g(x0+1,y0)*tx)*(1-ty)+(g(x0,y0+1)*(1-tx)+g(x0+1,y0+1)*tx)*ty)}
 }
 return 0}
const upOf=()=>plastic().up;
function itemsFor(ws,layers){const up=upOf(),out=[];
 for(let i=layers.length-1;i>=0;i--){const w=ws[i];if(!(w>.02))continue;for(const d of layers[i].dyes)out.push({name:d.n,b:i,s:Math.max(0,d.s*up*w)})}
 return out}
function weightsAt(x,y){const r=Math.hypot(x,y),ang=Math.atan2(y,x);return S.layers.map(L=>L.vis?maskW(L,x,y,r,ang):0)}
function colorAtPt(x,y,mc){const r=Math.hypot(x,y);return colorAt(itemsFor(weightsAt(x,y),S.layers),r,mc)}
function layerAt(x,y){const ws=weightsAt(x,y);for(let i=S.layers.length-1;i>0;i--)if(ws[i]>.5)return S.layers[i];return S.layers[0]}
// ---------- rendering ----------
const cv=$("#cv"),ov=$("#ov"),sq=$(".sq"),vw=$(".vw");let B=800;const oc=document.createElement("canvas");
const NB=96;
function renderDisc(W){
 const PL_T=plastic().fam==='champion';
 const layers=S.layers,n=layers.length,hasW=false;
 const act=layers.map(l=>l.vis);
 const cache=new Map();
 const img=new ImageData(W,W),d=img.data,c=W/2,R=W*.46,ws=new Array(n).fill(0),qs=new Array(n).fill(0);
 for(let y=0;y<W;y++)for(let x=0;x<W;x++){
  const u=(x+.5-c)/R,v=(y+.5-c)/R,r=Math.hypot(u,v);if(r>1.02)continue;
  const ang=hasW?Math.atan2(v,u):0;let key=Math.min(NB-1,Math.round(r*(NB-1)));
  for(let i=0;i<n;i++){const w=act[i]?maskW(layers[i],u,v,r,ang):0;const q=Math.round(w*12);qs[i]=q;key=key*13+q}
  let rgb=cache.get(key);
  if(!rgb){for(let i=0;i<n;i++)ws[i]=qs[i]/12;const rr=Math.min(NB-1,Math.round(r*(NB-1)))/(NB-1);rgb=hexRgb(colorAt(itemsFor(ws,layers),rr).hex);cache.set(key,rgb)}
  const lip=ss(.88,.99,r),lit=1+.05*(-(u+v)*.7);
  const sh=lit*(1-.16*lip)*(PL_T?1-.05*ss(.84,.99,r):1);
  const a=clamp((1-r)*R/1.1,0,1);
  const k=(y*W+x)*4;d[k]=rgb[0]*sh;d[k+1]=rgb[1]*sh;d[k+2]=rgb[2]*sh;d[k+3]=a*255*(PL_T?.8+.14*lip:1)}
 return img}
let fastT=null;
function paint(fast){
 const W=fast?Math.max(240,Math.round(B/3)):B;oc.width=oc.height=W;oc.getContext("2d").putImageData(renderDisc(W),0,0);
 const ctx=cv.getContext("2d");ctx.clearRect(0,0,B,B);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(oc,0,0,B,B);
 clearTimeout(fastT);if(fast)fastT=setTimeout(()=>paint(false),140)}
// ---------- overlay + direct manipulation ----------
const UI={drag:null,hover:null,guide:null,pt:{x:.5,y:0}};
const P2=(u,v)=>[B/2+u*B*.46,B/2+v*B*.46];
const isShape=L=>L&&(L.type==="stripe"||L.type==="box");
const showH=()=>{const L=selL();return L&&L.type!=="full"&&L.type!=="ring"&&(true)};
const axes=L=>{const a=L.p.a;return{t:[Math.cos(a),Math.sin(a)],n:[-Math.sin(a),Math.cos(a)]}};
function corners(L){const p=L.p,{t,n}=axes(L),hw=p.w/2,hh=p.h/2,f=(a,b)=>[p.x+t[0]*a+n[0]*b,p.y+t[1]*a+n[1]*b];return[f(-hw,-hh),f(hw,-hh),f(hw,hh),f(-hw,hh)]}
function chord(P,t){const b=P[0]*t[0]+P[1]*t[1],c=P[0]*P[0]+P[1]*P[1]-1,d=b*b-c;if(d<=0)return null;const q=Math.sqrt(d);return[[P[0]+t[0]*(-b-q),P[1]+t[1]*(-b-q)],[P[0]+t[0]*(-b+q),P[1]+t[1]*(-b+q)]]}
function stripeLines(L){const p=L.p,{t,n}=axes(L),o=[];for(const s of[-1,1]){const c=chord([p.x+n[0]*s*p.h/2,p.y+n[1]*s*p.h/2],t);if(c)o.push(c)}return o}
function outline(ctx,L){const R=B*.46,c=B/2,pt=q=>[c+q[0]*R,c+q[1]*R];
 const seg=(a,b)=>{const A=pt(a),Z=pt(b);ctx.beginPath();ctx.moveTo(A[0],A[1]);ctx.lineTo(Z[0],Z[1]);ctx.stroke()};
 if(L.type==="stripe")stripeLines(L).forEach(s=>seg(s[0],s[1]));
 else if(L.type==="box"){const q=corners(L);for(let i=0;i<4;i++)seg(q[i],q[(i+1)%4])}
 else if(L.type==="stencil"&&STN[L.id]){const m=STN[L.id],hw=L.p.s/2,hh=hw*m.h/m.w;ctx.strokeRect(c+(L.p.x-hw)*R,c+(L.p.y-hh)*R,hw*2*R,hh*2*R)}}
function handles(L){const p=L.p,{t,n}=axes(L),o=[],W=(a,b)=>({u:p.x+t[0]*a+n[0]*b,v:p.y+t[1]*a+n[1]*b});
 if(L.type==="box"){const hw=p.w/2,hh=p.h/2;for(const sx of[-1,0,1])for(const sy of[-1,0,1]){if(!sx&&!sy)continue;o.push(Object.assign(W(sx*hw,sy*hh),{id:"r:"+sx+":"+sy,k:sx&&sy?"c":"e",sx,sy}))}o.push(Object.assign(W(0,-hh-.12),{id:"rot",k:"rot"}))}
 else if(L.type==="stripe"){for(const s of[-1,1])o.push(Object.assign(W(0,s*p.h/2),{id:"e:"+s,k:"e",sx:0,sy:s}));const d=Math.hypot(p.x,p.y),Lr=Math.sqrt(Math.max(.05,1-d*d))*.86;o.push(Object.assign(W(Lr,0),{id:"rot",k:"rot"}))}
 else if(L.type==="stencil"&&STN[L.id]){const m=STN[L.id],hw=p.s/2;o.push({id:"c",u:p.x,v:p.y,k:"m"},{id:"sz",u:p.x+hw,v:p.y+hw*m.h/m.w,k:"c",sx:1,sy:1})}
 return o}
function drawOv(){const ctx=ov.getContext("2d");ctx.clearRect(0,0,B,B);const L=selL();
 const stroke=(f,w)=>{ctx.strokeStyle="rgba(58,38,24,.75)";ctx.lineWidth=B*.007+w;f();ctx.strokeStyle="#fff";ctx.lineWidth=B*.0035+w;f()};
 ctx.lineCap="round";ctx.lineJoin="round";
 if(UI.hover&&UI.hover!==S.sel){const H=S.layers.find(l=>l.id===UI.hover);if(H&&H.type!=="full"){ctx.save();ctx.globalAlpha=.8;ctx.setLineDash([B*.012,B*.012]);stroke(()=>outline(ctx,H),0);ctx.restore()}}
 if(showH()){stroke(()=>outline(ctx,L),0);
  if(UI.guide){ctx.save();ctx.setLineDash([B*.01,B*.01]);ctx.strokeStyle="#9f5c36";ctx.lineWidth=B*.004;const R=B*.46,c=B/2;if(UI.guide.x){ctx.beginPath();ctx.moveTo(c,c-R);ctx.lineTo(c,c+R);ctx.stroke()}if(UI.guide.y){ctx.beginPath();ctx.moveTo(c-R,c);ctx.lineTo(c+R,c);ctx.stroke()}if(UI.guide.r){const A=UI.guide.r;ctx.beginPath();ctx.moveTo(c-A[0]*R,c-A[1]*R);ctx.lineTo(c+A[0]*R,c+A[1]*R);ctx.stroke()}ctx.restore()}
  const hs=handles(L),rot=hs.find(h=>h.k==="rot");
  if(rot&&L.type==="box"){const n=axes(L).n,a=P2(L.p.x-n[0]*L.p.h/2,L.p.y-n[1]*L.p.h/2),b=P2(rot.u,rot.v);ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.strokeStyle="#fff";ctx.lineWidth=B*.004;ctx.stroke()}
  for(const h of hs){const[x,y]=P2(h.u,h.v),act=UI.drag&&UI.drag.id===h.id;ctx.beginPath();
   if(h.k==="rot")ctx.arc(x,y,B*.019,0,7);else if(h.k==="c")ctx.rect(x-B*.014,y-B*.014,B*.028,B*.028);else ctx.rect(x-B*.011,y-B*.011,B*.022,B*.022);
   ctx.fillStyle=act?"#9f5c36":"#fff";ctx.fill();ctx.lineWidth=B*.004;ctx.strokeStyle="rgba(58,38,24,.85)";ctx.stroke();
   if(h.k==="rot"){ctx.beginPath();ctx.arc(x,y,B*.009,-2.4,1.2);ctx.lineWidth=B*.003;ctx.strokeStyle=act?"#fff":"rgba(58,38,24,.85)";ctx.stroke()}}}}
const flash=()=>drawOv(),setEdit=()=>drawOv();
function toUV(e){const r=ov.getBoundingClientRect(),X=(e.clientX-r.left)/r.width*B,Y=(e.clientY-r.top)/r.height*B;return{u:(X-B/2)/(B*.46),v:(Y-B/2)/(B*.46),X,Y}}
function hit(e){if(!showH())return null;const t=toUV(e),L=selL(),dpr=B/ov.getBoundingClientRect().width;let best=null,bd=1e9;
 for(const h of handles(L)){const[x,y]=P2(h.u,h.v),d=Math.hypot(x-t.X,y-t.Y);if(d<bd){bd=d;best=h}}
 return best&&bd<22*dpr?best:null}
function inside(L,u,v){if(L.type==="stencil"){const m=STN[L.id];if(!m)return false;const hw=L.p.s/2,hh=hw*m.h/m.w;return Math.abs(u-L.p.x)<=hw&&Math.abs(v-L.p.y)<=hh}
 const q=loc(L,u,v);return L.type==="stripe"?Math.abs(q[1])<=L.p.h/2:Math.abs(q[0])<=L.p.w/2&&Math.abs(q[1])<=L.p.h/2}
function cursorFor(h,L){if(!h)return"default";if(h.k==="m")return"move";if(h.k==="rot")return"grab";
 const a=Math.atan2(h.v-L.p.y,h.u-L.p.x),d=(((a*57.296)%180)+180)%180,i=Math.round(d/45)%4;return["ew-resize","nwse-resize","ns-resize","nesw-resize"][i]}
ov.addEventListener("contextmenu",e=>e.preventDefault());
ov.addEventListener("pointerdown",e=>{ov.setPointerCapture(e.pointerId);const t=toUV(e),L=selL(),h=hit(e),r=Math.hypot(t.u,t.v);
 if(h){UI.drag={id:h.id,h,L,p0:JSON.parse(JSON.stringify(L.p)),t0:t,moved:false};if(h.id==="rot"){const O=L.type==="box"?[L.p.x,L.p.y]:[0,0];UI.drag.O=O;UI.drag.phi0=Math.atan2(t.v-O[1],t.u-O[0])}drawOv();return}
 let T=null;if(showH()&&inside(L,t.u,t.v))T=L;else if(r<=1.03)T=layerAt(t.u,t.v);
 if(r<=1.03){UI.pt={x:t.u,y:t.v};readout()}
 if(!T){if(S.sel!==S.layers[0].id)selectLayer(S.layers[0].id);return}
 if(T.id!==S.sel)selectLayer(T.id);
 if(T.type!=="full"&&T.type!=="ring"){UI.drag={id:"body",L:T,p0:JSON.parse(JSON.stringify(T.p)),t0:t,moved:false};ov.style.cursor="move"}drawOv()});
ov.addEventListener("pointermove",e=>{const t=toUV(e),D=UI.drag;
 if(!D){const h=hit(e);let cur=cursorFor(h,selL());let hv=null;if(!h){const r=Math.hypot(t.u,t.v);if(r<=1.03){const T=showH()&&inside(selL(),t.u,t.v)?selL():layerAt(t.u,t.v);cur=T.type==="full"||T.type==="ring"?"default":"move";if(T.type!=="full"&&T.type!=="ring")hv=T.id}}
  ov.style.cursor=cur;if(hv!==UI.hover){UI.hover=hv;drawOv()}return}
 const L=D.L,p=L.p,p0=D.p0;if(!D.moved&&Math.hypot(t.X-D.t0.X,t.Y-D.t0.Y)<4)return;D.moved=true;UI.guide=null;
 if(D.id==="body"||D.id==="c"){const du=t.u-D.t0.u,dv=t.v-D.t0.v;
  if(L.type==="stripe"){const n=axes(L).n,d0=p0.x*n[0]+p0.y*n[1];let d=clamp(d0+du*n[0]+dv*n[1],-.98,.98);if(Math.abs(d)<.03){d=0;UI.guide={r:axes(L).t}}p.x=n[0]*d;p.y=n[1]*d}
  else{let x=clamp(p0.x+du,-1.15,1.15),y=clamp(p0.y+dv,-1.15,1.15);const g={};if(Math.abs(x)<.03){x=0;g.x=1}if(Math.abs(y)<.03){y=0;g.y=1}UI.guide=g.x||g.y?g:null;p.x=x;p.y=y}}
 else if(D.id==="rot"){let da=Math.atan2(t.v-D.O[1],t.u-D.O[0])-D.phi0,a=p0.a+da,deg=a*57.296,sn=Math.round(deg/15)*15;if(Math.abs(deg-sn)<3){a=sn/57.296;da=a-p0.a}
  p.a=wrap(a);if(L.type==="stripe"){const c=Math.cos(da),s=Math.sin(da);p.x=p0.x*c-p0.y*s;p.y=p0.x*s+p0.y*c}}
 else if(D.id==="sz"){p.s=clamp(2*(t.u-p.x),.4,2.2)}
 else{const c0=Math.cos(p0.a),s0=Math.sin(p0.a),dx=t.u-p0.x,dy=t.v-p0.y,q=[dx*c0+dy*s0,-dx*s0+dy*c0],tt=[c0,s0],n=[-s0,c0];
  let ct=0,cn=0;const sx=D.h.sx,sy=D.h.sy;
  if(L.type==="box"&&sx){const an=-sx*p0.w/2,w=Math.max(.06,(q[0]-an)*sx);p.w=Math.min(w,2.2);ct=an+sx*p.w/2}
  if(sy){const an=-sy*p0.h/2,h=Math.max(.04,(q[1]-an)*sy);p.h=Math.min(h,2.2);cn=an+sy*p.h/2}
  p.x=p0.x+tt[0]*ct+n[0]*cn;p.y=p0.y+tt[1]*ct+n[1]*cn}
 paint(true);drawOv();readout()});
const endDrag=()=>{const D=UI.drag;UI.drag=null;UI.guide=null;if(D&&D.moved){commit();paint(false)}drawOv()};
ov.addEventListener("pointerup",endDrag);ov.addEventListener("pointercancel",endDrag);
ov.addEventListener("pointerleave",()=>{if(!UI.drag&&UI.hover){UI.hover=null;drawOv()}});
// ---------- history ----------
let H=[],hi=-1;
const snap=()=>JSON.stringify({plastic:S.plastic,base:S.base,rim:S.rim,trans:S.trans,layers:S.layers,sel:S.sel});
function commit(){save();const s=snap();if(H[hi]===s)return;H=H.slice(0,hi+1);H.push(s);if(H.length>80)H.shift();hi=H.length-1;undoBtns()}
function restore(s){Object.assign(S,JSON.parse(s));dropGhost();if(!S.layers.some(l=>l.id===S.sel))S.sel=S.layers[S.layers.length-1].id;save();all()}
function undoBtns(){$("#undo").classList.toggle("dis",hi<=0);$("#redo").classList.toggle("dis",hi>=H.length-1)}
$("#undo").onclick=()=>{if(hi>0){hi--;restore(H[hi]);undoBtns()}};
$("#redo").onclick=()=>{if(hi<H.length-1){hi++;restore(H[hi]);undoBtns()}};
// ---------- readout ----------
function lch(lab){return lab?{L:lab[0],C:Math.hypot(lab[1],lab[2]),h:(Math.atan2(lab[2],lab[1])*57.296+360)%360}:null}
function acc(m){if(plastic().est)return"Accuracy Low";if(m.measured)return"Accuracy Exact";if(m.spread===undefined)return"";return"Accuracy "+(m.spread<3?"High":m.spread<6?"Medium":"Low")}
function readout(){if(!$("#rd"))return;
 const a=Math.atan2(UI.pt.y,UI.pt.x),pr=Math.hypot(UI.pt.x,UI.pt.y);
 const main=colorAtPt(UI.pt.x,UI.pt.y,32);
 $("#rd").innerHTML=`<i class="big" style="background:${main.hex}"></i><div class="m"><div class="st">${acc(main)}</div></div>`}
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
 $("#pch").innerHTML=GROUPS.map(g=>`<button data-g="${g}" class="${pickG===g?"on":""}">${GL[g]||g}</button>`).join("");
 const q=pickQ.trim().toLowerCase();
 const L=poolOf(pickG).filter(d=>!q||d.n.toLowerCase().includes(q)).map(d=>({n:d.n,h:dyeHex(d.n)})).sort((a,b)=>hueOf(a.h)-hueOf(b.h));
 $("#pgr").innerHTML=L.map(d=>`<button class="dc" data-n="${esc(d.n)}"><i style="background:${d.h}"></i><span>${esc(d.n)}</span></button>`).join("")}
$("#pch").addEventListener("click",e=>{const b=e.target.closest("[data-g]");if(b){pickG=b.dataset.g;drawPick()}});
$("#pq").addEventListener("input",e=>{pickQ=e.target.value;drawPick()});
$("#pgr").addEventListener("click",e=>{const b=e.target.closest("[data-n]");if(b&&pickCb){const f=pickCb;closePick();f(b.dataset.n)}});
$("#px").onclick=closePick;$("#sheet").addEventListener("click",e=>{if(e.target.id==="sheet")closePick()});
// ---------- panel ----------
const EYE='<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const MM=105,unitOf=k=>k==="a"?"°":k==="sz"?" mm":"%";
const SHAPES={
 stencil:[["Size","sz",40,200,L=>Math.round(L.p.s*MM),(L,v)=>L.p.s=v/MM],["X","sx",-100,100,L=>Math.round(L.p.x*100),(L,v)=>L.p.x=v/100],["Y","sy",-100,100,L=>Math.round(L.p.y*100),(L,v)=>L.p.y=v/100]]};
const slider=(id,k,i,lo,hi,val,name,unit)=>`<div class="sl"><span class="nm">${name}</span><input type="range" min="${lo}" max="${hi}" value="${val}" data-id="${id}" data-k="${k}" data-i="${i}" style="--v:${(val-lo)/(hi-lo)*100}%"><span class="pc" data-for="${id}${k}${i}">${val}${unit}</span></div>`;
const CH={up:'<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',dn:'<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>'};
const eq=L=>{const n=L.dyes.length;L.dyes.forEach(d=>d.s=1/n)};
const ltitle=L=>L.type==="stencil"?"Stencil":L.dyes.length>1?"Blend":L.dyes.length?L.dyes[0].n:"No dye";
function layerCard(L,i,n,solo){const sel=L.id===S.sel,full=L.type==="full",st=L.type==="stencil";
 const sum=L.dyes.length?L.dyes.map(d=>esc(d.n)).join(" + "):"No dye";
 let h=`<div class="lc${sel?" sel":""}"><div class="lh" data-act="sel" data-id="${L.id}">${st?`<div class="sw" style="background:#fff;overflow:hidden;display:flex"><canvas id="stp" width="96" height="96" style="width:100%;height:100%"></canvas></div>`:`<i class="sw" style="background:${layerHex(L)}"></i>`}<div class="ln"><b>${esc(ltitle(L))}</b><span>${L.dyes.length>1?sum:""}</span></div>`+
  `<button class="ic${L.vis?"":" off"}" data-act="vis" data-id="${L.id}" aria-label="Show">${EYE}</button>${n>1&&!full?`<button class="ic rm" data-act="rmlayer" data-id="${L.id}" aria-label="Remove layer">&times;</button>`:""}</div>`;
 if(sel){h+=`<div class="lb">`;
  L.dyes.forEach((d,k)=>{h+=`<div class="dr"><button class="dsw" data-act="dyepick" data-i="${k}"><i style="background:${dyeHex(d.n)}"></i></button><button class="dn" data-act="dyepick" data-i="${k}">${esc(d.n)}</button>${L.dyes.length>1?`<button class="ic" data-act="dyedel" data-i="${k}" aria-label="Remove">×</button>`:""}</div>`});
  h+=`<div class="row" style="margin-top:10px"><button class="g" data-act="dyeadd">Blend colors</button></div>`;
  if(SHAPES[L.type])h+=SHAPES[L.type].map(([nm,k,lo,hi,get],j)=>slider(L.id,"p"+k,j,lo,hi,get(L),nm,unitOf(k))).join("");
  if(!full)h+=`<div class="foot2">${L.type==="stencil"?`<button data-act="photo">Replace photo</button>`:`<button data-act="dup">Duplicate</button>`}<button data-act="del" class="dg">${L.type==="stencil"?"Delete":"Remove"}</button></div>`;
  h+=`</div>`}
 return h+`</div>`}
const IC={photo:'<svg viewBox="0 0 32 32"><path d="M4 10h5l2-3h10l2 3h5v15H4z"/><circle cx="16" cy="17" r="5"/></svg>',color:'<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12"/><circle cx="11" cy="13" r="2"/><circle cx="17" cy="10" r="2"/><circle cx="21" cy="16" r="2"/></svg>',stripe:'<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="13"/><path d="M8 24L24 8M13 28L28 13" /></svg>',box:'<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="13"/><rect x="10" y="11" width="12" height="10" rx="1"/></svg>',stencil:'<svg viewBox="0 0 32 32"><rect x="5" y="5" width="22" height="22" rx="3"/><circle cx="16" cy="14" r="4"/><path d="M8 25c1-5 15-5 16 0"/></svg>'};
const tile=(act,ic,t,x)=>`<button class="tl" data-act="${act}" ${x||""}>${IC[ic]}<span>${t}</span></button>`;
const next=(t,l)=>`<button class="pri nx" data-act="go" data-t="${t}">${l}</button>`;
const colorPick=(id,val)=>`<input type="color" id="${id}C" value="${val}" aria-label="Custom color">`;
const hsvOf=h=>{const[r,g,b]=hexRgb(h).map(v=>v/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let H=0;if(d){H=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;H=(H*60+360)%360}return[H,mx?d/mx:0,mx]};
const hsvHex=(H,S_,V)=>{const f=n=>{const k=(n+H/60)%6;return V-V*S_*Math.max(0,Math.min(k,4-k,1))};return rgbHex([f(5)*255,f(3)*255,f(1)*255])};
let pkH={};
const swRow=(act,cur,pk)=>{const c=String(cur).toUpperCase(),[h0,sa,va]=hsvOf(c),H=sa>.04&&va>.04?h0:(pkH[pk]??h0);pkH[pk]=H;
 return `<div class="pkr" data-pk="${pk}" data-act-k="${act}"><div class="sv" style="background:linear-gradient(to top,#000,#0000),linear-gradient(to right,#fff,hsl(${H},100%,50%))"><i class="mk" style="left:${sa*100}%;top:${(1-va)*100}%;background:${c}"></i></div><input type="range" class="hue" min="0" max="360" value="${Math.round(H)}" aria-label="Hue"></div><div class="bs">`+BASES.map(b=>`<button data-act="${act}" data-c="${b}" aria-label="${b}" class="${b===c?"on":""}" style="background:${b}"></button>`).join("")+`</div>`};
function discSection(){
 if(!S.rim)S.tgt="disc";const rim=S.tgt==="rim"&&S.rim;
 let h=`<div class="dsc"><div class="ord first">Disc</div><div class="pl">`+PL.map(p=>`<button data-act="plastic" data-p="${p.id}" class="${p.id===S.plastic?"on":""}">${p.name}</button>`).join("")+`</div>`+
  `<div class="seg tg3"><button data-act="tgt" data-t="disc" class="${rim?"":"on"}">Disc</button><button data-act="tgt" data-t="rim" class="${rim?"on":""}">Rim</button>${rim?`<button class="ic x" data-act="rim" data-on="0" aria-label="Remove rim">×</button>`:""}</div>`+
  (rim?swRow("rimc",S.rim.c,"r"):swRow("base",S.base,"b"))+`<button class="g wide" data-act="discphoto">Match from photo</button>`;
 if(rim)h+=`<div class="sub">`+slider("rim","rw",0,3,25,Math.round(S.rim.w),"Width","%")+slider("rim","rf",1,0,100,Math.round(S.rim.f*100),"Fuzzy / Crisp","%")+`</div>`;
 return h+`</div>`}
let dOpen=false;
function tabDesign(){const n=S.layers.length;let h=`<button class="dtog" data-act="disctoggle" aria-expanded="${dOpen}">Disc and plastic<span>${dOpen?"Hide":"Edit"}</span></button>`+(dOpen?`<div class="dscroll">${discSection()}</div>`:"");
 if(n>1)h+=`<div class="lhd"><h3>Layers</h3><span class="lact"><button class="sm dg" data-act="clearask">Clear</button><button class="pri sm" data-act="addlayer" data-t="stripe">+ Add color</button></span></div>`;
 else h+=`<div class="lhd"><h3>Layers</h3><span class="lact"><button class="sm dg" data-act="clearask">Clear</button></span></div><button class="addbig" data-act="addlayer" data-t="stripe">+ Add color</button>`;
 for(let i=n-1;i>=1;i--)h+=layerCard(S.layers[i],i,n);
 return h}
function names(){return poolOf(S.pool).map(d=>d.n).slice(0,24)}
const sh=n=>n.replace(/^(ProChem |iDye Poly )/,"");
const chips=()=>"";
function tabRecipe(){
 return `<div class="cl" style="margin-top:0"><input type="color" id="gC" value="${S.tg.toLowerCase()}"></div>`+
 `<div class="seg" style="margin-top:10px">`+[1,2,3].map(n=>`<button data-act="nd" data-n="${n}" class="${S.nd===n?"on":""}">${n}</button>`).join("")+`<button data-act="grab">Sample</button><button class="pri" data-act="solve">Find</button></div><div id="rec"></div>`}
function tabStencil(){const L=S.layers.find(l=>l.type==="stencil");
 let h=`<div class="tg">${tile("photo","stencil",L?"Replace photo":"Choose a photo",L?"":'data-big="1"')}</div>`;
 if(L){const m=STN[L.id];h+=`<div class="thumb"><div class="sw" style="width:84px;height:84px;background:#fff;overflow:hidden;display:flex"><canvas id="stp" width="96" height="96" style="width:84px;height:84px"></canvas></div><div class="ln"><b>${Math.round(L.p.s*MM)} × ${Math.round(L.p.s*MM*m.h/m.w)} mm</b></div></div>`+`<div class="seg" style="margin:10px 0"><button class="pri" data-act="stdisc">Place on disc</button><button data-act="stedit">Edit in stencil</button></div>`+layerCard(L,S.layers.indexOf(L),S.layers.length)}
 return h}
function paintThumb(){const L=S.layers.find(l=>l.type==="stencil"),c=$("#stp");if(!L||!c||!STN[L.id])return;const m=STN[L.id],x=c.getContext("2d"),k=Math.min(96/m.w,96/m.h);x.fillStyle="#fff";x.fillRect(0,0,96,96);const id=x.createImageData(96,96);for(let j=0;j<96;j++)for(let i=0;i<96;i++){const sx=Math.floor((i-(96-m.w*k)/2)/k),sy=Math.floor((j-(96-m.h*k)/2)/k),o=(j*96+i)*4;const v=sx<0||sy<0||sx>=m.w||sy>=m.h?255:m.mask[sy*m.w+sx]?255:0;id.data[o]=id.data[o+1]=id.data[o+2]=v;id.data[o+3]=255}x.putImageData(id,0,0)}
function panel(){const b=$("#body"),y=b.scrollTop;
 if(TOOL!=="dye")return;b.innerHTML=tabDesign();
 b.scrollTop=y;if($("#match").classList.contains("open"))drawMatch()}
function drawMatch(){$("#mbody").innerHTML=tabRecipe()}
function all(){paint(false);drawOv();readout();panel();undoBtns()}
function selectLayer(id){S.sel=id;const l=S.layers.find(x=>x.id===id);if(l&&l.type!=="full")S.tab="disc";save();readout();panel();drawOv()}
function syncShape(){const L=selL(),sp=SHAPES[L.type]||[];sp.forEach(([nm,k,lo,hi,get],i)=>{const v=get(L),inp=document.querySelector(`[data-id="${L.id}"][data-k="p${k}"]`);if(inp){inp.value=v;inp.style.setProperty("--v",(v-lo)/(hi-lo)*100+"%")}const o=document.querySelector(`[data-for="${L.id}p${k}${i}"]`);if(o)o.textContent=v+unitOf(k)})}
// panel events
const body=$("#body");let DM=false;
const onAct=e=>{const t=e.target.closest("[data-act]");if(!t)return;const a=t.dataset.act,L=selL();
 if(a==="sel"){if(e.target.closest("[data-act]:not([data-act=sel])")!==t&&e.target.closest("[data-act]:not([data-act=sel])"))return;selectLayer(t.dataset.id)}
 else if(a==="up"||a==="down"){const i=S.layers.findIndex(x=>x.id===t.dataset.id),j=i+(a==="up"?1:-1);if(i>0&&j>=1&&j<S.layers.length){const q=S.layers[i];S.layers[i]=S.layers[j];S.layers[j]=q;commit();all()}}
 else if(a==="vis"){const l=S.layers.find(x=>x.id===t.dataset.id);l.vis=!l.vis;commit();all()}
 else if(a==="tgt"){if(t.dataset.t==="rim"&&!S.rim)S.rim={c:"#2B2B2E",w:10,f:.5};S.tgt=t.dataset.t;commit();all()}
 else if(a==="rim"){S.rim=null;S.tgt="disc";commit();all()}
 else if(a==="rimc"){if(S.rim){S.rim.c=t.dataset.c;commit();all()}}
 else if(a==="discphoto"){DM=true;$("#pfile").click()}
 
 else if(a==="match"){drawMatch();$("#match").classList.add("open")}
 else if(a==="addlayer"){dOpen=false;const ty=t.dataset.t,n=S.layers.filter(l=>l.type===ty).length,pool=poolOf("Inventory"),used=new Set(S.layers.flatMap(l=>l.dyes.map(d=>d.n))),pick=(pool.find(d=>!used.has(d.n))||pool[0]).n;
  const N={id:uid(),type:ty,name:TYPES[ty].label+(n?" "+(n+1):""),vis:true,dyes:[{n:pick,s:1}],p:Object.assign({},TYPES[ty].p)};if(ty==="box"){N.p.x=.12*(n%4);N.p.y=-.12*(n%4)}if(ty==="stripe"&&n){const m=n%2?1:-1;N.p.a=wrap(N.p.a+m*.5236*Math.ceil(n/2))}S.layers.push(N);S.sel=N.id;S.tab="disc";commit();all()}
 else if(a==="plastic"){const np=PL.find(p=>p.id===t.dataset.p),op=plastic();if(np){if(np.id==="glow"||PL.some(p=>p.base.toUpperCase()===S.base.toUpperCase())||S.base.toUpperCase()===op.base.toUpperCase())S.base=np.base;S.plastic=np.id;S.trans="";commit();all()}}
 else if(a==="shape"){const l=selL();if(l.type==="stripe"){l.type="box";l.p=Object.assign({x:0,y:0,a:0,w:.8,h:.5},{x:l.p.x,y:l.p.y})}else if(l.type==="box"){l.type="stripe";l.p={x:0,y:0,a:Math.PI/2,h:.45}}commit();all()}
 else if(a==="dyepick"){const i=+t.dataset.i;openPick(n=>{L.dyes[i].n=n;eq(L);commit();all()})}
 else if(a==="dyeadd")openPick(n=>{L.dyes.push({n,s:1});eq(L);commit();all()});
 else if(a==="dyedel"){L.dyes.splice(+t.dataset.i,1);eq(L);commit();all()}
 else if(a==="photo"){DM=false;$("#pfile").click()}
 else if(a==="stdisc"){S.tab="disc";const l=S.layers.filter(x=>x.type!=="stencil").pop();if(l)S.sel=l.id;save();readout();panel();drawOv()}
 else if(a==="stedit"){location.href="/dyed-and-unattached/stencil"}
 else if(a==="stsvg"){const SL=S.layers.find(l=>l.type==="stencil"),m=SL&&STN[SL.id];if(m)stencilMod().then(M=>{const svg=M.maskToCutSvg(m.mask,m.w,m.h,SL.p.s*MM/m.w),u=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml"})),a2=document.createElement("a");a2.href=u;a2.download="stencil.svg";document.body.appendChild(a2);a2.click();a2.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)})}
 else if(a==="reshape"){setEdit(!UI.edit);if(UI.edit)hideSoon()}
 else if(a==="dup"){const N=JSON.parse(JSON.stringify(L));N.id=uid();N.name=L.name+" 2";if(N.type==="stripe"){N.p.x*=-1;N.p.y*=-1;if(!N.p.x&&!N.p.y){const t=axes(N).n;N.p.x=t[0]*.3;N.p.y=t[1]*.3}}else if(N.type==="box"){N.p.x=clamp(N.p.x+.12,-1,1);N.p.y=clamp(N.p.y+.12,-1,1)}S.layers.push(N);S.sel=N.id;commit();all()}
 else if(a==="disctoggle"){dOpen=!dOpen;panel()}
 else if(a==="clearask"){$("#clr").classList.add("open")}
 else if(a==="rmlayer"){const id=t.dataset.id;delete STN[id];S.layers=S.layers.filter(l=>l.id!==id);if(!S.layers.some(l=>l.id===S.sel))S.sel=S.layers[S.layers.length-1].id;commit();all()}
 else if(a==="del"){delete STN[L.id];S.layers=S.layers.filter(l=>l.id!==L.id);S.sel=S.layers[S.layers.length-1].id;commit();all()}
  else if(a==="base"){S.base=t.dataset.c;commit();all()}
 else if(a==="pool"){S.pool=t.dataset.g;save();panel()}
 else if(a==="nd"){S.nd=+t.dataset.n;save();panel()}
 else if(a==="grab"){S.tg=colorAtPt(UI.pt.x,UI.pt.y).hex;save();panel()}
 else if(a==="solve")solve(t);
 else if(a==="use"){const o=lastRec[+t.dataset.r],up=upOf();L.dyes=o.items.map(x=>({n:x.name,s:1}));eq(L);commit();$("#match").classList.remove("open");all();flash(900)}};
body.addEventListener("click",onAct);$("#mbody").addEventListener("click",onAct);$("#mx").onclick=()=>$("#match").classList.remove("open");
const onIn=e=>{const t=e.target;
if(t.type==="range"&&t.dataset.id==="rim"){if(!S.rim)return;const v=+t.value,k=t.dataset.k,lo=+t.min,hi=+t.max;t.style.setProperty("--v",(v-lo)/(hi-lo)*100+"%");if(k==="rw")S.rim.w=v;else S.rim.f=v/100;const o=document.querySelector(`[data-for="rim${k}${t.dataset.i}"]`);if(o)o.textContent=v+"%";paint(true);readout();return}
 if(t.type==="range"){const L=S.layers.find(l=>l.id===t.dataset.id);if(!L)return;const v=+t.value,k=t.dataset.k,i=+t.dataset.i;
  const lo=+t.min,hi=+t.max;t.style.setProperty("--v",(v-lo)/(hi-lo)*100+"%");
  if(k==="s"){L.dyes[i].s=v/100;const o=document.querySelector(`[data-for="${L.id}s${i}"]`);if(o)o.textContent=v+"%"}
  else if(k==="pf"){L.p.f=v/100;const o=document.querySelector(`[data-for="${L.id}pf9"]`);if(o)o.textContent=v+"%"}
  else{const sp=SHAPES[L.type].find(x=>"p"+x[1]===k);sp[5](L,v);syncShape()}
  paint(true);readout();if(k!=="s")flash(700);return}
 if(t.id==="rC"){const v=t.value.toUpperCase();if(S.rim&&hexOk(v)){S.rim.c=v;paint(true);readout()}}
 if(t.id==="bC"){const v=t.value.toUpperCase();if(hexOk(v)){S.base=v;paint(true);readout()}}
 if(t.id==="tC"||t.id==="tH"){const v=t.value.toUpperCase();if(hexOk(v)){S.trans=v;if(t.id==="tC")$("#tH").value=v;else $("#tC").value=v;paint(true);readout()}}
 if(t.id==="gC"){const v=t.value.toUpperCase();if(hexOk(v)){S.tg=v;save()}}};

// disc color spectrum picker (saturation/value square + hue), marker shows the current color
{const cur=pk=>pk==="r"?S.rim&&S.rim.c:S.base,put=(pk,v)=>{if(pk==="r"){if(S.rim)S.rim.c=v}else S.base=v};
 const sync=(box,pk)=>{const c=String(cur(pk)).toUpperCase(),[h0,sa,va]=hsvOf(c),H=pkH[pk]??h0,sv=box.querySelector(".sv"),mk=box.querySelector(".mk");
  sv.style.background=`linear-gradient(to top,#000,#0000),linear-gradient(to right,#fff,hsl(${H},100%,50%))`;mk.style.left=sa*100+"%";mk.style.top=(1-va)*100+"%";mk.style.background=c;
  box.nextElementSibling&&box.nextElementSibling.querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.c===c))};
 let drag=null;
 const at=(e,box,pk)=>{const r=box.querySelector(".sv").getBoundingClientRect(),sa=clamp((e.clientX-r.left)/r.width,0,1),va=1-clamp((e.clientY-r.top)/r.height,0,1),H=pkH[pk]??0;put(pk,hsvHex(H,sa,va));sync(box,pk);paint(true);readout()};
 body.addEventListener("pointerdown",e=>{const sv=e.target.closest&&e.target.closest(".sv");if(!sv)return;const box=sv.parentNode,pk=box.dataset.pk;drag={box,pk};sv.setPointerCapture(e.pointerId);at(e,box,pk);e.preventDefault()});
 body.addEventListener("pointermove",e=>{if(drag)at(e,drag.box,drag.pk)});
 const end=()=>{if(drag){drag=null;commit()}};body.addEventListener("pointerup",end);body.addEventListener("pointercancel",end);
 body.addEventListener("input",e=>{const t=e.target;if(!t.classList||!t.classList.contains("hue"))return;const box=t.closest(".pkr"),pk=box.dataset.pk,c=String(cur(pk)),[,sa,va]=hsvOf(c);pkH[pk]=+t.value;put(pk,hsvHex(+t.value,sa,va));sync(box,pk);paint(true);readout()});
 body.addEventListener("change",e=>{if(e.target.classList&&e.target.classList.contains("hue"))commit()});
}
body.addEventListener("input",onIn);$("#mbody").addEventListener("input",onIn);
body.addEventListener("change",e=>{const t=e.target;if(t.type==="range"||/^[btr]([CH])$/.test(t.id||"")){commit();if(t.id==="bC"||t.id==="rC")panel();if(t.type==="range")panel()}});
let lastRec=[];
function solve(btn){const tg=S.tg.toUpperCase();if(!hexOk(tg))return;btn.textContent="…";const p=plastic(),pool=poolOf(S.pool).map(d=>d.n);
 setTimeout(()=>{lastRec=DE.recipe(tg,S.base,p.fam,pool,{maxDyes:S.nd,top:6,transHex:transHex()});
  $("#rec").innerHTML=lastRec.map((o,i)=>`<div class="rc"><i class="sw" style="background:${o.hex}"></i><div class="m"><div class="a">${Math.max(0,Math.round(100-o.dE*3))}% match</div><div class="b">${o.items.map(x=>esc(x.name)+" "+Math.round(x.s/upOf()*100)+"%").join(" + ")}</div></div><button data-act="use" data-r="${i}">Use</button></div>`).join("");
  btn.textContent="Find"},20)}

// header
const flip=(b,t)=>{const o=b.dataset.o||b.textContent;b.dataset.o=o;b.textContent=t;clearTimeout(b._t);b._t=setTimeout(()=>b.textContent=o,1400)};
const pad=n=>String(n).padStart(2,"0"),slug=t=>t.replace(/UV Blast |iDye Poly |ProChem /g,"").replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,"");
const deg=a=>Math.round(((a*57.296)%360+360)%360);
function recipeText(d){d=d||new Date();const mm=r=>Math.round(r*MM),dy=l=>l.dyes.length>1?"blend, equal parts mixed in one solution: "+l.dyes.map(x=>x.n).join(" + "):l.dyes.map(x=>x.n).join("")||"no dye (keep disc color)",pr=l=>{if(!l.dyes.length)return"";const o=colorAt(l.dyes.map(d=>({name:d.n,s:d.s*upOf()})),.5);return" [predicted "+o.hex+", "+(acc(o).replace("Accuracy ","accuracy ")||"accuracy n/a")+"]"};
 const L=["DYE RECIPE "+d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+" "+pad(d.getHours())+":"+pad(d.getMinutes()),"Disc color: "+S.base+" ("+plastic().name+")"+(S.rim?", rim "+S.rim.c+" "+Math.round(S.rim.w*1.05)+" mm wide, edge "+(S.rim.f>.66?"crisp":S.rim.f>.33?"soft":"fuzzy"):""),"Each dye is a standard painted coat of that dye. A blend is its listed dyes mixed in equal parts in one solution.","Disc: 210 mm across. Angles: 0 deg = 3 o'clock, clockwise. Positions in mm from disc center (+x right, +y down).","Overlaps: each layer is a separate coat. Dyes add up in the overlap and coat order does not matter. Dye one region per step; vinyl (Cricut SVG) covers everything outside that region. SVG center = disc center.",""];
 const vis=S.layers.map((l,i)=>({l,i})).filter(o=>o.l.vis);let step=0;
 vis.forEach(({l,i})=>{const p=l.p;let g,f="";
  if(l.type==="full")g="outside all shapes (whole disc if no shapes)";
  else if(l.type==="stripe"){const n=axes(l).n,dd=p.x*n[0]+p.y*n[1];g="stripe "+mm(p.h)+" mm wide, long edges at "+deg(p.a)+" deg, center line "+mm(Math.abs(dd))+" mm from disc center ("+mm(p.x)+", "+mm(p.y)+" mm foot point)"}
  else if(l.type==="box")g="box "+mm(p.w)+" x "+mm(p.h)+" mm, rotated "+deg(p.a)+" deg, center ("+mm(p.x)+", "+mm(p.y)+") mm";
  else if(l.type==="stencil"){const m=STN[l.id];g=m?"photo stencil, style "+(m.style||"photo")+" (stencil.svg, Cricut, black = cut out) "+mm(p.s)+" x "+mm(p.s*m.h/m.w)+" mm, center ("+mm(p.x)+", "+mm(p.y)+") mm; dye through the holes; compile check: "+m.verdict:"stencil"}
  else g="";
  if(l.type!=="stencil"&&l.dyes.length&&vis.length>1)f=" - vinyl file layer-"+(i+1)+".svg";
  step++;L.push(step+". "+(l.type==="full"?"Whole disc":ltitle(l))+": "+dy(l)+pr(l)+" - "+g+f)});
 const a=Math.atan2(UI.pt.y,UI.pt.x),pts=[.35,.72,.93].map(r=>colorAtPt(Math.cos(a)*r,Math.sin(a)*r).hex);
 L.push("","Predicted (sample point): center "+pts[0]+", mid "+pts[1]+", rim "+pts[2]);return L.join("\n")}
function fileName(d){const bl=S.layers[0],parts=[d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()),pad(d.getHours())+pad(d.getMinutes()),slug(plastic().name),slug(S.base)].concat(S.rim?["Rim-"+slug(S.rim.c)]:[]);
 S.layers.forEach((l,i)=>{if(l.vis&&l.dyes.length)parts.push((i?ltitle(l).replace(/\s+/g,""):"Base")+"-"+l.dyes.map(x=>slug(x.n)).join("+"))});return parts.join("_").slice(0,150)}
const SB="https://wtymjxscneufjlkkywyg.supabase.co/rest/v1/du_dye_recipes",SK="sb_publishable_rimiZU1rSfq1nCEOUBw3ew_1j_GuZUx";
const sent=new Set();
const SBR="https://wtymjxscneufjlkkywyg.supabase.co";
const uuid=()=>crypto.randomUUID?crypto.randomUUID():"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const v=Math.random()*16|0;return(c==="x"?v:(v&3|8)).toString(16)});
async function put1(id,name,blob,type){try{const r=await fetch(SBR+"/storage/v1/object/du-dye-designs/"+id+"/"+name,{method:"POST",headers:{apikey:SK,Authorization:"Bearer "+SK,"Content-Type":type,"x-upsert":"false"},body:blob});return r.ok||r.status===409}catch(e){return false}}
async function put(id,name,blob,type){for(let k=0;k<3;k++){if(await put1(id,name,blob,type))return true;await new Promise(r=>setTimeout(r,500*(k+1)))}return false}
const toBlob=(c,t)=>new Promise(r=>c.toBlob(r,t||"image/png"));
function regionSvg(idx,title){const N=1400,V=N+1,layers=S.layers,n=layers.length,mk=new Uint8Array(N*N);
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){const u=(x+.5)/N*2-1,v=(y+.5)/N*2-1;if(u*u+v*v>1)continue;let own=0;for(let i=n-1;i>=0;i--){const L=layers[i];if(!L.vis)continue;if((L.type==="full"?1:maskW(L,u,v,0,0))>.5){own=i;break}}if(own===idx)mk[y*N+x]=1}
 const nx=new Map(),add=(a,b)=>{const l=nx.get(a);l?l.push(b):nx.set(a,[b])};
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){if(!mk[y*N+x])continue;
  if(y===0||!mk[(y-1)*N+x])add(y*V+x,y*V+x+1);if(x===N-1||!mk[y*N+x+1])add(y*V+x+1,(y+1)*V+x+1);
  if(y===N-1||!mk[(y+1)*N+x])add((y+1)*V+x+1,(y+1)*V+x);if(x===0||!mk[y*N+x-1])add((y+1)*V+x,y*V+x)}
 const sc=210/N,f=q=>(Math.round(q*sc*100)/100),parts=[];
 const dist=(P,A,Z)=>{const dx=Z[0]-A[0],dy=Z[1]-A[1],l=dx*dx+dy*dy;if(!l)return Math.hypot(P[0]-A[0],P[1]-A[1]);const t=((P[0]-A[0])*dx+(P[1]-A[1])*dy)/l;return Math.hypot(P[0]-A[0]-t*dx,P[1]-A[1]-t*dy)};
 const rdp=(pts,eps)=>{const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;const st=[[0,pts.length-1]];while(st.length){const[a,b]=st.pop();let m=-1,k=0;for(let i=a+1;i<b;i++){const d=dist(pts[i],pts[a],pts[b]);if(d>m){m=d;k=i}}if(m>eps){keep[k]=1;st.push([a,k],[k,b])}}return pts.filter((_,i)=>keep[i])};
 for(const[s0]of nx){while((nx.get(s0)||[]).length){const loop=[];let cur=s0;while(true){const l=nx.get(cur);if(!l||!l.length)break;const q=l.pop();loop.push(cur);cur=q;if(cur===s0)break}
  if(loop.length<4)continue;let pts=loop.map(k=>[k%V,Math.floor(k/V)]);
  pts=pts.filter((P,i)=>{const A=pts[(i+pts.length-1)%pts.length],Z=pts[(i+1)%pts.length];return(P[0]-A[0])*(Z[1]-P[1])-(P[1]-A[1])*(Z[0]-P[0])!==0});
  if(pts.length<3)continue;let far=0,fd=0;for(let i=1;i<pts.length;i++){const d=Math.hypot(pts[i][0]-pts[0][0],pts[i][1]-pts[0][1]);if(d>fd){fd=d;far=i}}
  const a=rdp(pts.slice(0,far+1),.75),b=rdp(pts.slice(far).concat([pts[0]]),.75),all=a.concat(b.slice(1,-1));
  if(all.length>=3)parts.push("M"+all.map(P=>f(P[0])+" "+f(P[1])).join("L")+"Z")}}
 return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="210mm" viewBox="0 0 210 210"><title>${esc(title)}</title><path d="${parts.join("")}" fill="none" stroke="#000" stroke-width="0.1" fill-rule="evenodd"/></svg>\n`}
async function uploadFiles(id,spec,row){const f={},W=1200,c=document.createElement("canvas");c.width=c.height=W;c.getContext("2d").putImageData(renderDisc(W),0,0);
 if(await put(id,"preview.png",await toBlob(c),"image/png"))f.preview=true;
 const L=S.layers.find(l=>l.type==="stencil"&&l.vis),m=L&&STN[L.id];
 if(await put(id,"design.json",new Blob([JSON.stringify({file_name:row.file_name,recipe:row.recipe,spec,stencil:m?{width_mm:+(L.p.s*MM).toFixed(1),height_mm:+(L.p.s*MM*m.h/m.w).toFixed(1),offset_mm:[+(L.p.x*MM).toFixed(1),+(L.p.y*MM).toFixed(1)],verdict:m.verdict,change:m.change,style:m.style}:null},null,1)],{type:"application/json"}),"application/json"))f.design=true;
 if(m){const M=await stencilMod(),svg=M.maskToCutSvg(m.mask,m.w,m.h,L.p.s*MM/m.w);
  if(await put(id,"stencil.svg",new Blob([svg],{type:"image/svg+xml"}),"image/svg+xml"))f.stencil_svg=true;
  const sc=document.createElement("canvas");sc.width=m.w;sc.height=m.h;const sx=sc.getContext("2d"),im=sx.createImageData(m.w,m.h);for(let i=0;i<m.mask.length;i++){const v=m.mask[i]?255:0;im.data[i*4]=im.data[i*4+1]=im.data[i*4+2]=v;im.data[i*4+3]=255}sx.putImageData(im,0,0);
  if(await put(id,"stencil.png",await toBlob(sc),"image/png"))f.stencil_png=true;
  if(m.photo&&await put(id,"photo.jpg",m.photo,"image/jpeg"))f.photo=true}
 if(S.layers.filter(l=>l.vis).length>1)for(let i=0;i<S.layers.length;i++){const l=S.layers[i];if(!l.vis||l.type==="stencil"||!l.dyes.length)continue;
  if(await put(id,"layer-"+(i+1)+".svg",new Blob([regionSvg(i,"Layer "+(i+1)+" "+ltitle(l)+" "+l.dyes.map(d=>d.n).join("+"))],{type:"image/svg+xml"}),"image/svg+xml"))f["layer_"+(i+1)]=true}
 return f}
async function logRecipe(action){if(isAdmin())return;try{const d=new Date(),spec={plastic:S.plastic,base:S.base,rim:S.rim,trans:S.trans,layers:S.layers.map(l=>({type:l.type,name:l.name,vis:l.vis,dyes:l.dyes,p:l.p}))},key=JSON.stringify(spec);if(sent.has(key))return;sent.add(key);
 const id=uuid(),row={id,file_name:fileName(d),plastic:plastic().name,base_hex:S.base,recipe:recipeText(d),spec,action};
 row.files=await uploadFiles(id,spec,row);row.has_stencil=!!row.files.stencil_svg;
 const q=JSON.parse(localStorage.getItem("dds11q")||"[]");q.push(row);localStorage.setItem("dds11q",JSON.stringify(q.slice(-20)));flushQ()}catch(e){}}
function flushQ(){let q;try{q=JSON.parse(localStorage.getItem("dds11q")||"[]")}catch(e){return}if(!q.length)return;
 fetch(SB,{method:"POST",keepalive:true,headers:{apikey:SK,Authorization:"Bearer "+SK,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify(q)}).then(r=>{if(r.ok){try{localStorage.setItem("dds11q","[]")}catch(e){}}}).catch(()=>{})}
function publicText(){return S.layers.filter(l=>l.vis&&l.dyes.length).map(l=>ltitle(l)+": "+l.dyes.map(d=>d.n).join(" + ")).join("\n")+"\n"+plastic().name+" "+S.base+(S.rim?" rim "+S.rim.c:"")}
function copyText(t){return(navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(t):Promise.reject()).catch(()=>{const x=document.createElement("textarea");x.value=t;x.style.cssText="position:fixed;left:-999px;top:0;opacity:0";document.body.appendChild(x);x.focus();x.select();try{document.execCommand("copy")}catch(e){}x.remove()})}
function makePng(){return new Promise(r=>{const W=1600,c=document.createElement("canvas");c.width=c.height=W;c.getContext("2d").putImageData(renderDisc(W),0,0);c.toBlob(r,"image/png")})}
let pngBlob=null,pngUrl="";
async function prepPng(){pngBlob=await makePng();if(pngUrl)URL.revokeObjectURL(pngUrl);pngUrl=URL.createObjectURL(pngBlob)}
$("#png").onclick=async()=>{const b=$("#png");logRecipe("save");flip(b,"…");await prepPng();
 const f=new File([pngBlob],"disc.png",{type:"image/png"});
 if(navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f]});flip(b,"Saved");return}catch(e){if(e&&e.name==="AbortError"){flip(b,"Save");return}}}
 $("#svimg").src=pngUrl;$("#svdl").href=pngUrl;$("#save").classList.add("open");flip(b,"Save")};
if($("#clr")){$("#clrx").onclick=()=>$("#clr").classList.remove("open");$("#clr").addEventListener("click",e=>{if(e.target.id==="clr")$("#clr").classList.remove("open")});$("#clrok").onclick=()=>{$("#clr").classList.remove("open");S=defState();for(const k in STN)delete STN[k];commit();all()};}
$("#svx").onclick=()=>$("#save").classList.remove("open");$("#save").addEventListener("click",e=>{if(e.target.id==="save")$("#save").classList.remove("open")});
const isAdmin=()=>{try{return!!localStorage.getItem("du-admin-device-token-v1")}catch(e){return false}};
if($("#copy")){if(isAdmin()&&TOOL==="dye")$("#copy").hidden=false;$("#copy").onclick=()=>{copyText(recipeText());flip($("#copy"),"Copied")}}
// ---------- photo to stencil ----------
const DV=window.__dsv||"1";let SM=null,SG=null;const stencilMod=()=>SM||(SM=import("/dyed-and-unattached/dye-studio/photo-stencil.mjs?v="+DV)),segMod=()=>SG||(SG=import("/dyed-and-unattached/dye-studio/segment.mjs?v="+DV));
async function subjectMask(d){const k=FR.z.toFixed(3)+"|"+(FR.ox|0)+"|"+(FR.oy|0);if(FR.mk===k&&FR.mask)return FR.mask;let m=null;try{const G=await segMod();m=await G.segmentSubject(d,FN)}catch(e){try{const M=await stencilMod();m=M.isolateSubject(d,FN)}catch(e2){}}FR.mk=k;FR.mask=m;return m}
async function lineData(d){const m=await subjectMask(d);if(!m)return null;const k=FR.mk;if(FR.lk===k&&FR.line)return FR.line;let y=null;try{const G=await segMod();y=await G.lineMap(d,m,FN)}catch(e){}FR.lk=k;FR.line=y;return y}
async function autoFrame(){if(FR.dm||!FR.img)return;const my=++FR.seq;frameDraw();try{const G=await segMod(),d=fcan.getContext("2d").getImageData(0,0,FN,FN).data,m=await G.segmentSubject(d,FN);if(my!==FR.seq)return;const f=G.headFrame(m,FN),k=FN/f.side;FR.z=clamp(FR.z*k,1,4);const k2=FR.z/1;FR.ox=-(f.cx-FN/2)*k2;FR.oy=-(f.cy-FN/2)*k2;$("#fz").value=Math.round(FR.z*100);$("#fzv").textContent=Math.round(FR.z*100)+"%";$("#fz").style.setProperty("--v",(FR.z-1)/3*100+"%");FR.mask=null}catch(e){}frameSched()}
const FN=640,FR={style:"photo",cut:true,line:null,lk:"",mask:null,mk:"",img:null,z:1,ox:0,oy:0,detail:.7,balance:.7,invert:false,res:null,t:null,seq:0};
const fcan=document.createElement("canvas");fcan.width=fcan.height=FN;
function frameDraw(){const x=fcan.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,FN,FN);const im=FR.img;if(!im)return;const b=Math.max(FN/im.width,FN/im.height)*FR.z,w=im.width*b,h=im.height*b,mx=Math.max(0,(w-FN)/2),my=Math.max(0,(h-FN)/2);FR.ox=clamp(FR.ox,-mx,mx);FR.oy=clamp(FR.oy,-my,my);x.drawImage(im,FN/2-w/2+FR.ox,FN/2-h/2+FR.oy,w,h)}
function frameShow(){const dm=FR.dm;frameDraw();const v=$("#fv"),x=v.getContext("2d");x.clearRect(0,0,FN,FN);x.drawImage(fcan,0,0);x.save();x.fillStyle="rgba(8,10,13,.72)";x.beginPath();x.rect(0,0,FN,FN);x.arc(FN/2,FN/2,FN/2-1,0,7);x.fill("evenodd");x.restore();x.beginPath();x.arc(FN/2,FN/2,FN/2-1,0,7);x.lineWidth=3;x.strokeStyle="#fff";x.stroke();if(dm){x.lineWidth=2;x.setLineDash([8,8]);for(const q of[.35,.85]){x.beginPath();x.arc(FN/2,FN/2,q*FN/2,0,7);x.stroke()}x.setLineDash([])}}
async function frameCompute(){if(!FR.dm)return;const my=++FR.seq;$("#fok").classList.add("dis");if(FR.dm){const d=fcan.getContext("2d").getImageData(0,0,FN,FN).data,ch=[[],[],[]];for(let y=0;y<FN;y+=3)for(let x=0;x<FN;x+=3){const r=Math.hypot(x-FN/2,y-FN/2)/(FN/2);if(r<.35||r>.85)continue;const k=(y*FN+x)*4;ch[0].push(d[k]);ch[1].push(d[k+1]);ch[2].push(d[k+2])}const hx=rgbHex(ch.map(a=>{a.sort((p,q)=>p-q);return a[a.length>>1]||0}));FR.res={hex:hx};const c=$("#fp"),x=c.getContext("2d");x.fillStyle=hx;x.fillRect(0,0,c.width,c.height);$("#fok").classList.remove("dis");return}try{const M=await stencilMod(),d=fcan.getContext("2d").getImageData(0,0,FN,FN).data;let res=null;try{res=M.buildStencil(d,{style:FR.style,detail:FR.detail,balance:FR.balance,invert:FR.invert,mask:FR.cut&&(FR.style==="photo"||FR.style==="bold")?await subjectMask(d):null,line:FR.cut&&FR.style==="photo"?await lineData(d):null})}catch(e){}
 if(my!==FR.seq)return;FR.res=res;const c=$("#fp"),x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);
 if(res){const k=Math.min(c.width/res.w,c.height/res.h),id=x.createImageData(c.width,c.height);for(let j=0;j<c.height;j++)for(let i=0;i<c.width;i++){const sx=Math.floor((i-(c.width-res.w*k)/2)/k),sy=Math.floor((j-(c.height-res.h*k)/2)/k),o=(j*c.width+i)*4,v=sx<0||sy<0||sx>=res.w||sy>=res.h?255:res.mask[sy*res.w+sx]?255:0;id.data[o]=id.data[o+1]=id.data[o+2]=v;id.data[o+3]=255}x.putImageData(id,0,0)}
 $("#fok").classList.toggle("dis",!res)}catch(e){}}
const GEN="https://wtymjxscneufjlkkywyg.supabase.co/functions/v1/du-stencil-gen";
function vid(){try{let v=localStorage.getItem("du_vid");if(!v){v=Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem("du_vid",v)}return v}catch(e){return "x"}}
function genBlob(){return new Promise(res=>{const im=FR.img,k=Math.min(1,1024/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);c.toBlob(res,"image/jpeg",.88)})}
function drawDisc(x,S,res){const k=S/213,cx=S/2;x.fillStyle="#f3eadf";x.fillRect(0,0,S,S);x.beginPath();x.arc(cx,cx,S/2-2,0,7);x.fillStyle="#e4ded4";x.fill();x.lineWidth=S*.045;x.strokeStyle="#d3ccc0";x.beginPath();x.arc(cx,cx,S/2-2-S*.0225,0,7);x.stroke();x.lineWidth=1.5;x.strokeStyle="#b9b0a2";x.beginPath();x.arc(cx,cx,S/2-2,0,7);x.stroke();if(!res)return;const o=document.createElement("canvas");o.width=res.w;o.height=res.h;const q=o.getContext("2d"),id=q.createImageData(res.w,res.h);for(let i=0;i<res.w*res.h;i++){const j=i*4;id.data[j]=id.data[j+1]=id.data[j+2]=30;id.data[j+3]=res.mask[i]?0:255}q.putImageData(id,0,0);const sw=res.w*res.mmPerPx*k,sh=res.h*res.mmPerPx*k;x.imageSmoothingQuality="high";x.drawImage(o,cx-sw/2,cx-sh/2,sw,sh)}
function showRes(res){const c=$("#fp"),x=c.getContext("2d");drawDisc(x,c.width,res)}
function fmsg(t){const c=$("#fp"),x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);if(t){x.fillStyle="#555";x.font="600 22px system-ui,sans-serif";x.textAlign="center";x.fillText(t,c.width/2,c.height/2)}}
async function genOnce(blob,dir,retry){const hd={"content-type":"image/jpeg","x-vid":vid(),apikey:SK,...adminHd()};if(dir)hd["x-dir"]=dir;if(retry)hd["x-retry"]="1";const r=await fetch(GEN,{method:"POST",headers:hd,body:blob});const j=await r.json().catch(()=>({}));if(!r.ok||!j.png)throw Object.assign(new Error(j.error||"fail"),{code:j.error||"fail",left:j.left});const im=new Image();await new Promise((ok,no)=>{im.onload=ok;im.onerror=no;im.src="data:image/png;base64,"+j.png});const n=1024,c=document.createElement("canvas");c.width=c.height=n;const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,n,n);x.drawImage(im,0,0,n,n);const lum=adjLumFor(c,DEFA(),null);const M=await stencilMod();let res=null;try{res=M.compileGenerated(lum,n,190.5/1024);if(res&&!inSafe(res))res={...res,verdict:"FAIL"}}catch(e){}return{res,left:j.left,gc:c,tally:j.tally}}
const LIM=3;
function stUI(){const R=$("#frame");if(!R||TOOL!=="stencil")return;R.dataset.gen=FR.gc?"1":"0";R.dataset.busy=FR.busy?"1":"0";const none=FR.left===0&&!FR.tally;const b=$("#stpick"),n=$("#stnew");if(b){b.disabled=none;$("#stpl").textContent=none?"None left today":"Choose a photo"}if(n)n.disabled=none||!!FR.busy;const m=$("#stleft");if(m)m.textContent=FR.tally?"":FR.left==null?"":FR.left+(FR.left===1?" run":" runs")+" left today"}
function dirUI(){stUI();const off=FR.busy||!FR.gc||FR.left===0;["#gd1","#gd2","#gd3"].forEach(q=>$(q).classList.toggle("dis",off));const e=$("#fleft");if(FR.tally){const t=FR.tally,f=x=>x.n+" · $"+x.usd.toFixed(2);e.textContent="Today "+f(t.day)+"   7 days "+f(t.week)+"   Month "+f(t.month)+"   Visitors "+f(t.visitors);e.classList.remove("lo");const m=$("#stleft");if(m)m.textContent=e.textContent;return}e.textContent=FR.left==null?"":FR.left===0?"None left today":FR.left+" of "+LIM+(FR.left===1?" run":" runs")+" left today";e.classList.toggle("lo",FR.left!=null&&FR.left<=1)}
function thumb(r){const c=document.createElement("canvas");c.width=c.height=72;drawDisc(c.getContext("2d"),72,r);return c.toDataURL()}
function gensSave(){const g=FR.gens[FR.ci];if(g){g.adj={...FR.adj};g.br=FR.br;g.base=FR.base;g.th=thumb(FR.base)}}
function thUI(){stSave();const e=$("#gth");e.innerHTML="";e.style.display=FR.gens.length>1?"flex":"none";FR.gens.forEach((g,i)=>{const b=document.createElement("button");b.className="gt"+(i===FR.ci?" on":"");const im=new Image();im.src=g.th;b.appendChild(im);b.onclick=()=>genSel(i);e.appendChild(b)})}
function genSel(i){if(FR.busy||i===FR.ci)return;gensSave();const g=FR.gens[i];FR.ci=i;FR.gc=g.gc;FR.adj={...g.adj};FR.br=g.br;FR.last={adj:{...g.adj},br:g.br};FR.base=g.base;FR.res=FR.invert?invRes(g.base):g.base;adjSync();showRes(FR.res);thUI();hreset()}
function banner(t){showRes(FR.res);const c=$("#fp"),x=c.getContext("2d");x.fillStyle="rgba(8,10,13,.85)";x.fillRect(0,c.height-44,c.width,44);x.fillStyle="#fff";x.font="600 18px system-ui,sans-serif";x.textAlign="center";x.fillText(t,c.width/2,c.height-credit());clearTimeout(FR.bt);FR.bt=setTimeout(()=>{if(FR.res)showRes(FR.res)},1800)}
function credit(){return 16}
const DEFA=()=>({t:0,s:0,z:1,m:0,ox:0,oy:0,r:0});
function adjSync(){const A=FR.adj;$("#gt").value=A.t;$("#gz").value=Math.round(A.z*100);$("#gmi").classList.toggle("on",!!A.m);{const rt=$("#grt");if(rt){rt.value=Math.round((A.r||0)*180/Math.PI);rt.style.setProperty("--v",(rt.value-rt.min)/(rt.max-rt.min)*100+"%")}}["#gt","#gz"].forEach(q=>{const el=$(q);el.style.setProperty("--v",(el.value-el.min)/(el.max-el.min)*100+"%")})}
function adjReset(){FR.adj=DEFA();FR.br=null;FR.last={adj:{...FR.adj},br:null};adjSync();hreset()}
function inSafe(r){const w=r.w,h=r.h,m=r.mask,cx=w/2,cy=h/2,R2=459*459;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(!m[y*w+x]){const dx=x-cx,dy=y-cy;if(dx*dx+dy*dy>R2)return false}return true}
function hreset(){FR.hs=[{adj:{...FR.adj},br:FR.br?FR.br.slice():null}];FR.hi=0;FR.ht=0;hui()}
function hui(){$("#gun").classList.toggle("dis",FR.hi<1);$("#grd").classList.toggle("dis",FR.hi>=FR.hs.length-1)}
function hpush(){const s={adj:{...FR.adj},br:FR.br?FR.br.slice():null},now=Date.now();if(FR.hi===FR.hs.length-1&&FR.hi>0&&now-FR.ht<900)FR.hs[FR.hi]=s;else{FR.hs=FR.hs.slice(0,FR.hi+1);FR.hs.push(s);if(FR.hs.length>30)FR.hs.shift();FR.hi=FR.hs.length-1}FR.ht=now;hui()}
function hgo(d){if(FR.busy||!FR.gc)return;const i=FR.hi+d;if(i<0||i>=FR.hs.length)return;FR.hi=i;const s=FR.hs[i];FR.adj={...s.adj};FR.br=s.br?s.br.slice():null;FR.last={adj:{...FR.adj},br:FR.br?FR.br.slice():null};adjSync();hui();adjRun(false)}
async function genStencil(dir){if(FR.busy||FR.dm||!FR.img)return;FR.busy=true;gprog(1);const my=++FR.seq,prev=FR.gc?{gc:FR.gc,adj:{...FR.adj},br:FR.br,base:FR.base}:null;$("#fok").classList.add("dis");dirUI();if(!prev){FR.res=null;fmsg("Generating")}else{banner("Generating")}try{const blob=await genBlob();let out=await genOnce(blob,dir,false);if(my!==FR.seq)return;FR.left=out.left;if(out.tally)FR.tally=out.tally;if(!out.res||out.res.verdict!=="PASS"){if(!prev)fmsg("Refining");else banner("Refining");dirUI();const o2=await genOnce(blob,dir,true);if(my!==FR.seq)return;if(o2.res&&(!out.res||o2.res.verdict==="PASS"||(out.res.verdict!=="PASS"&&o2.res.change<out.res.change)))out=o2;if(o2.left!=null)FR.left=o2.left;if(o2.tally)FR.tally=o2.tally}
 if(out.res&&out.res.verdict==="PASS"){if(prev)gensSave();FR.gc=out.gc;adjReset();FR.base=out.res;FR.gens.push({gc:out.gc,adj:{...FR.adj},br:null,base:out.res,th:thumb(out.res)});FR.ci=FR.gens.length-1;thUI();FR.res=FR.invert?invRes(out.res):out.res;showRes(FR.res);$("#fok").classList.remove("dis")}else if(prev){FR.res=FR.invert?invRes(prev.base):prev.base;banner("Kept previous");$("#fok").classList.remove("dis")}else{fmsg("Try another photo")}}catch(e){if(my===FR.seq){if(e.left!=null)FR.left=e.left;const t=e.code==="limit"?"None left today":e.code==="cap"?"Unavailable":"Try again";if(prev){FR.res=FR.invert?invRes(prev.base):prev.base;banner(t);$("#fok").classList.remove("dis")}else fmsg(t)}}finally{FR.busy=false;gprog(0);dirUI()}}
function mor(b,n,dil){const W=1024;let a=b,t=new Uint8Array(W*W);for(let k=0;k<n;k++){for(let y=0;y<W;y++)for(let x=0;x<W;x++){const i=y*W+x;let v=a[i];if(dil){if(!v&&((x>0&&a[i-1])||(x<W-1&&a[i+1])||(y>0&&a[i-W])||(y<W-1&&a[i+W])))v=1}else if(v&&((x>0&&!a[i-1])||(x<W-1&&!a[i+1])||(y>0&&!a[i-W])||(y<W-1&&!a[i+W])))v=0;t[i]=v}const q=a;a=t;t=q===b?new Uint8Array(W*W):q}return a}
function fitOf(gc){if(gc._fit)return gc._fit;const W=1024,d=gc.getContext("2d").getImageData(0,0,W,W).data,dk=k=>d[k*4]*.3+d[k*4+1]*.59+d[k*4+2]*.11<128;let x0=W,y0=W,x1=-1,y1=-1;for(let y=0;y<W;y++)for(let x=0;x<W;x++)if(dk(y*W+x)){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}if(x1<0)return gc._fit={cx:512,cy:512,k:1};const cx=(x0+x1)/2,cy=(y0+y1)/2;let m=1;for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(dk(y*W+x)){const r=(x-cx)*(x-cx)+(y-cy)*(y-cy);if(r>m)m=r}return gc._fit={cx,cy,k:457/Math.sqrt(m)}}
function adjLumFor(gc,A,br){const W=1024,F=fitOf(gc),s=F.k*A.z,c=document.createElement("canvas");c.width=c.height=W;const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,W,W);x.save();x.translate(W/2+(A.ox||0),W/2+(A.oy||0));x.rotate(A.r||0);x.scale(A.m?-s:s,s);x.translate(-F.cx,-F.cy);x.filter=A.t?"blur(3px)":"none";x.drawImage(gc,0,0);x.filter="none";x.restore();
 const d=x.getImageData(0,0,W,W).data,th=128-A.t*16;let b=new Uint8Array(W*W);for(let i=0;i<W*W;i++)b[i]=d[i*4]*.3+d[i*4+1]*.59+d[i*4+2]*.11<th?1:0;
 if(A.s){b=mor(mor(b,2*A.s,0),2*A.s,1);b=mor(mor(b,2*A.s,1),2*A.s,0)}
 const l=new Float32Array(W*W);for(let i=0;i<W*W;i++){let v=b[i];if(br&&br[i])v=br[i]===1?1:0;l[i]=v?0:255}return l}
function dropSmallWhite(L,minPx){const n=1024,lab=new Int32Array(n*n);const st=new Int32Array(n*n);for(let i=0;i<n*n;i++){if(L[i]<128||lab[i])continue;let sp=0,cnt=0;st[sp++]=i;lab[i]=1;while(sp){const p=st[--sp];cnt++;const x=p%n;if(x>0&&L[p-1]>=128&&!lab[p-1]){lab[p-1]=1;st[sp++]=p-1}if(x<n-1&&L[p+1]>=128&&!lab[p+1]){lab[p+1]=1;st[sp++]=p+1}if(p>=n&&L[p-n]>=128&&!lab[p-n]){lab[p-n]=1;st[sp++]=p-n}if(p<n*n-n&&L[p+n]>=128&&!lab[p+n]){lab[p+n]=1;st[sp++]=p+n}}if(cnt<minPx){sp=0;st[sp++]=i;L[i]=0;while(sp){const p=st[--sp];const x=p%n;for(const q of[x>0?p-1:-1,x<n-1?p+1:-1,p>=n?p-n:-1,p<n*n-n?p+n:-1]){if(q>=0&&L[q]>=128&&lab[q]===1){L[q]=0;st[sp++]=q}}}}}}
async function adjRun(push){if(FR.busy||!FR.gc)return;const my=++FR.aseq;await new Promise(r=>setTimeout(r,20));const M=await stencilMod();const tr=(A,br)=>{try{const L=adjLumFor(FR.gc,A,br);dropSmallWhite(L,200);let r=M.compileGenerated(L,1024,190.5/1024);for(let k=0;k<4&&r&&r.verdict!=="PASS"&&r.fails&&r.fails.length&&r.fails.length<=8;k++){const o=r.origin||[0,0];for(const b of r.fails){for(let y=Math.max(0,b[1]+o[1]-1);y<=Math.min(1023,b[3]+o[1]+1);y++)for(let x=Math.max(0,b[0]+o[0]-1);x<=Math.min(1023,b[2]+o[0]+1);x++)L[y*1024+x]=0}r=M.compileGenerated(L,1024,190.5/1024)}return r&&r.verdict==="PASS"&&inSafe(r)?r:null}catch(e){return null}};let A=FR.adj,br=FR.br,r=tr(A,br);
 if(!r){const Lt=FR.last.adj;for(const f of[.75,.5,.25]){const B={...A};for(const k of["t","s","z","ox","oy","r"])B[k]=(Lt[k]||0)+((A[k]||0)-(Lt[k]||0))*f;B.m=A.m!==Lt.m?Lt.m:A.m;r=tr(B,br);if(r){A=B;break}}}
 if(!r){A={...FR.last.adj};br=FR.last.br?FR.last.br.slice():null;r=tr(A,br)}
 if(my!==FR.aseq||!r)return;FR.adj=A;FR.br=br;adjSync();FR.base=r;FR.res=r;FR.last={adj:{...A},br:br?br.slice():null};showRes(r);gensSave();thUI();if(push!==false)hpush()}
let adjT=null;function adjSched(){clearTimeout(adjT);adjT=setTimeout(adjRun,220)}
function invRes(r){const m=new Uint8Array(r.mask.length);for(let i=0;i<m.length;i++)m[i]=r.mask[i]?0:1;return{...r,mask:m}}
function frameSched(){frameShow();clearTimeout(FR.t);FR.t=setTimeout(frameCompute,260)}
function openFrame(file){FR.dm=DM;$("#frame").classList.toggle("disc",DM);$("#fok").textContent=DM?"Use":"Add";const url=URL.createObjectURL(file),im=new Image();im.onload=()=>{URL.revokeObjectURL(url);Object.assign(FR,{img:im,file,z:1,ox:0,oy:0,res:null});$("#fz").value=100;$("#fzv").textContent="100%";$("#fd").value=70;$("#fb").value=70;FR.style="photo";FR.detail=.7;FR.balance=.7;document.querySelectorAll("#fstyle button").forEach(b=>b.classList.toggle("on",b.dataset.st==="photo"));[$("#fz"),$("#fd"),$("#fb")].forEach(el=>el.style.setProperty("--v",(el.value-el.min)/(el.max-el.min)*100+"%"));FR.invert=false;FR.cut=true;FR.mask=null;FR.mk="";FR.line=null;FR.lk="";$("#fcut").classList.add("on");$("#finv").classList.remove("on");$("#fok").classList.add("dis");$("#frame").classList.add("open");if(TOOL==="stencil")$("#frame").dataset.state="open";FR.left=null;FR.busy=false;FR.gen=null;FR.base=null;FR.gc=null;FR.gens=[];FR.ci=-1;$("#gth").style.display="none";FR.br=null;FR.brm=0;FR.aseq=FR.aseq||0;adjReset();document.querySelectorAll("#frame .sl:not(.gn),#fcut,#finv").forEach(e=>e.style.display=DM?"":"none");$("#fv").style.cursor=DM?"":"default";if(DM){frameSched()}else{frameShow();fmsg("");peek().then(()=>{if(FR.left===0){fmsg("None left today");dirUI()}else genStencil("")})}};im.src=url}
$("#pfile").addEventListener("change",e=>{const f=e.target.files&&e.target.files[0];e.target.value="";if(f)openFrame(f)});
const fvp=new Map();let pinch=null;
$("#fv").addEventListener("pointerdown",e=>{if(!FR.dm)return;$("#fv").setPointerCapture(e.pointerId);fvp.set(e.pointerId,{x:e.clientX,y:e.clientY});if(fvp.size===2){const[a,b]=[...fvp.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y),z:FR.z}}});
$("#fv").addEventListener("pointermove",e=>{const o=fvp.get(e.pointerId);if(!o)return;const k=FN/$("#fv").getBoundingClientRect().width;
 if(fvp.size===2&&pinch){fvp.set(e.pointerId,{x:e.clientX,y:e.clientY});const[a,b]=[...fvp.values()];FR.z=clamp(pinch.z*Math.hypot(a.x-b.x,a.y-b.y)/pinch.d,1,4);$("#fz").value=Math.round(FR.z*100);$("#fzv").textContent=Math.round(FR.z*100)+"%";$("#fz").style.setProperty("--v",(FR.z-1)/3*100+"%")}
 else{FR.ox+=(e.clientX-o.x)*k;FR.oy+=(e.clientY-o.y)*k;fvp.set(e.pointerId,{x:e.clientX,y:e.clientY})}frameSched()});
const fvEnd=e=>{fvp.delete(e.pointerId);pinch=null};$("#fv").addEventListener("pointerup",fvEnd);$("#fv").addEventListener("pointercancel",fvEnd);
$("#fz").addEventListener("input",e=>{FR.z=e.target.value/100;$("#fzv").textContent=e.target.value+"%";e.target.style.setProperty("--v",(e.target.value-100)/300*100+"%");frameSched()});
$("#fd").addEventListener("input",e=>{FR.detail=e.target.value/100;e.target.style.setProperty("--v",e.target.value+"%");frameSched()});
$("#fb").addEventListener("input",e=>{FR.balance=e.target.value/100;e.target.style.setProperty("--v",e.target.value+"%");frameSched()});
document.querySelectorAll("#fstyle button").forEach(b=>b.onclick=()=>{FR.style=b.dataset.st;document.querySelectorAll("#fstyle button").forEach(x=>x.classList.toggle("on",x===b));frameSched()});
$("#fcut").onclick=()=>{FR.cut=!FR.cut;$("#fcut").classList.toggle("on",FR.cut);frameSched()};
$("#finv").onclick=()=>{FR.invert=!FR.invert;$("#finv").classList.toggle("on",FR.invert);if(FR.base){FR.res=FR.invert?invRes(FR.base):FR.base;showRes(FR.res)}stSave()};
function adminHd(){try{const t=localStorage.getItem("du-admin-device-token-v1");return t?{"x-du-device-token":t}:{}}catch(e){return{}}}
async function peek(){try{const r=await fetch(GEN,{method:"POST",headers:{"x-vid":vid(),"x-peek":"1",apikey:SK,...adminHd()}});const j=await r.json();if(j&&j.admin){FR.tally=j.tally;FR.left=null;dirUI()}else if(j&&j.left!=null&&FR.left==null){FR.left=j.left;dirUI()}}catch(e){}}
[["#gd1","light"],["#gd2","bold"],["#gd3","tight"]].forEach(([q,d])=>{$(q).onclick=()=>{if(!FR.busy&&FR.gc&&FR.left!==0)genStencil(d)}});
const tz=()=>{if(FR.busy||!FR.gc)return;FR.br=null;adjSync();adjSched()};
$("#gt").oninput=()=>{FR.adj.t=+$("#gt").value;adjSync();adjSched()};$("#gz").oninput=()=>{FR.adj.z=+$("#gz").value/100;tz()};$("#gfit").onclick=()=>{if(FR.busy||!FR.gc)return;FR.adj.z=1;FR.adj.ox=0;FR.adj.oy=0;FR.adj.r=0;tz()};if($("#grt"))$("#grt").oninput=()=>{FR.adj.r=+$("#grt").value*Math.PI/180;tz()};
$("#gmi").onclick=()=>{if(FR.busy||!FR.gc)return;FR.adj.m=FR.adj.m?0:1;FR.br=null;adjSync();adjRun()};$("#gun").onclick=()=>hgo(-1);$("#grd").onclick=()=>hgo(1);
async function saveStencilImage(){const r=FR.res;if(!r||FR.busy)return;const W=700,H=752,c=document.createElement("canvas");c.width=W;c.height=H;const x=c.getContext("2d");drawDisc(x,W,r);const lg=await new Promise(ok=>{const m=new Image();m.onload=()=>ok(m);m.onerror=()=>ok(null);m.src="/brand/dyed-unattached-logo.png"});if(!lg)return;const tint=(col,w)=>{const h=Math.round(w*lg.height/lg.width),t=document.createElement("canvas");t.width=w;t.height=h;const q=t.getContext("2d");q.drawImage(lg,0,0,w,h);q.globalCompositeOperation="source-in";q.fillStyle=col;q.fillRect(0,0,w,h);return t};const wm=tint("#fff",230);x.save();x.beginPath();x.rect(0,0,W,W);x.clip();x.translate(W/2,W/2);x.rotate(-Math.PI/6);x.globalCompositeOperation="difference";x.globalAlpha=.5;for(let j=-6;j<=6;j++)for(let i=-3;i<=3;i++)x.drawImage(wm,i*300+(j%2?150:0)-wm.width/2,j*110-wm.height/2);x.restore();x.fillStyle="#f3eadf";x.fillRect(0,W,W,52);x.fillStyle="#b99a77";x.fillRect(0,W,W,1);const sl=tint("#5b3a24",190);x.drawImage(sl,(W-sl.width)/2,W+(52-sl.height)/2);c.toBlob(b=>{const u=URL.createObjectURL(b),a2=document.createElement("a");a2.href=u;a2.download="stencil-preview.png";document.body.appendChild(a2);a2.click();a2.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)},"image/png")}
$("#gsv").onclick=saveStencilImage;
{const er=$("#er"),ec=$("#erc"),ew=$("#erw"),ex=ec.getContext("2d");let eb=null,est=[],ez=2,rb=7,pt=new Map(),dr=false;
 const draw=()=>{const r=FR.base,id=ex.createImageData(r.w,r.h),ox=r.origin[0],oy=r.origin[1];for(let j=0;j<r.h;j++)for(let i=0;i<r.w;i++){const k=j*r.w+i,q=k*4,v=r.mask[k]||eb[(j+oy)*1024+i+ox]===2?255:0;id.data[q]=id.data[q+1]=id.data[q+2]=v;id.data[q+3]=255}ex.putImageData(id,0,0)};
 const size=()=>{const r=FR.base,b=Math.min(ew.clientWidth,ew.clientHeight)-4,m=Math.max(r.w,r.h);ec.style.width=Math.round(b*ez*r.w/m)+"px";ec.style.height=Math.round(b*ez*r.h/m)+"px"};
 const at=e=>{const q=ec.getBoundingClientRect();return{x:(e.clientX-q.left)/q.width*ec.width,y:(e.clientY-q.top)/q.height*ec.height}};
 const dot=p=>{ex.fillStyle="#fff";const r=FR.base,ox=r.origin[0],oy=r.origin[1];for(let j=Math.max(0,Math.floor(p.y-rb));j<Math.min(r.h,p.y+rb);j++)for(let i=Math.max(0,Math.floor(p.x-rb));i<Math.min(r.w,p.x+rb);i++)if((i-p.x)*(i-p.x)+(j-p.y)*(j-p.y)<=rb*rb&&!r.mask[j*r.w+i]){eb[(j+oy)*1024+i+ox]=2;ex.fillRect(i,j,1,1)}};
 const lbl=()=>{$("#ers").classList.toggle("on",rb===7);$("#erl").classList.toggle("on",rb===16);$("#eru").classList.toggle("dis",!est.length)};
 $("#ger").onclick=()=>{if(FR.busy||!FR.base)return;eb=FR.br?FR.br.slice():new Uint8Array(1024*1024);est=[];ez=1;$("#erz").value=100;ec.width=FR.base.w;ec.height=FR.base.h;draw();er.classList.add("open");size();lbl()};
 $("#erz").oninput=()=>{const w=ew,fx=(w.scrollLeft+w.clientWidth/2)/Math.max(1,w.scrollWidth),fy=(w.scrollTop+w.clientHeight/2)/Math.max(1,w.scrollHeight);ez=$("#erz").value/100;size();w.scrollLeft=fx*w.scrollWidth-w.clientWidth/2;w.scrollTop=fy*w.scrollHeight-w.clientHeight/2};$("#ers").onclick=()=>{rb=7;lbl()};$("#erl").onclick=()=>{rb=16;lbl()};
 $("#eru").onclick=()=>{if(!est.length)return;eb=est.pop();draw();lbl()};
 $("#erd").onclick=()=>{er.classList.remove("open");FR.br=eb;eb=null;adjRun()};
 ec.addEventListener("pointerdown",e=>{ec.setPointerCapture(e.pointerId);pt.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pt.size===1){dr=true;est.push(eb.slice());if(est.length>12)est.shift();lbl();dot(at(e))}else if(dr){dr=false;eb=est.pop();draw();lbl()}});
 ec.addEventListener("pointermove",e=>{const o=pt.get(e.pointerId);if(!o)return;const dx=e.clientX-o.x,dy=e.clientY-o.y;pt.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pt.size>=2){ew.scrollLeft-=dx/2;ew.scrollTop-=dy/2;return}if(dr)dot(at(e))});
 const up=e=>{pt.delete(e.pointerId);if(!pt.size)dr=false};ec.addEventListener("pointerup",up);ec.addEventListener("pointercancel",up);
 ew.addEventListener("wheel",e=>{if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();ez=Math.max(1,Math.min(5,ez*(e.deltaY<0?1.1:.9)));$("#erz").value=Math.round(ez*100);size()},{passive:false})}
$("#fx").onclick=()=>{$("#frame").classList.remove("open");clearTimeout(FR.t);FR.seq++};
function photoBlob(){return new Promise(res=>{const im=FR.img,k=Math.min(1,1600/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext("2d").drawImage(im,0,0,c.width,c.height);c.toBlob(res,"image/jpeg",.85)})}
$("#fok").onclick=async()=>{if(!FR.res)return;if(FR.dm){if(S.tgt==="rim"&&S.rim)S.rim.c=FR.res.hex;else S.base=FR.res.hex;S.trans="";S.tab="disc";$("#frame").classList.remove("open");commit();all();return}const res=FR.res,photo=await photoBlob();
 for(const l of S.layers.filter(x=>x.type==="stencil"))delete STN[l.id];S.layers=S.layers.filter(x=>x.type!=="stencil");
 const pool=poolOf("Inventory"),used=new Set(S.layers.flatMap(l=>l.dyes.map(d=>d.n))),pick=(pool.find(d=>!used.has(d.n))||pool[0]).n,id=uid();
 STN[id]={mask:res.mask,w:res.w,h:res.h,mm:res.mmPerPx,verdict:res.verdict,change:res.change,photo,style:res.style};
 S.layers.push({id,type:"stencil",name:"Stencil",vis:true,dyes:[{n:pick,s:1}],p:{x:0,y:0,s:res.w*res.mmPerPx/MM}});S.sel=id;$("#frame").classList.remove("open");commit();all();flash(1300)};
// layout
function layout(){const w=vw.clientWidth,h=vw.clientHeight,s=Math.max(120,Math.floor(Math.min(w,h)-8));sq.style.width=sq.style.height=s+"px";
 const nb=clamp(Math.round(s*Math.min(2,window.devicePixelRatio||1)),480,1400);if(nb!==B||cv.width!==nb){B=nb;cv.width=cv.height=ov.width=ov.height=B;paint(false);drawOv()}}
new ResizeObserver(layout).observe(vw);
window.addEventListener("keydown",e=>{const tg=e.target&&e.target.tagName;if(tg==="INPUT"||tg==="TEXTAREA")return;
 if(e.key==="Escape"){closePick();$("#match").classList.remove("open");selectLayer(S.layers[0].id);return}
 const L=selL(),mod=e.metaKey||e.ctrlKey;
 if(mod&&e.key.toLowerCase()==="z"){e.preventDefault();(e.shiftKey?$("#redo"):$("#undo")).click();return}
 if(!L||L.type==="full")return;
 if(e.key==="Delete"||e.key==="Backspace"){e.preventDefault();delete STN[L.id];S.layers=S.layers.filter(l=>l.id!==L.id);S.sel=S.layers[S.layers.length-1].id;commit();all();return}
 if(mod&&e.key.toLowerCase()==="d"&&L.type!=="stencil"){e.preventDefault();const b=document.querySelector("[data-act=dup]");if(b)b.click();return}
 const st=e.shiftKey?.05:.01,m={ArrowLeft:[-st,0],ArrowRight:[st,0],ArrowUp:[0,-st],ArrowDown:[0,st]}[e.key];
 if(m){e.preventDefault();if(L.type==="stripe"){const n=axes(L).n,d=clamp(L.p.x*n[0]+L.p.y*n[1]+m[0]*n[0]+m[1]*n[1],-.98,.98);L.p.x=n[0]*d;L.p.y=n[1]*d}else{L.p.x=clamp(L.p.x+m[0],-1.15,1.15);L.p.y=clamp(L.p.y+m[1],-1.15,1.15)}paint(true);drawOv();clearTimeout(window.__nt);window.__nt=setTimeout(()=>{commit();paint(false)},300)}});
dropGhost();flushQ();layout();H=[snap()];hi=0;all();if(TOOL==="stencil"){stInit();stRestore()}else{let pu=false;try{pu=localStorage.getItem("dds11push")==="1";localStorage.removeItem("dds11push")}catch(e){}if(pu||PENDST)stToDye(pu?null:PENDST)}
if(TOOL==="dye"){const away=()=>{if(S.sel!==S.layers[0].id)selectLayer(S.layers[0].id)};document.querySelector(".stage").addEventListener("pointerdown",e=>{if(!e.target.closest("#ov"))away()});body.addEventListener("pointerdown",e=>{const t=e.target;if(t.closest(".dsc")||!t.closest(".lc,[data-act],input,.sheet"))away()})}
function stAdd(res,photo,pend){for(const l of S.layers.filter(x=>x.type==="stencil"))delete STN[l.id];S.layers=S.layers.filter(x=>x.type!=="stencil");const id=uid();STN[id]={mask:res.mask,w:res.w,h:res.h,mm:res.mmPerPx,verdict:res.verdict,change:res.change,photo,style:res.style};const L={id,type:"stencil",name:"Stencil",vis:true,dyes:[{n:poolOf("Inventory")[0].n,s:1}],p:{x:0,y:0,s:res.w*res.mmPerPx/MM}};if(pend){if(pend.dyes&&pend.dyes.length)L.dyes=pend.dyes;if(pend.p)L.p=pend.p;L.vis=pend.vis!==false}S.layers.push(L);S.sel=id}
async function stCommit(){const res=FR.res,photo=await photoBlob();stAdd(res,photo)}
var gpT=null,gpS=0;
function gprog(on){const R=$("#frame");if(!R||TOOL!=="stencil")return;let g=$("#gprog");if(!g){g=document.createElement("div");g.id="gprog";g.className="gprog";g.innerHTML='<div class="gp-bar"><i></i></div><div class="gp-t"></div>';R.appendChild(g)}clearInterval(gpT);if(!on){g.style.display="none";return}g.style.display="flex";gpS=Date.now();const bar=g.querySelector("i"),t=g.querySelector(".gp-t"),tick=()=>{const e=(Date.now()-gpS)/1000,m=Math.floor(e/60),sc=("0"+Math.floor(e%60)).slice(-2);t.textContent="Generating "+m+":"+sc;bar.style.width=(92*(1-Math.exp(-e/22))).toFixed(1)+"%"};tick();gpT=setInterval(tick,500)}
var svT=null;
function stSave(now){if(TOOL!=="stencil")return;clearTimeout(svT);const go=()=>{try{if(!FR.img||!FR.gens||!FR.gens.length)return;gensSave();if(!FR.pu){const k=Math.min(1,900/Math.max(FR.img.width,FR.img.height)),c=document.createElement("canvas");c.width=Math.round(FR.img.width*k);c.height=Math.round(FR.img.height*k);c.getContext("2d").drawImage(FR.img,0,0,c.width,c.height);FR.pu=c.toDataURL("image/jpeg",.8)}localStorage.setItem("dds11s",JSON.stringify({photo:FR.pu,ci:FR.ci,invert:!!FR.invert,gens:FR.gens.map(g=>{if(!g.pu)g.pu=g.gc.toDataURL("image/png");return{png:g.pu,adj:g.adj,th:g.th}})}))}catch(e){}};if(now)go();else svT=setTimeout(go,400)}
function ldImg(u){return new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=u})}
function lsGet(k){try{return JSON.parse(localStorage.getItem(k)||"null")}catch(e){return null}}
async function stRestore(){if(TOOL!=="stencil")return;const s=lsGet("dds11s");if(!s||!s.gens||!s.gens.length||!s.photo)return;const im=await ldImg(s.photo);if(!im)return;const gens=[];for(const g of s.gens){const i=await ldImg(g.png);if(!i)continue;const c=document.createElement("canvas");c.width=c.height=1024;c.getContext("2d").drawImage(i,0,0);gens.push({gc:c,adj:{...DEFA(),...g.adj},br:null,base:null,th:g.th,pu:g.png})}if(!gens.length||FR.img)return;DM=false;FR.dm=false;FR.img=im;FR.pu=s.photo;FR.gens=gens;FR.ci=Math.min(s.ci||0,gens.length-1);const g=gens[FR.ci];FR.gc=g.gc;FR.adj={...g.adj};FR.br=null;FR.last={adj:{...FR.adj},br:null};FR.invert=!!s.invert;FR.aseq=FR.aseq||0;FR.busy=false;FR.left=null;$("#finv").classList.toggle("on",FR.invert);$("#frame").classList.add("open");$("#frame").dataset.state="open";hreset();adjSync();await adjRun(false);if(FR.invert&&FR.base){FR.res=invRes(FR.base);showRes(FR.res)}thUI();$("#fok").classList.remove("dis");dirUI();peek().then(dirUI)}
async function stRebuild(){const s=lsGet("dds11s");if(!s||!s.gens||!s.gens.length||!s.photo)return null;const g=s.gens[Math.min(s.ci||0,s.gens.length-1)],i=await ldImg(g.png);if(!i)return null;const c=document.createElement("canvas");c.width=c.height=1024;c.getContext("2d").drawImage(i,0,0);const M=await stencilMod(),A={...DEFA(),...g.adj},L=adjLumFor(c,A,null);dropSmallWhite(L,200);let r=M.compileGenerated(L,1024,190.5/1024);if(!r)return null;if(s.invert)r=invRes(r);let photo=null;try{photo=await(await fetch(s.photo)).blob()}catch(e){}return{res:r,photo}}
async function stToDye(pend){const r=await stRebuild();if(!r)return;stAdd(r.res,r.photo,pend);commit();all()}
(function(){const cv=$("#fp");if(!cv||TOOL!=="stencil")return;const P=new Map();let g0=null;const ok=()=>!FR.busy&&FR.gc&&!FR.dm&&!($("#er")&&$("#er").offsetParent!==null);const lpc=()=>1024*213/(190.5*cv.getBoundingClientRect().width);cv.style.touchAction="none";
 const info=()=>{const[a,b]=[...P.values()];return{d:Math.hypot(a.x-b.x,a.y-b.y)||1,an:Math.atan2(b.y-a.y,b.x-a.x)}};
 cv.addEventListener("pointerdown",e=>{if(!ok())return;cv.setPointerCapture(e.pointerId);P.set(e.pointerId,{x:e.clientX,y:e.clientY});if(P.size===2){const i=info();g0={d:i.d,an:i.an,z:FR.adj.z,r:FR.adj.r||0}}});
 cv.addEventListener("pointermove",e=>{const o=P.get(e.pointerId);if(!o||!ok())return;if(P.size===2&&g0){P.set(e.pointerId,{x:e.clientX,y:e.clientY});const i=info();FR.adj.z=clamp(g0.z*i.d/g0.d,.4,1);FR.adj.r=g0.r+(i.an-g0.an)*(FR.adj.m?-1:1)}else{const k=lpc();FR.adj.ox=(FR.adj.ox||0)+(e.clientX-o.x)*k;FR.adj.oy=(FR.adj.oy||0)+(e.clientY-o.y)*k;P.set(e.pointerId,{x:e.clientX,y:e.clientY})}FR.br=null;adjSync();adjSched()});
 const up=e=>{P.delete(e.pointerId);g0=null};cv.addEventListener("pointerup",up);cv.addEventListener("pointercancel",up);
 cv.addEventListener("wheel",e=>{if(!ok())return;e.preventDefault();if(e.shiftKey||e.altKey)FR.adj.r=(FR.adj.r||0)+e.deltaY*.002;else FR.adj.z=clamp(FR.adj.z*Math.exp(-e.deltaY*.001),.4,1);FR.br=null;adjSync();adjSched()},{passive:false})})();
$("#stdye")&&($("#stdye").onclick=()=>{if(!FR.res||FR.busy)return;stSave(true);try{localStorage.setItem("dds11push","1")}catch(e){}location.href="/dyed-and-unattached/dye-studio"});

function stInit(){const R=$("#frame");const pick=()=>{if(FR.busy)return;DM=false;$("#pfile").click()};$("#stpick").onclick=pick;$("#stnew").onclick=pick;
 if(isAdmin()){const sv=$("#stsvg");if(sv){sv.hidden=false;sv.onclick=async()=>{if(!FR.res||FR.busy)return;await stCommit();const L=S.layers.find(l=>l.type==="stencil"),m=STN[L.id],M=await stencilMod(),svg=M.maskToCutSvg(m.mask,m.w,m.h,L.p.s*MM/m.w),u=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml"})),a2=document.createElement("a");a2.href=u;a2.download="stencil_CRICUT.svg";document.body.appendChild(a2);a2.click();a2.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)}}}
 $("#stsave").onclick=async()=>{const b=$("#stsave");if(!FR.res||FR.busy)return;flip(b,"…");try{await stCommit();logRecipe("save");await saveStencilImage();flip(b,"Saved")}catch(e){flip(b,"Save")}};
 peek().then(()=>stUI())}
})();
