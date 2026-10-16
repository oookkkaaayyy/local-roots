
"use strict";


const dyes = [
  ["UV Blast / Quick-Coat","Clear UV Blast","#F7FFF4",true],
  ["UV Blast / Quick-Coat","Blue UV Blast","#005BFF"],
  ["UV Blast / Quick-Coat","Flo Red UV Blast","#F51B2B"],
  ["UV Blast / Quick-Coat","Green UV Blast","#37FF14"],
  ["UV Blast / Quick-Coat","Hot Pink UV Blast","#FF2A9D"],
  ["UV Blast / Quick-Coat","Flo Orange / Blaze Orange UV","#FF6A00"],
  ["UV Blast / Quick-Coat","Purple UV Blast","#7A19D8"],
  ["UV Blast / Quick-Coat","Chartreuse / Yellow","#D9FF00"],
  ["UV Blast / Quick-Coat","Black","#111111"],
  ["UV Blast / Quick-Coat","Pumpkin Brown","#8A4B20"],
  ["UV Blast / Quick-Coat","Watermelon","#E84765"],
  ["UV Blast / Quick-Coat","Rind Green","#438B45"],


  ["iDye Poly","Blue","#1B1866"],
  ["iDye Poly","Crimson","#972738"],
  


  ["ProChem","Neon Lemon Zest","#DEFD02"],["ProChem","Dandelion","#F2BF13"],
  ["ProChem","Bright Yellow","#FFD629"],["ProChem","Sun Yellow","#F6B51B"],
  ["ProChem","Buttercup","#F5D46A"],["ProChem","Deep Orange","#D94C13"],
  ["ProChem","Neon Hot Orange","#E75001"],["ProChem","Creamsicle","#F39454"],
  ["ProChem","Clear Orange","#EF7622"],["ProChem","Fluorescent Pink","#F88DA5"],
  ["ProChem","Cherry","#B51E3A"],["ProChem","Fuchsia","#D22A8A"],
  ["ProChem","Wineberry","#762448"],["ProChem","Flame Scarlet","#E8392C"],
  ["ProChem","Pinkish Red","#E94D66"],["ProChem","Radical Red","#E92045"],
  ["ProChem","Fire Red","#D92524"],["ProChem","Blood Red","#8B121B"],
  ["ProChem","Neon Cerise Pink","#E544AB"],["ProChem","Shark Blue","#2379B8"],
  ["ProChem","Caribbean","#18A7C1"],["ProChem","Aqua","#29C9C7"],
  ["ProChem","Sonic Blue","#2665D8"],["ProChem","Royal","#243A9A"],
  ["ProChem","Navy","#17254F"],["ProChem","Sky Blue","#55A9E6"],
  ["ProChem","Pale Turquoise","#8ADFD7"],["ProChem","Flag Blue","#164EAE"],
  ["ProChem","Bright Blue","#176FD1"],["ProChem","Teal Blue","#147D88"],
  ["ProChem","Espresso Bean","#4D2B21"],["ProChem","Chocolate","#6B3B27"],
  ["ProChem","Burnt Sienna","#9A4A2F"],["ProChem","Dark Dungeon","#343238"],
  ["ProChem","Light Gray","#A9ADB2"],["ProChem","ProChem Onyx","#101010"],
  ["ProChem","Cool Black","#161B23"],["ProChem","Neon Key Lime","#01FE0F"],
  ["ProChem","Evergreen","#176B3A"],["ProChem","Shamrock","#169447"],
  ["ProChem","Meadow","#5DAA55"],["ProChem","Fern","#4C7A43"],
  ["ProChem","Aquatic Green","#169B83"],["ProChem","Lavender","#A486C7"],
  ["ProChem","Concord","#4D276E"],["ProChem","Iris","#6840A5"],
  ["ProChem","Orchid","#A24AA5"],["ProChem","Pansy","#59328C"],
  ["ProChem","Lilac","#BB8DC9"],["ProChem","Neon Royal Purple","#621187"],


  ["My Inventory","UV Blast Blaze Orange","#FF7E26"],
  ["My Inventory","UV Blast Red","#EC1B24"],
  ["My Inventory","UV Blast Green","#C3FF0C"],
  ["My Inventory","UV Blast Clear","#F7FFF4",true],
  ["My Inventory","iDye Poly Blue","#1B1866"],
  ["My Inventory","iDye Poly Crimson","#972738"],
  ["My Inventory","ProChem Onyx","#101010"],
  ["My Inventory","ProChem Neon Lemon Zest","#DEFD02"],
  ["My Inventory","ProChem Neon Hot Orange","#E75001"],
  ["My Inventory","ProChem Fluorescent Pink","#F88DA5"],
  ["My Inventory","ProChem Neon Cerise Pink","#E544AB"],
  ["My Inventory","ProChem Neon Key Lime","#01FE0F"],
  ["My Inventory","ProChem Neon Royal Purple","#621187"]
];


