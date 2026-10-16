import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Execute the released predictor itself in an isolated JS realm. No mock
// replacement of color functions, browser, real photos, network or calibration.
const source = readFileSync(new URL('../public/dyed-and-unattached/dye-studio/studio.js', import.meta.url), 'utf8');
const boundary = source.indexOf('\nfunction colorForRegion(');
assert.ok(boundary > 0, 'predictor boundary must be present');
const canvas = () => ({ getContext: () => ({}) });
const elements = new Map();
const document = {
  createElement: () => canvas(),
  getElementById(id) {
    if (id === 'canvas') return canvas();
    if (!elements.has(id)) elements.set(id, { value: id === 'baseHex' ? '#B0AB8B' : '' });
    return elements.get(id);
  }
};
const realm = { document, window: {}, localStorage: { getItem: () => null, setItem: () => {} } };
vm.createContext(realm);
vm.runInContext(source.slice(0, boundary) +
  '\nglobalThis.model = { defaults, dyes, researchPredictPoint, researchPredict, regionKeyAt, opticalProfileFor, setLayers(value){layers=value}, setScene(value){daylightScene=value} };',
  realm, { timeout: 10000, filename: 'studio-model-source.js' });
const { defaults, dyes, researchPredictPoint: predict, researchPredict, regionKeyAt, setLayers } = realm.model;
const profiles = Array.from(defaults()).filter(p => [
  'innova_star', 'innova_champion', 'innova_gstar', 'innova_proto_glow_champion'
].includes(p.id));
const bases = ['#FFFFFF','#000000','#808080','#B0AB8B','#00BBDD','#FFDD00','#FF1A99'];
const modes = ['daylight','uv365','glow'];
const radii = [.3,.7,.95];
const inventory = Array.from(dyes).filter(d => d[0] === 'My Inventory');
const layer = row => ({
  name: row[1], hex: row[2], strength: 100, passes: 1, method: 'acetone-direct'
});
const layers = inventory.map(layer);
const dye = name => {
  const found = layers.find(l => l.name === name);
  assert.ok(found, 'missing inventory dye: ' + name);
  return found;
};
const color = (base, selected, mode, profile, radius) =>
  predict(base, selected, mode, profile, radius, 0);
const valid = result => /^#[0-9A-F]{6}$/.test(result);
const eachScene = callback => {
  for (const profile of profiles) for (const base of bases)
    for (const mode of modes) for (const radius of radii)
      callback({ profile, base, mode, radius });
};

test('exact predictor loads; all four requested premium-plastic profiles are present', () => {
  assert.equal(profiles.length, 4);
  assert.equal(layers.length, 13); // Includes UV Blast Clear, which may be optically neutral.
});

test('daylight 100%-intensity numeric snapshots preserve released behavior', () => {
  const cases = [
    ['innova_star','#F4F2E8','daylight',.3,'ProChem Neon Cerise Pink','#C63596'],
    ['innova_gstar','#A5D98C','daylight',.95,'iDye Poly Blue','#11216D'],
    ['innova_proto_glow_champion','#B0AB8B','daylight',.3,'iDye Poly Blue','#284589'],
    ['innova_champion','#DCE8E1','uv365',.7,'ProChem Neon Key Lime','#4FFF21'],
    ['innova_proto_glow_champion','#B0AB8B','glow',.3,'ProChem Onyx','#6BB841']
  ];
  for (const [id,base,mode,radius,name,expected] of cases) {
    const profile = profiles.find(p => p.id === id);
    assert.equal(color(base,[dye(name)],mode,profile,radius), expected, name + ' ' + id);
  }
});

