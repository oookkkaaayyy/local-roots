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
// 4 layering vs blending, base-color dependence (documented dye-forum behavior)
{const L=(base,a,b,fam="star")=>P(base,[{name:a,s:1,b:0},{name:b,s:1,b:1}],fam).hex,B=(base,a,b)=>P(base,it([a,.5],[b,.5])).hex;
 const ry=P("#E5C100",it(["iDye Poly Crimson",1])).hex;ok(hsl(ry)[0]<20||hsl(ry)[0]>340,"red dye overpowers yellow plastic "+ry);
 const by=P("#E5C100",it(["iDye Poly Blue",1])).hex;ok(Ls(by)<45,"blue on yellow plastic dark green/gray "+by);
 const o1=L(star,"Aqua","Bright Yellow"),o2=L(star,"Bright Yellow","Aqua");ok(de2(o1,o2)<1.5,"layer order does not matter "+o1+" "+o2);
 const cr=P(star,it(["Crimson",1])).hex,co=P(star,[{name:"Neon Lemon Zest",s:1,b:0},{name:"UV Blast Blaze Orange",s:1,b:1},{name:"Crimson",s:1,b:2}]).hex;ok(de2(cr,co)<12,"crimson overwrites orange and lemon "+cr+" "+co);
 const bk=P("#E8731C",[{name:"Neon Lemon Zest",s:1,b:0},{name:"Black",s:1,b:1}]).hex;ok(Ls(bk)<22,"black overwrites "+bk);
 ok(de2(B(star,"Aqua","Bright Yellow"),o1)>2,"blend differs from layering");
 ok(de2(L(star,"Aqua","Bright Yellow"),L("#2A6FD0","Aqua","Bright Yellow"))>12,"plastic color changes layered result");
 const zo=L("#E8731C","Neon Lemon Zest","UV Blast Blaze Orange");ok(hsl(zo)[0]>10&&hsl(zo)[0]<55,"zest then orange stays warm yellow-orange "+zo);
 {const g=P("#F7E331",it(["Caribbean",1])).hex;ok(hsl(g)[0]>100&&hsl(g)[0]<200&&Ls(g)>30&&Ls(g)<80,"teal-blue dye on yellow plastic reads green, not black "+g);}
}

