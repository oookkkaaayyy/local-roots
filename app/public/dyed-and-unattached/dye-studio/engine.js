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
 // illuminants (400-700 nm, 10 nm, normalized to 100 at 560 nm). D65 tabulated; A = CIE standard incandescent (Planck 2848 K);
 // LED = CIE 15:2018 illuminant LED-B3 (3045 K phosphor-converted white LED, via colour-science 0.4.7 SDS_ILLUMINANTS), resampled to 10 nm and normalized at 560 nm; used for indoor scenes.
 const gs=(l,mu,sg)=>Math.exp(-.5*((l-mu)/sg)**2);
 const planck=T=>l=>Math.pow(560/l,5)*(Math.exp(1.435e7/(T*560))-1)/(Math.exp(1.435e7/(T*l))-1)*100;
 const ILL={D65:d65,A:lam.map(planck(2848)),LED:[0.33,1.66,7.96,28.12,80.31,125.13,65.65,39.92,34.28,44.89,59.28,69.76,76.33,82.03,88.26,94.56,100.0,104.24,107.29,109.42,109.42,106.1,99.2,89.39,77.65,65.32,53.32,42.57,33.29,25.73,19.56]};
 let illName="D65",E=d65,kn=0,kn65=0;for(let i=0;i<31;i++)kn65+=cmf[i][1]*d65[i];kn=kn65;
 const M=[[3.2406,-1.5372,-.4986],[-.9689,1.8758,.0415],[.0557,-.2040,1.0570]];
 const rawWith=(s,Ei,k)=>{let X=0,Y=0,Z=0;for(let i=0;i<31;i++){const w=s[i]*Ei[i];X+=w*cmf[i][0];Y+=w*cmf[i][1];Z+=w*cmf[i][2]}X/=k;Y/=k;Z/=k;return M.map(r=>r[0]*X+r[1]*Y+r[2]*Z)};
 const ones=new Array(31).fill(1),wp65=rawWith(ones,d65,kn65);let wp=wp65;
 // sRGB<->spectrum lifting is always done under D65; display under another illuminant is white-balanced (camera/eye adapted), so only metamerism and fluorescence excitation change
 const toLin65=s=>{const r=rawWith(s,d65,kn65);return[r[0]/wp65[0],r[1]/wp65[1],r[2]/wp65[2]]};
 const toLin=s=>{const r=rawWith(s,E,kn);return[r[0]/wp[0],r[1]/wp[1],r[2]/wp[2]]};
 function setIllum(n){if(!ILL[n])n="D65";illName=n;E=ILL[n];kn=0;for(let i=0;i<31;i++)kn+=cmf[i][1]*E[i];wp=rawWith(ones,E,kn)}
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
  const ev=(c)=>toLin65(specFromC(c));
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
 return{lam,spec,specHex,toLin,toLin65,linHex,dyeAbsorbance,apply,hexLin,get d65w(){return E},ILL,setIllum,get illum(){return illName}}
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
  star:{Sx:.4,cmax:1.0,rim:.08,tr:0,sd:0},
  metal:{Sx:.06},
  champion:{g0:.3,qb:"tie",bt:.38,bf:.08,Sx:.35,cmax:1.0,rim:.12,tr:1,sd:0,kS:.55,kT:1.5,pw:.75,gT:1.38,w:{outdoor:{plate:1,shoulder:.75,rim:.5},surface:{plate:.09,shoulder:.04,rim:.04},backlit:{plate:1,shoulder:.95,rim:.8}}}
 };
 const famOf=o=>/champion/.test(o||"")?"champion":"star";
 const absorb=(d,k)=>{const A=new Array(N).fill(0);if(!d)return A;for(const [mu,sg,a] of d.b)for(let i=0;i<N;i++)A[i]+=a*gau(lam[i],mu,sg);for(let i=0;i<N;i++)A[i]*=k;return A};
 // Plastic table. fam = optical family; rating = r/discdyeing wiki dye-uptake scale 1-5 (null = unrated, assumed like family);
 // up = dye strength multiplier derived from the rating. Sources: research/dataset/observations.json (wiki ratings).
 const UPR=[0,.15,.35,.6,.8,1];
 const PLASTICS={star:{fam:"star",rating:5},gstar:{fam:"star",rating:5},echostar:{fam:"star",rating:4},pro:{fam:"star",rating:4},dx:{fam:"star",rating:2},prime:{fam:"star",rating:2},champion:{fam:"champion",rating:5},fuzion:{fam:"champion",rating:5},biofuzion:{fam:"champion",rating:4},lucid:{fam:"champion",rating:5},glow:{fam:"champion",rating:null,est:1},retro:{fam:"star",rating:1},opto:{fam:"star",rating:5},goldline:{fam:"star",rating:5},k3:{fam:"star",rating:1},k1:{fam:"star",rating:5},electron:{fam:"star",rating:1},neutron:{fam:"star",rating:5},proton:{fam:"star",rating:4},glitch:{fam:"star",rating:5},prodigy300:{fam:"star",rating:1},prodigy350:{fam:"star",rating:1},prodigy400:{fam:"star",rating:5},megasoft:{fam:"star",rating:1},bthard:{fam:"star",rating:2},tournament:{fam:"star",rating:5},vip:{fam:"star",rating:5},dline:{fam:"star",rating:1},cline:{fam:"champion",rating:5},sline:{fam:"star",rating:5},prod:{fam:"star",rating:1},zflx:{fam:"star",rating:2},elitex:{fam:"star",rating:4},esp:{fam:"star",rating:5},z:{fam:"star",rating:5},titanium:{fam:"star",rating:4},crystal:{fam:"champion",rating:5},alpha:{fam:"star",rating:5},beta:{fam:"star",rating:2},strata:{fam:"star",rating:1}}; // r/discdyeing wiki table (https://lr.eu.psf.lt/r/discdyeing/comments/11an9b6/disc_dyeing_wiki) plus guides; opaque = star family, translucent = champion family
 const REFR={star:5,champion:5}; // the fitted star and champion process parameters already embody these ratings, so up is relative to the family reference
 const plasticOf=id=>{const p=PLASTICS[id]||PLASTICS.star;return{...p,up:p.rating?Math.min(1.25,UPR[p.rating]/UPR[REFR[p.fam]]):1}};
 // Uptake. Dyes in ONE bath (a blend) compete for the same sites (Langmuir, affinity-weighted). Separate baths
 // (layers, item.b) do not displace each other, so their dye loads add and absorbances add in the film (order is
 // irrelevant); a soft total cap (TOTCAP) stands in for the plastic running out of sites altogether.
 const EST_DE=2.8,TOTCAP=3.2,LAM=.2,VEIL=.008;
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
   const A=absorb(d,c[i]),qf=1/(1+Math.pow(Math.max(...A)*(opt&&opt.cscale||1)/PRM.tq,2)),share=tauTotal.map((t,j)=>t>1e-9?A[j]/t:0);
   const bk=opt&&opt.beta;
   let abs=0;for(let j=0;j<N;j++){if(lam[j]<=d.em[0]+10)abs+=(1-Math.exp(-2*tauTotal[j]*(bk?bk[j]:1)))*share[j]*SP.d65w[j]}// excitation only at or below the emission band (Stokes shift; no anti-Stokes pumping)
   const norm=d.em?(()=>{let s=0;for(let j=0;j<N;j++)s+=gau(lam[j],d.em[0],d.em[1]);return s})():1;
   let be=1;if(bk){let ws=0,wb=0;for(let j=0;j<N;j++){const g=gau(lam[j],d.em[0],d.em[1]);ws+=g;wb+=g*bk[j]}be=ws>0?wb/ws:1}
   for(let j=0;j<N;j++)em[j]+=qf*d.phi*abs*be*gau(lam[j],d.em[0],d.em[1])/norm/SP.d65w[j]*Math.exp(-(opt&&opt.outf!==undefined?opt.outf:.7)*tauTotal[j]);
  });
  return em;
 }
 // Saunderson correction for the polymer/air interface (n~1.5: internal diffuse reflectance k2~.6, specular excluded).
 // Base spectra are measured appearance, so they are mapped to internal reflectance first and back after the film model.
 const K2=.6,K1=.04;
 const toInt=R=>R.map(r=>r/((1-K1)*(1-K2)+K2*r));
 const toExt=R=>R.map(r=>(1-K1)*(1-K2)*r/(1-K2*r));
 const baseSpec=h=>SP.spec(h);
 // fluorescence backing model: excitation path and emission outcoupling scale with (1+Rbase)/(1+Rref); Rref = white Star, so fitted Star films are unchanged
 const REF_BASE="#F4F2E8";
 function opaque(baseHex,items,fam,opt){
  const P=PRM[fam]||PRM.star,tau=tauOf(items,opt?.mult),Sx=opt?.metal?PRM.metal.Sx:P.Sx;
  // metal/foil substrate: specular, non-scattering backing, so the dye skin acts as a Beer-Lambert double pass (Sx small), no interface mapping
  let R=opt?.metal?kmLayer(baseSpec(baseHex),tau,Sx):(P.sd?toExt(kmLayer(toInt(baseSpec(baseHex)),tau,Sx)):kmLayer(baseSpec(baseHex),tau,Sx));
  if(!opt?.noFluor){const Rb=baseSpec(baseHex),Rr=baseSpec(REF_BASE);const beta=Rb.map((v,i)=>(1+v)/(1+Rr[i]));const f=fluor(items,tau,{...opt,beta});R=R.map((v,i)=>v+f[i])}
  return R;
 }
 function translucent(baseHex,transHex,items,fam,scene,zone,path,opt){
  const P=PRM.champion,tau=tauOf(items,opt?.mult);
  const Rs=P.sd?toExt(kmLayer(toInt(baseSpec(baseHex)),tau.map(v=>v*P.kS),P.Sx)):kmLayer(baseSpec(baseHex),tau.map(v=>v*P.kS),P.Sx);
  const pe=Math.pow(Math.max(path,.2)/.74,P.qb==="tie"?P.pw:(P.qb||0)),T0=(transHex?baseSpec(transHex).map(v=>Math.pow(v,pe)):baseSpec(baseHex).map(v=>Math.pow(Math.max(0,v-P.bf)/(1-P.bf),P.bt*pe))),tm=Math.max(0,...tau)*P.kT*Math.pow(path,P.pw),gE=1+(P.gT-1)*(1-Math.exp(-tm/P.g0)),T=T0.map((v,i)=>Math.min(1.4,v*Math.exp(-2*tau[i]*P.kT*Math.pow(path,P.pw))*gE));
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
  if(spec.metal)opt={...(opt||{}),metal:true};
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
   out.spread=Math.hypot(d[Math.floor(.9*(d.length-1))],EST_DE*Math.sqrt(spec.items.filter(i=>CAT[i.name]?.est).length));out.lo=labs.reduce((a,l)=>l[0]<a[0]?l:a);out.hi=labs.reduce((a,l)=>l[0]>a[0]?l:a);
  }
  // evidence flags: situations the public dataset covers poorly (used by the UI to lower the confidence label)
  {const ev=[],its=spec.items,bths=new Set(its.map(i=>i.b||0)).size,pl=spec.plastic?plasticOf(spec.plastic):null;
   if(famOf(spec.family)==='champion'&&its.length>1)ev.push('translucent multi-dye');
   if(bths>1)ev.push('overlap');
   if(its.some(i=>(CAT[i.name]?.sd??.18)>.15))ev.push('estimated dye');
   if(pl&&(pl.rating===null||pl.est))ev.push('unrated plastic');
   if(out.gamutExcess>.05)ev.push('out of gamut');
   if(pl&&pl.rating!==null&&pl.rating<=2)ev.push('low-uptake plastic');
   if(labOf(SP.hexLin(spec.baseHex))[0]<32)ev.push('dark base');
   if(spec.metal)ev.push('metal substrate');
   if(its.some(i=>/Black|Onyx|Gun Metal/.test(i.name)))ev.push('black dye hue varies');
   out.evidence=ev}
  out.lab=labOf(out.lin.map(v=>Math.min(1,Math.max(0,v))));
  return out;
 }
 // ---------- UV365 / charged glow ----------
 // emission color of fluorescent dyes under 365 nm, with inner-filter quenching by every other dye
 function uvLin(spec){
  const items=merge(spec.items),tau=tauOf(items,1),c=conc(items),rgb=[0,0,0];
  items.forEach((it,i)=>{const d=CAT[it.name];if(!d||!d.phi)return;
   const sh=1-Math.exp(-2*c[i]*(d.uvAbs??1)),em=new Array(N).fill(0);
   for(let j=0;j<N;j++)em[j]=gau(lam[j],(d.uvem||d.em)[0],(d.uvem||d.em)[1])+(d.uvem2?d.uvem2[2]*gau(lam[j],d.uvem2[0],d.uvem2[1]):0);
   // emission re-absorbed by dyes present
   for(let j=0;j<N;j++)em[j]*=Math.exp(-tau[j]*.55);
   const l=SP.toLin65(em.map(v=>v*(d.uvphi??d.phi)*sh*2.4));for(let k=0;k<3;k++)rgb[k]+=l[k];});
  return rgb;
 }
 const uvTone=rgb=>SP.linHex(rgb.map(v=>1-Math.exp(-Math.max(0,v)*1.6)));
 function uv365(spec){return uvTone(uvLin(spec))}
 // UV365 scene as seen on a disc: dye emission plus the 395-420 nm violet leakage of a 365 nm LED reflected by the (dye-filtered) base.
 // ESTIMATE: leakage 6% of emitter power at 405 nm (sigma 9) times a visual exposure gain 60 (undyed white Star reads about #2D0066); undyed white plastic reads deep violet, yellow/orange dyes absorb the leakage and read darker.
 function uvScene(spec){
  const items=merge(spec.items),tau=tauOf(items,1),Rb=baseSpec(spec.baseHex),rgb=uvLin(spec);
  const leak=lam.map((l,j)=>3.6*gau(l,405,9)*Rb[j]*Math.exp(-2*tau[j]));
  const l=SP.toLin65(leak.map(v=>v*1.0));for(let k=0;k<3;k++)rgb[k]+=l[k]*.9;
  return uvTone(rgb);
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
 return{CAT,PRM,PLASTICS,plasticOf,famOf,uvScene,setIllum:n=>SP.setIllum(n),absorb,conc,tauOf,kmLayer,fluor,render,predict,uv365,glow,recipe,labOf,labOfSpec,de2000,hexLab,dEhex,present,rng,gaussRand,gau,lam};
})();
/*ENGINE-END*/