const $=id=>document.getElementById(id);
const canvas=$("canvas"),ctx=canvas.getContext("2d");
const paintCanvas=document.createElement("canvas"),paintCtx=paintCanvas.getContext("2d",{willReadFrequently:true});
const PAINT_SIZE=420;paintCanvas.width=paintCanvas.height=PAINT_SIZE;
const GUIDE_RADIUS=1.14;
let W=700,H=700,cx=350,cy=350,R=280,dpr=1;
let activeGroup="My Inventory",layers=[],selected=-1,sample={x:0,y:0},drag=null,renderQueued=false,paintedImage=null;
let profiles=[],calibrationRecords=[],activeProfileId="",appMode="client";
function uid(p="id"){return p+"_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,7)}
function defaults(){return[
{id:"innova_star",name:"Innova Star — opaque premium reference",plastic:"Innova Star",optical:"star",status:"research",base:"#F4F2E8",translucency:4,uptake:1.00,chroma:1.00,glow:0,reliability:.86,note:"Primary opaque-premium reference; strongest general research coverage."},
{id:"innova_champion",name:"Innova Champion — translucent premium reference",plastic:"Innova Champion",optical:"champion",status:"research",base:"#DCE8E1",translucency:78,uptake:.76,chroma:.90,glow:0,reliability:.72,note:"Clear/translucent reference; generally needs more heat or time and remains more base-dependent."},
{id:"innova_gstar",name:"Innova GStar — flexible opaque reference",plastic:"Innova GStar",optical:"gstar",status:"research",base:"#F2F0E6",translucency:3,uptake:1.05,chroma:1.02,glow:0,reliability:.78,note:"Opaque like Star, with flexible blend behavior; community examples show strong worm-dip uptake."},
{id:"innova_proto_glow_star",name:"Innova Proto Glow Star — opaque glow reference",plastic:"Innova Proto Glow Star",optical:"proto-glow-star",status:"research",base:"#E7EFC9",translucency:8,uptake:.95,chroma:.96,glow:1.00,reliability:.67,note:"Opaque Proto Glow family. Daylight color and charged-glow transmission are modeled separately."},
{id:"innova_proto_glow_champion",name:"Innova Proto Glow Champion — translucent glow reference",plastic:"Innova Proto Glow Champion",optical:"proto-glow-champion",status:"research",base:"#DDE8C8",translucency:68,uptake:.80,chroma:.90,glow:1.00,reliability:.64,note:"Translucent Proto Glow family. Community evidence confirms it takes dye, but recipe-specific coverage remains limited."},
{id:"innova_classic_glow_champion",name:"Innova Classic Glow Champion — legacy glow reference",plastic:"Innova Classic Glow Champion",optical:"classic-glow-champion",status:"research",base:"#D9E4C8",translucency:55,uptake:.82,chroma:.91,glow:.72,reliability:.72,note:"Kept separate from Proto Glow because community reports identify them as different blends."},
]}
function migrateProfileId(id){return id==="innova_color_glow_champion"?"innova_classic_glow_champion":id==="innova_halo_star"||id==="innova_pro"||id==="innova_dx"?"innova_star":id}
function allowedProfile(p){return p&&p.id!=="innova_halo_star"&&p.id!=="innova_pro"&&p.id!=="innova_dx"&&!["pro","dx","halo-star"].includes(p.optical)}
function loadDb(){
 try{
  const d=JSON.parse(localStorage.getItem("dyeCalDbV2")||"null");
  const stored=Array.isArray(d?.profiles)?d.profiles:[];
  profiles=stored.length?stored.filter(allowedProfile).map(p=>p.id==="innova_color_glow_champion"?{...p,id:"innova_classic_glow_champion",name:"Innova Classic Glow Champion — legacy glow reference",plastic:"Innova Classic Glow Champion",optical:"classic-glow-champion"}:p):defaults();
  if(!profiles.length)profiles=defaults();
  for(const p of defaults())if(!profiles.some(x=>x.id===p.id))profiles.push(p);
  // Preserve calibration for retired models under its original identity; NEVER relabel DX/Pro/Halo outcomes as Star validation.
  calibrationRecords=Array.isArray(d?.records)?d.records.map(r=>r.profileId==="innova_color_glow_champion"?{...r,profileId:"innova_classic_glow_champion"}:r):[];
 }catch{profiles=defaults();calibrationRecords=[]}
 activeProfileId=profiles[0]?.id||"";
}
function saveDb(){localStorage.setItem("dyeCalDbV2",JSON.stringify({version:1,profiles,records:calibrationRecords}))}
function profile(){return profiles.find(p=>p.id===activeProfileId)||profiles[0]}
function statusLabel(s){const m={research:"Research-informed (unvalidated)",estimate:"Model estimate (unvalidated)",verified:"Controlled measurement",validated:"Locally validated","photo-anchor":"Photo-guided approximation",experimental:"Experimental",unavailable:"Unavailable","base-only":"Base only"};return m[s]||m.experimental}
function methodForDyeLayer(l){return l.method||((l.name||"").toLowerCase().includes("uv blast")?"worm-dip":activeMethod())}
function methodKey(a){return JSON.stringify(a.map(methodForDyeLayer))}
function comboKey(a){return JSON.stringify(a.map(l=>[l.name,l.hex,Number(l.strength),clamp(Math.round(+l.passes||1),1,12),methodForDyeLayer(l)]))}
function activeMethod(){return $("methodSelect")?.value||"acetone-direct"}
function activePassCount(){return clamp(Math.round(+$("passCount")?.value||1),1,12)}
function activeRecipeKey(){return ($("productionRecipeKey")?.value||"").trim()}
function recordFor(a){
  // v1 entries lack process, base color, scene and strength context. Fail closed.
  if(viewMode!=="daylight"||!a.length||isTranslucentProfile(profile())||!activeRecipeKey())return null;
  const base=$("baseHex").value.toUpperCase(),trans=currentTransmissionHex().toUpperCase();
  return calibrationRecords.filter(r=>r.schemaVersion===6&&r.methodsKey===methodKey(a)&&r.profileId===activeProfileId
    &&r.comboKey===comboKey(a)&&r.baseHex===base&&r.transmissionHex===trans
    &&r.daylightScene===daylightScene&&r.processKey===activeRecipeKey()
    &&r.region==="opaque-overall"&&["validated","verified"].includes(r.status)&&Number(r.repeatCount)>=2&&validHex(r.measuredHex)).sort((x,y)=>
      ({verified:3,validated:2,experimental:1}[y.status]||0)-({verified:3,validated:2,experimental:1}[x.status]||0))[0]||null;
}


let viewMode="daylight",daylightScene="outdoor";
const inventoryNames=new Set(dyes.filter(d=>d[0]==="My Inventory").map(d=>d[1]));
const dyeResearch={
 "UV Blast Clear":{factor:0,fluor:.95,uvColor:"#7DEBFF",reliability:.58,note:"UV enhancer; no ordinary daylight tint is assumed."},
 "Clear UV Blast":{factor:0,fluor:.95,uvColor:"#7DEBFF",reliability:.58},
 "UV Blast Blaze Orange":{factor:1.08,fluor:.78,uvColor:"#FF6A00",reliability:.80},
 "Flo Orange / Blaze Orange UV":{factor:1.08,fluor:.78,uvColor:"#FF6A00",reliability:.75},
 "UV Blast Red":{factor:1.02,fluor:.58,uvColor:"#FF2442",reliability:.72},
 "Flo Red UV Blast":{factor:1.02,fluor:.58,uvColor:"#FF2442",reliability:.70},
 "UV Blast Green":{factor:1.04,fluor:1.0,uvColor:"#80FF00",reliability:.82},
 "Green UV Blast":{factor:1.04,fluor:1.0,uvColor:"#80FF00",reliability:.76},
 "Blue UV Blast":{factor:.98,fluor:.68,uvColor:"#2088FF",reliability:.68},
 "Hot Pink UV Blast":{factor:.92,fluor:.92,uvColor:"#FF2AAE",reliability:.66},
 "Purple UV Blast":{factor:.88,fluor:.55,uvColor:"#A83BFF",reliability:.62},
 "Chartreuse / Yellow":{factor:.94,fluor:1.0,uvColor:"#DFFF00",reliability:.74},
 "ProChem Onyx":{factor:1.28,fluor:0,reliability:.70},"Onyx":{factor:1.28,fluor:0,reliability:.88},
 "iDye Poly Blue":{factor:1.05,fluor:0,reliability:.86},"Blue":{factor:1.05,fluor:0,reliability:.78},
 "iDye Poly Crimson":{factor:1.04,fluor:0,reliability:.82},"Crimson":{factor:1.04,fluor:0,reliability:.80},
 "ProChem Neon Lemon Zest":{factor:.84,fluor:.88,uvColor:"#E8FF00",reliability:.76,champion:.82},
 "Neon Lemon Zest":{factor:.84,fluor:.88,uvColor:"#E8FF00",reliability:.76,champion:.82},
 "ProChem Neon Hot Orange":{factor:.86,fluor:.68,uvColor:"#FF5C00",reliability:.72,champion:.86},
 "Neon Hot Orange":{factor:.86,fluor:.68,uvColor:"#FF5C00",reliability:.72,champion:.86},
 "ProChem Fluorescent Pink":{factor:.76,fluor:.78,uvColor:"#FF7EC2",reliability:.70,champion:.62},
 "Fluorescent Pink":{factor:.76,fluor:.78,uvColor:"#FF7EC2",reliability:.70,champion:.62},
 "ProChem Neon Cerise Pink":{factor:.70,fluor:.82,uvColor:"#FF32BE",reliability:.58,champion:.55},
 "Neon Cerise Pink":{factor:.70,fluor:.82,uvColor:"#FF32BE",reliability:.58,champion:.55},
 "ProChem Neon Key Lime":{factor:.78,fluor:.96,uvColor:"#42FF00",reliability:.68,champion:.72},
 "Neon Key Lime":{factor:.78,fluor:.96,uvColor:"#42FF00",reliability:.68,champion:.72},
 "ProChem Neon Royal Purple":{factor:.66,fluor:.48,uvColor:"#8A24FF",reliability:.48,champion:.68},
 "Neon Royal Purple":{factor:.66,fluor:.48,uvColor:"#8A24FF",reliability:.48,champion:.68}
};




/*
 HBNF v9 universal optical-path model
 ------------------------------------
 - Opaque families: reflected/surface color with family-specific uptake.
 - Translucent families: reflected + transmitted components calculated per
   pixel. Increasing radius represents increasing optical path through the
   shoulder and rim.
 - Every catalog color is supported. Explicit profiles are used where the
   research or HBNF observations are strongest; all other colors are derived
   from their source swatch and dye-name family.
*/
const dyeOpticalProfiles={
 // Historical Blaze Orange red shifts on a turquoise Champion blank are source-specific.
 // Use general orange priors unless an exact-process calibrated record is present.
 "UV Blast Green":{surface:"#20B52D",filter:"#8BDB18",density:.94,fluor:.24,uv:"#50FF16"},
 "Green UV Blast":{surface:"#20B52D",filter:"#8BDB18",density:.94,fluor:.24,uv:"#50FF16"},
 "UV Blast Red":{surface:"#A20C22",filter:"#C90916",density:1.06,fluor:.13,uv:"#FF2340"},
 "Flo Red UV Blast":{surface:"#A20C22",filter:"#C90916",density:1.06,fluor:.13,uv:"#FF2340"},
 "Blue UV Blast":{surface:"#084DA4",filter:"#155CC4",density:1.02,fluor:.16,uv:"#258EFF"},
 "Hot Pink UV Blast":{surface:"#C41475",filter:"#D51A82",density:.92,fluor:.24,uv:"#FF2CA6"},
 "Purple UV Blast":{surface:"#5B197B",filter:"#711B96",density:.98,fluor:.12,uv:"#A43AFF"},
 "Chartreuse / Yellow":{surface:"#83BD17",filter:"#D1E51C",density:.76,fluor:.25,uv:"#DFFF00"},
 "Black":{surface:"#08090A",filter:"#161719",density:1.34,fluor:0,uv:"#111111"},
 "Pumpkin Brown":{surface:"#5B2B17",filter:"#7C3519",density:1.05,fluor:0,uv:"#8A4B20"},
 "Watermelon":{surface:"#BE2E58",filter:"#D83C68",density:.92,fluor:.10,uv:"#FF5577"},
 "Rind Green":{surface:"#2D7738",filter:"#4A9C4D",density:1.00,fluor:.05,uv:"#55B85A"},


 "iDye Poly Blue":{surface:"#101F70",filter:"#173A9C",density:1.12,fluor:0,uv:"#173A9C"},
 "Blue":{surface:"#101F70",filter:"#173A9C",density:1.12,fluor:0,uv:"#173A9C"},
 "iDye Poly Crimson":{surface:"#79152D",filter:"#990D29",density:1.08,fluor:0,uv:"#990D29"},
 "Crimson":{surface:"#79152D",filter:"#990D29",density:1.08,fluor:0,uv:"#990D29"},
 "ProChem Onyx":{surface:"#101010",filter:"#111214",density:1.38,fluor:0,uv:"#101010"},
 "Onyx":{surface:"#050607",filter:"#111214",density:1.38,fluor:0,uv:"#050607"},


 "ProChem Neon Lemon Zest":{surface:"#A4C416",filter:"#D5E526",density:.75,fluor:.22,uv:"#E8FF00"},
 "Neon Lemon Zest":{surface:"#A4C416",filter:"#D5E526",density:.75,fluor:.22,uv:"#E8FF00"},
 "ProChem Neon Hot Orange":{surface:"#A91B05",filter:"#D72B05",density:.92,fluor:.16,uv:"#FF5C00"},
 "Neon Hot Orange":{surface:"#A91B05",filter:"#D72B05",density:.92,fluor:.16,uv:"#FF5C00"},
 "ProChem Fluorescent Pink":{surface:"#BE286A",filter:"#D93280",density:.82,fluor:.21,uv:"#FF7EC2"},
 "Fluorescent Pink":{surface:"#BE286A",filter:"#D93280",density:.82,fluor:.21,uv:"#FF7EC2"},
 "ProChem Neon Cerise Pink":{surface:"#A8106B",filter:"#C71882",density:.78,fluor:.23,uv:"#FF32BE"},
 "Neon Cerise Pink":{surface:"#A8106B",filter:"#C71882",density:.78,fluor:.23,uv:"#FF32BE"},
 "ProChem Neon Key Lime":{surface:"#2DBB2C",filter:"#72D522",density:.78,fluor:.24,uv:"#42FF00"},
 "Neon Key Lime":{surface:"#2DBB2C",filter:"#72D522",density:.78,fluor:.24,uv:"#42FF00"},
 "ProChem Neon Royal Purple":{surface:"#4A1768",filter:"#661B84",density:.95,fluor:.10,uv:"#8A24FF"},
 "Neon Royal Purple":{surface:"#4A1768",filter:"#661B84",density:.95,fluor:.10,uv:"#8A24FF"},
 "UV Blast Clear":{surface:null,filter:null,density:0,fluor:.16,uv:"#7DEBFF",clear:true},
 "Clear UV Blast":{surface:null,filter:null,density:0,fluor:.16,uv:"#7DEBFF",clear:true}
};


const hbnfChampionPointAnchors={
 surfaceBase:"#38906F",
 transmissionBase:"#A6C5B5",
 colors:{
  "UV Blast Green":{
    plate:"#8FC316",
    shoulder:"#69B820",
    rim:"#3BAF27",
    overall:"#72B71A"
  },
  "UV Blast Blaze Orange":{
    plate:"#B30003",
    shoulder:"#890507",
    rim:"#57090D",
    overall:"#890507"
  }
 }
};


function deriveOpticalProfile(l){
 const explicit=dyeOpticalProfiles[l.name];
 if(explicit)return explicit;
 const rgb=hexRgb(l.hex),hsl=rgbToHsl(rgb),name=l.name.toLowerCase();
 let density=1.0,light=.34,sat=Math.max(.72,hsl[1]);
 if(name.includes("neon")||name.includes("fluorescent")){density=.80;light=.42;sat=1}
 if(name.includes("yellow")||name.includes("lemon")||name.includes("butter")||name.includes("dandelion")){density=.70;light=.45}
 if(name.includes("orange")){density=.92;light=.34}
 if(name.includes("pink")||name.includes("cerise")||name.includes("fuchsia")){density=.84;light=.38}
 if(name.includes("purple")||name.includes("concord")||name.includes("pansy")||name.includes("iris")){density=1.0;light=.28}
 if(name.includes("blue")||name.includes("navy")||name.includes("royal")){density=1.06;light=.29}
 if(name.includes("green")||name.includes("lime")||name.includes("meadow")||name.includes("fern")||name.includes("shamrock")){density=.92;light=.36}
 if(name.includes("black")||name.includes("onyx")||name.includes("dungeon")){density=1.34;light=.05;sat=.15}
 if(name.includes("gray")||name.includes("grey")){density=.9;light=.35;sat=.08}
 if(name.includes("brown")||name.includes("espresso")||name.includes("chocolate")||name.includes("sienna")){density=1.06;light=.24;sat=.72}
 const surface=rgbHex(hslToRgb([hsl[0],clamp(sat,0,1),clamp(light,0.03,.56)]));
 // A transmissive dye is usually darker and more saturated than its displayed
 // source swatch. Yellow/orange filters are shifted slightly toward red.
 let filterHue=hsl[0];
 if(filterHue>=28&&filterHue<=58)filterHue-=8;
 const filterLight=clamp(light+.10,.10,.60);
 const filter=rgbHex(hslToRgb([filterHue,clamp(sat*1.06,0,1),filterLight]));
 const m=metaForDye(l);
 return{surface,filter,density,fluor:clamp((m.fluor||0)*.24,0,.28),uv:m.uvColor||l.hex}
}
function opticalProfileFor(l){return deriveOpticalProfile(l)}


function opticalClassFor(p=profile()){
 const o=(p?.optical||"").toLowerCase();
 if(o.includes("champion")||(p?.translucency||0)>=40)return"translucent";
 if(o.includes("halo"))return"halo-opaque";
 if(o.includes("proto-glow-star"))return"glow-opaque";
 return"opaque"
}
function radialZone(radius){
 if(radius<.58)return"plate";
 if(radius<.84)return"shoulder";
 return"rim"
}
function opticalPathAt(radius,p=profile()){
 const cls=opticalClassFor(p);
 if(cls!=="translucent")return 1;
 const t=clamp((p?.translucency||65)/100,.35,1);
 let path;
 if(radius<.58)path=.64+radius*.20;
 else if(radius<.84)path=.78+(radius-.58)*1.25;
 else path=1.10+(radius-.84)*3.10;
 if((p?.optical||"").includes("proto-glow"))path*=1.08;
 if((p?.optical||"").includes("classic-glow"))path*=1.04;
 return path*(.88+.20*t)
}
function mixLinearHex(a,b,t){
 const x=hexRgb(a).map(srgbToLinear),y=hexRgb(b).map(srgbToLinear);
 return rgbHex(x.map((v,i)=>linearToSrgb(v+(y[i]-v)*t)))
}
function addLinearLight(hex,lightHex,amount){
 const a=hexRgb(hex).map(srgbToLinear),b=hexRgb(lightHex).map(srgbToLinear);
 return rgbHex(a.map((v,i)=>linearToSrgb(clamp(v+b[i]*amount,0,1))))
}
function exactChampionPointAnchor(baseHex,active,radius,scene,p=profile()){
 if(!isTranslucentProfile(p)||active.length!==1)return null;
 if(!isExactHbnfAnchor(baseHex,active,p))return null;
 const a=hbnfChampionPointAnchors.colors[active[0].name];
 if(!a)return null;
 const zone=radialZone(radius);
 let out=a[zone]||a.overall;
 if(scene==="surface")out=mixLinearHex(baseHex,out,zone==="rim"?.92:.78);
 if(scene==="backlit")out=mixLinearHex(out,a.plate,zone==="rim"?.28:.62);
 return out
}
function baseTranslucentPoint(baseHex,transHex,radius,scene,p=profile()){
 const path=opticalPathAt(radius,p),zone=radialZone(radius);
 const surfaceBase=baseHex,transBase=transHex;
 if(scene==="surface"){
   const shade=zone==="rim"?.13:zone==="shoulder"?.04:0;
   return mixLinearHex(surfaceBase,"#050607",shade)
 }
 if(scene==="backlit"){
   const dark=clamp((path-.65)*.15,0,.24);
   return mixLinearHex(transBase,"#050607",dark)
 }
 const transWeight=zone==="plate"?.56:zone==="shoulder"?.43:.23;
 let out=mixLinearHex(surfaceBase,transBase,transWeight);
 if(zone==="rim")out=mixLinearHex(out,"#050607",.20);
 return out
}
function translucentPointPredict(baseHex,active,scene,p,radius){
 const transBase=currentTransmissionHex(baseHex,p);
 if(!active.length)return baseTranslucentPoint(baseHex,transBase,radius,scene,p);
 const anchor=exactChampionPointAnchor(baseHex,active,radius,scene,p);
 if(anchor)return anchor;


 const path=opticalPathAt(radius,p),zone=radialZone(radius);
 let reflected=baseHex;
 let transmitted=transBase;
 let fluor=[0,0,0],capacity=1;


 active.forEach((l,idx)=>{
   const op=opticalProfileFor(l),m=metaForDye(l);
   const uptake=clamp((p?.uptake||.8)*(l.strength/100)*(m.factor||1)*capacity,0,1.25);
   if(!op.clear&&op.surface){
     const surfaceAlpha=clamp(uptake*(scene==="surface"?.86:.76),0,1);
     reflected=geometricColorMix(reflected,op.surface,surfaceAlpha);
   }
   if(!op.clear&&op.filter){
     const base=hexRgb(transmitted).map(v=>clamp(v/255,.003,1));
     const filter=hexRgb(op.filter).map(v=>clamp(v/255,.012,1));
     const exponent=clamp(path*op.density*uptake,0,3.2);
     transmitted=rgbHex(base.map((v,i)=>255*v*Math.pow(filter[i],exponent)));
   }
   if(op.fluor){
     const uv=hexRgb(op.uv||l.hex);
     const amp=op.fluor*uptake*(scene==="backlit"?.05:scene==="outdoor"?.10:.035);
     fluor=fluor.map((v,i)=>v+uv[i]*amp);
   }
   capacity*=idx===0?.94:.90;
 });


 // Outdoor viewing is a combination of reflected light and transmitted light.
 // The rim is reflection-dominant; the thin plate is transmission-dominant.
 let transWeight;
 if(scene==="surface")transWeight=zone==="plate"?.09:.04;
 else if(scene==="backlit")transWeight=zone==="plate"?.90:zone==="shoulder"?.82:.68;
 else transWeight=zone==="plate"?.56:zone==="shoulder"?.42:.22;


 let out=mixLinearHex(reflected,transmitted,transWeight);
 if(fluor.some(v=>v>0))out=addLinearLight(out,rgbHex(fluor.map(v=>clamp(v,0,255))),1);
 if(zone==="rim")out=mixLinearHex(out,"#030405",scene==="backlit"?.08:.16);

 // The blank and dyed rendering branches have different illumination mixes.
 // Preserve the observed blank's illumination at zero dye: only transfer
 // the modeled *relative* optical change from the dyed branch, in linear light.
 // Without this, a 0.01% ordinary dye layer can brighten a Champion rim.
 let modeledBlank=mixLinearHex(baseHex,transBase,transWeight);
 if(zone==="rim")modeledBlank=mixLinearHex(modeledBlank,"#030405",scene==="backlit"?.08:.16);
 const blank=baseTranslucentPoint(baseHex,transBase,radius,scene,p);
 const reference=hexRgb(modeledBlank).map(srgbToLinear),blankLin=hexRgb(blank).map(srgbToLinear);
 out=rgbHex(hexRgb(out).map((v,i)=>linearToSrgb(clamp(blankLin[i]*srgbToLinear(v)/Math.max(reference[i],1e-5),0,1))));
 // Ordinary absorption cannot increase reflected/transmitted channel energy
 // over the undyed base under the same scene; UV fluorescence is exempt.
 if(active.every(l=>opticalProfileFor(l).fluor<=0))out=capPassiveOpaqueDaylight(blank,out);
 return out
}
// Passive absorption changes a polymer's spectral reflectance by removing
// light; it cannot brighten an unchanged opaque blank under the same daylight.
// Keep fluorescent dyes exempt because they can emit additional visible light.
function capPassiveOpaqueDaylight(blankHex,dyedHex){
 const blank=hexRgb(blankHex),predicted=hexRgb(dyedHex);
 return rgbHex(predicted.map((v,i)=>Math.min(v,blank[i])));
}
function opaquePointPredict(baseHex,active,p,radius){
 if(!active.length){
   const cls=opticalClassFor(p);
   const rimShade=radius>.86?(cls==="halo-opaque"?.18:.09):0;
   return rimShade?mixLinearHex(baseHex,"#080A0D",rimShade):baseHex
 }
 let out=baseHex,remaining=1;
 // In an opaque plastic, an already-set ordinary black stencil does not
 // become visibly blue/red because another nonfluorescent dye is applied.
 // Protect only black-first ordinary overdying; no blanket RGB restriction
 // on unrelated color overlaps or fluorescent dyes.
 const passiveStack=active.every(l=>opticalProfileFor(l).fluor<=0);
 let blackUnderlay=null;
 active.forEach((l,idx)=>{
   const op=opticalProfileFor(l),m=metaForDye(l);
   if(op.clear)return;
   let uptake=clamp((p?.uptake||1)*(l.strength/100)*(m.factor||1)*remaining,0,1.25);
   if((p?.optical||"")==="dx")uptake*=.55;
   if((p?.optical||"")==="pro")uptake*=.76;
   if((p?.optical||"")==="gstar")uptake*=1.05;
   out=geometricColorMix(out,op.surface||l.hex,clamp(uptake*.82,0,1));
   if(op.fluor)out=addLinearLight(out,op.uv||l.hex,op.fluor*uptake*.055);
   // Otherwise the generic swatch interpolation can incorrectly replace an
   // already-black region with the next brighter pigment's swatch.
   if(passiveStack&&blackUnderlay)out=capPassiveOpaqueDaylight(blackUnderlay,out);
   if(passiveStack&&/^(?:ProChem Onyx|Onyx|Black|Cool Black)$/i.test(l.name)&&!blackUnderlay)blackUnderlay=out;
   remaining*=idx===0?.94:.90;
 });
 const cls=opticalClassFor(p);
 if(radius>.86)out=mixLinearHex(out,"#080A0D",cls==="halo-opaque"?.18:.08);
 // Do not create brighter channels through ordinary non-emissive dye uptake.
 // Compare to the blank with the same modelled outer-rim shading.
 if(!active.some(l=>Number(l.strength)>0&&opticalProfileFor(l).fluor>0)){
  const rimShade=radius>.86?(cls==="halo-opaque"?.18:.09):0;
  const blank=rimShade?mixLinearHex(baseHex,"#080A0D",rimShade):baseHex;
  out=capPassiveOpaqueDaylight(blank,out);
 }
 return out
}
function researchPredictPoint(baseHex,active,mode,p,x,y){
  // A zero-intensity layer cannot change the physical-region preview.
  active=active.filter(l=>Number(l.strength)>0);
 const radius=Math.sqrt(x*x+y*y);
 if(mode==="daylight"){
   return opticalClassFor(p)==="translucent"
     ?translucentPointPredict(baseHex,active,daylightScene,p,radius)
     :opaquePointPredict(baseHex,active,p,radius)
 }
 // UV and charged-glow behavior still uses the existing dye-specific emission
 // model, with a subtle path-length correction for translucent rims.
 let out=researchPredict(baseHex,active,mode,p);
 if(opticalClassFor(p)==="translucent"&&radius>.84){
   out=mixLinearHex(out,"#020304",mode==="glow"?.20:.11);
 }
 return out
}
// Photo geometry is independent of the chosen Innova dye-response model.
let discAppearance=null,photoBaseSelected=false;
function appearanceAt(x,y){
 const base=$("baseHex").value,a=discAppearance;
 if(!a||!validHex(a.rimHex))return base;
 const r=Math.hypot(x,y),half=a.softness/2;
 const offsets=a.edgeOffsets,theta=(Math.atan2(y,x)+2*Math.PI)%(2*Math.PI);
 const sector=theta/(2*Math.PI)*48-.5,lo=((Math.floor(sector)%48)+48)%48,hi=(lo+1)%48,w=sector-Math.floor(sector);
 const offset=Array.isArray(offsets)&&offsets.length===48?(Number(offsets[lo])||0)*(1-w)+(Number(offsets[hi])||0)*w:0;
 const boundary=clamp(a.boundary+offset,.52,.98);
 const t=half<=.001?(r>=boundary?1:0):clamp((r-boundary+half)/(2*half),0,1);
 return mixRgbHex(base,a.rimHex,t*t*(3-2*t));
}
function setDiscAppearance(a,commit=false,photoApplied=false){
 if(photoApplied)photoBaseSelected=true;
 if(a&&validHex(a.rimHex)&&Number.isFinite(+a.boundary)){
  discAppearance={rimHex:a.rimHex.toUpperCase(),boundary:clamp(+a.boundary,.54,.96),
   softness:clamp(+a.softness||0,.002,.23),kind:a.kind==="soft"?"soft":"hard",
   edgeOffsets:Array.isArray(a.edgeOffsets)&&a.edgeOffsets.length===48?a.edgeOffsets.map(v=>clamp(Number(v)||0,-.08,.08)):null};
 }else discAppearance=null;
 regionColorCache.clear();requestRender();if(commit)commitHistory();
}
window.DUDiscAppearance={set:setDiscAppearance,get:()=>discAppearance?{...discAppearance}:null};
function colorForPoint(x,y,key){
 const active=layers.filter((_,i)=>key[i]==="1"),base=appearanceAt(x,y),empirical=discAppearance?null:recordFor(active);
 if(photoBaseSelected&&viewMode==="daylight"&&daylightScene==="outdoor"&&!active.some(l=>Number(l.strength)>0))return base;
 if(empirical&&viewMode==="daylight")return empirical.measuredHex;
 return researchPredictPoint(base,active,viewMode,profile(),x,y)
}


const transmissionTargets={
 // Historical deep-red HBNF observations are not generic transmission endpoints.
 "UV Blast Green":"#61C126","Green UV Blast":"#61C126",
 "UV Blast Red":"#A90013","Flo Red UV Blast":"#A90013",
 "Blue UV Blast":"#003D93","Hot Pink UV Blast":"#C60072","Purple UV Blast":"#560074","Chartreuse / Yellow":"#C9DE00",
 "ProChem Onyx":"#101010","Onyx":"#050607","iDye Poly Blue":"#071B70","Blue":"#071B70","iDye Poly Crimson":"#790018","Crimson":"#790018",
 "ProChem Neon Lemon Zest":"#C4D900","Neon Lemon Zest":"#C4D900","ProChem Neon Hot Orange":"#D71900","Neon Hot Orange":"#D71900",
 "ProChem Fluorescent Pink":"#C41567","Fluorescent Pink":"#C41567","ProChem Neon Cerise Pink":"#B00070","Neon Cerise Pink":"#B00070",
 "ProChem Neon Key Lime":"#58C900","Neon Key Lime":"#58C900","ProChem Neon Royal Purple":"#45005D","Neon Royal Purple":"#45005D"
};
const opaqueTargets={
 "UV Blast Blaze Orange":"#F15B16","UV Blast Green":"#7EE600","UV Blast Red":"#DF1026",
 "iDye Poly Blue":"#14206E","iDye Poly Crimson":"#8C1630","ProChem Onyx":"#101010"
};
const hbnfChampionThicknessCalibration={
 "UV Blast Blaze Orange":{rim:"#57090D",wholeRegion:"#890507",flightPlateCenter:"#B30003"},
 "UV Blast Green":{rim:"#3BAF27",wholeRegion:"#72B71A",flightPlateCenter:"#8FC316"}
};
const hbnfPhotoAnchor={
 profile:"innova_champion",surfaceBase:"#38906F",transmissionBase:"#A6C5B5",numericEligible:false,
 observed:{
  "UV Blast Green":{surface:"#3BAF27",outdoor:"#72B71A",backlit:"#8FC316"},
  "UV Blast Blaze Orange":{surface:"#57090D",outdoor:"#890507",backlit:"#B30003"}
 },
 note:"Reference-only HBNF photo outcome. Until the exact physical process and color measurements are documented, do not apply these pixel-sampled values as general predictive color calibration."
};
function rgbDistanceHex(a,b){const x=hexRgb(a),y=hexRgb(b);return Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2])}
function isTranslucentProfile(p=profile()){return !!p&&((p.optical||"").includes("champion")||(p.translucency||0)>=40)}
function mixRgbHex(a,b,t){const x=hexRgb(a),y=hexRgb(b);return rgbHex(x.map((v,i)=>v+(y[i]-v)*t))}
function adjustHslHex(h,sm=1,lm=1){const a=rgbToHsl(hexRgb(h));a[1]=clamp(a[1]*sm,0,1);a[2]=clamp(a[2]*lm,0,1);return rgbHex(hslToRgb(a))}
function autoTransmissionHex(baseHex,p=profile()){
 const b=hexRgb(baseHex),t=clamp(((p?.translucency??70)/100),0,1),lift=.38+.36*t;
 return rgbHex(b.map(v=>v+(255-v)*lift))
}
function currentTransmissionHex(baseHex=$("baseHex").value,p=profile()){
 const el=$("transmissionHex"),h=el?.value?.toUpperCase();return validHex(h)?h:autoTransmissionHex(baseHex,p)
}
function isExactHbnfAnchor(baseHex,active,p=profile()){
  return hbnfPhotoAnchor.numericEligible===true&&p?.id==="innova_champion"
    &&baseHex.toUpperCase()===hbnfPhotoAnchor.surfaceBase
    &&currentTransmissionHex().toUpperCase()===hbnfPhotoAnchor.transmissionBase
    &&active.length===1&&Number(active[0].strength)===100
    &&Object.prototype.hasOwnProperty.call(hbnfPhotoAnchor.observed,active[0].name);
}
function photoAnchorFor(baseHex,active,p=profile()){
 if(!isTranslucentProfile(p)||active.length!==1)return null;
 if(!isExactHbnfAnchor(baseHex,active,p))return null;
 return hbnfPhotoAnchor.observed[active[0].name]||null
}
function transmissionTargetFor(l){
 if(transmissionTargets[l.name])return transmissionTargets[l.name];
 const [h,s,v]=rgbToHsl(hexRgb(l.hex));
 const shifted=h>20&&h<65?Math.max(0,h-18):h;
 return rgbHex(hslToRgb([shifted,clamp(s*1.12,0,1),clamp(v*.73,.12,.78)]))
}
function geometricColorMix(a,b,t){
 const x=hexRgb(a),y=hexRgb(b),eps=3;
 return rgbHex(x.map((v,i)=>Math.exp((1-t)*Math.log(v+eps)+t*Math.log(y[i]+eps))-eps))
}
function championDaylightPredict(baseHex,active,scene="outdoor",p=profile()){
 const transmitted=currentTransmissionHex(baseHex,p);
 if(!active.length){
  if(scene==="surface")return baseHex;
  if(scene==="backlit")return adjustHslHex(transmitted,1.08,1.06);
  return mixRgbHex(baseHex,transmitted,.66)
 }
 const anchor=photoAnchorFor(baseHex,active,p);
 if(anchor)return anchor[scene]||anchor.outdoor;
 let out=scene==="surface"?baseHex:transmitted;
 active.forEach((l,idx)=>{
  const m=metaForDye(l);
  let target=scene==="surface"?(opaqueTargets[l.name]||l.hex):transmissionTargetFor(l);
  // No unverified special dye-to-red overrides for the HBNF photo case.
  let alpha=clamp((l.strength/100)*(m.factor||1)*(p?.uptake||.78),0,1);
  if(scene==="surface")alpha*=.68;
  else alpha=clamp(.72+alpha*.24,0,1);
  if(idx>0)alpha*=.86;
  out=geometricColorMix(out,target,alpha);
 });
 if(scene==="backlit")out=adjustHslHex(out,1.12,1.08);
 if(scene==="outdoor")out=adjustHslHex(out,1.06,.98);
 return out
}


function metaForDye(l){
 const direct=dyeResearch[l.name];if(direct)return direct;
 const n=l.name.toLowerCase();
 if(n.includes("black")||n.includes("dungeon"))return{factor:1.22,fluor:0,reliability:.78};
 if(n.includes("neon"))return{factor:.80,fluor:.72,uvColor:l.hex,reliability:.58,champion:.75};
 return{factor:1,fluor:0,reliability:.52};
}
const researchSamples=[
{id:"hbnf_green_orange",title:"Actual HBNF Champion split: rich green and deep red",profile:"innova_champion",family:"champion",base:"#38906F",transmission:"#A6C5B5",dyes:["UV Blast Green","UV Blast Blaze Orange"],layout:"split",method:"UV Blast in HBNF Floetrol process; outdoor finished photo",lesson:"This actual result disproved the old generic model. The supplied physical result establishes two critical behaviors: UV Blast Green remains distinctly green overall, becoming more yellow-green only through the thinner, brightly transmitted flight plate; UV Blast Blaze Orange behaves as deep red and darkens strongly through the thicker rim. This is valuable qualitative region-specific evidence but is not automatically applied to arbitrary discs or unverified recipes.",confidence:"photo-anchor",inventory:true,sourceLabel:"HBNF supplied before/after photos",sourceUrl:"",actual:true,observedOutputs:{"UV Blast Green":"#72B71A","UV Blast Blaze Orange":"#890507"}},
{id:"star_pinks",title:"Star Caiman: two bright pinks",profile:"innova_star",family:"star",base:"#F4F2E8",dyes:["ProChem Neon Cerise Pink","ProChem Fluorescent Pink"],layout:"split",method:"Floetrol + silicone",lesson:"Opaque Star supported unusually vivid Cerise and Fluorescent Pink together.",confidence:"research",inventory:true,sourceLabel:"Documented Reddit post",sourceUrl:"https://www.reddit.com/r/discdyeing/comments/wmqm2o/innova_f2_star_caiman_midrange_disc_dye_with_pro/"},
{id:"star_colt_quads",title:"Star Colt: ordered color-wheel quadrants",profile:"innova_star",family:"star",base:"#F4F2E8",dyes:["iDye Poly Blue","ProChem Neon Key Lime","ProChem Neon Lemon Zest","ProChem Neon Hot Orange"],layout:"quarters",method:"Vinyl masks + hot dip + spin dye",lesson:"Documented overlaps produced blue-green and yellow-green quadrants; adjacent color-wheel combinations stayed clearer.",confidence:"research",inventory:true,sourceLabel:"Documented Reddit recipe",sourceUrl:"https://www.reddit.com/r/discdyeing/comments/1nambd2/innova_start_colt_vinyl_maskhot_dipspin_dye/"},
{id:"champ_glow_chartreuse",title:"Champion Glow: chartreuse succeeds, pink weakens",profile:"innova_classic_glow_champion",family:"glow",base:"#DCE7C8",dyes:["Chartreuse / Yellow","ProChem Fluorescent Pink"],layout:"rings",method:"Worm dip",lesson:"Chartreuse approached neon yellow; yellow-plus-pink became dingier because pink uptake was weak on Champion plastic.",confidence:"research",inventory:false,sourceLabel:"Documented Reddit observation",sourceUrl:"https://www.reddit.com/r/discdyeing/comments/dzjexa/using_chartreuse_worm_dip_on_glow/"},
{id:"gstar_green_pink",title:"Light green GStar + pink worm dip",profile:"innova_gstar",family:"star",base:"#A5D98C",dyes:["Hot Pink UV Blast"],layout:"split",method:"Worm dip",lesson:"Pink nearly overtook a light-green GStar base and shifted toward red, showing strong uptake and base-color interaction.",confidence:"research",inventory:false,sourceLabel:"Documented Reddit observation",sourceUrl:"https://www.reddit.com/r/discdyeing/comments/gyqe2i/one_from_a_few_months_back/"},
{id:"champ_orange_dark",title:"Orange Champion + very dark dye",profile:"innova_champion",family:"champion",base:"#EF822F",dyes:["ProChem Onyx"],layout:"stripe",method:"Hot dip, about 15 minutes",lesson:"A documented dark ProChem treatment developed strongly on orange Champion; this HBNF mockup substitutes owned ProChem Onyx as the nearest production analog.",confidence:"research",inventory:true,sourceLabel:"Documented Reddit update",sourceUrl:"https://www.reddit.com/r/discdyeing/comments/11hxtxn/fail_hot_dip_with_prochem/"},
{id:"star_neon_triad",title:"Opaque-premium neon triad",profile:"innova_star",family:"star",base:"#F3F0E8",dyes:["ProChem Neon Royal Purple","ProChem Neon Key Lime","ProChem Onyx"],layout:"thirds",method:"Lotion bed",lesson:"Big Z—used here as a Star-style opaque analog—showed strong neon purple, key lime, and dark contrast; the HBNF mockup uses owned ProChem Onyx for the dark component.",confidence:"research",inventory:true,sourceLabel:"Documented Big Z example",sourceUrl:"https://www.reddit.com/r/discdyeing/comments/qttc2a/big_z_plastic_takes_neon_colors_so_well/"},
{id:"champ_long_set",title:"Champion long-set saturation warning",profile:"innova_champion",family:"champion",base:"#7FB7D1",dyes:["ProChem Neon Cerise Pink","ProChem Neon Lemon Zest"],layout:"split",method:"Clear glue, ProChem in acetone, 48 hours, no heat",lesson:"Some colors still failed to saturate after 48 hours without heat; Champion predictions should penalize weak pink/neon uptake.",confidence:"research",inventory:true,sourceLabel:"Documented Reddit troubleshooting",sourceUrl:"https://www.reddit.com/r/discdyeing/comments/quez8t/first_dye_on_champ_plastic_im_happy_with_it_but/"},
{id:"colored_star_mud",title:"Colored Star: complementary mud risk",profile:"innova_star",family:"star",base:"#E47B35",dyes:["ProChem Neon Royal Purple","iDye Poly Blue"],layout:"overlap",method:"Mixed dye methods",lesson:"A saturated colored base plus distant color-wheel dyes can collapse toward brown/gray instead of clean digital blending.",confidence:"research",inventory:true,sourceLabel:"Community failure analysis",sourceUrl:"https://www.reddit.com/r/discdyeing/comments/15we8vh/tried_to_save_itim_done_with_star_plastic_unless/"},
{id:"layered_green",title:"Layered greens for depth",profile:"innova_star",family:"star",base:"#F2F0E8",dyes:["UV Blast Green","ProChem Neon Key Lime"],layout:"rings",method:"Clear glue bed; multiple greens layered",lesson:"A documented commission layered Meadow, iDye Kelly, and UV Blast Green; this HBNF analog demonstrates same-family layering for depth.",confidence:"research",inventory:true,sourceLabel:"Documented layered-green recipe",sourceUrl:"https://www.reddit.com/r/discdyeing/comments/m7tawz/recent_commission_clear_glue_bed_idye_poly/"},
{id:"proto_champ_dyeability",title:"Proto Glow Champion dyeability",profile:"innova_proto_glow_champion",family:"glow",base:"#DDE8C8",dyes:["UV Blast Red","iDye Poly Blue"],layout:"split",method:"Community examples; exact recipe not disclosed",lesson:"Proto Glow Champion and older Champion Glow are different blends, but community examples indicate both can take dye. Exact strength remains a gap.",confidence:"estimate",inventory:true,sourceLabel:"Community Proto Glow discussion",sourceUrl:"https://www.reddit.com/r/discdyeing/comments/1lcemq3/innova_proto_glow_will_it_dye/"}
];
const sourceIndex=[
["Innova plastic families","https://www.innovadiscs.com/home/disc-golf-faq/plastic-types-overview/","Official descriptions of Star, GStar, Halo Star, and Champion."],
["Innova Proto Glow introduction","https://www.innovadiscs.com/innova-news/introducing-proto-glow/","Official Proto Glow launch and brighter/longer glow claim."],
["ProChem disc-dye directions","https://prochemicalanddye.com/wp-content/uploads/2026/02/Disc-Dyeing-directions2-1.pdf","Color varies by medium, concentration, time, temperature, and dye potency."],
["Dyers Guild color reference","https://dyersguild.co/disc-dyeing-color-reference-chart/","Useful disc-specific precedent; swatches are still digital/fabric-derived."],
...researchSamples.filter(s=>s.sourceUrl).map(s=>[s.title,s.sourceUrl,s.lesson])
];


