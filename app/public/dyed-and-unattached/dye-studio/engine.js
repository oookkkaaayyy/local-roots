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
  champion:{Sx:.35,cmax:1.0,rim:.12,tr:1,kS:.55,kT:1.5,pw:.75,gT:1.38,w:{outdoor:{plate:1,shoulder:.75,rim:.5},surface:{plate:.09,shoulder:.04,rim:.04},backlit:{plate:1,shoulder:.95,rim:.8}}}
 };
 const famOf=o=>/champion/.test(o||"")?"champion":"star";
 const absorb=(d,k)=>{const A=new Array(N).fill(0);if(!d)return A;for(const [mu,sg,a] of d.b)for(let i=0;i<N;i++)A[i]+=a*gau(lam[i],mu,sg);for(let i=0;i<N;i++)A[i]*=k;return A};
 // Effective per-dye concentration (relative to full single-dye film). Langmuir competition.
 function conc(items){
  const K=items.map(it=>(CAT[it.name]?.aff)??1);
  let tot=0;items.forEach((it,i)=>{tot+=K[i]*it.s});
  return items.map((it,i)=>{const solo=it.s*(1+K[i])/(1+K[i]*it.s);return tot>0?solo*(1+K[i]*it.s)/(1+tot):0});
 }
 const merge=items=>{const m=new Map();for(const it of items)m.set(it.name,(m.get(it.name)||0)+it.s);return[...m].map(([name,s])=>({name,s}))};
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
   let abs=0;for(let j=0;j<N;j++)abs+=(1-Math.exp(-2*tauTotal[j]))*share[j]*SP.d65w[j];
   const norm=d.em?(()=>{let s=0;for(let j=0;j<N;j++)s+=gau(lam[j],d.em[0],d.em[1]);return s})():1;
   for(let j=0;j<N;j++)em[j]+=qf*d.phi*abs*gau(lam[j],d.em[0],d.em[1])/norm/SP.d65w[j];
  });
  return em;
 }
 const baseSpec=h=>SP.spec(h);
 function opaque(baseHex,items,fam,opt){
  const P=PRM[fam]||PRM.star,tau=tauOf(items,opt?.mult);
  let R=kmLayer(baseSpec(baseHex),tau,P.Sx);
  if(!opt?.noFluor){const f=fluor(items,tau,opt);R=R.map((v,i)=>v+f[i])}
  return R;
 }
 function translucent(baseHex,transHex,items,fam,scene,zone,path,opt){
  const P=PRM.champion,tau=tauOf(items,opt?.mult);
  const Rs=kmLayer(baseSpec(baseHex),tau.map(v=>v*P.kS),P.Sx);
  const T0=baseSpec(transHex),T=T0.map((v,i)=>Math.min(1.4,v*Math.exp(-2*tau[i]*P.kT*Math.pow(path,P.pw))*P.gT));
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
 function present(s){
  const l=SP.toLin(s),over=Math.max(0,...l)-1,under=Math.min(0,...l);
  let m=Math.max(1,...l);const lin=l.map(v=>Math.max(0,v)/ (m>1?1:1));
  const hex=SP.linHex(l.map(v=>Math.min(1,Math.max(0,v))));
  return{hex,lin:l,gamutExcess:Math.max(over,-under)};
 }
 // ---------- seeded Monte Carlo ----------
 const rng=seed=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
 const gaussRand=r=>{const u=Math.max(1e-9,r()),v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};
 // spec: {baseHex,transHex,family,scene,zone,path,items:[{name,s}]}
 function render(spec,opt){
  spec={...spec,items:merge(spec.items)};
  const fam=famOf(spec.family);
  const R=fam==="champion"?translucent(spec.baseHex,spec.transHex||spec.baseHex,spec.items,fam,spec.scene||"outdoor",spec.zone||"plate",spec.path??.5,opt)
                           :opaque(spec.baseHex,spec.items,fam,opt);
  return R;
 }
 function predict(spec,opt={}){
  const R=render(spec,opt);let out=present(R);
  const P=PRM[famOf(spec.family)];
  if(spec.zone==="rim"||spec.rim){const k=P.rim*(spec.items.length?1:0);if(k){out={...out,hex:SP.linHex(SP.toLin(R).map(v=>Math.min(1,Math.max(0,v*(1-k)))))}}}
  if(opt.mc){
   const r=rng(opt.seed||7),n=opt.mc,labs=[];
   for(let m=0;m<n;m++){
    const items=spec.items.map(it=>({name:it.name,s:Math.max(0,it.s*Math.exp(gaussRand(r)*((CAT[it.name]?.sd)??.15)))}));
    const Pm=PRM[famOf(spec.family)],sx=Pm.Sx;Pm.Sx=sx*Math.exp(gaussRand(r)*.15);
    const Rm=render({...spec,items},opt);Pm.Sx=sx;labs.push(labOf(SP.toLin(Rm).map(v=>Math.min(1,Math.max(0,v)))));
   }
   const c=labOf(out.lin.map(v=>Math.min(1,Math.max(0,v)))),d=labs.map(l=>de2000(c,l)).sort((a,b)=>a-b);
   out.spread=d[Math.floor(.9*(d.length-1))];out.lo=labs.reduce((a,l)=>l[0]<a[0]?l:a);out.hi=labs.reduce((a,l)=>l[0]>a[0]?l:a);
  }
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
   const l=SP.toLin(em.map(v=>v*d.phi*sh*2.4));for(let k=0;k<3;k++)rgb[k]+=l[k];});
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
 return{CAT,PRM,famOf,absorb,conc,tauOf,kmLayer,fluor,render,predict,uv365,glow,recipe,labOf,labOfSpec,de2000,hexLab,dEhex,present,rng,gaussRand,gau,lam};
})();
/*ENGINE-END*/