{ // dgcoursereview 148993: red dye on green Star reads red, black stays near black
  const r=P("#3f9a4a",[{name:"Crimson",s:1,b:0}]).hex,k=P("#3f9a4a",[{name:"Black",s:1,b:0}]).hex;
  const c=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));const[a,g,b]=c(r),[kr,kg,kb]=c(k);
  ok(a>g*1.4&&a>b*1.4,"red on green Star reads red");ok(Math.max(kr,kg,kb)<60,"black on green Star is dark");
}
{ // Google Images, Tri-Fox neon yellow with red dye lines (sampled about #9d2711)
  const e=de2(P("#E6F23A",[{name:"Fire Red",s:1,b:0}]).hex,"#9d2711");ok(e<14,"red on neon yellow near photo dE2000 "+e.toFixed(1));
}
{ // invariant sweep: layering two non-fluorescent dyes is order independent and never lighter than both alone
  const bs=["#F4F2E8","#F7E331","#59A9DE","#57A768","#2B2B2E"],nm=Object.keys(DE.CAT).filter(k=>!((DE.CAT[k].phi||0)>.05));
  const Lm=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));return .2126*c[0]+.7152*c[1]+.0722*c[2]};
  let o=0,l=0,n=0;
  for(let i=0;i<nm.length;i+=2)for(let j=i+1;j<nm.length;j+=3)for(const b of bs)for(const f of ["star","champion"]){
   const A={name:nm[i],s:1,b:0},B={name:nm[j],s:1,b:1},ab=P(b,[A,B],f).hex,ba=P(b,[{...A,b:1},{...B,b:0}],f).hex,a=P(b,[A],f).hex,c=P(b,[B],f).hex;n++;
   if(ab!==ba)o++;if(Lm(ab)>Math.min(Lm(a),Lm(c))+.03)l++}
  ok(o===0,"sweep order independent ("+n+" pairs)");ok(l===0,"sweep layered not lighter than both ("+l+")");
}
{ // dgcoursereview 134835: iDye Poly blue and purple on orange Star came out gray/black and maroon; same dyes stay true on light blue
  const o="#E8661C",lb="#8EC5E6",bl=P(o,[{name:"iDye Poly Blue",s:1,b:0}]).hex,pu=P(o,[{name:"Concord",s:1,b:0}]).hex,blL=P(lb,[{name:"iDye Poly Blue",s:1,b:0}]).hex;
  ok(Ls(bl)<22&&Cs(bl)<25,"blue on orange Star is dark gray "+bl);
  const h=hsl(pu);ok(Ls(pu)<30&&(h[0]<30||h[0]>330),"purple on orange Star is maroon "+pu);
  const hb=hsl(blL);ok(hb[0]>205&&hb[0]<260,"blue on light blue stays blue "+blL);
}
{ // public-dataset evaluation (research/dataset/observations.json): direction-of-shift cases and fit quality
  const {evaluate}=await import("./eval_dataset.mjs"),R=evaluate();
  ok(R.direction.pass===R.direction.n,"dataset direction cases "+R.direction.pass+"/"+R.direction.n+" "+R.direction.rows.filter(r=>!r.ok).map(r=>r.id));
  ok(R.uv.pass===R.uv.n,"UV365 emission hue classes "+R.uv.pass+"/"+R.uv.n+" "+R.uv.rows.filter(r=>!r.ok).map(r=>r.dye+" "+r.hex));
  ok(R.films.mean<1.5&&R.anchors.mean<7,"dataset fit films "+R.films.mean+" anchors "+R.anchors.mean);
}
{ // plastic-aware uptake (wiki ratings) and translucent default transmission
  const base="#F4F2E8",dx=DE.predict({baseHex:base,plastic:"dx",items:it(["iDye Poly Blue",1])}).hex,st=DE.predict({baseHex:base,plastic:"star",items:it(["iDye Poly Blue",1])}).hex;
  ok(Ls(dx)>Ls(st)+2,"DX takes less dye than Star "+dx+" "+st);
  ok(Object.keys(DE.PLASTICS).length>=35&&DE.plasticOf("k3").up<DE.plasticOf("k1").up&&DE.plasticOf("cline").fam==="champion","plastic table covers wiki ratings");
  ok(DE.plasticOf("star").up===1&&DE.plasticOf("champion").up===1&&DE.plasticOf("fuzion").fam==="champion"&&DE.plasticOf("dx").up<DE.plasticOf("echostar").up,"plastic table families and uptake order");
  const th=DE.predict({baseHex:"#F7E331",family:"champion",path:.5,items:it(["iDye Poly Blue",.05])});
  ok(th.hex!==undefined&&hsl(th.hex)[0]<260&&hsl(th.hex)[0]>150||Ls(th.hex)<25,"thin blue on yellow Champion is not violet "+th.hex);
  const ev=DE.predict({baseHex:champ,family:"champion",items:it(["iDye Poly Blue",1],["Crimson",1])}).evidence;ok(ev.includes("translucent multi-dye"),"evidence flag for Champion two-dye");
}
{ // fluorescent emission priors: pink/red dyes must not emit at the violet end; UV365 pink glows warm, blue glows blue
  for(const n of["Hot Pink UV Blast","Flo Red UV Blast","Fluorescent Pink","Neon Cerise Pink"])ok((DE.CAT[n].uvem||DE.CAT[n].em)[0]>=590,"UV emission band of "+n+" "+(DE.CAT[n].uvem||DE.CAT[n].em)[0]);
  ok((DE.CAT["Blue UV Blast"].uvem||DE.CAT["Blue UV Blast"].em)[0]<490&&Ls(DE.uv365({baseHex:star,family:"star",items:it(["Blue UV Blast",1])}))>20,"blue UV Blast glows blue under UV365");
}
{ // practitioner-rule flags
  const e1=DE.predict({baseHex:star,plastic:"dx",items:it(["iDye Poly Blue",1])}).evidence,e2=DE.predict({baseHex:"#2B2B2E",family:"star",items:it(["iDye Poly Blue",1])}).evidence,e3=DE.predict({baseHex:star,family:"star",items:it(["Onyx",1])}).evidence;
  ok(e1.includes("low-uptake plastic")&&e2.includes("dark base")&&e3.includes("black dye hue varies"),"forum-rule evidence flags "+[e1,e2,e3].join("|"));
  const {evaluate}=await import("./eval_dataset.mjs"),R=evaluate();ok(R.champRimBase.median<R.champRimNoModel.median-1,"Champion rim model beats plate-as-rim on 330 photos "+R.champRimBase.median+" vs "+R.champRimNoModel.median);
}
{ // blending-model evidence (research/mixing/*.json, regenerate with fit_mixing.py / fit_mixing_lodo.py): KM additive K/S must beat Beer-Lambert and RGB subtractive on held-out mixes
  const fs=await import("node:fs"),cv=JSON.parse(fs.readFileSync(new URL("../research/mixing/cv_results.json",import.meta.url),"utf8")),lo=JSON.parse(fs.readFileSync(new URL("../research/mixing/lodo_results.json",import.meta.url),"utf8"));
  for(const c of["polyester","cotton"])ok(cv[c].km.kfold.mean<cv[c].bl.kfold.mean-1&&cv[c].km.kfold.mean<cv[c].rgb.kfold.mean-1,"KM additive wins "+c);
  ok(lo.km.mean<lo.bl.mean&&lo.km.mean<lo.rgb.mean&&lo.km.mean<lo.geo.mean,"KM additive wins leave-one-dye-out");
  const src=fs.readFileSync(new URL("../src/engine.src.js",import.meta.url),"utf8");ok(/ks=kb\+tau\[i\]\/Sx/.test(src),"engine opaque path adds dye K/S to the base K/S (KM additive)");
}
console.log(`tests: ${pass} passed, ${fail} failed`);process.exit(fail?1:0);
