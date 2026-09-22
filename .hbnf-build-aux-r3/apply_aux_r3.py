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
 ("registry28-fixed-v3","registry28-fixed-1d-v1"),
 ('root["HBNFWOW"]','root["HBNFAUX"]'),
 ('root.createNestedObject("HBNFWOW")','root.createNestedObject("HBNFAUX")'),
 ('PSTR("%s/wow")','PSTR("%s/auxwow")'),
]:
    s=s.replace(old,new)

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

"""
s=s.replace(anchor,helpers+anchor,1)

old="hbnfAudio.beginFrame(speedFactor, millis(), SEGMENT.intensity, SEGMENT.custom1, SEGMENT.custom2, SEGMENT.virtualWidth(), SEGMENT.virtualHeight())"
new="hbnfAudio.beginFrame(speedFactor, millis(), SEGMENT.intensity, hbnfAuxStyleForMode(SEGMENT.mode, SEGMENT.custom1), hbnfAuxAmountForMode(SEGMENT.mode, SEGMENT.custom2), SEGMENT.virtualWidth(), SEGMENT.virtualHeight())"
if s.count(old)!=1:
    raise RuntimeError(f"audio mapping anchor mismatch: {s.count(old)}")
s=s.replace(old,new,1)

# Add 1D-specific diagnostics. A normal strip is virtualHeight()==1; ANIMartRIX
# therefore renders the same effect as a one-row projection while sharing the
# same WLED timebase as the Matrix sender.
needle='      wow["fxLast"] = hbnfFxLast;'
replacement=needle+'\n      wow["projection"] = "1d-row";\n      wow["syncEffectContract"] = "ids220-247";\n      wow["sceneParams"] = "profile-via-ix-style-amount-by-effect-id";'
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
  "hbnf-wow-aux-r3-2026-09-22-v1","aux-r3-wow-1d","registry28-fixed-1d-v1",
  "hbnfAuxStyleForMode","hbnfAuxAmountForMode",'root["HBNFAUX"]',
  'PSTR("%s/auxwow")','wow["projection"] = "1d-row"',
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
