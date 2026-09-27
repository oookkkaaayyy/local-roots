#!/usr/bin/env python3

def lift(r,g,b):
    peak=max(r,g,b)
    if peak<8:
        return r,g,b
    target=min(255,(peak*9)//5)
    scale=(target<<8)//peak
    vals=[]
    for v in (r,g,b):
        q=(v*scale+128)>>8
        vals.append(min(255,q))
    return tuple(vals)

# Black and near-black remain dark.
assert lift(0,0,0)==(0,0,0)
assert lift(7,2,1)==(7,2,1)

# Midrange saturated colors get a material camera-visible lift.
for rgb in [(60,0,0),(0,80,0),(0,0,100),(80,40,20),(120,80,40)]:
    out=lift(*rgb)
    assert max(out)>max(rgb)
    assert max(out)>=min(255,(max(rgb)*17)//10)

# Bright source colors may saturate, but never dim.
for rgb in [(180,90,45),(220,120,80),(255,40,10)]:
    out=lift(*rgb)
    assert all(o>=i for o,i in zip(out,rgb))

# Hue ordering is preserved for unsaturated test points.
for rgb in [(100,60,20),(90,30,70),(50,110,80)]:
    out=lift(*rgb)
    before=sorted(range(3),key=lambda i: rgb[i])
    after=sorted(range(3),key=lambda i: out[i])
    assert before==after

print("HBNF_AUX_VIDEO_LUMA_V1_HOST_TEST_PASS")