let history=[],historyIndex=-1,isRestoring=false,dragChanged=false;
const regionColorCache=new Map(),spectralColorCache=new Map();


function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function validHex(v){return /^#[0-9a-f]{6}$/i.test(v)}
function hexRgb(h){h=h.toUpperCase();return[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]}
function rgbHex(a){return"#"+a.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,"0")).join("").toUpperCase()}
function shapeLabel(v){return v==="edge"?"Edge block":v==="stripe"?"Stripe":"Whole disc"}
function normAngle(deg){let a=((deg+180)%360+360)%360-180;return a===-180?180:a}
function deepCopy(x){return JSON.parse(JSON.stringify(x))}
function stateObject(){return{photoBaseSelected,discAppearance:discAppearance?{...discAppearance}:null,base:$("baseHex").value.toUpperCase(),transmission:$("transmissionHex").value.toUpperCase(),blend:$("blendMode").value,viewMode,daylightScene,activeProfileId,layers:deepCopy(layers),sample:deepCopy(sample),processKey:activeRecipeKey(),method:activeMethod(),passCount:activePassCount(),showGuides:$("showGuides").checked}}
function stateString(){return JSON.stringify(stateObject())}
function applyState(s){
  isRestoring=true;
  $("methodSelect").value=s.method||"acetone-direct";
  discAppearance=s.discAppearance&&validHex(s.discAppearance.rimHex)?{...s.discAppearance}:null;
  photoBaseSelected=s.photoBaseSelected===true;
  $("passCount").value=String(clamp(Math.round(+s.passCount||1),1,12));
  $("productionRecipeKey").value=s.processKey||"";
  $("baseHex").value=s.base;$("baseColor").value=s.base;const th=s.transmission||autoTransmissionHex(s.base,profile());$("transmissionHex").value=th;$("transmissionColor").value=th;
  $("blendMode").value=s.blend||"research";if(s.activeProfileId&&profiles.some(p=>p.id===migrateProfileId(s.activeProfileId)))activeProfileId=migrateProfileId(s.activeProfileId);viewMode=s.viewMode||"daylight";daylightScene=s.daylightScene||"outdoor";layers=deepCopy(s.layers||[]).map(l=>({...l,passes:clamp(Math.round(+l.passes||+s.passCount||1),1,12),method:l.method||(/uv blast|quick.coat|worm dip/i.test(l.name||"")?"worm-dip":(s.method||"acetone-direct"))}));sample=s.sample||{x:0,y:0};
  $("showGuides").checked=s.showGuides!==false;
  selected=layers.length?clamp(selected,0,layers.length-1):-1;
  renderProfiles();renderLayerList();syncEditor();setModeHelp();updateConditionButtons();updateSceneButtons();requestRender(true);isRestoring=false;
  window.DUDiscPhoto?.syncControls?.();
}
function commitHistory(){
  if(isRestoring)return;
  const now=stateString();
  if(historyIndex>=0&&history[historyIndex]===now){updateHistoryButtons();return}
  history=history.slice(0,historyIndex+1);history.push(now);
  if(history.length>100)history.shift();else historyIndex++;
  updateHistoryButtons();
}
function undo(){
  if(historyIndex<=0)return;
  historyIndex--;applyState(JSON.parse(history[historyIndex]));updateHistoryButtons();toast("Undid last change");
}
function redo(){
  if(historyIndex>=history.length-1)return;
  historyIndex++;applyState(JSON.parse(history[historyIndex]));updateHistoryButtons();toast("Redid change");
}
function updateHistoryButtons(){
  $("undoBtn").disabled=historyIndex<=0;$("redoBtn").disabled=historyIndex>=history.length-1;
}
function mutate(fn,message=""){
  fn();renderLayerList();syncEditor();requestRender();commitHistory();window.DUDiscPhoto?.syncControls?.();if(message)toast(message);
}


