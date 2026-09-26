#!/usr/bin/env python3
from __future__ import annotations
import argparse,json

CANDIDATES=[25,26,27]

def scan_pins(value,path='root',out=None):
    if out is None: out=[]
    if isinstance(value,dict):
        for k,v in value.items():
            p=f'{path}.{k}'
            if 'pin' in k.lower():
                vals=v if isinstance(v,list) else [v]
                for n in vals:
                    if isinstance(n,int): out.append((n,p))
            scan_pins(v,p,out)
    elif isinstance(value,list):
        for i,v in enumerate(value): scan_pins(v,f'{path}[{i}]',out)
    return out

def choose(cfg):
    used=scan_pins(cfg); usednums={n for n,_ in used}
    free=[n for n in CANDIDATES if n not in usednums]
    return {
        'mutationIssued':False,
        'candidatePins':CANDIDATES,
        'usedPins':[{'pin':n,'path':p} for n,p in used],
        'freeCandidates':free,
        'selectedPin':free[0] if free else None,
        'reviewRequired':True,
    }

def selftest():
    cfg={'hw':{'led':{'ins':[{'pin':[16]}]}},'um':{'audio':{'audioPin':32}}}
    p=choose(cfg); assert p['selectedPin']==25 and len(p['freeCandidates'])==3
    p=choose({'x':{'pin':[25,26]},'y':{'relay_pin':27}}); assert p['selectedPin'] is None
    print('HBNF_UV_PIN_PLAN_SELFTEST=PASS')

def main():
    ap=argparse.ArgumentParser(description='Review-only selector for a spare SP803E PWM GPIO; never changes WLED.')
    ap.add_argument('cfg',nargs='?')
    ap.add_argument('--selftest',action='store_true')
    a=ap.parse_args()
    if a.selftest: selftest(); return 0
    if not a.cfg: ap.error('cfg JSON path required')
    p=choose(json.load(open(a.cfg)))
    print(json.dumps(p,indent=2,sort_keys=True))
    return 0 if p['selectedPin'] is not None else 2
if __name__=='__main__': raise SystemExit(main())
