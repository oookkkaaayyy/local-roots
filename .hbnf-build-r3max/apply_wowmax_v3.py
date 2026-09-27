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
\tuint8_t hbnfDomain() const { return hbnfAudio.domain(); }
\tuint8_t hbnfVariantCode() const { return hbnfAudio.variantCode(); }
\tuint8_t hbnfVariantSalt() const { return hbnfAudio.variantSalt(); }
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
\t\tconst uint8_t warp=(uint8_t)((SEGMENT.custom3>>5)&7u);
\t\tconst int sx=(int)(SEGMENT.offset%w), sy=(int)((SEGMENT.offset>>5)%h);
\t\ttx=x; ty=y;
\t\tif(t==1||t==3||t==6) tx=w-1-tx;
\t\tif(t==2||t==3||t==7) ty=h-1-ty;
\t\tif(t>=4) tx=(tx+sx)%w;
\t\tif(t==5||t==6) ty=(ty+sy)%h;
\t\tif(t==7) tx=(tx+(sx>>1)+1)%w;
\t\t// Secondary procedural warp is independent of the base transform.
\t\t// This makes a revisited ANIMartRIX kernel structurally unfamiliar rather
\t\t// than merely recolored, while staying integer-only and deterministic.
\t\tswitch(warp){
\t\t  case 1: tx=(tx + ((ty*3 + sx)%w))%w; break;
\t\t  case 2: ty=(ty + ((tx*2 + sy)%h))%h; break;
\t\t  case 3: tx=(tx + (((ty&1)?sx:(w-sx)) + ty)%w)%w; break;
\t\t  case 4: ty=(ty + (((tx&1)?sy:(h-sy)) + tx)%h)%h; break;
\t\t  case 5: tx=(tx + ((ty*ty + sx)%w))%w; break;
\t\t  case 6: ty=(ty + ((tx*tx + sy)%h))%h; break;
\t\t  case 7:
\t\t    tx=(tx + ((ty*3 + sx)%w))%w;
\t\t    ty=(ty + ((tx*2 + sy)%h))%h;
\t\t    break;
\t\t  default: break;
\t\t}
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
      wow["audioGeometry"] = "source-coupled-v4";
      wow["generator"] = "anti-repeat-v4";
      wow["projectionLink"] = "frame-lock-v1";
      wow["generatorEnabled"] = hbnfGenV4.enabled();
      wow["generatorLocked"] = hbnfGenV4.locked();
      wow["generatorDomain"] = hbnfGenV4.domain();
      wow["variantSequence"] = hbnfGenV4.sequence();
      wow["variantSignature"] = hbnfGenV4.current().signature;
      wow["variantFamily"] = hbnfGenV4.current().familyId;
      wow["variantDwellSeconds"] = hbnfGenV4.current().dwellSeconds;
      wow["projectionPackets"] = hbnfProjectionTx.packets();
      wow["projectionSeq"] = hbnfProjectionTx.seq();
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
state_reader="""    void readFromJsonState(JsonObject& root) override {
      JsonObject wow = root["HBNFWOW"];
      if (wow.isNull()) return;
      hbnfGenV4.command(wow["generator"]);
      hbnfGenV4.tuning(wow["tuning"]);
    }

"""
s=s.replace(info_marker,telemetry+state_reader+info_marker,1)

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
      hbnfGenV4.tick();
      hbnfProjectionTx.tick();
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
          char payload[900];
          snprintf_P(topic, sizeof(topic), PSTR("%s/wow"), mqttDeviceTopic);
          snprintf_P(payload, sizeof(payload),
            PSTR("{\\\"release\\\":\\\"hbnf-wow-r3-max-2026-09-21-v3\\\",\\\"engine\\\":\\\"r3-wow-max\\\",\\\"buildWitness\\\":\\\"registry28-tempo-lock-v5-colorwifi\\\",\\\"audioGeometry\\\":\\\"source-coupled-v4\\\",\\\"generator\\\":\\\"anti-repeat-v4\\\",\\\"projectionLink\\\":\\\"frame-lock-v1\\\",\\\"generatorEnabled\\\":%s,\\\"generatorLocked\\\":%s,\\\"generatorDomain\\\":%u,\\\"variantSequence\\\":%lu,\\\"variantSignature\\\":%lu,\\\"projectionPackets\\\":%lu,\\\"projectionSeq\\\":%u,\\\"fxRegistered\\\":%u,\\\"fxFailed\\\":%u,\\\"modeCount\\\":%u,\\\"fxFirst\\\":%u,\\\"fxLast\\\":%u,\\\"audioActive\\\":%s,\\\"profile\\\":%u,\\\"style\\\":%u,\\\"amount\\\":%u,\\\"bass\\\":%u,\\\"mid\\\":%u,\\\"treble\\\":%u,\\\"pulse\\\":%u,\\\"energy\\\":%u,\\\"impact\\\":%u,\\\"drop\\\":%u}"),
            hbnfGenV4.enabled() ? "true" : "false", hbnfGenV4.locked() ? "true" : "false", hbnfGenV4.domain(),
            (unsigned long)hbnfGenV4.sequence(), (unsigned long)hbnfGenV4.current().signature, hbnfGenV4.current().familyId,
            (unsigned long)hbnfProjectionTx.packets(), hbnfProjectionTx.seq(),
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

class HbnfProjectionSenderV1 {
  WiFiUDP udp_;
  uint32_t lastMs_=0, packets_=0;
  uint16_t seq_=0;
 public:
  void tick() {
    const uint32_t now=millis();
    if (now-lastMs_<33u || WiFi.status()!=WL_CONNECTED || strip.isUpdating()) return;
    lastMs_=now;
    hbnf::ProjectionAccumulator a;
    for (uint16_t y=0;y<16;y++) for (uint16_t x=0;x<32;x++) {
      const uint32_t c=strip.getPixelColorXY(x,y);
      a.add(x,y,32,16,R(c),G(c),B(c));
    }
    uint8_t rgb[hbnf::PROJECTION_PIXELS*3];
    if (!a.finalize(rgb)) return;
    if (bri==0) for (size_t i=0;i<sizeof(rgb);i++) rgb[i]=0;
    uint8_t packet[hbnf::PROJECTION_PACKET_BYTES];
    hbnf::encodeProjectionPacket(++seq_,rgb,packet);
    const IPAddress ip=WiFi.localIP(), mask=WiFi.subnetMask();
    IPAddress bc(
      (uint8_t)(ip[0]|(uint8_t)~mask[0]),
      (uint8_t)(ip[1]|(uint8_t)~mask[1]),
      (uint8_t)(ip[2]|(uint8_t)~mask[2]),
      (uint8_t)(ip[3]|(uint8_t)~mask[3]));
    if (udp_.beginPacket(bc,hbnf::PROJECTION_PORT)) {
      udp_.write(packet,sizeof(packet));
      if (udp_.endPacket()) packets_++;
    }
  }
  uint32_t packets() const { return packets_; }
  uint16_t seq() const { return seq_; }
};
static HbnfProjectionSenderV1 hbnfProjectionTx;

class HbnfGenerativeRuntimeV4 {
  hbnf::GenerativeV4 gen_;
  hbnf::GenerativeVariant current_;
  bool enabled_=false, locked_=false, forceNext_=false, have_=false;
  uint8_t domain_=0;
  uint32_t dueMs_=0, sequence_=0;
  bool speedOverride_=false, profileOverride_=false, styleOverride_=false, amountOverride_=false;
  uint8_t speedCode_=128, profileCode_=96, styleCode_=176, amountCode_=220;

  static uint8_t clamp8(int x,int lo,int hi) { return (uint8_t)(x<lo?lo:(x>hi?hi:x)); }

 public:
  void seed(uint32_t s) { gen_.reset(s?s:0x48B4F19Du); forceNext_=true; }

  void command(JsonObject g) {
    if (g.isNull()) return;
    if (!g["enabled"].isNull()) {
      const bool en=g["enabled"].as<bool>();
      if (en && !enabled_) forceNext_=true;
      enabled_=en;
    }
    if (!g["locked"].isNull()) locked_=g["locked"].as<bool>();
    if (!g["domain"].isNull()) {
      uint8_t nd=domain_;
      if (g["domain"].is<const char*>()) {
        const char* d=g["domain"];
        if (!strcmp(d,"course-flow")) nd=0;
        else if (!strcmp(d,"field-mix")) nd=1;
        else if (!strcmp(d,"hbnf-signature")) nd=2;
        else if (!strcmp(d,"quiet-cosmos")) nd=3;
      } else {
        const int raw=g["domain"].as<int>();
        nd=(uint8_t)(raw<0?0:(raw>3?3:raw));
      }
      if (nd!=domain_) { domain_=nd; forceNext_=true; }
    }
    if (g["next"] | false) forceNext_=true;
    if (!g["seed"].isNull()) seed(g["seed"].as<uint32_t>());
  }

  void tuning(JsonObject t) {
    if (t.isNull()) return;
    if (!t["speedEnabled"].isNull()) speedOverride_=t["speedEnabled"].as<bool>();
    if (!t["profileEnabled"].isNull()) profileOverride_=t["profileEnabled"].as<bool>();
    if (!t["styleEnabled"].isNull()) styleOverride_=t["styleEnabled"].as<bool>();
    if (!t["amountEnabled"].isNull()) amountOverride_=t["amountEnabled"].as<bool>();
    if (!t["speed"].isNull()) speedCode_=clamp8(t["speed"].as<int>(),1,255);
    if (!t["profile"].isNull()) profileCode_=clamp8(t["profile"].as<int>(),0,255);
    if (!t["style"].isNull()) styleCode_=clamp8(t["style"].as<int>(),0,255);
    if (!t["amount"].isNull()) amountCode_=clamp8(t["amount"].as<int>(),1,255);
  }

  void tick() {
    if (!enabled_ || locked_ || strip.isUpdating()) return;
    const uint32_t now=millis();
    Segment& seg=strip.getMainSegment();
    const bool custom=seg.mode>=220 && seg.mode<=247;

    // Do not stomp temporary text/event effects. Generator resumes when the
    // custom renderer owns the main segment again, or when an explicit scene/NEXT command forces it.
    if (!forceNext_ && have_ && !custom) { dueMs_=now+500u; return; }
    if (!forceNext_ && have_ && (int32_t)(now-dueMs_)<0) return;

    current_=gen_.next((hbnf::GenerativeDomain)domain_);
    if (speedOverride_) current_.speed=clamp8(((int)current_.speed*(int)speedCode_+64)/128,48,220);
    if (profileOverride_) current_.profile=profileCode_;
    if (styleOverride_) current_.style=styleCode_;
    if (amountOverride_) current_.amount=amountCode_;

    seg.setMode(current_.effectId,false);
    seg.setPalette(current_.palette);
    seg.speed=current_.speed;
    seg.intensity=current_.profile;
    seg.custom1=current_.style;
    seg.custom2=current_.amount;
    seg.custom3=(uint8_t)(current_.variantCode&31u);
    seg.offset=current_.offset;
    seg.markForReset();
    strip.trigger();

    sequence_++;
    have_=true;
    forceNext_=false;
    dueMs_=now+(uint32_t)current_.dwellSeconds*1000u;
  }

  bool enabled() const { return enabled_; }
  bool locked() const { return locked_; }
  uint8_t domain() const { return domain_; }
  uint32_t sequence() const { return sequence_; }
  uint32_t dueMs() const { return dueMs_; }
  const hbnf::GenerativeVariant& current() const { return current_; }
};
static HbnfGenerativeRuntimeV4 hbnfGenV4;

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
    (p,'wow["generator"]'),
    (p,'wow["projectionLink"]'),
    (p,"HbnfGenerativeRuntimeV4"),
    (p,"HbnfProjectionSenderV1"),
    (p,"hbnfVariantXY"),
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

print("WOWMAX_V4_GENERATIVE_PROJECTION_SOURCE_PATCH_PASS")