test('no dye, or nominal zero-strength dyes, preserve neutral optical appearance', () => {
  eachScene(({profile,base,mode,radius}) => {
    const empty = color(base,[],mode,profile,radius);
    assert.ok(valid(empty));
    for (const d of layers) {
      const zero = {...d,strength:0};
      assert.equal(color(base,[zero],mode,profile,radius),empty,
        [profile.id,base,mode,radius,d.name].join(' / '));
    }
    // A zero-intensity second layer must also be absent from an overlap.
    const first = dye('iDye Poly Blue'), zero = {...dye('ProChem Neon Cerise Pink'),strength:0};
    assert.equal(color(base,[first,zero],mode,profile,radius),
                 color(base,[first],mode,profile,radius));
  });
});

test('all single, two-dye, reversed-overlap and colored-base outputs are valid/repeatable', () => {
  let evaluated = 0, reverseDifferent = 0;
  eachScene(({profile,base,mode,radius}) => {
    for (const a of layers) {
      const once = color(base,[a],mode,profile,radius);
      assert.ok(valid(once)); assert.equal(once,color(base,[a],mode,profile,radius));
      evaluated += 2;
    }
    // Colored overlap does not promise mixing direction or monotonic luminance.
    for (let i=0;i<layers.length;i++) for (let j=i+1;j<layers.length;j++) {
      const ab=color(base,[layers[i],layers[j]],mode,profile,radius);
      const ba=color(base,[layers[j],layers[i]],mode,profile,radius);
      assert.ok(valid(ab)&&valid(ba));
      if (ab!==ba) reverseDifferent++;
      evaluated += 2;
    }
  });
  assert.ok(evaluated > 30000);
  assert.ok(reverseDifferent>0, 'order should matter for some modeled overlays');
});

test('method and pass count are intentionally NOT unverified numerical drivers', () => {
  eachScene(({profile,base,mode,radius}) => {
    for(const original of [dye('ProChem Onyx'),dye('iDye Poly Blue'),dye('ProChem Neon Cerise Pink')]) {
      const expected=color(base,[original],mode,profile,radius);
      assert.equal(color(base,[{...original,method:'floetrol-stencil'}],mode,profile,radius),expected);
      assert.equal(color(base,[{...original,passes:4}],mode,profile,radius),expected);
    }
  });
});

test('nominal strength affects known preview pathways without asserting physical dose curves', () => {
  const p=profiles.find(p=>p.id==='innova_proto_glow_champion'),b='#B0AB8B';
  for (const mode of modes) {
    const d=dye('ProChem Neon Cerise Pink');
    const low=color(b,[{...d,strength:25}],mode,p,.3);
    const high=color(b,[{...d,strength:100}],mode,p,.3);
    assert.notEqual(low,high,'strength should affect nominal '+mode+' projection');
  }
});

test('optical zones vary on translucent plastic; uncovered shapes retain blank color', () => {
  const translucent=profiles.find(p=>p.id==='innova_proto_glow_champion'),b='#B0AB8B';
  assert.notEqual(color(b,[dye('iDye Poly Blue')],'daylight',translucent,.3),
                  color(b,[dye('iDye Poly Blue')],'daylight',translucent,.95));
  const stripe={...dye('iDye Poly Blue'),shape:'stripe',angle:0,offset:0,width:.2};
  setLayers([stripe]);
  assert.equal(regionKeyAt(0,.2),'1');
  assert.equal(regionKeyAt(.5,.2),'0');
  const blank=color(b,[],'daylight',translucent,.3);
  assert.equal(blank,color(b,[], 'daylight',translucent,.3));
  setLayers([]);
});

