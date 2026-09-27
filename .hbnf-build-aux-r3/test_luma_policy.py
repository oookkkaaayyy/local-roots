#!/usr/bin/env python3
def lift(rgb):
    r,g,b=map(int,rgb)
    peak=max(r,g,b)
    if peak<4:
        return (r,g,b)
    target=56 + (peak*199 + 127)//255
    target=max(peak,min(255,target))
    return tuple((c*target + peak//2)//peak for c in (r,g,b))

assert lift((0,0,0))==(0,0,0)
assert lift((3,2,1))==(3,2,1)

prev=0
for peak in range(4,256):
    out=max(lift((peak,peak//2,peak//4)))
    assert peak <= out <= 255
    assert out >= prev
    prev=out

# Dark/moderate source values must gain enough physical luma to be camera-visible,
# while bright source values remain bounded instead of clipping every pixel.
assert max(lift((20,10,5))) >= 70
assert max(lift((60,30,15))) >= 100
assert max(lift((100,50,25))) >= 130
assert max(lift((200,100,50))) >= 210
assert max(lift((255,128,64))) == 255

# Hue/channel ordering is preserved.
for rgb in [(20,8,3),(40,90,15),(10,30,120),(200,40,90)]:
    out=lift(rgb)
    order=sorted(range(3), key=lambda i: rgb[i])
    out_order=sorted(range(3), key=lambda i: out[i])
    assert order==out_order,(rgb,out)

print("PASS AUX camera-bright-v1 luma policy")
