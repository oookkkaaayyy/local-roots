#!/usr/bin/env python3
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