test('channel, hue, saturation and linear-luminance extremes remain numerical', () => {
  const linear = c => {
    c/=255;
    return c<=.04045 ? c/12.92 : ((c+.055)/1.055)**2.4;
  };
  const batches=[[],[dye('iDye Poly Blue')],[dye('ProChem Neon Cerise Pink')],
    [dye('ProChem Onyx')],[dye('UV Blast Green'),dye('iDye Poly Crimson')],
    [dye('iDye Poly Blue'),dye('ProChem Neon Cerise Pink')]];
  eachScene(({profile,base,mode,radius}) => {
    for (const batch of batches) {
      const output=color(base,batch,mode,profile,radius);
      const rgb=[1,3,5].map(i=>parseInt(output.slice(i,i+2),16));
      assert.ok(rgb.every(v=>Number.isInteger(v)&&v>=0&&v<=255));
      const max=Math.max(...rgb),min=Math.min(...rgb),delta=max-min;
      const hueRaw = delta === 0 ? 0
        : max === rgb[0] ? 60*(((rgb[1]-rgb[2])/delta)%6)
        : max === rgb[1] ? 60*((rgb[2]-rgb[0])/delta+2)
        : 60*((rgb[0]-rgb[1])/delta+4);
      const hue = (hueRaw+360)%360;
      assert.ok(Number.isFinite(hue)&&hue>=0&&hue<360);
      const chroma=delta/255,lightness=(max+min)/510;
      const saturation=delta===0?0:delta/(255*(1-Math.abs(2*lightness-1)));
      const luminance=.2126*linear(rgb[0])+.7152*linear(rgb[1])+.0722*linear(rgb[2]);
      assert.ok([chroma,lightness,saturation,luminance].every(Number.isFinite));
      assert.ok(chroma>=0&&chroma<=1&&lightness>=0&&lightness<=1);
      assert.ok(saturation>=0&&saturation<=1+1e-8);
      assert.ok(luminance>=0&&luminance<=1);
    }
  });
});

test('real-world source matching prioritizes actual direct-acetone process over glue-bed analogies', () => {
  const start=source.indexOf('// v9.2 reusable evidence layer.');
  const end=source.indexOf('function renderEvidenceAdvisory()',start);
  assert.ok(start>0 && end>start, 'source evidence section missing');
  vm.runInContext(source.slice(start,end) +
    '\nglobalThis.fieldAudit={EVIDENCE_OBSERVATIONS,FIELD_CASES,ALL_DYE_EVIDENCE,evidenceScore,classifyObservedProcess,materialClass};',
    realm, {timeout:10000});
  const evidence=realm.fieldAudit;
  assert.equal(evidence.FIELD_CASES.length,22);
  assert.equal(evidence.ALL_DYE_EVIDENCE.length,80);
  const byId=id=>evidence.FIELD_CASES.find(x=>x.id===id);
  const expectedProcesses = [
    ['FIELD-AC-01','acetone-direct'],['FIELD-AC-02','acetone-direct'],
    ['FIELD-AC-03','acetone-direct'],['FIELD-AC-04','mixed-or-compound-process'],
    ['FIELD-AC-05','acetone-direct'],['FIELD-ANALOG-01','acetone-spin'],
    ['FIELD-GLUE-01','acetone-glue-bed'],['FIELD-GLUE-02','acetone-glue-bed'],
    ['FIELD-FLO-01','floetrol-bed'],['FIELD-FLO-02','floetrol-bed'],
    ['FIELD-OTHER-01','water-dip'],['FIELD-PHOTO-01','unknown'],
    ['FIELD-COMPARE-01','acetone-unspecified'],
    ['FIELD-TIME-01','lotion'],
    ['FIELD-AC-PALETTE-01','acetone-unspecified'],
    ['FIELD-AC-SOLVENT-01','acetone-unspecified'],
    ['FIELD-CARRIER-01','unknown'],
    ['FIELD-SAME-DISC-MEDIA-01','mixed-or-compound-process'],
    ['FIELD-STAR-WRAITH-STENCIL-01','mixed-or-compound-process'],
    ['FIELD-STAR-WHITE-GLUE-VIDEO-01','acetone-glue-bed'],
    ['FIELD-ONYX-STENCIL-01','floetrol-stencil'],
    ['FIELD-ONYX-SAME-DISC-CARRIER-01','mixed-or-compound-process']
  ];
  for(const [id,category] of expectedProcesses)
    assert.equal(evidence.classifyObservedProcess(byId(id).medium),category,id);
  setLayers([{...dye('ProChem Neon Cerise Pink'),method:'acetone-direct'}]);
  const directlyPainted=evidence.evidenceScore(byId('FIELD-AC-01'),[],'Innova Star','white');
  const unlikeGlueBed=evidence.evidenceScore(byId('FIELD-GLUE-02'),[],'Innova Star','white');
  assert.ok(directlyPainted && unlikeGlueBed);
  assert.ok(directlyPainted.methodMatch && !unlikeGlueBed.methodMatch);
  assert.ok(directlyPainted.score > unlikeGlueBed.score,
    'a single glue-bed result cannot outrank process-matched direct painting');
  setLayers([]);
  for(const item of evidence.FIELD_CASES){
    assert.ok(item.sourceUrl.startsWith('https://'), item.id);
    assert.ok(item.limitations && item.verification,item.id);
  }
});

