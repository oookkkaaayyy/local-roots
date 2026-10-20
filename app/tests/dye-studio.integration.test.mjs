import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../src/App.tsx');
const legacyRoutes = read('../src/LegacyRoutes.tsx');
const dAndU = read('../src/pages/DyedUnattachedPage.tsx');
const shell = read('../src/components/Shell.tsx');
const studioHtml = read('../public/dyed-and-unattached/dye-studio/index.html');
const studioScript = read('../public/dyed-and-unattached/dye-studio/studio.js');
const studio = studioHtml + '\n' + studioScript;

test('nested route preserves D&U navigation and forwards to the same-origin studio app', () => {
  assert.match(app, /'\/dyed-and-unattached\/dye-studio'[\s\S]*?canonical:\s*'\/dyed-and-unattached\/dye-studio'/);
  assert.match(legacyRoutes, /path==='\/dyed-and-unattached\/dye-studio'\)return <DyeStudioPage\/>/);
  assert.match(dAndU, /href="\/dyed-and-unattached\/dye-studio">Dye Studio<\/a>/);
  assert.match(shell, /path\.startsWith\(`\$\{href\}\/`\)/);
  assert.match(read('../src/pages/DyeStudioPage.tsx'), /window\.location\.replace\('\/dyed-and-unattached\/dye-studio\/index\.html'\)/);
});

test('candidate retains designer controls and evidence limits', () => {
  for (const id of ['baseColor', 'layerList', 'undoBtn', 'redoBtn', 'saveProject', 'loadProject', 'copyRecipe', 'exportPng']) {
    assert.ok(studio.includes(`id="${id}"`), `missing designer control: ${id}`);
  }
  assert.match(studio, /No quantitative accuracy guarantee/);
  assert.match(studio, /preview is a model estimate, not an observed result/);
  assert.match(studio, /Two or more dye blocks physically overlap/);
  assert.match(studio, /Primary workflow: dye applied directly in acetone-based color blocks/);
  assert.match(studio, /Secondary workflow: dye first mixed with hot water, then Floetrol/);
  assert.match(studio, /classifyObservedProcess/);
  assert.match(studio, /methodAnalog/);
  assert.doesNotMatch(studio, /HBNF full-strength Floetrol application with controlled heat/);
  assert.doesNotMatch(studio, /Photo-calibrated modeling for opaque and translucent discs/);
  assert.match(studio, /100% nominal model input/);
  assert.match(studio, /NOT a measured dye concentration or validated physical recipe/);
  assert.doesNotMatch(studio, /100% full-strength HBNF production recipe/);
});

