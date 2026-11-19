import {load,lab} from "./harness.mjs";
const h=load(),DE=h.DE;let fail=0,pass=0;
const ok=(c,m)=>{if(c){pass++}else{fail++;console.error("FAIL",m)}};
const de2=(a,b)=>DE.dEhex(a,b);
const star="#F4F2E8",champ="#DCE8E1";
const it=(...a)=>a.map(([name,s])=>({name,s}));
const P=(base,items,fam="star",o={})=>DE.predict({baseHex:base,transHex:o.trans,family:fam,scene:o.scene||"outdoor",zone:o.zone||"plate",path:o.path??.5,items},o.opt||{});
const hsl=hex=>{const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,d=mx-mn;let H=0;if(d){H=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;H*=60;if(H<0)H+=360}return[H,d?d/(1-Math.abs(2*l-1)):0,l]};
const Ls=hex=>lab(hex)[0],Cs=hex=>Math.hypot(lab(hex)[1],lab(hex)[2]);
// catalog coverage
for(const d of h.dyes){if(!d[3]&&!DE.CAT[d[1]])ok(false,"catalog missing "+d[1])}
// 1 measured Star film targets
let s=0,n=0;for(const [nm,t] of Object.entries(h.opaqueTargets)){const e=de2(P(star,it([nm,1])).hex,t);s+=e;n++;ok(e<8,`film ${nm} dE2000 ${e.toFixed(1)}`)}
ok(s/n<4,"film mean dE2000 "+(s/n).toFixed(2));
// 2 Champion anchors
{const A=h.hbnfChampionPointAnchors,R={plate:.35,shoulder:.72,rim:.93};let t=0,c=0;
 for(const nm of Object.keys(A.colors))for(const z of["plate","shoulder","rim"]){const e=de2(P(A.surfaceBase,it([nm,1]),"champion",{trans:A.transmissionBase,zone:z,path:h.opticalPathAt(R[z])}).hex,A.colors[nm][z]);t+=e;c++}
 ok(t/c<7,"champion anchors mean dE2000 "+(t/c).toFixed(2))}
// 3 documented lessons
const bl=P(star,it(["iDye Poly Blue",1],["ProChem Neon Key Lime",1])).hex;ok(hsl(bl)[0]>110&&hsl(bl)[0]<220&&hsl(bl)[1]>.2,"blue+lime reads green-cyan "+bl);
const mud=P(star,it(["iDye Poly Blue",1],["ProChem Neon Hot Orange",1])).hex;ok(Ls(mud)<38,"blue+orange dark "+mud);
const mud2=P("#E47B35",it(["ProChem Neon Royal Purple",1],["iDye Poly Blue",1])).hex;ok(Ls(mud2)<32&&Cs(mud2)<60,"colored base + purple + blue dark "+mud2);
const pk=P(star,it(["ProChem Neon Cerise Pink",1],["ProChem Fluorescent Pink",1])).hex;ok(hsl(pk)[1]>.4,"pinks stay vivid "+pk);
const dark=P("#EF822F",it(["iDye Poly Onyx",1]),"champion").hex;ok(Ls(dark)<20,"onyx on orange near black "+dark);
const gp=P("#A5D98C",it(["Hot Pink UV Blast",1])).hex;ok(hsl(gp)[0]>290||hsl(gp)[0]<30,"pink overtakes light green "+gp);
const yp=P(star,it(["Chartreuse / Yellow",1],["ProChem Fluorescent Pink",1])).hex,yy=P(star,it(["Chartreuse / Yellow",1])).hex;ok(Cs(yp)<Cs(yy)+1||Ls(yp)<Ls(yy),"yellow+pink dingier than chartreuse");
// 4 physics invariants over the whole catalog and families
const hexOk=x=>/^#[0-9A-F]{6}$/.test(x);let bad=0,mono=0,cmp=0;
for(const d of h.dyes){if(d[3])continue;for(const fam of["star","champion"]){for(const z of["plate","rim"]){const a=P(fam==="star"?star:champ,it([d[1],.4]),fam,{zone:z,path:z==="rim"?1.2:.5}).hex,b=P(fam==="star"?star:champ,it([d[1],1]),fam,{zone:z,path:z==="rim"?1.2:.5}).hex;
 if(!hexOk(a)||!hexOk(b))bad++;if(Ls(b)>Ls(a)+3&&!/Lemon|Yellow|Dandelion|Sun|Butter|Chartreuse|Key Lime|Green|Lime/.test(d[1])){mono++;console.error("non monotonic",d[1],fam,z,a,b)}}}
 // competition: two copies of the same dye must not exceed single full-strength darkness by much
 const one=P(star,it([d[1],1])).hex,two=P(star,it([d[1],.5],[d[1],.5])).hex;if(de2(one,two)>6){cmp++;console.error("split dye inconsistent",d[1],one,two)}}