/*CATALOG-BEGIN*/
Object.assign(DE.CAT,{"Clear UV Blast":{"b":[],"phi":0.45,"em":[445,28],"aff":0.2,"sd":0.2,"uvAbs":1},"Blue UV Blast":{"b":[[610.851,32.327,16.919],[542.396,16,17.902]],"phi":0.136,"aff":1,"sd":0.18,"em":[475,22]},"Flo Red UV Blast":{"b":[[542.213,21.791,24],[462.023,43.752,24]],"phi":0.261,"aff":1,"sd":0.08,"em":[690,22]},"Green UV Blast":{"b":[[520,95,2.717],[433.032,21.347,3.869]],"phi":0.847,"aff":1,"sd":0.08,"em":[555,22]},"Hot Pink UV Blast":{"b":[[507.774,27.386,19.371],[549.597,18.072,15.528]],"phi":0.074,"aff":1,"sd":0.18,"em":[430,22]},"Flo Orange / Blaze Orange UV":{"b":[[481.691,38.445,14],[459.194,48.795,14]],"phi":0.624,"aff":1,"sd":0.08,"em":[605,22]},"Purple UV Blast":{"b":[[537.829,27.991,11.6],[576.383,40.904,10.166]],"phi":0.044,"aff":1,"sd":0.18,"em":[430,22]},"Chartreuse / Yellow":{"b":[[530,95,1.096],[442.442,20.861,4.989]],"phi":0.85,"aff":1,"sd":0.18,"em":[565,22]},"Black":{"b":[[390,260,40],[687.298,260,40],[390,260,40]],"phi":0,"aff":1.6,"sd":0.18},"Pumpkin Brown":{"b":[[460.227,16,35.177],[410.426,95,33.521]],"phi":0,"aff":1,"sd":0.18},"Watermelon":{"b":[[494.94,41.707,12.365],[551.347,18.957,9.12]],"phi":0,"aff":1,"sd":0.18},"Rind Green":{"b":[[451.651,28.847,18.071],[604.94,34.028,10.028]],"phi":0,"aff":1,"sd":0.18},"Blue":{"b":[[599.343,44.02,40],[654.732,95,40]],"phi":0,"aff":1.6,"sd":0.08},"Crimson":{"b":[[473.095,56.664,23.852],[534.729,34.74,32.212]],"phi":0,"aff":1.6,"sd":0.08},"Onyx":{"b":[[390,260,40],[529.168,260,40],[589.667,16,32.429]],"phi":0,"aff":1.6,"sd":0.08},"Neon Lemon Zest":{"b":[[530,95,1.093],[440.199,21.959,5.047]],"phi":0.85,"aff":1,"sd":0.18,"em":[565,22]},"Dandelion":{"b":[[450.757,40.144,14],[647.157,16,4.529]],"phi":0,"aff":1,"sd":0.18},"Bright Yellow":{"b":[[457.383,32.072,13.713],[720,47.665,3.588]],"phi":0,"aff":1,"sd":0.18},"Sun Yellow":{"b":[[451.414,41.748,14],[653.568,22.501,1.779]],"phi":0,"aff":1,"sd":0.18},"Buttercup":{"b":[[445.93,37.1,5.235],[596.566,57.042,0.306]],"phi":0,"aff":1,"sd":0.18},"Deep Orange":{"b":[[471.787,49.106,24],[390,74.423,24]],"phi":0,"aff":1,"sd":0.18},"Neon Hot Orange":{"b":[[479.061,45.126,24],[390,70.414,24]],"phi":0.306,"aff":1,"sd":0.18,"em":[605,22]},"Creamsicle":{"b":[[454.244,55.384,8.477],[701.809,55.171,0.429]],"phi":0,"aff":1,"sd":0.18},"Clear Orange":{"b":[[451.756,37.323,14],[439.933,63.461,14]],"phi":0,"aff":1,"sd":0.18},"Fluorescent Pink":{"b":[[500.921,48.266,3.552]],"phi":0.062,"aff":1,"sd":0.18,"em":[430,22]},"Cherry":{"b":[[546.099,29.249,24],[468.907,42.649,21.984]],"phi":0,"aff":1,"sd":0.18},"Fuchsia":{"b":[[539.684,25.684,10.096],[517.59,37.505,14.617]],"phi":0,"aff":1,"sd":0.18},"Wineberry":{"b":[[541.695,37.85,32.178],[487.968,63.269,13.983]],"phi":0,"aff":1,"sd":0.18},"Flame Scarlet":{"b":[[453.052,46.917,24],[519.515,31.149,24]],"phi":0,"aff":1,"sd":0.18},"Pinkish Red":{"b":[[490.7,42.143,10.569],[553.374,19.754,8.188]],"phi":0,"aff":1,"sd":0.18},"Radical Red":{"b":[[484.528,37.065,24],[561.406,16,21.853]],"phi":0,"aff":1,"sd":0.18},"Fire Red":{"b":[[456.635,50.255,24],[515.272,34.939,24]],"phi":0,"aff":1,"sd":0.18},"Blood Red":{"b":[[493.67,50.805,40],[491.077,49.668,39.31]],"phi":0,"aff":1,"sd":0.18},"Neon Cerise Pink":{"b":[[523.509,34.34,12.898]],"phi":0.066,"aff":1,"sd":0.18,"em":[430,22]},"Shark Blue":{"b":[[390,74.617,1.075],[610.808,47.998,12.15]],"phi":0,"aff":1,"sd":0.18},"Caribbean":{"b":[[436.731,26.255,1.043],[611.8,46.232,5.518]],"phi":0,"aff":1,"sd":0.18},"Aqua":{"b":[[425.525,24.074,1.48],[635.346,52.557,3.821]],"phi":0,"aff":1,"sd":0.18},"Sonic Blue":{"b":[[637.443,91.837,2.228],[605.011,41.051,17.001]],"phi":0,"aff":1,"sd":0.18},"Royal":{"b":[[630.322,92.679,9.211],[626.56,53.731,40]],"phi":0,"aff":1,"sd":0.18},"Navy":{"b":[[610.562,95,40],[618.415,39.868,33.812]],"phi":0,"aff":1,"sd":0.18},"Sky Blue":{"b":[[608.325,44.612,4.29],[462.489,37.043,0.245]],"phi":0,"aff":1,"sd":0.18},"Pale Turquoise":{"b":[[435.784,53.438,0.441],[658.312,56.03,2.194]],"phi":0,"aff":1,"sd":0.18},"Flag Blue":{"b":[[666.832,95,13.477],[601.759,33.515,25.179]],"phi":0,"aff":1,"sd":0.18},"Bright Blue":{"b":[[598.771,41.995,14.588],[390,70.717,0.512]],"phi":0,"aff":1,"sd":0.18},"Teal Blue":{"b":[[441.852,24.013,3.801],[617.423,54.583,11.38]],"phi":0,"aff":1,"sd":0.18},"Espresso Bean":{"b":[[430.256,95,23.016],[476.507,95,24.483]],"phi":0,"aff":1,"sd":0.18},"Chocolate":{"b":[[437.217,95,37.732],[390,71.348,6.556]],"phi":0,"aff":1,"sd":0.18},"Burnt Sienna":{"b":[[475.675,58.25,8.005],[432.549,82.452,22.377]],"phi":0,"aff":1,"sd":0.18},"Dark Dungeon":{"b":[[398.889,60.411,8.404],[567.005,115.34,11.812],[578.11,109.053,11.983]],"phi":0,"aff":1,"sd":0.18},"Light Gray":{"b":[[497.709,87.722,1.185],[615.983,30.574,1.042]],"phi":0,"aff":1,"sd":0.18},"Cool Black":{"b":[[390,165.18,22.691],[617.226,64.969,40],[627.811,181.253,40]],"phi":0,"aff":1.6,"sd":0.18},"Neon Key Lime":{"b":[[433.022,19.989,2.828],[515,95,2.174]],"phi":0.586,"aff":1,"sd":0.18,"em":[550,22]},"Evergreen":{"b":[[446.177,35.486,24],[617.213,38.226,24]],"phi":0,"aff":1,"sd":0.18},"Shamrock":{"b":[[431.408,37.714,18.358],[620.431,34.959,14.349]],"phi":0,"aff":1,"sd":0.18},"Meadow":{"b":[[451.167,34.139,9.985],[619.348,32.34,6.674]],"phi":0,"aff":1,"sd":0.18},"Fern":{"b":[[454.98,32.22,18.379],[611.47,39.576,10.42]],"phi":0,"aff":1,"sd":0.18},"Aquatic Green":{"b":[[435.714,31.194,4.616],[607.637,41.147,7.61]],"phi":0,"aff":1,"sd":0.18},"Lavender":{"b":[[556.178,59.603,2.752]],"phi":0,"aff":1,"sd":0.18},"Concord":{"b":[[554.026,55.182,25.499]],"phi":0,"aff":1,"sd":0.18},"Iris":{"b":[[562.822,51.894,13.738]],"phi":0,"aff":1,"sd":0.18},"Orchid":{"b":[[539.08,44.833,9.743]],"phi":0,"aff":1,"sd":0.18},"Pansy":{"b":[[560.796,53.542,20.602]],"phi":0,"aff":1,"sd":0.18},"Lilac":{"b":[[545.602,56.124,2.295]],"phi":0,"aff":1,"sd":0.18},"Neon Royal Purple":{"b":[[549.764,44.144,37.537]],"phi":0.038,"aff":1,"sd":0.18,"em":[430,22]},"UV Blast Blaze Orange":{"b":[[481.691,38.445,14],[459.194,48.795,14]],"phi":0.624,"aff":1,"sd":0.08,"em":[605,22]},"UV Blast Red":{"b":[[542.213,21.791,24],[462.023,43.752,24]],"phi":0.261,"aff":1,"sd":0.08,"em":[690,22]},"UV Blast Green":{"b":[[520,95,2.717],[433.032,21.347,3.869]],"phi":0.847,"aff":1,"sd":0.08,"em":[555,22]},"UV Blast Clear":{"b":[],"phi":0.45,"em":[445,28],"aff":0.2,"sd":0.2,"uvAbs":1},"iDye Poly Blue":{"b":[[599.343,44.02,40],[654.732,95,40]],"phi":0,"aff":1.6,"sd":0.08},"iDye Poly Crimson":{"b":[[473.095,56.664,23.852],[534.729,34.74,32.212]],"phi":0,"aff":1.6,"sd":0.08},"iDye Poly Onyx":{"b":[[390,260,40],[529.168,260,40],[589.667,16,32.429]],"phi":0,"aff":1.6,"sd":0.08},"ProChem Neon Lemon Zest":{"b":[[530,95,1.093],[440.199,21.959,5.047]],"phi":0.85,"aff":1,"sd":0.18,"em":[565,22]},"ProChem Neon Hot Orange":{"b":[[479.061,45.126,24],[390,70.414,24]],"phi":0.306,"aff":1,"sd":0.18,"em":[605,22]},"ProChem Fluorescent Pink":{"b":[[500.921,48.266,3.552]],"phi":0.062,"aff":1,"sd":0.18,"em":[430,22]},"ProChem Neon Cerise Pink":{"b":[[523.509,34.34,12.898]],"phi":0.066,"aff":1,"sd":0.18,"em":[430,22]},"ProChem Neon Key Lime":{"b":[[433.022,19.989,2.828],[515,95,2.174]],"phi":0.586,"aff":1,"sd":0.18,"em":[550,22]},"ProChem Neon Royal Purple":{"b":[[549.764,44.144,37.537]],"phi":0.038,"aff":1,"sd":0.18,"em":[430,22]}});
Object.assign(DE.PRM.champion,{"kS":0.36676351042734234,"kT":5.2392546639513755,"pw":0.47399842038508144,"gT":2.5082540315767936});
DE.PRM.tq=3;
/*CATALOG-END*/