function newLayer(name,hex,clear=false){
  const count=layers.length,consumer=typeof appMode!=="undefined"&&appMode==="client";
  // A consumer's first two blocks form predictable complementary halves.
  // Additional blocks may overlap, but never start at arbitrary-looking
  // rotations for the first two dyes. Technical Studio retains its defaults.
  const angle=consumer&&count<2?0:normAngle(count*47-25);
  const offset=consumer&&count<2?0:(count%3-1)*.12;
  const requested=activeMethod(),premixed=/uv blast|quick.coat|worm dip/i.test(name);
  // Default ready-made worm dip to its sold formulation, but preserve the
  // user-selected Floetrol combination as a distinct documented process.
  const method=premixed&&requested==="floetrol-stencil"?"premixed-dip-floetrol":premixed&&requested==="acetone-direct"?"worm-dip":requested;
  return{name,hex:hex.toUpperCase(),strength:100,passes:activePassCount(),method,shape:"edge",angle,offset,side:count%2===0?1:-1,width:.42}
}
function layerCovers(layer,x,y){
  if(layer.shape==="full")return true;
  const a=layer.angle*Math.PI/180,q=Math.cos(a)*x+Math.sin(a)*y;
  if(layer.shape==="stripe")return Math.abs(q-layer.offset)<=layer.width/2;
  return layer.side>0?q>=layer.offset:q<=layer.offset;
}
function regionKeyAt(x,y){return layers.map(l=>Number(l.strength??100)>0&&layerCovers(l,x,y)?"1":"0").join("")}
function blendPixel(br,bg,bb,tr,tg,tb,s,mode){
  if(mode==="normal")return[br+(tr-br)*s,bg+(tg-bg)*s,bb+(tb-bb)*s];
  if(mode==="darken")return[br+(Math.min(br,tr)-br)*s,bg+(Math.min(bg,tg)-bg)*s,bb+(Math.min(bb,tb)-bb)*s];
  if(mode==="multiply")return[br*((1-s)+s*tr/255),bg*((1-s)+s*tg/255),bb*((1-s)+s*tb/255)];
  const p=1.55*s;return[br*Math.pow(Math.max(tr/255,.018),p),bg*Math.pow(Math.max(tg/255,.018),p),bb*Math.pow(Math.max(tb/255,.018),p)]
}
function srgbToLinear(v){v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}
function linearToSrgb(v){v=clamp(v,0,1);return 255*(v<=.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-.055)}
function rgbToHsl(rgb){let[r,g,b]=rgb.map(v=>v/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn,h=0,s=0,l=(mx+mn)/2;if(d){s=d/(1-Math.abs(2*l-1));if(mx===r)h=60*(((g-b)/d)%6);else if(mx===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4)}if(h<0)h+=360;return[h,s,l]}
function hslToRgb(hsl){let[h,s,l]=hsl,c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2,r=0,g=0,b=0;if(h<60)[r,g,b]=[c,x,0];else if(h<120)[r,g,b]=[x,c,0];else if(h<180)[r,g,b]=[0,c,x];else if(h<240)[r,g,b]=[0,x,c];else if(h<300)[r,g,b]=[x,0,c];else[r,g,b]=[c,0,x];return[(r+m)*255,(g+m)*255,(b+m)*255]}
function hueDistance(a,b){const d=Math.abs(a-b)%360;return Math.min(d,360-d)}
function profileFactorForDye(p,m){let f=p?.uptake??1;if((p?.optical||"").includes("champion")&&m.champion)f*=m.champion;if(p?.optical==="dx")f*=.85;if(p?.optical==="pro")f*=.92;return f}
function opaqueDaylightPredict(baseHex,active,profileObj=profile()){
 let base=hexRgb(baseHex),lin=base.map(srgbToLinear),fluorAdd=[0,0,0],cumulative=0,hues=[];
 active.forEach((l)=>{
  const m=metaForDye(l),target=hexRgb(opaqueTargets[l.name]||l.hex),tlin=target.map(srgbToLinear),pf=profileFactorForDye(profileObj,m),effective=clamp((l.strength/100)*m.factor*pf*(1-cumulative*.035),0,1.35);
  if(m.factor>0){for(let i=0;i<3;i++){const trans=clamp(tlin[i],.002,1),od=-Math.log(trans);lin[i]*=Math.exp(-od*effective)}cumulative+=effective}
  if(m.fluor){const uc=hexRgb(m.uvColor||l.hex).map(srgbToLinear),amp=m.fluor*pf*(l.strength/100)*(l.name.toLowerCase().includes("clear")?.012:.10);for(let i=0;i<3;i++)fluorAdd[i]+=uc[i]*amp}
  hues.push(rgbToHsl(target)[0]);
 });
 for(let i=0;i<3;i++)lin[i]=clamp(lin[i]+fluorAdd[i],0,1);
 let out=lin.map(linearToSrgb),hsl=rgbToHsl(out);if(profileObj?.chroma)hsl[1]=clamp(hsl[1]*profileObj.chroma,0,1);
 let mud=0;for(let i=0;i<hues.length;i++)for(let j=i+1;j<hues.length;j++){const d=hueDistance(hues[i],hues[j]);if(d>115&&d<245)mud+=.08}
 if(mud){hsl[1]*=clamp(1-mud,0,1);hsl[2]*=clamp(1-mud*.35,.55,1)}
 return rgbHex(hslToRgb(hsl))
}
function researchPredict(baseHex,active,p=viewMode,profileObj=profile()){
  active=active.filter(l=>Number(l.strength)>0);
  if(p==="daylight"){
    return isTranslucentProfile(profileObj)?championDaylightPredict(baseHex,active,daylightScene,profileObj):(active.length?opaqueDaylightPredict(baseHex,active,profileObj):baseHex)
  }
  if(!active.length){if(p==="glow")return profileObj?.glow?(profileObj.optical.includes("champion")?"#B7F47A":"#C8FF8A"):"#080A0D";if(p==="uv365")return profileObj?.glow?"#9ED766":"#171C25";return baseHex}
  if(p==="glow"){
    let emission=profileObj?.glow||0,clearBoost=0,absorb=0;
    active.forEach(l=>{const m=metaForDye(l),intensity=clamp(Number(l.strength)/100,0,1);clearBoost+=(l.name.toLowerCase().includes("clear")?m.fluor*.22:0)*intensity;absorb+=Math.max(.12,m.factor)*profileFactorForDye(profileObj,m)*.27*intensity});
    const brightness=clamp(emission*(1-absorb)+clearBoost,.015,1.15),baseGlow=profileObj?.optical?.includes("champion")?[.58,1,.35]:[.68,1,.42];
    let tint=[0,0,0],tw=0;active.forEach(l=>{const m=metaForDye(l),f=(m.fluor||0)*clamp(Number(l.strength)/100,0,1);if(f){const c=hexRgb(m.uvColor||l.hex);tint=tint.map((v,i)=>v+c[i]*f);tw+=f}});
    const rgb=baseGlow.map((v,i)=>255*v*brightness);if(tw)for(let i=0;i<3;i++)rgb[i]=rgb[i]*.72+(tint[i]/tw)*brightness*.28;return rgbHex(rgb)
  }
  if(p==="uv365"){
    let rgb=[8,10,18],weight=0;active.forEach(l=>{const m=metaForDye(l),f=m.fluor||0;if(f){const c=hexRgb(m.uvColor||l.hex);const k=f*profileFactorForDye(profileObj,m)*clamp(Number(l.strength)/100,0,1);rgb=rgb.map((v,i)=>v+c[i]*k);weight+=k}});
    if(profileObj?.glow){rgb[1]+=70*profileObj.glow;rgb[0]+=35*profileObj.glow;rgb[2]+=25*profileObj.glow;weight+=.35}
    const scale=weight?1/(.55+weight*.55):1;return rgbHex(rgb.map(v=>v*scale*1.55))
  }
  return baseHex
}
function colorForRegion(key){
  const cacheKey=activeProfileId+"|"+String(photoBaseSelected)+"|"+JSON.stringify(discAppearance)+"|"+$("baseHex").value+"|"+currentTransmissionHex()+"|"+viewMode+"|"+daylightScene+"|"+layers.map(l=>`${l.name}:${l.hex}:${l.strength}`).join(",")+"|"+key;
  if(regionColorCache.has(cacheKey))return regionColorCache.get(cacheKey);
  const active=layers.filter((_,i)=>key[i]==="1"),base=$("baseHex").value,empirical=discAppearance?null:recordFor(active);let out;
  if(photoBaseSelected&&viewMode==="daylight"&&daylightScene==="outdoor"&&!active.some(l=>Number(l.strength)>0))out=base;
  else if(empirical&&viewMode==="daylight")out=empirical.measuredHex;
  else out=researchPredict(base,active,viewMode,profile());
  regionColorCache.set(cacheKey,out);return out
}
function confidenceForActive(active){
  // Nominal zero-strength blocks are not physically dyed, even when saved.
  active=active.filter(l=>Number(l.strength??100)>0);
  const rec=discAppearance?null:recordFor(active);if(rec)return rec.status;
  const p=profile();if(!active.length)return"base-only";
  if(p?.status==="unavailable")return"unavailable";
  if(viewMode==="daylight"&&photoAnchorFor($("baseHex").value,active,p))return"photo-anchor";
  // Documented precedent is NOT a quantified validation result.
  return"estimate";
}
function makePaintImage(){
  const image=paintCtx.createImageData(PAINT_SIZE,PAINT_SIZE),data=image.data;
  // A dye region's optical prediction depends on radius, not angle. Reuse
  // colors in narrow radius bins per exact region mask, preserving boundaries
  // at .58 (plate), .84 (shoulder), and .86 (opaque rim shading).
  // The 1024 bins change <=1 sRGB channel in tested Proto Glow Champion
  // scenes and 0 channels in tested Star scenes, with no model parameter edit.
  const ringCache=new Map(),bins=1024;
  let p=0;
  for(let iy=0;iy<PAINT_SIZE;iy++){
    const y=((iy+.5)/PAINT_SIZE)*2-1;
    for(let ix=0;ix<PAINT_SIZE;ix++){
      const x=((ix+.5)/PAINT_SIZE)*2-1,r2=x*x+y*y;
      if(r2>1){data[p++]=0;data[p++]=0;data[p++]=0;data[p++]=0;continue}
      const radius=Math.sqrt(r2);
      const zone=radius<.58?0:radius<.84?1:radius<=.86?2:3;
      const region=regionKeyAt(x,y);
      // Match the photographed blank's actual local color, not a coarse
      // angular bucket. Different rim boundaries can share an angle bucket.
      // Flat plate/rim pixels reuse one result; no dye coefficients change.
      const photoKey=discAppearance&&Math.abs(radius-discAppearance.boundary)<
        (.08+discAppearance.softness/2)?appearanceAt(x,y):"";
      const cacheKey=region+"|"+zone+"|"+Math.min(bins-1,Math.floor(radius*bins))+"|"+photoKey;
      let rgb=ringCache.get(cacheKey);
      if(!rgb){rgb=hexRgb(colorForPoint(x,y,region));ringCache.set(cacheKey,rgb)}
      data[p++]=rgb[0];data[p++]=rgb[1];data[p++]=rgb[2];data[p++]=255;
    }
  }
  paintCtx.putImageData(image,0,0);paintedImage=image;
}
function resizeCanvas(){
  const rect=canvas.getBoundingClientRect();dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));
  canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);
  W=rect.width;H=rect.height;cx=W/2;cy=H/2;R=Math.min(W,H)*.385;ctx.setTransform(dpr,0,0,dpr,0,0);requestRender(true)
}
function toScreen(p){return{x:cx+p.x*R,y:cy+p.y*R}}
function toNorm(px,py){return{x:(px-cx)/R,y:(py-cy)/R}}
function lineGeometry(layer){
  const a=layer.angle*Math.PI/180,n={x:Math.cos(a),y:Math.sin(a)},u={x:-n.y,y:n.x},off=clamp(layer.offset,-.995,.995);
  const t=Math.sqrt(Math.max(.01,GUIDE_RADIUS*GUIDE_RADIUS-off*off));
  return{n,u,p1:{x:n.x*off+u.x*t,y:n.y*off+u.y*t},p2:{x:n.x*off-u.x*t,y:n.y*off-u.y*t},center:{x:n.x*off,y:n.y*off}}
}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function pointLineDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;return Math.abs(dy*p.x-dx*p.y+b.x*a.y-b.y*a.x)/len}
function colorWithAlpha(hex,a){const[r,g,b]=hexRgb(hex);return`rgba(${r},${g},${b},${a})`}
function drawDiamond(x,y,size,fill,letter=""){
  ctx.save();ctx.translate(x,y);ctx.rotate(Math.PI/4);ctx.fillStyle=fill;ctx.strokeStyle="#fff";ctx.lineWidth=2;
  ctx.beginPath();ctx.rect(-size/2,-size/2,size,size);ctx.fill();ctx.stroke();ctx.restore();
  if(letter){ctx.fillStyle="#fff";ctx.font="bold 9px -apple-system,sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(letter,x,y)}
}
function drawCircleHandle(p,fill,size=9){const s=toScreen(p);ctx.beginPath();ctx.arc(s.x,s.y,size,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke()}
function drawLineForLayer(layer,isSelected){
  if(layer.shape==="full")return;
  const geo=lineGeometry(layer),p1=toScreen(geo.p1),p2=toScreen(geo.p2);
  ctx.save();ctx.strokeStyle=colorWithAlpha(layer.hex,isSelected?.95:.5);ctx.lineWidth=isSelected?3:1.4;ctx.setLineDash(isSelected?[]:[6,5]);
  ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.stroke();
  if(layer.shape==="stripe"){
    for(const sign of[-1,1]){
      const o=layer.offset+sign*layer.width/2,a=layer.angle*Math.PI/180,n={x:Math.cos(a),y:Math.sin(a)},u={x:-n.y,y:n.x};
      const t=Math.sqrt(Math.max(.01,GUIDE_RADIUS*GUIDE_RADIUS-clamp(o,-1.1,1.1)**2));
      const a1=toScreen({x:n.x*o+u.x*t,y:n.y*o+u.y*t}),a2=toScreen({x:n.x*o-u.x*t,y:n.y*o-u.y*t});
      ctx.strokeStyle=colorWithAlpha(layer.hex,isSelected?.72:.3);ctx.lineWidth=isSelected?2:1;ctx.setLineDash([4,4]);
      ctx.beginPath();ctx.moveTo(a1.x,a1.y);ctx.lineTo(a2.x,a2.y);ctx.stroke()
    }
  }
  ctx.restore();
  if(isSelected){
    drawCircleHandle(geo.p1,layer.hex,appMode==="client"?13:10);drawCircleHandle(geo.p2,layer.hex,appMode==="client"?13:10);
    const c=toScreen(geo.center);ctx.fillStyle=layer.hex;ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.beginPath();ctx.rect(c.x-7,c.y-7,14,14);ctx.fill();ctx.stroke();
    if(layer.shape==="edge"){
      const f=toScreen({x:geo.n.x*(layer.offset+layer.side*.22),y:geo.n.y*(layer.offset+layer.side*.22)});drawDiamond(f.x,f.y,13,layer.hex,"F")
    }else if(layer.shape==="stripe"){
      for(const sign of[-1,1]){const s=toScreen({x:geo.n.x*(layer.offset+sign*layer.width/2),y:geo.n.y*(layer.offset+sign*layer.width/2)});drawDiamond(s.x,s.y,14,layer.hex)}
    }
  }
}
function drawDisc(targetCtx,targetCx,targetCy,targetR,showGuides=false){
  targetCtx.save();targetCtx.beginPath();targetCtx.arc(targetCx,targetCy,targetR,0,Math.PI*2);targetCtx.clip();
  targetCtx.imageSmoothingEnabled=true;targetCtx.drawImage(paintCanvas,targetCx-targetR,targetCy-targetR,targetR*2,targetR*2);
  const gloss=targetCtx.createRadialGradient(targetCx-targetR*.28,targetCy-targetR*.36,targetR*.04,targetCx,targetCy,targetR*1.05);
  gloss.addColorStop(0,"rgba(255,255,255,.12)");gloss.addColorStop(.42,"rgba(255,255,255,.015)");gloss.addColorStop(1,"rgba(0,0,0,.16)");
  targetCtx.fillStyle=gloss;targetCtx.fillRect(targetCx-targetR,targetCy-targetR,targetR*2,targetR*2);
  if(viewMode==="daylight"&&isTranslucentProfile(profile())){
    const material=targetCtx.createRadialGradient(targetCx,targetCy,targetR*.12,targetCx,targetCy,targetR);
    material.addColorStop(0,"rgba(255,255,255,.035)");
    material.addColorStop(.65,"rgba(255,255,255,0)");
    material.addColorStop(1,"rgba(0,0,0,.06)");
    targetCtx.fillStyle=material;targetCtx.fillRect(targetCx-targetR,targetCy-targetR,targetR*2,targetR*2);
  }
  targetCtx.restore();
  targetCtx.beginPath();targetCtx.arc(targetCx,targetCy,targetR,0,Math.PI*2);targetCtx.strokeStyle="rgba(255,255,255,.34)";targetCtx.lineWidth=Math.max(8,targetR*.038);targetCtx.stroke();
  targetCtx.beginPath();targetCtx.arc(targetCx,targetCy,targetR*.91,0,Math.PI*2);targetCtx.strokeStyle="rgba(255,255,255,.11)";targetCtx.lineWidth=2;targetCtx.stroke()
}
function render(){
  renderQueued=false;regionColorCache.clear();makePaintImage();ctx.clearRect(0,0,W,H);drawDisc(ctx,cx,cy,R);
  // Consumer editing must always show the active boundary, even when a saved
  // Technical Studio project has disabled guide visibility. Do not alter the
  // saved guide preference; Technical mode keeps its original behavior.
  if(appMode==="client"){if(selected>=0&&layers[selected])drawLineForLayer(layers[selected],true)}
  else if($("showGuides").checked)layers.forEach((l,i)=>drawLineForLayer(l,i===selected));
  const ss=toScreen(sample);
  if(appMode!=="client"&&sample.x*sample.x+sample.y*sample.y<=1){
    ctx.save();ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.beginPath();ctx.arc(ss.x,ss.y,6,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(ss.x-10,ss.y);ctx.lineTo(ss.x+10,ss.y);ctx.moveTo(ss.x,ss.y-10);ctx.lineTo(ss.x,ss.y+10);ctx.stroke();ctx.restore()
  }
  updateSample()
}
function requestRender(force=false){if(force){if(renderQueued)cancelAnimationFrame(renderQueued);renderQueued=false;render();return}if(!renderQueued)renderQueued=requestAnimationFrame(render)}
function sampleColorAt(x,y){
  const ix=clamp(Math.floor((x+1)*.5*PAINT_SIZE),0,PAINT_SIZE-1),iy=clamp(Math.floor((y+1)*.5*PAINT_SIZE),0,PAINT_SIZE-1),d=paintedImage?.data;
  if(!d)return $("baseHex").value;const p=(iy*PAINT_SIZE+ix)*4;return rgbHex([d[p],d[p+1],d[p+2]])
}
function updateSample(){
  $("sampleHex").textContent=sampleColorAt(sample.x,sample.y);
  $("samplePos").textContent=Math.abs(sample.x)<.015&&Math.abs(sample.y)<.015?"Center":`${Math.round(sample.x*100)}%, ${Math.round(sample.y*100)}%`;
  $("layerCount").textContent=layers.length;
  const active=layers.filter(l=>layerCovers(l,sample.x,sample.y)),st=confidenceForActive(active);$("sampleConfidence").textContent=statusLabel(st);$("sampleConfidence").className="confidence "+st;$("photoAnchorAlert").classList.toggle("hidden",st!=="photo-anchor");updateGuard()
}
function selectLayer(i){
  selected=i;renderLayerList();syncEditor();if(i>=0)$("editDetails").open=true;requestRender()
}
function addDye(name,hex,clear=false){mutate(()=>{layers.push(newLayer(name,hex,clear));selected=layers.length-1},`${name} added`);if(appMode==="client")$("editDetails").open=true}
function renderLayerList(){
  const box=$("layerList");box.innerHTML="";$("emptyLayers").classList.toggle("hidden",layers.length>0);
  [...layers].reverse().forEach((l,reverseIndex)=>{
    const i=layers.length-1-reverseIndex,row=document.createElement("div");row.className="layer"+(i===selected?" selected":"");
    row.innerHTML=`<div class="chip" style="background:${l.hex}"></div>
      <div><div class="layer-name">${i+1}. ${escapeHtml(l.name)}</div><div class="layer-meta">${shapeLabel(l.shape)} · ${l.hex} · ${l.strength}% · ${clamp(Math.round(+l.passes||1),1,12)} pass(es) · ${escapeHtml(methodForDyeLayer(l))}</div></div>
      <div class="layer-actions"><button class="up" title="Apply later" ${i===layers.length-1?"disabled":""}>↑</button><button class="down" title="Apply earlier" ${i===0?"disabled":""}>↓</button><button class="remove danger" title="Delete">×</button></div>`;
    row.onclick=e=>{if(!e.target.closest("button"))selectLayer(i)};
    row.querySelector(".up").onclick=()=>moveLayer(i,1);row.querySelector(".down").onclick=()=>moveLayer(i,-1);row.querySelector(".remove").onclick=()=>removeLayer(i);box.appendChild(row)
  })
}
function moveLayer(i,dir){mutate(()=>{const j=i+dir;if(j<0||j>=layers.length)return;[layers[i],layers[j]]=[layers[j],layers[i]];if(selected===i)selected=j;else if(selected===j)selected=i},"Layer order changed")}
function removeLayer(i){mutate(()=>{layers.splice(i,1);if(!layers.length)selected=-1;else selected=clamp(selected-(selected>=i?1:0),0,layers.length-1)},"Dye block removed")}
function syncEditor(){
  const has=selected>=0&&layers[selected];$("noSelection").classList.toggle("hidden",!!has);$("editorControls").classList.toggle("hidden",!has);if(!has)return;
  const l=layers[selected];$("shape").value=l.shape;$("strength").value=l.strength;$("strengthOut").textContent=l.strength+"%";$("layerPasses").value=String(clamp(Math.round(+l.passes||1),1,12));$("layerMethod").value=methodForDyeLayer(l);
  $("angle").value=Math.round(l.angle);$("angleOut").textContent=Math.round(l.angle)+"°";$("position").value=Math.round(l.offset*100);$("positionOut").textContent=Math.round(l.offset*100)+"%";
  $("stripeWidth").value=Math.round(l.width*100);$("widthOut").textContent=Math.round(l.width*100)+"%";
  $("angleBox").classList.toggle("hidden",l.shape==="full");$("positionBox").classList.toggle("hidden",l.shape==="full");$("widthBox").classList.toggle("hidden",l.shape!=="stripe");$("flipBox").classList.toggle("hidden",l.shape==="full")
}
function editorLiveChange(){
  if(selected<0)return;const l=layers[selected];l.shape=$("shape").value;l.strength=+$("strength").value;l.passes=clamp(Math.round(+$("layerPasses").value||1),1,12);l.method=$("layerMethod").value;l.angle=+$("angle").value;l.offset=+$("position").value/100;l.width=+$("stripeWidth").value/100;
  renderLayerList();syncEditor();requestRender()
}
function renderSwatches(){
  const q=$("search").value.trim().toLowerCase(),grid=$("swatchGrid");grid.innerHTML="";
  dyes.filter(d=>d[0]===activeGroup&&(!q||d[1].toLowerCase().includes(q)||d[2].toLowerCase().includes(q))).forEach(d=>{
    const sw=document.createElement("div");sw.className="swatch";const clear=d[3]===true,fill=clear?"linear-gradient(135deg,#fff 0 43%,#aeb8c2 43% 57%,#fff 57%)":d[2];
    sw.innerHTML=`<div class="swatch-color" style="background:${fill}"></div><div><div class="swatch-name">${escapeHtml(d[1])}</div><div class="swatch-code">${clear?"UV-only / near-clear":d[2]}</div></div>`;
    sw.onclick=()=>addDye(d[1],d[2],clear);grid.appendChild(sw)
  })
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function pointerNorm(e){const rect=canvas.getBoundingClientRect();return toNorm(e.clientX-rect.left,e.clientY-rect.top)}
function hitSelected(q,pointerType="mouse"){
  if(selected<0)return null;const l=layers[selected];if(l.shape==="full")return null;
  const geo=lineGeometry(l),touch=appMode==="client"&&(pointerType==="touch"||pointerType==="pen");
  const threshold=(touch?24:15)/R;
  if(dist(q,geo.p1)<threshold)return{type:"endpoint",other:geo.p2,oldN:geo.n};
  if(dist(q,geo.p2)<threshold)return{type:"endpoint",other:geo.p1,oldN:geo.n};
  if(dist(q,geo.center)<threshold)return{type:"move",start:q,startOffset:l.offset,normal:geo.n};
  if(l.shape==="edge"){const f={x:geo.n.x*(l.offset+l.side*.22),y:geo.n.y*(l.offset+l.side*.22)};if(dist(q,f)<threshold){mutate(()=>l.side*=-1,"Colored side flipped");return{type:"flip"}}}
  if(l.shape==="stripe"){for(const sign of[-1,1]){const p={x:geo.n.x*(l.offset+sign*l.width/2),y:geo.n.y*(l.offset+sign*l.width/2)};if(dist(q,p)<threshold)return{type:"width",normal:geo.n}}}
  if(pointLineDistance(q,geo.p1,geo.p2)<(touch?19:10)/R)return{type:"move",start:q,startOffset:l.offset,normal:geo.n};return null
}
function findBoundary(q,pointerType="mouse"){
  const touch=appMode==="client"&&(pointerType==="touch"||pointerType==="pen");
  let best=null,bestD=(touch?18:12)/R;for(let i=layers.length-1;i>=0;i--){const l=layers[i];if(l.shape==="full")continue;const g=lineGeometry(l),d=pointLineDistance(q,g.p1,g.p2);if(d<bestD){bestD=d;best=i}}return best
}
function projectGuide(q){const len=Math.hypot(q.x,q.y)||1;return{x:q.x/len*GUIDE_RADIUS,y:q.y/len*GUIDE_RADIUS}}
canvas.addEventListener("pointerdown",e=>{
  canvas.setPointerCapture(e.pointerId);const q=pointerNorm(e);dragChanged=false;let hit=hitSelected(q,e.pointerType);if(hit?.type==="flip"){drag=null;return}
  if(hit){drag={...hit,pointer:e.pointerId};return}
  const boundary=findBoundary(q,e.pointerType);if(boundary!==null){selectLayer(boundary);const l=layers[selected],g=lineGeometry(l);drag={type:"move",start:q,startOffset:l.offset,normal:g.n,pointer:e.pointerId};return}
  if(q.x*q.x+q.y*q.y<=1){sample=q;requestRender()}
});
canvas.addEventListener("pointermove",e=>{
  if(!drag||drag.pointer!==e.pointerId||selected<0)return;const q=pointerNorm(e),l=layers[selected];
  if(drag.type==="endpoint"){const p=projectGuide(q),o=drag.other,dx=p.x-o.x,dy=p.y-o.y,len=Math.hypot(dx,dy);if(len>.05){let n={x:-dy/len,y:dx/len};if(n.x*drag.oldN.x+n.y*drag.oldN.y<0)n={x:-n.x,y:-n.y};l.angle=normAngle(Math.atan2(n.y,n.x)*180/Math.PI);l.offset=clamp(n.x*p.x+n.y*p.y,-.98,.98)}}
  else if(drag.type==="move"){const delta={x:q.x-drag.start.x,y:q.y-drag.start.y};l.offset=clamp(drag.startOffset+delta.x*drag.normal.x+delta.y*drag.normal.y,-.98,.98)}
  else if(drag.type==="width"){const projected=q.x*drag.normal.x+q.y*drag.normal.y;l.width=clamp(Math.abs(projected-l.offset)*2,.03,1.9)}
  dragChanged=true;syncEditor();renderLayerList();requestRender()
});
function endPointer(e){if(drag?.pointer===e.pointerId){drag=null;if(dragChanged)commitHistory();dragChanged=false}}
canvas.addEventListener("pointerup",endPointer);canvas.addEventListener("pointercancel",endPointer);


function syncColor(colorId,hexId,affectsRender=true){
  $(colorId).oninput=e=>{$(hexId).value=e.target.value.toUpperCase();if(affectsRender)requestRender()};
  $(colorId).onchange=()=>{if(affectsRender)commitHistory()};
  $(hexId).onchange=e=>{if(validHex(e.target.value)){e.target.value=e.target.value.toUpperCase();$(colorId).value=e.target.value;if(affectsRender){requestRender();commitHistory()}}}
}
syncColor("baseColor","baseHex",true);syncColor("transmissionColor","transmissionHex",true);syncColor("customColor","customHex",false);
$("whiteDisc").onclick=()=>mutate(()=>{discAppearance=null;photoBaseSelected=false;$("baseColor").value="#FFFFFF";$("baseHex").value="#FFFFFF";const h=autoTransmissionHex("#FFFFFF");$("transmissionColor").value=h;$("transmissionHex").value=h},"White disc preset");
$("glowDisc").onclick=()=>mutate(()=>{discAppearance=null;photoBaseSelected=false;$("baseColor").value="#E9F0CF";$("baseHex").value="#E9F0CF";const h=autoTransmissionHex("#E9F0CF");$("transmissionColor").value=h;$("transmissionHex").value=h},"Glow disc preset");
$("blendMode").onchange=()=>{setModeHelp();requestRender();commitHistory()};
$("showGuides").onchange=()=>{requestRender();commitHistory()};
$("clearLayers").onclick=()=>mutate(()=>{layers=[];selected=-1},"All dye blocks cleared");
$("addCustom").onclick=()=>{const h=$("customHex").value;if(validHex(h))addDye("Custom "+h.toUpperCase(),h.toUpperCase());else toast("Enter a valid six-digit hex code")};
["shape","strength","layerMethod","layerPasses","angle","position","stripeWidth"].forEach(id=>{$(id).addEventListener("input",editorLiveChange);$(id).addEventListener("change",commitHistory)});
$("flipSide").onclick=()=>{if(selected>=0)mutate(()=>layers[selected].side*=-1,"Colored side flipped")};
$("duplicateLayer").onclick=()=>{if(selected>=0)mutate(()=>{layers.splice(selected+1,0,deepCopy(layers[selected]));layers[selected+1].name+=" copy";selected++},"Dye block duplicated")};
$("actualTestBtn").onclick=()=>mutate(()=>{discAppearance=null;photoBaseSelected=false;
  activeProfileId="innova_champion";$("profileSelect").value=activeProfileId;
  $("baseHex").value="#38906F";$("baseColor").value="#38906F";$("transmissionHex").value="#A6C5B5";$("transmissionColor").value="#A6C5B5";
  layers=[
    {name:"UV Blast Blaze Orange",hex:"#FF7E26",strength:100,shape:"edge",angle:-19,offset:0,side:1,width:.4},
    {name:"UV Blast Green",hex:"#C3FF0C",strength:100,shape:"edge",angle:-19,offset:0,side:-1,width:.4}
  ];selected=layers.length-1;sample={x:-.35,y:0};viewMode="daylight";daylightScene="outdoor";renderProfiles();updateConditionButtons();updateSceneButtons()
},"Actual HBNF split test loaded");
$("exampleBtn").onclick=()=>mutate(()=>{discAppearance=null;photoBaseSelected=false;
  layers=[
    {name:"Fluorescent Pink",hex:"#F88DA5",strength:100,shape:"edge",angle:-78,offset:-.34,side:-1,width:.4},
    {name:"UV Blast Red",hex:"#EC1B24",strength:100,shape:"edge",angle:-18,offset:-.23,side:-1,width:.4},
    {name:"Neon Lemon Zest",hex:"#DEFD02",strength:100,shape:"edge",angle:42,offset:.04,side:1,width:.4},
    {name:"iDye Poly Blue",hex:"#1B1866",strength:100,shape:"edge",angle:102,offset:.17,side:1,width:.4}
  ];selected=layers.length-1
},"Example loaded");
$("search").oninput=renderSwatches;
document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));t.classList.add("active");activeGroup=t.dataset.group;renderSwatches()});
$("undoBtn").onclick=undo;$("redoBtn").onclick=redo;
document.addEventListener("keydown",e=>{
  const mod=e.metaKey||e.ctrlKey;if(!mod||e.key.toLowerCase()!=="z")return;
  const tag=document.activeElement?.tagName;if(tag==="INPUT"&&document.activeElement.type==="text")return;
  e.preventDefault();e.shiftKey?redo():undo()
});


$("saveProject").onclick=()=>{try{localStorage.setItem("discDyeColorBlockLabV3",stateString());toast("Project saved in this browser")}catch{toast("Browser storage is unavailable")}};
$("loadProject").onclick=()=>{try{const p=JSON.parse(localStorage.getItem("discDyeColorBlockLabV3")||"null");if(!p){toast("No saved project was found");return}mutate(()=>applyState(p),"Saved project loaded")}catch{toast("Saved project could not be loaded")}};
$("copyRecipe").onclick=async()=>{
  const regions=collectRegions(),lines=[`Surface disc color: ${$("baseHex").value}`,`Photographed rim: ${discAppearance?discAppearance.rimHex+"; nominal width "+Math.round((1-discAppearance.boundary)*100)+"%; edge "+discAppearance.kind:"none detected / single tone"}`,`Transmission color: ${currentTransmissionHex()}`,`View: ${viewMode}${viewMode==="daylight"?" / "+daylightScene:""}`,`Method: ${$("methodSelect").selectedOptions[0].text}`,`Default passes for new blocks: ${activePassCount()}`,`Exact process ID: ${activeRecipeKey()||"not provided"}`,`Prediction model: ${$("blendMode").selectedOptions[0].text}`,
    ...layers.map((l,i)=>`${i+1}. ${l.name} — source ${l.hex} — application intensity ${l.strength}% — ${clamp(Math.round(+l.passes||1),1,12)} passes/coats — method ${methodForDyeLayer(l)} — ${l.shape==="full"?"whole disc":l.shape==="stripe"?`stripe, angle ${Math.round(l.angle)}°, position ${Math.round(l.offset*100)}%, width ${Math.round(l.width*100)}%`:`edge block, angle ${Math.round(l.angle)}°, position ${Math.round(l.offset*100)}%, ${l.side>0?"positive":"negative"} side`}`),
    "", "Predicted region colors:",...regions.map(r=>`${r.hex} overall; plate ${r.plateHex}; shoulder ${r.shoulderHex}; rim ${r.rimHex} — ${r.label}`),`Sampled result: ${$("sampleHex").textContent} at ${$("samplePos").textContent}`];
  try{await navigator.clipboard.writeText(lines.join("\n"));toast("Recipe copied")}catch{toast("Clipboard access was blocked")}
};