ok(bad===0,"bounded outputs "+bad);ok(mono===0,"monotonic strength "+mono);ok(cmp===0,"dye split consistency "+cmp);
// 5 uncertainty
{const r=P(star,it(["iDye Poly Blue",.7],["UV Blast Blaze Orange",.5]),"star",{opt:{mc:40}});ok(r.spread>.5&&r.spread<25,"uncertainty spread "+r.spread);
 const m=P(star,it(["UV Blast Blaze Orange",1]),"star",{opt:{mc:40}}),u=P(star,it(["Fern",1]),"star",{opt:{mc:40}});ok(m.spread<u.spread+1,"measured dye no wider than estimated dye "+m.spread.toFixed(1)+" "+u.spread.toFixed(1))}
// 6 glow and UV
{const sp=d=>({baseHex:"#E7EFC9",family:"star",items:it([d,1])});
 const g0=DE.glow({items:[]}).rel,gr=DE.glow(sp("UV Blast Red")).rel,gl=DE.glow(sp("ProChem Neon Lemon Zest")).rel;
 ok(g0>.99&&gr<.12&&gl>gr*3,`glow filtering undyed ${g0.toFixed(2)} red ${gr.toFixed(2)} lemon ${gl.toFixed(2)}`);
 ok(Ls(DE.uv365(sp("UV Blast Green")))>Ls(DE.uv365(sp("iDye Poly Onyx")))+20,"uv365 fluorescent dye brighter than onyx")}
// 7 recipe inversion
{const truth=P(star,it(["UV Blast Blaze Orange",.8],["iDye Poly Crimson",.3])).hex;
 const rc=DE.recipe(truth,star,"star",["UV Blast Blaze Orange","iDye Poly Crimson","iDye Poly Blue","UV Blast Green","ProChem Neon Hot Orange"],{top:3,maxDyes:2});
 ok(rc[0].dE<2.5,"recipe recovers a known mixture dE "+rc[0].dE.toFixed(2));
 const all=h.dyes.filter(d=>!d[3]).map(d=>d[1]);const big=DE.recipe("#2A8FD6",star,"star",[...new Set(all)],{top:3,maxDyes:2});ok(big[0].dE<12,"recipe for blue from full catalog dE "+big[0].dE.toFixed(1)+" via "+big[0].items.map(i=>i.name).join("+"))}
// 8 stencil styles stay Cricut-viable
{const PS=await import("../src/photo-stencil.mjs"),n=640,px=new Uint8ClampedArray(n*n*4);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const k=(y*n+x)*4,dx=x-n/2,dy=y-n/2,r=Math.hypot(dx,dy),v=r<110?30:r<200?(Math.sin(x/17)*Math.cos(y/23)>0?70:190):225-r/4;px[k]=px[k+1]=px[k+2]=v;px[k+3]=255}
 for(const st of PS.STYLES){let res=null;try{res=PS.buildStencil(px,{style:st,detail:.7,balance:.7})}catch(e){}ok(res&&res.verdict==="PASS"&&res.islands===0,"stencil style "+st+" compiles "+(res?res.verdict:"error"))}}
console.log(`tests: ${pass} passed, ${fail} failed`);process.exit(fail?1:0);
