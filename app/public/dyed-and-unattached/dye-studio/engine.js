/*SPECTRAL-BEGIN*/
// Spectral dye engine: sRGB targets are lifted to smooth reflectance spectra,
// dye absorbance adds per wavelength (Beer-Lambert), and the result is
// integrated back to sRGB under D65. Mixing complementary dyes therefore
// darkens and greys instead of averaging channel values.
const SP=(()=>{
 const lam=Array.from({length:31},(_,i)=>400+10*i);
 const g=(l,mu,s1,s2)=>{const t=(l-mu)/(l<mu?s1:s2);return Math.exp(-.5*t*t)};
 const cmf=lam.map(l=>[
  1.056*g(l,599.8,37.9,31.0)+.362*g(l,442.0,16.0,26.7)-.065*g(l,501.1,20.4,26.2),
  .821*g(l,568.8,46.9,40.5)+.286*g(l,530.9,16.3,31.1),
  1.217*g(l,437.0,11.8,36.0)+.681*g(l,459.0,26.0,13.8)]);
 const d65=[82.75,91.49,93.43,86.68,104.86,117.01,117.81,114.86,115.92,108.81,109.35,107.80,104.79,107.69,104.41,104.05,100.00,96.33,95.79,88.69,90.01,89.60,87.70,83.29,83.70,80.03,80.21,82.28,78.28,69.72,71.61];
 let kn=0;for(let i=0;i<31;i++)kn+=cmf[i][1]*d65[i];
 const M=[[3.2406,-1.5372,-.4986],[-.9689,1.8758,.0415],[.0557,-.2040,1.0570]];
 const rawRgb=s=>{let X=0,Y=0,Z=0;for(let i=0;i<31;i++){const w=s[i]*d65[i];X+=w*cmf[i][0];Y+=w*cmf[i][1];Z+=w*cmf[i][2]}X/=kn;Y/=kn;Z/=kn;return M.map(r=>r[0]*X+r[1]*Y+r[2]*Z)};
 const wp=rawRgb(new Array(31).fill(1));
 const toLin=s=>{const r=rawRgb(s);return[r[0]/wp[0],r[1]/wp[1],r[2]/wp[2]]};
 const sig=x=>.5+x/(2*Math.sqrt(1+x*x));
 const specFromC=c=>lam.map(l=>{const u=(l-400)/300;return sig(c[0]*u*u+c[1]*u+c[2])});
 const solve3=(A,b)=>{const d=A[0][0]*(A[1][1]*A[2][2]-A[1][2]*A[2][1])-A[0][1]*(A[1][0]*A[2][2]-A[1][2]*A[2][0])+A[0][2]*(A[1][0]*A[2][1]-A[1][1]*A[2][0]);if(Math.abs(d)<1e-18)return null;
  const rep=(k)=>A.map((r,i)=>r.map((v,j)=>j===k?b[i]:v));
  const det=m=>m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
  return[det(rep(0))/d,det(rep(1))/d,det(rep(2))/d]};
 const cache=new Map();
 function fit(t){
  const target=t.map(v=>Math.min(.995,Math.max(.0015,v)));
  const gray=(target[0]+target[1]+target[2])/3;
  let c=[0,0,Math.log(gray/(1-gray))*0+ (gray-.5)*4];
  const ev=(c)=>toLin(specFromC(c));
  for(let step=1;step<=10;step++){
   const a=step/10,tg=[0,1,2].map(i=>gray+(target[i]-gray)*a);
   for(let it=0;it<30;it++){
    const f=ev(c),r=[f[0]-tg[0],f[1]-tg[1],f[2]-tg[2]],err=Math.hypot(...r);
    if(err<1e-5)break;
    const J=[[0,0,0],[0,0,0],[0,0,0]];
    for(let j=0;j<3;j++){const cc=c.slice();cc[j]+=1e-4;const f2=ev(cc);for(let i=0;i<3;i++)J[i][j]=(f2[i]-f[i])/1e-4}
    const dx=solve3(J,r.map(v=>-v));if(!dx)break;
    let sc=1,ok=false;
    for(let h=0;h<8;h++){const cn=[c[0]+dx[0]*sc,c[1]+dx[1]*sc,c[2]+dx[2]*sc];const fn=ev(cn);if(Math.hypot(fn[0]-tg[0],fn[1]-tg[1],fn[2]-tg[2])<err){c=cn;ok=true;break}sc*=.5}
    if(!ok)break;
   }
  }
  return specFromC(c)
 }
 const s2l=v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)};
 const l2s=v=>{v=Math.min(1,Math.max(0,v));return 255*(v<=.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-.055)};
 const hexLin=h=>[1,3,5].map(i=>s2l(parseInt(h.slice(i,i+2),16)));
 function spec(hex){hex=hex.toUpperCase();let s=cache.get(hex);if(!s){s=fit(hexLin(hex));cache.set(hex,s)}return s}
 const linHex=l=>"#"+l.map(v=>Math.round(l2s(v)).toString(16).padStart(2,"0")).join("").toUpperCase();
 const specHex=s=>linHex(toLin(s));
 // Absorbance spectrum a dye produces on a reference white substrate: R=Rw*exp(-2A).
 function dyeAbsorbance(targetHex,whiteHex){
  const t=spec(targetHex),w=spec(whiteHex);
  return t.map((v,i)=>Math.max(0,-.5*Math.log(Math.max(.004,Math.min(1.5,v/w[i])))))
 }
 const apply=(s,A,k)=>s.map((v,i)=>v*Math.exp(-2*A[i]*k));
 return{lam,spec,specHex,toLin,linHex,dyeAbsorbance,apply,hexLin,d65w:d65}
})();