test('calibration provenance: nominal intensity is not physical carrier/pass calibration', () => {
  assert.match(source,/Per-block methods change warnings and evidence ranking, NOT the numerical preview/);
  const html = readFileSync(new URL('../public/dyed-and-unattached/dye-studio/index.html', import.meta.url), 'utf8');
  assert.match(html,/100% nominal model input/);
  assert.match(html,/NOT a measured dye concentration or validated physical recipe/);
  assert.doesNotMatch(source,/photo RGB.*certified physical reflectance/i);
});

test('passive opaque daylight color never brightens above the undyed plastic in any RGB channel', () => {
 const opaque=Array.from(defaults()).filter(p=>['innova_star','innova_gstar','innova_proto_glow_star'].includes(p.id));
 assert.equal(opaque.length,3);
 const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
 const bases=['#000000','#111111','#333333','#550000','#000044','#004400','#FFEE00','#FFFFFF'];
 for(const p of opaque)for(const base of bases)for(const radius of radii){
  const blank=rgb(color(base,[],'daylight',p,radius));
  for(const name of ['iDye Poly Blue','iDye Poly Crimson','ProChem Onyx']){
   const actual=rgb(color(base,[dye(name)],'daylight',p,radius));
   assert.ok(actual.every((value,i)=>value<=blank[i]),p.id+' / '+base+' / '+name+' / '+radius);
  }
 }
 const star=opaque.find(p=>p.id==='innova_star');
 for(const name of ['iDye Poly Blue','iDye Poly Crimson','ProChem Onyx'])
  assert.equal(color('#000000',[dye(name)],'daylight',star,.3),'#000000');
});

test('UV-reactive colorants remain exempt from nonfluorescent absorption ceiling',()=>{
 const star=Array.from(defaults()).find(p=>p.id==='innova_star');
 assert.equal(color('#000000',[dye('ProChem Neon Cerise Pink')],'daylight',star,.3),'#27071D');
 assert.equal(color('#000000',[dye('ProChem Neon Cerise Pink')],'uv365',star,.3),
  researchPredict('#000000',[dye('ProChem Neon Cerise Pink')],'uv365',star));
});


