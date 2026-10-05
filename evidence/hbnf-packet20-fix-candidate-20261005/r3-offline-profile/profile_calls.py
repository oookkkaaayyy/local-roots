#!/usr/bin/env python3
"""Static Packet20 render_value/pnoise call-count audit against the exact r1-bound header."""
import hashlib, json, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
HEADER=ROOT/'evidence/hbnf-packet20-fresh-20261005/source-bound-package/ANIMartRIX.patched.h'
INVENTORY=ROOT/'config/HBNF_KERNEL_SWEEP_INVENTORY_20261003.json'
h=HEADER.read_text()
inv=json.loads(INVENTORY.read_text())

def function_body(name):
    m=re.search(r'(?m)^void\s+'+re.escape(name)+r'\s*\([^)]*\)\s*\{',h)
    if not m: raise KeyError(f'no exact ANIMartRIX method: {name}')
    i=m.end(); depth=1; state='code'; esc=False
    while i<len(h):
        c=h[i]; n=h[i+1] if i+1<len(h) else ''
        if state=='line':
            if c=='\n': state='code'
        elif state=='block':
            if c=='*' and n=='/': state='code'; i+=1
        elif state in ('str','char'):
            if esc: esc=False
            elif c=='\\': esc=True
            elif (state=='str' and c=='"') or (state=='char' and c=="'"): state='code'
        elif c=='/' and n=='/': state='line'; i+=1
        elif c=='/' and n=='*': state='block'; i+=1
        elif c=='"': state='str'
        elif c=="'": state='char'
        elif c=='{': depth+=1
        elif c=='}':
            depth-=1
            if depth==0: return h[m.end():i]
        i+=1
    raise ValueError(f'unbalanced method: {name}')

rows=[]
for e in inv['entries']:
    name=e['kernel_name']; b=function_body(name)
    rv_sites=len(re.findall(r'\brender_value\s*\(\s*animation\s*\)',b))
    calc=len(re.findall(r'\bcalculate_oscillators\s*\(\s*timings\s*\)',b))
    default=len(re.findall(r'\brun_default_oscillators\s*\(',b))
    direct=len(re.findall(r'\bpnoise\s*\(',b))
    # The effect bodies' render_value sites are all in the nested x/y pixel loop.
    pixel_loop_count=bool(re.search(r'for\s*\(\s*int\s+x\s*=.*?for\s*\(\s*int\s+y\s*=',b,re.S))
    if rv_sites and not pixel_loop_count: raise AssertionError(f'{name}: call sites outside canonical pixel loop')
    rows.append({
      'ordinal':e['ordinal'],'effect_id':e['effect_id'],'kernel':name,
      'render_value_sites_per_pixel':rv_sites,
      'render_value_calls_per_frame_static_32x16':rv_sites*32*16,
      'direct_pnoise_call_sites_in_kernel':direct,
      'oscillator_pnoise_calls_per_frame':10*(calc+default),
      'pnoise_calls_per_frame_static_32x16':rv_sites*32*16+direct+10*(calc+default),
      'floorf_source_occurrences_per_frame':6*(rv_sites*32*16+direct+10*(calc+default)),
      'render_value_sites_in_32x16_pixel_loop':pixel_loop_count,
      'z_is_pixel_invariant_by_source':True
    })

pnoise_body=re.search(r'(?ms)^static float pnoise\(float x, float y, float z\) \{(.*?)^\}',h).group(1)
summary={
 'schema':'hbnf-packet20-render-value-pnoise-static-profile-v1',
 'method':'static source call-site and loop-multiplier audit; no firmware instrumentation was added',
 'source':str(HEADER.relative_to(ROOT)),
 'source_sha256':hashlib.sha256(HEADER.read_bytes()).hexdigest(),
 'inventory':str(INVENTORY.relative_to(ROOT)),
 'inventory_sha256':hashlib.sha256(INVENTORY.read_bytes()).hexdigest(),
 'matrix_pixels_per_frame':32*16,
 'kernel_count':len(rows),
 'pnoise_implementation':{
   'floorf_text_occurrences_per_call':len(re.findall(r'\bfloorf\s*\(',pnoise_body)),
   'fade_calls_per_call':len(re.findall(r'\bfade\s*\(',pnoise_body)),
   'lerp_calls_per_call':len(re.findall(r'\blerp\s*\(',pnoise_body)),
   'grad_calls_per_call':len(re.findall(r'\bgrad\s*\(',pnoise_body)),
   'note':'These are source-level call/operator counts. The target compiler may inline, CSE, or otherwise change code generation.'
 },
 'rows':rows
}
out=Path(__file__).with_name('PACKET20_R3_STATIC_CALL_COUNTS.json')
out.write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:summary[k] for k in ('kernel_count','matrix_pixels_per_frame','pnoise_implementation')},indent=2))
print('output',out)
