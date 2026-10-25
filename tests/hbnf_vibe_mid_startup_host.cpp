#define HBNF_VIBE_CORE_TYPES_DEFINED 1
#include <cassert>
#include <stdint.h>

namespace hbnf_v1 {
enum Vibe : uint8_t { VIBE_CHILL=0,VIBE_GROOVE=1,VIBE_HEAVY=2,VIBE_PSYCHEDELIC=3,VIBE_COSMIC=4,VIBE_AUTO=5 };
struct Rgb8 { uint8_t r=0,g=0,b=0; Rgb8()=default; Rgb8(uint8_t a,uint8_t c,uint8_t d):r(a),g(c),b(d){} };
struct AudioFrame { uint8_t bassPulse=0,midPulse=0,treblePulse=0,highDetail=0,spectralChange=0,slowEnergy=0,highEnergy=0,transient=0; };
struct VibeAxes { uint8_t structure=0,flow=0,depth=0,symmetry=0,detail=0,paletteMotion=0,density=0,negativeSpace=0,transitionEnergy=0; };
struct CanonicalFrame { Vibe vibe=VIBE_CHILL; VibeAxes vibeAxes{}; AudioFrame audio{}; uint32_t phaseQ16=0; };
static inline Rgb8 blend(Rgb8 a,Rgb8 b,uint8_t m){return Rgb8((uint16_t(a.r)*(255-m)+uint16_t(b.r)*m+127)/255,(uint16_t(a.g)*(255-m)+uint16_t(b.g)*m+127)/255,(uint16_t(a.b)*(255-m)+uint16_t(b.b)*m+127)/255);}
static inline Rgb8 scaleRgb(Rgb8 a,uint8_t m){return Rgb8((uint16_t(a.r)*m+127)/255,(uint16_t(a.g)*m+127)/255,(uint16_t(a.b)*m+127)/255);}
}
#include "../firmware/phase2/integration-r6/usermod/hbnf_vibe_runtime.h"

int main() {
  using namespace hbnf_v1;
  VibeAudioFeatures features;
  VibeAudioInput in{};
  in.silent=false;
  in.volume=0.6f;
  in.midAtt=1.25f;
  in.midEnergy=0.78f;

  AudioFeatures out=features.update(in,20);
  assert(out.midBody>100);
  assert(out.midChange==0);
  for(int i=0;i<100;i++) {
    out=features.update(in,20);
    assert(out.midChange==0);
  }

  in.midAtt=0.64f;
  in.midEnergy=0.05f;
  out=features.update(in,20);
  assert(out.midChange>0);
}
