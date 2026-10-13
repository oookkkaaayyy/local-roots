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
const realm = { document, localStorage: { getItem: () => null, setItem: () => {} } };
vm.createContext(realm);
vm.runInContext(source.slice(0, boundary) +
  '\nglobalThis.model = { defaults, dyes, researchPredictPoint, researchPredict, regionKeyAt, setLayers(value){layers=value} };',
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

test('calibration provenance: nominal intensity is not physical carrier/pass calibration', () => {
  assert.match(source,/Per-block methods change warnings and evidence ranking, NOT the numerical preview/);
  const html = readFileSync(new URL('../public/dyed-and-unattached/dye-studio/index.html', import.meta.url), 'utf8');
  assert.match(html,/100% nominal model input/);
  assert.match(html,/NOT a measured dye concentration or validated physical recipe/);
  assert.doesNotMatch(source,/photo RGB.*certified physical reflectance/i);
});