function collectRegions(){
  if(!paintedImage)makePaintImage();
  const stats=new Map(),N=180,totalPixels=paintedImage.data,totalSize=PAINT_SIZE;let total=0;
  function bucket(){return{count:0,sum:[0,0,0],zones:{plate:{count:0,sum:[0,0,0]},shoulder:{count:0,sum:[0,0,0]},rim:{count:0,sum:[0,0,0]}}}}
  function add(b,rgb){b.count++;for(let i=0;i<3;i++)b.sum[i]+=rgb[i]}
  function avg(b,fallback){return b.count?rgbHex(b.sum.map(v=>v/b.count)):fallback}
  for(let iy=0;iy<N;iy++){
    const y=((iy+.5)/N)*2-1;
    for(let ix=0;ix<N;ix++){
      const x=((ix+.5)/N)*2-1,r=Math.sqrt(x*x+y*y);if(r>1)continue;
      const key=regionKeyAt(x,y);if(!stats.has(key))stats.set(key,bucket());
      const px=clamp(Math.floor((x+1)*.5*totalSize),0,totalSize-1),py=clamp(Math.floor((y+1)*.5*totalSize),0,totalSize-1),o=(py*totalSize+px)*4;
      const rgb=[totalPixels[o],totalPixels[o+1],totalPixels[o+2]],s=stats.get(key),zone=radialZone(r);
      add(s,rgb);add(s.zones[zone],rgb);total++;
    }
  }
  return[...stats.entries()].map(([key,s])=>{
    const active=layers.filter((_,i)=>key[i]==="1"),label=active.length?`Disc + ${active.map(l=>l.name).join(" + ")}`:"Original disc only";
    const overall=avg(s,$("baseHex").value);
    return{key,count:s.count,share:s.count/total,hex:overall,label,active,
      plateHex:avg(s.zones.plate,overall),shoulderHex:avg(s.zones.shoulder,overall),rimHex:avg(s.zones.rim,overall)}
  }).filter(r=>r.share>.0005).sort((a,b)=>b.count-a.count)
}
function wrapLines(c,text,maxWidth){
  const words=text.split(/\s+/),lines=[];let line="";
  for(const w of words){const test=line?line+" "+w:w;if(c.measureText(test).width<=maxWidth)line=test;else{if(line)lines.push(line);line=w}}
  if(line)lines.push(line);return lines
}
function drawLegendRow(c,x,y,width,swatchHex,title,subtitle,rowH){
  c.fillStyle="#202a35";c.strokeStyle="#394858";c.lineWidth=1;c.beginPath();c.roundRect(x,y,width,rowH,10);c.fill();c.stroke();
  c.fillStyle=swatchHex;c.beginPath();c.roundRect(x+12,y+12,38,38,7);c.fill();c.strokeStyle="rgba(255,255,255,.35)";c.stroke();
  c.fillStyle="#f4f7f9";c.font="700 17px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif";
  const titleLines=wrapLines(c,title,width-76).slice(0,2);titleLines.forEach((line,i)=>c.fillText(line,x+62,y+23+i*20));
  c.fillStyle="#aeb8c4";c.font="14px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif";
  const subY=y+23+titleLines.length*20+4,subLines=wrapLines(c,subtitle,width-76).slice(0,2);subLines.forEach((line,i)=>c.fillText(line,x+62,subY+i*18))
}
$("exportPng").onclick=()=>{
  regionColorCache.clear();makePaintImage();const regions=collectRegions(),dyeRows=layers.length||1,regionRows=regions.length||1;
  const width=1800,margin=70,discSize=920,rightX=1060,rightW=670,rowH=96;
  const rightHeight=145+dyeRows*rowH+70+regionRows*rowH+90,height=Math.max(1120,rightHeight);
  const out=document.createElement("canvas");out.width=width;out.height=height;const c=out.getContext("2d");
  c.fillStyle="#0d131a";c.fillRect(0,0,width,height);
  c.fillStyle="#f4f7f9";c.font="800 42px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif";c.fillText("Disc Dye Color-Block Plan",margin,62);
  c.fillStyle="#aeb8c4";c.font="20px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif";
  c.fillText(`${profile()?.name||"Plastic"} · surface ${$("baseHex").value} · transmission ${currentTransmissionHex()} · ${viewMode}${viewMode==="daylight"?"/"+daylightScene:""}`,margin,96);
   if(discAppearance)c.fillText(`Photo rim ${discAppearance.rimHex} · width ~${Math.round((1-discAppearance.boundary)*100)}% · ${discAppearance.kind} border (uncalibrated)`,margin,127);
  drawDisc(c,margin+discSize/2,150+discSize/2,discSize*.46);
  c.fillStyle="#aeb8c4";c.font="16px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif";
  c.fillText("UNVALIDATED COLOR ESTIMATES: Preview HEX values are illustrative, not measured dye outcomes. Regions, overlap and backlighting may differ on real plastic. Strict matched records only.",margin,150+discSize+35);


  let y=70;c.fillStyle="#f4f7f9";c.font="800 30px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif";c.fillText("Dyes used",rightX,y);y+=28;
  c.fillStyle="#aeb8c4";c.font="15px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif";c.fillText("Listed in application order; later layers are lower in this section.",rightX,y);y+=24;
  if(!layers.length){drawLegendRow(c,rightX,y,rightW,$("baseHex").value,"No dye blocks","Only the original disc color is shown.",rowH);y+=rowH}
  else layers.forEach((l,i)=>{drawLegendRow(c,rightX,y,rightW,l.hex,`${i+1}. ${l.name} — ${l.hex}`,`${shapeLabel(l.shape)} · nominal intensity ${l.strength}% · ${clamp(Math.round(+l.passes||1),1,12)} coat(s) · ${methodForDyeLayer(l)}`,rowH);y+=rowH});
  y+=45;c.fillStyle="#f4f7f9";c.font="800 30px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif";c.fillText("Preview colors (not calibrated)",rightX,y);y+=28;
  c.fillStyle="#aeb8c4";c.font="15px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif";c.fillText(`${regions.length} distinct visible region${regions.length===1?"":"s"} detected`,rightX,y);y+=24;
  regions.forEach((r,i)=>{drawLegendRow(c,rightX,y,rightW,r.hex,`${r.hex} overall · ${Math.round(r.share*1000)/10}% · ${statusLabel(confidenceForActive(layers.filter((_,i)=>r.key[i]==="1")))}`,`${r.label} · plate ${r.plateHex} · shoulder ${r.shoulderHex} · rim ${r.rimHex}`,rowH);y+=rowH});
  c.fillStyle="#758393";c.font="14px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif";c.fillText("Generated by Dyed & Unattached Disc Dye Studio v9.3 (unvalidated color preview)",rightX,height-35);
  const link=document.createElement("a");link.download="dyed-and-unattached-disc-dye-plan-v9-3.png";link.href=out.toDataURL("image/png");link.click();toast("Labeled PNG exported")
};


