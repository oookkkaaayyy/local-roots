#!/usr/bin/env python3
import re,sys,pathlib
if len(sys.argv)!=2: raise SystemExit("usage: audit_animartrix_projection.py <ANIMartRIX.h>")
src=pathlib.Path(sys.argv[1]).read_text()
names=["Complex_Kaleido_3","Big_Caleido","Parametric_Water","RGB_Blobs5","Polar_Waves","Zoom2","Complex_Kaleido_4","Complex_Kaleido_6","Water","RGB_Blobs4","Complex_Kaleido_5","Spiralus2","Hot_Blob","Caleido3","Waves","Chasing_Spirals","Rotating_Blob","Center_Field","Distance_Experiment","Lava1","Caleido2","Yves","Scaledemo1","Zoom","Complex_Kaleido","RGB_Blobs3","SM5","Module_Experiment10"]
def body(name):
    start=src.find("void "+name+"(")
    if start<0: raise RuntimeError("missing effect "+name)
    b=src.find("{",start); depth=0
    for i in range(b,len(src)):
        if src[i]=="{": depth+=1
        elif src[i]=="}":
            depth-=1
            if depth==0: return src[start:i+1]
    raise RuntimeError("unterminated effect "+name)
div_y=[]; div_x=[]; mods=[]
for name in names:
    clean=re.sub(r"/\*.*?\*/","",body(name),flags=re.S)
    clean="\n".join(line.split("//",1)[0] for line in clean.splitlines())
    for line in clean.splitlines():
        s=line.strip()
        if not s: continue
        if "%" in s and ("num_y" in s or "num_x" in s): mods.append((name,s))
        if "/" in s and "num_y" in s: div_y.append((name,s))
        if "/" in s and "num_x" in s: div_x.append((name,s))
expected_y={
 ("Hot_Blob","float linear = (y+1)/(num_y-1.f);"),
 ("Caleido3","pixel.red   = show1 * (y+1) / num_y;"),
 ("Lava1","float linear = (y)/(num_y-1.f);")
}
if set(div_y)!=expected_y: raise RuntimeError("unexpected num_y divisors: "+repr(div_y))
if div_x: raise RuntimeError("unexpected num_x divisors: "+repr(div_x))
if mods: raise RuntimeError("unexpected dimension modulo: "+repr(mods))
# fold2 makes all three known denominators non-zero: num_y=2, num_y-1=1.
print("HBNF_AUX_FOLD2_DIMENSION_AUDIT_PASS height=2 effects=28")