SP.REF_WHITE="#F4F2E8";
// items: [{surface,filter,k}] where surface/filter are hex colors of the dye film and k the effective strength.
SP.absorb=(items,which,ref)=>{const A=new Array(31).fill(0);let cap=1;items.forEach((it,idx)=>{const a=SP.dyeAbsorbance(it[which]||it.surface,ref||SP.REF_WHITE);for(let i=0;i<31;i++)A[i]+=a[i]*it.k*cap;cap*=idx===0?.94:.90});return A};
SP.predictOpaque=(baseHex,items,o={})=>{const A=SP.absorb(items,"surface");return SP.specHex(SP.apply(SP.spec(baseHex),A,o.kS??1))};
SP.predictTranslucent=(baseHex,transHex,items,o={})=>{
 const As=SP.absorb(items,"surface"),At=SP.absorb(items,"filter");
 const R=SP.apply(SP.spec(baseHex),As,o.kS??1),T=SP.apply(SP.spec(transHex),At,(o.kT??1)*(o.path??1)).map(v=>Math.min(1,v*(o.gT??1)));
 const w=o.wT??.5;return SP.specHex(R.map((v,i)=>v*(1-w)+T[i]*w))};
/*SPECTRAL-END*/

/*ENGINE-BEGIN*/
// Disc dye engine v10. Requires SP (spectral color core).
// Physics: Gaussian-band dye absorbance, competitive uptake (Langmuir), Kubelka-Munk
// finite dyed layer over an opaque base, translucent reflection+transmission,
// fluorescent emission (daylight, UV365, glow), Monte Carlo uncertainty, inverse recipe search.
const DE=(()=>{
 const lam=SP.lam,N=lam.length;
 const gau=(l,mu,s)=>{const t=(l-mu)/s;return Math.exp(-.5*t*t)};
 const CAT={};            // name -> {b:[[mu,sig,a]...],phi,em:[mu,sig],aff,sd}
 const PRM={tq:3,             // process parameters per optical family, fitted by scripts/fit_engine.mjs
  star:{Sx:1.6,cmax:1.0,rim:.08,tr:0},
  champion:{bt:.38,bf:.08,Sx:.35,cmax:1.0,rim:.12,tr:1,kS:.55,kT:1.5,pw:.75,gT:1.38,w:{outdoor:{plate:1,shoulder:.75,rim:.5},surface:{plate:.09,shoulder:.04,rim:.04},backlit:{plate:1,shoulder:.95,rim:.8}}}
 };
 // Plastic table. fam = optical family; rating = r/discdyeing wiki dye-uptake scale 1-5 (null = unrated, assumed like family);
 // up = dye strength multiplier derived from the rating. Sources: research/dataset/observations.json (wiki ratings).
 const UPR=[0,.15,.35,.6,.8,1];
 const PLASTICS={star:{fam:"star",rating:5},gstar:{fam:"star",rating:5},echostar:{fam:"star",rating:4},pro:{fam:"star",rating:4},dx:{fam:"star",rating:2},prime:{fam:"star",rating:2},
  champion:{fam:"champion",rating:4},fuzion:{fam:"champion",rating:4},glow:{fam:"champion",rating:null,est:1}};
 const REFR={star:5,champion:4}; // the fitted star and champion process parameters already embody these ratings, so up is relative to the family reference
 const plasticOf=id=>{const p=PLASTICS[id]||PLASTICS.star;return{...p,up:p.rating?Math.min(1.25,UPR[p.rating]/UPR[REFR[p.fam]]):1}};
 const famOf=o=>/champion/.test(o||"")?"champion":"star";
 const absorb=(d,k)=>{const A=new Array(N).fill(0);if(!d)return A;for(const [mu,sg,a] of d.b)for(let i=0;i<N;i++)A[i]+=a*gau(lam[i],mu,sg);for(let i=0;i<N;i++)A[i]*=k;return A};
 // Effective per-dye concentration (relative to full single-dye film). Langmuir competition.
 // Uptake. Dyes in ONE bath (a blend) compete for the same sites (Langmuir, affinity-weighted). Separate baths
 // (layers, item.b) do not displace each other, so their dye loads add and absorbances add in the film (order is
 // irrelevant); a soft total cap (TOTCAP) stands in for the plastic running out of sites altogether.
 const TOTCAP=3.2,LAM=.4,VEIL=.008;
 function conc(items){
  const out=new Array(items.length).fill(0),bs=[...new Set(items.map(it=>it.b||0))],bt=[];
  for(const b of bs){
   const idx=items.map((it,i)=>i).filter(i=>(items[i].b||0)===b),K=idx.map(i=>(CAT[items[i].name]?.aff)??1);
   let t=0;idx.forEach((i,j)=>{t+=K[j]*items[i].s});let g=0;
   idx.forEach((i,j)=>{const it=items[i],solo=it.s*(1+K[j])/(1+K[j]*it.s);out[i]=t>0?solo*(1+K[j]*it.s)/(1+t):0;g+=out[i]});bt.push(g);
  }
  // separate baths partly compete for the same sites (symmetric, so order never matters)
  const all=bt.reduce((a,v)=>a+v,0);
  bs.forEach((b,bi)=>{const f=1/(1+LAM*(all-bt[bi]));items.forEach((it,i)=>{if((it.b||0)===b)out[i]*=f})});
  const tot=out.reduce((a,v)=>a+v,0),f=tot>0?1/Math.pow(1+Math.pow(tot/TOTCAP,4),.25):1;
  return out.map(v=>v*f);
 }
 const merge=items=>{const m=new Map();for(const it of items){const k=it.name+"|"+(it.b||0);const e=m.get(k);if(e)e.s+=it.s;else m.set(k,{name:it.name,s:it.s,b:it.b||0})}return[...m.values()]};
 const tauOf=(items,mult)=>{const c=conc(items),T=new Array(N).fill(0);items.forEach((it,i)=>{const A=absorb(CAT[it.name],c[i]*(mult||1));for(let j=0;j<N;j++)T[j]+=A[j]});return T};
 // Kubelka-Munk finite layer (scatter optical thickness Sx) on backing Rg; tau = dye optical depth across layer
 function kmLayer(Rb,tau,Sx){
  return Rb.map((rb,i)=>{
   const kb=(1-rb)*(1-rb)/(2*Math.max(rb,1e-3));      // K/S of the bulk
   const ks=kb+tau[i]/Sx,a=1+ks,b=Math.sqrt(Math.max(a*a-1,1e-12)),bsx=b*Sx;
   const c=1/Math.tanh(bsx);
   return (1-rb*(a-b*c))/(a-rb+b*c);
  });
 }
 // fluorescence: absorbed photon energy re-emitted in the dye emission band (radiance factor addition)
 function fluor(items,tauTotal,opt){
  const em=new Array(N).fill(0),c=conc(items);
  items.forEach((it,i)=>{
   const d=CAT[it.name];if(!d||!d.phi)return;
   const A=absorb(d,c[i]),qf=1/(1+Math.pow(Math.min(6,Math.max(...A))*(opt&&opt.cscale||1)/PRM.tq,2)),share=tauTotal.map((t,j)=>t>1e-9?A[j]/t:0);
   let abs=0;for(let j=0;j<N;j++)abs+=(1-Math.exp(-2*tauTotal[j]))*share[j]*SP.d65w[j];
   const norm=d.em?(()=>{let s=0;for(let j=0;j<N;j++)s+=gau(lam[j],d.em[0],d.em[1]);return s})():1;
   for(let j=0;j<N;j++)em[j]+=qf*d.phi*abs*gau(lam[j],d.em[0],d.em[1])/norm/SP.d65w[j]*Math.exp(-.7*tauTotal[j]);
  });
  return em;
 }
 // Saunderson correction for the polymer/air interface (n~1.5: internal diffuse reflectance k2~.6, specular excluded).
 // Base spectra are measured appearance, so they are mapped to internal reflectance first and back after the film model.
 const K2=.6,K1=.04;
 const toInt=R=>R.map(r=>r/((1-K1)*(1-K2)+K2*r));
 const toExt=R=>R.map(r=>(1-K1)*(1-K2)*r/(1-K2*r));
 const baseSpec=h=>SP.spec(h);
 const PHI=.55; // later baths stay in the top fraction of the film; the first bath penetrates fully
 function filmStack(Rb,items,P,mult){
  const bs=[...new Set(items.map(it=>it.b||0))].sort((x,y)=>x-y);
  return kmLayer(Rb,tauOf(items,mult),P.Sx);
  const c=conc(items),tl=new Array(N).fill(0),tu=new Array(N).fill(0);
  items.forEach((it,i)=>{const A=absorb(CAT[it.name],c[i]*(mult||1));for(let j=0;j<N;j++){if((it.b||0)===bs[0]){tl[j]+=A[j]*(1-PHI);tu[j]+=A[j]*PHI}else tu[j]+=A[j]}});
  const Rl=kmLayer(Rb,tl,P.Sx*(1-PHI));return kmLayer(Rl,tu,P.Sx*PHI);
 }
 function opaque(baseHex,items,fam,opt){
  const P=PRM[fam]||PRM.star,tau=tauOf(items,opt?.mult);
  let R=toExt(filmStack(toInt(baseSpec(baseHex)),items,P,opt?.mult));
  if(!opt?.noFluor){const f=fluor(items,tau,opt);R=R.map((v,i)=>v+f[i])}
  return R;
 }
 function translucent(baseHex,transHex,items,fam,scene,zone,path,opt){
  const P=PRM.champion,tau=tauOf(items,opt?.mult);
  const Rs=toExt(kmLayer(toInt(baseSpec(baseHex)),tau.map(v=>v*P.kS),P.Sx));
  const T0=transHex?baseSpec(transHex):baseSpec(baseHex).map(v=>Math.pow(Math.max(0,v-P.bf)/(1-P.bf),P.bt)),T=T0.map((v,i)=>Math.min(1.4,v*Math.exp(-2*tau[i]*P.kT*Math.pow(path,P.pw))*P.gT));
  const w=(P.w[scene]||P.w.outdoor)[zone];
  let R=Rs.map((v,i)=>v*(1-w)+T[i]*w);
  if(!opt?.noFluor){const f=fluor(items,tau.map(v=>v*P.kS),{cscale:P.kS*P.kT*Math.pow(path,P.pw)});R=R.map((v,i)=>v+f[i]*(scene==="backlit"?.3:1))}
  return R;
 }
 // ---------- color metrics ----------
 const toXYZ=l=>[.4124*l[0]+.3576*l[1]+.1805*l[2],.2126*l[0]+.7152*l[1]+.0722*l[2],.0193*l[0]+.1192*l[1]+.9505*l[2]];
 const labOf=l=>{const [X,Y,Z]=toXYZ(l.map(v=>Math.max(0,v)));const f=t=>t>216/24389?Math.cbrt(t):(24389/27*t+16)/116;const fx=f(X/.95047),fy=f(Y),fz=f(Z/1.08883);return[116*fy-16,500*(fx-fy),200*(fy-fz)]};
 const de2000=(p,q)=>{
  const[L1,a1,b1]=p,[L2,a2,b2]=q,rad=Math.PI/180;
  const C1=Math.hypot(a1,b1),C2=Math.hypot(a2,b2),Cb=(C1+C2)/2,G=.5*(1-Math.sqrt(Cb**7/(Cb**7+25**7)));
  const a1p=a1*(1+G),a2p=a2*(1+G),C1p=Math.hypot(a1p,b1),C2p=Math.hypot(a2p,b2);
  const h=(b,a)=>{const x=Math.atan2(b,a)/rad;return x<0?x+360:x};
  const h1=C1p?h(b1,a1p):0,h2=C2p?h(b2,a2p):0;
  const dL=L2-L1,dC=C2p-C1p;let dh=h2-h1;if(C1p*C2p===0)dh=0;else if(dh>180)dh-=360;else if(dh<-180)dh+=360;
  const dH=2*Math.sqrt(C1p*C2p)*Math.sin(dh*rad/2),Lb=(L1+L2)/2,Cbp=(C1p+C2p)/2;
  let hb=h1+h2;if(C1p*C2p===0)hb=h1+h2;else if(Math.abs(h1-h2)>180)hb=(h1+h2+(h1+h2<360?360:-360))/2;else hb/=2;
  const T=1-.17*Math.cos((hb-30)*rad)+.24*Math.cos(2*hb*rad)+.32*Math.cos((3*hb+6)*rad)-.2*Math.cos((4*hb-63)*rad);
  const dth=30*Math.exp(-(((hb-275)/25)**2)),Rc=2*Math.sqrt(Cbp**7/(Cbp**7+25**7));
  const SL=1+.015*(Lb-50)**2/Math.sqrt(20+(Lb-50)**2),SC=1+.045*Cbp,SH=1+.015*Cbp*T,RT=-Math.sin(2*dth*rad)*Rc;
  return Math.sqrt((dL/SL)**2+(dC/SC)**2+(dH/SH)**2+RT*(dC/SC)*(dH/SH));
 };
 const labOfSpec=s=>labOf(SP.toLin(s));
 const hexLab=h=>labOf(SP.hexLin(h));
 const dEhex=(a,b)=>de2000(hexLab(a),hexLab(b));
 // gamut: spectrum -> linear RGB (may leave [0,1]); report clipping and chroma-preserving soft clip
 function present(s,veil=0){
  const l=SP.toLin(s).map(v=>v+veil),over=Math.max(0,...l)-1,under=Math.min(0,...l);
  let m=Math.max(1,...l);const lin=l.map(v=>Math.max(0,v)/ (m>1?1:1));
  const hex=SP.linHex(l.map(v=>Math.min(1,Math.max(0,v))));
  return{hex,lin:l,gamutExcess:Math.max(over,-under)};
 }
 // ---------- seeded Monte Carlo ----------
 const rng=seed=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
 const gaussRand=r=>{const u=Math.max(1e-9,r()),v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};
 // spec: {baseHex,transHex,family,scene,zone,path,items:[{name,s}]}
 function render(spec,opt){
  const pl=spec.plastic?plasticOf(spec.plastic):null;
  spec={...spec,items:merge(spec.items).map(it=>pl?{...it,s:it.s*pl.up}:it)};
  const fam=famOf(pl?pl.fam:spec.family);
  const R=fam==="champion"?translucent(spec.baseHex,spec.transHex,spec.items,fam,spec.scene||"outdoor",spec.zone||"plate",spec.path??.5,opt)
                           :opaque(spec.baseHex,spec.items,fam,opt);
  return R;
 }
 function predict(spec,opt={}){
  if(spec.plastic&&!spec.family)spec={...spec,family:plasticOf(spec.plastic).fam};
  const R=render(spec,opt);let out=present(R,famOf(spec.family)==='champion'?VEIL:0);
  const P=PRM[famOf(spec.family)];
  if(spec.zone==="rim"||spec.rim){const k=P.rim*(spec.items.length?1:0);if(k){out={...out,hex:SP.linHex(SP.toLin(R).map(v=>Math.min(1,Math.max(0,v*(1-k)))))}}}
  if(opt.mc){
   const r=rng(opt.seed||7),n=opt.mc,labs=[];
   for(let m=0;m<n;m++){
    const items=spec.items.map(it=>({name:it.name,b:it.b,s:Math.max(0,it.s*Math.exp(gaussRand(r)*((CAT[it.name]?.sd)??.15)))}));
    const Pm=PRM[famOf(spec.family)],sx=Pm.Sx;Pm.Sx=sx*Math.exp(gaussRand(r)*.15);
    const Rm=render({...spec,items},opt);Pm.Sx=sx;labs.push(labOf(SP.toLin(Rm).map(v=>Math.min(1,Math.max(0,v)))));
   }
   const c=labOf(out.lin.map(v=>Math.min(1,Math.max(0,v)))),d=labs.map(l=>de2000(c,l)).sort((a,b)=>a-b);
   out.spread=d[Math.floor(.9*(d.length-1))];out.lo=labs.reduce((a,l)=>l[0]<a[0]?l:a);out.hi=labs.reduce((a,l)=>l[0]>a[0]?l:a);
  }
  // evidence flags: situations the public dataset covers poorly (used by the UI to lower the confidence label)
  {const ev=[],its=spec.items,bths=new Set(its.map(i=>i.b||0)).size,pl=spec.plastic?plasticOf(spec.plastic):null;
   if(famOf(spec.family)==='champion'&&its.length>1)ev.push('translucent multi-dye');
   if(bths>1)ev.push('overlap');
   if(its.some(i=>(CAT[i.name]?.sd??.18)>.15))ev.push('estimated dye');
   if(pl&&(pl.rating===null||pl.est))ev.push('unrated plastic');
   if(out.gamutExcess>.05)ev.push('out of gamut');
   out.evidence=ev}
  out.lab=labOf(out.lin.map(v=>Math.min(1,Math.max(0,v))));
  return out;
 }
 // ---------- UV365 / charged glow ----------
 // emission color of fluorescent dyes under 365 nm, with inner-filter quenching by every other dye
 function uv365(spec){
  const items=merge(spec.items),tau=tauOf(items,1),c=conc(items),rgb=[0,0,0];
  items.forEach((it,i)=>{const d=CAT[it.name];if(!d||!d.phi)return;
   const sh=1-Math.exp(-2*c[i]*(d.uvAbs??1)),em=new Array(N).fill(0);
   for(let j=0;j<N;j++)em[j]=gau(lam[j],d.em[0],d.em[1]);
   // emission re-absorbed by dyes present
   for(let j=0;j<N;j++)em[j]*=Math.exp(-tau[j]*.55);
   const l=SP.toLin(em.map(v=>v*(d.uvphi??d.phi)*sh*2.4));for(let k=0;k<3;k++)rgb[k]+=l[k];});
  return SP.linHex(rgb.map(v=>1-Math.exp(-v*1.6)));
 }
 // charged glow: afterglow emission (SrAl2O4-like, 520 nm) filtered by dye absorbance on the way out
 function glow(spec){
  spec={...spec,items:merge(spec.items)};
  const tau=tauOf(spec.items,1),E=lam.map(l=>gau(l,520,34)),Y=l=>.2126*l[0]+.7152*l[1]+.0722*l[2];
  const l0=SP.toLin(E),y0=Y(l0),l1=SP.toLin(E.map((v,i)=>v*Math.exp(-tau[i]*(spec.kg??.85))));
  const rel=y0>0?Y(l1)/y0:0,k=.8/Math.max(y0,1e-6);
  return{hex:SP.linHex(l1.map(v=>Math.min(1,Math.max(0,v*k)))),rel};
 }
 // ---------- recipe search ----------
 function recipe(target,base,family,pool,opt={}){
  const tl=hexLab(target),r=rng(opt.seed||11),maxN=opt.maxDyes||3,out=[];
  const score=items=>{const p=predict({baseHex:base,transHex:opt.transHex,family,scene:"outdoor",zone:"plate",path:.45,items});return[de2000(tl,labOf(p.lin.map(v=>Math.min(1,Math.max(0,v))))),p]};
  if(pool.length>14){
   const solo=pool.map(n=>{let b=1e9;for(const v of[.25,.5,.8,1.1]){const[e]=score([{name:n,s:v}]);if(e<b)b=e}return[n,b]}).sort((a,b)=>a[1]-b[1]);
   const top=solo.slice(0,3).map(x=>x[0]);
   const pr=pool.map(n=>{let b=1e9;for(const t of top){if(t===n)continue;for(const v of[.3,.7]){const[e]=score([{name:t,s:.7},{name:n,s:v}]);if(e<b)b=e}}return[n,Math.min(b,solo.find(x=>x[0]===n)[1])]}).sort((a,b)=>a[1]-b[1]);
   pool=pr.slice(0,12).map(x=>x[0]);
  }
  const seeds=[];
  for(let a=0;a<pool.length;a++){seeds.push([pool[a]]);for(let b=a+1;b<pool.length;b++){seeds.push([pool[a],pool[b]]);if(maxN>2&&pool.length<=14)for(let c=b+1;c<pool.length;c++)seeds.push([pool[a],pool[b],pool[c]])}}
  for(const names of seeds){
   let s=names.map(()=>.6),best=score(names.map((n,i)=>({name:n,s:s[i]})))[0],step=.4;
   for(let it=0;it<28;it++){let imp=false;
    for(let i=0;i<s.length;i++)for(const dlt of[step,-step]){const t=s.slice();t[i]=Math.min(1.3,Math.max(.03,t[i]+dlt));const e=score(names.map((n,j)=>({name:n,s:t[j]})))[0];if(e<best-1e-3){best=e;s=t;imp=true}}
    if(!imp)step/=2;if(step<.03)break}
   out.push({names,s,dE:best});
  }
  out.sort((a,b)=>a.dE-b.dE||a.names.length-b.names.length);
  return out.slice(0,opt.top||6).map(o=>{const items=o.names.map((n,i)=>({name:n,s:o.s[i]}));const p=predict({baseHex:base,transHex:opt.transHex,family,scene:"outdoor",zone:"plate",path:.45,items},{mc:24});return{items,dE:o.dE,hex:p.hex,spread:p.spread}});
 }
 return{CAT,PRM,PLASTICS,plasticOf,famOf,absorb,conc,tauOf,kmLayer,fluor,render,predict,uv365,glow,recipe,labOf,labOfSpec,de2000,hexLab,dEhex,present,rng,gaussRand,gau,lam};
})();
/*ENGINE-END*/

