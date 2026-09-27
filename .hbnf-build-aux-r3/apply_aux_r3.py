#!/usr/bin/env python3
from __future__ import annotations
import pathlib,re,sys

if len(sys.argv)!=2:
    raise SystemExit("usage: apply_aux_r3.py <wled-root>")
root=pathlib.Path(sys.argv[1]).resolve()
p=root/"usermods/usermod_v2_animartrix/usermod_v2_animartrix.cpp"
s=p.read_text()

# This patch runs after apply_wowmax_v3.py. Keep the exact fixed effect IDs but
# convert the runtime identity and derive scene style/amount from the synced
# effect ID. WLED UDP sync carries effect/speed/intensity/palette/colors/timebase,
# but intentionally does not copy segment option/custom-slider data in the safe
# aux configuration. This deterministic map reconstructs c1/c2 without allowing
# Matrix geometry/options to overwrite the UV segments.
for old,new in [
 ("hbnf-wow-r3-max-2026-09-21-v3","hbnf-wow-aux-r3-2026-09-22-v1"),
 ("r3-wow-max","aux-r3-wow-1d"),
 ("registry28-tempo-lock-v5-colorwifi","registry28-tempo-lock-1d-v3-colorwifi"),
 ('root["HBNFWOW"]','root["HBNFAUX"]'),
 ('root.createNestedObject("HBNFWOW")','root.createNestedObject("HBNFAUX")'),
 ('PSTR("%s/wow")','PSTR("%s/auxwow")'),
]:
    s=s.replace(old,new)

mqtt_anchor='\\\"projectionLink\\\":\\\"frame-lock-v1\\\",'
mqtt_repl=mqtt_anchor+'\\\"projectionRole\\\":\\\"receiver\\\",\\\"lumaPolicy\\\":\\\"camera-bright-v1\\\",'
if s.count(mqtt_anchor)!=1:
    raise RuntimeError(f"MQTT V4 projection anchor mismatch: {s.count(mqtt_anchor)}")
s=s.replace(mqtt_anchor,mqtt_repl,1)
if "char payload[900];" not in s:
    raise RuntimeError("V4 MQTT payload buffer anchor missing")

anchor="class ANIMartRIXMod:public ANIMartRIX {"
if s.count(anchor)!=1:
    raise RuntimeError("ANIMartRIXMod anchor mismatch")
style=[176,96,176,56,236,96,136,176,96,236,176,136,56,236,96,236,56,136,96,176,236,136,176,96,236,56,136,236]
amount=[178,218,168,218,188,225,180,190,176,205,182,195,220,210,180,202,218,205,224,188,200,190,175,205,215,220,190,205]
helpers="""static uint8_t hbnfAuxStyleForMode(uint8_t mode, uint8_t fallback) {
  static const uint8_t map[28] = {""" + ",".join(map(str,style)) + """};
  return (mode >= 220 && mode <= 247) ? map[mode-220] : fallback;
}
static uint8_t hbnfAuxAmountForMode(uint8_t mode, uint8_t fallback) {
  static const uint8_t map[28] = {""" + ",".join(map(str,amount)) + """};
  return (mode >= 220 && mode <= 247) ? map[mode-220] : fallback;
}
static void hbnfAuxLiftLuma(uint8_t &r, uint8_t &g, uint8_t &b) {
  const uint8_t peak = r > g ? (r > b ? r : b) : (g > b ? g : b);
  if (peak < 4) return; // keep intentional black / near-black pixels black
  uint16_t target = 56u + ((uint16_t)peak * 199u + 127u) / 255u;
  if (target < peak) target = peak;
  if (target > 255u) target = 255u;
  r = (uint8_t)(((uint16_t)r * target + peak/2u) / peak);
  g = (uint8_t)(((uint16_t)g * target + peak/2u) / peak);
  b = (uint8_t)(((uint16_t)b * target + peak/2u) / peak);
}

"""
s=s.replace(anchor,helpers+anchor,1)