/*DYES-BEGIN*/
const DYELIST=[{"n":"Blue UV Blast","g":"UV Blast / Quick-Coat","h":"#005BFF","c":false},{"n":"Hot Pink UV Blast","g":"UV Blast / Quick-Coat","h":"#FF2A9D","c":false},{"n":"Purple UV Blast","g":"UV Blast / Quick-Coat","h":"#7A19D8","c":false},{"n":"Chartreuse / Yellow","g":"UV Blast / Quick-Coat","h":"#D9FF00","c":false},{"n":"Black","g":"UV Blast / Quick-Coat","h":"#111111","c":false},{"n":"Pumpkin Brown","g":"UV Blast / Quick-Coat","h":"#8A4B20","c":false},{"n":"Watermelon","g":"UV Blast / Quick-Coat","h":"#E84765","c":false},{"n":"Rind Green","g":"UV Blast / Quick-Coat","h":"#438B45","c":false},{"n":"Neon Lemon Zest","g":"ProChem","h":"#DEFD02","c":false,"i":1,"alias":"ProChem Neon Lemon Zest"},{"n":"Dandelion","g":"ProChem","h":"#F2BF13","c":false},{"n":"Bright Yellow","g":"ProChem","h":"#FFD629","c":false},{"n":"Sun Yellow","g":"ProChem","h":"#F6B51B","c":false},{"n":"Buttercup","g":"ProChem","h":"#F5D46A","c":false},{"n":"Deep Orange","g":"ProChem","h":"#D94C13","c":false},{"n":"Neon Hot Orange","g":"ProChem","h":"#E75001","c":false,"i":1,"alias":"ProChem Neon Hot Orange"},{"n":"Creamsicle","g":"ProChem","h":"#F39454","c":false},{"n":"Clear Orange","g":"ProChem","h":"#EF7622","c":false},{"n":"Fluorescent Pink","g":"ProChem","h":"#F88DA5","c":false,"i":1,"alias":"ProChem Fluorescent Pink"},{"n":"Cherry","g":"ProChem","h":"#B51E3A","c":false},{"n":"Fuchsia","g":"ProChem","h":"#D22A8A","c":false},{"n":"Wineberry","g":"ProChem","h":"#762448","c":false},{"n":"Flame Scarlet","g":"ProChem","h":"#E8392C","c":false},{"n":"Pinkish Red","g":"ProChem","h":"#E94D66","c":false},{"n":"Radical Red","g":"ProChem","h":"#E92045","c":false},{"n":"Fire Red","g":"ProChem","h":"#D92524","c":false},{"n":"Blood Red","g":"ProChem","h":"#8B121B","c":false},{"n":"Neon Cerise Pink","g":"ProChem","h":"#E544AB","c":false,"i":1,"alias":"ProChem Neon Cerise Pink"},{"n":"Shark Blue","g":"ProChem","h":"#2379B8","c":false},{"n":"Caribbean","g":"ProChem","h":"#18A7C1","c":false},{"n":"Aqua","g":"ProChem","h":"#29C9C7","c":false},{"n":"Sonic Blue","g":"ProChem","h":"#2665D8","c":false},{"n":"Royal","g":"ProChem","h":"#243A9A","c":false},{"n":"Navy","g":"ProChem","h":"#17254F","c":false},{"n":"Sky Blue","g":"ProChem","h":"#55A9E6","c":false},{"n":"Pale Turquoise","g":"ProChem","h":"#8ADFD7","c":false},{"n":"Flag Blue","g":"ProChem","h":"#164EAE","c":false},{"n":"Bright Blue","g":"ProChem","h":"#176FD1","c":false},{"n":"Teal Blue","g":"ProChem","h":"#147D88","c":false},{"n":"Espresso Bean","g":"ProChem","h":"#4D2B21","c":false},{"n":"Chocolate","g":"ProChem","h":"#6B3B27","c":false},{"n":"Burnt Sienna","g":"ProChem","h":"#9A4A2F","c":false},{"n":"Dark Dungeon","g":"ProChem","h":"#343238","c":false},{"n":"Light Gray","g":"ProChem","h":"#A9ADB2","c":false},{"n":"Cool Black","g":"ProChem","h":"#161B23","c":false},{"n":"Neon Key Lime","g":"ProChem","h":"#01FE0F","c":false,"i":1,"alias":"ProChem Neon Key Lime"},{"n":"Evergreen","g":"ProChem","h":"#176B3A","c":false},{"n":"Shamrock","g":"ProChem","h":"#169447","c":false},{"n":"Meadow","g":"ProChem","h":"#5DAA55","c":false},{"n":"Fern","g":"ProChem","h":"#4C7A43","c":false},{"n":"Aquatic Green","g":"ProChem","h":"#169B83","c":false},{"n":"Lavender","g":"ProChem","h":"#A486C7","c":false},{"n":"Concord","g":"ProChem","h":"#4D276E","c":false},{"n":"Iris","g":"ProChem","h":"#6840A5","c":false},{"n":"Orchid","g":"ProChem","h":"#A24AA5","c":false},{"n":"Pansy","g":"ProChem","h":"#59328C","c":false},{"n":"Lilac","g":"ProChem","h":"#BB8DC9","c":false},{"n":"Neon Royal Purple","g":"ProChem","h":"#621187","c":false,"i":1,"alias":"ProChem Neon Royal Purple"},{"n":"UV Blast Blaze Orange","g":"My Inventory","h":"#FF7E26","c":false,"i":1},{"n":"UV Blast Red","g":"My Inventory","h":"#EC1B24","c":false,"i":1},{"n":"UV Blast Green","g":"My Inventory","h":"#C3FF0C","c":false,"i":1},{"n":"UV Blast Clear","g":"My Inventory","h":"#F7FFF4","c":true,"i":1},{"n":"iDye Poly Blue","g":"My Inventory","h":"#1B1866","c":false,"i":1},{"n":"iDye Poly Crimson","g":"My Inventory","h":"#972738","c":false,"i":1},{"n":"iDye Poly Onyx","g":"My Inventory","h":"#000000","c":false,"i":1}];
/*DYES-END*/