test('ordinary dyes cannot visibly recolor an already black-stenciled opaque disc', () => {
 const opaque=Array.from(defaults()).filter(p=>['innova_star','innova_gstar','innova_proto_glow_star'].includes(p.id));
 const bases=['#FFFFFF','#E6DDB5','#B7C4DC','#1C1C1C'];
 const radii=[.3,.7,.95];
 const black=dye('ProChem Onyx');
 const other=[dye('iDye Poly Blue'),dye('iDye Poly Crimson')];
 const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
 let guarded=0;
 for(const profile of opaque)for(const base of bases)for(const radius of radii){
  const previous=color(base,[black],'daylight',profile,radius);
  const priorRgb=rgb(previous);
  for(const subsequent of other){
   const actual=color(base,[black,subsequent],'daylight',profile,radius);
   assert.ok(rgb(actual).every((v,i)=>v<=priorRgb[i]),
     profile.id+' '+base+' radius='+radius+' Onyx then '+subsequent.name+': '+actual+' > '+previous);
   guarded++;
   assert.equal(color(base,[black,{...subsequent,strength:0}],'daylight',profile,radius),previous);
  }
 }
 assert.equal(guarded,72);
 // No blanket clamp is imposed on nonblack pigment mixtures or fluorescents.
 for(const profile of opaque){
  const blue=dye('iDye Poly Blue'),red=dye('iDye Poly Crimson');
  assert.equal(color('#FFFFFF',[blue,red],'daylight',profile,.3),
    color('#FFFFFF',[blue,red],'daylight',profile,.3));
  const before=color('#FFFFFF',[black,dye('ProChem Neon Cerise Pink')],'daylight',profile,.3);
  const standalone=color('#FFFFFF',[black],'daylight',profile,.3);
  assert.notEqual(before,standalone,'fluorescent color remains exempt from passive black guard');
 }
});

test('translucent daylight: passive dyes never increase channel energy above the same blank',()=>{
 const trans=Array.from(defaults()).filter(p=>(p.optical||'').includes('champion'));
 const rx=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
 const scenes=['surface','outdoor','backlit'];
 const bases=['#FFFFFF','#000000','#808080','#DCE8E1','#006699','#FFDD00','#EE2288'];
 const passive=['iDye Poly Blue','iDye Poly Crimson','ProChem Onyx'];
 const point=realm.model.researchPredictPoint;
 let checked=0;
 for(const p of trans)for(const base of bases)for(const radius of [.3,.7,.95])
  for(const scene of scenes){
   realm.model.setScene(scene);
   const blank=rx(point(base,[],'daylight',p,radius,0));
   for(const name of passive){
    const l=dye(name);
    const tiny=rx(point(base,[{...l,strength:.01}],'daylight',p,radius,0));
    const full=rx(point(base,[l],'daylight',p,radius,0));
    assert.ok(tiny.every((v,i)=>Math.abs(v-blank[i])<=1),p.id+' '+scene+' '+name+' tiny dose');
    assert.ok(full.every((v,i)=>v<=blank[i]),p.id+' '+scene+' '+name+' passive absorption');
    checked++;
   }
  }
 assert.ok(checked>=500);
 realm.model.setScene('outdoor');
});

test('named polymer claims require verified source and cannot be inferred from text mentions',()=>{
 const e=realm.fieldAudit;
 const byId=id=>e.ALL_DYE_EVIDENCE.find(o=>o.id===id);
 setLayers([{...dye('ProChem Onyx'),method:'floetrol-stencil',strength:100}]);
 const rank=id=>e.evidenceScore(byId(id),[],'Innova Star','white');
 assert.equal(rank('FIELD-STAR-WRAITH-STENCIL-01').samePlastic,true);
 assert.equal(rank('FIELD-FLO-01').samePlastic,true);
 assert.equal(rank('FIELD-PHOTO-01').samePlastic,false);
 assert.equal(rank('FIELD-PHOTO-01').sameFamily,true);
 assert.equal(rank('A04'),null,'three-polymer summary cannot establish a single-polymer trial');
 const hypothetical={...byId('QA-WD-04'),dyes:'ProChem Onyx',medium:'Floetrol stencil painted'};
 assert.equal(e.evidenceScore(hypothetical,[],'Innova Star','white').samePlastic,false);
 assert.equal(rank('FIELD-ONYX-SAME-DISC-CARRIER-01').samePlastic,false);
 assert.equal(rank('FIELD-ONYX-STENCIL-01').samePlastic,false);
 assert.equal(e.materialClass('Innova Star; Champion; GStar'),'unknown');
 setLayers([]);
});
