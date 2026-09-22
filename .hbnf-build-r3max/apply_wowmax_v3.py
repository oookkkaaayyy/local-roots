#!/usr/bin/env python3
# Independent deterministic witness trigger: comment-only; generated firmware source must remain byte-identical.
from __future__ import annotations
import pathlib,re,sys

if len(sys.argv)!=2:
    raise SystemExit("usage: apply_wowmax_v3.py <wled-root>")
root=pathlib.Path(sys.argv[1]).resolve()
p=root/"usermods/usermod_v2_animartrix/usermod_v2_animartrix.cpp"
s=p.read_text()

def once(old:str,new:str,label:str):
    global s
    n=s.count(old)
    if n!=1:
        raise RuntimeError(f"{label}: expected 1 occurrence, got {n}")
    s=s.replace(old,new,1)

once("#include <ANIMartRIX.h>","#define ANIMartRIX_NO_SERPENTINE\n#include <ANIMartRIX.h>","no-serpentine")
once("if (SEGENV.call == 0) {","if ((SEGENV.call == 0) || (SEGMENT.virtualWidth() != num_x) || (SEGMENT.virtualHeight() != num_y)) {","dimension-reinit")
once("hbnfAudio.apply(speedFactor, millis())",
     "hbnfAudio.beginFrame(speedFactor, millis(), SEGMENT.intensity, SEGMENT.custom1, SEGMENT.custom2, SEGMENT.virtualWidth(), SEGMENT.virtualHeight())",
     "audio-begin-frame")

public_anchor="\tpublic:\n\tvoid initEffect() {"
accessors="""\tpublic:
\tbool hbnfActive() const { return hbnfAudio.active(); }
\tuint8_t hbnfProfile() const { return (uint8_t)hbnfAudio.profile(); }
\tuint8_t hbnfStyle() const { return (uint8_t)hbnfAudio.style(); }
\tuint8_t hbnfAmount() const { return hbnfAudio.amount(); }
\tuint8_t hbnfBass() const { return hbnfAudio.bassPulse(); }
\tuint8_t hbnfMid() const { return hbnfAudio.midPulse(); }
\tuint8_t hbnfTreble() const { return hbnfAudio.treblePulse(); }
\tuint8_t hbnfPulse() const { return hbnfAudio.pulse(); }
\tuint8_t hbnfEnergy() const { return hbnfAudio.energy(); }
\tuint8_t hbnfImpact() const { return hbnfAudio.impact(); }
\tuint8_t hbnfDrop() const { return hbnfAudio.drop(); }
\tvoid initEffect() {"""
once(public_anchor,accessors,"diagnostic-accessors")

pixel_new="""\tvoid setPixelColor(int x, int y, rgb pixel) {
\t\tuint8_t r=pixel.red,g=pixel.green,b=pixel.blue;
\t\thbnfAudio.modulate(x,y,r,g,b);
\t\tif (SEGMENT.check2) { r=gamma8(r); g=gamma8(g); b=gamma8(b); }
\t\tSEGMENT.setPixelColorXY(x, y, CRGB(r,g,b));
\t}
\tvoid setPixelColor(int index, rgb pixel) {
\t\tuint8_t r=pixel.red,g=pixel.green,b=pixel.blue;
\t\tconst int w=SEGMENT.virtualWidth();
\t\tconst int x=w?(index%w):0, y=w?(index/w):0;
\t\thbnfAudio.modulate(x,y,r,g,b);
\t\tif (SEGMENT.check2) { r=gamma8(r); g=gamma8(g); b=gamma8(b); }
\t\tSEGMENT.setPixelColor(index, CRGB(r,g,b));
\t}"""
pat=r"\tvoid setPixelColor\(int x, int y, rgb pixel\) \{.*?\n\s*\}\n\s*void setPixelColor\(int index, rgb pixel\) \{.*?\n\s*\}"
s,n=re.subn(pat,pixel_new,s,count=1,flags=re.S)
if n!=1:
    raise RuntimeError(f"pixel-hooks: expected 1 replacement, got {n}")

info_marker="    void addToJsonInfo(JsonObject& root)"
if s.count(info_marker)!=1:
    raise RuntimeError("addToJsonInfo anchor mismatch")
telemetry="""    void addToJsonState(JsonObject& root) override {
      JsonObject wow = root["HBNFWOW"];
      if (wow.isNull()) wow = root.createNestedObject("HBNFWOW");
      wow["release"] = "hbnf-wow-r3-max-2026-09-21-v3";
      wow["engine"] = "r3-wow-max";
      wow["audioActive"] = anim.hbnfActive();
      wow["profile"] = anim.hbnfProfile();
      wow["style"] = anim.hbnfStyle();
      wow["amount"] = anim.hbnfAmount();
      wow["bass"] = anim.hbnfBass();
      wow["mid"] = anim.hbnfMid();
      wow["treble"] = anim.hbnfTreble();
      wow["pulse"] = anim.hbnfPulse();
      wow["energy"] = anim.hbnfEnergy();
      wow["impact"] = anim.hbnfImpact();
      wow["drop"] = anim.hbnfDrop();
    }

"""
s=s.replace(info_marker,telemetry+info_marker,1)

loop_pat=r"""    void loop\(\) \{
      if \(!enabled \|\| strip\.isUpdating\(\)\) return;

      // do your magic here
      if \(millis\(\) - lastTime > 1000\) \{
        //USER_PRINTLN\("I'm alive!"\);
        lastTime = millis\(\);
      \}
    \}"""