# ANIMartRIX has selected effects that divide by (num_y-1). A native 1D
# WLED segment reports virtualHeight()==1, which would produce NaN/Inf in
# Hot_Blob and Lava1. Render on a two-row virtual canvas and fold the
# row-major pixels onto the physical 1D underglow instead.
init_pat=re.compile(r'''if \(\(SEGENV\.call == 0\) \|\| \(SEGMENT\.virtualWidth\(\) != num_x\) \|\| \(SEGMENT\.virtualHeight\(\) != num_y\)\) \{\s*init\(SEGMENT\.virtualWidth\(\), SEGMENT\.virtualHeight\(\), false\);\s*\}''')
init_new='''const int hbnfPhysicalLength = SEGMENT.virtualLength();
	  const int hbnfCanvasW = hbnfPhysicalLength > 0 ? (hbnfPhysicalLength + 1) / 2 : 1;
	  const int hbnfCanvasH = 2;
	  if ((SEGENV.call == 0) || (hbnfCanvasW != num_x) || (hbnfCanvasH != num_y)) {
		init(hbnfCanvasW, hbnfCanvasH, false);
	  }'''
s,n=init_pat.subn(init_new,s,count=1)
if n!=1:
    raise RuntimeError(f"fold2 init rewrite mismatch: {n}")

pixel_old='''\tvoid hbnfVariantXY(int x,int y,int &tx,int &ty) const {
\t\tconst int w=SEGMENT.virtualWidth()?SEGMENT.virtualWidth():1;
\t\tconst int h=SEGMENT.virtualHeight()?SEGMENT.virtualHeight():1;
\t\tconst uint8_t t=(uint8_t)(SEGMENT.custom3&7u);
\t\tconst int sx=(int)(SEGMENT.offset%w), sy=(int)((SEGMENT.offset>>5)%h);
\t\ttx=x; ty=y;
\t\tif(t==1||t==3||t==6) tx=w-1-tx;
\t\tif(t==2||t==3||t==7) ty=h-1-ty;
\t\tif(t>=4) tx=(tx+sx)%w;
\t\tif(t==5||t==6) ty=(ty+sy)%h;
\t\tif(t==7) tx=(tx+(sx>>1)+1)%w;
\t}
\tvoid setPixelColor(int x, int y, rgb pixel) {
\t\tuint8_t r=pixel.red,g=pixel.green,b=pixel.blue;
\t\thbnfAudio.modulate(x,y,r,g,b);
\t\tif (SEGMENT.check2) { r=gamma8(r); g=gamma8(g); b=gamma8(b); }
\t\tint tx=x,ty=y; hbnfVariantXY(x,y,tx,ty);
\t\tSEGMENT.setPixelColorXY(tx, ty, CRGB(r,g,b));
\t}
\tvoid setPixelColor(int index, rgb pixel) {
\t\tuint8_t r=pixel.red,g=pixel.green,b=pixel.blue;
\t\tconst int w=SEGMENT.virtualWidth()?SEGMENT.virtualWidth():1;
\t\tconst int x=index%w, y=index/w;
\t\thbnfAudio.modulate(x,y,r,g,b);
\t\tif (SEGMENT.check2) { r=gamma8(r); g=gamma8(g); b=gamma8(b); }
\t\tint tx=x,ty=y; hbnfVariantXY(x,y,tx,ty);
\t\tconst int out=ty*w+tx;
\t\tif(out>=0 && out<SEGMENT.virtualLength()) SEGMENT.setPixelColor(out, CRGB(r,g,b));
\t}'''
pixel_new='''\tvoid setPixelColor(int x, int y, rgb pixel) {
\t\tuint8_t r=pixel.red,g=pixel.green,b=pixel.blue;
\t\thbnfAudio.modulate(x,y,r,g,b);
\t\tif (SEGMENT.check2) { r=gamma8(r); g=gamma8(g); b=gamma8(b); }
\t\thbnfAuxLiftLuma(r,g,b);
\t\tconst int index = y * num_x + x;
\t\tif (index >= 0 && index < SEGMENT.virtualLength()) SEGMENT.setPixelColor(index, CRGB(r,g,b));
\t}
\tvoid setPixelColor(int index, rgb pixel) {
\t\tuint8_t r=pixel.red,g=pixel.green,b=pixel.blue;
\t\tconst int x=num_x?(index%num_x):0, y=num_x?(index/num_x):0;
\t\thbnfAudio.modulate(x,y,r,g,b);
\t\tif (SEGMENT.check2) { r=gamma8(r); g=gamma8(g); b=gamma8(b); }
\t\thbnfAuxLiftLuma(r,g,b);
\t\tif (index >= 0 && index < SEGMENT.virtualLength()) SEGMENT.setPixelColor(index, CRGB(r,g,b));
\t}'''
if s.count(pixel_old)!=1:
    raise RuntimeError(f"fold2 pixel hook anchor mismatch: {s.count(pixel_old)}")
