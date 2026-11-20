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
<<<<<<< Updated upstream
 function conc(items){
  const K=items.map(it=>(CAT[it.name]?.aff)??1);
  let tot=0;items.forEach((it,i)=>{tot+=K[i]*it.s});
  return items.map((it,i)=>{const solo=it.s*(1+K[i])/(1+K[i]*it.s);return tot>0?solo*(1+K[i]*it.s)/(1+tot):0});
=======
 // Uptake. Disperse dye sorption on polyolefin is near-linear until the plastic saturates, so loads add and the
 // total is soft-capped by one shared Langmuir-type curve G (K = load-weighted affinity). A single dye reproduces
 // the solo curve. Dyes in one bath (blend) split their bath's deposit in proportion to affinity x strength;
 // later baths (layers, item.b) only add the increment left under the shared cap, so order matters.
 const Gc=(x,K)=>x<=0?0:x*(1+K)/(1+K*x);
 function conc(items){
  const out=new Array(items.length).fill(0),bs=[...new Set(items.map(it=>it.b||0))].sort((x,y)=>x-y);
  let X=0,KX=0,Cprev=0;
  for(const b of bs){
   const idx=items.map((it,i)=>i).filter(i=>(items[i].b||0)===b);
   let dx=0,dkx=0,w=0;idx.forEach(i=>{const K=(CAT[items[i].name]?.aff)??1;dx+=items[i].s;dkx+=K*items[i].s;w+=K*items[i].s});
   X+=dx;KX+=dkx;const C=Gc(X,X>0?KX/X:1),dC=Math.max(0,C-Cprev);Cprev=C;
   idx.forEach(i=>{const K=(CAT[items[i].name]?.aff)??1;out[i]=w>0?dC*K*items[i].s/w:0});
  }
  return out;
>>>>>>> Stashed changes
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
 // Saunderson correction for the polymer/air interface (n~1.5: internal diffuse reflectance k2~.6, specular excluded).
 // Base spectra are measured appearance, so they are mapped to internal reflectance first and back after the film model.
 const K2=.6,K1=.04;
 const toInt=R=>R.map(r=>r/((1-K1)*(1-K2)+K2*r));
 const toExt=R=>R.map(r=>(1-K1)*(1-K2)*r/(1-K2*r));
 const baseSpec=h=>SP.spec(h);
 const PHI=.55; // later baths stay in the top fraction of the film; the first bath penetrates fully
 function filmStack(Rb,items,P,mult){
  const bs=[...new Set(items.map(it=>it.b||0))].sort((x,y)=>x-y);
  if(bs.length<2)return kmLayer(Rb,tauOf(items,mult),P.Sx);
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
