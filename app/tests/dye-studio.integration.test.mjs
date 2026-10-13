import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../src/App.tsx');
const dAndU = read('../src/pages/DyedUnattachedPage.tsx');
const shell = read('../src/components/Shell.tsx');
const studioHtml = read('../public/dyed-and-unattached/dye-studio/index.html');
const studioScript = read('../public/dyed-and-unattached/dye-studio/studio.js');
const studio = studioHtml + '\n' + studioScript;

test('nested route preserves D&U navigation and forwards to the same-origin studio app', () => {
  assert.match(app, /\/dyed-and-unattached\/dye-studio.*canonical:'\/dyed-and-unattached\/dye-studio'/);
  assert.match(app, /path==='\/dyed-and-unattached\/dye-studio'\)return <DyeStudioPage\/>/);
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
    ['Floetrol dye','floetrol-unspecified'],
    ['Direct acetone brush painting','acetone-direct'],
    ['Quick Coat UV Blast worm dip','worm-dip'],
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
  assert.match(studio,/Of 58 provisional records/);
  assert.match(studio,/no measured numeric color data/);
  assert.match(studio,/Manufacturer starting guidance is 1\/2 tsp powder/);
  assert.match(studio,/potential adhesive softening and blurred edges/);
  assert.match(studio,/One brush pass can leave visible streaks/);
  assert.match(studio,/Multiple direct-acetone passes may deepen color but are NOT a validated linear multiplier/);
});

test('source method matching evaluates the actual dye block rather than the project default', () => {
  assert.match(studio,/const matchingLayers=layers\.filter\(l=>evidenceDyeFamilyMatches/);
  assert.match(studio,/const comparableLayers=matchingLayers\.length\?matchingLayers:layers/);
  assert.match(studio,/comparableLayers\.some\(l=>methodForDyeLayer\(l\)===observedMethod\)/);
  assert.match(studio,/MIXED APPLICATION METHODS/);
  assert.match(studio,/FORMULATION MISMATCH/);
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
  const env={ $,document:{createElement:tag=>tag==='canvas'?fakeCanvas:{download:'',href:'',click(){output.push(this.download)}}},
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
    layers:[],selected:-1,sample:{x:0,y:0},history:[],historyIndex:-1,isRestoring:false,
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
 const env={PAINT_SIZE:size,paintCtx:ctx,paintedImage:null,regionKeyAt:(x)=>x>0?'1':'0',
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