test('owned Onyx remains distinct and mobile zoom remains available', () => {
  assert.match(studio, /"ProChem Onyx"/);
  assert.match(studio, /Unsupported historical product: iDye Poly Onyx/);
  assert.match(studioScript, /\["My Inventory","ProChem Onyx","#101010"\]/);
  assert.doesNotMatch(studioScript, /\["My Inventory","iDye Poly Onyx"/);
  assert.doesNotMatch(studioScript, /\["iDye Poly","Onyx"/);
  assert.doesNotMatch(studio, /maximum-scale\s*=/i);
});

test('method classification does not confuse direct acetone with glue beds or painted stencil with beds', () => {
  assert.match(studio, /<option value="acetone-direct" selected>/);
  assert.match(studio, /<option value="floetrol-stencil">/);
  assert.match(studio, /<option value="acetone-glue-bed">/);
  assert.match(studio, /<option value="floetrol-bed">/);
  const start=studio.indexOf('function classifyObservedProcess(description){');
  const end=studio.indexOf('function evidenceScore(',start);
  assert.ok(start>=0 && end>start, 'method classifier missing');
  const classify=Function(studio.slice(start,end)+';return classifyObservedProcess')();
  const examples=[
    ['Clear glue; acetone','acetone-glue-bed'],
    ['Clear glue bed with acetone dye','acetone-glue-bed'],
    ['Floetrol painted on stencil','floetrol-stencil'],
    ['Floetrol with silicone','floetrol-unspecified'],
    ['Floetrol cells','floetrol-bed'],
    ['Lotion and worm dip','mixed-or-compound-process'],
    ['Lotion bed with ProChem powder dissolved with splash of acetone before mixing into lotion','lotion'],
    ['Spin dye followed by Floetrol cells','mixed-or-compound-process'],
    ['Direct acetone/ProChem brush painting AFTER hot-dipped black outlines','mixed-or-compound-process'],
    ['Clear glue bed with acetone-mixed dye (separately compared anecdotally with Floetrol bed)','acetone-glue-bed'],
    ['Floetrol dye','floetrol-unspecified'],
    ['Direct acetone brush painting','acetone-direct'],
    ['Quick Coat UV Blast worm dip','worm-dip'],
    ['UV Blast in HBNF Floetrol process; finished photo','premixed-dip-floetrol'],
    ['UV Blast worm dip followed by Floetrol cells','mixed-or-compound-process'],
    ['Acetone','acetone-unspecified'],
    ['NR','unknown']
  ];
  for (const [description,expected] of examples) assert.equal(classify(description),expected,description);
});

test('recipe, history and calibrated records identify the selected application method', () => {
  assert.match(studio,/method:activeMethod\(\)/);
  assert.match(studio,/"methodSelect"\)\.value=s\.method\|\|"acetone-direct"/);
  assert.match(studio,/schemaVersion:6,method:activeMethod\(\),methodsKey:methodKey\(a\),defaultPassCount:activePassCount\(\)/);
  assert.match(studio,/r\.schemaVersion===6&&r\.methodsKey===methodKey\(a\)/);
  assert.match(studio,/Method: \$\{\$\("methodSelect"\)/);
  assert.doesNotMatch(studio,/r\.schemaVersion===2/);
  assert.match(studio,/Per-block methods change warnings and evidence ranking, NOT the numerical preview/);
});

test('direct-paint pass count is persisted and does not silently reuse old calibration', () => {
  assert.match(studio,/id="passCount" type="number" min="1" max="12"/);
  assert.match(studio,/passCount:activePassCount\(\)/);
  assert.match(studio,/"passCount"\)\.value=String\(clamp\(Math\.round\(\+s\.passCount\|\|1\),1,12\)\)/);
  assert.match(studio,/Default passes for new blocks: \$\{activePassCount\(\)\}/);
  assert.match(studio,/clamp\(Math\.round\(\+l\.passes\|\|1\),1,12\)/);
  assert.match(studio,/schemaVersion:6,method:activeMethod\(\),methodsKey:methodKey\(a\),defaultPassCount:activePassCount\(\)/);
});

test('recordFor refuses mismatched per-dye carrier, pass count, base or schema', () => {
  const start=studio.indexOf('function recordFor(a){'),end=studio.indexOf('\n\nlet viewMode=',start);
  assert.ok(start>=0 && end>start,'recordFor extraction');
  const snippet=studio.slice(start,end);
  let base='#FFFFFF',defaultPasses=1;
  const records=[{
    schemaVersion:6,profileId:'innova_star',comboKey:'1',methodsKey:'["acetone-direct"]',
    baseHex:'#FFFFFF',transmissionHex:'#FFFFFF',daylightScene:'outdoor',
    processKey:'specific-recipe',method:'acetone-direct',region:'opaque-overall',
    measuredHex:'#123456',status:'verified',repeatCount:2
  }];
  const env={calibrationRecords:records,activeProfileId:'innova_star',viewMode:'daylight',
    profile:()=>({id:'innova_star'}),isTranslucentProfile:()=>false,
    activeRecipeKey:()=> 'specific-recipe',$:()=>({get value(){return base}}),
    currentTransmissionHex:()=> '#FFFFFF',daylightScene:'outdoor',
    comboKey:a=>String(a[0].passes),methodKey:a=>JSON.stringify(a.map(l=>l.method)),validHex:s=>s.length===7,
    activeMethod:()=> 'acetone-direct',activePassCount:()=>defaultPasses};
  const recordFor=Function('env','with(env){'+snippet+';return recordFor;}')(env);
  assert.equal(recordFor([{passes:1,method:'acetone-direct'}])?.measuredHex,'#123456');
  assert.equal(recordFor([{passes:1,method:'floetrol-stencil'}]),null);
  assert.equal(recordFor([{passes:2,method:'acetone-direct'}]),null);
  defaultPasses=2;
  assert.equal(recordFor([{passes:1,method:'acetone-direct'}])?.measuredHex,'#123456');
  base='#FEFFFF';assert.equal(recordFor([{passes:1,method:'acetone-direct'}]),null);
  base='#FFFFFF';records[0].repeatCount=1;
  assert.equal(recordFor([{passes:1,method:'acetone-direct'}]),null);
  records[0].repeatCount=2;records[0].status='experimental';
  assert.equal(recordFor([{passes:1,method:'acetone-direct'}]),null);
  records[0].status='verified';records[0].schemaVersion=5;
  assert.equal(recordFor([{passes:1,method:'acetone-direct'}]),null);
});

test('independent dye-block method and pass count change calibration identity', () => {
  const start=studio.indexOf('function methodForDyeLayer(l){');
  const end=studio.indexOf('function activeMethod()',start);
  assert.ok(start>=0&&end>start,'method and combo key extractable');
  const fns=Function('clamp','activeMethod',studio.slice(start,end)+';return {comboKey,methodKey,methodForDyeLayer}')(
    (x,lo,hi)=>Math.max(lo,Math.min(hi,x)),()=> 'acetone-direct');
  const a=[{name:'ProChem Onyx',hex:'#101010',strength:100,passes:1,method:'acetone-direct'}];
  assert.ok(fns.comboKey(a)!==fns.comboKey([{...a[0],passes:3}]));
  assert.ok(fns.comboKey(a)!==fns.comboKey([{...a[0],method:'floetrol-stencil'}]));
  assert.ok(fns.methodKey(a)!==fns.methodKey([{...a[0],method:'worm-dip'}]));
  assert.equal(fns.methodForDyeLayer({name:'UV Blast Green'}),'worm-dip');
  assert.match(studio,/id="layerPasses" type="number" min="1" max="12"/);
  assert.match(studio,/id="layerMethod" class="model-select"/);
  assert.match(studio,/l\.method=\$\("layerMethod"\)\.value/);
  assert.match(studio,/layers=deepCopy\(s\.layers\|\|\[\]\)\.map/);
  assert.match(studio,/Per-block counts:/);
});

test('direct-application research is source labeled without pretending measured colors', () => {
  assert.match(studio,/QA-AC-01/);
  assert.match(studio,/QA-AC-02/);
  assert.match(studio,/QA-AC-03/);
  assert.match(studio,/QA-WD-04/);
  assert.match(studio,/QA-AC-05/);
  assert.match(studio,/QA-AC-06/);
  assert.match(studio,/QA-AC-07/);
  assert.match(studio,/Of \$\{ALL_DYE_EVIDENCE\.length\} provisional records/);
  assert.match(studio,/no measured numeric color data/);
  assert.match(studio,/Manufacturer starting guidance is 1\/2 tsp powder/);
  assert.match(studio,/potential adhesive softening and blurred edges/);
  assert.match(studio,/One brush pass can leave visible streaks/);
  assert.match(studio,/Multiple direct-acetone passes may deepen color but are NOT a validated linear multiplier/);
});

test('source method matching evaluates the actual dye block rather than the project default', () => {
  assert.match(studio,/const matchingLayers=activeLayers\.filter\(l=>evidenceDyeFamilyMatches/);
  assert.match(studio,/const methods=activeLayers\.map\(methodForDyeLayer\)/);
  assert.match(studio,/methods\.every\(m=>m===observedMethod\)/);
  assert.match(studio,/const partialMethod=observedMethod!=="unknown"/);
  assert.match(studio,/MIXED APPLICATION METHODS/);
  assert.match(studio,/CUSTOM CARRIER/);
  assert.match(studio,/PREMIXED DYE \+ FLOETROL/);
  assert.match(studio,/Per-block methods change warnings and evidence ranking/);
});

test('studio uses the existing Local Roots palette without duplicate conflicting theme overrides', () => {
  assert.match(studio,/id="du-brand-integration-theme"/);
  assert.match(studio,/--panel:#fff8ee/);
  assert.match(studio,/--accent:#a7623a/);
  assert.match(studio,/\.canvas-shell\{background:linear-gradient\(145deg,#eadac5,#f7f0e4\)\}/);
  assert.doesNotMatch(studio,/id="local-roots-studio-visual-integration"/);
});

test('historical photo color anchor cannot silently calibrate an unverified process', () => {
  assert.match(studio,/numericEligible:false/);
  const i=studio.indexOf('function isExactHbnfAnchor(');
  const j=studio.indexOf('function photoAnchorFor(',i);
  assert.ok(i>=0 && j>i,'exact-anchor predicate must be present');
  const anchor={
    numericEligible:false,surfaceBase:'#38906F',transmissionBase:'#A6C5B5',
    observed:{'UV Blast Blaze Orange':{outdoor:'#890507'}}
  };
  const check=Function('hbnfPhotoAnchor','currentTransmissionHex','profile',
    studio.slice(i,j)+';return isExactHbnfAnchor;')(
    anchor,()=> '#A6C5B5',()=>({id:'innova_champion'}));
  assert.equal(check('#38906F',[{name:'UV Blast Blaze Orange',strength:100}],{id:'innova_champion'}),false);
  assert.doesNotMatch(studio,/"UV Blast Blaze Orange":\{surface:"#741013"/);
  assert.doesNotMatch(studio,/"UV Blast Blaze Orange":"#850307"/);
  assert.match(studio,/No unverified special dye-to-red overrides/);
  assert.match(studio,/valuable qualitative region-specific evidence/);
});

test('beta launch copy and PNG export include physical recipe limitations', () => {
  assert.match(studio,/Experimental beta: design dye regions/);
  assert.match(studio,/class="beta-status" role="note"/);
  assert.match(studio,/Predicted colors are illustrative/);
  assert.doesNotMatch(studio,/Integration Candidate<\/title>/);
  assert.match(studio,/historical HBNF green Champion/i);
  assert.match(studio,/nominal intensity \$\{l.strength\}% · \$\{clamp\(Math.round\(\+l.passes\|\|1\),1,12\)\} coat\(s\) · \$\{methodForDyeLayer\(l\)\}/);
  const start=studio.indexOf('$("exportPng").onclick=()=>{');
  const end=studio.indexOf('\n};',start)+3;
  assert.ok(start>0&&end>start);
  const output=[];
  const elements={baseHex:{value:'#FFFFFF'}};
  const $=id=>elements[id]||(elements[id]={textContent:'#abcdef'});
  const fakeCanvas={getContext:()=>({fillRect(){},fillText:txt=>output.push(txt)}),toDataURL:()=>'data:image/png;base64,AA'};
  const env={ $,discAppearance:null,document:{createElement:tag=>tag==='canvas'?fakeCanvas:{download:'',href:'',click(){output.push(this.download)}}},
    regionColorCache:{clear(){}},makePaintImage(){},collectRegions:()=>[{
      hex:'#B62068',share:.5,key:'1',label:'Onyx',plateHex:'#111111',shoulderHex:'#222222',rimHex:'#333333'
    }],layers:[{name:'ProChem Onyx',hex:'#101010',strength:100,passes:3,method:'floetrol-stencil',shape:'full'}],
    profile:()=>({name:'Innova Star'}),currentTransmissionHex:()=> '#FFFFFF',
    viewMode:'daylight',daylightScene:'outdoor',clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),methodForDyeLayer:l=>l.method,drawDisc(){},drawLegendRow:(ctx,x,y,w,hex,title,subtitle)=>output.push(title+' '+subtitle),
    shapeLabel:x=>x,confidenceForActive:()=> 'estimate',statusLabel:()=> 'Model estimate',toast(){}};
  Function('env','with(env){'+studio.slice(start,end)+';return $("exportPng").onclick;}')(env)();
  assert.ok(output.some(x=>x.includes('3 coat(s)')&&x.includes('floetrol-stencil')));
  assert.ok(output.some(x=>x.includes('dyed-and-unattached-disc-dye-plan')&&x.endsWith('.png')));
});

test('editor state roundtrip and undo-redo preserve block identities and physical methods', () => {
  const start=studio.indexOf('function stateObject(){'),end=studio.indexOf('function layerCovers(',start);
  assert.ok(start>=0&&end>start);
  const controls=new Map();
  const $=id=>{if(!controls.has(id))controls.set(id,{value:'',checked:true,disabled:false,textContent:'',classList:{toggle(){}},open:false});return controls.get(id)};
  $('baseHex').value='#FFFFFF';$('transmissionHex').value='#FFFFFF';
  $('blendMode').value='research';$('methodSelect').value='acetone-direct';
  $('passCount').value='1';$('productionRecipeKey').value='acetone-v1';
  const env={ $,viewMode:'daylight',daylightScene:'outdoor',activeProfileId:'innova_star',
    layers:[],selected:-1,sample:{x:0,y:0},history:[],historyIndex:-1,isRestoring:false,discAppearance:null,photoBaseSelected:false,window:{DUDiscPhoto:{syncControls(){}}},migrateProfileId:id=>id,
    clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),deepCopy:x=>JSON.parse(JSON.stringify(x)),
    activeRecipeKey:()=> $('productionRecipeKey').value,activeMethod:()=> $('methodSelect').value,
    activePassCount:()=> +$('passCount').value,normAngle:x=>x,profile:()=>({base:'#FFFFFF'}),
    autoTransmissionHex:()=> '#FFFFFF',profiles:[{id:'innova_star'}],
    renderProfiles(){},renderLayerList(){},syncEditor(){},setModeHelp(){},
    updateConditionButtons(){},updateSceneButtons(){},requestRender(){},toast(){}};
  const fns=Function('env','with(env){'+studio.slice(start,end)+';return {stateObject,stateString,applyState,commitHistory,undo,redo,mutate,newLayer};}')(env);
  fns.commitHistory();
  fns.mutate(()=>{env.layers.push(fns.newLayer('ProChem Onyx','#101010'));env.selected=0;});
  assert.equal(env.layers[0].method,'acetone-direct');
  env.layers[0].method='floetrol-stencil';env.layers[0].passes=3;fns.commitHistory();
  env.layers.push(fns.newLayer('UV Blast Green','#50ff16'));env.selected=1;fns.commitHistory();
  assert.equal(env.layers[1].method,'worm-dip');
  fns.undo();assert.equal(env.layers.length,1);assert.equal(env.layers[0].passes,3);
  fns.redo();assert.equal(env.layers.length,2);assert.equal(env.layers[1].method,'worm-dip');
  const snap=JSON.parse(fns.stateString());env.layers=[];fns.applyState(snap);
  assert.equal(env.layers[0].method,'floetrol-stencil');assert.equal(env.layers[0].passes,3);
  assert.equal(env.layers[1].method,'worm-dip');
  fns.applyState({base:'#FFFFFF',passCount:2,layers:[{name:'UV Blast Red',hex:'#FF0022',strength:100,shape:'edge',angle:0,offset:0,side:1,width:.42}]});
  assert.equal(env.layers[0].passes,2);assert.equal(env.layers[0].method,'worm-dip');
});

test('external studio script complies with shared CSP without loosening site headers', () => {
  const headers = read('../public/_headers');
  assert.match(headers, /script-src 'self'/);
  assert.match(studioHtml, /<script src="\.\/studio\.js" defer><\/script>/);
  assert.doesNotMatch(studioHtml, /<script>[^]*?<\/script>/);
  assert.match(studioScript, /"use strict";/);
});

test('consumer interface keeps functionality, warnings and evidence reachable',()=>{
 const ui=read('../public/dyed-and-unattached/dye-studio/consumer.css');
 assert.match(studioHtml,/id="projectActions" class="project-actions"/);
 assert.match(studioHtml,/id="researchDrawer" class="consumer-research"/);
 assert.match(studioHtml,/class="mobile-quicknav"/);
 assert.match(studioHtml,/Preview colors are estimates, not verified dye results/);
 assert.match(ui,/@media\(max-width:900px\)/);
 assert.match(ui,/\.workspace\{order:0\}/);
 for(const id of ['saveProject','loadProject','copyRecipe','exportPng','clientModeBtn','calibrationModeBtn','referenceGrid','evidencePanel','layerList','editDetails','swatchGrid','actualTestBtn']){
 assert.equal(studioHtml.split('id="'+id+'"').length-1,1,'exactly one control '+id);}
});

test('consumer and technical modes reuse and restore the same DOM controls', () => {
 const layout=read('../public/dyed-and-unattached/dye-studio/consumer-layout.js');
 const mappings=[...layout.matchAll(/\["([^"]+)",\s*"([^"]+)"\]/g)].map(m=>({selector:m[1],slot:m[2]}));
 assert.equal(mappings.length,14);
 const all=new Map(),dest=new Map();
 function element(name){return {name,parentNode:null,style:{},dataset:{},textContent:name,setAttribute(){}};}
 function parent(name){
   return {name,children:[],
     appendChild(child){
       if(child.parentNode){const a=child.parentNode.children;a.splice(a.indexOf(child),1);}
       this.children.push(child);child.parentNode=this;
     },
     insertBefore(child,anchor){
       if(child.parentNode){const a=child.parentNode.children;a.splice(a.indexOf(child),1);}
       const ix=this.children.indexOf(anchor);
       if(ix<0)throw Error('missing anchor '+name);
       this.children.splice(ix,0,child);child.parentNode=this;
     }
   };
 }
 for(const entry of mappings){
   const node=element(entry.selector),origin=parent('origin '+entry.selector);
   origin.appendChild(node);all.set(entry.selector,{node,origin});
   if(!dest.has(entry.slot))dest.set(entry.slot,parent(entry.slot));
 }
 const preset=element('warm white');preset.dataset.basePreset='#F4F2E8';
 const doc={
   querySelector:selector=>all.get(selector)?.node||null,
   getElementById:id=>dest.get(id)||null,
   createComment:name=>element('marker '+name),
   querySelectorAll:selector=>selector==='[data-base-preset]'?[preset]:[]
 };
 const win={};Function('window','document',layout)(win,doc);
 win.DUConsumerLayout.init();
 assert.equal(preset.style.backgroundColor,'#F4F2E8');
 win.DUConsumerLayout.setView('client');
 for(const {selector,slot} of mappings)assert.equal(all.get(selector).node.parentNode,dest.get(slot),selector+' moved');
 win.DUConsumerLayout.setView('calibration');
 for(const {selector} of mappings)assert.equal(all.get(selector).node.parentNode,all.get(selector).origin,selector+' restored');
 win.DUConsumerLayout.setView('client');
 for(const {selector,slot} of mappings)assert.equal(all.get(selector).node.parentNode,dest.get(slot),selector+' reused');
});
test('consumer split keeps color engine and technical controls available', () => {
 const layout=read('../public/dyed-and-unattached/dye-studio/consumer-layout.js');
 const css=read('../public/dyed-and-unattached/dye-studio/consumer.css');
 for(const id of ['consumerDisc','consumerLayers','consumerPalette','consumerProfileSlot','consumerViewSlot','consumerSwatchesSlot','technicalControls']){
   assert.match(studioHtml,new RegExp('id="'+id+'"'));
 }
 for(const id of ['profileSelect','baseColor','baseHex','layerMethod','layerPasses','canvas','swatchGrid','editDetails','dyesDetails','researchDrawer','exportPng']){
   assert.equal(studioHtml.split('id="'+id+'"').length-1,1,'unique '+id);
 }
 assert.match(studioHtml,/<script src="\.\/consumer-layout\.js" defer><\/script>/);
 assert.match(studioHtml,/<script src="\.\/studio\.js" defer><\/script>/);
 assert.match(studioScript,/window\.DUConsumerLayout\.init\(\);loadDb\(\)/);
 assert.match(studioScript,/window\.DUConsumerLayout\.setView\(m\)/);
 assert.doesNotMatch(studioScript,/layers\.forEach\(l=>l\.strength=100\)/);
 assert.match(css,/body\.client-mode #layerMethodBox/);
 assert.match(css,/body\.client-mode #layerPassesBox/);
 assert.match(css,/body\.calibration-mode #evidencePanel/);
 assert.match(studioHtml,/Preview colors are estimates, not verified dye results/);
 assert.match(layout,/document\.querySelectorAll\("\[data-base-preset\]"\)/);
});

test('photo match is local-only and applies the existing model/color controls',()=>{
 const photo=read('../public/dyed-and-unattached/dye-studio/disc-photo.js');
 assert.match(studioHtml,/id="takeDiscPhoto"/);
 assert.match(studioHtml,/id="chooseDiscPhoto"/);
 assert.match(studioHtml,/id="discCameraInput" type="file" accept="image\/\*" capture="environment"/);
 assert.match(studioHtml,/id="discPhotoInput" type="file" accept="image\/\*"/);
 assert.match(studioHtml,/id="photoColorStatus"/);
 assert.match(studioHtml,/<script src="\.\/disc-photo\.js" defer><\/script>/);
 assert.match(photo,/window\.DUDiscPhoto=\{estimatePixels,analyzeImage,bind\}/);
 assert.match(photo,/document\.getElementById\("autoTransmission"\)\.click\(\)/);
 assert.match(photo,/Disc edge not found/);
 assert.doesNotMatch(photo,/fetch\(|XMLHttpRequest|sendBeacon|\.upload\(|FileReader/);
 assert.doesNotMatch(studioScript,/if\(m==="client"\)\$\("blendMode"\)\.value="research"/);
});
test('photo matcher ignores minority stamp colors in synthetic test images',()=>{
 const photo=read('../public/dyed-and-unattached/dye-studio/disc-photo.js');
 const win={},doc={readyState:'loading',addEventListener(){}};
 Function('window','document',photo)(win,doc);
 const estimate=win.DUDiscPhoto.estimatePixels;
 function sample(base,mark,opts={}){
  const w=280,h=280,data=new Uint8ClampedArray(w*h*4),radius=110,cx=140,cy=140;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const dist=Math.hypot(x-cx,y-cy),isDisc=dist<radius;
    const marked=mark&&Math.hypot(x-cx-(opts.x||0),y-cy)<(opts.r||34);
    const rgb=isDisc?(marked?mark:base):[24,26,30];
    const i=(y*w+x)*4;data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255;
  }
  return {data,width:w,height:h};
 }
 const cases=[
  {base:[89,169,222],mark:[15,15,20],options:{},color:'#59A9DE'},
  {base:[235,232,220],mark:[5,5,5],options:{x:50,r:34},color:'#EBE8DC'},
  {base:[216,70,88],mark:null,options:{},color:'#D84658'},
  {base:[65,172,118],mark:[245,244,230],options:{x:44,r:31},color:'#41AC76'},
  {base:[240,212,48],mark:[8,9,10],options:{x:35,r:41},color:'#F0D430'}
 ];
 for(const c of cases){
  const result=estimate(sample(c.base,c.mark,c.options));
  assert.equal(result.hex,c.color,'auto-color estimate '+c.color);
  assert.equal(result.edgeDetected,true,'disc boundary detected');
  assert.equal(result.confidence,'good','synthetic input should be consistent');
 }
 const blank=new Uint8ClampedArray(280*280*4);
 for(let i=0;i<blank.length;i+=4){blank[i]=30;blank[i+1]=30;blank[i+2]=30;blank[i+3]=255}
 assert.equal(estimate({data:blank,width:280,height:280}).edgeDetected,false,'reject background-only shot');
});



test('photo topology separates plate/rim without inventing brand plastic choices',()=>{
 const photo=read('../public/dyed-and-unattached/dye-studio/disc-photo.js');
 const win={},doc={readyState:'loading',addEventListener(){}};
 Function('window','document',photo)(win,doc);
 const estimate=win.DUDiscPhoto.estimatePixels;
 function disc(plate,rim,boundary,softness,withStamp=false){
  const w=280,h=280,r=110,data=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const rr=Math.hypot(x-140,y-140)/r;
   let mix=softness?Math.min(1,Math.max(0,(rr-boundary+softness/2)/softness)):rr>=boundary?1:0;
   let rgb=rr<=1?plate.map((v,i)=>v*(1-mix)+rim[i]*mix):[240,240,240];
   if(withStamp&&Math.hypot(x-180,y-143)<26&&rr<.78)rgb=[8,9,12];
   const i=(y*w+x)*4;data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255;
  }
  return {data,width:w,height:h};
 }
 const halo=estimate(disc([250,165,195],[25,146,208],.74,.095,true));
 assert.equal(halo.edgeDetected,true);
 assert.equal(halo.hex,'#FAA5C3');
 assert.equal(halo.appearance.rimHex,'#1992D0');
 assert.ok(Math.abs(halo.appearance.boundary-.74)<.04);
 assert.equal(halo.appearance.kind,'soft');
 const hard=estimate(disc([40,160,178],[255,96,137],.82,.008));
 assert.equal(hard.appearance.rimHex,'#FF6089');
 assert.equal(hard.appearance.kind,'hard');
 assert.ok(Math.abs(hard.appearance.boundary-.82)<.04);
 const one=estimate(disc([89,169,222],[89,169,222],.82,0,true));
 assert.equal(one.appearance,null);
 assert.ok(photo.includes('window.DUDiscAppearance?.set?.(result.appearance||null,false,true)'));
 assert.match(studioHtml,/id="photoRimPanel"/);
 assert.match(studioScript,/function appearanceAt\(x,y\)/);
 assert.match(studioScript,/discAppearance:discAppearance\?/);
 assert.match(studioScript,/photoBaseSelected\?\$\("baseHex"\)\.value:p\.base/);
 assert.match(studioScript,/Preserve calibration for retired models/);
 const defaultSegment=studioScript.slice(studioScript.indexOf('function defaults(){'),studioScript.indexOf('function migrateProfileId('));
 assert.match(defaultSegment,/Innova Classic Glow Champion/);
 assert.doesNotMatch(defaultSegment,/id:"innova_(?:dx|pro|halo_star|color_glow_champion)"/);
 const select=studioHtml.slice(studioHtml.indexOf('<select id="profileOptical"'),studioHtml.indexOf('</select>',studioHtml.indexOf('<select id="profileOptical"')));
 assert.doesNotMatch(select,/value="(?:dx|pro|halo-star|color-glow-champion)"/);
 assert.match(select,/value="classic-glow-champion"/);
});


test('photo rim geometry actually colors pixels independently of Innova model',()=>{
 const start=studioScript.indexOf('let discAppearance=null,photoBaseSelected=false;');
 const end=studioScript.indexOf('\nconst transmissionTargets=',start);
 assert.ok(start>0&&end>start);
 const env={
  $:id=>({value:id==='baseHex'?'#EEAA99':''}),
  validHex:h=>/^#[0-9a-f]{6}$/i.test(h),
  clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),
  mixRgbHex:(a,b,t)=>{
   const x=[1,3,5].map(i=>parseInt(a.slice(i,i+2),16)),y=[1,3,5].map(i=>parseInt(b.slice(i,i+2),16));
   return '#'+x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('').toUpperCase();
  },
  window:{},regionColorCache:{clear(){}},requestRender(){},commitHistory(){},layers:[],profile:()=>({}),researchPredictPoint(){},recordFor(){}
 };
 const api=Function('env','with(env){'+studioScript.slice(start,end)+';return {appearanceAt,setDiscAppearance,get:()=>discAppearance}}')(env);
 assert.equal(api.appearanceAt(0,0),'#EEAA99');
 api.setDiscAppearance({rimHex:'#1144CC',boundary:.8,softness:.03});
 assert.equal(api.appearanceAt(0,0),'#EEAA99');
 assert.equal(api.appearanceAt(.95,0),'#1144CC');
 assert.notEqual(api.appearanceAt(.8,0),'#EEAA99');
 assert.notEqual(api.appearanceAt(.8,0),'#1144CC');
 const offsets=Array.from({length:48},(_,i)=>i<12?-.04:.04);
 api.setDiscAppearance({rimHex:'#1144CC',boundary:.8,softness:.01,edgeOffsets:offsets});
 assert.equal(api.appearanceAt(.79*Math.cos(Math.PI/6),.79*Math.sin(Math.PI/6)),'#1144CC','detected narrow-rim sector is rim colored');
 assert.equal(api.appearanceAt(-.79,0),'#EEAA99','detected wide-core sector remains plate colored');
 api.setDiscAppearance(null);
 assert.equal(api.appearanceAt(.95,0),'#EEAA99');
});

test('consumer v2 keeps dye selection atomic and color edits contextual', () => {
 const v2=read('../public/dyed-and-unattached/dye-studio/consumer-v2.js');
 const ui=studioHtml;
 assert.match(ui,/<script src="\.\/consumer-v2\.js" defer><\/script>/);
 assert.doesNotMatch(ui,/<script id="du-consumer-redesign-v2-js">/);
 assert.match(ui,/<style id="du-consumer-redesign-v2">/);
 assert.ok(ui.indexOf('id="du-consumer-redesign-v2"')<ui.indexOf('</head>'));
 assert.match(v2,/addDye\(dye\[1\],dye\[2\],dye\[3\]===true\)/);
 assert.match(v2,/e\.stopImmediatePropagation\(\)/);
 assert.match(v2,/mode==="replace"&&selected>=0/);
 assert.match(v2,/l\.name=dye\[1\];l\.hex=dye\[2\]\.toUpperCase\(\)/);
 assert.match(v2,/list\.querySelector\("\.layer\.selected"\)/);
 assert.match(v2,/activeRow\.appendChild\(quick\)/);
 assert.match(v2,/visibleLabels=\["↑ Move up","↓ Move down","Delete"\]/);
 assert.match(v2,/\[role="button"\]\[tabindex="0"\]/);
 assert.match(v2,/du-lighting/);
 assert.match(ui,/grid-template-areas:"stage side"/);
 assert.match(ui,/#consumerDisc\{order:0;width:100%\}/);
 assert.match(ui,/#consumerLayers \.layer #du-quick\{grid-column:1\/-1/);
 assert.doesNotMatch(v2,/function translucentPointPredict|function opaquePointPredict/);
});

test('consumer shows selected boundary even when technical guide preference is off',()=>{
 const source=read('../public/dyed-and-unattached/dye-studio/studio.js');
 assert.match(source,/if\(appMode==="client"\)\{if\(selected>=0&&layers\[selected\]\)drawLineForLayer\(layers\[selected\],true\)\}/);
 assert.match(source,/else if\(\$\("showGuides"\)\.checked\)layers\.forEach/);
 assert.match(source,/if\(appMode!=="client"&&sample\.x\*sample\.x/);
 assert.match(source,/drawCircleHandle\(geo\.p1,layer\.hex,appMode==="client"\?13:10\)/);
 assert.match(source,/const threshold=\(touch\?24:15\)\/R/);
 assert.match(source,/let best=null,bestD=\(touch\?18:12\)\/R/);
 assert.match(source,/hitSelected\(q,e\.pointerType\)/);
 assert.match(source,/findBoundary\(q,e\.pointerType\)/);
});


test('consumer adds first two dyes on complementary halves while technical geometry stays unchanged',()=>{
 const start=studioScript.indexOf('function newLayer(name,hex,clear=false){');
 const end=studioScript.indexOf('function layerCovers(',start);
 assert.ok(start>=0&&end>start);
 const code=studioScript.slice(start,end);
 const env={layers:[],appMode:'client',activePassCount:()=>1,activeMethod:()=> 'acetone-direct',normAngle:x=>x};
 const build=Function('env','with(env){'+code+';return newLayer;}')(env);
 const first=build('ProChem Onyx','#101010');
 env.layers.push(first);
 const second=build('iDye Poly Blue','#1B1866');
 assert.equal(first.angle,0);
 assert.equal(first.offset,0);
 assert.equal(first.side,1);
 assert.equal(second.angle,0);
 assert.equal(second.offset,0);
 assert.equal(second.side,-1);
 assert.equal(second.method,'acetone-direct');
 env.appMode='calibration';env.layers.length=0;
 const technical=build('ProChem Onyx','#101010');
 assert.equal(technical.angle,-25);
 assert.equal(technical.offset,-.12);
});


test('consumer desktop sidebar and touch toast are safe',()=>{
 const v2=read('../public/dyed-and-unattached/dye-studio/consumer-v2.js');
 assert.match(v2,/right\.id="du-side"/);
 assert.match(v2,/stage\.parentNode\.insertBefore\(right,stage\.nextSibling\)/);
 assert.match(v2,/right\.append\(g\("consumerDisc"\),g\("consumerLayers"\)\)/);
 assert.match(studioHtml,/body\.client-mode #du-side\{grid-area:side;display:flex;flex-direction:column/);
 assert.match(studioHtml,/body\.calibration-mode #du-side\{display:none!important\}/);
 assert.match(studioHtml,/@media\(max-width:680px\)\{body\.client-mode #du-side\{display:contents\}\}/);
 assert.match(studioHtml,/body\.client-mode #toast\{pointer-events:none\}/);
});


test('consumer plastic labels remain concise while the technical descriptions are preserved',()=>{
 const v2=read('../public/dyed-and-unattached/dye-studio/consumer-v2.js');
 assert.match(v2,/function syncPlasticLabels\(\)/);
 assert.match(v2,/option\.dataset\.duFullLabel=option\.textContent/);
 assert.match(v2,/option\.textContent=consumer\?full\.split\(" — "\)\[0\]:full/);
 assert.match(v2,/new MutationObserver\(\(\)=>\{if\(document\.body\.classList/);
 assert.match(studioHtml,/body\.client-mode #consumerLayers \.layer-meta\{display:none\}/);
});


test('optional photographed-disc corrections alter the blank, not the prediction model',()=>{
 const v2=read('../public/dyed-and-unattached/dye-studio/consumer-v2.js');
 const begin=v2.indexOf('function rgbChannels(hex)');
 const end=v2.indexOf('if(photoStatus){\n new MutationObserver(',begin);
 assert.ok(begin>=0&&end>begin,'extract actual shipped correction functions');
 const code=v2.slice(begin,end);
 const fields=Object.fromEntries(['baseColor','baseHex','transmissionHex','transmissionColor'].map(id=>[id,{value:id==='baseColor'||id==='baseHex'?'#B0AB8B':'#000000',events:[],dispatchEvent(e){this.events.push(e.type)}}]));
 const buttons=['lighter','vivid','reset'].map(x=>({dataset:{photoAdjust:x}}));
 const env={fields,buttons,g:id=>fields[id],photoControls:{querySelectorAll:()=>buttons},autoTransmissionHex:()=> '#ECECEC',profile:()=>({}),Event:class {constructor(type){this.type=type}}};
 const fn=Function('env','with(env){let originalPhotoHex="#B0AB8B";'+code+';return {fields,buttons};}');
 const actual=fn(env);
 buttons[0].onclick();
 const lighter=actual.fields.baseHex.value;
 assert.ok(/^#[0-9A-F]{6}$/.test(lighter));
 const numeric=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
 const original=numeric('#B0AB8B'),light=numeric(lighter);
 assert.ok(light.every((v,i)=>v>original[i]),'lighter is brighter than photographed color');
 buttons[1].onclick();
 assert.ok(actual.fields.baseHex.value!==lighter,'more-colorful changes the blank');
 buttons[2].onclick();
 assert.equal(actual.fields.baseHex.value,'#B0AB8B');
 assert.equal(actual.fields.transmissionHex.value,'#ECECEC');
 assert.equal(actual.fields.transmissionColor.value,'#ECECEC');
 assert.equal(actual.fields.baseColor.events.filter(x=>x==='change').length,3,'one history change event per tap');
 assert.match(v2,/new MutationObserver\(\(\)=>\{\n  if\(!photoStatus\.textContent\.startsWith\("Estimated "\)\)/);
 assert.match(studioHtml,/#du-photo-adjust\[hidden\]\{display:none!important\}/);
});


test('color grip reorders without losing selected identity; mobile buttons remain',()=>{
 const v2=read('../public/dyed-and-unattached/dye-studio/consumer-v2.js');
 const a=v2.indexOf('function reorderColors(from,to){');
 const b=v2.indexOf('function clearDropTargets(){',a);
 assert.ok(a>=0&&b>a);
 const code=v2.slice(a,b);
 const A={name:'A'},B={name:'B'},C={name:'C'};
 const env={layers:[A,B,C],selected:1,mutate:fn=>fn()};
 const reorder=Function('env','with(env){'+code+';return reorderColors;}')(env);
 reorder(0,2);
 assert.equal(env.layers.map(x=>x.name).join(','),'B,C,A');
 assert.equal(env.layers[env.selected],B);
 reorder(2,0);
 assert.equal(env.layers.map(x=>x.name).join(','),'A,B,C');
 assert.equal(env.layers[env.selected],B);
 reorder(4,0);
 assert.equal(env.layers.length,3);
 assert.match(v2,/grip\.draggable=true/);
 assert.match(v2,/row\.addEventListener\("dragover"/);
 assert.match(v2,/row\.addEventListener\("drop"/);
 assert.match(studioHtml,/@media\(pointer:coarse\)/);
 assert.match(studioHtml,/\.layer\.selected \.layer-actions\{display:flex\}/);
});


test('radial region cache accelerates disc paint without crossing optical boundaries',()=>{
 const a=studioScript.indexOf('function makePaintImage(){');
 const b=studioScript.indexOf('function resizeCanvas(){',a);
 assert.ok(a>=0&&b>a);
 const source=studioScript.slice(a,b);
 for(const rule of ['const ringCache=new Map(),bins=1024','radius<.58?0:radius<.84?1:radius<=.86?2:3','const region=regionKeyAt(x,y)','ringCache.set(cacheKey,rgb)'])assert.ok(source.includes(rule),rule);
 const size=16,rows=size*size,ctx={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}};
 let calls=0;
 const env={PAINT_SIZE:size,paintCtx:ctx,paintedImage:null,discAppearance:null,regionKeyAt:(x)=>x>0?'1':'0',
   colorForPoint:(x,y,key)=>{calls++;return key==='1'?'#A51020':'#208010'},
   hexRgb:h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16))};
 const fn=Function('env','with(env){'+source+';return makePaintImage;}')(env);
 fn();
 assert.ok(calls<rows*.6,'region+radius caching should cut expensive color calculations');
 const px=env.paintedImage.data;
 assert.ok(px.some((v,i)=>i%4===3&&v===255),'drawn pixels must be opaque');
 assert.ok(px.some((v,i)=>i%4===3&&v===0),'outside-disc pixels must stay transparent');
 assert.ok(px.some((v,i)=>i%4===0&&v===165),'right-region channel value');
 assert.ok(px.some((v,i)=>i%4===0&&v===32),'left-region channel value');
});


test('photographed irregular rim caching preserves each local pixel color',()=>{
 const a=studioScript.indexOf('function makePaintImage(){');
 const b=studioScript.indexOf('function resizeCanvas(){',a);
 assert.ok(a>=0&&b>a);
 const source=studioScript.slice(a,b);
 for(const useOffsets of [true,false]){
  const size=96,softness=useOffsets?.025:.002;
  const offsets=Array.from({length:48},(_,i)=>i%2?.08:-.08);
  const appearanceAt=(x,y)=>{
   const r=Math.hypot(x,y),angle=(Math.atan2(y,x)+2*Math.PI)%(2*Math.PI);
   const sector=Math.floor(angle/(2*Math.PI)*48);
   const edge=useOffsets?offsets[sector]:0;
   const t=Math.max(0,Math.min(1,(r-(.8+edge)+softness/2)/softness));
   const v=Math.round(255*t*t*(3-2*t));
   return '#'+v.toString(16).padStart(2,'0').repeat(3).toUpperCase();
  };
  let calls=0;
  const env={PAINT_SIZE:size,
   paintCtx:{createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}},
   paintedImage:null,discAppearance:{boundary:.8,softness,edgeOffsets:useOffsets?offsets:null},
   appearanceAt,regionKeyAt:()=>'',colorForPoint:(x,y)=>{calls++;return appearanceAt(x,y);},
   hexRgb:h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16))};
  const fn=Function('env','with(env){'+source+';return makePaintImage;}')(env);
  fn();
  let errors=0,inside=0;
  for(let iy=0;iy<size;iy++)for(let ix=0;ix<size;ix++){
   const x=((ix+.5)/size)*2-1,y=((iy+.5)/size)*2-1;
   if(x*x+y*y>1)continue;
   inside++;
   const expected=parseInt(appearanceAt(x,y).slice(1,3),16);
   const actual=env.paintedImage.data[(iy*size+ix)*4];
   if(expected!==actual)errors++;
  }
  assert.equal(errors,0,useOffsets?'irregular 48-sector rim pixel aliasing':'narrow uniform rim aliasing');
  assert.ok(calls<inside*.5,'photo-aware caching must still avoid excessive predictor work');
 }
});

test('single selected consumer dye keeps adequate name width without a reorder grip',()=>{
 const v2=read('../public/dyed-and-unattached/dye-studio/consumer-v2.js');
 const rule='body.client-mode #consumerLayers .layer{display:grid;grid-template-columns:37px minmax(0,1fr)';
 const withGrip='body.client-mode #consumerLayers .layer.du-has-grip{grid-template-columns:22px 37px minmax(0,1fr)}';
 assert.ok(studioHtml.includes(rule),'single-block row should be a two-column layout');
 assert.ok(studioHtml.includes(withGrip),'reorder handle should have an explicit third column');
 assert.match(v2,/row\.classList\.add\("du-has-grip"\)/);
 assert.match(v2,/if\(inConsumer&&layers\.length>1\)addReorderGrip/);
 assert.match(studioHtml,/@media\(pointer:coarse\)\{body\.client-mode #consumerLayers \.du-layer-grip\{display:none\}body\.client-mode #consumerLayers \.layer\{grid-template-columns:37px minmax\(0,1fr\)\}\}/);
 assert.match(studioHtml,/\.layer-name\{font-size:13px;overflow-wrap:break-word;word-break:normal;hyphens:none\}/);
 assert.match(studioHtml,/@media\(pointer:coarse\)\{body\.client-mode #consumerLayers \.layer\.du-has-grip\{grid-template-columns:37px minmax\(0,1fr\)\}\}/);
});

test('photo-matched undyed daylight preserves original blank; dyes, UV and backlight stay unchanged',()=>{
 const start=studioScript.indexOf('function colorForPoint(x,y,key){');
 const end=studioScript.indexOf('const transmissionTargets=',start);
 assert.ok(start>=0&&end>start);
 const env={photoBaseSelected:true,discAppearance:null,viewMode:'daylight',daylightScene:'outdoor',layers:[],
   appearanceAt:()=> '#DDE8C8',recordFor:()=>null,profile:()=>({optical:'proto-glow-champion'}),
   researchPredictPoint:()=> '#B1C2A2'};
 const evaluate=Function('env','with(env){'+studioScript.slice(start,end)+';return colorForPoint;}')(env);
 assert.equal(evaluate(0,0,''),'#DDE8C8','photo blank must not be tinted twice');
 env.layers=[{name:'ProChem Neon Hot Orange',strength:0}];
 assert.equal(evaluate(0,0,'1'),'#DDE8C8','0% dye stays actual blank');
 env.layers[0].strength=100;
 assert.equal(evaluate(0,0,'1'),'#B1C2A2','dyed region retains model');
 env.layers=[];env.daylightScene='backlit';
 assert.equal(evaluate(0,0,''),'#B1C2A2','backlit model not replaced by outdoor photo');
 env.daylightScene='outdoor';env.viewMode='uv365';
 assert.equal(evaluate(0,0,''),'#B1C2A2','UV model not replaced by outdoor photo');
 env.viewMode='daylight';env.photoBaseSelected=false;
 assert.equal(evaluate(0,0,''),'#B1C2A2','unphotographed blank retains model');
 assert.match(studioScript,/String\(photoBaseSelected\)/);
});

test('physical color-source quality is not inferred from photos on unverified substrates',()=>{
 const csv=read('../../docs/dye-studio/evidence-quality-matrix.csv');
 const lines=csv.trim().split('\n'),cols=lines[0].split(',');
 const rows=lines.slice(1).map(line=>{
  const parts=[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(x=>x[1].replace(/""/g,'"'));
  assert.equal(parts.length,cols.length,'valid source record');
  return Object.fromEntries(cols.map((name,i)=>[name,parts[i]]));
 });
 assert.equal(rows.length,85);
 const chart=rows.find(x=>x.id==='FIELD-PHOTO-01');
 assert.ok(chart);
 assert.match(chart.starting_plastic,/Innova Star.*owner expert visual identification/);
 assert.match(chart.train_eligible,/^NO/);
 assert.match(chart.numeric_holdout_eligible,/^NO/);
 assert.match(studioScript,/White Innova Star per expert owner visual identification/);
 for(const x of rows){
  if(/^YES/i.test(x.train_eligible)){
   assert.match(x.controlled_photo,/^YES/i,'numeric admission requires controlled photographs');
   assert.match(x.plastic_documented,/^(YES|Named)/i,'numeric admission requires known substrate');
   assert.match(x.dye_identity,/named/i,'numeric admission requires named pigment identity');
  }
 }
 const newlyAdded=['FIELD-TIME-01','FIELD-AC-PALETTE-01','FIELD-AC-SOLVENT-01','FIELD-CARRIER-01'];
 for(const id of ['FIELD-STAR-WRAITH-STENCIL-01','FIELD-STAR-WHITE-GLUE-VIDEO-01']){
  const r=rows.find(x=>x.id===id);assert.ok(r,'new original maker physical source indexed');
  assert.equal(r.controlled_photo,'NO');assert.match(r.train_eligible,/^NO/);assert.match(r.numeric_holdout_eligible,/^NO/);
 }
 assert.match(rows.find(x=>x.id==='WB007').starting_plastic,/Star Wraith/);
 assert.match(rows.find(x=>x.id==='WB007').source_verification,/Original creator post personally reviewed/);
 assert.match(rows.find(x=>x.id==='FIELD-STAR-WHITE-GLUE-VIDEO-01').reported_duration,/two hours/);

 const starRat=rows.find(r=>r.id==='FIELD-SAME-DISC-MEDIA-01');
 assert.ok(starRat,'known-Star six-method field case indexed');
 assert.match(starRat.starting_plastic,/Innova Star Rat/);
 assert.match(starRat.reported_outcome,/confounded/);
 assert.equal(starRat.controlled_photo,'NO');
 assert.match(starRat.train_eligible,/^NO/);
 assert.match(starRat.numeric_holdout_eligible,/^NO/);
 for(const id of newlyAdded){
  const x=rows.find(r=>r.id===id);
  assert.ok(x,'new practitioner source present: '+id);
  assert.equal(x.controlled_photo,'NO','uncontrolled maker JPEG must remain qualitative');
  assert.match(x.train_eligible,/^NO/,'unverified result is NOT a calibration target');
  assert.match(x.numeric_holdout_eligible,/^NO/);
 }
 assert.match(rows.find(r=>r.id==='FIELD-TIME-01').reported_duration,/1 5 15 30min/);
 assert.match(rows.find(r=>r.id==='FIELD-AC-PALETTE-01').dye_identity,/Family|Partially|partially|named/);
 assert.equal(rows.filter(x=>/^YES/i.test(x.train_eligible)).length,0,'no unsupported numerical training admitted');
});


test('evidence relevance distinguishes one matching dye from a complete two-dye stack',()=>{
 const start=studioScript.indexOf('function evidenceScore(');
 const end=studioScript.indexOf('function renderEvidenceAdvisory()',start);
 assert.ok(start>=0&&end>start);
 const source=studioScript.slice(start,end);
 const observed={dyes:'ProChem Onyx',plastic:'Star',plasticVerified:true,baseColor:'white',medium:'direct acetone brush',photo:'finished disc',evidenceType:'FIELD REPORT'};
 const env={layers:[{name:'ProChem Onyx',method:'acetone-direct'},{name:'iDye Poly Blue',method:'acetone-direct'}],
  evidenceDyeFamilyMatches:(name,report)=>report.includes(name),materialClass:()=> 'opaque-premium',
  classifyObservedProcess:()=> 'acetone-direct',methodForDyeLayer:l=>l.method};
 const score=Function('env','with(env){'+source+';return evidenceScore;}')(env);
 const partial=score(observed,[], 'Star','white');
 assert.ok(partial&&partial.partialDye);
 assert.equal(partial.exactDye,false,'one matching dye must not count as full overlap evidence');
 assert.equal(partial.score,29,'partial shade receives no full-stack match bonus');
 observed.dyes='ProChem Onyx and iDye Poly Blue';
 const complete=score(observed,[], 'Star','white');
 assert.equal(complete.exactDye,true);
 assert.equal(complete.score,39);
});


test('one carrier report cannot claim a full mixed-method recipe match',()=>{
 const start=studioScript.indexOf('function evidenceScore(');
 const end=studioScript.indexOf('function renderEvidenceAdvisory()',start);
 const src=studioScript.slice(start,end);
 const env={layers:[
  {name:'ProChem Onyx',strength:100,method:'acetone-direct'},
  {name:'iDye Poly Blue',strength:100,method:'floetrol-stencil'}],
  evidenceDyeFamilyMatches:(name,report)=>report.includes(name),
  materialClass:()=> 'opaque-premium',
  classifyObservedProcess:()=> 'acetone-direct',
  methodForDyeLayer:l=>l.method};
 const score=Function('env','with(env){'+src+';return evidenceScore;}')(env);
 const report={dyes:'ProChem Onyx and iDye Poly Blue',plastic:'Star',plasticVerified:true,
  baseColor:'white',medium:'direct acetone brush',photo:'finished disc',evidenceType:'FIELD REPORT'};
 const mixed=score(report,[],'Star','white');
 assert.equal(mixed.exactDye,true,'both names present');
 assert.equal(mixed.methodMatch,false,'only one carrier matches');
 assert.equal(mixed.partialMethod,true,'report is useful for one block only');
 assert.equal(mixed.methodAnalog,false);
 assert.equal(mixed.score,26,'mixed recipe gets only partial method credit');
 env.layers[1].method='acetone-direct';
 const complete=score(report,[],'Star','white');
 assert.equal(complete.methodMatch,true);
 assert.equal(complete.partialMethod,false);
 assert.equal(complete.score,39);
 assert.match(studioScript,/PARTIAL METHOD MATCH/);
});

test('zero-intensity dye blocks do not create invented evidence or overlaps',()=>{
 const start=studioScript.indexOf('function evidenceScore(');
 const end=studioScript.indexOf('function renderEvidenceAdvisory()',start);
 const src=studioScript.slice(start,end);
 const env={layers:[
  {name:'ProChem Onyx',strength:100,method:'acetone-direct'},
  {name:'iDye Poly Blue',strength:0,method:'floetrol-stencil'}],
  evidenceDyeFamilyMatches:(name,report)=>report.includes(name),
  materialClass:()=> 'opaque-premium',
  classifyObservedProcess:()=> 'acetone-direct',
  methodForDyeLayer:l=>l.method};
 const score=Function('env','with(env){'+src+';return evidenceScore;}')(env);
 const report={dyes:'ProChem Onyx',plastic:'Star',plasticVerified:true,baseColor:'white',
  medium:'direct acetone brush',photo:'finished disc',evidenceType:'FIELD REPORT'};
 const actual=score(report,[],'Star','white');
 assert.equal(actual.exactDye,true,'disabled color is not required for shade coverage');
 assert.equal(actual.methodMatch,true,'disabled method is irrelevant');
 assert.equal(actual.partialMethod,false);
 assert.equal(actual.score,39);
 assert.match(studioScript,/activeLayers\.filter\(l=>layerCovers\(l,x,y\)\)\.length>1/,
  'zero strength cannot create physical overlap warnings');
});

test('private before-and-after owner photos are absent from served Studio JavaScript',()=>{
 assert.doesNotMatch(studioScript,/data:image\/(?:jpeg|png|webp);base64,/i);
 assert.match(studioScript,/const actualPhotos=s\.actual&&s\.beforeImg&&s\.afterImg/);
 assert.match(studioScript,/Private before\/after photos are not published/);
 assert.match(studioScript,/hbnf_green_orange/,'qualitative reference metadata retained');
});

test('published evidence counts match actual entries and distinct source URLs', () => {
  const records = name => {
    const prefix = `const ${name}=`;
    const start = studioScript.indexOf(prefix);
    assert.ok(start >= 0, `Missing evidence collection ${name}`);
    const end = studioScript.indexOf('];', start);
    assert.ok(end > start);
    return JSON.parse(studioScript.slice(start + prefix.length, end + 1));
  };
  const entries = [...records('EVIDENCE_OBSERVATIONS'), ...records('FIELD_CASES')];
  const distinctUrls = new Set(entries.map(row => row.sourceUrl));
  assert.equal(entries.length, 85);
  assert.equal(distinctUrls.size, 65);
  assert.match(studioHtml, new RegExp(`— ${entries.length} provisional observations`));
  assert.match(studioHtml, new RegExp(`${entries.length} records across ${distinctUrls.size} source URLs`));
  assert.match(studioScript, /\$\{ALL_DYE_EVIDENCE\.length\} provisional source observations/);
  assert.match(studioScript, /ALL_DYE_EVIDENCE\.filter\(o=>selected\.some\(d=>evidenceDyeFamilyMatches/);
  assert.doesNotMatch(studioHtml, /includes the user-provided before\/after photos/);
  assert.match(studioHtml, /Those photos are not published here/);
});

test('zero-intensity blocks cannot create false dyed regions or confidence',()=>{
  assert.ok(studioScript.includes('function regionKeyAt(x,y){return layers.map(l=>Number(l.strength??100)>0&&layerCovers(l,x,y)?'));
  assert.ok(studioScript.includes('active=active.filter(l=>Number(l.strength??100)>0);'));
  assert.ok(studioScript.includes('function updateGuard(){if(!layers.some(l=>Number(l.strength??100)>0)){'));
  const sample=studioScript.slice(studioScript.indexOf('function confidenceForActive('),studioScript.indexOf('function makePaintImage('));
  assert.ok(sample.includes('if(!active.length)return"base-only"'));
});

test('UV Blast plus Floetrol uses distinct actual method, not ProChem powder or worm dip',()=>{
 const start=studioScript.indexOf('function newLayer(name,hex,clear=false){');
 const end=studioScript.indexOf('function layerCovers(',start);
 const env={layers:[],appMode:'client',activePassCount:()=>1,activeMethod:()=> 'floetrol-stencil',normAngle:x=>x};
 const build=Function('env','with(env){'+studioScript.slice(start,end)+';return newLayer;}')(env);
 assert.equal(build('UV Blast Green','#00FF00').method,'premixed-dip-floetrol');
 assert.equal(build('ProChem Onyx','#101010').method,'floetrol-stencil');
 env.activeMethod=()=> 'acetone-direct';
 assert.equal(build('UV Blast Green','#00FF00').method,'worm-dip');
 assert.match(studioHtml,/option value="premixed-dip-floetrol"/);
});

test('tentatively reconstructed dye names cannot earn exact-source match bonus',()=>{
 const casesStart=studioScript.indexOf('const FIELD_CASES=');
 const casesEnd=studioScript.indexOf('];',casesStart);
 const cases=JSON.parse(studioScript.slice(casesStart+'const FIELD_CASES='.length,casesEnd+1));
 for(const id of ['FIELD-TIME-01','FIELD-AC-PALETTE-01','FIELD-AC-SOLVENT-01','FIELD-CARRIER-01']){
  assert.equal(cases.find(x=>x.id===id).shadeMappingCertain,false);
 }
 const start=studioScript.indexOf('function evidenceScore('),end=studioScript.indexOf('function renderEvidenceAdvisory()',start);
 const env={layers:[{name:'iDye Poly Blue',method:'acetone-direct',strength:100}],
  evidenceDyeFamilyMatches:(name,reported)=>reported.includes(name),
  materialClass:()=> 'opaque-premium',
  classifyObservedProcess:()=> 'acetone-direct',methodForDyeLayer:l=>l.method};
 const score=Function('env','with(env){'+studioScript.slice(start,end)+';return evidenceScore;}')(env);
 const obs={dyes:'iDye Poly Blue',plastic:'Innova Star',baseColor:'white',medium:'direct acetone brush',photo:'finished disc',evidenceType:'CASE'};
 const certain=score(obs,[],'Innova Star','white');
 const uncertain=score({...obs,shadeMappingCertain:false},[],'Innova Star','white');
 assert.equal(certain.exactDye,true);
 assert.equal(uncertain.exactDye,false);
 assert.equal(certain.score-uncertain.score,10);
});

test('catalog dye names and inventory dye names resolve to same original-source family without false shade matches',()=>{
 const start=studioScript.indexOf('function evidenceDyeFamilyMatches('),end=studioScript.indexOf('function classifyObservedProcess(',start);
 assert.ok(start>=0&&end>start);
 const dyesStart=studioScript.indexOf('const dyes = [');
 const dyesEnd=studioScript.indexOf('];',dyesStart);
 const catalog=Function(studioScript.slice(dyesStart,dyesEnd+2)+';return dyes')();
 const match=Function('dyes',studioScript.slice(start,end)+';return evidenceDyeFamilyMatches')(catalog);
 const cases=[
  ['Neon Key Lime','ProChem Neon Key Lime',true],
  ['ProChem Neon Key Lime','PRO Chemical & Dye Neon Lemon Zest DGD101; Neon Key Lime DGD700',true],
  ['Neon Cerise Pink','Pro Chemical & Dye DGD388 Neon Cerise Pink',true],
  ['Neon Royal Purple','Pro Chemical & Dye DGD888 Neon Royal Purple',true],
  ['Blue','Jacquard iDye Poly 451 Blue',true],
  ['iDye Poly Crimson','Jacquard iDye Poly Crimson 457',true],
  ['Green UV Blast','UV Blast Green',true],
  ['Clear UV Blast','UV Blast Clear',true],
  ['Royal','ProChem Neon Royal Purple',false],
  ['Blue','ProChem Sonic Blue',false],
  ['ProChem Sonic Blue','ProChem Sky Blue',false],
  ['Neon Key Lime','ProChemical disc dyes',false],
  ['Black','ProChem Onyx',false],
  ['Flo Red UV Blast','Quick Coat Red/Pink UV Blast',false],
  ['ProChem Neon Hot Orange','iDye Poly Neon Hot Orange',false]
 ];
 for(const [name,report,expected] of cases)assert.equal(match(name,report),expected,name+' vs '+report);
 // Every short ProChem catalog name must be manufacturer-qualified, not a generic color word.
 assert.equal(match('Neon Key Lime','ProChem Neon Key Lime'),match('ProChem Neon Key Lime','ProChem Neon Key Lime'));
});

test('Onyx stencil and sequential Fuzion cases remain qualitative-only and chip provenance is corrected',()=>{
 const get=name=>{const head='const '+name+'=',i=studioScript.indexOf(head),j=studioScript.indexOf('];',i);return JSON.parse(studioScript.slice(i+head.length,j+1))};
 const data=[...get('EVIDENCE_OBSERVATIONS'),...get('FIELD_CASES')];
 for(const id of ['FIELD-ONYX-STENCIL-01','FIELD-ONYX-SAME-DISC-CARRIER-01']){
  const hit=data.filter(r=>r.id===id);
  assert.equal(hit.length,1,id);
  assert.equal(hit[0].shadeMappingCertain,false);
  assert.equal(hit[0].plasticVerified,false);
 }
 assert.match(data.find(x=>x.id==='FIELD-ONYX-STENCIL-01').medium,/stencil/);
 assert.match(data.find(x=>x.id==='FIELD-ONYX-SAME-DISC-CARRIER-01').plastic,/Fuzion/);
 assert.match(data.find(x=>x.id==='A01').limitations,/cocoa-butter lotions/);
 const matrix=read('../../docs/dye-studio/evidence-quality-matrix.csv');
 assert.match(matrix,/FIELD-ONYX-STENCIL-01/);
 assert.match(matrix,/FIELD-ONYX-SAME-DISC-CARRIER-01/);
 assert.match(matrix,/cocoa-butter lotions/);
 assert.match(read('../../docs/dye-studio/source-admission-benchmark-v1.json'),/cocoa-butter lotions/);
 assert.match(studioScript,/Manufacturer color chips use cocoa-butter lotions/);
});


test('source quality matrix agrees with the live physical-method classifier and preserves provenance aliases',()=>{
 const csv=read('../../docs/dye-studio/evidence-quality-matrix.csv').trim();
 const [header,...lines]=csv.split('\n'),cols=header.split(',');
 const rows=lines.map(line=>{
  const fields=[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(m=>m[1].replace(/""/g,'"'));
  assert.equal(fields.length,cols.length,'CSV row must preserve 28 source attributes');
  return Object.fromEntries(cols.map((name,i)=>[name,fields[i]]));
 });
 const get=name=>{const head='const '+name+'=',i=studioScript.indexOf(head),j=studioScript.indexOf('];',i);
  return JSON.parse(studioScript.slice(i+head.length,j+1));};
 const observations=[...get('EVIDENCE_OBSERVATIONS'),...get('FIELD_CASES')];
 const start=studioScript.indexOf('function classifyObservedProcess(');
 const end=studioScript.indexOf('function evidenceScore(',start);
 const classify=Function(studioScript.slice(start,end)+';return classifyObservedProcess')();
 assert.equal(rows.length,85);
 assert.equal(observations.length,85);
 const byId=new Map(rows.map(x=>[x.id,x]));
 let joined=0;
 for(const obs of observations){
  const source=byId.get(obs.id);
  if(!source)continue;
  joined++;
  assert.equal(source.method_class,classify(obs.medium),
    obs.id+' matrix method should match current runtime classification');
  assert.match(source.train_eligible,/^NO/,
    'uncontrolled practitioner report cannot become numeric training');
  assert.match(source.numeric_holdout_eligible,/^NO/,
    'uncontrolled practitioner report cannot become a measured holdout');
 }
 assert.equal(joined,82,'source aliases remain related URL observations, not phantom duplicates');
 const aliased=[
  ['FIELD-AC-01','ISSUE-ACETONE-2022'],
  ['FIELD-AC-05','QA-AC-06'],
  ['FIELD-OTHER-01','WB003']
 ];
 for(const [appId,csvId] of aliased){
  const obs=observations.find(x=>x.id===appId),other=byId.get(csvId);
  assert.ok(obs&&other,'keep both source identity scopes');
  assert.equal(obs.sourceUrl,other.source_url,'aliases must still point to same first-person source');
 }
 const newOriginals=[
  ['FIELD-CHAMPION-LOTION-01','lotion','Innova Champion Roc3'],
  ['FIELD-STAR-CARIBBEAN-GLUE-01','acetone-glue-bed','White Innova Star'],
  ['FIELD-MEADOW-UVLOTION-01','mixed-or-compound-process','Death Star stencil']
 ];
 for(const [id,method,plastic] of newOriginals){
  const record=observations.find(o=>o.id===id),matrix=byId.get(id);
  assert.ok(record&&matrix,'original maker and structured matrix registered: '+id);
  assert.equal(classify(record.medium),method);
  assert.equal(matrix.method_class,method);
  assert.match(record.plastic,new RegExp(plastic));
  assert.equal(record.shadeMappingCertain,false);
  assert.match(matrix.train_eligible,/^NO/);
  assert.match(matrix.numeric_holdout_eligible,/^NO/);
 }
 assert.equal(observations.find(o=>o.id==='FIELD-CHAMPION-LOTION-01').plasticVerified,true);
 assert.equal(observations.find(o=>o.id==='FIELD-STAR-CARIBBEAN-GLUE-01').plasticVerified,true);
 assert.equal(observations.find(o=>o.id==='FIELD-MEADOW-UVLOTION-01').plasticVerified,false);
 // An acetone dissolution step is not itself a direct-acetone application.
 assert.equal(classify('ProChem powder dissolved in an acetone splash, then mixed with lotion in a lotion bed'),'lotion');
 assert.equal(classify('Direct acetone paint brush on Star'), 'acetone-direct');
 assert.equal(classify('Spin dye followed by Floetrol cells'),'mixed-or-compound-process');

 // Lotion pigment on clear glue is neither acetone-glue dye nor plain lotion.
 for(const id of ['A11','A12']){
  const obs=observations.find(o=>o.id===id);
  assert.equal(classify(obs.medium),'lotion-over-glue-bed',id);
  assert.equal(byId.get(id).method_class,'lotion-over-glue-bed',id);
 }
 const painter=observations.find(o=>o.id==='FIELD-DIRECT-PAINT-SEQUENCE-01');
 const splatter=observations.find(o=>o.id==='FIELD-DIRECT-CARIBBEAN-K1-01');
 for(const hit of [painter,splatter]){
  assert.ok(hit&&byId.has(hit.id),'firsthand direct-on-disc case present');
  assert.equal(classify(hit.medium),'mixed-or-compound-process');
  assert.equal(byId.get(hit.id).method_class,'mixed-or-compound-process');
  assert.equal(hit.shadeMappingCertain,false);
  assert.match(byId.get(hit.id).train_eligible,/^NO/);
  assert.match(byId.get(hit.id).numeric_holdout_eligible,/^NO/);
 }
 assert.match(painter.concentration,/20mL acetone/);
 assert.equal(painter.plasticVerified,false);
 assert.match(splatter.plastic,/Kastaplast K1/);
 assert.equal(splatter.plasticVerified,true,'maker names an actual K1 Reko, not an Innova profile');
 assert.equal(classify('ProChem dye in lotion laid over clear glue'),'lotion-over-glue-bed');
 assert.equal(classify('ProChem acetone directly brush-painted onto stencil'),'acetone-direct');
 assert.equal(classify('iDye Poly Black hot-dipped before direct acetone painted details'),'mixed-or-compound-process');

 const mixedIds=['WB022','FIELD-AC-04'];
 for(const id of mixedIds)
  assert.equal(byId.get(id).method_class,'mixed-or-compound-process',
    id+' cannot train or match a single physical carrier');
 const wb004=observations.find(x=>x.id==='WB004');
 assert.equal(wb004.plasticVerified,true,'maker named an actual Star Jay');
 assert.equal(wb004.shadeMappingCertain,false,'maker photos do not map per-pixel purple');
 assert.match(wb004.plastic,/separate TSA Aura Construct/);
 assert.match(wb004.medium,/glue bed/i);
 assert.match(byId.get('WB004').source_verification,/first-person maker/i);
 assert.match(byId.get('WB004').numeric_holdout_eligible,/^NO/);
});


test('commercial Quick Coat UV Blast Green synonym remains findable but never becomes a single-pigment calibration',()=>{
 const catalogStart=studioScript.indexOf('const dyes = ['),catalogEnd=studioScript.indexOf('];',catalogStart);
 const dyes=Function(studioScript.slice(catalogStart,catalogEnd+2)+';return dyes')();
 const start=studioScript.indexOf('function evidenceDyeFamilyMatches(');
 const end=studioScript.indexOf('function classifyObservedProcess(',start);
 const match=Function('dyes',studioScript.slice(start,end)+';return evidenceDyeFamilyMatches')(dyes);
 const p='const FIELD_CASES=',i=studioScript.indexOf(p),j=studioScript.indexOf('];',i);
 const cases=JSON.parse(studioScript.slice(i+p.length,j+1));
 const report=cases.find(x=>x.id==='FIELD-MEADOW-UVLOTION-01');
 assert.ok(report);
 assert.equal(match('ProChem Meadow',report.dyes),true);
 assert.equal(match('UV Blast Green',report.dyes),true);
 assert.equal(match('Green UV Blast',report.dyes),true);
 assert.equal(match('UV Blast Red',report.dyes),false);
 assert.equal(match('ProChem Neon Key Lime',report.dyes),false);
 assert.equal(report.shadeMappingCertain,false,'one mixed-photo result does not identify the isolated shade');
 assert.match(report.medium,/ProChem Meadow.*Quick Coat Green UV Blast/);
 const classify=Function(studioScript.slice(studioScript.indexOf('function classifyObservedProcess('),
  studioScript.indexOf('function evidenceScore('))+';return classifyObservedProcess')();
 assert.equal(classify(report.medium),'mixed-or-compound-process');
});


test('a strongly mixed two-disc photo is rejected before it can overwrite the undyed base',()=>{
 const photo=read('../public/dyed-and-unattached/dye-studio/disc-photo.js');
 const win={},doc={readyState:'loading',addEventListener(){}};
 Function('window','document',photo)(win,doc);
 const estimate=win.DUDiscPhoto.estimatePixels;
 const scene=two=>{
  const w=460,h=345,data=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   let rgb=[230,226,216];
   if(two){
    if(Math.hypot(x-130,y-171)<=105)rgb=[36,78,160];
    if(Math.hypot(x-330,y-171)<=105)rgb=[200,193,126];
   }else if(Math.hypot(x-230,y-171)<=105)rgb=[200,193,126];
   const i=(y*w+x)*4;
   data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255;
  }
  return estimate({data,width:w,height:h});
 };
 const single=scene(false),paired=scene(true);
 assert.equal(single.edgeDetected,true);
 assert.equal(single.severeMixedColor,false,'single original disc should still be accepted');
 assert.equal(single.hex,'#C8C17E','single-disc base is the synthetic known plate color');
 assert.equal(paired.edgeDetected,false,'partial cross-disc arcs are no longer accepted as a coherent edge');
 assert.equal(paired.severeMixedColor,true,'reject severe multimodal base-color contamination');
 assert.equal(paired.confidence,'check','false rim contrast must not imply a good base-color estimate');
 assert.ok(paired.outlierFraction>.5&&paired.spread>70);
 // Rejection must run BEFORE the existing source-color mutation. Do not put
 // it only in the message after setDiscAppearance or baseHex has been changed.
 const gate=photo.slice(photo.indexOf('if(result.severeMixedColor)'),photo.indexOf('const color=document.getElementById("baseColor")'));
 assert.match(gate,/if\(result\.severeMixedColor\)throw Error/);
 assert.match(gate,/Crop to a single undyed disc/);
 // The real first-party Wraith/Tern photographs stay in private Google Drive;
 // this regression draws synthetic circles and embeds no photo payloads.
});


test('small single-color disc does not invent a two-tone rim from its surrounding background',()=>{
 const photo=read('../public/dyed-and-unattached/dye-studio/disc-photo.js');
 const win={},doc={readyState:'loading',addEventListener(){}};
 Function('window','document',photo)(win,doc);
 const estimate=win.DUDiscPhoto.estimatePixels;
 const draw=(radius,bg,twoTone=false,x=230)=>{
  const w=460,h=460,data=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let col=0;col<w;col++){
   const r=Math.hypot(col-x,y-230);
   const rgb=r>radius?bg:twoTone&&r>radius*.83?[70,30,100]:[202,190,130];
   const i=(y*w+col)*4;
   data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255;
  }
  return estimate({data,width:w,height:h});
 };
 for(const radius of [85,95,115,130,145,165,175,192,205]){
  for(const bg of [[230,230,230],[18,30,40]]){
   const plain=draw(radius,bg);
   assert.equal(plain.edgeDetected,true,'single cropped disc remains identifiable at radius '+radius);
   assert.equal(plain.hex,'#CABE82','plate color not contaminated by background at '+radius);
   assert.equal(plain.appearance,null,'solid plastic must not generate a fake '+bg[0]+' rim at '+radius);
   assert.equal(plain.severeMixedColor,false,'one solid disc is not multiple discs at '+radius);
  }
 }
 const realTwoTone=draw(95,[230,230,230],true);
 assert.equal(realTwoTone.edgeDetected,true,'small genuine dual-color disc still accepted');
 assert.equal(realTwoTone.hex,'#CABE82','true plate retained');
 assert.equal(realTwoTone.appearance.rimHex,'#461E64','true colored outer rim is preserved');
 const offcenter=draw(125,[230,230,230],false,330);
 assert.equal(offcenter.edgeDetected,false,'partial off-center arc must fail closed, not invent bright rim');
 assert.ok(!offcenter.appearance,'no fabricated rim for unlocatable disc');
 // The validated pixels above are synthetic, not empirical disc spectra.
});


test('original-photo import retries the image-element decoder on bitmap failure and cleans up',async()=>{
 const photo=read('../public/dyed-and-unattached/dye-studio/disc-photo.js');
 const width=460,height=460,pixels=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const inside=Math.hypot(x-230,y-230)<=145,i=(y*width+x)*4;
  const rgb=inside?[202,190,130]:[233,233,233];
  pixels[i]=rgb[0];pixels[i+1]=rgb[1];pixels[i+2]=rgb[2];pixels[i+3]=255;
 }
 async function run(bitmapFails,imageFails=false){
  const calls=[],canvas={width:0,height:0};
  const context={drawImage(img){calls.push('draw:'+img.kind)},
   getImageData(){return{data:pixels,width,height}}};
  canvas.getContext=()=>context;
  const doc={readyState:'loading',addEventListener(){},createElement(name){
   assert.equal(name,'canvas');return canvas;
  }};
  const urls={createObjectURL(){calls.push('create-url');return'blob:synthetic'},
   revokeObjectURL(url){assert.equal(url,'blob:synthetic');calls.push('revoke-url')}};
  class TestImage{
   constructor(){this.kind='img';this.width=width;this.height=height}
   set src(url){
    assert.equal(url,'blob:synthetic');
    queueMicrotask(()=>imageFails?this.onerror():this.onload());
   }
  }
  const bitmap=async()=>{
   calls.push('bitmap');
   if(bitmapFails)throw Error('bitmap decoder unsupported for this file');
   return {kind:'bitmap',width,height,close(){calls.push('close-bitmap')}};
  };
  const win={};
  Function('window','document','createImageBitmap','URL','Image',photo)(
   win,doc,bitmap,urls,TestImage);
  if(imageFails){
   await assert.rejects(win.DUDiscPhoto.analyzeImage({type:'image/heic'}),/Unable to open photo/);
  }else{
   const outcome=await win.DUDiscPhoto.analyzeImage({type:'image/heic'});
   assert.equal(outcome.hex,'#CABE82','synthetic source plate is preserved');
   assert.equal(outcome.edgeDetected,true);
   assert.equal(outcome.appearance,null,'no background-colored rim invented');
  }
  assert.equal(canvas.width,0,'transient canvas cleared');
  assert.equal(canvas.height,0,'transient canvas cleared');
  return calls;
 }
 assert.deepEqual(await run(false),['bitmap','draw:bitmap','close-bitmap'],
  'working bitmap decode must remain the fast path');
 assert.deepEqual(await run(true),['bitmap','create-url','draw:img','revoke-url'],
  'bitmap rejection must retry browser Image decoding and revoke its object URL');
 assert.deepEqual(await run(true,true),['bitmap','create-url','revoke-url'],
  'a genuinely unreadable photo fails cleanly and releases its temporary URL');
 // No fixture is a real customer photo or controlled dye/pigment measurement.
});