/*CATALOG-BEGIN*/
Object.assign(DE.CAT,{"Clear UV Blast":{"b":[],"phi":0.45,"em":[445,28],"aff":0.2,"sd":0.2,"uvAbs":1,"uvem":[473.7602962540228,46],"uvphi":1.1477946272361654,"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Blue UV Blast":{"b":[[605.552,25.839,4.252],[548.775,16,11.08]],"phi":0.054,"aff":1,"sd":0.18,"em":[469.0010211454685,28.418431252387144],"uvem":[468.31000727322885,30.24629949186675],"uvphi":1.1556961070546314,"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Flo Red UV Blast":{"b":[[528.316,29.057,8.697],[470.071,43.343,6.83]],"phi":0.261,"aff":1,"sd":0.08,"em":[608.9163794114183,39.45708042211436],"uvem":[612.894396800677,26.910882003021836],"uvphi":1.1500640469105967,"uvem2":[450,30,0.8763069309378768],"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"film measured on white Star (owner photo); bands fitted","est":false},"Green UV Blast":{"b":[[642.507,20.532,7.831],[452.593,25.153,8.706]],"phi":0.546,"aff":1,"sd":0.08,"em":[537.3312385449702,46],"uvem":[537.5686778426957,46],"uvphi":1.2,"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"film measured on white Star (owner photo); bands fitted","est":false},"Hot Pink UV Blast":{"b":[[514.774,38.31,2.864],[557.587,25.886,2.279]],"phi":0.414,"aff":1,"sd":0.18,"em":[622.3101096745693,42.35288252368957],"uvem":[617.6473170770901,37.213700707019115],"uvphi":1.2,"uvem2":[450,30,0.26072983403156413],"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Flo Orange / Blaze Orange UV":{"b":[[431.553,67.006,6.335],[574.974,30.049,0.412]],"phi":0.544,"aff":1,"sd":0.08,"em":[613.2854737649461,26.09952732094188],"uvem":[612.6578008547638,25.26018389037799],"uvphi":1.2,"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"film measured on white Star (owner photo); bands fitted","est":false},"Purple UV Blast":{"b":[[547.537,33.679,3.012],[594.179,53.479,2.099]],"phi":0.044,"aff":1,"sd":0.18,"em":[438.31108871253065,16],"uvem":[438.28283702091386,16],"uvphi":1.2,"uvem2":[450,30,2.2],"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Chartreuse / Yellow":{"b":[[454.294,25.925,3.839],[636.361,42.032,0.722]],"phi":0.45,"aff":1,"sd":0.18,"em":[552.8819756836109,46],"uvem":[553.6477287693328,46],"uvphi":1.2,"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Black":{"b":[[390,47.495,14.861],[532.549,222.804,21.875],[596.925,135.705,14.878]],"phi":0,"aff":1.6,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Pumpkin Brown":{"b":[[444.211,37.441,7.954],[461.988,95,4.328]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Watermelon":{"b":[[485.118,51.941,1.997],[533.244,31.69,2.915]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Rind Green":{"b":[[438.746,42.713,4.493],[614.713,40.96,2.586]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Blue":{"b":[[390,34.952,1.418],[637.579,72.522,23.039]],"phi":0,"aff":1.6,"sd":0.08,"prov":"film measured on white Star (owner photo); bands fitted","est":false},"Crimson":{"b":[[495.743,54.929,7.168],[523.881,43.591,5.064]],"phi":0,"aff":1.6,"sd":0.08,"prov":"film measured on white Star (owner photo); bands fitted","est":false},"Onyx":{"b":[[441.861,16,4.348],[675.379,260,40],[390,260,40]],"phi":0,"aff":1.6,"sd":0.08,"prov":"film measured on white Star (owner photo); bands fitted","est":false},"Neon Lemon Zest":{"b":[[442.09,36.746,3.166],[625.002,28.512,0.886]],"phi":0.396,"aff":1,"sd":0.18,"em":[557.2136626706161,46],"uvem":[557.8394115420429,46],"uvphi":1.2,"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Dandelion":{"b":[[423.926,54.418,4.633],[614.151,30.866,0.269]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Bright Yellow":{"b":[[449.204,37.506,3.427],[633.766,40.811,0.341]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Sun Yellow":{"b":[[456.559,41.374,4.373],[639.178,57.145,0.26]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Buttercup":{"b":[[449.485,46.57,1.514],[654.748,54.418,0.371]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Deep Orange":{"b":[[458.265,58.276,11.258]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Neon Hot Orange":{"b":[[457.044,56.528,12.432]],"phi":0.306,"aff":1,"sd":0.18,"em":[615.7451805543018,28.44980901576657],"uvem":[615.7756689461003,28.48388243367632],"uvphi":1.2,"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Creamsicle":{"b":[[443.614,78.405,2.137]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Clear Orange":{"b":[[432.544,76.458,3.286],[452.133,49.601,2.885]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Fluorescent Pink":{"b":[[541.538,79.494,1.184]],"phi":0.351,"aff":1,"sd":0.18,"em":[619.2505593094002,34.39551453913307],"uvem":[614.7282081780907,30.718497345332825],"uvphi":1.1661610159203102,"uvem2":[450,30,0.3291849269307516],"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Cherry":{"b":[[477.288,55.117,5.169],[540.865,31.389,7.272]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Fuchsia":{"b":[[523.31,41.332,4.874]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Wineberry":{"b":[[523.935,52.734,9.706]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Flame Scarlet":{"b":[[457.091,44.898,6.635],[548.502,23.152,5.586]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Pinkish Red":{"b":[[494.322,50.434,2.017],[521.476,36.669,2.382]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Radical Red":{"b":[[490.696,38.611,6.711],[543.89,23.927,6.325]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Fire Red":{"b":[[482.222,43.21,11.705],[567.813,16.455,4.523]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Blood Red":{"b":[[485.106,52.89,15.597],[514.289,44.231,11.054]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Neon Cerise Pink":{"b":[[538.749,48.124,2.796]],"phi":0.369,"aff":1,"sd":0.18,"em":[623.83544473364,36.67290365776661],"uvem":[622.6854560197253,35.10088878437598],"uvphi":1.1999997084685643,"uvem2":[450,30,0.28610053941030206],"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Shark Blue":{"b":[[452.034,43.693,0.444],[617.601,57.469,3.154]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Caribbean":{"b":[[405.202,40.685,0.843],[620.155,56.608,2.012]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Aqua":{"b":[[401.203,37.315,1.084],[636.961,58.513,1.627]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Sonic Blue":{"b":[[613.783,46.225,3.858],[571.135,73.082,0.712]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Royal":{"b":[[414.352,28.627,1.145],[594.259,47.985,10.794]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Navy":{"b":[[390,75.139,2.251],[613.027,62.752,18.347]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Sky Blue":{"b":[[589.787,85.171,0.592],[629.184,40.052,1.202]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Pale Turquoise":{"b":[[472.418,47.02,0.32],[675.056,56.521,1.59]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Flag Blue":{"b":[[411.087,46.183,0.539],[607.798,54.766,6.544]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Bright Blue":{"b":[[451.866,45.602,0.189],[614.894,57.921,3.495]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Teal Blue":{"b":[[435.865,37.841,1.202],[615.963,59.059,2.98]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Espresso Bean":{"b":[[449.221,62.551,6.141],[498.296,95,6.263]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Chocolate":{"b":[[435.578,95,10.247],[647.755,31.651,0.278]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Burnt Sienna":{"b":[[435.924,90.462,6.732]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Dark Dungeon":{"b":[[443.381,97.732,3.3],[571.897,95.466,2.95],[670.936,93.825,2.641]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Light Gray":{"b":[[478.571,73.377,0.584],[614.205,47.648,0.598]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Cool Black":{"b":[[390,16,5.256],[478.169,174.513,10.854],[628.725,77.006,14.47]],"phi":0,"aff":1.6,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Neon Key Lime":{"b":[[444.153,28.052,4.987],[633.307,29.923,2.842]],"phi":0.432,"aff":1,"sd":0.18,"em":[530,46],"uvem":[543.3757478362597,46],"uvphi":1.2,"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Evergreen":{"b":[[448.963,28.277,7.813],[615.315,50.147,4.584]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Shamrock":{"b":[[449.413,29.39,5.016],[619.312,47.814,2.741]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Meadow":{"b":[[441.391,46.253,2.755],[624.539,39.678,1.893]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Fern":{"b":[[441.919,46.975,4.389],[629.81,49.51,2.848]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Aquatic Green":{"b":[[440.621,34.713,1.396],[639.023,66.377,2.334]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Lavender":{"b":[[562.408,73.069,1.063]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Concord":{"b":[[559.385,63.688,5.874]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Iris":{"b":[[570.484,64.565,3.282]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Orchid":{"b":[[542.832,55.414,2.367]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Pansy":{"b":[[569.082,65.207,4.725]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Lilac":{"b":[[550.509,66.712,0.95]],"phi":0,"aff":1,"sd":0.18,"prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"Neon Royal Purple":{"b":[[554.371,51.534,7.823]],"phi":0.038,"aff":1,"sd":0.18,"em":[440,16.070112198931376],"uvem":[440,16.070112198931376],"uvphi":1.1991482507184275,"uvem2":[450,30,1.4375565502808376],"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"UV Blast Blaze Orange":{"b":[[431.553,67.006,6.335],[574.974,30.049,0.412]],"phi":0.544,"aff":1,"sd":0.08,"em":[613.2854737649461,26.09952732094188],"uvem":[612.6578008547638,25.26018389037799],"uvphi":1.2,"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"film measured on white Star (owner photo); bands fitted","est":false},"UV Blast Red":{"b":[[528.316,29.057,8.697],[470.071,43.343,6.83]],"phi":0.261,"aff":1,"sd":0.08,"em":[608.9163794114183,39.45708042211436],"uvem":[612.894396800677,26.910882003021836],"uvphi":1.1500640469105967,"uvem2":[450,30,0.8763069309378768],"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"film measured on white Star (owner photo); bands fitted","est":false},"UV Blast Green":{"b":[[642.507,20.532,7.831],[452.593,25.153,8.706]],"phi":0.546,"aff":1,"sd":0.08,"em":[537.3312385449702,46],"uvem":[537.5686778426957,46],"uvphi":1.2,"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"film measured on white Star (owner photo); bands fitted","est":false},"UV Blast Clear":{"b":[],"phi":0.45,"em":[445,28],"aff":0.2,"sd":0.2,"uvAbs":1,"uvem":[473.7602962540228,46],"uvphi":1.1477946272361654,"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"iDye Poly Blue":{"b":[[390,34.952,1.418],[637.579,72.522,23.039]],"phi":0,"aff":1.6,"sd":0.08,"prov":"film measured on white Star (owner photo); bands fitted","est":false},"iDye Poly Crimson":{"b":[[495.743,54.929,7.168],[523.881,43.591,5.064]],"phi":0,"aff":1.6,"sd":0.08,"prov":"film measured on white Star (owner photo); bands fitted","est":false},"iDye Poly Onyx":{"b":[[441.861,16,4.348],[675.379,260,40],[390,260,40]],"phi":0,"aff":1.6,"sd":0.08,"prov":"film measured on white Star (owner photo); bands fitted","est":false},"ProChem Neon Lemon Zest":{"b":[[442.09,36.746,3.166],[625.002,28.512,0.886]],"phi":0.396,"aff":1,"sd":0.18,"em":[557.2136626706161,46],"uvem":[557.8394115420429,46],"uvphi":1.2,"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"ProChem Neon Hot Orange":{"b":[[457.044,56.528,12.432]],"phi":0.306,"aff":1,"sd":0.18,"em":[615.7451805543018,28.44980901576657],"uvem":[615.7756689461003,28.48388243367632],"uvphi":1.2,"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"ProChem Fluorescent Pink":{"b":[[541.538,79.494,1.184]],"phi":0.351,"aff":1,"sd":0.18,"em":[619.2505593094002,34.39551453913307],"uvem":[614.7282081780907,30.718497345332825],"uvphi":1.1661610159203102,"uvem2":[450,30,0.3291849269307516],"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"ProChem Neon Cerise Pink":{"b":[[538.749,48.124,2.796]],"phi":0.369,"aff":1,"sd":0.18,"em":[623.83544473364,36.67290365776661],"uvem":[622.6854560197253,35.10088878437598],"uvphi":1.1999997084685643,"uvem2":[450,30,0.28610053941030206],"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"ProChem Neon Key Lime":{"b":[[444.153,28.052,4.987],[633.307,29.923,2.842]],"phi":0.432,"aff":1,"sd":0.18,"em":[530,46],"uvem":[543.3757478362597,46],"uvphi":1.2,"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true},"ProChem Neon Royal Purple":{"b":[[554.371,51.534,7.823]],"phi":0.038,"aff":1,"sd":0.18,"em":[440,16.070112198931376],"uvem":[440,16.070112198931376],"uvphi":1.1991482507184275,"uvem2":[450,30,1.4375565502808376],"uvprov":"estimate: emission band fitted to the vendor-stated UV colour, bounded to +-42 nm of the literature hue-class prior (JAIC 44-02, Rhodamine refs, PhotochemCAD Stokes shifts); replace with measured UV photo","prov":"ESTIMATE: film target = vendor swatch mapped L*x0.90, hue -3 deg (LOO error 2.8 dE2000 on the 6 measured dyes); replace with controlled-source photo of this dye on white Star","est":true}});
Object.assign(DE.PRM.champion,{"kS":0.982703620645307,"kT":2.261928833967366,"pw":0.9315111876258486,"gT":1.6,"g0":0.3,"Sx":0.15326675499362458,"qb":"tie","sd":0});
DE.PRM.champion.w.outdoor.rim=1;DE.PRM.champion.w.outdoor.shoulder=1;DE.PRM.champion.rim=0.04;
DE.PRM.star.Sx=0.4;
DE.PRM.tq=3;
/*CATALOG-END*/

/*DYES-BEGIN*/
const DYELIST=[{"n":"Blue UV Blast","g":"UV Blast / Quick-Coat","h":"#005BFF","c":false},{"n":"Hot Pink UV Blast","g":"UV Blast / Quick-Coat","h":"#FF2A9D","c":false},{"n":"Purple UV Blast","g":"UV Blast / Quick-Coat","h":"#7A19D8","c":false},{"n":"Chartreuse / Yellow","g":"UV Blast / Quick-Coat","h":"#D9FF00","c":false},{"n":"Black","g":"UV Blast / Quick-Coat","h":"#111111","c":false},{"n":"Pumpkin Brown","g":"UV Blast / Quick-Coat","h":"#8A4B20","c":false},{"n":"Watermelon","g":"UV Blast / Quick-Coat","h":"#E84765","c":false},{"n":"Rind Green","g":"UV Blast / Quick-Coat","h":"#438B45","c":false},{"n":"Neon Lemon Zest","g":"ProChem","h":"#DEFD02","c":false,"i":1,"alias":"ProChem Neon Lemon Zest"},{"n":"Dandelion","g":"ProChem","h":"#F2BF13","c":false},{"n":"Bright Yellow","g":"ProChem","h":"#FFD629","c":false},{"n":"Sun Yellow","g":"ProChem","h":"#F6B51B","c":false},{"n":"Buttercup","g":"ProChem","h":"#F5D46A","c":false},{"n":"Deep Orange","g":"ProChem","h":"#D94C13","c":false},{"n":"Neon Hot Orange","g":"ProChem","h":"#E75001","c":false,"i":1,"alias":"ProChem Neon Hot Orange"},{"n":"Creamsicle","g":"ProChem","h":"#F39454","c":false},{"n":"Clear Orange","g":"ProChem","h":"#EF7622","c":false},{"n":"Fluorescent Pink","g":"ProChem","h":"#F88DA5","c":false,"i":1,"alias":"ProChem Fluorescent Pink"},{"n":"Cherry","g":"ProChem","h":"#B51E3A","c":false},{"n":"Fuchsia","g":"ProChem","h":"#D22A8A","c":false},{"n":"Wineberry","g":"ProChem","h":"#762448","c":false},{"n":"Flame Scarlet","g":"ProChem","h":"#E8392C","c":false},{"n":"Pinkish Red","g":"ProChem","h":"#E94D66","c":false},{"n":"Radical Red","g":"ProChem","h":"#E92045","c":false},{"n":"Fire Red","g":"ProChem","h":"#D92524","c":false},{"n":"Blood Red","g":"ProChem","h":"#8B121B","c":false},{"n":"Neon Cerise Pink","g":"ProChem","h":"#E544AB","c":false,"i":1,"alias":"ProChem Neon Cerise Pink"},{"n":"Shark Blue","g":"ProChem","h":"#2379B8","c":false},{"n":"Caribbean","g":"ProChem","h":"#18A7C1","c":false},{"n":"Aqua","g":"ProChem","h":"#29C9C7","c":false},{"n":"Sonic Blue","g":"ProChem","h":"#2665D8","c":false},{"n":"Royal","g":"ProChem","h":"#243A9A","c":false},{"n":"Navy","g":"ProChem","h":"#17254F","c":false},{"n":"Sky Blue","g":"ProChem","h":"#55A9E6","c":false},{"n":"Pale Turquoise","g":"ProChem","h":"#8ADFD7","c":false},{"n":"Flag Blue","g":"ProChem","h":"#164EAE","c":false},{"n":"Bright Blue","g":"ProChem","h":"#176FD1","c":false},{"n":"Teal Blue","g":"ProChem","h":"#147D88","c":false},{"n":"Espresso Bean","g":"ProChem","h":"#4D2B21","c":false},{"n":"Chocolate","g":"ProChem","h":"#6B3B27","c":false},{"n":"Burnt Sienna","g":"ProChem","h":"#9A4A2F","c":false},{"n":"Dark Dungeon","g":"ProChem","h":"#343238","c":false},{"n":"Light Gray","g":"ProChem","h":"#A9ADB2","c":false},{"n":"Cool Black","g":"ProChem","h":"#161B23","c":false},{"n":"Neon Key Lime","g":"ProChem","h":"#01FE0F","c":false,"i":1,"alias":"ProChem Neon Key Lime"},{"n":"Evergreen","g":"ProChem","h":"#176B3A","c":false},{"n":"Shamrock","g":"ProChem","h":"#169447","c":false},{"n":"Meadow","g":"ProChem","h":"#5DAA55","c":false},{"n":"Fern","g":"ProChem","h":"#4C7A43","c":false},{"n":"Aquatic Green","g":"ProChem","h":"#169B83","c":false},{"n":"Lavender","g":"ProChem","h":"#A486C7","c":false},{"n":"Concord","g":"ProChem","h":"#4D276E","c":false},{"n":"Iris","g":"ProChem","h":"#6840A5","c":false},{"n":"Orchid","g":"ProChem","h":"#A24AA5","c":false},{"n":"Pansy","g":"ProChem","h":"#59328C","c":false},{"n":"Lilac","g":"ProChem","h":"#BB8DC9","c":false},{"n":"Neon Royal Purple","g":"ProChem","h":"#621187","c":false,"i":1,"alias":"ProChem Neon Royal Purple"},{"n":"UV Blast Blaze Orange","g":"My Inventory","h":"#FF7E26","c":false,"i":1},{"n":"UV Blast Red","g":"My Inventory","h":"#EC1B24","c":false,"i":1},{"n":"UV Blast Green","g":"My Inventory","h":"#C3FF0C","c":false,"i":1},{"n":"UV Blast Clear","g":"My Inventory","h":"#F7FFF4","c":true,"i":1},{"n":"iDye Poly Blue","g":"My Inventory","h":"#1B1866","c":false,"i":1},{"n":"iDye Poly Crimson","g":"My Inventory","h":"#972738","c":false,"i":1},{"n":"iDye Poly Onyx","g":"My Inventory","h":"#000000","c":false,"i":1}];
/*DYES-END*/
