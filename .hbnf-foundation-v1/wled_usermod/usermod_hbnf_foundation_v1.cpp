#include "wled.h"
#include "hbnf_foundation_core.h"
#include "hbnf_local_ui.h"

using namespace hbnf_v1;

namespace {

static const char HBNF_FX_DATA[] PROGMEM = "HBNF Foundation@;;;2";

class FoundationRuntime {
 public:
  FoundationRuntime() { reset(); }

  void reset() {
    controls_ = Controls{};
    frameNo_ = 0;
    phaseQ16_ = 0;
    lastNow_ = 0;
    cachedNow_ = 0xffffffffu;
    lastAudio_ = AudioFrame{};
  }

  const CanonicalFrame& frame() {
    const uint32_t now = strip.now;
    if (cachedNow_ == now) return cached_;

    uint32_t dt = lastNow_ ? (now - lastNow_) : 16u;
    if (dt > 100u) dt = 100u;
    lastNow_ = now;

    // Base field travel is ~8.2 seconds/cycle at Motion=50.
    // Motion control is the only multiplier applied to the phase clock.
    const uint16_t rate = motionQ8(controls_.motion);
    phaseQ16_ += (uint32_t)(((uint64_t)dt * 8u * rate) >> 8);

    lastAudio_ = readAudio();
    cached_ = makeFrame(++frameNo_, phaseQ16_, controls_, lastAudio_);
    cachedNow_ = now;
    return cached_;
  }

  Controls& controls() { return controls_; }
  const Controls& controls() const { return controls_; }
  const AudioFrame& lastAudio() const { return lastAudio_; }

 private:
  Controls controls_{};
  uint32_t frameNo_=0;
  uint32_t phaseQ16_=0;
  uint32_t lastNow_=0;
  uint32_t cachedNow_=0xffffffffu;
  CanonicalFrame cached_{};
  AudioFrame lastAudio_{};

  static uint8_t avg(const uint8_t* fft, uint8_t a, uint8_t z) {
    uint16_t total=0;
    for (uint8_t i=a;i<z;i++) total += fft[i];
    return (uint8_t)(total / (uint8_t)(z-a));
  }