/*CATALOG-BEGIN*/
Object.assign(DE.CAT,{"Clear UV Blast":{"b":[],"phi":0.45,"em":[445,28],"aff":0.2,"sd":0.2,"uvAbs":1},"Blue UV Blast":{"b":[[602.176,35.182,5.981],[547.461,18.749,3.898]],"phi":0.055,"aff":1,"sd":0.18,"em":[470,24],"uvphi":0.504},"Flo Red UV Blast":{"b":[[485.925,38.759,15.962],[565.409,16,4.636]],"phi":0.26,"aff":1,"sd":0.08,"em":[612,28],"uvphi":0.395},"Green UV Blast":{"b":[[505,95,1],[441.653,34.079,1.913]],"phi":0.85,"aff":1,"sd":0.08,"em":[540,24],"uvphi":0.8},"Hot Pink UV Blast":{"b":[[513.732,29.989,6.375],[567,16,3.238]],"phi":0.414,"aff":1,"sd":0.18,"em":[602,28],"uvphi":0.528},"Flo Orange / Blaze Orange UV":{"b":[[459.015,28.941,11.834],[556.575,17.232,2.37]],"phi":0.08,"aff":1,"sd":0.08,"em":[595,26],"uvphi":0.579},"Purple UV Blast":{"b":[[540.723,29.895,3.994],[575.734,40.963,3.37]],"phi":0.044,"aff":1,"sd":0.18,"em":[440,26],"uvphi":0.232},"Chartreuse / Yellow":{"b":[[432.927,35.729,3.013],[517,95,0.666]],"phi":0.85,"aff":1,"sd":0.18,"em":[552,24],"uvphi":0.8},"Black":{"b":[[448.618,16,5.261],[390,218.733,40],[636.684,114.731,24.554]],"phi":0,"aff":1.6,"sd":0.18},"Pumpkin Brown":{"b":[[439.815,64.423,18.711],[677.783,34.835,1.733]],"phi":0,"aff":1,"sd":0.18},"Watermelon":{"b":[[527.964,30.484,4.451],[484.916,40.964,2.919]],"phi":0,"aff":1,"sd":0.18},"Rind Green":{"b":[[447.626,34.383,5.737],[625.032,39.596,3.782]],"phi":0,"aff":1,"sd":0.18},"Blue":{"b":[[669.259,95,19.088],[592.811,36.19,19.357]],"phi":0,"aff":1.6,"sd":0.08},"Crimson":{"b":[[483.815,53.666,10.546],[538.779,31.751,10.059]],"phi":0,"aff":1.6,"sd":0.08},"Onyx":{"b":[[390,16,40],[390,260,40],[633.654,260,40]],"phi":0,"aff":1.6,"sd":0.08},"Neon Lemon Zest":{"b":[[506.311,95,0.705],[443.682,31.425,2.939]],"phi":0.85,"aff":1,"sd":0.18,"em":[552,24],"uvphi":0.752},"Dandelion":{"b":[[446.361,37.209,5.956],[659.373,61.962,0.195]],"phi":0,"aff":1,"sd":0.18},"Bright Yellow":{"b":[[449.631,35.489,4.633],[710.263,43.229,1.255]],"phi":0,"aff":1,"sd":0.18},"Sun Yellow":{"b":[[456.362,37.921,6.256],[658.029,27.835,0.546]],"phi":0,"aff":1,"sd":0.18},"Buttercup":{"b":[[436.09,45.979,1.696],[645.408,61.564,0.126]],"phi":0,"aff":1,"sd":0.18},"Deep Orange":{"b":[[449.259,54.127,20.642]],"phi":0,"aff":1,"sd":0.18},"Neon Hot Orange":{"b":[[465.021,50.462,13.765],[447.615,58.245,5.047]],"phi":0.306,"aff":1,"sd":0.18,"em":[595,26],"uvphi":0.546},"Creamsicle":{"b":[[441.928,58.614,2.931],[587.893,35.141,0.097]],"phi":0,"aff":1,"sd":0.18},"Clear Orange":{"b":[[436.048,64.101,5.469],[459.248,28.555,5.913]],"phi":0,"aff":1,"sd":0.18},"Fluorescent Pink":{"b":[[544.326,63.139,1.396]],"phi":0.351,"aff":1,"sd":0.18,"em":[602,28],"uvphi":0.49},"Cherry":{"b":[[479.046,44.808,10.225],[541.639,28.921,10.617]],"phi":0,"aff":1,"sd":0.18},"Fuchsia":{"b":[[521.59,34.854,8.516]],"phi":0,"aff":1,"sd":0.18},"Wineberry":{"b":[[520.777,47.438,16.519]],"phi":0,"aff":1,"sd":0.18},"Flame Scarlet":{"b":[[468.28,41.591,12.993],[561.544,16,5.613]],"phi":0,"aff":1,"sd":0.18},"Pinkish Red":{"b":[[491.495,39.989,3.847],[549.365,23.209,2.443]],"phi":0,"aff":1,"sd":0.18},"Radical Red":{"b":[[517.041,28.124,15.502],[497.202,33.65,16.193]],"phi":0,"aff":1,"sd":0.18},"Fire Red":{"b":[[463.519,45.916,17.203],[559.841,16,10.579]],"phi":0,"aff":1,"sd":0.18},"Blood Red":{"b":[[474.629,53.33,33.014],[568.747,16,16.434]],"phi":0,"aff":1,"sd":0.18},"Neon Cerise Pink":{"b":[[531.728,37.385,4.505]],"phi":0.369,"aff":1,"sd":0.18,"em":[602,28],"uvphi":0.5},"Shark Blue":{"b":[[605.681,42.313,4.456],[457.581,42.953,0.305]],"phi":0,"aff":1,"sd":0.18},"Caribbean":{"b":[[395.239,42.247,0.595],[636.023,58.189,2.026]],"phi":0,"aff":1,"sd":0.18},"Aqua":{"b":[[390,35.128,1.097],[663.816,63.869,1.625]],"phi":0,"aff":1,"sd":0.18},"Sonic Blue":{"b":[[512.36,45.319,0.252],[613.513,43.474,7.181]],"phi":0,"aff":1,"sd":0.18},"Royal":{"b":[[627.289,95,2.87],[604.686,42.013,14.508]],"phi":0,"aff":1,"sd":0.18},"Navy":{"b":[[590.07,92.285,10.312],[610.04,43.787,16.743]],"phi":0,"aff":1,"sd":0.18},"Sky Blue":{"b":[[407.307,52.03,0.086],[630.536,59.906,1.414]],"phi":0,"aff":1,"sd":0.18},"Pale Turquoise":{"b":[[413.657,42.575,0.225],[644.18,60.2,0.547]],"phi":0,"aff":1,"sd":0.18},"Flag Blue":{"b":[[598.076,44.386,10.754],[441.422,17.298,0.435]],"phi":0,"aff":1,"sd":0.18},"Bright Blue":{"b":[[447.91,51.448,0.127],[606.84,45.108,5.078]],"phi":0,"aff":1,"sd":0.18},"Teal Blue":{"b":[[417.553,49.049,1.187],[619.054,49.327,4.329]],"phi":0,"aff":1,"sd":0.18},"Espresso Bean":{"b":[[453.724,93.496,9.849],[459.375,95,7.463]],"phi":0,"aff":1,"sd":0.18},"Chocolate":{"b":[[450.212,59.838,7.917],[458.109,95,7.857]],"phi":0,"aff":1,"sd":0.18},"Burnt Sienna":{"b":[[444.889,74.576,10.861]],"phi":0,"aff":1,"sd":0.18},"Dark Dungeon":{"b":[[435.539,89.851,4.3],[555.446,95.137,4.108],[643.655,88.912,4.398]],"phi":0,"aff":1,"sd":0.18},"Light Gray":{"b":[[492.562,71.391,0.417],[628.462,42.513,0.408]],"phi":0,"aff":1,"sd":0.18},"Cool Black":{"b":[[390,16,1.871],[573.457,172.633,23.002],[604.329,40.943,12.156]],"phi":0,"aff":1.6,"sd":0.18},"Neon Key Lime":{"b":[[493,95,1.066],[442.469,28.911,1.576]],"phi":0.85,"aff":1,"sd":0.18,"em":[528,24],"uvphi":0.784},"Evergreen":{"b":[[448.89,32.821,9.178],[618.97,38.207,9.015]],"phi":0,"aff":1,"sd":0.18},"Shamrock":{"b":[[445.674,25.555,7.232],[624.797,44.392,3.7]],"phi":0,"aff":1,"sd":0.18},"Meadow":{"b":[[447.581,28.041,4.023],[632.331,50.74,1.625]],"phi":0,"aff":1,"sd":0.18},"Fern":{"b":[[444.94,39.131,6.191],[617.287,38.976,3.726]],"phi":0,"aff":1,"sd":0.18},"Aquatic Green":{"b":[[450.583,38.051,1.148],[610.506,34.447,3.187]],"phi":0,"aff":1,"sd":0.18},"Lavender":{"b":[[556.404,61.145,0.89]],"phi":0,"aff":1,"sd":0.18},"Concord":{"b":[[553.975,53.734,9.35]],"phi":0,"aff":1,"sd":0.18},"Iris":{"b":[[562.774,51.539,4.755]],"phi":0,"aff":1,"sd":0.18},"Orchid":{"b":[[539.106,44.796,3.281]],"phi":0,"aff":1,"sd":0.18},"Pansy":{"b":[[560.761,52.582,7.4]],"phi":0,"aff":1,"sd":0.18},"Lilac":{"b":[[545.938,57.65,0.749]],"phi":0,"aff":1,"sd":0.18},"Neon Royal Purple":{"b":[[549.113,43.805,13.744]],"phi":0.038,"aff":1,"sd":0.18,"em":[440,26],"uvphi":0.222},"UV Blast Blaze Orange":{"b":[[459.015,28.941,11.834],[556.575,17.232,2.37]],"phi":0.08,"aff":1,"sd":0.08,"em":[595,26],"uvphi":0.579},"UV Blast Red":{"b":[[485.925,38.759,15.962],[565.409,16,4.636]],"phi":0.26,"aff":1,"sd":0.08,"em":[612,28],"uvphi":0.395},"UV Blast Green":{"b":[[505,95,1],[441.653,34.079,1.913]],"phi":0.85,"aff":1,"sd":0.08,"em":[540,24],"uvphi":0.8},"UV Blast Clear":{"b":[],"phi":0.45,"em":[445,28],"aff":0.2,"sd":0.2,"uvAbs":1},"iDye Poly Blue":{"b":[[669.259,95,19.088],[592.811,36.19,19.357]],"phi":0,"aff":1.6,"sd":0.08},"iDye Poly Crimson":{"b":[[483.815,53.666,10.546],[538.779,31.751,10.059]],"phi":0,"aff":1.6,"sd":0.08},"iDye Poly Onyx":{"b":[[390,16,40],[390,260,40],[633.654,260,40]],"phi":0,"aff":1.6,"sd":0.08},"ProChem Neon Lemon Zest":{"b":[[506.311,95,0.705],[443.682,31.425,2.939]],"phi":0.85,"aff":1,"sd":0.18,"em":[552,24],"uvphi":0.752},"ProChem Neon Hot Orange":{"b":[[465.021,50.462,13.765],[447.615,58.245,5.047]],"phi":0.306,"aff":1,"sd":0.18,"em":[595,26],"uvphi":0.546},"ProChem Fluorescent Pink":{"b":[[544.326,63.139,1.396]],"phi":0.351,"aff":1,"sd":0.18,"em":[602,28],"uvphi":0.49},"ProChem Neon Cerise Pink":{"b":[[531.728,37.385,4.505]],"phi":0.369,"aff":1,"sd":0.18,"em":[602,28],"uvphi":0.5},"ProChem Neon Key Lime":{"b":[[493,95,1.066],[442.469,28.911,1.576]],"phi":0.85,"aff":1,"sd":0.18,"em":[528,24],"uvphi":0.784},"ProChem Neon Royal Purple":{"b":[[549.113,43.805,13.744]],"phi":0.038,"aff":1,"sd":0.18,"em":[440,26],"uvphi":0.222}});
Object.assign(DE.PRM.champion,{"kS":0.9557751779846284,"kT":1.5823129440107253,"pw":0.3596631643669184,"gT":0.8478070528240362});
DE.PRM.tq=3;
/*CATALOG-END*/