function renderProfiles(){const s=$("profileSelect");s.innerHTML="";profiles.forEach(p=>{const o=document.createElement("option");o.value=p.id;o.textContent=`${p.name} — ${statusLabel(p.status)}`;s.appendChild(o)});if(!profiles.some(p=>p.id===activeProfileId))activeProfileId=profiles[0]?.id||"";s.value=activeProfileId;renderProfile();renderRecords()}
function renderProfile(){const p=profile();if(!p)return;$("profileSummary").innerHTML=`<div class="profile-badges"><span class="confidence ${p.status}">${statusLabel(p.status)}</span><span class="confidence base-only">${Math.round(p.translucency)}% translucent</span></div><strong style="display:block;margin-top:5px">${escapeHtml(p.name)}</strong><div class="small">${escapeHtml(p.plastic)} · uptake heuristic · prediction accuracy unvalidated</div><div class="small" style="margin-top:5px">${escapeHtml(p.note||"")}</div>`;$("profileNotice").innerHTML=p.status==="unavailable"?`<b>Not recommended:</b> this family lacks enough predictable uptake for precision client work without exact local testing.`:`<b>Research starting point:</b> this family uses published manufacturer traits and documented dyer outcomes. Actual surface and held-to-light colors remain selectable below.`;$("profileName").value=p.name;$("profilePlastic").value=p.plastic;$("profileOptical").value=p.optical;$("profileStatus").value=p.status;$("profileBaseColor").value=p.base;$("profileBaseHex").value=p.base;$("profileTranslucency").value=p.translucency;requestRender()}
function setMode(m){
 appMode=m;
 document.body.classList.toggle("client-mode",m==="client");
 document.body.classList.toggle("calibration-mode",m==="calibration");
 $("clientModeBtn").classList.toggle("active",m==="client");
 $("calibrationModeBtn").classList.toggle("active",m==="calibration");
 $("clientModeBtn").setAttribute("aria-pressed",String(m==="client"));
 $("calibrationModeBtn").setAttribute("aria-pressed",String(m==="calibration"));
 window.DUConsumerLayout.setView(m);
 // Both views share the same model, recipe, and layer state without resetting settings.
 renderLayerList();syncEditor();requestAnimationFrame(resizeCanvas);
}
function updateGuard(){if(!layers.some(l=>Number(l.strength??100)>0)){$("clientGuard").className="client-only warning-box";$("clientGuard").innerHTML="Add at least one dye block to evaluate design confidence.";return}const rs=collectRegions(),states=rs.filter(r=>r.key.includes("1")).map(r=>confidenceForActive(layers.filter((_,i)=>r.key[i]==="1"))),hasUnavailable=states.includes("unavailable"),hasEstimate=states.includes("estimate"),hasPhoto=states.includes("photo-anchor"),allMeasured=states.length&&states.every(s=>s==="verified"||s==="validated"),allPhotoSupported=states.length&&states.every(s=>s==="verified"||s==="validated"||s==="photo-anchor");if(hasUnavailable){$("clientGuard").className="client-only warning-box";$("clientGuard").innerHTML="<b>Do not promise this result:</b> the selected plastic family is not recommended without exact local validation."}else if(allMeasured){$("clientGuard").className="client-only ok-box";$("clientGuard").innerHTML="<b>Locally supported:</b> every visible dyed region has a measured or validated HBNF record."}else if(allPhotoSupported&&hasPhoto){$("clientGuard").className="client-only warning-box";$("clientGuard").innerHTML="<b>Matched to the actual HBNF photo test:</b> this qualitative example follows the observed green and dark-red direction. The undyed and dyed comparison discs were photographed together in each frame under the same conditions. Their absolute color still lacks color-chart calibration, so an exact match cannot be guaranteed."}else if(hasEstimate){$("clientGuard").className="client-only warning-box";$("clientGuard").innerHTML="<b>Model gaps remain:</b> at least one region relies on a low-confidence estimate, an unmeasured translucent overlap, or an undocumented custom dye."}else{$("clientGuard").className="client-only warning-box";$("clientGuard").innerHTML="<b>Research-informed preview—not a guarantee:</b> the model uses Innova-family and dye-specific evidence, but exact paid-client reproduction still requires local validation of important combinations."}}
function renderRecords(){const b=$("recordsBody");b.innerHTML="";calibrationRecords.filter(r=>r.profileId===activeProfileId).forEach(r=>{const tr=document.createElement("tr");tr.innerHTML=`<td>${escapeHtml(r.comboLabel)}</td><td>${r.measuredHex}</td><td><span class="confidence ${r.status}">${statusLabel(r.status)}</span></td><td>${r.boundarySpread} mm</td><td><button class="danger" data-r="${r.id}">×</button></td>`;b.appendChild(tr)});b.querySelectorAll("[data-r]").forEach(x=>x.onclick=()=>{calibrationRecords=calibrationRecords.filter(r=>r.id!==x.dataset.r);saveDb();renderRecords();requestRender()})}
function setModeHelp(){
 const helps={research:"Recommended. Version 9 uses a universal per-dye optical profile, material-specific uptake, separate reflection and transmission, per-pixel flight-plate/shoulder/rim optical paths, HBNF photo anchors, fluorescence, glow blocking, and exact local-record overrides.",spectral:"Legacy spectral-style comparison retained only for older saved projects.",darken:"Original Dyers Guild-style Darken comparison.",multiply:"Transparent digital-layer comparison.",subtractive:"Aggressive subtractive comparison.",normal:"Ordinary digital opacity; not recommended."};
 $("modeHelp").textContent=helps[$("blendMode").value]||helps.research;$("engineStatus").textContent=`Disc Dye Studio v9.3 — evidence-guided preview. Optical geometry and dye coefficients are provisional; ${ALL_DYE_EVIDENCE.length} provisional source observations do not establish numeric color accuracy. Translucent plates and rims are rendered separately. No quantitative accuracy guarantee.`;updateViewHelp()
}
function updateViewHelp(){const m={daylight:"For Champion-style plastic, daylight depends on viewing condition and local plastic thickness. Outdoor / held is the recommended client preview; sample the flight plate and rim separately.",uv365:"Fluorescent/UV response under a 365 nm source; UV Clear acts as an enhancer rather than a visible pale dye.",glow:"Charged-disc appearance in darkness. Dyes generally absorb and reduce glow; Proto Glow Star and Proto Glow Champion use separate base-emission priors."};$("viewConditionHelp").textContent=m[viewMode]}
function updateConditionButtons(){document.querySelectorAll(".condition").forEach(b=>b.classList.toggle("active",b.dataset.view===viewMode));$("daylightSceneBox").classList.toggle("hidden",viewMode!=="daylight"||!isTranslucentProfile());$("transmissionBox").classList.toggle("hidden",!isTranslucentProfile());updateViewHelp()}
function updateSceneButtons(){document.querySelectorAll(".scene").forEach(b=>b.classList.toggle("active",b.dataset.scene===daylightScene));updateConditionButtons()}
function referenceLayers(s){const found=s.dyes.map((name,i)=>{const d=dyes.find(x=>x[1]===name)||["Custom",name,"#888888"];return{name:d[1],hex:d[2],strength:100,shape:"edge",angle:i*(180/Math.max(1,s.dyes.length))-35,offset:(i-(s.dyes.length-1)/2)*.12,side:i%2?1:-1,width:.42}});if(s.layout==="split")found.forEach((l,i)=>{l.angle=-19;l.offset=0;l.side=i===0?-1:1});if(s.layout==="quarters")found.forEach((l,i)=>{l.angle=i*45;l.offset=0;l.side=1});if(s.layout==="rings")found.forEach((l,i)=>{l.shape="stripe";l.angle=0;l.offset=(i-.5)*.35;l.width=.42});if(s.layout==="stripe")found.forEach(l=>{l.shape="stripe";l.width=.38});if(s.layout==="thirds")found.forEach((l,i)=>{l.angle=i*60;l.offset=.05});if(s.layout==="overlap")found.forEach((l,i)=>{l.angle=i?55:-35;l.offset=0});return found}
function sampleOutputs(s){const p=profiles.find(x=>x.id===s.profile)||defaults().find(x=>x.id===s.profile)||defaults()[0],ls=referenceLayers(s),combos=[];ls.forEach(l=>combos.push([l]));if(ls.length>1&&!s.actual)combos.push(ls.slice(0,2));return combos.map(a=>{const name=a.length===1?a[0].name:"";return{label:a.map(x=>x.name).join(" + "),hex:s.observedOutputs?.[name]||researchPredict(s.base,a,"daylight",p)}})}
function renderReferences(){
 const f=$("referenceFilter").value,g=$("referenceGrid");g.innerHTML="";
 researchSamples.filter(s=>f==="all"||(f==="inventory"&&s.inventory)||(f==="star"&&s.family==="star")||(f==="champion"&&s.family==="champion")||(f==="glow"&&s.family==="glow")).forEach(s=>{
  const outs=sampleOutputs(s),colors=[s.base,...outs.map(o=>o.hex)],grad=s.layout==="rings"?`radial-gradient(circle,${colors[1]||s.base} 0 28%,${colors[2]||colors[1]||s.base} 29% 52%,${s.base} 53%)`:`conic-gradient(${colors.slice(1).map((c,i)=>`${c} ${i/colors.slice(1).length*100}% ${(i+1)/colors.slice(1).length*100}%`).join(",")||s.base})`;
  const card=document.createElement("article");card.className="reference-card";
  const actualPhotos=s.actual&&s.beforeImg&&s.afterImg?`<div class="actual-photo-pair"><div class="actual-photo"><img src="${s.beforeImg}" alt="Disc before dyeing"><span>Before: surface input ${s.base}</span></div><div class="actual-photo"><img src="${s.afterImg}" alt="Disc after UV Blast split dye"><span>After: outdoor held photo</span></div></div>`:"";
  card.innerHTML=`<div class="reference-top"><div><div class="reference-disc" style="background:${grad}"></div><div class="reference-meta">Surface ${s.base}${s.transmission?`<br>Transmission ${s.transmission}`:""}</div></div><div><div class="row spread"><h3>${escapeHtml(s.title)}</h3><span class="confidence ${s.confidence}">${statusLabel(s.confidence)}</span></div><div class="reference-meta">${escapeHtml(profiles.find(p=>p.id===s.profile)?.name||s.profile)}<br>${escapeHtml(s.method)}</div><div class="hex-list">${s.dyes.map(n=>{const d=dyes.find(x=>x[1]===n);return`<span class="hex-pill">${escapeHtml(n)} ${d?d[2]:"documented dye"}</span>`}).join("")}</div></div></div>${actualPhotos}${s.actual&&!actualPhotos?'<div class="reference-meta">Private before/after photos are not published in this Studio; interpretation only.</div>':""}<div class="reference-meta" style="margin-top:8px">${escapeHtml(s.lesson)}</div><div>${outs.map(o=>`<div class="result-key"><span style="background:${o.hex}"></span><span>${escapeHtml(o.label)} → ${s.actual?"uncalibrated photo interpretation":"model estimate"} ${o.hex}</span></div>`).join("")}</div><div class="reference-actions"><button data-load-ref="${s.id}">Load ${s.actual?"actual test":"HBNF mockup"}</button>${s.sourceUrl?`<a href="${s.sourceUrl}" target="_blank" rel="noopener">Open source</a>`:"<span class=\"small\">HBNF internal observation</span>"}</div>`;
  if(new Set(["champ_orange_dark","star_neon_triad","layered_green","proto_champ_dyeability"]).has(s.id)){
     const note=document.createElement("div");note.className="notice";
     note.textContent="ILLUSTRATIVE ANALOG: linked source used a different plastic, dye, or recipe. The preview is a model estimate, not an observed result.";
     card.prepend(note);
   }
   g.appendChild(card)
  });
 g.querySelectorAll("[data-load-ref]").forEach(b=>b.onclick=()=>loadReference(b.dataset.loadRef))
}
function loadReference(id){const s=researchSamples.find(x=>x.id===id);if(!s)return;mutate(()=>{discAppearance=null;photoBaseSelected=false;activeProfileId=s.profile;$("profileSelect").value=s.profile;$("baseHex").value=s.base;$("baseColor").value=s.base;const th=s.transmission||autoTransmissionHex(s.base,profiles.find(p=>p.id===s.profile));$("transmissionHex").value=th;$("transmissionColor").value=th;layers=referenceLayers(s);selected=layers.length-1;sample=s.actual?{x:-.35,y:0}:{x:0,y:0};viewMode="daylight";daylightScene="outdoor";renderProfiles();updateConditionButtons();updateSceneButtons()},"Reference loaded")}
function renderSourceList(){const g=$("sourceList");g.innerHTML=sourceIndex.map(x=>`<div class="research-note"><b>${escapeHtml(x[0])}</b><br>${escapeHtml(x[2])}<br><a href="${x[1]}" target="_blank" rel="noopener">Open source</a></div>`).join("")}
function showHelp(title,body,anchor=null){
  $("popoverTitle").textContent=title;$("popoverBody").textContent=body;$("backdrop").style.display="block";$("popover").style.display="block";
  const p=$("popover"),vw=innerWidth,vh=innerHeight;
  if(anchor&&vw>600){p.style.transform="";const r=anchor.getBoundingClientRect();let left=clamp(r.right+9,12,vw-p.offsetWidth-12),top=clamp(r.top-10,12,vh-p.offsetHeight-12);p.style.left=left+"px";p.style.top=top+"px"}
  else{p.style.left="50%";p.style.top="50%";p.style.transform="translate(-50%,-50%)"}
}
function closeHelp(){$("backdrop").style.display="none";$("popover").style.display="none";$("popover").style.transform=""}
document.addEventListener("click",e=>{const h=e.target.closest("[data-help]");if(h){e.preventDefault();e.stopPropagation();showHelp(h.dataset.helpTitle||"Help",h.dataset.help||"",h)}});
$("closePopover").onclick=closeHelp;$("backdrop").onclick=closeHelp;
$("globalHelp").onclick=()=>showHelp("Quick guide","Choose the closest Innova plastic family. For Champion-style plastic, enter both the surface color and held-to-light transmission color; one HEX value is not enough. Daylight, 365 nm UV, and charged glow are separate previews. Add HBNF dyes and arrange the boundaries. Research-supported means the starting model is informed by documented outcomes; only locally measured or validated records should be treated as production guarantees. Reference-library cards are original HBNF mockups and link to the posts that informed them.");
function toast(msg){const t=$("toast");t.textContent=msg;t.style.display="block";clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.style.display="none",2500)}
$("clientModeBtn").onclick=()=>setMode("client");$("calibrationModeBtn").onclick=()=>setMode("calibration");document.querySelectorAll(".condition").forEach(b=>b.onclick=()=>{viewMode=b.dataset.view;updateConditionButtons();requestRender();commitHistory()});document.querySelectorAll(".scene").forEach(b=>b.onclick=()=>{daylightScene=b.dataset.scene;updateSceneButtons();requestRender();commitHistory()});$("autoTransmission").onclick=()=>mutate(()=>{const h=autoTransmissionHex($("baseHex").value,profile());$("transmissionHex").value=h;$("transmissionColor").value=h},"Transmission color estimated");document.querySelectorAll("[data-base-preset]").forEach(b=>b.onclick=()=>mutate(()=>{discAppearance=null;photoBaseSelected=false;const h=b.dataset.basePreset;$("baseHex").value=h;$("baseColor").value=h;const th=autoTransmissionHex(h,profile());$("transmissionHex").value=th;$("transmissionColor").value=th},"Blank color changed"));$("referenceFilter").onchange=renderReferences;$("profileSelect").onchange=e=>{activeProfileId=e.target.value;const p=profile();if(p){const blank=photoBaseSelected?$("baseHex").value:p.base;$("baseHex").value=blank;$("baseColor").value=blank;const th=autoTransmissionHex(blank,p);$("transmissionHex").value=th;$("transmissionColor").value=th}renderProfile();renderRecords();renderReferences();updateSceneButtons();requestRender();commitHistory()};$("profileBaseColor").oninput=e=>$("profileBaseHex").value=e.target.value.toUpperCase();$("newProfile").onclick=()=>{const p={id:uid("p"),name:"New mapped profile",plastic:"",optical:"star",status:"research",base:"#F2F2E8",translucency:0,uptake:1,chroma:1,glow:0,reliability:.5,note:"Custom profile mapped to an Innova reference family."};profiles.push(p);activeProfileId=p.id;saveDb();renderProfiles()};$("saveProfile").onclick=()=>{const p=profile();p.name=$("profileName").value||p.name;p.plastic=$("profilePlastic").value;p.optical=$("profileOptical").value;p.status=$("profileStatus").value;p.base=validHex($("profileBaseHex").value)?$("profileBaseHex").value.toUpperCase():p.base;p.translucency=clamp(+$("profileTranslucency").value||0,0,100);const ref=defaults().find(x=>x.optical===p.optical);if(ref){p.uptake=ref.uptake;p.chroma=ref.chroma;p.glow=ref.glow;p.reliability=Math.max(p.reliability||0,ref.reliability*.85);p.note=p.note||`Mapped to ${ref.name}.`}saveDb();renderProfiles();renderReferences();toast("Profile saved")};$("deleteProfile").onclick=()=>{if(profiles.length<2)return toast("At least one profile is required");profiles=profiles.filter(p=>p.id!==activeProfileId);calibrationRecords=calibrationRecords.filter(r=>r.profileId!==activeProfileId);activeProfileId=profiles[0].id;saveDb();renderProfiles()};$("measuredColor").oninput=e=>$("measuredHex").value=e.target.value.toUpperCase();$("addCalibrationRecord").onclick=()=>{if(!layers.length)return toast("Add at least one dye block");const h=$("measuredHex").value.toUpperCase();if(!validHex(h))return toast("Enter a valid measured HEX");const a=layers.filter(l=>layerCovers(l,sample.x,sample.y)).map(l=>({...l}));if(!a.length)return toast("Place sample crosshair inside a dyed region");if(!activeRecipeKey())return toast("Enter an exact process ID first");if(isTranslucentProfile(profile()))return toast("Record translucent measurements as zone-specific evidence; whole-disc override is disabled");calibrationRecords.push({id:uid("r"),schemaVersion:6,method:activeMethod(),methodsKey:methodKey(a),defaultPassCount:activePassCount(),profileId:activeProfileId,comboKey:comboKey(a),comboLabel:a.map(l=>l.name).join(" over "),baseHex:$("baseHex").value.toUpperCase(),transmissionHex:currentTransmissionHex().toUpperCase(),daylightScene,processKey:activeRecipeKey(),region:"opaque-overall",measuredHex:h,status:$("recordStatus").value,repeatCount:+$("repeatCount").value||1,boundarySpread:+$("boundarySpread").value||0,recipeVersion:$("recipeVersion").value,notes:$("recordNotes").value});saveDb();renderRecords();requestRender();toast("Calibration saved")};$("exportCalibration").onclick=()=>{const bl=new Blob([JSON.stringify({version:1,profiles,records:calibrationRecords},null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(bl);a.download="disc-dye-calibration-database.json";a.click();URL.revokeObjectURL(a.href)};$("importCalibration").onclick=()=>$("importCalibrationFile").click();$("productionRecipeKey").onchange=()=>{regionColorCache.clear();requestRender(true);commitHistory()};$("methodSelect").onchange=()=>{regionColorCache.clear();requestRender(true);commitHistory()};$("passCount").onchange=()=>{const v=activePassCount();$("passCount").value=String(v);regionColorCache.clear();requestRender(true);commitHistory()};$("importCalibrationFile").onchange=async e=>{try{const d=JSON.parse(await e.target.files[0].text());profiles=(Array.isArray(d.profiles)?d.profiles:[]).filter(allowedProfile).map(p=>p.id==="innova_color_glow_champion"?{...p,id:"innova_classic_glow_champion",name:"Innova Classic Glow Champion — legacy glow reference",plastic:"Innova Classic Glow Champion",optical:"classic-glow-champion"}:p);
 if(!profiles.length)profiles=defaults();
 for(const entry of defaults())if(!profiles.some(p=>p.id===entry.id))profiles.push(entry);
 calibrationRecords=(Array.isArray(d.records)?d.records:[]).map(r=>r.profileId==="innova_color_glow_champion"?{...r,profileId:"innova_classic_glow_champion"}:r);
 activeProfileId=profiles[0].id;saveDb();renderProfiles();toast("Calibration imported")}catch{toast("Invalid calibration file")}};window.addEventListener("resize",resizeCanvas);

// v9.2 reusable evidence layer. No numerical calibration is inferred from photographs.
const EVIDENCE_OBSERVATIONS=[{"id":"A01","worker":"A","sourceUrl":"https://prochemicalanddye.com/wp-content/uploads/2026/02/Disc-Dyeing-directions2-1.pdf","evidenceType":"GUIDANCE","plastic":"Any","baseColor":"NA","dyes":"PRO Chemical disc dyes","medium":"Hot dip","concentration":"1 tsp dye / 16 oz water","temperature":"Disc <=120F recommended","duration":"NR","result":"Manufacturer starting recipe; not a verified saturation outcome","limitations":"No experimental photo; Plastic; dye identity; uptake; time; measured disc temperature","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A02","worker":"A","sourceUrl":"https://prochemicalanddye.com/wp-content/uploads/2026/02/Disc-Dyeing-directions2-1.pdf","evidenceType":"GUIDANCE","plastic":"Any","baseColor":"NA","dyes":"PRO Chemical disc dyes","medium":"Lotion","concentration":"1/2 tsp dye + 1 tsp hot water + 2 oz lotion","temperature":"Disc <=120F recommended","duration":"NR","result":"Manufacturer starting recipe; potency depends on dye and conditions","limitations":"No experimental photo; Plastic; color; applied quantity; time; uptake","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A03","worker":"A","sourceUrl":"https://prochemicalanddye.com/wp-content/uploads/2026/02/Disc-Dyeing-directions2-1.pdf","evidenceType":"GUIDANCE","plastic":"Any","baseColor":"NA","dyes":"PRO Chemical disc dyes","medium":"Floetrol","concentration":"1/2 tsp dye + 1 tsp hot water + 4 oz Floetrol + 3–4 drops silicone","temperature":"Disc <=120F recommended","duration":"NR","result":"Manufacturer starting recipe; not a calibrated dye-response curve","limitations":"No experimental photo; Dye identity; plastic; time; dye availability at contact","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A04","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/11an9b6/disc_dyeing_wiki","evidenceType":"GUIDANCE","plastic":"Innova Star; Champion; GStar","baseColor":"Varies","dyes":"Unspecified","medium":"Various","concentration":"NR","temperature":"NR","duration":"NR","result":"Community reference rates all three 5/5 for dye acceptance; does not establish equal rates or fading","limitations":"No standardized comparison attached to rating; Method; substrate color; exposure; aging; scoring basis","photo":"unknown","verification":"key post accessible and claim qualitatively cross-checked; original photograph/color NOT calibrated"},{"id":"A05","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/tspj5w","evidenceType":"PAIR","plastic":"Latitude 64 Gold Line","baseColor":"White","dyes":"Multiple PRO Chemical colors","medium":"Lotion","concentration":"1/2 tsp loosely packed dye + acetone sufficient to dissolve + 4 oz Queen Helene lotion","temperature":"Ambient approximately 66F; no added heat","duration":"24 h","result":"Photographed 24 h result in same-disc duration comparison","limitations":"User photo; no calibration; Dye-specific mass; applied thickness; quantitative color; repeatability","photo":"unknown","verification":"key post accessible and claim qualitatively cross-checked; original photograph/color NOT calibrated"},{"id":"A06","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/tspj5w","evidenceType":"PAIR","plastic":"Latitude 64 Gold Line","baseColor":"White","dyes":"Multiple PRO Chemical colors","medium":"Lotion","concentration":"Same formulation as A05","temperature":"Ambient approximately 66F; no added heat","duration":"48 h","result":"Photographed 48 h result; documented exposure-time comparison","limitations":"User photo; no calibration; Color measurement; replicates; applied thickness; exact dye mass","photo":"unknown","verification":"key post accessible and claim qualitatively cross-checked; original photograph/color NOT calibrated"},{"id":"A07","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/x048uy","evidenceType":"PRACTICE","plastic":"Innova Star; Latitude 64 Gold Line","baseColor":"NR","dyes":"NR","medium":"Floetrol","concentration":"NR","temperature":"Heat lamp; disc temperature NR","duration":"Approximately 45 min","result":"Dyer reported satisfying transfers at this exposure for these plastic families","limitations":"Uncalibrated posted photos; Blank color; lamp geometry; temperature; bed alterations; dose","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A08","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/x048uy","evidenceType":"PRACTICE","plastic":"Innova Champion; Latitude 64 Opto","baseColor":"NR","dyes":"NR","medium":"Floetrol","concentration":"NR","temperature":"Heat lamp; disc temperature NR","duration":"Approximately 90 min","result":"Same dyer used longer heating for these plastics; bed was reused and altered","limitations":"Uncalibrated posted photos; Controlled equivalence; source color; bed composition after reuse; temperature","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A09","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/qw030w","evidenceType":"PRACTICE","plastic":"Innova Star; Kastaplast K1","baseColor":"NR","dyes":"NR","medium":"Floetrol","concentration":"NR","temperature":"Heated; temperature NR","duration":"Approximately 2 h","result":"Dyer described satisfactory transfers in multi-disc comparison","limitations":"Uncalibrated posted photos; Dose; actual temperatures; equivalent blank colors; replication","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A10","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/qw030w","evidenceType":"PRACTICE","plastic":"Dynamic Discs Lucid; Westside VIP","baseColor":"NR","dyes":"NR","medium":"Floetrol","concentration":"NR","temperature":"Heated; temperature NR","duration":"Approximately 4 h","result":"Same dyer reported requiring longer exposure for comparable-looking results","limitations":"Uncalibrated posted photos; Disc color; medium quantity; actual heat; independent plastic effect","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A11","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/1hoewka","evidenceType":"PAIR","plastic":"Latitude 64 Opto Saint","baseColor":"NR","dyes":"PRO Chemical neon colors","medium":"Lotion over clear glue","concentration":"1 tsp dye + 2 tsp hot water + 4 oz lotion","temperature":"Approximately 20C ambient","duration":"24 h","result":"Author reported comparatively weak or pale transfer","limitations":"User photos; uncontrolled; Dye quantities per color; applied depth; blank-to-blank variability","photo":"unknown","verification":"key post accessible and claim qualitatively cross-checked; original photograph/color NOT calibrated"},{"id":"A12","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/1hoewka","evidenceType":"PAIR","plastic":"Latitude 64 Opto Saint","baseColor":"NR","dyes":"PRO Chemical neon colors","medium":"Lotion over clear glue","concentration":"Reported same recipe and bed as A11","temperature":"Dehydrator approximately 40C","duration":"7 h","result":"Author reported much stronger saturation after heated exposure","limitations":"User photos; uncontrolled; Independent temperature effect; actual surface temperature; exact starting disc match","photo":"unknown","verification":"key post accessible and claim qualitatively cross-checked; original photograph/color NOT calibrated"},{"id":"A13","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/xb1wk7","evidenceType":"CASE","plastic":"Innova Champion Wraith F2","baseColor":"Yellow","dyes":"PRO Chemical bright yellow; clear orange; pinkish red","medium":"Floetrol with silicone","concentration":"NR","temperature":"Ambient bathroom approximately 90F","duration":"12 h","result":"Weak transfer compared with vivid dye bed; author reported some muddiness","limitations":"Uncalibrated photos; Silicone distribution; actual disc temperature; dye loading; blank optical density","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A14","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/xb1wk7","evidenceType":"CASE","plastic":"Innova Star Corvette F2","baseColor":"Yellow; previously worm-dip dyed","dyes":"PRO Chemical bright yellow; clear orange; pinkish red","medium":"Floetrol with silicone","concentration":"NR","temperature":"Ambient bathroom approximately 90F","duration":"12 h","result":"Weak or muddy result; preexisting yellow dye confounds comparison","limitations":"Uncalibrated photos; Original pre-dye spectrum; loading; contact consistency; silicone arrangement","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A15","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/xb1wk7","evidenceType":"CASE","plastic":"Innova Glow Champion Valkyrie F2","baseColor":"Glow plastic","dyes":"PRO Chemical bright yellow; clear orange; pinkish red","medium":"Floetrol with silicone","concentration":"NR","temperature":"Ambient bathroom approximately 90F","duration":"12 h","result":"Weak visual transfer despite promising-looking bed","limitations":"Uncalibrated photos; Glow substrate characteristics; spectral response; temperature; dose","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A16","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/nmzkqz","evidenceType":"CASE","plastic":"Innova Champion TeeBird F2","baseColor":"Clear yellow","dyes":"iDye Poly blue; PRO Chemical green and Fern","medium":"Clear glue bed with acetone dye","concentration":"NR","temperature":"Ambient approximately 75F","duration":"Approximately 36 h","result":"Author reported weaker color than desired, especially green","limitations":"Uncalibrated photos; Exact dose; dye batch; thickness; reflected versus transmitted appearance","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A17","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/nmzkqz","evidenceType":"CASE","plastic":"Innova Star Wombat3","baseColor":"White","dyes":"Assorted PRO Chemical dyes","medium":"Shaving cream","concentration":"NR","temperature":"Ambient approximately 75F","duration":"Approximately 36 h","result":"Stronger visible color but blotchy transfer versus author's Champion example","limitations":"Uncalibrated photos; Medium and starting color both changed; dye identity; applied quantity","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A18","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/s1jhh3","evidenceType":"CASE","plastic":"Innova Star; GStar","baseColor":"NR","dyes":"PRO Chemical dyes","medium":"Floetrol","concentration":"NR","temperature":"240W lamp approximately 18 in away; disc temperature NR","duration":"4–6 h","result":"Author reported muddied or blurred shapes despite dye transfer","limitations":"Uncalibrated photos; Actual temperatures; exact plastic by disc; bed motion; colorant dose","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A19","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/s1jhh3","evidenceType":"CASE","plastic":"Innova Champion","baseColor":"NR","dyes":"PRO Chemical dyes","medium":"Floetrol","concentration":"NR","temperature":"Intermittent heat; disc temperature NR","duration":"Approximately 12 h","result":"Author reported blurry pattern","limitations":"Uncalibrated photos; Heat-cycle profile; polymer state; bed movement; dye loading","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A20","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/s1jhh3","evidenceType":"CASE","plastic":"Innova Champion","baseColor":"NR","dyes":"PRO Chemical dyes","medium":"Floetrol","concentration":"NR","temperature":"No added heat","duration":"Approximately 16 h","result":"Author also reported blurry pattern without heating","limitations":"Uncalibrated photos; Relative dye spread; bed formulation; geometry; age","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A21","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/144u5nc","evidenceType":"PAIR","plastic":"Trash Panda InnerCore baseline","baseColor":"NR","dyes":"Regular Rit; formulation unspecified","medium":"Shaving cream","concentration":"NR","temperature":"No added heat reported","duration":"24 h","result":"Author reported essentially no dye uptake","limitations":"Photos uncontrolled; details limited; Precise regular Rit product; original color; plastic batch","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A22","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/144u5nc","evidenceType":"PAIR","plastic":"Trash Panda InnerCore baseline","baseColor":"NR","dyes":"Rit DyeMore Synthetic","medium":"Shaving cream","concentration":"NR","temperature":"No added heat reported","duration":"24 h","result":"Same practitioner reported successful uptake with synthetic-compatible dye","limitations":"Photos uncontrolled; details limited; Exact dye color; matched sample control; dose; repetition","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A23","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/dthqa6","evidenceType":"CASE","plastic":"Innova DX","baseColor":"NR","dyes":"iDye Poly","medium":"Shaving cream","concentration":"NR","temperature":"NR","duration":"Approximately 40 h","result":"Practitioner reported weak transfer despite long exposure","limitations":"Uncalibrated photos; Temperature; exact DX run; concentration; full preparation","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A24","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/q2zvip","evidenceType":"CASE","plastic":"Innova Pro Roc3","baseColor":"NR","dyes":"NR","medium":"Dye bed; recipe NR","concentration":"NR","temperature":"NR","duration":"Approximately 46 h","result":"Author reported only subtle color after prolonged exposure","limitations":"Uncalibrated photos; Dye formulation; disc color; heat; exposure uniformity","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A25","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/166nimh","evidenceType":"CASE","plastic":"Innova Champion Mako3","baseColor":"Red","dyes":"Red; orange; yellow","medium":"Floetrol","concentration":"NR","temperature":"No added heat","duration":"NR","result":"Author reported little visible change; yellow/orange contrast poor","limitations":"Uncalibrated photos; Dye uptake independent of visible contrast; time; dose","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A26","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/vfuydx","evidenceType":"CASE","plastic":"Innova GStar TL","baseColor":"NR","dyes":"PRO Chemical dyes","medium":"White glue bed with acetone dye","concentration":"NR","temperature":"NR","duration":"NR","result":"Dyer displayed visibly successful dyed designs across GStar discs","limitations":"Uncalibrated photos; Blank color; heat; duration; aging; batch variability","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A27","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/1l4vhsm","evidenceType":"PRACTICE","plastic":"Translucent disc; plastic unspecified","baseColor":"Clear","dyes":"NR","medium":"NR","concentration":"NR","temperature":"NR","duration":"NR","result":"Practitioner found appearance strongly dependent on backlighting; unlit result appeared darker than intended","limitations":"Photos uncalibrated; Plastic identity; dye identity; backdrop; light intensity; optical thickness","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"A28","worker":"A","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/zzg50j","evidenceType":"CASE","plastic":"Innova Champion","baseColor":"NR","dyes":"NR","medium":"Floetrol","concentration":"NR","temperature":"Approximately 95–100F reported heating condition","duration":"Approximately 2 h heated plus 10–12 h unheated","result":"Practitioner reported good transfer despite Champion requiring more exposure","limitations":"Uncalibrated photos; Whether temperature was disc or ambient; exact recipe; blank color; quantified saturation","photo":"unknown","verification":"research-worker extraction; source-level review pending"},{"id":"WB001","worker":"B","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/kcxuna","evidenceType":"D-report","plastic":"Innova Star mini","baseColor":"White","dyes":"Jacquard iDye Poly 451 Blue","medium":"Warm water","concentration":"NR","temperature":"Warm; unmeasured","duration":"10min to overnight","result":"Progressively deeper purple rather than expected blue","limitations":"Exact dose and temperature NR","photo":"NR","verification":"key post accessible and claim qualitatively cross-checked; original photograph/color NOT calibrated"},{"id":"WB002","worker":"B","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/m7240v","evidenceType":"D-report","plastic":"Innova Star","baseColor":"White","dyes":"Jacquard iDye Poly 451 Blue","medium":"Water","concentration":"Several concentrations","temperature":"Room temperature and heated","duration":"15min to 10h","result":"Blue dye produced light through dark purple; heating accelerated darkening","limitations":"Concentrations unquantified; no instrumental color values","photo":"NR","verification":"key post accessible and claim qualitatively cross-checked; original photograph/color NOT calibrated"},{"id":"WB003","worker":"B","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/k6llhy","evidenceType":"D-photo","plastic":"Glow disc; exact plastic NR","baseColor":"White","dyes":"Jacquard iDye Poly 451 Blue; comparison with 459 Turquoise","medium":"Hot water dip","concentration":"NR","temperature":"Hot; unmeasured","duration":"Repeated ~30sec dips","result":"Blue appeared purple and darkened with successive dips; turquoise differed","limitations":"Exact plastic and concentration NR","photo":"Yes","verification":"key post accessible and claim qualitatively cross-checked; original photograph/color NOT calibrated"},{"id":"WB004","worker":"B","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/10vk3qb","evidenceType":"D-photo","plastic":"Innova Star Jay","baseColor":"NR","dyes":"Pro Chemical & Dye DGD888 Neon Royal Purple","medium":"Clear glue; acetone dye","concentration":"0.5tsp per 2oz acetone","temperature":"Up to ~110F","duration":"24h total; ~5h heated","result":"Neon Royal Purple transferred very weakly","limitations":"Starting color and exact bed chemistry incomplete","photo":"Yes","verification":"research-worker extraction; source-level review pending"},{"id":"WB005","worker":"B","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/10vk3qb","evidenceType":"D-photo","plastic":"TSA Aura Construct","baseColor":"NR","dyes":"Pro Chemical & Dye DGD888 Neon Royal Purple","medium":"Clear glue; acetone dye","concentration":"0.5tsp per 2oz acetone","temperature":"Up to ~110F","duration":"24h total; ~5h heated","result":"Neon Royal Purple transferred very weakly","limitations":"Different plastic; original color NR","photo":"Yes","verification":"research-worker extraction; source-level review pending"},{"id":"WB006","worker":"B","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/17xo30c","evidenceType":"D-photo","plastic":"NR","baseColor":"NR","dyes":"Pro Chemical & Dye neon pink and neon purple; Jacquard iDye Poly blue and black","medium":"Clear glue; acetone","concentration":"NR","temperature":"115F","duration":"9h","result":"Neon pink/purple regions transferred faintly while iDye Poly blue/black were substantially stronger","limitations":"Exact neon SKUs and plastic NR","photo":"Yes","verification":"research-worker extraction; source-level review pending"},{"id":"WB007","worker":"B","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/1i74pvg","evidenceType":"D-photo","plastic":"Innova Star Wraith","baseColor":"White","dyes":"Pro Chemical & Dye Fluorescent Pink DGD301; Neon Key Lime DGD700; other PCAD colors","medium":"Clear glue; acetone","concentration":"NR","temperature":"No deliberate heating","duration":"24h","result":"Visible multicolor dye; maker wanted greater fluorescent-color saturation","limitations":"Individual dye responses not isolated","photo":"Yes","verification":"research-worker extraction; source-level review pending"},{"id":"WB008","worker":"B","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/nmzkqz","evidenceType":"D-photo","plastic":"Innova Champion Teebird","baseColor":"Clear yellow","dyes":"Jacquard iDye Poly Blue; Pro Chemical & Dye green/Fern","medium":"Clear glue; acetone","concentration":"NR","temperature":"~75F","duration":"~36h","result":"Blue regions developed, but overall color retention was weaker than desired","limitations":"Exact ProChem green identity and individual exposures uncertain","photo":"Yes","verification":"research-worker extraction; source-level review pending"},{"id":"WB009","worker":"B","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/iyayof","evidenceType":"D-report","plastic":"Innova Star","baseColor":"Yellow","dyes":"Jacquard iDye Poly blue and green","medium":"NR","concentration":"NR","temperature":"NR","duration":"NR","result":"Result described as muddy brown rather than clean green","limitations":"Exact dye shades, medium, and process NR","photo":"No","verification":"research-worker extraction; source-level review pending"},{"id":"WB010","worker":"B","sourceUrl":"https://www.dgcoursereview.com/threads/how-to-get-true-colors-on-non-white-plastics.134835","evidenceType":"D-photo","plastic":"Innova Star","baseColor":"Orange","dyes":"Jacquard iDye Poly blue and purple","medium":"NR","concentration":"NR","temperature":"NR","duration":"NR","result":"Blue became grayish/black; purple became maroon","limitations":"Dose, medium, exposure NR; comparison photograph available","photo":"Yes","verification":"research-worker extraction; source-level review pending"},{"id":"WB011","worker":"B","sourceUrl":"https://www.dgcoursereview.com/threads/how-to-get-true-colors-on-non-white-plastics.134835","evidenceType":"D-photo","plastic":"Innova Star Katana","baseColor":"Orange","dyes":"Red and blue dyes; manufacturer NR","medium":"Shaving cream","concentration":"NR","temperature":"NR","duration":"NR","result":"Brown and maroon developed instead of expected bright colors","limitations":"Exact dyes and conditions NR","photo":"Yes","verification":"research-worker extraction; source-level review pending"},{"id":"WB012","worker":"B","sourceUrl":"https://www.dgcoursereview.com/threads/how-to-get-true-colors-on-non-white-plastics.134835","evidenceType":"D-photo","plastic":"Innova Star Katana","baseColor":"Orange; previously dyed","dyes":"Red and blue dyes; manufacturer NR","medium":"Powdered dye with laundry detergent","concentration":"NR","temperature":"NR","duration":"NR","result":"Second application improved red; blue remained greenish","limitations":"Prior dye and fading confound result","photo":"Yes","verification":"research-worker extraction; source-level review pending"},{"id":"WB013","worker":"B","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/1cr9wne","evidenceType":"D-report","plastic":"Teebird; plastic NR","baseColor":"Red","dyes":"Pink; yellow; orange dyes","medium":"Lotion","concentration":"NR","temperature":"NR","duration":"NR","result":"Flame-design colors barely visible against red base","limitations":"Exact dye manufacturers and conditions NR","photo":"NR","verification":"research-worker extraction; source-level review pending"},{"id":"WB014","worker":"B","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/11xzqox","evidenceType":"D-photo","plastic":"NR","baseColor":"Red","dyes":"Onyx; manufacturer not identified","medium":"NR","concentration":"NR","temperature":"NR","duration":"NR","result":"Dark smoky/marbled result; darker than intended","limitations":"Onyx manufacturer and all processing conditions NR","photo":"Yes","verification":"research-worker extraction; source-level review pending"},{"id":"WB015","worker":"B","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/us7g6n","evidenceType":"D-photo","plastic":"Innova Champion Teebird3","baseColor":"Weak pink","dyes":"Quick Coat Worm Dip UV Blast UV Yellow","medium":"Bag immersion","concentration":"NR","temperature":"NR","duration":"Longer than comparison disc","result":"Weak uptake compared with tan Gateway Evolution disc","limitations":"Exact exposure and dye quantity NR","photo":"Yes","verification":"research-worker extraction; source-level review pending"},{"id":"WB016","worker":"B","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/us7g6n","evidenceType":"D-photo","plastic":"Gateway Evolution Warrior","baseColor":"Tan","dyes":"Quick Coat Worm Dip UV Blast UV Yellow","medium":"Bag immersion","concentration":"NR","temperature":"NR","duration":"NR","result":"Strong visible color change compared with Champion Teebird3","limitations":"Two different plastics and base colors; not controlled isolation","photo":"Yes","verification":"research-worker extraction; source-level review pending"},{"id":"WB017","worker":"B","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/nubdbj","evidenceType":"D-photo","plastic":"Latitude 64 Gold Line","baseColor":"White","dyes":"Pro Chemical & Dye Bright Red; Flag Blue; Lilac; Fluorescent Pink DGD301; Neon Key Lime DGD700; Neon Lemon Zest DGD101; Caribbean; Quick Coat Red/Pink UV Blast","medium":"Lotion; selected colors combined with worm dip","concentration":"~1/3tsp powder per color mix; splash water; lotion","temperature":"NR","duration":"20h","result":"Vibrant multicolor completed disc","limitations":"Multiple dye mixtures; individual effects and ratios not fully isolated","photo":"Yes","verification":"research-worker extraction; source-level review pending"},{"id":"WB018","worker":"B","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/idwj8p","evidenceType":"D-photo","plastic":"Innova Star Boss","baseColor":"NR","dyes":"Jacquard iDye Poly Crimson 457; Orange 448; Silver Grey 462","medium":"Clear glue; acetone mixtures","concentration":"Heavy; unmeasured","temperature":"NR","duration":"NR","result":"More saturated multicolor swirl than artist's earlier attempt","limitations":"Original disc color and process controls NR","photo":"Yes","verification":"research-worker extraction; source-level review pending"},{"id":"WB019","worker":"B","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/w98x2v","evidenceType":"D-photo","plastic":"NR","baseColor":"NR","dyes":"Pro Chemical & Dye Onyx DGD608; Teal Blue DGD488; Jacquard iDye Poly Turquoise","medium":"Glue bed; heat lamp","concentration":"NR","temperature":"175W lamp ~25in away","duration":"2.5h","result":"Onyx transferred strongly; Teal Blue reportedly failed to transfer","limitations":"Same disc but distinct dye regions; precise surface temperature NR","photo":"Yes","verification":"research-worker extraction; source-level review pending"},{"id":"WB020","worker":"B","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/k3wgtz","evidenceType":"D-photo","plastic":"NR","baseColor":"NR","dyes":"Jacquard iDye Poly Black 454 then Turquoise 459","medium":"Sequential hot dips","concentration":"NR","temperature":"Heated; unmeasured","duration":"NR","result":"Black outlines developed ghosting/softening during second hot dip","limitations":"Initial color and dye concentrations NR","photo":"Yes","verification":"research-worker extraction; source-level review pending"},{"id":"WB021","worker":"B","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/ifakpa","evidenceType":"D-photo","plastic":"Dynamic Discs Lucid","baseColor":"Translucent pink","dyes":"Jacquard iDye Poly; individual colors NR","medium":"Clear glue; acetone","concentration":"NR","temperature":"NR","duration":"~8h","result":"Successful visible swirl on translucent pink plastic","limitations":"Exact dye colors NR; unsuitable for hue-specific calibration","photo":"Yes","verification":"research-worker extraction; source-level review pending"},{"id":"WB022","worker":"B","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/16gazyj","evidenceType":"D-photo","plastic":"Innova Alien; plastic NR","baseColor":"NR","dyes":"Pro Chemical & Dye Neon Lemon Zest DGD101; Neon Key Lime DGD700; Meadow; Sonic Blue","medium":"Spin dye followed by Floetrol cells","concentration":"NR","temperature":"~105F","duration":"4h heated","result":"Visible layered spin and cell effects","limitations":"Not a controlled color-mixture comparison","photo":"Yes","verification":"research-worker extraction; source-level review pending"},{"id":"WB023","worker":"B","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/1jq5vjs","evidenceType":"D-photo","plastic":"Premium plastic; exact type NR","baseColor":"White; separate glow Diamond trial","dyes":"Pro Chemical & Dye Fluorescent Pink DGD301; Neon Cerise Pink DGD388; Neon Hot Orange DGD201; Neon Royal Purple DGD888; green and yellow colors","medium":"Clear glue; acetone or denatured alcohol","concentration":"~0.5tsp reported for selected mixes; added hot water","temperature":"No heat","duration":"24h","result":"Neon pink/orange/purple results weak or unexpected relative to green/yellow","limitations":"Multiple discs; chemical and color effects not individually isolated","photo":"Yes","verification":"research-worker extraction; source-level review pending"},{"id":"QA-AC-01","worker":"Original-source 2026-10-11","sourceUrl":"https://blog.rarediscgolf.com/tutorials/how-to-dye-discs-for-beginners/","evidenceType":"GUIDANCE","plastic":"Plastic not specified","baseColor":"Unspecified","dyes":"Unspecified dye powder","medium":"Direct acetone brush painting","concentration":"Tutorial suggests 20 mL acetone plus a pinch of dye","temperature":"No heat specified; acetone flammable","duration":"Dry between coats","result":"Tutorial describes direct acetone-dye painting through a stencil with repeat coats to deepen color; no measured hue.","limitations":"No controlled starting plastic, dose, pass count or calibrated result.","photo":"Tutorial illustration, uncalibrated","verification":"Original tutorial independently read; method guidance only"},{"id":"QA-AC-02","worker":"Original-source 2026-10-11","sourceUrl":"https://www.dgcoursereview.com/threads/anybody-just-paint-it-on-mixture.157208/","evidenceType":"CASE","plastic":"Not specified","baseColor":"Not stated","dyes":"Unspecified dye","medium":"Direct acetone brush painting","concentration":"Not reported","temperature":"Not reported","duration":"One to multiple brush passes","result":"Practitioner reports one acetone-dye brush pass can show streaks, repeated passes yield bolder color; not calibrated.","limitations":"2008 report, unspecified dye and plastic, no controlled quantitative comparison.","photo":"Uncontrolled","verification":"Original DGCourseReview firsthand report independently read"},{"id":"QA-AC-03","worker":"Original-source 2026-10-11","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/odx0fn","evidenceType":"CASE","plastic":"Latitude 64 Lucid Trespass","baseColor":"Original blank not documented","dyes":"Unspecified ProChem shades, separate green worm dip","medium":"Direct acetone brush painting plus separate green worm dip","concentration":"Artist estimates around 1/8 tsp or less ProChem in less than half a shot glass of acetone; adjusted visually","temperature":"Unknown","duration":"Unknown","result":"Photo of multicolor hand-painted disc made with direct ProChem/acetone plus separate green worm dip; individual color results not isolatable.","limitations":"Mixed products, no before photo, exact shades, measured colors or exposure.","photo":"Finished disc image, uncalibrated","verification":"Original author answers independently reviewed; method established, numerical color not"},{"id":"QA-WD-04","worker":"Original-source 2026-10-11","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/jjml34","evidenceType":"GUIDANCE","plastic":"Innova Star intended by questioner","baseColor":"Unknown","dyes":"Quick Coat worm dip, colors unspecified","medium":"Worm dip direct brush painting","concentration":"Commercial formulation undiluted per practitioner","temperature":"Unknown","duration":"Reported fast; exact time unknown","result":"Practitioner reports rapid dye transfer and spotty dark patches if overloading brush; stamp interaction possible.","limitations":"Advice only, not paired measurement or exact finished color.","photo":"No controlled before-after","verification":"Original Reddit conversation independently read; guidance not quantitative"},{"id":"QA-AC-05","worker":"Manufacturer PDF verified 2026-10-12","sourceUrl":"https://prochemicalanddye.com/wp-content/uploads/2026/02/Disc-Dyeing-directions2-1.pdf","evidenceType":"GUIDANCE","plastic":"Disc golf plastic unspecified","baseColor":"Not specified","dyes":"PRO Chemical disc dyes (all colors not separately tested)","medium":"Acetone direct brush painting","concentration":"Manufacturer basic acetone-paint starting mix: 1/2 tsp powder + 2 oz acetone","temperature":"No heat step specified; acetone flammable; separate warning","duration":"Not specified","result":"Manufacturer distinguishes direct acetone painting from dye delivered into a glue bed and Floetrol bed. Starting ratio is procedural guidance, not a color response.","limitations":"No before/after measured disc, named shade, plastic type, dose per square cm or uptake curve; do not infer numeric saturation.","photo":"No controlled outcome","verification":"PRO Chemical manufacturer PDF page 1 manually source-verified 2026-10-12; recipe guidance only"},{"id":"QA-AC-06","worker":"Original author report via public Reddit 2026-10-12","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/m0m3o6","evidenceType":"CASE","plastic":"Disc plastic not documented in excerpt","baseColor":"Before color not documented","dyes":"ProChem disperse dye, precise shades not named","medium":"Direct acetone brush painting","concentration":"Artist later described approximately 3 tsp dye per 4 oz acetone, self-reported","temperature":"No temperature reported","duration":"Repeated coats; no timed dwell reported","result":"Practitioner describes painting a finished blue-purple disc with ProChem and acetone using many coats. Illustrates successful multilayer technique, not isolated spectral endpoints.","limitations":"Photo is uncontrolled, exact dye colors, plastic, exposure and before-color unknown; high stated mix ratio is not a recommended general starting recipe.","photo":"Finished-disc photo in post, no matched before-color chart","verification":"Reddit first-person author comments present in public searchable thread; qualitative, not numerical calibration"},{"id":"QA-AC-07","worker":"Practitioner method warning via public Reddit 2026-10-12","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/qc2wfe","evidenceType":"GUIDANCE","plastic":"Premium plastic generalized","baseColor":"Not specified","dyes":"Unspecified disperse dyes","medium":"Direct acetone brush painting through vinyl stencil","concentration":"Not specified","temperature":"No heat specified","duration":"Unspecified","result":"Practitioner warns that acetone mixed with dye can soften vinyl mask adhesive, leaving fuzzy stencil edges or bleed; an anecdotal method-specific risk.","limitations":"Process experience, not a measured bleed probability; not evidence that every vinyl fails or that Floetrol stencil behaves the same.","photo":"No controlled paired edge-quality measurement","verification":"Firsthand public Reddit discussion, qualitative warning only; no experimentally measured bleed rates"}];
// Original practitioner reports checked on 2026-10-13. Qualitative, never used as numeric calibration.
const FIELD_CASES=[{"id":"FIELD-AC-01","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/z3hyyr","evidenceType":"CASE","plastic":"NR","baseColor":"NR","dyes":"ProChem Sonic Blue; ProChem Fluorescent Pink; ProChem Neon Royal Purple","medium":"Direct acetone brush painting","concentration":"NR","temperature":"NR","duration":"NR","result":"Named ProChem color-block hand painting produced a finished multi-color disc; pair overlaps not isolated.","limitations":"Original plastic/color and exact order/dose unknown; uncontrolled posted photo; no isolated A/B/A+B patches.","photo":"Yes - finished disc","verification":"Creator's original recipe report reviewed from issue #62; not measured; no independent light calibration."},{"id":"FIELD-AC-02","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/lwca8t","evidenceType":"CASE","plastic":"Lightning Pro (author compares feel to Star/GStar, NOT formula match)","baseColor":"NR","dyes":"ProChem assorted; yellow; Meadow; bright red","medium":"Direct acetone paintbrush swatches on underside of disc","concentration":"1/4 tsp dye / 1.8oz acetone most colors; 1/2 tsp / 1.8oz for selected yellows/Meadow/bright red","temperature":"NR","duration":"NR","result":"Practitioner reports more successful colors after measuring mixes and testing with paintbrush swatches; real-disc colored comparison reported.","limitations":"Source plastic is Lightning Pro, not proven Star/GStar; swatch photo not instrument-controlled; individual assignments and pass count not fully documented.","photo":"Yes - posted mix/color test reported","verification":"Original Reddit practitioner comment directly reviewed 2026-10-13; physical RGB not extracted."},{"id":"FIELD-AC-03","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/zstpu5","evidenceType":"CASE","plastic":"MVP Glitch, formulation unspecified","baseColor":"NR","dyes":"PCAD dyes - four shades mixed for pink; blue/green exact shades NR","medium":"Hand painted directly with acetone/dye mix","concentration":"NR","temperature":"NR","duration":"NR","result":"Practitioner reported smooth direct-painted blue-green fade; pink tone required trial/error mixing about four PCAD shades.","limitations":"No shade identities, concentration or isolable overlap dye identity; finished artwork not calibrated.","photo":"Yes - finished disc","verification":"Original Reddit firsthand artist comments directly reviewed 2026-10-13."},{"id":"FIELD-AC-04","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/vgen28","evidenceType":"CASE","plastic":"NR","baseColor":"NR","dyes":"ProChem unnamed colors","medium":"Direct acetone/ProChem brush painting AFTER hot-dipped black outlines","concentration":"NR","temperature":"NR","duration":"NR","result":"Artist explicitly attributes colored areas to directly painted ProChem acetone dye; black outlines are a separate hot-dip process.","limitations":"Mixed sequence; exact colored dyes, base plastic/color and overlap unknown.","photo":"Yes - finished disc","verification":"Firsthand maker reply directly reviewed 2026-10-13."},{"id":"FIELD-AC-05","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/m0m3o6","evidenceType":"CASE","plastic":"NR","baseColor":"NR","dyes":"ProChem disperse dye; exact shades NR","medium":"Direct acetone paintbrush","concentration":"3 tsp / 4oz acetone, author-reported","temperature":"NR","duration":"NR","result":"Artist reports direct brushing with many coats and purple-to-blue visual transition; concentration explicitly given.","limitations":"Same URL as existing QA-AC-06; one author/case NOT independent. No dye names, substrate, baseline or control chart.","photo":"Yes - finished disc","verification":"Original practitioner reply directly reviewed 2026-10-13; merge with QA-AC-06 for independence."},{"id":"FIELD-ANALOG-01","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/1lvlhei","evidenceType":"CASE","plastic":"Halo disc with existing orange rim; subtype NR","baseColor":"Orange rim","dyes":"ProChem and iDye Poly single shades, some pre-mixed shades; exact matching subsets NR","medium":"Acetone spin dye (rotating disc)","concentration":"NR","temperature":"NR","duration":"NR","result":"Experienced artist discusses colored gradients, light applications and many passes; spin dye differs from acetone block painting.","limitations":"Spin application and blends confound direct-block dose/order; no matched swatch reference.","photo":"Yes - finished disc","verification":"Original creator reply directly reviewed 2026-10-13."},{"id":"FIELD-GLUE-01","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/sn1bow","evidenceType":"CASE","plastic":"Innova Star white F2 Dart","baseColor":"White","dyes":"ProChem Pinkish Red (other colors not individually identified)","medium":"Clear glue bed with acetone/dye solution","concentration":"1/2 tsp dye + 1 tsp hot water + 2oz acetone","temperature":"NR","duration":"24h","result":"Owner reports Pinkish Red transferred as light pink, despite dye name and mixed solution; glue-bed-specific failure.","limitations":"No controlled original RGB or comparator; NOT direct acetone painting.","photo":"Yes - finished color wheel disc","verification":"Original Reddit author specifies mix, blank and unexpected final color; directly reviewed 2026-10-13."},{"id":"FIELD-GLUE-02","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/1dh694k","evidenceType":"CASE","plastic":"NR","baseColor":"NR","dyes":"ProChem Neon Cerise Pink","medium":"Clear glue bed with acetone-mixed dye (separately compared anecdotally with Floetrol bed)","concentration":"NR","temperature":"~45min heat lamp at start; temperature NR","duration":"~36h in glue","result":"Practitioner reported weak Cerise Pink from glue despite seeing much brighter transfers in their separate Floetrol projects.","limitations":"Different discs/doses/exposures not matched; no direct painting; cannot fit cross-method multiplier.","photo":"Yes - finished disc","verification":"Original Reddit author response directly reviewed 2026-10-13."},{"id":"FIELD-FLO-01","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/v2inel","evidenceType":"CASE","plastic":"Innova Star white factory-seconds, several discs","baseColor":"White","dyes":"ProChem Dark Dungeon; Pinkish Red; Light Blue; Dandelion","medium":"Floetrol + silicone oil poured dye bed","concentration":"NR","temperature":"Heat pad high (one run reached reported 150F); varied runs","duration":"First run ~1.5h; later runs not standardized","result":"Same author systematically compared several Floetrol-bed outcomes, describing contact, heat and time differences; not a painted stencil.","limitations":"Bed depth, pressing, contact and time differ; cannot isolate dyed color coefficients.","photo":"Yes - multiple finished white Star discs","verification":"Original Reddit project explanation directly reviewed 2026-10-13; multiple within-author cases NOT independent artists."},{"id":"FIELD-FLO-02","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/qlqdj3","evidenceType":"CASE","plastic":"NR","baseColor":"NR","dyes":"ProChem Neon Hot Orange; Bright Blue; Neon Cerise Pink","medium":"Floetrol cell bed (dyed Floetrol poured)","concentration":"1/2 tsp dye + 4oz Floetrol each; maker omitted hot-water predispersal","temperature":"Oven heating reported, no controlled probe","duration":"4h in bed","result":"Maker reports bright overlapping blue/orange/pink regions from layered and dragged Floetrol dye; color attribution not isolated.","limitations":"Bed transfer, silicone/cells, time and formula differ from hot-water-mixed stencil brush application. No blank/control.","photo":"Yes - finished disc","verification":"Original maker's detailed Reddit recipe reviewed 2026-10-13."},{"id":"FIELD-OTHER-01","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/k6llhy","evidenceType":"CASE","plastic":"Glow disc, exact formulation NR","baseColor":"White","dyes":"Jacquard iDye Poly Blue; iDye Poly Turquoise","medium":"Hot water dip","concentration":"NR","temperature":"Hot dip, numeric temperature NR","duration":"Repeated ~30 second exposures","result":"Artist directly reports iDye Poly Blue appeared purple even on white glow plastic; Turquoise comparison visible.","limitations":"One practitioner/exposure, phone lighting not controlled; different chemistry than direct acetone painting.","photo":"Yes - same-post color comparison","verification":"Original maker's comment directly reviewed 2026-10-13; overlaps not established."},{"id":"FIELD-PHOTO-01","worker":"REAL-LIFE-20261013","sourceUrl":"https://dyersguild.co/colorvault/","evidenceType":"PRACTICE","plastic":"White Innova Star per expert owner visual identification; original artist has not confirmed formulation","baseColor":"White","dyes":"Handwritten labels name dye colors, not disc plastics","medium":"NR; chart labels 2/5/10 minutes but exact carrier unspecified","concentration":"NR","temperature":"NR","duration":"2/5/10 minute labels on chart","result":"Uncropped photo shows a white disc and dye-color labels. Experienced owner identifies Innova Star by appearance; artist has not confirmed formulation, dose, method, colorimetry or timed exposure. Not numeric calibration.","limitations":"Author-specific library; no calibrated RGB, exact recipe, dye mass, disc plastic or process; photo cannot be universal swatch lookup.","photo":"White disc visibly photographed; Star plastic expert owner identification, not artist-verified","verification":"2026-10-14 expert owner visually identifies white Innova Star, all writing color names. Original artist has not confirmed plastic or recipe; no measured color standard."},{"id":"FIELD-COMPARE-01","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.dgputtheads.com/how-to-dye-a-disc-golf-disc","evidenceType":"PAIR","plastic":"Multiple discs/plastics, exact matched types in chart not established","baseColor":"NR","dyes":"Jacquard iDye Poly (specific shade NR)","medium":"Acetone-water ratio swatch test","concentration":"Author identifies 3:1 acetone:water as darkest in their comparison; dye amount per line not validated","temperature":"NR","duration":"NR","result":"Author reports darkest lines in own side-by-side 75% acetone comparison across several plastics.","limitations":"Mix is water/acetone not user pure acetone direct; dye concentration/line dose and light calibration unknown; one author experiment.","photo":"Yes - comparative line marks on plastic","verification":"Practitioner tutorial directly reviewed 2026-10-13, ratios are author experience not universal dose curve."},{"id":"FIELD-TIME-01","worker":"PRACTITIONER-AUDIT-20261015","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/1l3bhjl","evidenceType":"CASE","plastic":"NR; maker's test disc plastic unspecified","baseColor":"NR","dyes":"ProChem dye-family lotion color swatches; exact shades of physical time series unspecified","medium":"Lotion dye color swatches painted directly to test disc","concentration":"0.5 tsp powder per 2 oz lotion, stated as consistent recipe","temperature":"NR","duration":"1, 5, 15, 30 minutes; 1, 6, 12, 24 hours","result":"First-person practitioner says they prepared same-recipe swatches across eight application durations and use time to choose saturation for fine stencil/lotion detailing. Relative exposure series, not calibrated color curve.","limitations":"Plastic and original color not verified, actual eight-region matched photo/illumination not verified, specific shade labels not provided, no independent replication. Practitioner advice does not validate powder-to-Floetrol or direct-acetone doses.","photo":"Finished stencil work shown; full eight-swatch comparison not independently inspected","verification":"Maker's firsthand time-series description read on original Reddit thread; author reported tests, not third-party photometric verification.","shadeMappingCertain":false},{"id":"FIELD-AC-PALETTE-01","worker":"PRACTITIONER-AUDIT-20261015","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/1lm4uak","evidenceType":"CASE","plastic":"NR; test-disc material unspecified","baseColor":"NR","dyes":"ProChem Fluorescent Pink; Neon Cerise Pink; Fuchsia; Cherry; Flame Scarlet; Neon Hot Orange; Deep Orange; Buttercup; Sun Yellow; Dandelion; Neon Lemon Zest; Neon Key Lime; Meadow; Aquatic Green; Aqua; Caribbean; Sonic Blue (several labels artist-reconstructed and uncertain)","medium":"Acetone-mixed physical swatch disc; exact placement/application process not documented","concentration":"NR","temperature":"NR","duration":"NR","result":"First-person maker posted a physical multi-color ProChem acetone-mix reference disc and a partly uncertain post hoc shade list; reported Sun Yellow and Lavender faint and Buttercup visually more orange than Deep Orange in this artist's preparation.","limitations":"Uncertain per-dot product mapping, polymer and original disc color unknown, actual application carrier after premix unspecified, dose/time/heat/lighting not controlled; never import swatch RGB as measured dye response.","photo":"Photo of swatch reference disc in maker comment (access not independently measured)","verification":"Original 2025 Reddit thread author and follow-up shade-identification comments indexed and reviewed; physical photo not downloaded/rehosted.","shadeMappingCertain":false},{"id":"FIELD-AC-SOLVENT-01","worker":"PRACTITIONER-AUDIT-20261015","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/1ewlx80","evidenceType":"CASE","plastic":"NR","baseColor":"NR","dyes":"7 iDye Poly shades and 6 ProChem Neon shades (individual colors unspecified)","medium":"Pure acetone premixing experiment; final disc application method unspecified","concentration":"NR","temperature":"Solvent heat experiment noted but no controlled disc temperature; do not heat acetone to reproduce","duration":"NR","result":"First-person maker observed iDye Poly shades responding better than several ProChem neons after pure-acetone mixing; reported no improved neon saturation from subsequent warming of mixes. Preparation-dependent and dye-family-specific negative result.","limitations":"Cannot isolate product, carrier, concentration, plastic or temperature. No controlled paired disc outcome; heating volatile acetone is a safety hazard and not a recommended intervention.","photo":"No confirmed matched before/after pair","verification":"Maker's first-person post and later follow-up read in public indexed Reddit text; uncalibrated outcome.","shadeMappingCertain":false},{"id":"FIELD-CARRIER-01","worker":"PRACTITIONER-AUDIT-20261015","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/1dvpp1a","evidenceType":"CASE","plastic":"NR; not matched across runs","baseColor":"NR","dyes":"ProChem Neon Lemon Zest; Neon Cerise Pink; Neon Royal Purple; Neon Key Lime; Neon Hot Orange; Fluorescent Pink (some shades discussed rather than each controlled)","medium":"Separate dye processes compared informally, no single measured carrier outcome","concentration":"NR","temperature":"NR","duration":"NR","result":"Different practitioners report contradictory effects of premixing hot water with neon powder, and one maker reports colors becoming more distinguishable in Floetrol versus acetone/glue applications. Evidence for method-dependent behavior, not a pooled dye-color coefficient.","limitations":"Anecdotal across runs and commenters; unknown polymer and substrate color, unknown dye doses; conflicting observations and no matched experimental controls. Do not collapse Floetrol/glue/acetone into one physical carrier.","photo":"No matched controlled outcome pair","verification":"Original 2024 Reddit participant discussion and direct maker comparisons indexed; direct contradictions intentionally retained.","shadeMappingCertain":false},{"id":"FIELD-SAME-DISC-MEDIA-01","worker":"FIRSTHAND-SAME-DISC-AUDIT-20261016","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/gnyrxc","evidenceType":"CASE","plastic":"Innova Star Rat; neon-green; author-stated","baseColor":"Neon green; original Star Rat","dyes":"RIT Synthetic red and blue; Spike-It worm dip fire red, blue, pink, pumpkin and black; recipe-specific pigments differ by sector","medium":"Six separately applied medium/process sectors on same disc, INCLUDING RIT Synthetic acetone/conditioner; RIT Synthetic lotion/lotion and lotion/conditioner; Spike-It worm dip/lotion and worm dip/glue (mixed processes)","concentration":"RIT Synthetic in acetone claimed 2:1 for conditioner sector; other pigment/bed concentrations NR","temperature":"No heat used, per maker","duration":"8h or 12h by sector; sector 1 8h, sector 2 12h, sector 3 12h, sector 4 8h, sector 5 12h, sector 6 12h","result":"Artist used six dye medium combinations on one maker-identified neon-green Star Rat and posted a physical multi-sector result. This controls the polymer and common initial color far better than unrelated photos; sector-specific dyes and time ALSO changed, so any apparent method difference is confounded and NOT a numerical or isolated carrier effect.","limitations":"Six sectors NOT an A/B split with identical dye and time. Names/dose not fully specified per region; unclear cross-contamination/order and photo calibration; base neon green changes resulting hues; no independent replica. Do not use any pixel colors as training targets.","photo":"Yes: maker posted test-disc photograph with six color/process sections; not republished or photometrically calibrated","verification":"First-person original Reddit post and six numbered sector recipes indexed and reviewed. Original image and per-sector color attribution not independently image-measured.","shadeMappingCertain":false}];
const ALL_DYE_EVIDENCE=EVIDENCE_OBSERVATIONS.concat(FIELD_CASES);
function evidenceColorFamily(h){
 const [H,S,L]=rgbToHsl(hexRgb(h));
 if(L>.83&&S<.19)return "white";
 if(L<.24&&S<.18)return "black";
 if(S<.18)return "neutral";
 if(H<15||H>=345)return "red";
 if(H<43)return "orange";
 if(H<79)return "yellow";
 if(H<168)return "green";
 if(H<207)return "aqua";
 if(H<263)return "blue";
 if(H<304)return "purple";
 return "pink";
}
function materialClass(s){
 const x=(s||"").toLowerCase();
 if(x.includes("gstar"))return "gstar";
 if(x.includes("champion")||x.includes("opto")||x.includes("lucid"))return "translucent-premium";
 if(x.includes("star")||x.includes("gold line")||x.includes("esp")||x.includes("neutron"))return "opaque-premium";
 if(x.includes("dx")||x.includes("baseline"))return "baseline";
 return "unknown";
}
function evidenceDyeFamilyMatches(userDye,reportDye){
 // A catalog swatch stores just the short color label (e.g. "Neon Key Lime"),
 // whereas a personal-inventory swatch stores "ProChem Neon Key Lime".
 // Match both to one manufacturer-qualified pigment, never to a color word
 // from a competing product family.
 const normalize=v=>String(v||"").toLowerCase()
   .replace(/pro[ -]?chemical(?:\s*&\s*dye)?/g,"prochem")
   .replace(/\bpcad\b/g,"prochem")
   .replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
 const u=normalize(userDye),r=normalize(reportDye);
 if(!u||!r)return false;
 const catalog=typeof dyes!=="undefined"?dyes.find(row=>normalize(row[1])===u):null;
 let family="",shade="";
 if(u.startsWith("prochem ")){family="prochem";shade=u.slice(8)}
 else if(u.startsWith("idye poly ")){family="idye poly";shade=u.slice(10)}
 else if(u.startsWith("uv blast ")){family="uv blast";shade=u.slice(9)}
 else if(u.endsWith(" uv blast")){family="uv blast";shade=u.slice(0,-9)}
 else if(catalog){
  if(catalog[0]==="ProChem"){family="prochem";shade=u}
  else if(catalog[0]==="iDye Poly"){family="idye poly";shade=u}
  else if(catalog[0]==="UV Blast / Quick-Coat"){family="uv blast";shade=u}
 }
 if(!family||!shade)return false;
 const escaped=shade.replace(/\s+/g,"\\s+");
 // Source lists often name the manufacturer once, followed by several
 // semicolon-separated shades: "ProChem Neon Lemon Zest; Neon Key Lime".
 // Inherit the explicit maker within that list; never mistake generic
 // words like "Royal" for the distinct shade "Neon Royal Purple".
 let inherited="";
 for(const part of String(reportDye||"").split(/[;,]/)){
  const chunk=normalize(part);
  if(!chunk)continue;
  const brand=chunk.startsWith("prochem ")?"prochem":
    chunk.startsWith("idye poly ")?"idye poly":
    chunk.startsWith("uv blast ")||chunk.endsWith(" uv blast")?"uv blast":"";
  if(brand)inherited=brand;
  if(inherited!==family)continue;
  let rest=brand&&chunk.startsWith(brand+" ")?chunk.slice(brand.length+1):chunk;
  if(family==="uv blast"&&rest.endsWith(" uv blast"))rest=rest.slice(0,-9);
  if(new RegExp("^"+escaped+"(?:\\b|$)").test(rest))return true;
 }
 return false;
}
function classifyObservedProcess(description){
 const s=String(description||"").toLowerCase();
 if(!s||s==="nr"||s==="na")return "unknown";
 // An observation involving several carriers or products cannot validate one exact method.
 // Sequential/compound processes cannot provide a whole-design carrier match.
 // Spin-dyed backgrounds + Floetrol cells and acetone-painted colors over
 // separately hot-dipped outlines are not single-method observations.
 if(/\bspin(?:[\s-]?dye(?:d|ing)?)?\b/.test(s)&&/floetrol/.test(s))return "mixed-or-compound-process";
 if(/hot[\s-]?dipp?ed|hot[\s-]?dip/.test(s)&&/acetone/.test(s)&&/paint|brush|direct/.test(s))return "mixed-or-compound-process";
 if(/worm dip|quick coat|uv blast/.test(s)){
  // Premixed liquid dye in Floetrol differs from powdered ProChem in Floetrol.
  if(/floetrol/.test(s))return /followed by|after|separate|then|bed|cells/.test(s)?"mixed-or-compound-process":"premixed-dip-floetrol";
  if(/glue|lotion|acetone/.test(s))return "mixed-or-compound-process";
  return "worm-dip";
 }
 if(/glue/.test(s)&&/acetone/.test(s))return "acetone-glue-bed";
 if(/glue/.test(s))return "glue-bed-unknown-carrier";
 if(/floetrol/.test(s)&&/paint|brush|stencil/.test(s))return "floetrol-stencil";
 if(/floetrol/.test(s)&&/bed|cell|float|poured|pour/.test(s))return "floetrol-bed";
 if(/floetrol/.test(s))return "floetrol-unspecified";
 if(/acetone/.test(s)&&/spin/.test(s))return "acetone-spin";
 if(/acetone/.test(s)&&/paint|brush|swab|direct|color block/.test(s))return "acetone-direct";
 if(/acetone/.test(s))return "acetone-unspecified";
 if(/lotion/.test(s))return "lotion";
 if(/hot dip|hot float/.test(s))return "hot-dip";
 if(/water dip|warm water/.test(s))return "water-dip";
 if(/shaving cream|shaving foam/.test(s))return "shaving-cream";
 return "unknown";
}
function evidenceScore(obs,dyes,plastic,baseFamily){
 const activeLayers=layers.filter(l=>Number(l.strength??100)>0);
 const matchingLayers=activeLayers.filter(l=>evidenceDyeFamilyMatches(l.name,obs.dyes));
 // A source naming one dye is not evidence for the entire selected stack.
 const partialDye=matchingLayers.length>0;
 const exactDye=partialDye&&matchingLayers.length===activeLayers.length&&obs.shadeMappingCertain!==false;
 const material=materialClass(plastic),obsMaterial=materialClass(obs.plastic);
 const samePlastic=plastic&&obs.plastic&&obs.plastic.toLowerCase().includes(plastic.toLowerCase());
 const sameFamily=material!=="unknown"&&obsMaterial===material;
 const baseMatch=baseFamily!=="unknown"&&obs.baseColor.toLowerCase().includes(baseFamily);
 const observedMethod=classifyObservedProcess(obs.medium||"");
 // A single-method report cannot validate an entire mixed-method stack.
 const methods=activeLayers.map(methodForDyeLayer);
 const methodMatch=observedMethod!=="unknown"&&methods.length>0&&methods.every(m=>m===observedMethod);
 const partialMethod=observedMethod!=="unknown"&&!methodMatch&&methods.some(m=>m===observedMethod);
 const methodAnalog=observedMethod!=="unknown"&&!methodMatch&&!partialMethod;
 let score=(exactDye?10:0)+(samePlastic?6:sameFamily?3:0)+(baseMatch?3:0)+(methodMatch?18:partialMethod?5:methodAnalog?-10:0);
 // A published result is more useful than general directions, but never numeric ground truth.
 if(/yes -|finished disc|swatch/i.test(String(obs.photo||'')))score+=2;
 // Method-only evidence informs technique, not a specific finished hue.
 if(!partialDye&&!samePlastic&&!sameFamily&&!methodMatch&&!partialMethod)return null;
 if(obs.evidenceType.includes("GUIDANCE"))score-=8;
 return {score,exactDye,partialDye,samePlastic:!!samePlastic,sameFamily,baseMatch,methodMatch,partialMethod,methodAnalog,observedMethod};
}
function renderEvidenceAdvisory(){
 const warningNode=$("evidenceWarnings"),linksNode=$("evidenceLinks");
 if(!warningNode||!linksNode)return;
 const activeLayers=layers.filter(l=>Number(l.strength??100)>0);
 const selected=[...new Set(activeLayers.map(l=>l.name))],p=profile(),baseFamily=evidenceColorFamily($("baseHex").value);
 if(!selected.length){warningNode.innerHTML='<div class="evidence-info">Add dyes to see source-linked warnings. Evidence remains qualitative until physically verified.</div>';linksNode.innerHTML="";return;}
 const warnings=[];
 const allMethods=[...new Set(activeLayers.map(methodForDyeLayer))];
 const method=allMethods.length===1?allMethods[0]:"mixed";
 if(method==="mixed")warnings.push("MIXED APPLICATION METHODS: each dye block has its own physical carrier and passes; no single-method photo is a complete recipe match.");
 if(allMethods.includes("acetone-direct")){
 warnings.push("PRIMARY: direct acetone/dye onto the disc, NOT an acetone-dye glue bed. Published glue-bed photographs are different-process analogies. Solvent loading, absorption and resulting hue are not calibrated. Manufacturer starting guidance is 1/2 tsp powder mixed with 2 oz acetone, not a validated saturation target. Keep acetone away from heat and ignition sources. If applying through vinyl masking, practitioners report potential adhesive softening and blurred edges.");
 if(activeLayers.every(l=>clamp(Math.round(+l.passes||1),1,12)===1))warnings.push("One brush pass can leave visible streaks; a complete solid color may require more careful passes. Do not extrapolate darkness numerically from one pass.");
 else warnings.push("Multiple direct-acetone passes may deepen color but are NOT a validated linear multiplier. Coverage and boundary bleeding remain uncertain. Per-block counts: "+activeLayers.map(l=>l.name+" "+clamp(Math.round(+l.passes||1),1,12)).join("; ")+".");
}
 if(allMethods.includes("floetrol-stencil"))warnings.push("SECONDARY: dye premixed with hot water, then Floetrol, painted onto a stencil. Floetrol dye-bed photos are not exact-process stencil evidence. A black-looking mixture can still produce pale transferred dye.");
 if(allMethods.includes("acetone-glue-bed"))warnings.push("Acetone dye in a glue bed is a different method from direct acetone color-block painting. Do not transfer exact-color predictions between them.");
 if(allMethods.includes("floetrol-bed"))warnings.push("A Floetrol dye bed differs from painting a premixed Floetrol dye onto a stencil. Do not assume the same depth or edge fidelity.");
 if(allMethods.includes("worm-dip"))warnings.push("Commercial UV Blast worm dip is its own formulation; it is not interchangeable with ProChem powder dissolved in acetone.");
 if(allMethods.includes("premixed-dip-floetrol"))warnings.push("PREMIXED DYE + FLOETROL: UV Blast/Quick-Coat liquid dye is being used with Floetrol. This differs from ProChem powder first mixed with hot water; ordinary Floetrol-bed or powder-stencil photos are not exact recipe calibration.");
 if(allMethods.includes("other"))warnings.push("One or more blocks have unknown methods; treat their process matches as unverified.");
 warnings.push("Per-block methods change warnings and evidence ranking, NOT the numerical preview. Hue/saturation and UV/glow colors are still unvalidated for the physical process. Under-specified or mixed-method posts are never exact calibration.");
 const lower=selected.map(s=>s.toLowerCase());
 const has=term=>lower.some(n=>n.includes(term));
 const cool=baseFamily==="blue"||baseFamily==="aqua"||baseFamily==="green";
 // Mixing risk is local to dyed regions. Nonoverlapping colors do not mix.
 const overlapExists=(()=>{
  for(let yi=0;yi<24;yi++)for(let xi=0;xi<24;xi++){
   const x=((xi+.5)/24)*2-1,y=((yi+.5)/24)*2-1;
   if(x*x+y*y>1)continue;
   if(activeLayers.filter(l=>layerCovers(l,x,y)).length>1)return true;
  }
  return false;
 })();
 const hotDye=lower.some(n=>/(orange|red|crimson)/.test(n));
 const usesCommercialDip=selected.some(n=>/uv blast|quick.coat|worm dip/i.test(n));
 const usesPowderDye=selected.some(n=>/prochem|idye poly/i.test(n));
 if(activeLayers.some(l=>/uv blast|quick.coat|worm dip/i.test(l.name)&&!["worm-dip","premixed-dip-floetrol"].includes(methodForDyeLayer(l))))warnings.push("CUSTOM CARRIER: UV Blast/Quick-Coat is a pre-mixed liquid, not dry ProChem powder. Check that the recorded process matches what you actually applied; do not transfer powder-dye color references.");
 if(usesCommercialDip&&usesPowderDye)warnings.push("MIXED-FORMULATION DESIGN: commercial worm dip and powdered dye occur on the same disc. Per-block methods are recorded, but no published single-recipe color calibration covers the combined applications.");
 if(has("idye poly blue"))warnings.push("Jacquard iDye Poly Blue can shift toward violet/purple even on white discs, and reported dye batches differ. Do not assume a clean blue.");
 if(activeLayers.some(l=>l.name.toLowerCase()==="prochem onyx"&&methodForDyeLayer(l)==="floetrol-stencil"))warnings.push("FIRST-PARTY: one Onyx/Floetrol painted-stencil batch looked black in its mix but dyed pale gray. Mechanism is unknown, not a general quantitative Onyx response.");
 if(has("idye poly onyx"))warnings.push("Unsupported historical product: iDye Poly Onyx is not an owned Jacquard product. Replace this saved dye with ProChem Onyx; do not reuse its calibration or evidence.");
 if(lower.some(n=>n.includes("neon")))warnings.push("Neon dyes are method-dependent. Documented clear-glue/acetone transfer failures must not be treated as proof of failure in Floetrol, or vice versa.");
 if(cool&&hotDye)warnings.push("Warm red/orange/crimson over a cool aqua, blue or green blank can become muted or muddy. Exact color on this base is not verified; preserve original plastic for reliable highlights.");
 if((baseFamily==="yellow"||baseFamily==="orange")&&(has("blue")||has("purple")))warnings.push("Blue or purple on yellow/orange premium plastic has produced brown, gray-black and maroon results. Do not promise clean green/violet from digital color-wheel mixing.");
 if(materialClass(p?.plastic)==="translucent-premium")warnings.push("Translucent discs vary strongly with backlighting and thickness; a thin plate and dark rim may not look alike. A bright preview does not establish dye saturation.");
 if(overlapExists)warnings.push("Two or more dye blocks physically overlap. Simultaneous mixing and separate dyeing passes differ; application order, reheating and dye migration can change this region.");else if(selected.length>1)warnings.push("These distinct dye regions do not currently overlap. Their colors should not be treated as a mixed-dye region; planned remasking or a second application may still change boundaries.");
 if(selected.some(x=>/uv blast|neon|fluorescent/i.test(x)))warnings.push("UV fluorescence and charged-disc phosphorescent glow are distinct. The UV/glow previews here remain uncalibrated visual estimates.");
 if(!warnings.length)warnings.push("This palette has no specific documented warning in the current provisional evidence set; that is not proof of a predictable outcome.");
 warningNode.innerHTML=warnings.map(t=>`<div class="evidence-warning">${escapeHtml(t)}</div>`).join("");
 const related=ALL_DYE_EVIDENCE.map(obs=>{const match=evidenceScore(obs,selected,p?.plastic||"",baseFamily);return match?{obs,...match}:null;}).filter(Boolean).sort((a,b)=>b.score-a.score);
 const distinct=[],seen=new Set();
 // Display diverse evidence: favor the actual application method, then give
 // named-shade analogs visibly marked as DIFFERENT METHOD. Never imply calibration.
 const take=(pool,limit)=>{for(const r of pool){
  if(distinct.length>=limit)break;
  if(seen.has(r.obs.sourceUrl))continue;
  seen.add(r.obs.sourceUrl);distinct.push(r);
 }};
 take(related.filter(r=>r.methodMatch),3);
 take(related.filter(r=>r.partialMethod),5);
 take(related.filter(r=>r.partialDye&&!r.methodMatch),5);
 take(related,6);
 const applicable=distinct.filter(r=>r.methodMatch&&!r.obs.evidenceType.includes('GUIDANCE'));
 const namedApplicable=applicable.filter(r=>r.partialDye);
 const namedOtherMethod=distinct.filter(r=>r.partialDye&&!r.methodMatch);
 linksNode.innerHTML=`<div class="evidence-info"><b>Closest practitioner / source examples:</b> ${distinct.length} linked sources shown; ${applicable.length} are same-method field reports and ${namedApplicable.length} also mention at least one selected dye shade; ${namedOtherMethod.length} mention at least one selected shade under a different or unknown method. ${!applicable.length?"No matching physical method report is shown; other-method photographs cannot predict this carrier.":""} These are qualitative case reports, not measured target colors. Exact carrier, plastic, dye, dose, coating and lighting must be established for calibration. Of ${ALL_DYE_EVIDENCE.length} provisional records, ${ALL_DYE_EVIDENCE.filter(o=>selected.some(d=>evidenceDyeFamilyMatches(d,o.dyes))).length} mention one of the selected exact dyes. ${related.length?"Only controlled identical-condition results can justify calibrated color targets.":"No close documented observation found for this combination."}</div>`+
 distinct.map(r=>`<div class="evidence-record"><span class="evidence-tag">${escapeHtml(r.obs.id)}</span><span class="evidence-tag">${r.methodMatch?"All selected blocks use this method":r.partialMethod?"PARTIAL METHOD MATCH":r.methodAnalog?"DIFFERENT METHOD":"Method not documented"}</span>${r.exactDye?'<span class="evidence-tag">All selected shades named (recipe unverified)</span>':r.partialDye?'<span class="evidence-tag">Partial shade match only</span>':''}${r.samePlastic?'<span class="evidence-tag">Named plastic</span>':r.sameFamily?'<span class="evidence-tag">Broad material analog</span>':''}
 <br><b>${escapeHtml(r.obs.result)}</b><br><span class="evidence-meta">${escapeHtml(r.obs.plastic)} · base ${escapeHtml(r.obs.baseColor)} · ${escapeHtml(r.obs.dyes)} · ${escapeHtml(r.obs.medium)} · ${escapeHtml(r.obs.duration)}<br>Missing/limits: ${escapeHtml(r.obs.limitations)}<br>Verification: ${escapeHtml(r.obs.verification||"source not checked")}; no measured numeric color data</span><br><a href="${escapeHtml(r.obs.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open original source</a></div>`).join("");
}
const previousUpdateGuard=updateGuard;
updateGuard=function(){previousUpdateGuard();renderEvidenceAdvisory();};

window.DUConsumerLayout.init();loadDb();renderProfiles();if(profile()){$("baseHex").value=profile().base;$("baseColor").value=profile().base;const th=autoTransmissionHex(profile().base,profile());$("transmissionHex").value=th;$("transmissionColor").value=th}setMode("client");setModeHelp();updateConditionButtons();updateSceneButtons();renderSwatches();renderReferences();renderSourceList();renderLayerList();syncEditor();resizeCanvas();commitHistory();