s=s.replace(pixel_old,pixel_new,1)


old="(hbnfAudio.setScene(SEGMENT.mode), hbnfAudio.beginFrame(speedFactor, millis(), SEGMENT.intensity, SEGMENT.custom1, SEGMENT.custom2, SEGMENT.virtualWidth(), SEGMENT.virtualHeight(), SEGMENT.custom3, (uint8_t)(SEGMENT.offset >> 8)))"
new="(hbnfAudio.setScene(SEGMENT.mode), hbnfAudio.beginFrame(speedFactor, millis(), SEGMENT.intensity, hbnfAuxStyleForMode(SEGMENT.mode, SEGMENT.custom1), hbnfAuxAmountForMode(SEGMENT.mode, SEGMENT.custom2), num_x, num_y, SEGMENT.custom3, (uint8_t)(SEGMENT.offset >> 8)))"
if s.count(old)!=1:
    raise RuntimeError(f"audio mapping anchor mismatch: {s.count(old)}")
s=s.replace(old,new,1)

# Add 1D-specific diagnostics. A normal strip is virtualHeight()==1; ANIMartRIX
# therefore renders the same effect as a one-row projection while sharing the
# same WLED timebase as the Matrix sender.
needle='      wow["fxLast"] = hbnfFxLast;'
replacement=needle+'\n      wow["projection"] = "fold2-1d-v1";\n      wow["lumaPolicy"] = "camera-bright-v1";\n      wow["syncEffectContract"] = "ids220-247";\n      wow["sceneParams"] = "profile-via-ix-style-amount-by-effect-id";'
if s.count(needle)!=1:
    raise RuntimeError("telemetry extension anchor mismatch")
s=s.replace(needle,replacement,1)
p.write_text(s)

# Make AudioReactive a network-audio receiver by default so the aux renderer
# can use the Matrix controller's FFT stream instead of a second microphone.
ar=root/"usermods/audioreactive/audio_reactive.cpp"
a=ar.read_text()
old="static uint8_t audioSyncEnabled = 0;"
if a.count(old)!=1:
    raise RuntimeError(f"audioSyncEnabled anchor mismatch: {a.count(old)}")
a=a.replace(old,"static uint8_t audioSyncEnabled = 2;",1)
state_anchor='      usermod["on"] = enabled;'
if a.count(state_anchor)!=1:
    raise RuntimeError("AudioReactive state anchor mismatch")
a=a.replace(state_anchor,state_anchor+'\n      usermod["syncMode"] = audioSyncEnabled;\n      usermod["syncPort"] = audioSyncPort;',1)
ar.write_text(a)

checks={
 p:[
  "hbnf-wow-aux-r3-2026-09-22-v1","aux-r3-wow-1d","registry28-tempo-lock-1d-v3-colorwifi",
  "hbnfAuxStyleForMode","hbnfAuxAmountForMode","hbnfCanvasH = 2","SEGMENT.virtualLength()",'root["HBNFAUX"]',
  'PSTR("%s/auxwow")','\\\"projection\\\":\\\"fold2-1d-v1\\\"','\\\"lumaPolicy\\\":\\\"camera-bright-v1\\\"','wow["projection"] = "fold2-1d-v1"','wow["lumaPolicy"] = "camera-bright-v1"',"hbnfAuxLiftLuma",
  'strip.addEffect(220, &mode_Complex_Kaleido_3','strip.addEffect(247, &mode_Module_Experiment10'
 ],
 ar:["static uint8_t audioSyncEnabled = 2;",'usermod["syncMode"] = audioSyncEnabled','usermod["syncPort"] = audioSyncPort']
}
for path,needles in checks.items():
    text=path.read_text()
    for n in needles:
        if n not in text: raise RuntimeError(f"missing postcondition {n} in {path}")
if "hbnf-wow-r3-max-2026-09-21-v3" in p.read_text():
    raise RuntimeError("matrix release identity leaked into aux source")
print("HBNF_AUX_R3_SOURCE_PATCH_PASS")
