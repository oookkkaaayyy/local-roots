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