/*DYES-BEGIN*/
const DYELIST=[{"n":"Blue UV Blast","g":"UV Blast / Quick-Coat","h":"#005BFF","c":false},{"n":"Hot Pink UV Blast","g":"UV Blast / Quick-Coat","h":"#FF2A9D","c":false},{"n":"Purple UV Blast","g":"UV Blast / Quick-Coat","h":"#7A19D8","c":false},{"n":"Chartreuse / Yellow","g":"UV Blast / Quick-Coat","h":"#D9FF00","c":false},{"n":"Black","g":"UV Blast / Quick-Coat","h":"#111111","c":false},{"n":"Pumpkin Brown","g":"UV Blast / Quick-Coat","h":"#8A4B20","c":false},{"n":"Watermelon","g":"UV Blast / Quick-Coat","h":"#E84765","c":false},{"n":"Rind Green","g":"UV Blast / Quick-Coat","h":"#438B45","c":false},{"n":"Neon Lemon Zest","g":"ProChem","h":"#DEFD02","c":false,"i":1,"alias":"ProChem Neon Lemon Zest"},{"n":"Dandelion","g":"ProChem","h":"#F2BF13","c":false},{"n":"Bright Yellow","g":"ProChem","h":"#FFD629","c":false},{"n":"Sun Yellow","g":"ProChem","h":"#F6B51B","c":false},{"n":"Buttercup","g":"ProChem","h":"#F5D46A","c":false},{"n":"Deep Orange","g":"ProChem","h":"#D94C13","c":false},{"n":"Neon Hot Orange","g":"ProChem","h":"#E75001","c":false,"i":1,"alias":"ProChem Neon Hot Orange"},{"n":"Creamsicle","g":"ProChem","h":"#F39454","c":false},{"n":"Clear Orange","g":"ProChem","h":"#EF7622","c":false},{"n":"Fluorescent Pink","g":"ProChem","h":"#F88DA5","c":false,"i":1,"alias":"ProChem Fluorescent Pink"},{"n":"Cherry","g":"ProChem","h":"#B51E3A","c":false},{"n":"Fuchsia","g":"ProChem","h":"#D22A8A","c":false},{"n":"Wineberry","g":"ProChem","h":"#762448","c":false},{"n":"Flame Scarlet","g":"ProChem","h":"#E8392C","c":false},{"n":"Pinkish Red","g":"ProChem","h":"#E94D66","c":false},{"n":"Radical Red","g":"ProChem","h":"#E92045","c":false},{"n":"Fire Red","g":"ProChem","h":"#D92524","c":false},{"n":"Blood Red","g":"ProChem","h":"#8B121B","c":false},{"n":"Neon Cerise Pink","g":"ProChem","h":"#E544AB","c":false,"i":1,"alias":"ProChem Neon Cerise Pink"},{"n":"Shark Blue","g":"ProChem","h":"#2379B8","c":false},{"n":"Caribbean","g":"ProChem","h":"#18A7C1","c":false},{"n":"Aqua","g":"ProChem","h":"#29C9C7","c":false},{"n":"Sonic Blue","g":"ProChem","h":"#2665D8","c":false},{"n":"Royal","g":"ProChem","h":"#243A9A","c":false},{"n":"Navy","g":"ProChem","h":"#17254F","c":false},{"n":"Sky Blue","g":"ProChem","h":"#55A9E6","c":false},{"n":"Pale Turquoise","g":"ProChem","h":"#8ADFD7","c":false},{"n":"Flag Blue","g":"ProChem","h":"#164EAE","c":false},{"n":"Bright Blue","g":"ProChem","h":"#176FD1","c":false},{"n":"Teal Blue","g":"ProChem","h":"#147D88","c":false},{"n":"Espresso Bean","g":"ProChem","h":"#4D2B21","c":false},{"n":"Chocolate","g":"ProChem","h":"#6B3B27","c":false},{"n":"Burnt Sienna","g":"ProChem","h":"#9A4A2F","c":false},{"n":"Dark Dungeon","g":"ProChem","h":"#343238","c":false},{"n":"Light Gray","g":"ProChem","h":"#A9ADB2","c":false},{"n":"Cool Black","g":"ProChem","h":"#161B23","c":false},{"n":"Neon Key Lime","g":"ProChem","h":"#01FE0F","c":false,"i":1,"alias":"ProChem Neon Key Lime"},{"n":"Evergreen","g":"ProChem","h":"#176B3A","c":false},{"n":"Shamrock","g":"ProChem","h":"#169447","c":false},{"n":"Meadow","g":"ProChem","h":"#5DAA55","c":false},{"n":"Fern","g":"ProChem","h":"#4C7A43","c":false},{"n":"Aquatic Green","g":"ProChem","h":"#169B83","c":false},{"n":"Lavender","g":"ProChem","h":"#A486C7","c":false},{"n":"Concord","g":"ProChem","h":"#4D276E","c":false},{"n":"Iris","g":"ProChem","h":"#6840A5","c":false},{"n":"Orchid","g":"ProChem","h":"#A24AA5","c":false},{"n":"Pansy","g":"ProChem","h":"#59328C","c":false},{"n":"Lilac","g":"ProChem","h":"#BB8DC9","c":false},{"n":"Neon Royal Purple","g":"ProChem","h":"#621187","c":false,"i":1,"alias":"ProChem Neon Royal Purple"},{"n":"UV Blast Blaze Orange","g":"My Inventory","h":"#FF7E26","c":false,"i":1},{"n":"UV Blast Red","g":"My Inventory","h":"#EC1B24","c":false,"i":1},{"n":"UV Blast Green","g":"My Inventory","h":"#C3FF0C","c":false,"i":1},{"n":"UV Blast Clear","g":"My Inventory","h":"#F7FFF4","c":true,"i":1},{"n":"iDye Poly Blue","g":"My Inventory","h":"#1B1866","c":false,"i":1},{"n":"iDye Poly Crimson","g":"My Inventory","h":"#972738","c":false,"i":1},{"n":"iDye Poly Onyx","g":"My Inventory","h":"#000000","c":false,"i":1}];
/*DYES-END*/