loop_new="""    void loop() {
      if (strip.isUpdating()) return;
#ifndef WLED_DISABLE_MQTT
      if (millis() - lastTime >= 1000) {
        lastTime = millis();
        if (WLED_MQTT_CONNECTED) {
          char topic[MQTT_MAX_TOPIC_LEN + 16];
          char payload[360];
          snprintf_P(topic, sizeof(topic), PSTR("%s/wow"), mqttDeviceTopic);
          snprintf_P(payload, sizeof(payload),
            PSTR("{\\\"release\\\":\\\"hbnf-wow-r3-max-2026-09-21-v3\\\",\\\"engine\\\":\\\"r3-wow-max\\\",\\\"audioActive\\\":%s,\\\"profile\\\":%u,\\\"style\\\":%u,\\\"amount\\\":%u,\\\"bass\\\":%u,\\\"mid\\\":%u,\\\"treble\\\":%u,\\\"pulse\\\":%u,\\\"energy\\\":%u,\\\"impact\\\":%u,\\\"drop\\\":%u}"),
            anim.hbnfActive() ? "true" : "false",
            anim.hbnfProfile(), anim.hbnfStyle(), anim.hbnfAmount(),
            anim.hbnfBass(), anim.hbnfMid(), anim.hbnfTreble(),
            anim.hbnfPulse(), anim.hbnfEnergy(), anim.hbnfImpact(), anim.hbnfDrop());
          mqtt->publish(topic, 0, false, payload);
        }
      }
#endif
    }"""
s,n=re.subn(loop_pat,loop_new,s,count=1)
if n!=1:
    raise RuntimeError(f"mqtt-loop: expected 1 replacement, got {n}")

# WLED 16.0.1 has MODE_COUNT=220 and dynamic effect IDs stop before 255.
# The upstream ANIMartRIX usermod tries to register 44 effects, so the final 9
# silently fail to register. Keep only the 28 effects used by the HBNF WOW
# scene contract so every required effect has a real runtime slot while all
# stock WLED effects remain intact.
required_effects = [
    "Complex_Kaleido_3","Big_Caleido","Parametric_Water","RGB_Blobs5",
    "Polar_Waves","Zoom2","Complex_Kaleido_4","Complex_Kaleido_6","Water",
    "RGB_Blobs4","Complex_Kaleido_5","Spiralus2","Hot_Blob","Caleido3",
    "Waves","Chasing_Spirals","Rotating_Blob","Center_Field",
    "Distance_Experiment","Lava1","Caleido2","Yves","Scaledemo1","Zoom",
    "Complex_Kaleido","RGB_Blobs3","SM5","Module_Experiment10",
]
setup_start = s.index("    void setup() {")
setup_end = s.index("      initDone = true;", setup_start)
setup = s[setup_start:setup_end]
reg_re = re.compile(r"^\s*strip\.addEffect\(255, &mode_([A-Za-z0-9_]+), _data_FX_mode_[A-Za-z0-9_]+\);\s*$", re.M)
registered = reg_re.findall(setup)
if len(registered) < len(required_effects):
    raise RuntimeError(f"unexpected ANIMartRIX registration count: {len(registered)}")
missing_symbols = [name for name in required_effects if name not in registered]
if missing_symbols:
    raise RuntimeError(f"required ANIMartRIX symbols missing before prune: {missing_symbols}")
required_set = set(required_effects)
setup_pruned = reg_re.sub(lambda m: m.group(0) if m.group(1) in required_set else "", setup)
after = reg_re.findall(setup_pruned)
if len(after) != len(required_effects) or set(after) != required_set:
    raise RuntimeError(f"ANIMartRIX prune mismatch: count={len(after)} missing={sorted(required_set-set(after))} extra={sorted(set(after)-required_set)}")
s = s[:setup_start] + setup_pruned + s[setup_end:]

fx_h = (root/"wled00/FX.h").read_text()
mc = re.search(r"#define\s+MODE_COUNT\s+(\d+)", fx_h)
if not mc:
    raise RuntimeError("MODE_COUNT not found")
base_mode_count = int(mc.group(1))
# addEffect refuses to grow once vector size reaches 255; 255 is the failure sentinel.
if base_mode_count + len(required_effects) >= 255:
    raise RuntimeError(f"effect registry overflow: base={base_mode_count} required={len(required_effects)}")
print(f"WOWMAX_EFFECT_CAPACITY_PASS base={base_mode_count} required={len(required_effects)} final={base_mode_count+len(required_effects)}")

p.write_text(s)

ar=root/"usermods/audioreactive/audio_reactive.cpp"
a=ar.read_text()
old='      usermod["on"] = enabled;'
if a.count(old)!=1:
    raise RuntimeError(f"AudioReactive state anchor: expected 1, got {a.count(old)}")
a=a.replace(old,old+'\n#ifdef ARDUINO_ARCH_ESP32\n      usermod[FPSTR(_inputLvl)] = inputLevel;\n#endif',1)
ar.write_text(a)

checks=[
    (p,"ANIMartRIX_NO_SERPENTINE"),
    (p,"SEGMENT.virtualWidth() != num_x"),
    (p,"hbnfAudio.beginFrame"),
    (p,"hbnfAudio.modulate"),
    (p,'wow["audioActive"]'),
    (p,'wow["drop"]'),
    (p,'PSTR("%s/wow")'),
    (p,"mqtt->publish(topic, 0, false, payload)"),
    (ar,"usermod[FPSTR(_inputLvl)] = inputLevel"),
]
for path,needle in checks:
    if needle not in path.read_text():
        raise RuntimeError(f"missing postcondition {needle} in {path}")
if "#define fmodf" in p.read_text():
    raise RuntimeError("unsafe fmod approximation detected")

print("WOWMAX_V3_SOURCE_PATCH_PASS")
