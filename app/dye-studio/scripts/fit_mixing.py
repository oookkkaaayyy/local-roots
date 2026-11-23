#!/usr/bin/env python3
"""Fit and cross-validate dye blending models on research/dataset/mixing_rows.json.
Usage: python3 fit_mixing.py [class]   class = polyester | cotton | procion   (default: all)
Models: bl (per-dye saturation + additive absorbance, Beer-Lambert), km (single-constant Kubelka-Munk K/S additive),
rgb (per-channel subtractive in linear RGB), geo (spectral.js-style weighted geometric mix at total concentration),
lin (linear RGB average of single-dye colors). dE2000 reported on held-out rows (5-fold random and leave-one-dye-out)."""
import json,sys,math,numpy as np
from scipy.optimize import least_squares
ROOT=__file__.rsplit('/scripts/',1)[0]
rows=json.load(open(ROOT+'/research/dataset/mixing_rows.json'))
lam=np.arange(400,701,10.0)
def g(l,mu,s1,s2):
    t=(l-mu)/np.where(l<mu,s1,s2);return np.exp(-.5*t*t)
cmf=np.stack([1.056*g(lam,599.8,37.9,31.0)+.362*g(lam,442.0,16.0,26.7)-.065*g(lam,501.1,20.4,26.2),
 .821*g(lam,568.8,46.9,40.5)+.286*g(lam,530.9,16.3,31.1),1.217*g(lam,437.0,11.8,36.0)+.681*g(lam,459.0,26.0,13.8)],1)
d65=np.array([82.75,91.49,93.43,86.68,104.86,117.01,117.81,114.86,115.92,108.81,109.35,107.80,104.79,107.69,104.41,104.05,100.00,96.33,95.79,88.69,90.01,89.60,87.70,83.29,83.70,80.03,80.21,82.28,78.28,69.72,71.61])
M=np.array([[3.2406,-1.5372,-.4986],[-.9689,1.8758,.0415],[.0557,-.2040,1.0570]])
kn=(cmf[:,1]*d65).sum()
W=(cmf*d65[:,None]).T/kn   # 3 x 31
def lin_of(R):
    xyz=R@W.T; rgb=xyz@M.T; wp=(M@(W.sum(1)))
    return rgb/wp
def s2l(v):v=v/255;return np.where(v<=.04045,v/12.92,((v+.055)/1.055)**2.4)
def lab_of_lin(l):
    l=np.clip(l,0,None);X=(.4124*l[...,0]+.3576*l[...,1]+.1805*l[...,2])/.95047;Y=.2126*l[...,0]+.7152*l[...,1]+.0722*l[...,2];Z=(.0193*l[...,0]+.1192*l[...,1]+.9505*l[...,2])/1.08883
    f=lambda t:np.where(t>216/24389,np.cbrt(t),(24389/27*t+16)/116);fx,fy,fz=f(X),f(Y),f(Z);return np.stack([116*fy-16,500*(fx-fy),200*(fy-fz)],-1)
def de2000(p,q):
    L1,a1,b1=p.T;L2,a2,b2=q.T;C1=np.hypot(a1,b1);C2=np.hypot(a2,b2);Cb=(C1+C2)/2;G=.5*(1-np.sqrt(Cb**7/(Cb**7+25**7)))
    a1p=a1*(1+G);a2p=a2*(1+G);C1p=np.hypot(a1p,b1);C2p=np.hypot(a2p,b2);h=lambda b,a:np.degrees(np.arctan2(b,a))%360
    h1=h(b1,a1p);h2=h(b2,a2p);dL=L2-L1;dC=C2p-C1p;dh=h2-h1;dh=np.where(dh>180,dh-360,np.where(dh<-180,dh+360,dh));dh=np.where(C1p*C2p==0,0,dh)
    dH=2*np.sqrt(C1p*C2p)*np.sin(np.radians(dh)/2);Lb=(L1+L2)/2;Cbp=(C1p+C2p)/2;hb=np.where(np.abs(h1-h2)>180,(h1+h2+np.where(h1+h2<360,360,-360))/2,(h1+h2)/2)
    T=1-.17*np.cos(np.radians(hb-30))+.24*np.cos(np.radians(2*hb))+.32*np.cos(np.radians(3*hb+6))-.2*np.cos(np.radians(4*hb-63))
    dth=30*np.exp(-((hb-275)/25)**2);Rc=2*np.sqrt(Cbp**7/(Cbp**7+25**7));SL=1+.015*(Lb-50)**2/np.sqrt(20+(Lb-50)**2);SC=1+.045*Cbp;SH=1+.015*Cbp*T;RT=-np.sin(np.radians(2*dth))*Rc
    return np.sqrt((dL/SL)**2+(dC/SC)**2+(dH/SH)**2+RT*(dC/SC)*(dH/SH))
KN=np.linspace(400,700,7)
def spec_of(p):  # 7 knots -> 31 nonneg absorbance
    return np.interp(lam,KN,np.log1p(np.exp(p)))
