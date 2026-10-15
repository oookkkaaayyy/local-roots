
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
{id:"hbnf_green_orange",title:"Actual HBNF Champion split: rich green and deep red",profile:"innova_champion",family:"champion",base:"#38906F",transmission:"#A6C5B5",dyes:["UV Blast Green","UV Blast Blaze Orange"],layout:"split",method:"UV Blast in HBNF Floetrol process; outdoor finished photo",lesson:"This actual result disproved the old generic model. The supplied physical result establishes two critical behaviors: UV Blast Green remains distinctly green overall, becoming more yellow-green only through the thinner, brightly transmitted flight plate; UV Blast Blaze Orange behaves as deep red and darkens strongly through the thicker rim. This is valuable qualitative region-specific evidence but is not automatically applied to arbitrary discs or unverified recipes.",confidence:"photo-anchor",inventory:true,sourceLabel:"HBNF supplied before/after photos",sourceUrl:"",actual:true,beforeImg:"data:image/jpeg;base64,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",afterImg:"data:image/jpeg;base64,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",observedOutputs:{"UV Blast Green":"#72B71A","UV Blast Blaze Orange":"#890507"}},
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
  return{name,hex:hex.toUpperCase(),strength:100,passes:activePassCount(),method:/uv blast|quick.coat|worm dip/i.test(name)?"worm-dip":activeMethod(),shape:"edge",angle,offset,side:count%2===0?1:-1,width:.42}
}
function layerCovers(layer,x,y){
  if(layer.shape==="full")return true;
  const a=layer.angle*Math.PI/180,q=Math.cos(a)*x+Math.sin(a)*y;
  if(layer.shape==="stripe")return Math.abs(q-layer.offset)<=layer.width/2;
  return layer.side>0?q>=layer.offset:q<=layer.offset;
}
function regionKeyAt(x,y){return layers.map(l=>layerCovers(l,x,y)?"1":"0").join("")}
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
function updateGuard(){if(!layers.length){$("clientGuard").className="client-only warning-box";$("clientGuard").innerHTML="Add at least one dye block to evaluate design confidence.";return}const rs=collectRegions(),states=rs.filter(r=>r.key.includes("1")).map(r=>confidenceForActive(layers.filter((_,i)=>r.key[i]==="1"))),hasUnavailable=states.includes("unavailable"),hasEstimate=states.includes("estimate"),hasPhoto=states.includes("photo-anchor"),allMeasured=states.length&&states.every(s=>s==="verified"||s==="validated"),allPhotoSupported=states.length&&states.every(s=>s==="verified"||s==="validated"||s==="photo-anchor");if(hasUnavailable){$("clientGuard").className="client-only warning-box";$("clientGuard").innerHTML="<b>Do not promise this result:</b> the selected plastic family is not recommended without exact local validation."}else if(allMeasured){$("clientGuard").className="client-only ok-box";$("clientGuard").innerHTML="<b>Locally supported:</b> every visible dyed region has a measured or validated HBNF record."}else if(allPhotoSupported&&hasPhoto){$("clientGuard").className="client-only warning-box";$("clientGuard").innerHTML="<b>Matched to the actual HBNF photo test:</b> this qualitative example follows the observed green and dark-red direction. The undyed and dyed comparison discs were photographed together in each frame under the same conditions. Their absolute color still lacks color-chart calibration, so an exact match cannot be guaranteed."}else if(hasEstimate){$("clientGuard").className="client-only warning-box";$("clientGuard").innerHTML="<b>Model gaps remain:</b> at least one region relies on a low-confidence estimate, an unmeasured translucent overlap, or an undocumented custom dye."}else{$("clientGuard").className="client-only warning-box";$("clientGuard").innerHTML="<b>Research-informed preview—not a guarantee:</b> the model uses Innova-family and dye-specific evidence, but exact paid-client reproduction still requires local validation of important combinations."}}
function renderRecords(){const b=$("recordsBody");b.innerHTML="";calibrationRecords.filter(r=>r.profileId===activeProfileId).forEach(r=>{const tr=document.createElement("tr");tr.innerHTML=`<td>${escapeHtml(r.comboLabel)}</td><td>${r.measuredHex}</td><td><span class="confidence ${r.status}">${statusLabel(r.status)}</span></td><td>${r.boundarySpread} mm</td><td><button class="danger" data-r="${r.id}">×</button></td>`;b.appendChild(tr)});b.querySelectorAll("[data-r]").forEach(x=>x.onclick=()=>{calibrationRecords=calibrationRecords.filter(r=>r.id!==x.dataset.r);saveDb();renderRecords();requestRender()})}
function setModeHelp(){
 const helps={research:"Recommended. Version 9 uses a universal per-dye optical profile, material-specific uptake, separate reflection and transmission, per-pixel flight-plate/shoulder/rim optical paths, HBNF photo anchors, fluorescence, glow blocking, and exact local-record overrides.",spectral:"Legacy spectral-style comparison retained only for older saved projects.",darken:"Original Dyers Guild-style Darken comparison.",multiply:"Transparent digital-layer comparison.",subtractive:"Aggressive subtractive comparison.",normal:"Ordinary digital opacity; not recommended."};
 $("modeHelp").textContent=helps[$("blendMode").value]||helps.research;$("engineStatus").textContent="Disc Dye Studio v9.3 — evidence-guided preview. Optical geometry and dye coefficients are provisional; 58 provisional source observations do not establish numeric color accuracy. Translucent plates and rims are rendered separately. No quantitative accuracy guarantee.";updateViewHelp()
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
  const actualPhotos=s.actual?`<div class="actual-photo-pair"><div class="actual-photo"><img src="${s.beforeImg}" alt="Disc before dyeing"><span>Before: surface input ${s.base}</span></div><div class="actual-photo"><img src="${s.afterImg}" alt="Disc after UV Blast split dye"><span>After: outdoor held photo</span></div></div>`:"";
  card.innerHTML=`<div class="reference-top"><div><div class="reference-disc" style="background:${grad}"></div><div class="reference-meta">Surface ${s.base}${s.transmission?`<br>Transmission ${s.transmission}`:""}</div></div><div><div class="row spread"><h3>${escapeHtml(s.title)}</h3><span class="confidence ${s.confidence}">${statusLabel(s.confidence)}</span></div><div class="reference-meta">${escapeHtml(profiles.find(p=>p.id===s.profile)?.name||s.profile)}<br>${escapeHtml(s.method)}</div><div class="hex-list">${s.dyes.map(n=>{const d=dyes.find(x=>x[1]===n);return`<span class="hex-pill">${escapeHtml(n)} ${d?d[2]:"documented dye"}</span>`}).join("")}</div></div></div>${actualPhotos}<div class="reference-meta" style="margin-top:8px">${escapeHtml(s.lesson)}</div><div>${outs.map(o=>`<div class="result-key"><span style="background:${o.hex}"></span><span>${escapeHtml(o.label)} → ${s.actual?"uncalibrated photo interpretation":"model estimate"} ${o.hex}</span></div>`).join("")}</div><div class="reference-actions"><button data-load-ref="${s.id}">Load ${s.actual?"actual test":"HBNF mockup"}</button>${s.sourceUrl?`<a href="${s.sourceUrl}" target="_blank" rel="noopener">Open source</a>`:"<span class=\"small\">HBNF internal observation</span>"}</div>`;
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
const FIELD_CASES=[{"id":"FIELD-AC-01","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/z3hyyr","evidenceType":"CASE","plastic":"NR","baseColor":"NR","dyes":"ProChem Sonic Blue; ProChem Fluorescent Pink; ProChem Neon Royal Purple","medium":"Direct acetone brush painting","concentration":"NR","temperature":"NR","duration":"NR","result":"Named ProChem color-block hand painting produced a finished multi-color disc; pair overlaps not isolated.","limitations":"Original plastic/color and exact order/dose unknown; uncontrolled posted photo; no isolated A/B/A+B patches.","photo":"Yes - finished disc","verification":"Creator's original recipe report reviewed from issue #62; not measured; no independent light calibration."},{"id":"FIELD-AC-02","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/lwca8t","evidenceType":"CASE","plastic":"Lightning Pro (author compares feel to Star/GStar, NOT formula match)","baseColor":"NR","dyes":"ProChem assorted; yellow; Meadow; bright red","medium":"Direct acetone paintbrush swatches on underside of disc","concentration":"1/4 tsp dye / 1.8oz acetone most colors; 1/2 tsp / 1.8oz for selected yellows/Meadow/bright red","temperature":"NR","duration":"NR","result":"Practitioner reports more successful colors after measuring mixes and testing with paintbrush swatches; real-disc colored comparison reported.","limitations":"Source plastic is Lightning Pro, not proven Star/GStar; swatch photo not instrument-controlled; individual assignments and pass count not fully documented.","photo":"Yes - posted mix/color test reported","verification":"Original Reddit practitioner comment directly reviewed 2026-10-13; physical RGB not extracted."},{"id":"FIELD-AC-03","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/zstpu5","evidenceType":"CASE","plastic":"MVP Glitch, formulation unspecified","baseColor":"NR","dyes":"PCAD dyes - four shades mixed for pink; blue/green exact shades NR","medium":"Hand painted directly with acetone/dye mix","concentration":"NR","temperature":"NR","duration":"NR","result":"Practitioner reported smooth direct-painted blue-green fade; pink tone required trial/error mixing about four PCAD shades.","limitations":"No shade identities, concentration or isolable overlap dye identity; finished artwork not calibrated.","photo":"Yes - finished disc","verification":"Original Reddit firsthand artist comments directly reviewed 2026-10-13."},{"id":"FIELD-AC-04","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/vgen28","evidenceType":"CASE","plastic":"NR","baseColor":"NR","dyes":"ProChem unnamed colors","medium":"Direct acetone/ProChem brush painting AFTER hot-dipped black outlines","concentration":"NR","temperature":"NR","duration":"NR","result":"Artist explicitly attributes colored areas to directly painted ProChem acetone dye; black outlines are a separate hot-dip process.","limitations":"Mixed sequence; exact colored dyes, base plastic/color and overlap unknown.","photo":"Yes - finished disc","verification":"Firsthand maker reply directly reviewed 2026-10-13."},{"id":"FIELD-AC-05","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/m0m3o6","evidenceType":"CASE","plastic":"NR","baseColor":"NR","dyes":"ProChem disperse dye; exact shades NR","medium":"Direct acetone paintbrush","concentration":"3 tsp / 4oz acetone, author-reported","temperature":"NR","duration":"NR","result":"Artist reports direct brushing with many coats and purple-to-blue visual transition; concentration explicitly given.","limitations":"Same URL as existing QA-AC-06; one author/case NOT independent. No dye names, substrate, baseline or control chart.","photo":"Yes - finished disc","verification":"Original practitioner reply directly reviewed 2026-10-13; merge with QA-AC-06 for independence."},{"id":"FIELD-ANALOG-01","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/1lvlhei","evidenceType":"CASE","plastic":"Halo disc with existing orange rim; subtype NR","baseColor":"Orange rim","dyes":"ProChem and iDye Poly single shades, some pre-mixed shades; exact matching subsets NR","medium":"Acetone spin dye (rotating disc)","concentration":"NR","temperature":"NR","duration":"NR","result":"Experienced artist discusses colored gradients, light applications and many passes; spin dye differs from acetone block painting.","limitations":"Spin application and blends confound direct-block dose/order; no matched swatch reference.","photo":"Yes - finished disc","verification":"Original creator reply directly reviewed 2026-10-13."},{"id":"FIELD-GLUE-01","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/sn1bow","evidenceType":"CASE","plastic":"Innova Star white F2 Dart","baseColor":"White","dyes":"ProChem Pinkish Red (other colors not individually identified)","medium":"Clear glue bed with acetone/dye solution","concentration":"1/2 tsp dye + 1 tsp hot water + 2oz acetone","temperature":"NR","duration":"24h","result":"Owner reports Pinkish Red transferred as light pink, despite dye name and mixed solution; glue-bed-specific failure.","limitations":"No controlled original RGB or comparator; NOT direct acetone painting.","photo":"Yes - finished color wheel disc","verification":"Original Reddit author specifies mix, blank and unexpected final color; directly reviewed 2026-10-13."},{"id":"FIELD-GLUE-02","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/1dh694k","evidenceType":"CASE","plastic":"NR","baseColor":"NR","dyes":"ProChem Neon Cerise Pink","medium":"Clear glue bed with acetone-mixed dye (separately compared anecdotally with Floetrol bed)","concentration":"NR","temperature":"~45min heat lamp at start; temperature NR","duration":"~36h in glue","result":"Practitioner reported weak Cerise Pink from glue despite seeing much brighter transfers in their separate Floetrol projects.","limitations":"Different discs/doses/exposures not matched; no direct painting; cannot fit cross-method multiplier.","photo":"Yes - finished disc","verification":"Original Reddit author response directly reviewed 2026-10-13."},{"id":"FIELD-FLO-01","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/v2inel","evidenceType":"CASE","plastic":"Innova Star white factory-seconds, several discs","baseColor":"White","dyes":"ProChem Dark Dungeon; Pinkish Red; Light Blue; Dandelion","medium":"Floetrol + silicone oil poured dye bed","concentration":"NR","temperature":"Heat pad high (one run reached reported 150F); varied runs","duration":"First run ~1.5h; later runs not standardized","result":"Same author systematically compared several Floetrol-bed outcomes, describing contact, heat and time differences; not a painted stencil.","limitations":"Bed depth, pressing, contact and time differ; cannot isolate dyed color coefficients.","photo":"Yes - multiple finished white Star discs","verification":"Original Reddit project explanation directly reviewed 2026-10-13; multiple within-author cases NOT independent artists."},{"id":"FIELD-FLO-02","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/qlqdj3","evidenceType":"CASE","plastic":"NR","baseColor":"NR","dyes":"ProChem Neon Hot Orange; Bright Blue; Neon Cerise Pink","medium":"Floetrol cell bed (dyed Floetrol poured)","concentration":"1/2 tsp dye + 4oz Floetrol each; maker omitted hot-water predispersal","temperature":"Oven heating reported, no controlled probe","duration":"4h in bed","result":"Maker reports bright overlapping blue/orange/pink regions from layered and dragged Floetrol dye; color attribution not isolated.","limitations":"Bed transfer, silicone/cells, time and formula differ from hot-water-mixed stencil brush application. No blank/control.","photo":"Yes - finished disc","verification":"Original maker's detailed Reddit recipe reviewed 2026-10-13."},{"id":"FIELD-OTHER-01","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.reddit.com/r/discdyeing/comments/k6llhy","evidenceType":"CASE","plastic":"Glow disc, exact formulation NR","baseColor":"White","dyes":"Jacquard iDye Poly Blue; iDye Poly Turquoise","medium":"Hot water dip","concentration":"NR","temperature":"Hot dip, numeric temperature NR","duration":"Repeated ~30 second exposures","result":"Artist directly reports iDye Poly Blue appeared purple even on white glow plastic; Turquoise comparison visible.","limitations":"One practitioner/exposure, phone lighting not controlled; different chemistry than direct acetone painting.","photo":"Yes - same-post color comparison","verification":"Original maker's comment directly reviewed 2026-10-13; overlaps not established."},{"id":"FIELD-PHOTO-01","worker":"REAL-LIFE-20261013","sourceUrl":"https://dyersguild.co/colorvault/","evidenceType":"PRACTICE","plastic":"White Innova Star per expert owner visual identification; original artist has not confirmed formulation","baseColor":"White","dyes":"Handwritten labels name dye colors, not disc plastics","medium":"NR; chart labels 2/5/10 minutes but exact carrier unspecified","concentration":"NR","temperature":"NR","duration":"2/5/10 minute labels on chart","result":"Uncropped photo shows a white disc and dye-color labels. Experienced owner identifies Innova Star by appearance; artist has not confirmed formulation, dose, method, colorimetry or timed exposure. Not numeric calibration.","limitations":"Author-specific library; no calibrated RGB, exact recipe, dye mass, disc plastic or process; photo cannot be universal swatch lookup.","photo":"White disc visibly photographed; Star plastic expert owner identification, not artist-verified","verification":"2026-10-14 expert owner visually identifies white Innova Star, all writing color names. Original artist has not confirmed plastic or recipe; no measured color standard."},{"id":"FIELD-COMPARE-01","worker":"REAL-LIFE-20261013","sourceUrl":"https://www.dgputtheads.com/how-to-dye-a-disc-golf-disc","evidenceType":"PAIR","plastic":"Multiple discs/plastics, exact matched types in chart not established","baseColor":"NR","dyes":"Jacquard iDye Poly (specific shade NR)","medium":"Acetone-water ratio swatch test","concentration":"Author identifies 3:1 acetone:water as darkest in their comparison; dye amount per line not validated","temperature":"NR","duration":"NR","result":"Author reports darkest lines in own side-by-side 75% acetone comparison across several plastics.","limitations":"Mix is water/acetone not user pure acetone direct; dye concentration/line dose and light calibration unknown; one author experiment.","photo":"Yes - comparative line marks on plastic","verification":"Practitioner tutorial directly reviewed 2026-10-13, ratios are author experience not universal dose curve."}];
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
function evidenceDyeFamilyMatches(userDye, reportDye){
 const u=(userDye||"").toLowerCase(),r=(reportDye||"").toLowerCase();
 if(u.includes("idye poly")){
  const shade=u.replace(/^.*idye poly /,"");
  return r.includes("idye poly") && new RegExp("\\b"+shade.replace(/[^a-z]/g,"")+"\\b","i").test(r);
 }
 if(u.includes("uv blast")){
  const shade=u.replace(/^.*uv blast /,"");
  return r.includes("uv blast")&&(r.includes(shade)||shade==="blaze orange"&&r.includes("orange"));
 }
 if(u.includes("prochem")){
  const shade=u.replace(/^.*prochem /,"");
  return (r.includes("pro chemical")||r.includes("pcad")||r.includes("prochem"))&&r.includes(shade);
 }
 return false;
}
function classifyObservedProcess(description){
 const s=String(description||"").toLowerCase();
 if(!s||s==="nr"||s==="na")return "unknown";
 // An observation involving several carriers or products cannot validate one exact method.
 if(/worm dip|quick coat|uv blast/.test(s)){
  if(/floetrol|glue|lotion|acetone/.test(s))return "mixed-or-compound-process";
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
 const matchingLayers=layers.filter(l=>evidenceDyeFamilyMatches(l.name,obs.dyes));
 // A source naming one dye is not evidence for the entire selected stack.
 const partialDye=matchingLayers.length>0;
 const exactDye=partialDye&&matchingLayers.length===layers.length;
 const material=materialClass(plastic),obsMaterial=materialClass(obs.plastic);
 const samePlastic=plastic&&obs.plastic&&obs.plastic.toLowerCase().includes(plastic.toLowerCase());
 const sameFamily=material!=="unknown"&&obsMaterial===material;
 const baseMatch=baseFamily!=="unknown"&&obs.baseColor.toLowerCase().includes(baseFamily);
 const observedMethod=classifyObservedProcess(obs.medium||"");
 const comparableLayers=matchingLayers.length?matchingLayers:layers;
 const methodMatch=observedMethod!=="unknown"&&comparableLayers.some(l=>methodForDyeLayer(l)===observedMethod);
 const methodAnalog=observedMethod!=="unknown"&&!methodMatch;
 let score=(exactDye?10:0)+(samePlastic?6:sameFamily?3:0)+(baseMatch?3:0)+(methodMatch?18:methodAnalog?-10:0);
 // A published result is more useful than general directions, but never numeric ground truth.
 if(/yes -|finished disc|swatch/i.test(String(obs.photo||'')))score+=2;
 // Method-only evidence informs technique, not a specific finished hue.
 if(!partialDye&&!samePlastic&&!sameFamily&&!methodMatch)return null;
 if(obs.evidenceType.includes("GUIDANCE"))score-=8;
 return {score,exactDye,partialDye,samePlastic:!!samePlastic,sameFamily,baseMatch,methodMatch,methodAnalog,observedMethod};
}
function renderEvidenceAdvisory(){
 const warningNode=$("evidenceWarnings"),linksNode=$("evidenceLinks");
 if(!warningNode||!linksNode)return;
 const selected=[...new Set(layers.map(l=>l.name))],p=profile(),baseFamily=evidenceColorFamily($("baseHex").value);
 if(!selected.length){warningNode.innerHTML='<div class="evidence-info">Add dyes to see source-linked warnings. Evidence remains qualitative until physically verified.</div>';linksNode.innerHTML="";return;}
 const warnings=[];
 const allMethods=[...new Set(layers.map(methodForDyeLayer))];
 const method=allMethods.length===1?allMethods[0]:"mixed";
 if(method==="mixed")warnings.push("MIXED APPLICATION METHODS: each dye block has its own physical carrier and passes; no single-method photo is a complete recipe match.");
 if(allMethods.includes("acetone-direct")){
 warnings.push("PRIMARY: direct acetone/dye onto the disc, NOT an acetone-dye glue bed. Published glue-bed photographs are different-process analogies. Solvent loading, absorption and resulting hue are not calibrated. Manufacturer starting guidance is 1/2 tsp powder mixed with 2 oz acetone, not a validated saturation target. Keep acetone away from heat and ignition sources. If applying through vinyl masking, practitioners report potential adhesive softening and blurred edges.");
 if(layers.every(l=>clamp(Math.round(+l.passes||1),1,12)===1))warnings.push("One brush pass can leave visible streaks; a complete solid color may require more careful passes. Do not extrapolate darkness numerically from one pass.");
 else warnings.push("Multiple direct-acetone passes may deepen color but are NOT a validated linear multiplier. Coverage and boundary bleeding remain uncertain. Per-block counts: "+layers.map(l=>l.name+" "+clamp(Math.round(+l.passes||1),1,12)).join("; ")+".");
}
 if(allMethods.includes("floetrol-stencil"))warnings.push("SECONDARY: dye premixed with hot water, then Floetrol, painted onto a stencil. Floetrol dye-bed photos are not exact-process stencil evidence. A black-looking mixture can still produce pale transferred dye.");
 if(allMethods.includes("acetone-glue-bed"))warnings.push("Acetone dye in a glue bed is a different method from direct acetone color-block painting. Do not transfer exact-color predictions between them.");
 if(allMethods.includes("floetrol-bed"))warnings.push("A Floetrol dye bed differs from painting a premixed Floetrol dye onto a stencil. Do not assume the same depth or edge fidelity.");
 if(allMethods.includes("worm-dip"))warnings.push("Commercial UV Blast worm dip is its own formulation; it is not interchangeable with ProChem powder dissolved in acetone.");
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
   if(regionKeyAt(x,y).split("1").length>2)return true;
  }
  return false;
 })();
 const hotDye=lower.some(n=>/(orange|red|crimson)/.test(n));
 const usesCommercialDip=selected.some(n=>/uv blast|quick.coat|worm dip/i.test(n));
 const usesPowderDye=selected.some(n=>/prochem|idye poly/i.test(n));
 if(layers.some(l=>/uv blast|quick.coat|worm dip/i.test(l.name)&&methodForDyeLayer(l)!=="worm-dip"))warnings.push("FORMULATION MISMATCH: UV Blast/Quick-Coat is commercially prepared worm dip. Correct this block's method to commercial worm dip; it is NOT ProChem powder in acetone.");
 if(usesCommercialDip&&usesPowderDye)warnings.push("MIXED-FORMULATION DESIGN: commercial worm dip and powdered dye occur on the same disc. Per-block methods are recorded, but no published single-recipe color calibration covers the combined applications.");
 if(has("idye poly blue"))warnings.push("Jacquard iDye Poly Blue can shift toward violet/purple even on white discs, and reported dye batches differ. Do not assume a clean blue.");
 if(layers.some(l=>l.name.toLowerCase()==="prochem onyx"&&methodForDyeLayer(l)==="floetrol-stencil"))warnings.push("FIRST-PARTY: one Onyx/Floetrol painted-stencil batch looked black in its mix but dyed pale gray. Mechanism is unknown, not a general quantitative Onyx response.");
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
 take(related.filter(r=>r.partialDye&&!r.methodMatch),5);
 take(related,6);
 const applicable=distinct.filter(r=>r.methodMatch&&!r.obs.evidenceType.includes('GUIDANCE'));
 const namedApplicable=applicable.filter(r=>r.partialDye);
 const namedOtherMethod=distinct.filter(r=>r.partialDye&&!r.methodMatch);
 linksNode.innerHTML=`<div class="evidence-info"><b>Closest practitioner / source examples:</b> ${distinct.length} linked sources shown; ${applicable.length} are same-method field reports and ${namedApplicable.length} also mention at least one selected dye shade; ${namedOtherMethod.length} mention at least one selected shade under a different or unknown method. ${!applicable.length?"No matching physical method report is shown; other-method photographs cannot predict this carrier.":""} These are qualitative case reports, not measured target colors. Exact carrier, plastic, dye, dose, coating and lighting must be established for calibration. Of 58 provisional records, ${EVIDENCE_OBSERVATIONS.filter(o=>selected.some(d=>evidenceDyeFamilyMatches(d,o.dyes))).length} mention one of the selected exact dyes. ${related.length?"Only controlled identical-condition results can justify calibrated color targets.":"No close documented observation found for this combination."}</div>`+
 distinct.map(r=>`<div class="evidence-record"><span class="evidence-tag">${escapeHtml(r.obs.id)}</span><span class="evidence-tag">${r.methodMatch?"Same application method":r.methodAnalog?"DIFFERENT METHOD":"Method not documented"}</span>${r.exactDye?'<span class="evidence-tag">All selected shades named (recipe unverified)</span>':r.partialDye?'<span class="evidence-tag">Partial shade match only</span>':''}${r.samePlastic?'<span class="evidence-tag">Named plastic</span>':r.sameFamily?'<span class="evidence-tag">Broad material analog</span>':''}
 <br><b>${escapeHtml(r.obs.result)}</b><br><span class="evidence-meta">${escapeHtml(r.obs.plastic)} · base ${escapeHtml(r.obs.baseColor)} · ${escapeHtml(r.obs.dyes)} · ${escapeHtml(r.obs.medium)} · ${escapeHtml(r.obs.duration)}<br>Missing/limits: ${escapeHtml(r.obs.limitations)}<br>Verification: ${escapeHtml(r.obs.verification||"source not checked")}; no measured numeric color data</span><br><a href="${escapeHtml(r.obs.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open original source</a></div>`).join("");
}
const previousUpdateGuard=updateGuard;
updateGuard=function(){previousUpdateGuard();renderEvidenceAdvisory();};

window.DUConsumerLayout.init();loadDb();renderProfiles();if(profile()){$("baseHex").value=profile().base;$("baseColor").value=profile().base;const th=autoTransmissionHex(profile().base,profile());$("transmissionHex").value=th;$("transmissionColor").value=th}setMode("client");setModeHelp();updateConditionButtons();updateSceneButtons();renderSwatches();renderReferences();renderSourceList();renderLayerList();syncEditor();resizeCanvas();commitHistory();
