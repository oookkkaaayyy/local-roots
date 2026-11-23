#!/usr/bin/env python3
"""Leave-one-dye-out CV on Rit DyeMore (polyester): for each dye X, train on rows without X plus X's single-dye rows,
test on mixes containing X. Usage: python3 fit_mixing_lodo.py"""
import json,numpy as np,sys
sys.path.insert(0,__file__.rsplit('/',1)[0])
from fit_mixing import *
names,D=dataset('polyester');nd=len(names);C=D['C'];res={m:[] for m in['bl','km','geo','rgb']}
nz=(C>0)
for x in range(nd):
    has=nz[:,x];single=has&(nz.sum(1)==1);test=np.where(has&~single)[0]
    if len(test)==0 or single.sum()==0:continue
    tr=np.where(~has|single)[0]
    for m in res:
        P=fit(m,D,tr,nd);res[m]+=list(evaluate(m,P,D,test,nd))
    print(names[x],len(test),flush=True)
out={m:summarize(np.array(v)) for m,v in res.items()};print(json.dumps(out));json.dump(out,open(ROOT+'/research/mixing/lodo_results.json','w'),indent=1)