R0=0.93
def sat(c,cs):return cs*(1-np.exp(-c/cs))
def predict(model,P,C,nd):
    """C: rows x nd matrix of tsp amounts. Returns rows x 3 Lab."""
    cs=P['cs']
    if model=='rgb':
        a=np.log1p(np.exp(P['A']));T=np.exp(-(sat(C,cs)@a));return lab_of_lin(R0*T)
    A=np.log1p(np.exp(P['A'][:,None,:]*0+0)) if False else np.stack([spec_of(P['A'][i]) for i in range(nd)])
    if model=='bl':
        R=R0*np.exp(-2*(sat(C,cs)@A))
    elif model=='geo':
        ct=C.sum(1,keepdims=True)+1e-9;w=C/ct;R=R0*np.exp(-2*sat(ct,cs)*(w@A))
    elif model=='kmc':   # KM K/S additive with competitive Langmuir uptake (dyes in one bath share sites)
        th=C/(1+C.sum(1,keepdims=True)/cs);ks=(1-R0)**2/(2*R0)+th@A;R=1+ks-np.sqrt(ks*ks+2*ks)
    elif model=='km':
        ks=(1-R0)**2/(2*R0)+sat(C,cs)@A;R=1+ks-np.sqrt(ks*ks+2*ks)
    elif model=='lin':
        ct=C.sum(1,keepdims=True)+1e-9;w=C/ct
        Ri=R0*np.exp(-2*sat(C,cs)[:,:,None]*A[None,:,:])   # rows x nd x 31
        L=lin_of(Ri);return lab_of_lin((w[:,:,None]*L).sum(1))
    return lab_of_lin(lin_of(R))
def unpack(model,x,nd):
    k=3 if model=='rgb' else 7
    return {'A':x[:nd*k].reshape(nd,k),'cs':math.exp(x[-1])}
def dataset(cls):
    sel={'polyester':lambda r:r['brand']=='Rit DyeMore','cotton':lambda r:r['brand']=='Rit All-Purpose','procion':lambda r:r['brand']=='Jacquard Procion MX'}[cls]
    rs=[r for r in rows if sel(r) and r['result_srgb'] and all(x.get('liquid_tsp') or x.get('parts') for x in r['dyes'])]
    names=sorted({x['name'].split(' 2 Tabl')[0] for r in rs for x in r['dyes']});ix={n:i for i,n in enumerate(names)}
    data=[]
    for r in rs:
        tot=sum(x.get('liquid_tsp') or x.get('parts') for x in r['dyes'])
        its=[(ix[x['name'].split(' 2 Tabl')[0]],float(x.get('liquid_tsp') or x.get('parts'))*(1 if x.get('liquid_tsp') else 24.0)) for x in r['dyes']]
        data.append((its,lab_of_lin(s2l(np.array(r['result_srgb'],float))),len(its),r))
    C=np.zeros((len(data),len(names)))
    for r,(its,_,_,_) in enumerate(data):
        for i,c in its:C[r,i]+=c
    LAB=np.array([d[1] for d in data]);K=np.array([d[2] for d in data])
    return names,{'C':C,'LAB':LAB,'K':K,'n':len(data)}
def fit(model,D,idx,nd,seed=0):
    k=3 if model=='rgb' else 7;rng=np.random.default_rng(seed)
    x0=np.concatenate([rng.normal(-1,.3,nd*k),[math.log(60.)]]);C=D['C'][idx];LAB=D['LAB'][idx]
    def res(x):
        P=unpack(model,x,nd);return ((predict(model,P,C,nd)-LAB)/np.array([1.5,2.5,2.5])).ravel()
    lo=np.full(len(x0),-8.);hi=np.full(len(x0),8.);lo[-1]=math.log(5);hi[-1]=math.log(3000)
    return unpack(model,least_squares(res,x0,bounds=(lo,hi),max_nfev=40).x,nd)
def evaluate(model,P,D,idx,nd):
    return de2000(predict(model,P,D['C'][idx],nd),D['LAB'][idx])
def summarize(a):return {'n':int(len(a)),'mean':round(float(a.mean()),2),'median':round(float(np.median(a)),2),'p95':round(float(np.percentile(a,95)),2)}
if __name__=="__main__":
    classes=[sys.argv[1]] if len(sys.argv)>1 else ['polyester','cotton','procion']
    out={}
    for cls in classes:
        names,D=dataset(cls);nd=len(names);n=D['n'];out[cls]={'n_rows':n,'n_dyes':nd,'dyes':names}
        rng=np.random.default_rng(1);perm=rng.permutation(n);folds=np.array_split(perm,5)
        for model in ['bl','km','kmc','geo','rgb','lin']:
            err=np.full(n,np.nan)
            for f in folds:
                tr=np.setdiff1d(np.arange(n),f);P=fit(model,D,tr,nd);err[f]=evaluate(model,P,D,f,nd)
            r={'kfold':summarize(err)}
            for kk,nm in((2,'binary'),(3,'ternary')):
                m=D['K']==kk
                if m.any():r[nm]=summarize(err[m])
            out[cls][model]=r;print(cls,model,r,flush=True)
    json.dump(out,open(ROOT+'/research/mixing/cv_results.json','w'),indent=1)