  static AudioFrame readAudio() {
    AudioFrame a{};
    um_data_t* um=nullptr;
    if (!UsermodManager::getUMData(&um, USERMOD_ID_AUDIOREACTIVE) ||
        !um || um->u_size < 4 || !um->u_data || !um->u_data[2]) return a;

    const uint8_t* fft = reinterpret_cast<const uint8_t*>(um->u_data[2]);
    a.bass   = avg(fft,0,4);
    a.mid    = avg(fft,4,11);
    a.treble = avg(fft,11,16);

    if (um->u_data[0]) {
      const float v=*reinterpret_cast<const float*>(um->u_data[0]);
      a.volume=(uint8_t)(v<=0?0:(v>=255?255:(uint8_t)(v+0.5f)));
    }
    if (um->u_data[3]) a.peak=*reinterpret_cast<const uint8_t*>(um->u_data[3])!=0;
    return a;
  }
};

static FoundationRuntime runtime;
static uint8_t foundationEffectId=255;

static uint16_t fieldScale(Scene scene) {
  // Scale changes the character of the same coherent field; it does not switch algorithms.
  switch(scene) {
    case FIELD_MIX:    return 34;
    case SIGNATURE:    return 46;
    case QUIET_COSMOS: return 24;
    default:           return 38;
  }
}

static Rgb8 fieldColor(const CanonicalFrame& f,uint16_t x,uint16_t y,uint16_t width,uint16_t height) {
  const uint16_t scale=fieldScale(f.controls.scene);
  const uint16_t nx=(uint16_t)((uint32_t)x*scale + 0x1357u);
  const uint16_t ny=(uint16_t)((uint32_t)y*scale + 0x2468u);
  const uint16_t z=(uint16_t)f.phaseQ16;

  // Two coherent fields, following the standard noise+palette pattern used by FastLED/WLED.
  // The second field only bends palette position; it does not create a competing renderer.
  const uint8_t n1=perlin8(nx,ny,z);
  const uint8_t n2=perlin8((uint16_t)(nx+0x3141u),(uint16_t)(ny+0x2718u),(uint16_t)(z+0x1111u));
  const uint16_t palettePos=(uint16_t)(((uint16_t)n1<<8) + ((uint16_t)n2<<5) + (uint16_t)(f.phaseQ16>>2));

  Rgb8 c=paletteAt(f,palettePos);
  c=applyAudio(f,c,(uint8_t)(n2>>6));
  (void)width; (void)height;
  return c;
}

static uint32_t packed(const Rgb8& c) {
  return RGBW32(c.r,c.g,c.b,0);
}

static void mode_hbnf_foundation(void) {
  const CanonicalFrame& f=runtime.frame();

  if (SEGMENT.is2D()) {
    const uint16_t w=SEGMENT.virtualWidth();
    const uint16_t h=SEGMENT.virtualHeight();
    if (!w || !h) return;
    for(uint16_t y=0;y<h;y++) for(uint16_t x=0;x<w;x++)
      SEGMENT.setPixelColorXY(x,y,packed(fieldColor(f,x,y,w,h)));
    return;
  }

  const uint16_t len=SEGLEN;
  for(uint16_t i=0;i<len;i++){
    uint16_t x=0,y=0;
    if(len==22) perimeterCoord22((uint8_t)i,x,y);\n    else { x=(uint16_t)(((uint32_t)i*31u)/(len>1?len-1:1)); y=15; }
    SEGMENT.setPixelColor(i,packed(fieldColor(f,x,y,32,16)));
  }
}

static Scene sceneFrom(JsonVariantConst v,Scene fallback) {
  if (v.is<const char*>()) {
    const char* s=v.as<const char*>();
    if (!strcmp(s,"course-flow")) return COURSE_FLOW;
    if (!strcmp(s,"field-mix")) return FIELD_MIX;
    if (!strcmp(s,"hbnf-signature")) return SIGNATURE;
    if (!strcmp(s,"quiet-cosmos")) return QUIET_COSMOS;
    return fallback;
  }
  if (v.is<int>()) {
    int n=v.as<int>(); if(n<0)n=0; if(n>3)n=3;
    return (Scene)n;
  }
  return fallback;
}

class HbnfFoundationV1Usermod : public Usermod {
  bool routeRegistered_=false;
 public:
  void setup() override {
    foundationEffectId=strip.addEffect(255,&mode_hbnf_foundation,HBNF_FX_DATA);
  }

  void connected() override {
    if(routeRegistered_) return;
    server.on("/hbnf",HTTP_GET,[](AsyncWebServerRequest* request){
      request->send_P(200,FPSTR(CONTENT_TYPE_HTML),HBNF_LOCAL_UI);
    });
    routeRegistered_=true;
  }

  void loop() override {}

  void addToJsonState(JsonObject& root) override {
    JsonObject h=root["HBNF"];
    if(h.isNull()) h=root.createNestedObject("HBNF");
    const Controls& c=runtime.controls();
    const AudioFrame& a=runtime.lastAudio();
    h["schema"]="foundation-v1";
    h["effectId"]=foundationEffectId;
    h["scene"]=(uint8_t)c.scene;
    h["motion"]=c.motion;
    h["audioResponse"]=c.audioResponse;
    JsonObject audio=h["audio"];
    if(audio.isNull()) audio=h.createNestedObject("audio");
    audio["bass"]=a.bass;
    audio["mid"]=a.mid;
    audio["treble"]=a.treble;
    audio["volume"]=a.volume;
    audio["peak"]=a.peak;
  }

  void readFromJsonState(JsonObject& root) override {
    JsonObject h=root["HBNF"];
    if(h.isNull()) return;
    Controls& c=runtime.controls();
    if(!h["scene"].isNull()) c.scene=sceneFrom(h["scene"],c.scene);
    if(!h["motion"].isNull()) c.motion=(uint8_t)constrain(h["motion"].as<int>(),0,100);
    if(!h["audioResponse"].isNull()) c.audioResponse=(uint8_t)constrain(h["audioResponse"].as<int>(),0,100);
  }

  uint16_t getId() override { return USERMOD_ID_USER_FX; }
};

static HbnfFoundationV1Usermod hbnfFoundationV1;
REGISTER_USERMOD(hbnfFoundationV1);

} // namespace
