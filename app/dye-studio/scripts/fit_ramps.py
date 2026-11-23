#!/usr/bin/env python3
"""Concentration-response from single-dye ramps (Osborn acid dyes on wool, 6 levels x 11 dyes). K/S from luminance:
K/S=(1-Y)^2/(2Y) with Y relative to the lightest-lowest sample extrapolated to white. Forms: lin, power, exp (1-exp(-c/cs)), lang (c/(1+c/cs)).
Reports mean relative SSE per form and the median fitted cs in percent owf."""
import json,numpy as np
from scipy.optimize import least_squares
ROOT=__file__.rsplit('/scripts/',1)[0]
rows=json.load(open(ROOT+'/research/dataset/mixing_rows.json'))
ser={}
for r in rows:
    if r['kind']=='single_ramp' and r.get('ramp_id') and r.get('conc_pct') is not None and 'Acid' in r['brand']:
        ser.setdefault(r['ramp_id'],[]).append((float(r['conc_pct']),r['result_lab'][0]))
def Y(L):f=(L+16)/116;return f**3 if f**3>216/24389 else (116*f-16)/(24389/27)
def KS(L,Lw=96.):y=min(.97,max(.02,Y(L)/Y(Lw)));return (1-y)**2/(2*y)
forms={'lin':lambda c,p:p[0]*c,'power':lambda c,p:p[0]*c**p[1],'exp':lambda c,p:p[0]*(1-np.exp(-c/p[1])),'lang':lambda c,p:p[0]*c/(1+c/p[1])}
init={'lin':[1],'power':[1,.7],'exp':[5,1.5],'lang':[5,1.5]}
pw=[];tot={k:[] for k in forms};cs={'exp':[],'lang':[]};n=0
for k,v in sorted(ser.items()):
    v=sorted(v)
    if len(v)<5:continue
    c=np.array([a for a,_ in v]);y=np.array([KS(l) for _,l in v]);n+=1
    for f,fn in forms.items():
        lo=[0]+[.05]*(len(init[f])-1);hi=[500]+[5 if f=='power' else 50]*(len(init[f])-1)
        r=least_squares(lambda p:(fn(c,p)-y)/(y.mean()+1e-6),init[f],bounds=(lo,hi));tot[f].append(float(np.mean(r.fun**2)))
        if f in cs:cs[f].append(r.x[1])
        if f=='power':pw.append(r.x[1])
out={'series':n,'mean_rel_mse':{k:round(float(np.mean(v)),4) for k,v in tot.items()},'median_cs_pct_owf':{k:round(float(np.median(v)),2) for k,v in cs.items()},'power_exponent_median':round(float(np.median(pw)),2),'power_exponent_iqr':[round(float(np.percentile(pw,25)),2),round(float(np.percentile(pw,75)),2)],'ramp_levels_pct':[.25,.5,1,1.5,2,3]}
print(json.dumps(out));json.dump(out,open(ROOT+'/research/mixing/ramp_results.json','w'),indent=1)
