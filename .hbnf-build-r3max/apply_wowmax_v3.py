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

once("#include <ANIMartRIX.h>","#define ANIMartRIX_NO_SERPENTINE\n#include <ANIMartRIX.h>\n#include \"hbnf_generative_v4.h\"\n#include \"hbnf_projection_link_v1.h\"","no-serpentine")
once("if (SEGENV.call == 0) {","if ((SEGENV.call == 0) || (SEGMENT.virtualWidth() != num_x) || (SEGMENT.virtualHeight() != num_y)) {","dimension-reinit")
once("hbnfAudio.apply(speedFactor, millis())",
     "(hbnfAudio.setScene(SEGMENT.mode), hbnfAudio.beginFrame(speedFactor, millis(), SEGMENT.intensity, SEGMENT.custom1, SEGMENT.custom2, SEGMENT.virtualWidth(), SEGMENT.virtualHeight(), SEGMENT.custom3, (uint8_t)(SEGMENT.offset >> 8)))",
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

pixel_new="""\tvoid hbnfVariantXY(int x,int y,int &tx,int &ty) const {
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
      wow["buildWitness"] = "registry28-tempo-lock-v5-colorwifi";
      wow["audioGeometry"] = "source-coupled-v3";
      wow["fxRegistered"] = hbnfFxRegistered;
      wow["fxFailed"] = hbnfFxFailed;
      wow["modeCount"] = strip.getModeCount();
      wow["fxFirst"] = hbnfFxFirst;
      wow["fxLast"] = hbnfFxLast;
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
      static unsigned long hbnfWifiAssistAt = 0;
      if (WiFi.status() != WL_CONNECTED && (hbnfWifiAssistAt == 0 || millis() - hbnfWifiAssistAt >= 15000UL)) {
        forceReconnect = true;
        hbnfWifiAssistAt = millis();
      }
#ifndef WLED_DISABLE_MQTT
      if (millis() - lastTime >= 1000) {
        lastTime = millis();
        if (WLED_MQTT_CONNECTED) {
          char topic[MQTT_MAX_TOPIC_LEN + 16];
          char payload[480];
          snprintf_P(topic, sizeof(topic), PSTR("%s/wow"), mqttDeviceTopic);
          snprintf_P(payload, sizeof(payload),
            PSTR("{\\\"release\\\":\\\"hbnf-wow-r3-max-2026-09-21-v3\\\",\\\"engine\\\":\\\"r3-wow-max\\\",\\\"buildWitness\\\":\\\"registry28-tempo-lock-v5-colorwifi\\\",\\\"audioGeometry\\\":\\\"source-coupled-v3\\\",\\\"fxRegistered\\\":%u,\\\"fxFailed\\\":%u,\\\"modeCount\\\":%u,\\\"fxFirst\\\":%u,\\\"fxLast\\\":%u,\\\"audioActive\\\":%s,\\\"profile\\\":%u,\\\"style\\\":%u,\\\"amount\\\":%u,\\\"bass\\\":%u,\\\"mid\\\":%u,\\\"treble\\\":%u,\\\"pulse\\\":%u,\\\"energy\\\":%u,\\\"impact\\\":%u,\\\"drop\\\":%u}"),
            hbnfFxRegistered, hbnfFxFailed, strip.getModeCount(), hbnfFxFirst, hbnfFxLast,
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

# WLED 16.0.1 has MODE_COUNT=220 and effect id 255 is the addEffect()
# failure sentinel. Register the 28 HBNF WOW effects at deterministic IDs
# 220..247 in scene order. This avoids dynamic-slot ambiguity and makes the
# live effect map independently auditable after OTA.
required_effects = [
    "Complex_Kaleido_3","Big_Caleido","Parametric_Water","RGB_Blobs5",
    "Polar_Waves","Zoom2","Complex_Kaleido_4","Complex_Kaleido_6","Water",
    "RGB_Blobs4","Complex_Kaleido_5","Spiralus2","Hot_Blob","Caleido3",
    "Waves","Chasing_Spirals","Rotating_Blob","Center_Field",
    "Distance_Experiment","Lava1","Caleido2","Yves","Scaledemo1","Zoom",
    "Complex_Kaleido","RGB_Blobs3","SM5","Module_Experiment10",
]

fx_h = (root/"wled00/FX.h").read_text()
mc = re.search(r"#define\s+MODE_COUNT\s+(\d+)", fx_h)
if not mc:
    raise RuntimeError("MODE_COUNT not found")
base_mode_count = int(mc.group(1))
if base_mode_count + len(required_effects) >= 255:
    raise RuntimeError(f"effect registry overflow: base={base_mode_count} required={len(required_effects)}")

setup_start = s.index("    void setup() {")
setup_end = s.index("      initDone = true;", setup_start)
setup = s[setup_start:setup_end]
reg_re = re.compile(r"^\s*strip\.addEffect\(255, &mode_([A-Za-z0-9_]+), _data_FX_mode_[A-Za-z0-9_]+\);\s*$", re.M)
registered = reg_re.findall(setup)
missing_symbols = [name for name in required_effects if name not in registered]
if missing_symbols:
    raise RuntimeError(f"required ANIMartRIX symbols missing before rewrite: {missing_symbols}")

# Remove all upstream dynamic registrations, then add only the required 28 in
# exact scene order at exact IDs 220..247.
setup = reg_re.sub("", setup)
lines = [
    "      hbnfFxRegistered = 0; hbnfFxFailed = 0; hbnfFxFirst = 255; hbnfFxLast = 255;"
]
for offset,name in enumerate(required_effects):
    effect_id = base_mode_count + offset
    lines.append(
        f'      {{ const uint8_t id = strip.addEffect({effect_id}, &mode_{name}, _data_FX_mode_{name}); '
        f'if (id != {effect_id}) {{ hbnfFxFailed++; }} else {{ '
        'if (hbnfFxRegistered == 0) hbnfFxFirst = id; '
        'hbnfFxLast = id; hbnfFxRegistered++; } }'
    )
setup = setup.replace("    void setup() {", "    void setup() {\n" + "\n".join(lines), 1)
after = re.findall(r"^\s*\{ const uint8_t id = strip\.addEffect\((\d+), &mode_([A-Za-z0-9_]+)", setup, re.M)
expected = [(str(base_mode_count+i), name) for i,name in enumerate(required_effects)]
if after != expected:
    raise RuntimeError(f"ANIMartRIX fixed-id rewrite mismatch: got={after!r} expected={expected!r}")
s = s[:setup_start] + setup + s[setup_end:]

diag_anchor="class AnimartrixUsermod : public Usermod {"
if s.count(diag_anchor)!=1:
    raise RuntimeError("AnimartrixUsermod anchor mismatch")
diag_helpers="""static uint8_t hbnfFxRegistered = 0;
static uint8_t hbnfFxFailed = 0;
static uint8_t hbnfFxFirst = 255;
static uint8_t hbnfFxLast = 255;

"""
s=s.replace(diag_anchor,diag_helpers+diag_anchor,1)

print(f"WOWMAX_EFFECT_CAPACITY_PASS base={base_mode_count} required={len(required_effects)} final={base_mode_count+len(required_effects)}")
print(f"WOWMAX_FIXED_ID_MAP_PASS first={base_mode_count} last={base_mode_count+len(required_effects)-1}")

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
    (p,"hbnfAudio.setScene(SEGMENT.mode)"),
    (p,"forceReconnect = true"),
    (p,"hbnfAudio.modulate"),
    (p,'wow["buildWitness"]'),
    (p,'wow["audioGeometry"]'),
    (p,'wow["fxRegistered"]'),
    (p,'strip.addEffect(233, &mode_Caleido3'),
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
